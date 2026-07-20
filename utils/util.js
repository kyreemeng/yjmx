function formatDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getToday() {
  return formatDate();
}

function getWeekStart(date = new Date()) {
  const day = date.getDay() || 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getWeekKey(date = new Date()) {
  const start = getWeekStart(date);
  return formatDate(start);
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatNumber(num) {
  if (num >= 10000) {
    const value = (num / 10000).toFixed(1).replace(/\.0$/, '');
    return `${value}万`;
  }
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatTime(ts) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function throttle(fn, interval = 500) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn.apply(this, args);
    }
  };
}

function debounce(fn, wait = 300) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function truncateText(text, maxLength = 30) {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 });
}

function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true });
}

function hideLoading() {
  wx.hideLoading();
}

module.exports = {
  formatDate,
  getToday,
  getWeekStart,
  getMonthStart,
  getWeekKey,
  getMonthKey,
  formatNumber,
  formatTime,
  throttle,
  debounce,
  randomInt,
  shuffleArray,
  truncateText,
  showToast,
  showLoading,
  hideLoading,
};
