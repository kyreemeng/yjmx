const quoteService = require('../../services/quote-service');
const reactionService = require('../../services/reaction-service');
const { showToast } = require('../../utils/util');
const { runReaction } = require('../../utils/interaction');

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
      this.syncInteractionState(this.data.quote.id);
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

  async loadQuote(id) {
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

    // 先展示内容，再与云端同步收藏 / 点赞状态
    const [favMap, likeMap] = await Promise.all([
      reactionService.batchStatus('favorite', [id]),
      reactionService.batchStatus('like', [id]),
    ]);
    this.setData({
      quote,
      liked: !!likeMap[id],
      favorited: !!favMap[id],
    });
  },

  // 与云端同步状态，保证从其它页面返回后界面与云端一致
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
      this.setData({ liked: status });
      if (status && !before) {
        const stat = quoteService.incrementLike(quote.id);
        this.setData({ 'quote.stat': stat });
      }
      wx.showToast({ title: status ? '点赞成功' : '已取消点赞', icon: status ? 'success' : 'none' });
    });
  },

  onFavorite() {
    const quote = this.data.quote;
    if (!quote) return;
    return runReaction.call(this, async () => {
      const status = await reactionService.toggle('favorite', quote.id);
      this.setData({ favorited: status });
      wx.showToast({ title: status ? '已收藏' : '已取消收藏', icon: status ? 'success' : 'none' });
    });
  },

  onShare() {
    if (!this.data.quote) return;
    this.setData({ showSharePoster: true });
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
