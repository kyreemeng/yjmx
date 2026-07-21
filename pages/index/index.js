const quoteService = require('../../services/quote-service');
const userService = require('../../services/user-service');
const { showToast, showLoading, hideLoading } = require('../../utils/util');

// 稀有度配置（基于金句ID取模，营造抽卡稀有度差异）
const RARITY_CONFIG = {
  legendary: { label: '传世', class: 'rarity-legendary', threshold: 5 },   // ~5%
  epic:      { label: '精粹', class: 'rarity-epic',      threshold: 20 },   // ~15%
  rare:      { label: '佳句', class: 'rarity-rare',      threshold: 50 },   // ~30%
  common:    { label: '摘录', class: 'rarity-common',    threshold: 100 },  // ~50%
};

function getRarity(quoteId) {
  const roll = (quoteId * 7 + 3) % 100;
  if (roll < RARITY_CONFIG.legendary.threshold) return RARITY_CONFIG.legendary;
  if (roll < RARITY_CONFIG.epic.threshold) return RARITY_CONFIG.epic;
  if (roll < RARITY_CONFIG.rare.threshold) return RARITY_CONFIG.rare;
  return RARITY_CONFIG.common;
}

Page({
  data: {
    quote: null,
    loading: false,
    liked: false,
    favorited: false,
    showLoginModal: false,
    showSharePoster: false,
    pendingAction: null,
    // 盲盒状态: idle | opening | revealed
    drawState: 'idle',
    boxShaking: false,
    // 稀有度
    rarityLabel: '',
    rarityClass: '',
    // 操作栏动画
    animating: false,
    lastAction: '',
  },

  onLoad(options = {}) {
    if (options.id && this.loadSharedQuote(Number(options.id))) {
      return;
    }
    // 每次打开默认自动拆一张卡，无需手动点击
    this.loadRandomQuote(() => {
      this.startDrawSequence();
    });
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
    this.setData({ drawState: 'idle' });
    this.loadRandomQuote(() => {
      this.startDrawSequence();
      wx.stopPullDownRefresh();
    });
  },

  onUnload() {
    this._clearAllTimers();
  },

  _clearAllTimers() {
    if (this._loadTimer) { clearTimeout(this._loadTimer); this._loadTimer = null; }
    if (this._shakeTimer) { clearTimeout(this._shakeTimer); this._shakeTimer = null; }
    if (this._openTimer) { clearTimeout(this._openTimer); this._openTimer = null; }
    if (this._revealTimer) { clearTimeout(this._revealTimer); this._revealTimer = null; }
    if (this._hapticTimer) { clearTimeout(this._hapticTimer); this._hapticTimer = null; }
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
    const rarity = getRarity(quote.id);
    this.setData({
      quote,
      loading: false,
      drawState: 'revealed',
      liked: userService.isLiked(quote.id),
      favorited: userService.isFavorite(quote.id),
      rarityLabel: rarity.label,
      rarityClass: rarity.class,
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
      const rarity = getRarity(quote.id);
      this.setData({
        quote,
        loading: false,
        liked: userService.isLiked(quote.id),
        favorited: userService.isFavorite(quote.id),
        rarityLabel: rarity.label,
        rarityClass: rarity.class,
      }, () => {
        this._loadTimer = null;
        if (callback) callback();
      });
    }, 200);
  },

  // 盲盒拆开交互（手动点击）
  onOpenBox() {
    this.startDrawSequence();
  },

  // 拆盒动画序列：摇晃 → 开盖 → 卡牌翻转展示
  startDrawSequence() {
    if (this.data.drawState !== 'idle') return;
    if (this.data.loading && !this.data.quote) return;
    if (!this.data.quote) return;

    this._triggerHaptic('light');
    this.setData({ boxShaking: true, drawState: 'opening' });

    this._shakeTimer = setTimeout(() => {
      this.setData({ boxShaking: false });
    }, 500);

    this._hapticTimer = setTimeout(() => {
      this._triggerHaptic('medium');
    }, 500);

    this._revealTimer = setTimeout(() => {
      this.setData({ drawState: 'revealed' });
      this._triggerHaptic('heavy');
    }, 1000);
  },

  _triggerHaptic(type) {
    if (!wx.vibrateShort) return;
    try {
      wx.vibrateShort({ type: type === 'heavy' ? 'heavy' : type === 'medium' ? 'medium' : 'light' });
    } catch (err) {
      // 降级：部分设备不支持 type 参数
      try { wx.vibrateShort(); } catch (e) {}
    }
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
        animating: true,
        lastAction: 'like',
        'quote.stat': stat,
      });
      showToast('点赞成功', 'success');
      setTimeout(() => this.setData({ animating: false }), 200);
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
      this.setData({
        favorited: userService.isFavorite(quoteId),
        animating: true,
        lastAction: 'favorite',
      });
      showToast(result.message || '操作成功', result.reason === 'favorited' ? 'success' : 'none');
      setTimeout(() => this.setData({ animating: false }), 200);
    } else if (result.reason === 'need_login') {
      this.setData({ showLoginModal: true, pendingAction: 'favorite' });
    } else if (result.reason === 'limit_reached') {
      showToast(result.message);
    }
  },

  onShare() {
    const quote = this.data.quote;
    if (!quote) return;
    this.setData({
      showSharePoster: true,
      animating: true,
      lastAction: 'share',
    });
    setTimeout(() => this.setData({ animating: false }), 200);
  },

  onRefresh() {
    if (this.data.loading) return;
    this.setData({
      animating: true,
      lastAction: 'refresh',
      drawState: 'idle',
    });

    setTimeout(() => {
      this.setData({ animating: false });
      this.loadRandomQuote(() => {
        this.startDrawSequence();
      });
    }, 200);
  },

  onTapCard() {
    const quote = this.data.quote;
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
