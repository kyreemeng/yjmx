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
        const list = await reactionService.getListWithQuotes('like', 200);
        this.setData({ list, loading: false });
      } catch (err) {
        this.setData({ loading: false });
        showToast('记录加载失败，请重试');
      }
      this._loadTimer = null;
    }, 200);
  },

  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}&from=likes` });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
