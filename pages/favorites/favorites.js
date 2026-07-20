const userService = require('../../services/user-service');
const { formatTime, truncateText, showToast } = require('../../utils/util');

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
    this._loadTimer = setTimeout(() => {
      const list = userService.getFavoriteQuotesList().map((item) => ({
        ...item,
        summary: truncateText(item.content, 30),
        timeText: formatTime(item.favoriteTime),
      }));
      this.setData({ list, loading: false });
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
      success: (res) => {
        if (res.tapIndex === 0) {
          userService.unfavoriteQuote(id);
          this.loadData();
          showToast('已取消收藏');
        }
      },
    });
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
