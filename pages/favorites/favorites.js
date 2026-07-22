const reactionService = require('../../services/reaction-service');
const { showToast } = require('../../utils/util');

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
        this.setData({ list, loading: false });
      } catch (err) {
        this.setData({ loading: false });
        showToast('收藏加载失败，请重试');
      }
      this._loadTimer = null;
    }, 200);
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}&from=favorites` });
  },

  onLongPress(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['取消收藏'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          try {
            await reactionService.remove('favorite', id);
            this.loadData();
            showToast('已取消收藏');
          } catch (err) {
            showToast('操作失败，请重试');
          }
        }
      },
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
