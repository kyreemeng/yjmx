// 定时任务：从 rank_daily 重建 today/week/month 快照
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const RANK_DAILY = 'rank_daily';
const RANK_SNAPSHOTS = 'rank_snapshots';
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;
const PAGE = 100;
const TOP_N = 100;

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

function getLocalParts(ms) {
  const local = new Date(ms + CN_OFFSET_MS);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    day: local.getUTCDay(),
  };
}

function dayKeyFromParts(y, m, d) {
  return `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

function listDayKeys(period, nowMs = Date.now()) {
  const parts = getLocalParts(nowMs);
  const todayKey = dayKeyFromParts(parts.y, parts.m, parts.d);

  if (period === 'today') {
    return [todayKey];
  }

  if (period === 'week') {
    const mondayOffset = parts.day === 0 ? 6 : parts.day - 1;
    const keys = [];
    for (let i = 0; i <= mondayOffset; i += 1) {
      const dt = new Date(Date.UTC(parts.y, parts.m, parts.d - mondayOffset + i));
      keys.push(dayKeyFromParts(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
    }
    return keys;
  }

  // month
  const keys = [];
  for (let d = 1; d <= parts.d; d += 1) {
    keys.push(dayKeyFromParts(parts.y, parts.m, d));
  }
  return keys;
}

async function scanDays(dayKeys) {
  const counts = new Map(); // targetId -> { count, lastLikeAt }
  for (let i = 0; i < dayKeys.length; i += 1) {
    const day = dayKeys[i];
    let skip = 0;
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const res = await db
        .collection(RANK_DAILY)
        .where({ day })
        .skip(skip)
        .limit(PAGE)
        .get();
      const rows = res.data || [];
      rows.forEach((row) => {
        const tid = toNumber(row.targetId);
        if (tid == null) return;
        const add = Number(row.count) || 0;
        if (add <= 0) return;
        const prev = counts.get(tid) || { count: 0, lastLikeAt: 0 };
        prev.count += add;
        const t = toMs(row.lastLikeAt);
        if (t > prev.lastLikeAt) prev.lastLikeAt = t;
        counts.set(tid, prev);
      });
      if (rows.length < PAGE) break;
      skip += PAGE;
      if (skip > 20000) break;
    }
  }
  return counts;
}

function toSortedList(counts, limit = TOP_N) {
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

async function writeSnapshot(period, list, version) {
  await db.collection(RANK_SNAPSHOTS).doc(period).set({
    data: {
      period,
      list,
      generatedAt: db.serverDate(),
      version,
      dayKey: toCnDayKey(Date.now()),
    },
  });
}

async function rebuildAll() {
  const version = Date.now();
  const periods = ['today', 'week', 'month'];
  const result = {};
  for (let i = 0; i < periods.length; i += 1) {
    const period = periods[i];
    const days = listDayKeys(period);
    // eslint-disable-next-line no-await-in-loop
    const counts = await scanDays(days);
    const list = toSortedList(counts, TOP_N);
    // eslint-disable-next-line no-await-in-loop
    await writeSnapshot(period, list, version);
    result[period] = { days: days.length, size: list.length };
  }
  return { success: true, version, result };
}

exports.main = async () => {
  try {
    return await rebuildAll();
  } catch (err) {
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '排行快照重建失败',
      detail: String(err),
    };
  }
};

exports.__rebuildAll = rebuildAll;
exports.__listDayKeys = listDayKeys;
