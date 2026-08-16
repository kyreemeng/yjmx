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

function truncateText(text, maxLength = 30) {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
}

function showToast(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 });
}

module.exports = {
  formatNumber,
  formatTime,
  truncateText,
  showToast,
};
