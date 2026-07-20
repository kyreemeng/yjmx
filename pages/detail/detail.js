const quoteService = require('../../services/quote-service');
const userService = require('../../services/user-service');
const { showToast } = require('../../utils/util');

const FROM_LABELS = {
  home: '首页',
  rank: '排行',
  favorites: '我的收藏',
  likes: '点赞记录',
  share: '好友分享',
};

Page({
  data: {
    quote: null,
    liked: false,
    favorited: false,
    showLoginModal: false,
    showSharePoster: false,
    from: '',
  },

  onLoad(options) {
    const id = Number(options.id);
    this.setData({ from: FROM_LABELS[options.from] || '金句详情' });
    if (!id) {
      // 首页是 tabBar 页面，必须用 reLaunch/switchTab，不能用 redirectTo
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    this.loadQuote(id);
  },

  onShow() {
    if (this.data.quote) {
      this.refreshInteractionState(this.data.quote.id);
    }
  },

  onUnload() {
    if (this._fallbackTimer) clearTimeout(this._fallbackTimer);
  },

  onShareAppMessage() {
    const quote = this.data.quote;
    if (!quote) return { title: '一句毛选', path: '/pages/index/index' };
    return {
      title: `${quote.content}｜${quote.source}`,
      path: `/pages/detail/detail?id=${quote.id}&from=share`,
      imageUrl: '',
    };
  },

  onShareTimeline() {
    const quote = this.data.quote;
    if (!quote) return { title: '一句毛选', query: '' };
    return {
      title: `${quote.content}｜${quote.source}`,
      query: `id=${quote.id}&from=share`,
      imageUrl: '',
    };
  },

  loadQuote(id) {
    const quote = quoteService.getQuoteByIdWithStats(id);
    if (!quote) {
      wx.showToast({ title: '金句不存在', icon: 'none' });
      this._fallbackTimer = setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }, 1500);
      return;
    }
    this.setData({
      quote,
      liked: userService.isLiked(id),
      favorited: userService.isFavorite(id),
    });
  },

  refreshInteractionState(quoteId) {
    this.setData({
      liked: userService.isLiked(quoteId),
      favorited: userService.isFavorite(quoteId),
    });
  },

  onLike() {
    const quote = this.data.quote;
    if (!quote) return;
    const result = userService.likeQuote(quote.id);
    if (result.success) {
      const stat = quoteService.incrementLike(quote.id);
      this.setData({
        liked: true,
        'quote.stat': stat,
      });
      showToast('点赞成功', 'success');
    } else if (result.reason === 'already_liked') {
      showToast(result.message);
    }
  },

  onFavorite() {
    const quote = this.data.quote;
    if (!quote) return;
    if (!userService.isLogin()) {
      this.setData({ showLoginModal: true });
      return;
    }
    this.doFavorite(quote.id);
  },

  doFavorite(quoteId) {
    const result = userService.toggleFavorite(quoteId);
    if (result.success) {
      this.setData({ favorited: userService.isFavorite(quoteId) });
      showToast(result.message || '操作成功', result.reason === 'favorited' ? 'success' : 'none');
    } else if (result.reason === 'limit_reached') {
      showToast(result.message);
    }
  },

  onShare() {
    if (!this.data.quote) return;
    this.setData({ showSharePoster: true });
  },

  onLoginSuccess(e) {
    const userInfo = e.detail.userInfo;
    userService.login(userInfo);
    this.setData({ showLoginModal: false });
    showToast('登录成功', 'success');
    if (this.data.quote) {
      this.doFavorite(this.data.quote.id);
    }
  },

  onLoginFail() {
    this.setData({ showLoginModal: false });
    showToast('授权后可收藏金句哦~');
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false });
  },

  onCloseSharePoster() {
    this.setData({ showSharePoster: false });
  },

  onPosterShare(e) {
    const path = e.detail.path;
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path,
        success: () => {
          this.setData({ showSharePoster: false });
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('cancel')) return;
          showToast('分享失败');
        },
      });
    } else {
      showToast('请保存后手动分享');
    }
  },
});
