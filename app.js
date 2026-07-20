App({
  globalData: {
    userInfo: null,
    isLogin: false,
    systemInfo: null,
    launchOptions: null,
  },

  onLaunch(options) {
    this.globalData.launchOptions = options;
    this.initSystemInfo();
    this.initUserInfo();
  },

  onShow(options) {
    this.globalData.launchOptions = options;
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
