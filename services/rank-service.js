// 排行服务：云端按点赞聚合今日 / 本周 / 本月榜，本地拼装金句内容
const { callFunction } = require('../utils/cloud');
const quoteService = require('./quote-service');
const { getRarity } = require('../utils/rarity');
const { RANK_TTL_MS } = require('../utils/env');
const { formatNumber, truncateText } = require('../utils/util');

const VALID_PERIODS = new Set(['today', 'week', 'month']);
const rankCache = new Map();

async function getRankList(period = 'today', limit = 50, { force = false } = {}) {
  const p = VALID_PERIODS.has(period) ? period : 'today';
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const cacheKey = `${p}:${safeLimit}`;
  const cached = rankCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.savedAt < RANK_TTL_MS) {
    return cached.list.map((item) => ({ ...item }));
  }

  const res = await callFunction('reaction', {
    action: 'rank',
    period: p,
    limit: safeLimit,
  });

  if (!res || !res.success) {
    throw new Error((res && res.message) || '排行加载失败');
  }

  const rows = Array.isArray(res.list) ? res.list : [];
  const quotes = await quoteService.loadQuotes();
  const quoteMap = new Map(quotes.map((quote) => [Number(quote.id), quote]));
  const list = rows
    .map((row) => {
      const quote = quoteMap.get(Number(row.targetId));
      if (!quote) return null;
      const count = Number(row.count) || 0;
      const rarity = getRarity(quote.id);
      return {
        ...quote,
        sourceKey: quote.sourceKey || '',
        rarityKey: rarity.key,
        rarityLabel: rarity.label,
        count,
        lastLikeAt: row.lastLikeAt || 0,
        summary: truncateText(quote.content, 28),
        countText: formatNumber(count),
      };
    })
    .filter(Boolean);
  rankCache.set(cacheKey, { savedAt: Date.now(), list });
  return list.map((item) => ({ ...item }));
}

function invalidateRankCache(period) {
  if (!period) {
    rankCache.clear();
    return;
  }
  const prefix = `${period}:`;
  Array.from(rankCache.keys()).forEach((key) => {
    if (key.startsWith(prefix)) rankCache.delete(key);
  });
}

module.exports = {
  getRankList,
  invalidateRankCache,
};
