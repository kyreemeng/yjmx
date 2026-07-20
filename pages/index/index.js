const quoteService = require('../../services/quote-service');
const userService = require('../../services/user-service');
const { showToast, showLoading, hideLoading } = require('../../utils/util');

Page({
  data: {
    quote: null,
    loading: false,
    liked: false,
    favorited: false,
    showLoginModal: false,
    showSharePoster: false,
    pendingAction: null,
  },

  onLoad(options = {}) {
    if (options.id && this.loadSharedQuote(Number(options.id))) {
      return;
    }
    this.loadRandomQuote();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    if (this.data.quote) {
      this.refreshInteractionState(this.data.quote.id);
    }
  },

  onPullDownRefresh() {
    this.loadRandomQuote(() => {
      wx.stopPullDownRefresh();
    });
  },

  onUnload() {
    if (this._loadTimer) clearTimeout(this._loadTimer);
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

  loadSharedQuote(id) {
    if (!id) return false;
    const quote = quoteService.getQuoteByIdWithStats(id);
    if (!quote) return false;
    quoteService.recordViewedQuote(quote.id);
    this.setData({
      quote,
      loading: false,
      liked: userService.isLiked(quote.id),
      favorited: userService.isFavorite(quote.id),
    });
    return true;
  },

  loadRandomQuote(callback) {
    if (this.data.loading) {
      if (callback) callback();
      return;
    }
    this.setData({ loading: true });

    const viewed = quoteService.getViewedQuotes();
    const quote = quoteService.getRandomQuote(viewed);
    quoteService.recordViewedQuote(quote.id);

    this._loadTimer = setTimeout(() => {
      this.setData({
        quote,
        loading: false,
        liked: userService.isLiked(quote.id),
        favorited: userService.isFavorite(quote.id),
      }, () => {
        this._loadTimer = null;
        if (callback) callback();
      });
    }, 200);
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
      this.setData({ showLoginModal: true, pendingAction: 'favorite' });
      return;
    }

    this.doFavorite(quote.id);
  },

  doFavorite(quoteId) {
    const result = userService.toggleFavorite(quoteId);
    if (result.success) {
      this.setData({ favorited: userService.isFavorite(quoteId) });
      showToast(result.message || '操作成功', result.reason === 'favorited' ? 'success' : 'none');
    } else if (result.reason === 'need_login') {
      this.setData({ showLoginModal: true, pendingAction: 'favorite' });
    } else if (result.reason === 'limit_reached') {
      showToast(result.message);
    }
  },

  onShare() {
    const quote = this.data.quote;
    if (!quote) return;
    this.setData({ showSharePoster: true });
  },

  onRefresh() {
    this.loadRandomQuote();
  },

  onTapCard(e) {
    const quote = e.detail.quote;
    if (!quote) return;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${quote.id}&from=home`,
    });
  },

  onLoginSuccess(e) {
    const userInfo = e.detail.userInfo;
    userService.login(userInfo);
    this.setData({ showLoginModal: false });
    showToast('登录成功', 'success');

    if (this.data.pendingAction === 'favorite' && this.data.quote) {
      this.doFavorite(this.data.quote.id);
    }
    this.setData({ pendingAction: null });
  },

  onLoginFail() {
    this.setData({ showLoginModal: false, pendingAction: null });
    showToast('授权后可收藏金句哦~');
  },

  onCloseLoginModal() {
    this.setData({ showLoginModal: false, pendingAction: null });
  },

  onCloseSharePoster() {
    this.setData({ showSharePoster: false });
  },

  onPosterGenerated(e) {
    console.log('海报生成', e.detail.path);
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
