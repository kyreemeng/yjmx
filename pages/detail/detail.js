const quoteService = require('../../services/quote-service');
const reactionService = require('../../services/reaction-service');
const analytics = require('../../services/analytics-service');
const { toggleInteraction } = require('../../services/interaction-actions');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');
const {
  buildShareAppMessage,
  buildShareTimeline,
  captureShareEntry,
  decodeQuoteScene,
} = require('../../utils/share');

const FROM_LABELS = {
  home: '首页',
  rank: '排行',
  favorites: '我的收藏',
  likes: '点赞记录',
  share: '好友分享',
  timeline: '朋友圈',
  appmessage: '好友卡片',
};

Page({
  data: {
    quote: null,
    liked: false,
    favorited: false,
    showSharePoster: false,
    shareCoverPath: '',
    // 分享封面：5:4 好友 + 1:1 朋友圈（share-cover 自动生成）
    shareCoverAppPath: '',
    shareCoverTimelinePath: '',
    from: '',
    notFound: false,
    loading: false,
    loadError: false,
  },

  onLoad(options) {
    const entry = captureShareEntry(options || {}, getApp().globalData.launchOptions);
    const fromKey = options.from || options.scene || '';
    this.setData({ from: FROM_LABELS[fromKey] || '金句详情' });
    const sceneId = decodeQuoteScene(options.scene);
    const id = Number(options.id || options.qid || sceneId || (entry && entry.qid));
    if (sceneId) analytics.track('qr_scan', { targetId: sceneId });
    if (!id) {
      // 首页是 tabBar 页面，必须用 reLaunch/switchTab，不能用 redirectTo
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    this.loadQuote(id);
  },

  onShow() {
    if (this.data.quote) {
      this.syncInteractionState(this.data.quote.id);
    }
  },

  onUnload() {
    // 无遗留定时器
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

  async loadQuote(id) {
    this._quoteId = id;
    this.setData({ loading: true, loadError: false, notFound: false });
    let quote;
    try {
      quote = await quoteService.getQuoteByIdWithStats(id);
    } catch (err) {
      this.setData({ loading: false, loadError: true });
      return;
    }
    if (!quote) {
      // 金句不存在：直接展示空状态，不再白屏等待跳转
      this.setData({ notFound: true, loading: false });
      return;
    }

    // 先立即展示内容，再异步同步点赞/收藏状态与全网赞数，避免等待网络出现空白
    this.setData({ quote, notFound: false, loading: false });
    Promise.resolve(quoteService.recordViewedQuote(id)).catch(() => {});
    analytics.track('quote_view', { targetId: id, source: 'detail' });

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
        liked: !!likeMap[id],
        favorited: !!favMap[id],
      });
    } catch (err) {}
  },

  // 与云端同步状态，保证从其它页面返回后界面与云端一致
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
      const status = await toggleInteraction(this, {
        type: 'like',
        targetId: quote.id,
        statusPath: 'liked',
        countPath: 'quote.stat.total',
        event: 'like',
        analyticsData: { source: 'detail' },
      });
      wx.showToast({ title: status ? '点赞成功' : '已取消点赞', icon: status ? 'success' : 'none' });
    });
  },

  onFavorite() {
    const quote = this.data.quote;
    if (!quote) return;
    return runReaction.call(this, async () => {
      const status = await toggleInteraction(this, {
        type: 'favorite',
        targetId: quote.id,
        statusPath: 'favorited',
        event: 'favorite',
        analyticsData: { source: 'detail' },
      });
      wx.showToast({ title: status ? '已收藏' : '已取消收藏', icon: status ? 'success' : 'none' });
    });
  },

  onPoster() {
    if (!this.data.quote) return;
    this.setData({ showSharePoster: true });
    analytics.track('share', { targetId: this.data.quote.id, scene: 'poster' });
  },

  onCloseSharePoster() {
    this.setData({ showSharePoster: false });
  },

  onGoHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  onRetry() {
    if (this._quoteId) this.loadQuote(this._quoteId);
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
