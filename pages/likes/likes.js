const reactionService = require('../../services/reaction-service');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');

Page({
  data: {
    list: [],
    loading: false,
  },

  onShow() {
    this.loadData();
  },

  onUnload() {
    if (this._loadTimer) clearTimeout(this._loadTimer);
  },

  loadData() {
    if (this._loadTimer) clearTimeout(this._loadTimer);
    this.setData({ loading: true });
    this._loadTimer = setTimeout(async () => {
      try {
        const list = await reactionService.getListWithQuotes('like', 200);
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
        this.setData({ loading: false });
        showToast('记录加载失败，请重试');
      }
      this._loadTimer = null;
    }, 200);
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
      await reactionService.remove('like', id, { silent: true });
      this.setData({
        list: this.data.list.filter((item) => item.id !== id),
      });
      wx.showToast({ title: '已取消点赞', icon: 'none' });
    });
  },

  _toggleFavorite(id) {
    return runReaction.call(this, async () => {
      const status = await reactionService.toggle('favorite', id, { silent: true });
      this.setData({
        list: this.data.list.map((item) =>
          item.id === id ? { ...item, favorited: status } : item
        ),
      });
      wx.showToast({
        title: status ? '已收藏' : '已取消收藏',
        icon: status ? 'success' : 'none',
      });
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
