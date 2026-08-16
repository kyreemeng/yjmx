const { callFunction } = require('../utils/cloud');
const storage = require('../utils/storage');
const { STORAGE_KEYS } = require('../utils/constants');
const { getChinaDateKey, pickDailyQuote, updateStreak } = require('../utils/daily');
const { getRarity } = require('../utils/rarity');

const CACHE_VERSION = 'v1';
const EMPTY_STAT = Object.freeze({
  today: 0,
  week: 0,
  month: 0,
  total: 0,
});

let memoryQuotes = null;
let loadingPromise = null;

function normalizeQuotes(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload && (payload.list || payload.quotes || payload.data);
  if (!Array.isArray(list)) return [];
  return list
    .filter((quote) => quote && Number.isInteger(Number(quote.id)))
    .map((quote) => ({ ...quote, id: Number(quote.id) }));
}

function readCachedQuotes() {
  if (storage.get(STORAGE_KEYS.QUOTE_CACHE_VERSION, '') !== CACHE_VERSION) return null;
  const quotes = normalizeQuotes(storage.get(STORAGE_KEYS.QUOTE_CACHE, null));
  return quotes.length > 0 ? quotes : null;
}

function writeCachedQuotes(quotes) {
  storage.set(STORAGE_KEYS.QUOTE_CACHE, quotes);
  storage.set(STORAGE_KEYS.QUOTE_CACHE_VERSION, CACHE_VERSION);
}

async function fetchCloudQuotes() {
  const result = await callFunction('quotes', { action: 'listActive' });
  const quotes = normalizeQuotes(result);
  if (quotes.length === 0) {
    throw new Error('云端语料为空或格式不正确');
  }
  writeCachedQuotes(quotes);
  memoryQuotes = quotes;
  return memoryQuotes;
}

async function loadQuotes(force = false) {
  if (!force && memoryQuotes) return memoryQuotes;
  if (!force) {
    const cached = readCachedQuotes();
    if (cached) {
      memoryQuotes = cached;
      return memoryQuotes;
    }
  }
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetchCloudQuotes()
    .catch((error) => {
      const cached = readCachedQuotes();
      if (cached) {
        memoryQuotes = cached;
        return memoryQuotes;
      }
      const loadError = new Error('金句加载失败：当前无网络且没有可用缓存');
      loadError.cause = error;
      throw loadError;
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
}

async function getAllQuotes() {
  const quotes = await loadQuotes();
  return quotes.map((quote) => ({ ...quote }));
}

async function getQuoteByIdWithStats(id) {
  const quotes = await loadQuotes();
  const quote = quotes.find((item) => item.id === Number(id));
  if (!quote) return null;
  return { ...quote, stat: { ...EMPTY_STAT } };
}

async function getRandomQuote(excludeIds = []) {
  const quotes = await loadQuotes();
  if (quotes.length === 0) return null;
  const excluded = new Set((Array.isArray(excludeIds) ? excludeIds : []).map(Number));
  const candidates = quotes.filter((quote) => !excluded.has(quote.id));
  const pool = candidates.length > 0 ? candidates : quotes;
  const quote = pool[Math.floor(Math.random() * pool.length)];
  return { ...quote, stat: { ...EMPTY_STAT } };
}

async function getDailyQuote(date = getChinaDateKey()) {
  const quote = pickDailyQuote(await loadQuotes(), date);
  return quote ? { ...quote, stat: { ...EMPTY_STAT } } : null;
}

function recordViewedQuote(id, date = getChinaDateKey()) {
  const targetId = Number(id);
  if (!Number.isInteger(targetId) || targetId <= 0) return getViewedQuotes(date);

  const daily = storage.get(STORAGE_KEYS.DAILY_VIEWED, null);
  const ids = daily && daily.date === date && Array.isArray(daily.ids) ? daily.ids.slice() : [];
  if (!ids.includes(targetId)) ids.push(targetId);
  storage.set(STORAGE_KEYS.DAILY_VIEWED, { date, ids });

  const seen = storage.get(STORAGE_KEYS.SEEN_QUOTES, []);
  const seenIds = Array.isArray(seen) ? seen.map(Number).filter(Number.isInteger) : [];
  if (!seenIds.includes(targetId)) {
    seenIds.push(targetId);
    storage.set(STORAGE_KEYS.SEEN_QUOTES, seenIds);
  }
  return ids;
}

function getViewedQuotes(date = getChinaDateKey()) {
  const daily = storage.get(STORAGE_KEYS.DAILY_VIEWED, null);
  if (!daily || daily.date !== date || !Array.isArray(daily.ids)) return [];
  return daily.ids.slice();
}

async function getCollectionProgress() {
  const quotes = await loadQuotes();
  const total = quotes.length;
  const seen = storage.get(STORAGE_KEYS.SEEN_QUOTES, []);
  const seenSet = new Set((Array.isArray(seen) ? seen : []).map(Number));
  const activeIds = new Set(quotes.map((quote) => quote.id));
  const seenCount = Array.from(seenSet).filter((id) => activeIds.has(id)).length;
  const count = Math.min(seenCount, total);
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  const rarityDistribution = {
    legendary: { collected: 0, total: 0 },
    epic: { collected: 0, total: 0 },
    rare: { collected: 0, total: 0 },
    common: { collected: 0, total: 0 },
  };
  quotes.forEach((quote) => {
    const key = getRarity(quote.id).key;
    rarityDistribution[key].total += 1;
    if (seenSet.has(quote.id)) rarityDistribution[key].collected += 1;
  });
  return {
    seen: count,
    collected: count,
    total,
    seenCount: count,
    totalCount: total,
    percent,
    rarityDistribution,
  };
}

function updateVisitStreak(date = getChinaDateKey()) {
  const previous = storage.get(STORAGE_KEYS.VISIT_STREAK, null);
  const next = updateStreak(previous, date);
  storage.set(STORAGE_KEYS.VISIT_STREAK, next);
  return { ...next, updated: !previous || previous.lastDate !== date };
}

module.exports = {
  loadQuotes,
  getAllQuotes,
  getQuoteByIdWithStats,
  getRandomQuote,
  getDailyQuote,
  recordViewedQuote,
  getViewedQuotes,
  getCollectionProgress,
  updateVisitStreak,
};
