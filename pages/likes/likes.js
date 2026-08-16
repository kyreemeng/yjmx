const reactionService = require('../../services/reaction-service');
const analytics = require('../../services/analytics-service');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');

Page({
  data: {
    list: [],
    loading: false,
    error: false,
  },

  onShow() {
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true, error: false });
    try {
      const list = await reactionService.getListWithQuotes('like', 500);
      const favoriteMap = await reactionService.batchStatus(
        'favorite',
        list.map((item) => item.id)
      );
      this.setData({
        list: list.map((item) => ({
          ...item,
          favorited: !!favoriteMap[item.id],
        })),
        loading: false,
      });
    } catch (err) {
      this.setData({ loading: false, error: true });
      showToast('记录加载失败，请重试');
    }
  },

  onRetry() {
    this.loadData();
  },

  onItemTap(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}&from=likes` });
  },

  onLike(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    this._unlike(id);
  },

  onFavorite(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    this._toggleFavorite(id);
  },

  _unlike(id) {
    return runReaction.call(this, async () => {
      const prev = this.data.list;
      this.setData({ list: prev.filter((item) => item.id !== id) });
      try {
        await reactionService.remove('like', id, { silent: true });
        analytics.track('like', { targetId: id, status: false, source: 'likes' });
        wx.showToast({ title: '已取消点赞', icon: 'none' });
      } catch (err) {
        this.setData({ list: prev });
        throw err;
      }
    });
  },

  _toggleFavorite(id) {
    return runReaction.call(this, async () => {
      const prevFav = !!(this.data.list.find((item) => item.id === id) || {}).favorited;
      this.setData({
        list: this.data.list.map((item) =>
          item.id === id ? { ...item, favorited: !prevFav } : item
        ),
      });
      try {
        const status = await reactionService.toggle('favorite', id, { silent: true });
        this.setData({
          list: this.data.list.map((item) =>
            item.id === id ? { ...item, favorited: status } : item
          ),
        });
        analytics.track('favorite', { targetId: id, status, source: 'likes' });
        wx.showToast({
          title: status ? '已收藏' : '已取消收藏',
          icon: status ? 'success' : 'none',
        });
      } catch (err) {
        this.setData({
          list: this.data.list.map((item) =>
            item.id === id ? { ...item, favorited: prevFav } : item
          ),
        });
        throw err;
      }
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
