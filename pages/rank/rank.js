const quoteService = require('../../services/quote-service');
const userService = require('../../services/user-service');
const { showToast, formatNumber, truncateText } = require('../../utils/util');

const TABS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
];

const TAB_INDEX_MAP = { today: 0, week: 1, month: 2 };
const INDEX_TAB_MAP = ['today', 'week', 'month'];

Page({
  data: {
    tabs: TABS,
    activeTab: 'today',
    activeTabIndex: 0,
    rankLists: { today: [], week: [], month: [] },
    loading: { today: false, week: false, month: false },
    refreshing: { today: false, week: false, month: false },
    showLoginModal: false,
    pendingQuoteId: null,
  },

  onLoad() {
    this.loadRank('today');
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.refreshFavoriteState();
    this.loadRank(this.data.activeTab);
  },

  onPullDownRefresh() {
    this.loadRank(this.data.activeTab, () => {
      wx.stopPullDownRefresh();
    });
  },

  onRankRefresh(e) {
    const type = e.currentTarget.dataset.type || this.data.activeTab;
    this.setData({ [`refreshing.${type}`]: true });
    this.loadRank(type, () => {
      this.setData({ [`refreshing.${type}`]: false });
    });
  },

  onUnload() {
    if (this._rankTimers) {
      Object.values(this._rankTimers).forEach((timer) => clearTimeout(timer));
    }
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key, activeTabIndex: TAB_INDEX_MAP[key] });
    if (this.data.rankLists[key].length === 0) {
      this.loadRank(key);
    }
  },

  onSwiperChange(e) {
    const index = e.detail.current;
    const key = INDEX_TAB_MAP[index];
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key, activeTabIndex: index });
    if (this.data.rankLists[key].length === 0) {
      this.loadRank(key);
    }
  },

  loadRank(type, callback) {
    if (this.data.loading[type]) {
      if (callback) callback();
      return;
    }
    this.setData({ [`loading.${type}`]: true });
    if (!this._rankTimers) this._rankTimers = {};
    this._rankTimers[type] = setTimeout(() => {
      const list = quoteService.getRankQuotes(type);
      const enrichedList = list.map((item) => ({
        ...item,
        favorited: userService.isFavorite(item.id),
        summary: truncateText(item.content, 28),
        countText: formatNumber(item.count),
      }));
      this.setData({
        [`rankLists.${type}`]: enrichedList,
        [`loading.${type}`]: false,
      }, callback);
      delete this._rankTimers[type];
    }, 300);
  },

  refreshFavoriteState() {
    const rankLists = Object.keys(this.data.rankLists).reduce((result, key) => {
      result[key] = this.data.rankLists[key].map((item) => ({
        ...item,
        favorited: userService.isFavorite(item.id),
      }));
      return result;
    }, {});
    this.setData({ rankLists });
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&from=rank`,
    });
  },

  onFavorite(e) {
    const id = e.currentTarget.dataset.id;
    if (!userService.isLogin()) {
      this.setData({ showLoginModal: true, pendingQuoteId: id });
      return;
    }
    this.doFavorite(id);
  },

  doFavorite(id) {
    const result = userService.toggleFavorite(id);
    if (result.success) {
      this.refreshFavoriteState();
      showToast(result.message || '操作成功', result.reason === 'favorited' ? 'success' : 'none');
    } else if (result.reason === 'limit_reached') {
      showToast(result.message);
    }
  },

  onLoginSuccess(e) {
    const userInfo = e.detail.userInfo;
    userService.login(userInfo);
    this.setData({ showLoginModal: false });
    showToast('登录成功', 'success');
    if (this.data.pendingQuoteId) {
      this.doFavorite(this.data.pendingQuoteId);
    }
    this.setData({ pendingQuoteId: null });
  },

  onLoginFail() {
    this.setData({ showLoginModal: false, pendingQuoteId: null });
    showToast('授权后可收藏金句哦~');
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false, pendingQuoteId: null });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
