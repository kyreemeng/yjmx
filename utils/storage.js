const { STORAGE_KEYS } = require('./constants');

const storage = {
  get(key, defaultValue = null) {
    try {
      const value = wx.getStorageSync(key);
      return value !== '' ? value : defaultValue;
    } catch (err) {
      console.error(`Storage get failed: ${key}`, err);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      wx.setStorageSync(key, value);
      return true;
    } catch (err) {
      console.error(`Storage set failed: ${key}`, err);
      return false;
    }
  },

  remove(key) {
    try {
      wx.removeStorageSync(key);
      return true;
    } catch (err) {
      console.error(`Storage remove failed: ${key}`, err);
      return false;
    }
  },

  clear() {
    try {
      wx.clearStorageSync();
      return true;
    } catch (err) {
      console.error('Storage clear failed', err);
      return false;
    }
  },

  getUserInfo() {
    return this.get(STORAGE_KEYS.USER_INFO, null);
  },

  setUserInfo(userInfo) {
    return this.set(STORAGE_KEYS.USER_INFO, userInfo);
  },

  removeUserInfo() {
    return this.remove(STORAGE_KEYS.USER_INFO);
  },

  getLikedQuotes() {
    return this.get(STORAGE_KEYS.LIKED_QUOTES, {});
  },

  setLikedQuotes(liked) {
    return this.set(STORAGE_KEYS.LIKED_QUOTES, liked);
  },

  getFavoriteQuotes() {
    return this.get(STORAGE_KEYS.FAVORITE_QUOTES, {});
  },

  setFavoriteQuotes(favorites) {
    return this.set(STORAGE_KEYS.FAVORITE_QUOTES, favorites);
  },

  getQuoteStats() {
    return this.get(STORAGE_KEYS.QUOTE_STATS, {});
  },

  setQuoteStats(stats) {
    return this.set(STORAGE_KEYS.QUOTE_STATS, stats);
  },

  getViewedQuotes() {
    return this.get(STORAGE_KEYS.VIEWED_QUOTES, []);
  },

  setViewedQuotes(viewed) {
    return this.set(STORAGE_KEYS.VIEWED_QUOTES, viewed);
  },

  getViewedDate() {
    return this.get(STORAGE_KEYS.VIEWED_DATE, '');
  },

  setViewedDate(date) {
    return this.set(STORAGE_KEYS.VIEWED_DATE, date);
  },
};

module.exports = storage;
