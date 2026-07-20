const userService = require('../../services/user-service');
const { formatTime, truncateText } = require('../../utils/util');

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
      const list = userService.getLikedQuotesList().map((item) => ({
        ...item,
        summary: truncateText(item.content, 30),
        timeText: item.likeTime ? formatTime(item.likeTime) : item.likeDate,
      }));
      this.setData({ list, loading: false });
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
