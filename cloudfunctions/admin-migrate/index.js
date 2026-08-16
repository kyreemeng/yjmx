// 管理端幂等迁移：语料播种 / 赞数回填 / 日桶回填 / 快照重建 / 校验
// 受环境变量 ADMIN_MIGRATE_TOKEN 保护；云函数部署与小程序包隔离，种子内置于 quotes.seed.json
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const PAGE = 100;
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

const COLLECTIONS = {
  quotes: 'quotes',
  reactions: 'user_reactions',
  likeCounts: 'like_counts',
  rankDaily: 'rank_daily',
  rankSnapshots: 'rank_snapshots',
};

function fail(code, message, detail) {
  const out = { success: false, code, message };
  if (detail != null) out.detail = detail;
  return out;
}

function assertToken(event) {
  const expected = process.env.ADMIN_MIGRATE_TOKEN;
  if (!expected) {
    return fail('TOKEN_NOT_CONFIGURED', '未配置 ADMIN_MIGRATE_TOKEN 环境变量');
  }
  const got = event && (event.token || event.adminToken);
  if (!got || String(got) !== String(expected)) {
    return fail('UNAUTHORIZED', '管理员口令不正确');
  }
  return null;
}

function toMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toCnDayKey(dateLike) {
  const ms = toMs(dateLike) || Date.now();
  const local = new Date(ms + CN_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function loadSeed() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require('./quotes.seed.json');
}

async function seedQuotes() {
  const seed = loadSeed();
  if (!Array.isArray(seed) || seed.length === 0) {
    return fail('SEED_EMPTY', 'quotes.seed.json 为空');
  }

  let upserted = 0;
  for (let i = 0; i < seed.length; i += 1) {
    const row = seed[i];
    const id = toNumber(row.id);
    if (id == null) continue;
    const docId = String(id);
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COLLECTIONS.quotes).doc(docId).set({
      data: {
        id,
        content: row.content,
        volume: row.volume,
        sourceKey: row.sourceKey || null,
        sourceTitle: row.sourceTitle || row.source || '',
        source: row.source || row.sourceTitle || '',
        sourceUrl: row.sourceUrl == null ? null : row.sourceUrl,
        sourcePublisher: row.sourcePublisher == null ? null : row.sourcePublisher,
        sourceEdition: row.sourceEdition == null ? null : row.sourceEdition,
        verificationUrl: row.verificationUrl == null ? null : row.verificationUrl,
        verificationPublisher: row.verificationPublisher == null ? null : row.verificationPublisher,
        verificationStatus: row.verificationStatus || 'curated',
        verifiedAt: row.verifiedAt == null ? null : row.verifiedAt,
        quoteType: row.quoteType || 'short_excerpt',
        charCount: row.charCount || String(row.content || '').length,
        normalization: row.normalization || null,
        author: row.author == null ? '' : row.author,
        status: row.status || 'active',
        sort: row.sort != null ? row.sort : id,
        contentHash: row.contentHash || null,
        updatedAt: db.serverDate(),
      },
    });
    upserted += 1;
  }

  const countRes = await db.collection(COLLECTIONS.quotes).count();
  return {
    success: true,
    action: 'seedQuotes',
    upserted,
    seedSize: seed.length,
    collectionTotal: countRes.total || 0,
  };
}

async function scanLikes(handler) {
  let skip = 0;
  let scanned = 0;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const res = await db
      .collection(COLLECTIONS.reactions)
      .where({ type: 'like' })
      .skip(skip)
      .limit(PAGE)
      .get();
    const rows = res.data || [];
    for (let i = 0; i < rows.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await handler(rows[i]);
      scanned += 1;
    }
    if (rows.length < PAGE) break;
    skip += PAGE;
    if (skip > 100000) break;
  }
  return scanned;
}

async function clearCollection(name) {
  let removed = 0;
  while (true) {
    const res = await db.collection(name).limit(PAGE).get();
    const rows = res.data || [];
    if (rows.length === 0) break;
    for (let i = 0; i < rows.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await db.collection(name).doc(rows[i]._id).remove();
      removed += 1;
    }
  }
  return removed;
}

async function backfillLikeCounts() {
  const agg = new Map(); // tid -> { total, lastLikeAt }
  const scanned = await scanLikes(async (row) => {
    const tid = toNumber(row.targetId);
    if (tid == null) return;
    const prev = agg.get(tid) || { total: 0, lastLikeAt: 0 };
    prev.total += 1;
    const t = toMs(row.createTime);
    if (t > prev.lastLikeAt) prev.lastLikeAt = t;
    agg.set(tid, prev);
  });

  const cleared = await clearCollection(COLLECTIONS.likeCounts);
  let upserted = 0;
  const entries = Array.from(agg.entries());
  for (let i = 0; i < entries.length; i += 1) {
    const [tid, info] = entries[i];
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COLLECTIONS.likeCounts).doc(String(tid)).set({
      data: {
        targetId: tid,
        total: info.total,
        lastLikeAt: info.lastLikeAt,
        updatedAt: db.serverDate(),
      },
    });
    upserted += 1;
  }

  return {
    success: true,
    action: 'backfillLikeCounts',
    scanned,
    cleared,
    upserted,
  };
}

async function backfillRankDaily() {
  const agg = new Map(); // day__tid -> { day, targetId, count, lastLikeAt }
  const scanned = await scanLikes(async (row) => {
    const tid = toNumber(row.targetId);
    if (tid == null) return;
    const day = toCnDayKey(row.createTime);
    const key = `${day}__${tid}`;
    const prev = agg.get(key) || { day, targetId: tid, count: 0, lastLikeAt: 0 };
    prev.count += 1;
    const t = toMs(row.createTime);
    if (t > prev.lastLikeAt) prev.lastLikeAt = t;
    agg.set(key, prev);
  });

  const cleared = await clearCollection(COLLECTIONS.rankDaily);
  let upserted = 0;
  const entries = Array.from(agg.entries());
  for (let i = 0; i < entries.length; i += 1) {
    const [docId, info] = entries[i];
    // eslint-disable-next-line no-await-in-loop
    await db.collection(COLLECTIONS.rankDaily).doc(docId).set({
      data: {
        day: info.day,
        targetId: info.targetId,
        count: info.count,
        lastLikeAt: info.lastLikeAt,
      },
    });
    upserted += 1;
  }

  return {
    success: true,
    action: 'backfillRankDaily',
    scanned,
    cleared,
    upserted,
  };
}

async function rebuild() {
  // 内联调用同仓库 rank-rebuild 逻辑：云端部署隔离，不能 require 兄弟目录；
  // 通过 callFunction 触发已部署的 rank-rebuild。
  try {
    const res = await cloud.callFunction({
      name: 'rank-rebuild',
      data: {},
    });
    return {
      success: true,
      action: 'rebuild',
      result: res && res.result ? res.result : res,
    };
  } catch (err) {
    return fail('REBUILD_FAILED', err.message || '调用 rank-rebuild 失败', String(err));
  }
}

async function countCollection(name, where) {
  const col = db.collection(name);
  const res = where ? await col.where(where).count() : await col.count();
  return res.total || 0;
}

async function sumLikeCounts() {
  let skip = 0;
  let sum = 0;
  let docs = 0;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const res = await db.collection(COLLECTIONS.likeCounts).skip(skip).limit(PAGE).get();
    const rows = res.data || [];
    rows.forEach((row) => {
      sum += Number(row.total) || 0;
      docs += 1;
    });
    if (rows.length < PAGE) break;
    skip += PAGE;
    if (skip > 100000) break;
  }
  return { sum, docs };
}

async function sampleVerify(sampleSize = 20) {
  const ids = [];
  for (let i = 0; i < sampleSize; i += 1) {
    ids.push(1 + Math.floor(Math.random() * 114));
  }
  const unique = Array.from(new Set(ids));
  const mismatches = [];

  for (let i = 0; i < unique.length; i += 1) {
    const tid = unique[i];
    // eslint-disable-next-line no-await-in-loop
    const detail = await db
      .collection(COLLECTIONS.reactions)
      .where({ type: 'like', targetId: tid })
      .count();
    let tableTotal = 0;
    try {
      // eslint-disable-next-line no-await-in-loop
      const doc = await db.collection(COLLECTIONS.likeCounts).doc(String(tid)).get();
      tableTotal = (doc.data && Number(doc.data.total)) || 0;
    } catch (err) {
      tableTotal = 0;
    }
    if ((detail.total || 0) !== tableTotal) {
      mismatches.push({ targetId: tid, detail: detail.total || 0, likeCounts: tableTotal });
    }
  }
  return { sampled: unique.length, mismatches };
}

async function verify() {
  const seed = loadSeed();
  const quotesTotal = await countCollection(COLLECTIONS.quotes);
  const quotesActive = await countCollection(COLLECTIONS.quotes, { status: 'active' });
  const likeDetailTotal = await countCollection(COLLECTIONS.reactions, { type: 'like' });
  const likeSum = await sumLikeCounts();
  const sample = await sampleVerify(20);

  const snapshots = {};
  const periods = ['today', 'week', 'month'];
  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const snap = await db.collection(COLLECTIONS.rankSnapshots).doc(period).get();
      snapshots[period] = {
        exists: true,
        size: Array.isArray(snap.data && snap.data.list) ? snap.data.list.length : 0,
        generatedAt: snap.data && snap.data.generatedAt,
        version: snap.data && snap.data.version,
      };
    } catch (err) {
      snapshots[period] = { exists: false };
    }
  }

  const ok =
    quotesActive === seed.length &&
    likeSum.sum === likeDetailTotal &&
    sample.mismatches.length === 0 &&
    periods.every((p) => snapshots[p] && snapshots[p].exists);

  return {
    success: ok,
    action: 'verify',
    quotes: {
      seedSize: seed.length,
      total: quotesTotal,
      active: quotesActive,
    },
    likes: {
      detailTotal: likeDetailTotal,
      likeCountsSum: likeSum.sum,
      likeCountsDocs: likeSum.docs,
    },
    sample,
    snapshots,
    code: ok ? undefined : 'VERIFY_FAILED',
    message: ok ? '校验通过' : '校验未通过，请检查 mismatches / snapshots',
  };
}

exports.main = async (event = {}) => {
  const authErr = assertToken(event);
  if (authErr) return authErr;

  const action = event.action;
  try {
    if (action === 'seedQuotes') return await seedQuotes();
    if (action === 'backfillLikeCounts') return await backfillLikeCounts();
    if (action === 'backfillRankDaily') return await backfillRankDaily();
    if (action === 'rebuild') return await rebuild();
    if (action === 'verify') return await verify();
    return fail('INVALID_ACTION', '支持 seedQuotes/backfillLikeCounts/backfillRankDaily/rebuild/verify');
  } catch (err) {
    return fail('SERVER_ERROR', err.message || '迁移执行失败', String(err));
  }
};
