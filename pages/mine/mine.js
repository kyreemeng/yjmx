const userService = require('../../services/user-service');
const reactionService = require('../../services/reaction-service');
const quoteService = require('../../services/quote-service');
const { showToast } = require('../../utils/util');
const { getRarity } = require('../../utils/rarity');

Page({
  data: {
    userInfo: null,
    isLogin: false,
    favoriteCount: 0,
    likeCount: 0,
    showLoginModal: false,
    streakCount: 0,
    collectionProgress: { collected: 0, total: 0, percent: 0 },
    rarityDistribution: [],
    summaryError: false,
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
    this.loadReadingSummary();
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

  async loadReadingSummary() {
    try {
      const [streak, progress, quotes] = await Promise.all([
        quoteService.updateVisitStreak(),
        quoteService.getCollectionProgress(),
        quoteService.loadQuotes(false),
      ]);
      const distribution = (progress && (progress.rarityDistribution || progress.distribution)) || {};
      const labels = { legendary: '传世', epic: '精粹', rare: '佳句', common: '摘录' };
      const rarityDistribution = Object.keys(labels).map((key) => {
        const value = distribution[key];
        const count = Number(value && (value.collected || value.count || value)) || 0;
        const total = Number(value && value.total)
          || quotes.filter((quote) => getRarity(quote.id).key === key).length;
        return { key, label: labels[key], count, total };
      });
      const normalizedProgress = progress ? {
        ...progress,
        collected: Number(progress.collected != null ? progress.collected : (progress.seen || progress.seenCount)) || 0,
      } : this.data.collectionProgress;
      this.setData({
        streakCount: Number(streak && (streak.count || streak.days || streak)) || 0,
        collectionProgress: normalizedProgress,
        rarityDistribution,
        summaryError: false,
      });
    } catch (err) {
      this.setData({ summaryError: true });
    }
  },

  onRetrySummary() {
    this.loadReadingSummary();
    this.loadCounts();
  },

  onTapHeader() {
    if (!this.data.isLogin) {
      this.setData({ showLoginModal: true });
    }
  },

  // 收藏已走云端 openid，无需登录即可查看与管理
  onFavorites() {
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
    this.setData({ showLoginModal: false });
    this.refreshUserInfo();
    showToast('资料已保存', 'success');
  },

  onLoginFail() {
    this.setData({ showLoginModal: false });
    showToast('可稍后完善资料');
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false });
  },
});
