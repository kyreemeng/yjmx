const reactionService = require('../../services/reaction-service');
const quoteService = require('../../services/quote-service');
const analytics = require('../../services/analytics-service');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');
const { filterFavorites, buildThemeOptions } = require('../../utils/favorite-filter');

const RARITY_FILTERS = [
  { key: 'all', label: '全部稀有度' },
  { key: 'legendary', label: '传世' },
  { key: 'epic', label: '精粹' },
  { key: 'rare', label: '佳句' },
  { key: 'common', label: '摘录' },
];

Page({
  data: {
    allList: [],
    list: [],
    loading: false,
    error: false,
    sourceFilters: [{ key: 'all', label: '全部主题' }],
    rarityFilters: RARITY_FILTERS,
    activeSource: 'all',
    activeRarity: 'all',
    collectionProgress: { collected: 0, total: 0, percent: 0 },
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true, error: false });
    try {
      const [list, progress] = await Promise.all([
        reactionService.getListWithQuotes('favorite', 500),
        quoteService.getCollectionProgress(),
      ]);
      const likeMap = await reactionService.batchStatus('like', list.map((item) => item.id));
      const allList = list.map((item) => ({ ...item, liked: !!likeMap[item.id] }));
      const sourceFilters = buildThemeOptions(allList);
      const normalizedProgress = progress ? {
        ...progress,
        collected: Number(progress.collected != null ? progress.collected : (progress.seen || progress.seenCount)) || 0,
      } : this.data.collectionProgress;
      this.setData({
        allList,
        sourceFilters,
        collectionProgress: normalizedProgress,
        loading: false,
      }, () => this.applyFilters());
    } catch (err) {
      this.setData({ loading: false, error: true });
      showToast('收藏加载失败，请重试');
    }
  },

  applyFilters() {
    const list = filterFavorites(this.data.allList, this.data.activeSource, this.data.activeRarity);
    this.setData({ list });
  },

  onSourceFilter(e) {
    const activeSource = e.currentTarget.dataset.key || 'all';
    this.setData({ activeSource }, () => this.applyFilters());
    analytics.track('favorite_filter', { sourceKey: activeSource, rarityKey: this.data.activeRarity });
  },

  onRarityFilter(e) {
    const activeRarity = e.currentTarget.dataset.key || 'all';
    this.setData({ activeRarity }, () => this.applyFilters());
    analytics.track('favorite_filter', { sourceKey: this.data.activeSource, rarityKey: activeRarity });
  },

  onRetry() {
    this.loadData();
  },

  onItemTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}&from=favorites` });
  },

  onFavorite(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    this._unfavorite(id);
  },

  onLike(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    this._toggleLike(id);
  },

  _unfavorite(id) {
    return runReaction.call(this, async () => {
      const prev = this.data.allList;
      this.setData({ allList: prev.filter((item) => item.id !== id) }, () => this.applyFilters());
      try {
        await reactionService.remove('favorite', id, { silent: true });
        analytics.track('favorite', { targetId: id, status: false, source: 'favorites' });
        wx.showToast({ title: '已取消收藏', icon: 'none' });
      } catch (err) {
        this.setData({ allList: prev }, () => this.applyFilters());
        throw err;
      }
    });
  },

  _toggleLike(id) {
    return runReaction.call(this, async () => {
      const prevLiked = !!(this.data.allList.find((item) => item.id === id) || {}).liked;
      this.setData({
        allList: this.data.allList.map((item) =>
          item.id === id ? { ...item, liked: !prevLiked } : item
        ),
      }, () => this.applyFilters());
      try {
        const status = await reactionService.toggle('like', id, { silent: true });
        this.setData({
          allList: this.data.allList.map((item) =>
            item.id === id ? { ...item, liked: status } : item
          ),
        }, () => this.applyFilters());
        analytics.track('like', { targetId: id, status, source: 'favorites' });
        wx.showToast({
          title: status ? '点赞成功' : '已取消点赞',
          icon: status ? 'success' : 'none',
        });
      } catch (err) {
        this.setData({
          allList: this.data.allList.map((item) =>
            item.id === id ? { ...item, liked: prevLiked } : item
          ),
        }, () => this.applyFilters());
        throw err;
      }
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
