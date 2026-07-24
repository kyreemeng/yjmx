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
        const list = await reactionService.getListWithQuotes('favorite', 200);
        const likeMap = await reactionService.batchStatus(
          'like',
          list.map((item) => item.id)
        );
        this.setData({
          list: list.map((item) => ({ ...item, liked: !!likeMap[item.id] })),
          loading: false,
        });
      } catch (err) {
        this.setData({ loading: false });
        showToast('收藏加载失败，请重试');
      }
      this._loadTimer = null;
    }, 200);
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
      await reactionService.remove('favorite', id, { silent: true });
      this.setData({
        list: this.data.list.filter((item) => item.id !== id),
      });
      wx.showToast({ title: '已取消收藏', icon: 'none' });
    });
  },

  _toggleLike(id) {
    return runReaction.call(this, async () => {
      const status = await reactionService.toggle('like', id, { silent: true });
      this.setData({
        list: this.data.list.map((item) =>
          item.id === id ? { ...item, liked: status } : item
        ),
      });
      wx.showToast({
        title: status ? '点赞成功' : '已取消点赞',
        icon: status ? 'success' : 'none',
      });
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
