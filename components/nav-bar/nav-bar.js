Component({
  properties: {
    title: {
      type: String,
      value: '',
    },
    back: {
      type: Boolean,
      value: false,
    },
    backDelta: {
      type: Number,
      value: 1,
    },
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
  },

  lifetimes: {
    attached() {
      this.updateBar();
    },
  },

  methods: {
    updateBar() {
      try {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const statusBarHeight = win.statusBarHeight || 20;
        let navBarHeight = 44;

        try {
          const rect = wx.getMenuButtonBoundingClientRect
            ? wx.getMenuButtonBoundingClientRect()
            : null;
          if (rect && rect.top && rect.height) {
            // 微信胶囊按钮与状态栏之间的上下间距相同，据此推算导航栏内容高度
            navBarHeight = (rect.top - statusBarHeight) * 2 + rect.height;
          }
        } catch (e) {
          // 忽略：使用默认 44px
        }

        this.setData({ statusBarHeight, navBarHeight });
      } catch (err) {
        console.error('导航栏信息获取失败', err);
      }
    },

    onBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        wx.navigateBack({ delta: this.data.backDelta });
      } else {
        // 直接进入（如分享卡片）时没有返回栈，回退到首页
        wx.switchTab({ url: '/pages/index/index' });
      }
      this.triggerEvent('back');
    },
  },
});