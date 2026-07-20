const { getAllQuotes, getQuoteById } = require('../utils/quote-data');
const storage = require('../utils/storage');
const { getToday, getWeekKey, getMonthKey, randomInt } = require('../utils/util');

function seedTotal(id) {
  return ((id * 37 + 13) % 500) + 50;
}

function seedToday(id) {
  return ((id * 17 + 7) % 80) + 5;
}

function seedWeek(id) {
  return ((id * 23 + 11) % 300) + 20;
}

function seedMonth(id) {
  return ((id * 31 + 19) % 800) + 50;
}

function normalizeStat(stat) {
  const week = Math.max(stat.week, stat.today);
  const month = Math.max(stat.month, week);
  const total = Math.max(stat.total, month);
  const changed = week !== stat.week || month !== stat.month || total !== stat.total;
  stat.week = week;
  stat.month = month;
  stat.total = total;
  return changed;
}

function ensureStats() {
  const today = getToday();
  const weekKey = getWeekKey();
  const monthKey = getMonthKey();

  let stats = storage.getQuoteStats();
  let dirty = false;
  const allQuotes = getAllQuotes();

  allQuotes.forEach((quote) => {
    if (!stats[quote.id]) {
      const stat = {
        today: seedToday(quote.id),
        week: seedWeek(quote.id),
        month: seedMonth(quote.id),
        total: seedTotal(quote.id),
        lastDate: today,
        lastWeek: weekKey,
        lastMonth: monthKey,
        lastLikeAt: 0,
      };
      normalizeStat(stat);
      stats[quote.id] = stat;
      dirty = true;
      return;
    }

    const s = stats[quote.id];
    if (s.lastDate !== today) {
      s.today = seedToday(quote.id);
      s.lastDate = today;
      dirty = true;
    }
    if (s.lastWeek !== weekKey) {
      s.week = seedWeek(quote.id);
      s.lastWeek = weekKey;
      dirty = true;
    }
    if (s.lastMonth !== monthKey) {
      s.month = seedMonth(quote.id);
      s.lastMonth = monthKey;
      dirty = true;
    }
    if (normalizeStat(s)) dirty = true;
  });

  if (dirty) {
    storage.setQuoteStats(stats);
  }

  return stats;
}

function getStats() {
  return ensureStats();
}

function getQuoteByIdWithStats(id) {
  const stats = getStats();
  const quote = getQuoteById(id);
  if (!quote) return null;
  const stat = stats[id] || { today: 0, week: 0, month: 0, total: 0 };
  return { ...quote, stat };
}

function getRandomQuote(excludeIds = []) {
  const allQuotes = getAllQuotes();
  const excludeSet = new Set(excludeIds.map(Number));
  const candidates = allQuotes.filter((q) => !excludeSet.has(q.id));
  const pool = candidates.length > 0 ? candidates : allQuotes;
  const idx = randomInt(0, pool.length - 1);
  return getQuoteByIdWithStats(pool[idx].id);
}

function recordViewedQuote(id) {
  const today = getToday();
  const storedDate = storage.getViewedDate();
  let viewed = storage.getViewedQuotes();

  if (storedDate !== today) {
    viewed = [];
    storage.setViewedDate(today);
  }

  if (!viewed.includes(id)) {
    viewed.push(id);
    storage.setViewedQuotes(viewed);
  }

  return viewed;
}

function getViewedQuotes() {
  const today = getToday();
  const storedDate = storage.getViewedDate();
  if (storedDate !== today) {
    storage.setViewedQuotes([]);
    storage.setViewedDate(today);
    return [];
  }
  return storage.getViewedQuotes();
}

function incrementLike(quoteId) {
  const stats = getStats();
  if (!stats[quoteId]) return null;
  stats[quoteId].today += 1;
  stats[quoteId].week += 1;
  stats[quoteId].month += 1;
  stats[quoteId].total += 1;
  stats[quoteId].lastLikeAt = Date.now();
  storage.setQuoteStats(stats);
  return stats[quoteId];
}

function getRankQuotes(type = 'today') {
  const stats = getStats();
  const allQuotes = getAllQuotes();
  const list = allQuotes.map((q) => {
    const stat = stats[q.id] || { today: 0, week: 0, month: 0, total: 0 };
    const count = stat[type] || 0;
    return { ...q, count };
  });

  list.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const statA = stats[a.id] || {};
    const statB = stats[b.id] || {};
    return (statB.lastLikeAt || 0) - (statA.lastLikeAt || 0);
  });
  return list.slice(0, 50);
}

function searchQuotes(keyword) {
  if (!keyword) return [];
  const allQuotes = getAllQuotes();
  const lower = keyword.toLowerCase();
  return allQuotes.filter(
    (q) => q.content.toLowerCase().includes(lower) || q.source.toLowerCase().includes(lower)
  );
}

module.exports = {
  getStats,
  getQuoteByIdWithStats,
  getRandomQuote,
  recordViewedQuote,
  getViewedQuotes,
  incrementLike,
  getRankQuotes,
  searchQuotes,
};
