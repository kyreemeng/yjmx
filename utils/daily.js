const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000;

function getChinaDateKey(date = new Date()) {
  const timestamp = date instanceof Date ? date.getTime() : Number(date);
  const china = new Date(timestamp + CHINA_OFFSET_MS);
  const year = china.getUTCFullYear();
  const month = String(china.getUTCMonth() + 1).padStart(2, '0');
  const day = String(china.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDayNumber(date) {
  if (!DATE_PATTERN.test(date)) {
    throw new TypeError('date 必须是 YYYY-MM-DD');
  }
  const [year, month, day] = date.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new TypeError('date 必须是有效的 YYYY-MM-DD');
  }
  return Math.floor(timestamp / 86400000);
}

function pickDailyQuote(quotes, date) {
  if (!Array.isArray(quotes) || quotes.length === 0) return null;
  const index = ((toDayNumber(date) % quotes.length) + quotes.length) % quotes.length;
  return quotes[index];
}

function updateStreak(state, date) {
  const day = toDayNumber(date);
  if (!state || !state.lastDate) {
    return { count: 1, lastDate: date };
  }

  const lastDay = toDayNumber(state.lastDate);
  const currentCount = Math.max(0, Number(state.count) || 0);
  if (day === lastDay) {
    return { count: currentCount, lastDate: date };
  }
  return {
    count: day === lastDay + 1 ? currentCount + 1 : 1,
    lastDate: date,
  };
}

module.exports = {
  getChinaDateKey,
  pickDailyQuote,
  updateStreak,
};
