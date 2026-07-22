const quoteService = require('../../services/quote-service');
const userService = require('../../services/user-service');
const reactionService = require('../../services/reaction-service');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');

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
    showSharePoster: false,
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
      this.syncInteractionState(this.data.quote.id);
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
    Promise.all([
      reactionService.batchStatus('favorite', [id]),
      reactionService.batchStatus('like', [id]),
    ]).then(([favMap, likeMap]) => {
      if (!this.data.quote || this.data.quote.id !== id) return;
      this.setData({
        quote,
        loading: false,
        drawState: 'revealed',
        liked: !!likeMap[id],
        favorited: !!favMap[id],
        rarityLabel: rarity.label,
        rarityClass: rarity.class,
      });
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

    const rarity = getRarity(quote.id);
    this._loadTimer = setTimeout(async () => {
      const [favMap, likeMap] = await Promise.all([
        reactionService.batchStatus('favorite', [quote.id]),
        reactionService.batchStatus('like', [quote.id]),
      ]);
      this.setData({
        quote,
        loading: false,
        liked: !!likeMap[quote.id],
        favorited: !!favMap[quote.id],
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

  // 与云端同步当前金句的收藏 / 点赞状态（onShow 复用，保证多页面切换后状态一致）
  async syncInteractionState(quoteId) {
    const [favMap, likeMap] = await Promise.all([
      reactionService.batchStatus('favorite', [quoteId]),
      reactionService.batchStatus('like', [quoteId]),
    ]);
    this.setData({
      favorited: !!favMap[quoteId],
      liked: !!likeMap[quoteId],
    });
  },

  onLike() {
    const quote = this.data.quote;
    if (!quote) return;
    return runReaction.call(this, async () => {
      const before = this.data.liked;
      const status = await reactionService.toggle('like', quote.id);
      this.setData({ liked: status, animating: true, lastAction: 'like' });
      setTimeout(() => this.setData({ animating: false }), 200);
      // 点赞热度统计（本地趋势指标）：变为已赞时 +1
      if (status && !before) {
        const stat = quoteService.incrementLike(quote.id);
        this.setData({ 'quote.stat': stat });
      }
      wx.showToast({ title: status ? '点赞成功' : '已取消点赞', icon: status ? 'success' : 'none' });
    });
  },

  // 收藏不再依赖自定义登录：云函数经 openid 自动识别用户身份
  onFavorite() {
    const quote = this.data.quote;
    if (!quote) return;
    return runReaction.call(this, async () => {
      const status = await reactionService.toggle('favorite', quote.id);
      this.setData({ favorited: status, animating: true, lastAction: 'favorite' });
      setTimeout(() => this.setData({ animating: false }), 200);
      wx.showToast({ title: status ? '已收藏' : '已取消收藏', icon: status ? 'success' : 'none' });
    });
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
