const quoteService = require('../../services/quote-service');
const reactionService = require('../../services/reaction-service');
const analytics = require('../../services/analytics-service');
const { toggleInteraction } = require('../../services/interaction-actions');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');
const { getRarity } = require('../../utils/rarity');
const { getChinaDateKey } = require('../../utils/daily');
const {
  buildShareAppMessage,
  buildShareTimeline,
  captureShareEntry,
  decodeQuoteScene,
} = require('../../utils/share');

Page({
  data: {
    quote: null,
    loading: false,
    liked: false,
    favorited: false,
    showSharePoster: false,
    shareCoverPath: '',
    // 分享封面：5:4 好友 + 1:1 朋友圈（share-cover 自动生成）
    shareCoverAppPath: '',
    shareCoverTimelinePath: '',
    // 盲盒状态: idle | opening | revealed
    drawState: 'idle',
    boxShaking: false,
    // 稀有度
    rarityLabel: '',
    rarityClass: '',
    // 操作栏动画
    animating: false,
    lastAction: '',
    dailyMode: true,
    streakCount: 0,
    collectionProgress: { collected: 0, total: 0, percent: 0 },
    loadError: false,
  },

  async onLoad(options = {}) {
    if (options.id || options.qid || options.from || options.scene) {
      captureShareEntry(options, getApp().globalData.launchOptions);
    }
    const sceneId = decodeQuoteScene(options.scene);
    const sharedId = Number(options.id || options.qid || sceneId);
    if (sceneId) analytics.track('qr_scan', { targetId: sceneId });
    this.loadUserSummary();
    if (sharedId) {
      await this.loadSharedQuote(sharedId);
      return;
    }
    await this.loadDailyQuote(() => {
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
    // 分享卡片打开时禁止下拉刷新（原生下拉不受 catchtouchmove 拦截）
    if (this._blockPullDownRefresh || this.data.showSharePoster) {
      wx.stopPullDownRefresh();
      return;
    }
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
    if (this.data.quote) analytics.track('share', { targetId: this.data.quote.id, scene: 'appmessage' });
    return buildShareAppMessage(this.data.quote, {
      from: 'share',
      scene: 'appmessage',
      imageUrl: this.data.shareCoverAppPath || this.data.shareCoverPath || '',
    });
  },

  onShareTimeline() {
    if (this.data.quote) analytics.track('share', { targetId: this.data.quote.id, scene: 'timeline' });
    return buildShareTimeline(this.data.quote, {
      from: 'share',
      scene: 'timeline',
      imageUrl: this.data.shareCoverTimelinePath || this.data.shareCoverPath || '',
    });
  },

  async loadSharedQuote(id) {
    if (!id) return false;
    this.setData({ loading: true, loadError: false, dailyMode: false });
    let quote;
    try {
      quote = await quoteService.getQuoteByIdWithStats(id);
    } catch (err) {
      this.setData({ loading: false, loadError: true });
      return false;
    }
    if (!quote) {
      this.setData({ loading: false, loadError: true });
      return false;
    }
    await quoteService.recordViewedQuote(quote.id);
    const rarity = getRarity(quote.id);
    try {
      const [favMap, likeMap, likeCounts] = await Promise.all([
      reactionService.batchStatus('favorite', [id]),
      reactionService.batchStatus('like', [id]),
      reactionService.getLikeCounts([id]),
      ]);
      this.setData({
        quote: {
          ...quote,
          stat: { ...(quote.stat || {}), total: likeCounts[id] || 0 },
        },
        loading: false,
        drawState: 'revealed',
        liked: !!likeMap[id],
        favorited: !!favMap[id],
        rarityLabel: rarity.label,
        rarityClass: rarity.className || `rarity-${rarity.key}`,
        loadError: false,
      });
    } catch (err) {
      this.setData({
        quote,
        loading: false,
        drawState: 'revealed',
        rarityLabel: rarity.label,
        rarityClass: rarity.className || `rarity-${rarity.key}`,
        loadError: false,
      });
    }
    analytics.track('quote_view', { targetId: quote.id, source: 'entry' });
    return true;
  },

  async loadDailyQuote(callback) {
    if (this.data.loading) return;
    this.setData({ loading: true, loadError: false, dailyMode: true });
    try {
      await quoteService.loadQuotes(false);
      const quote = await quoteService.getDailyQuote(getChinaDateKey());
      await this.applyQuote(quote, callback);
      analytics.track('daily_show', { targetId: quote.id, date: getChinaDateKey() });
    } catch (err) {
      this.setData({ loading: false, loadError: true });
      if (callback) callback();
    }
  },

  async applyQuote(quote, callback) {
    if (!quote) throw new Error('暂无可展示金句');
    await quoteService.recordViewedQuote(quote.id);
    const rarity = getRarity(quote.id);
    let favMap = {};
    let likeMap = {};
    let likeCounts = {};
    try {
      [favMap, likeMap, likeCounts] = await Promise.all([
        reactionService.batchStatus('favorite', [quote.id]),
        reactionService.batchStatus('like', [quote.id]),
        reactionService.getLikeCounts([quote.id]),
      ]);
    } catch (err) {}
    this.setData({
      quote: { ...quote, stat: { ...(quote.stat || {}), total: likeCounts[quote.id] || 0 } },
      loading: false,
      liked: !!likeMap[quote.id],
      favorited: !!favMap[quote.id],
      rarityLabel: rarity.label,
      rarityClass: rarity.className || `rarity-${rarity.key}`,
      loadError: false,
    }, callback);
  },

  async loadRandomQuote(callback) {
    if (this.data.loading) {
      if (callback) callback();
      return;
    }
    this.setData({ loading: true });

    try {
      const viewed = await quoteService.getViewedQuotes();
      const quote = await quoteService.getRandomQuote(viewed);
      this.setData({ dailyMode: false });
      await this.applyQuote(quote, callback);
    } catch (err) {
      this.setData({ loading: false, loadError: true });
      if (callback) callback();
    }
  },

  async loadUserSummary() {
    try {
      const [streak, progress] = await Promise.all([
        quoteService.updateVisitStreak(),
        quoteService.getCollectionProgress(),
      ]);
      const streakCount = Number(streak && (streak.count || streak.days || streak)) || 0;
      const normalizedProgress = progress ? {
        ...progress,
        collected: Number(progress.collected != null ? progress.collected : (progress.seen || progress.seenCount)) || 0,
      } : this.data.collectionProgress;
      this.setData({ streakCount, collectionProgress: normalizedProgress });
      if (streak && streak.updated) {
        analytics.track('streak_update', { streak: streakCount, date: getChinaDateKey() });
      }
    } catch (err) {}
  },

  onRetry() {
    this.setData({ drawState: 'idle', loadError: false });
    this.loadDailyQuote(() => this.startDrawSequence());
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
      if (this.data.quote) {
        analytics.track('draw', { targetId: this.data.quote.id, daily: this.data.dailyMode });
      }
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

  // 与云端同步当前金句的收藏 / 点赞状态与全网赞数
  async syncInteractionState(quoteId) {
    const [favMap, likeMap, likeCounts] = await Promise.all([
      reactionService.batchStatus('favorite', [quoteId]),
      reactionService.batchStatus('like', [quoteId]),
      reactionService.getLikeCounts([quoteId]),
    ]);
    const patch = {
      favorited: !!favMap[quoteId],
      liked: !!likeMap[quoteId],
    };
    if (this.data.quote && this.data.quote.id === quoteId) {
      patch['quote.stat.total'] = likeCounts[quoteId] || 0;
    }
    this.setData(patch);
  },

  onLike() {
    const quote = this.data.quote;
    if (!quote) return;
    return runReaction.call(this, async () => {
      this.setData({ animating: true, lastAction: 'like' });
      setTimeout(() => this.setData({ animating: false }), 200);
      const status = await toggleInteraction(this, {
        type: 'like',
        targetId: quote.id,
        statusPath: 'liked',
        countPath: 'quote.stat.total',
        event: 'like',
      });
      wx.showToast({ title: status ? '点赞成功' : '已取消点赞', icon: status ? 'success' : 'none' });
    });
  },

  // 收藏：云函数经 openid 识别；乐观更新
  onFavorite() {
    const quote = this.data.quote;
    if (!quote) return;
    return runReaction.call(this, async () => {
      this.setData({ animating: true, lastAction: 'favorite' });
      setTimeout(() => this.setData({ animating: false }), 200);
      const status = await toggleInteraction(this, {
        type: 'favorite',
        targetId: quote.id,
        statusPath: 'favorited',
        event: 'favorite',
      });
      wx.showToast({ title: status ? '已收藏' : '已取消收藏', icon: status ? 'success' : 'none' });
    });
  },

  onPoster() {
    const quote = this.data.quote;
    if (!quote) return;
    this.setData({
      showSharePoster: true,
      animating: true,
      lastAction: 'poster',
    });
    analytics.track('share', { targetId: quote.id, scene: 'poster' });
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
    this._blockPullDownRefresh = false;
    this.setData({ showSharePoster: false });
  },

  onPosterGenerated(e) {
    const path = e.detail && e.detail.path;
    if (path) {
      this.setData({ shareCoverPath: path });
    }
  },

  // share-cover 自动生成完成：分别存储 5:4 与 1:1 封面路径
  onCoverReady(e) {
    const { appMessagePath, timelinePath } = e.detail || {};
    this.setData({
      shareCoverAppPath: appMessagePath || '',
      shareCoverTimelinePath: timelinePath || '',
    });
  },

  onPosterShare(e) {
    const path = e.detail.path;
    if (path) {
      this.setData({ shareCoverPath: path });
    }
    if (wx.showShareImageMenu) {
      wx.showShareImageMenu({
        path,
        success: () => {
          analytics.track('share', { targetId: this.data.quote && this.data.quote.id, scene: 'image' });
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
