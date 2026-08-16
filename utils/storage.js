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

  getUserInfo() {
    return this.get(STORAGE_KEYS.USER_INFO, null);
  },

  setUserInfo(userInfo) {
    return this.set(STORAGE_KEYS.USER_INFO, userInfo);
  },

  removeUserInfo() {
    return this.remove(STORAGE_KEYS.USER_INFO);
  },
};

module.exports = storage;
