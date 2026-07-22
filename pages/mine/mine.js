const userService = require('../../services/user-service');
const reactionService = require('../../services/reaction-service');
const { showToast } = require('../../utils/util');

Page({
  data: {
    userInfo: null,
    isLogin: false,
    favoriteCount: 0,
    likeCount: 0,
    showLoginModal: false,
    pendingRoute: '',
  },

  onLoad() {
    this.refreshUserInfo();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.refreshUserInfo();
    // 收藏 / 点赞数量来自云端，与自定义登录态无关
    this.loadCounts();
  },

  refreshUserInfo() {
    const userInfo = userService.getUserInfo();
    const isLogin = userService.isLogin();
    this.setData({
      userInfo,
      isLogin,
    });
  },

  async loadCounts() {
    try {
      const [fav, like] = await Promise.all([
        reactionService.getCount('favorite'),
        reactionService.getCount('like'),
      ]);
      this.setData({ favoriteCount: fav, likeCount: like });
    } catch (err) {
      // 云函数未部署或网络异常时静默降级，不影响其它功能
    }
  },

  onTapHeader() {
    if (!this.data.isLogin) {
      this.setData({ showLoginModal: true });
    }
  },

  onFavorites() {
    if (!this.data.isLogin) {
      this.setData({
        showLoginModal: true,
        pendingRoute: '/pages/favorites/favorites',
      });
      return;
    }
    wx.navigateTo({ url: '/pages/favorites/favorites' });
  },

  onLikes() {
    wx.navigateTo({ url: '/pages/likes/likes' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后收藏和点赞数据不受影响，确定退出吗？',
      success: (res) => {
        if (res.confirm) {
          userService.logout();
          this.refreshUserInfo();
          showToast('已退出登录');
        }
      },
    });
  },

  onLoginSuccess(e) {
    const userInfo = e.detail.userInfo;
    userService.login(userInfo);
    const pendingRoute = this.data.pendingRoute;
    this.setData({ showLoginModal: false, pendingRoute: '' });
    this.refreshUserInfo();
    showToast('登录成功', 'success');
    if (pendingRoute) {
      wx.navigateTo({ url: pendingRoute });
    }
  },

  onLoginFail() {
    this.setData({ showLoginModal: false, pendingRoute: '' });
    showToast('授权后可使用完整功能');
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false, pendingRoute: '' });
  },
});
