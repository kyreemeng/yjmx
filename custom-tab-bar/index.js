Component({
  data: {
    selected: 0,
    safeAreaBottom: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: 'home' },
      { pagePath: '/pages/rank/rank', text: '排行', icon: 'trophy' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: 'user' },
    ],
  },

  lifetimes: {
    attached() {
      try {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const safeAreaBottom = win.safeArea ? (win.screenHeight - win.safeArea.bottom) : 0;
        this.setData({ safeAreaBottom });
      } catch (err) {
        console.error('获取安全区失败', err);
      }
    },
  },

  methods: {
    switchTab(e) {
      const { index, path } = e.currentTarget.dataset;
      if (this.data.selected === index) return;
      wx.switchTab({ url: path });
    },
  },
});
