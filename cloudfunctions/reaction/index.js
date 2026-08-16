// 云函数：收藏 / 点赞 / 排行 统一服务
// 所有读写均经由云函数（管理员权限），客户端不直接访问数据库。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const COLLECTION = 'user_reactions';
const LIKE_COUNTS = 'like_counts';
const RANK_DAILY = 'rank_daily';
const RANK_SNAPSHOTS = 'rank_snapshots';
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

function buildId(openid, targetId, type) {
  return `${openid}__${type}__${targetId}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requireSingleTarget(targetId) {
  const tid = toNumber(targetId);
  if (tid == null) {
    return {
      error: { success: false, code: 'INVALID_TARGET', message: '目标内容ID不合法' },
    };
  }
  return { tid };
}

function normalizeTargetIds(targetIds) {
  if (!Array.isArray(targetIds)) return [];
  return Array.from(
    new Set(targetIds.map(toNumber).filter((n) => n != null))
  );
}

// 按东八区计算今日 / 本周（周一）/ 本月起点，返回 Date（UTC 绝对时间）
function getPeriodStart(period) {
  const local = new Date(Date.now() + CN_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const day = local.getUTCDay(); // 0=周日

  if (period === 'week') {
    const mondayOffset = day === 0 ? 6 : day - 1;
    return new Date(Date.UTC(y, m, d - mondayOffset) - CN_OFFSET_MS);
  }
  if (period === 'month') {
    return new Date(Date.UTC(y, m, 1) - CN_OFFSET_MS);
  }
  // today（默认）
  return new Date(Date.UTC(y, m, d) - CN_OFFSET_MS);
}

function toMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function toCnDayKey(dateLike) {
  const ms = toMs(dateLike) || Date.now();
  const local = new Date(ms + CN_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function buildRankDailyId(day, targetId) {
  return `${day}__${targetId}`;
}

async function safeDocGet(ref) {
  try {
    const res = await ref.get();
    return res && res.data ? res.data : null;
  } catch (err) {
    return null;
  }
}

async function safeDocRemove(ref) {
  try {
    await ref.remove();
    return true;
  } catch (err) {
    return false;
  }
}

// 聚合失败时的兜底：分页拉取后内存统计
async function rankByScan(collection, start, limit) {
  const MAX_SCAN = 5000;
  const PAGE = 100;
  const counts = new Map(); // targetId -> { count, lastLikeAt }

  let skip = 0;
  while (skip < MAX_SCAN) {
    const res = await collection
      .where({
        type: 'like',
        createTime: _.gte(start),
      })
      .field({ targetId: true, createTime: true })
      .skip(skip)
      .limit(PAGE)
      .get();

    const rows = res.data || [];
    rows.forEach((row) => {
      const tid = toNumber(row.targetId);
      if (tid == null) return;
      const t = toMs(row.createTime);
      const prev = counts.get(tid) || { count: 0, lastLikeAt: 0 };
      prev.count += 1;
      if (t > prev.lastLikeAt) prev.lastLikeAt = t;
      counts.set(tid, prev);
    });

    if (rows.length < PAGE) break;
    skip += PAGE;
  }

  return Array.from(counts.entries())
    .map(([targetId, info]) => ({
      targetId,
      count: info.count,
      lastLikeAt: info.lastLikeAt,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastLikeAt - a.lastLikeAt;
    })
    .slice(0, limit);
}

async function rankByAggregate(collection, start, limit) {
  const res = await collection
    .aggregate()
    .match({
      type: 'like',
      createTime: _.gte(start),
    })
    .group({
      _id: '$targetId',
      count: $.sum(1),
      lastLikeAt: $.max('$createTime'),
    })
    .sort({
      count: -1,
      lastLikeAt: -1,
    })
    .limit(limit)
    .end();

  return (res.list || []).map((row) => ({
    targetId: toNumber(row._id),
    count: row.count || 0,
    lastLikeAt: toMs(row.lastLikeAt),
  })).filter((row) => row.targetId != null);
}

async function applyLikeInc(transaction, tid, likeAtMs) {
  const nowMs = likeAtMs || Date.now();
  const day = toCnDayKey(nowMs);
  const likeRef = transaction.collection(LIKE_COUNTS).doc(String(tid));
  const rankRef = transaction.collection(RANK_DAILY).doc(buildRankDailyId(day, tid));

  const likeDoc = await safeDocGet(likeRef);
  if (likeDoc) {
    await likeRef.update({
      data: {
        total: Math.max(0, Number(likeDoc.total) || 0) + 1,
        lastLikeAt: nowMs,
        updatedAt: db.serverDate(),
      },
    });
  } else {
    await likeRef.set({
      data: {
        targetId: tid,
        total: 1,
        lastLikeAt: nowMs,
        updatedAt: db.serverDate(),
      },
    });
  }

  const rankDoc = await safeDocGet(rankRef);
  if (rankDoc) {
    await rankRef.update({
      data: {
        count: Math.max(0, Number(rankDoc.count) || 0) + 1,
        lastLikeAt: Math.max(toMs(rankDoc.lastLikeAt), nowMs),
      },
    });
  } else {
    await rankRef.set({
      data: {
        day,
        targetId: tid,
        count: 1,
        lastLikeAt: nowMs,
      },
    });
  }
}

async function applyLikeDec(transaction, tid, originalCreateTime) {
  const nowMs = Date.now();
  const day = toCnDayKey(originalCreateTime || nowMs);
  const likeRef = transaction.collection(LIKE_COUNTS).doc(String(tid));
  const rankRef = transaction.collection(RANK_DAILY).doc(buildRankDailyId(day, tid));

  const likeDoc = await safeDocGet(likeRef);
  if (likeDoc) {
    const nextTotal = Math.max(0, (Number(likeDoc.total) || 0) - 1);
    await likeRef.update({
      data: {
        total: nextTotal,
        updatedAt: db.serverDate(),
      },
    });
  }

  const rankDoc = await safeDocGet(rankRef);
  if (rankDoc) {
    const nextCount = Math.max(0, (Number(rankDoc.count) || 0) - 1);
    await rankRef.update({
      data: {
        count: nextCount,
      },
    });
  }
}

async function likeAdd(openid, tid) {
  const _id = buildId(openid, tid, 'like');
  await db.runTransaction(async (transaction) => {
    const reactionRef = transaction.collection(COLLECTION).doc(_id);
    const existing = await safeDocGet(reactionRef);
    if (existing) {
      return { status: true };
    }
    const nowMs = Date.now();
    await reactionRef.set({
      data: {
        openid,
        targetId: tid,
        type: 'like',
        createTime: db.serverDate(),
      },
    });
    await applyLikeInc(transaction, tid, nowMs);
    return { status: true };
  });
  return { success: true, status: true, type: 'like', targetId: tid };
}

async function likeRemove(openid, tid) {
  const _id = buildId(openid, tid, 'like');
  const result = await db.runTransaction(async (transaction) => {
    const reactionRef = transaction.collection(COLLECTION).doc(_id);
    const existing = await safeDocGet(reactionRef);
    if (!existing) {
      return { status: false, existed: false };
    }
    const createTime = existing.createTime;
    await reactionRef.remove();
    await applyLikeDec(transaction, tid, createTime);
    return { status: false, existed: true };
  });
  return { success: true, status: false, type: 'like', targetId: tid };
}

async function likeToggle(openid, tid) {
  const _id = buildId(openid, tid, 'like');
  const result = await db.runTransaction(async (transaction) => {
    const reactionRef = transaction.collection(COLLECTION).doc(_id);
    const existing = await safeDocGet(reactionRef);
    if (existing) {
      const createTime = existing.createTime;
      await reactionRef.remove();
      await applyLikeDec(transaction, tid, createTime);
      return { status: false, existed: true };
    }
    const nowMs = Date.now();
    await reactionRef.set({
      data: {
        openid,
        targetId: tid,
        type: 'like',
        createTime: db.serverDate(),
      },
    });
    await applyLikeInc(transaction, tid, nowMs);
    return { status: true, existed: false };
  });
  return {
    success: true,
    status: result.status,
    type: 'like',
    targetId: tid,
    existed: result.existed,
  };
}

async function favoriteAdd(openid, tid) {
  const _id = buildId(openid, tid, 'favorite');
  await db.collection(COLLECTION).doc(_id).set({
    data: { openid, targetId: tid, type: 'favorite', createTime: db.serverDate() },
  });
  return { success: true, status: true, type: 'favorite', targetId: tid };
}

async function favoriteRemove(openid, tid) {
  const _id = buildId(openid, tid, 'favorite');
  await safeDocRemove(db.collection(COLLECTION).doc(_id));
  return { success: true, status: false, type: 'favorite', targetId: tid };
}

async function favoriteToggle(openid, tid) {
  const _id = buildId(openid, tid, 'favorite');
  const found = await db.collection(COLLECTION).where({ _id }).get();
  if (found.data && found.data.length > 0) {
    await safeDocRemove(db.collection(COLLECTION).doc(_id));
    return { success: true, status: false, type: 'favorite', targetId: tid, existed: true };
  }
  await db.collection(COLLECTION).doc(_id).set({
    data: { openid, targetId: tid, type: 'favorite', createTime: db.serverDate() },
  });
  return { success: true, status: true, type: 'favorite', targetId: tid, existed: false };
}

async function readLikeCountsMap(ids) {
  const map = {};
  ids.forEach((id) => {
    map[id] = 0;
  });
  if (ids.length === 0) return map;

  try {
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await db.collection(LIKE_COUNTS).doc(String(id)).get();
          map[id] = (res.data && Number(res.data.total)) || 0;
        } catch (err) {
          map[id] = 0;
        }
      })
    );
    return map;
  } catch (err) {
    console.warn('likeCounts table read failed, fallback to aggregate', err);
  }

  const collection = db.collection(COLLECTION);
  try {
    const res = await collection
      .aggregate()
      .match({ type: 'like', targetId: _.in(ids) })
      .group({
        _id: '$targetId',
        count: $.sum(1),
      })
      .end();
    (res.list || []).forEach((row) => {
      const tid = toNumber(row._id);
      if (tid != null) map[tid] = row.count || 0;
    });
  } catch (aggErr) {
    console.warn('likeCounts aggregate failed, fallback to count', aggErr);
    await Promise.all(
      ids.map(async (id) => {
        const r = await collection.where({ type: 'like', targetId: id }).count();
        map[id] = r.total || 0;
      })
    );
  }
  return map;
}

async function readRankList(period, limit) {
  try {
    const snap = await db.collection(RANK_SNAPSHOTS).doc(period).get();
    if (snap && snap.data && Array.isArray(snap.data.list)) {
      return snap.data.list.slice(0, limit).map((row) => ({
        targetId: toNumber(row.targetId),
        count: Number(row.count) || 0,
        lastLikeAt: toMs(row.lastLikeAt),
      })).filter((row) => row.targetId != null);
    }
  } catch (err) {
    console.warn('rank snapshot missing, fallback to live aggregate', err);
  }

  const collection = db.collection(COLLECTION);
  const start = getPeriodStart(period);
  try {
    return await rankByAggregate(collection, start, limit);
  } catch (aggErr) {
    console.warn('rank aggregate failed, fallback to scan', aggErr);
    return rankByScan(collection, start, limit);
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份，请重试' };
  }

  const { action, type, targetId, targetIds } = event;
  const collection = db.collection(COLLECTION);

  try {
    // 排行：优先读快照，缺失时降级现有实时聚合
    if (action === 'rank') {
      const period = event.period === 'week' || event.period === 'month' ? event.period : 'today';
      const limit = Math.min(Math.max(toNumber(event.limit) || 50, 1), 100);
      const list = await readRankList(period, limit);
      return { success: true, period, list };
    }

    // 批量查询金句的全网点赞数：优先 like_counts
    if (action === 'likeCounts') {
      const ids = normalizeTargetIds(
        Array.isArray(targetIds) && targetIds.length > 0
          ? targetIds
          : targetId != null
            ? [targetId]
            : []
      );
      const map = await readLikeCountsMap(ids);
      return { success: true, map };
    }

    if (type !== 'favorite' && type !== 'like') {
      return { success: false, code: 'INVALID_TYPE', message: '操作类型不合法' };
    }

    // 新增（幂等：已存在则不重复计数）
    if (action === 'add') {
      const { tid, error } = requireSingleTarget(targetId);
      if (error) return error;
      if (type === 'like') return likeAdd(OPENID, tid);
      return favoriteAdd(OPENID, tid);
    }

    // 删除（不存在时幂等成功）
    if (action === 'remove') {
      const { tid, error } = requireSingleTarget(targetId);
      if (error) return error;
      if (type === 'like') return likeRemove(OPENID, tid);
      return favoriteRemove(OPENID, tid);
    }

    // 切换
    if (action === 'toggle') {
      const { tid, error } = requireSingleTarget(targetId);
      if (error) return error;
      if (type === 'like') return likeToggle(OPENID, tid);
      return favoriteToggle(OPENID, tid);
    }

    // 状态查询
    if (action === 'status') {
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const ids = normalizeTargetIds(targetIds);
        if (ids.length === 0) {
          return { success: true, map: {} };
        }
        const map = {};
        ids.forEach((id) => (map[id] = false));
        for (let offset = 0; offset < ids.length; offset += 100) {
          const chunk = ids.slice(offset, offset + 100);
          // eslint-disable-next-line no-await-in-loop
          const res = await collection
            .where({ openid: OPENID, type, targetId: _.in(chunk) })
            .field({ targetId: true })
            .limit(100)
            .get();
          (res.data || []).forEach((d) => {
            map[d.targetId] = true;
          });
        }
        return { success: true, map };
      }

      const tid = toNumber(targetId);
      if (tid == null) {
        return { success: true, status: false };
      }
      const _id = buildId(OPENID, tid, type);
      const res = await collection.where({ _id }).get();
      return { success: true, status: !!(res.data && res.data.length > 0) };
    }

    // 列表查询
    if (action === 'list') {
      const limit = Math.min(Math.max(toNumber(event.limit) || 200, 1), 500);
      const rows = [];
      const pageSize = 100;
      let skip = 0;
      while (rows.length < limit) {
        const size = Math.min(pageSize, limit - rows.length);
        // eslint-disable-next-line no-await-in-loop
        const res = await collection
          .where({ openid: OPENID, type })
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(size)
          .get();
        const page = res.data || [];
        rows.push(...page);
        if (page.length < size) break;
        skip += page.length;
      }
      const list = rows.map((d) => ({
        targetId: d.targetId,
        createTime: d.createTime ? new Date(d.createTime).getTime() : 0,
      }));
      return { success: true, list };
    }

    // 计数查询
    if (action === 'count') {
      const res = await collection.where({ openid: OPENID, type }).count();
      return { success: true, total: res.total || 0 };
    }

    return { success: false, code: 'INVALID_ACTION', message: '操作指令不合法' };
  } catch (err) {
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '服务异常，请稍后重试',
      detail: String(err),
    };
  }
};
