const rankService = require('../../services/rank-service');
const reactionService = require('../../services/reaction-service');
const analytics = require('../../services/analytics-service');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');
const { RANK_TTL_MS } = require('../../utils/env');

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
    error: { today: false, week: false, month: false },
  },

  onLoad() {
    this._loadedAt = {};
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.syncFavoriteStates(this.data.activeTab);
    this.loadRank(this.data.activeTab, { force: false });
  },

  onPullDownRefresh() {
    this.loadRank(this.data.activeTab, { force: true, callback: () => {
      wx.stopPullDownRefresh();
    } });
  },

  onRankRefresh(e) {
    const type = e.currentTarget.dataset.type || this.data.activeTab;
    this.setData({ [`refreshing.${type}`]: true });
    this.loadRank(type, { force: true, callback: () => {
      this.setData({ [`refreshing.${type}`]: false });
    } });
  },

  onTabTap(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key, activeTabIndex: TAB_INDEX_MAP[key] });
    analytics.track('rank_view', { type: key });
    if (this.data.rankLists[key].length === 0) {
      this.loadRank(key, { force: false });
    }
  },

  onSwiperChange(e) {
    const index = e.detail.current;
    const key = INDEX_TAB_MAP[index];
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key, activeTabIndex: index });
    analytics.track('rank_view', { type: key });
    if (this.data.rankLists[key].length === 0) {
      this.loadRank(key, { force: false });
    }
  },

  async loadRank(type, { force = false, callback } = {}) {
    if (this.data.loading[type]) {
      if (callback) callback();
      return;
    }
    const cached = this.data.rankLists[type] || [];
    if (!force && cached.length && Date.now() - (this._loadedAt[type] || 0) < RANK_TTL_MS) {
      if (callback) callback();
      return;
    }
    this.setData({ [`loading.${type}`]: true, [`error.${type}`]: false });
    try {
      // 云端聚合点赞热度；收藏态再批量校正
      const list = await rankService.getRankList(type, 50, { force });
      const ids = list.map((item) => item.id);
      const favMap = ids.length ? await reactionService.batchStatus('favorite', ids) : {};
      const enrichedList = list.map((item) => ({
        ...item,
        favorited: !!favMap[item.id],
      }));
      this.setData({
        [`rankLists.${type}`]: enrichedList,
        [`loading.${type}`]: false,
        [`error.${type}`]: false,
      }, callback);
      this._loadedAt[type] = Date.now();
      analytics.track('rank_view', { type, force });
    } catch (err) {
      // 加载失败：标记错误态，由空状态组件展示「重试」入口，而非误导为「暂无排行」
      this.setData({ [`loading.${type}`]: false, [`error.${type}`]: true }, callback);
      showToast('排行加载失败');
    }
  },

  // 与云端同步各榜单的收藏态（返回其它页面后保持一致）
  async syncFavoriteStates(type = this.data.activeTab) {
    const list = this.data.rankLists[type];
    if (!list || list.length === 0) return;
    const ids = list.map((item) => item.id);
    const map = await reactionService.batchStatus('favorite', ids);
    const updated = list.map((item) =>
      item.favorited === !!map[item.id] ? item : { ...item, favorited: !!map[item.id] }
    );
    this.setData({ [`rankLists.${type}`]: updated });
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&from=rank`,
    });
  },

  // 收藏：乐观更新 UI，云函数确认；失败回滚
  onFavorite(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    return runReaction.call(this, async () => {
      const types = ['today', 'week', 'month'];
      const snapshots = {};
      let before = null;
      const patches = {};

      types.forEach((type) => {
        const list = this.data.rankLists[type];
        if (!list || !list.some((item) => item.id === id)) return;
        snapshots[type] = list;
        const current = !!(list.find((item) => item.id === id) || {}).favorited;
        if (before == null) before = current;
        patches[type] = list.map((item) =>
          item.id === id ? { ...item, favorited: !before } : item
        );
      });

      Object.keys(patches).forEach((type) => {
        this.setData({ [`rankLists.${type}`]: patches[type] });
      });

      try {
        const status = await reactionService.toggle('favorite', id, { silent: true });
        types.forEach((type) => {
          const list = this.data.rankLists[type];
          if (!list || !list.some((item) => item.id === id)) return;
          this.setData({
            [`rankLists.${type}`]: list.map((item) =>
              item.id === id ? { ...item, favorited: status } : item
            ),
          });
        });
        wx.showToast({ title: status ? '已收藏' : '已取消收藏', icon: status ? 'success' : 'none' });
      } catch (err) {
        Object.keys(snapshots).forEach((type) => {
          this.setData({ [`rankLists.${type}`]: snapshots[type] });
        });
        throw err;
      }
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onRetry() {
    this.loadRank(this.data.activeTab, { force: true });
  },
});
