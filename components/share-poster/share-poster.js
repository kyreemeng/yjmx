const { showToast } = require('../../utils/util');

function getDpr() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
  } catch (e) {}
  return 2;
}

Component({
  options: { addGlobalClass: true },

  properties: {
    visible: { type: Boolean, value: false },
    quote: { type: Object, value: null },
  },

  data: {
    generating: false,
    tempImagePath: '',
    generated: false,
    previewScale: 0.72,
    previewWidth: 403,
    previewHeight: 717,
  },

  observers: {
    'visible, quote': function (visible, quote) {
      if (visible && quote && !this.data.generated && !this.data.generating) {
        this.initCanvas();
      }
    },
  },

  lifetimes: {
    ready() {
      if (this.data.visible && this.data.quote && !this.data.generated && !this.data.generating) {
        setTimeout(() => this.initCanvas(), 80);
      }
    },
  },

  methods: {
    initCanvas() {
      if (this.data.generating) return;
      this.updatePreviewSize();
      this.setData({ generating: true });
      const query = wx.createSelectorQuery().in(this);
      query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          this.setData({ generating: false });
          setTimeout(() => this.initCanvas(), 120);
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = getDpr();
        const W = 750;
        const H = 1334;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
        this.canvas = canvas;
        this.ctx = ctx;
        this.drawPoster(W, H);
      });
    },

    updatePreviewSize() {
      let windowWidth = 375;
      let windowHeight = 667;
      try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        windowWidth = info.windowWidth || windowWidth;
        windowHeight = info.windowHeight || windowHeight;
      } catch (e) {}

      const rpxPerPx = 750 / windowWidth;
      const viewportHeight = windowHeight * rpxPerPx;
      const chromeHeight = 330;
      const availableCanvasHeight = Math.max(480, viewportHeight * 0.94 - chromeHeight);
      const scale = Math.min(1, availableCanvasHeight / 996);

      this.setData({
        previewScale: Number(scale.toFixed(3)),
        previewWidth: Math.round(560 * scale),
        previewHeight: Math.round(996 * scale),
      });
    },

    drawPoster(W, H) {
      const ctx = this.ctx;
      const quote = this.data.quote || {};

      // 背景渐变
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#FFF8F0');
      grad.addColorStop(1, '#F5EDE3');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 装饰引号
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#D4A853';
      ctx.font = 'bold 200px serif';
      ctx.textBaseline = 'top';
      ctx.fillText('"', 30, 40);
      ctx.restore();

      // 金句正文
      ctx.fillStyle = '#2C1810';
      ctx.font = 'bold 48px serif';
      ctx.textBaseline = 'top';
      const lineHeight = 76;
      const startX = 60;
      const startY = 210;
      const maxWidth = W - startX * 2;
      const lines = this.wrapText(ctx, quote.content || '', maxWidth);
      let y = startY;
      for (const line of lines) {
        ctx.fillText(line, startX, y);
        y += lineHeight;
      }

      // 出处
      ctx.fillStyle = '#8B7355';
      ctx.font = '28px serif';
      ctx.textAlign = 'right';
      const sourceLines = this.wrapText(ctx, quote.source || '《毛泽东选集》', W - 120).slice(0, 2);
      sourceLines.forEach((line, index) => {
        ctx.fillText(line, W - 60, y + 40 + index * 42);
      });
      ctx.textAlign = 'left';

      // 品牌区
      ctx.fillStyle = '#2C1810';
      ctx.font = 'bold 40px serif';
      ctx.fillText('一句毛选', 60, H - 150);
      ctx.fillStyle = '#8B7355';
      ctx.font = '26px serif';
      ctx.fillText('每日一句  汲取思想力量', 60, H - 100);

      // 未接入服务端小程序码前，明确展示进入方式，不绘制误导性的伪二维码
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8B7355';
      ctx.font = '24px sans-serif';
      ctx.fillText('微信内搜索', W - 60, H - 132);
      ctx.fillStyle = '#C41E1E';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('一句毛选', W - 60, H - 92);
      ctx.textAlign = 'left';

      // 导出
      this.exportImage(W, H);
    },

    exportImage(W, H) {
      wx.canvasToTempFilePath({
        canvas: this.canvas,
        destWidth: W,
        destHeight: H,
        fileType: 'png',
        quality: 1,
        success: (res) => {
          this.setData({ generating: false, generated: true, tempImagePath: res.tempFilePath });
          this.triggerEvent('generated', { path: res.tempFilePath });
        },
        fail: (err) => {
          this.setData({ generating: false });
          console.error('生成卡片失败', err);
          showToast('卡片生成失败，请重试');
        },
      }, this);
    },

    wrapText(ctx, text, maxWidth) {
      const lines = [];
      let line = '';
      const chars = String(text).split('');
      for (const char of chars) {
        const test = line + char;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = char;
        } else {
          line = test;
        }
        if (lines.length >= 12) break;
      }
      if (line && lines.length < 12) lines.push(line);
      return lines;
    },

    onSave() {
      if (!this.data.tempImagePath) {
        showToast('请等待卡片生成');
        return;
      }
      this.savePosterImage();
    },

    savePosterImage() {
      wx.saveImageToPhotosAlbum({
        filePath: this.data.tempImagePath,
        success: () => showToast('已保存到相册', 'success'),
        fail: (err) => {
          this.handleSaveFailure(err);
        },
      });
    },

    handleSaveFailure(err) {
      const message = (err && err.errMsg) || '';
      if (!/(auth|authorize|permission|deny)/i.test(message)) {
        showToast('保存失败，请重试');
        return;
      }

      wx.authorize({
        scope: 'scope.writePhotosAlbum',
        success: () => this.savePosterImage(),
        fail: () => {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许“保存到相册”后重试',
            success: (res) => {
              if (res.confirm) wx.openSetting();
            },
          });
        },
      });
    },

    onShare() {
      if (!this.data.tempImagePath) {
        showToast('请等待卡片生成');
        return;
      }
      this.triggerEvent('share', { path: this.data.tempImagePath });
    },

    onClose() {
      this.triggerEvent('close');
    },

    preventBubble() {},
  },
});
