const { consumeLaunchShare } = require('./utils/share');
const env = require('./utils/env');
const analytics = require('./services/analytics-service');
const quoteService = require('./services/quote-service');

App({
  globalData: {
    userInfo: null,
    isLogin: false,
    systemInfo: null,
    launchOptions: null,
    shareEntry: null,
  },

  onLaunch(options) {
    this.globalData.launchOptions = options || {};
    this.globalData.shareEntry = consumeLaunchShare(options || {});
    this.initCloud();
    quoteService.loadQuotes(true).catch(() => {
      // 首次离线由页面展示可重试错误；有缓存时 quote-service 会自动降级。
    });
    this.initSystemInfo();
    this.initUserInfo();
    analytics.track('app_open', {
      phase: 'launch',
      scene: options && options.scene,
      path: options && options.path,
    });
  },

  initCloud() {
    try {
      if (typeof wx !== 'undefined' && wx.cloud) {
        wx.cloud.init({
          env: env.cloudEnvId,
          traceUser: true,
        });
      }
    } catch (err) {
      console.error('云开发初始化失败', err);
    }
  },

  onShow(options) {
    this.globalData.launchOptions = options || this.globalData.launchOptions || {};
    const entry = consumeLaunchShare(options || {});
    if (entry) {
      this.globalData.shareEntry = entry;
    }
    analytics.track('app_open', {
      phase: 'show',
      scene: options && options.scene,
      path: options && options.path,
    });
  },

  initSystemInfo() {
    try {
      const info = {};
      if (wx.getWindowInfo) Object.assign(info, wx.getWindowInfo());
      if (wx.getDeviceInfo) Object.assign(info, wx.getDeviceInfo());
      if (wx.getAppBaseInfo) Object.assign(info, wx.getAppBaseInfo());
      // 兜底：极端基础库缺失时使用已弃用接口
      if (!info.pixelRatio && wx.getSystemInfoSync) {
        Object.assign(info, wx.getSystemInfoSync());
      }
      this.globalData.systemInfo = info;
    } catch (err) {
      console.error('获取系统信息失败', err);
    }
  },

  initUserInfo() {
    try {
      const userInfo = wx.getStorageSync('user_info');
      if (userInfo && userInfo.isLogin) {
        this.globalData.userInfo = userInfo;
        this.globalData.isLogin = true;
      }
    } catch (err) {
      console.error('初始化用户信息失败', err);
    }
  },

  setUserInfo(userInfo) {
    this.globalData.userInfo = userInfo;
    this.globalData.isLogin = !!(userInfo && userInfo.isLogin);
    wx.setStorageSync('user_info', userInfo);
  },

  clearUserInfo() {
    this.globalData.userInfo = null;
    this.globalData.isLogin = false;
    wx.removeStorageSync('user_info');
  },
});
