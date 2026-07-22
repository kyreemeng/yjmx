const quoteService = require('../../services/quote-service');
const reactionService = require('../../services/reaction-service');
const { showToast, formatNumber, truncateText } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');

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
  },

  onLoad() {
    this.loadRank('today');
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.syncFavoriteStates();
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

  async loadRank(type, callback) {
    if (this.data.loading[type]) {
      if (callback) callback();
      return;
    }
    this.setData({ [`loading.${type}`]: true });
    if (!this._rankTimers) this._rankTimers = {};
    this._rankTimers[type] = setTimeout(async () => {
      const list = quoteService.getRankQuotes(type);
      const ids = list.map((item) => item.id);
      const favMap = ids.length ? await reactionService.batchStatus('favorite', ids) : {};
      const enrichedList = list.map((item) => ({
        ...item,
        favorited: !!favMap[item.id],
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

  // 与云端同步各榜单的收藏态（返回其它页面后保持一致）
  async syncFavoriteStates() {
    const types = ['today', 'week', 'month'];
    for (const type of types) {
      const list = this.data.rankLists[type];
      if (!list || list.length === 0) continue;
      const ids = list.map((item) => item.id);
      const map = await reactionService.batchStatus('favorite', ids);
      const updated = list.map((item) =>
        item.favorited === !!map[item.id] ? item : { ...item, favorited: !!map[item.id] }
      );
      this.setData({ [`rankLists.${type}`]: updated });
    }
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&from=rank`,
    });
  },

  // 收藏不再依赖自定义登录：云函数经 openid 自动识别用户身份
  onFavorite(e) {
    const id = e.currentTarget.dataset.id;
    return runReaction.call(this, async () => {
      const status = await reactionService.toggle('favorite', id);
      const types = ['today', 'week', 'month'];
      types.forEach((type) => {
        const list = this.data.rankLists[type];
        if (!list || !list.find((item) => item.id === id)) return;
        const updated = list.map((item) =>
          item.id === id ? { ...item, favorited: status } : item
        );
        this.setData({ [`rankLists.${type}`]: updated });
      });
      wx.showToast({ title: status ? '已收藏' : '已取消收藏', icon: status ? 'success' : 'none' });
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
