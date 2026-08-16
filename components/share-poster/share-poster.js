const { showToast } = require('../../utils/util');
const analytics = require('../../services/analytics-service');

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
    quoteId: { type: Number, value: 0 },
    qrcodeFileId: { type: String, value: '' },
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
      this.lockPageScroll(!!visible);
      if (visible && quote && !this.data.generated && !this.data.generating) {
        this.initCanvas();
      }
    },
  },

  lifetimes: {
    ready() {
      if (this.data.visible) {
        this.lockPageScroll(true);
      }
      if (this.data.visible && this.data.quote && !this.data.generated && !this.data.generating) {
        setTimeout(() => this.initCanvas(), 80);
      }
    },
    detached() {
      this.lockPageScroll(false);
    },
  },

  methods: {
    onPreventMove() {},

    lockPageScroll(lock) {
      const locked = !!lock;
      try {
        if (typeof wx.setPageStyle === 'function') {
          wx.setPageStyle({ style: { overflow: locked ? 'hidden' : 'auto' } });
        }
      } catch (err) {}

      try {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        if (page) {
          page._blockPullDownRefresh = locked;
        }
        if (locked && typeof wx.stopPullDownRefresh === 'function') {
          wx.stopPullDownRefresh();
        }
      } catch (err) {}

      this.triggerEvent('lockchange', { locked });
    },

    async initCanvas() {
      if (this.data.generating) return;
      this.setData({ generating: true });
      await this.prepareQrcode();
      // 先确定预览尺寸，等渲染应用后再查询节点，避免读到旧布局
      this.updatePreviewSize(() => {
        this.queryAndDraw();
      });
    },

    async prepareQrcode() {
      this._qrcodePath = '';
      const quoteId = Number(this.data.quoteId || (this.data.quote && this.data.quote.id));
      if (!quoteId) return;
      try {
        let fileId = this.data.qrcodeFileId;
        let directPath = '';
        if (!fileId && wx.cloud && wx.cloud.callFunction) {
          let envVersion = 'release';
          try {
            const account = wx.getAccountInfoSync && wx.getAccountInfoSync();
            envVersion = (account && account.miniProgram && account.miniProgram.envVersion) || envVersion;
          } catch (err) {}
          const response = await wx.cloud.callFunction({
            name: 'qrcode',
            data: { targetId: quoteId, envVersion },
          });
          const result = (response && response.result) || {};
          fileId = result.fileId || result.fileID || result.qrcodeFileId || '';
          directPath = result.tempFilePath || '';
        }
        if (!directPath && fileId && wx.cloud && wx.cloud.downloadFile) {
          const downloaded = await wx.cloud.downloadFile({ fileID: fileId });
          directPath = downloaded.tempFilePath;
        }
        if (!directPath) return;
        const imageInfo = await new Promise((resolve, reject) => {
          wx.getImageInfo({ src: directPath, success: resolve, fail: reject });
        });
        this._qrcodePath = imageInfo.path || directPath;
      } catch (err) {
        this._qrcodePath = '';
        console.warn('小程序码加载失败，使用搜索引导', err);
      }
    },

    queryAndDraw() {
      const query = wx.createSelectorQuery().in(this);
      query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          this.setData({ generating: false });
          setTimeout(() => this.queryAndDraw(), 120);
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = getDpr();
        const W = 750;
        const H = 1334;

        // 以节点实测布局尺寸为准（兜底用 rpx 换算），保证物理像素与布局完全一致
        const fallbackPxW = (this.data.previewWidth / 750) * (this._windowWidth || 375);
        const fallbackPxH = (this.data.previewHeight / 750) * (this._windowWidth || 375);
        const layoutW = Math.max(1, res[0].width || fallbackPxW);
        const layoutH = Math.max(1, res[0].height || fallbackPxH);
        canvas.width = Math.max(1, Math.round(layoutW * dpr));
        canvas.height = Math.max(1, Math.round(layoutH * dpr));
        // 绘制坐标系仍按 750×1334 设计稿，等比映射到实际画布
        ctx.scale(canvas.width / W, canvas.height / H);

        this.canvas = canvas;
        this.ctx = ctx;
        this.loadCanvasQrcode(canvas, () => this.drawPoster(W, H));
      });
    },

    loadCanvasQrcode(canvas, callback) {
      this._qrcodeImage = null;
      if (!this._qrcodePath || !canvas.createImage) {
        callback();
        return;
      }
      const image = canvas.createImage();
      image.onload = () => {
        this._qrcodeImage = image;
        callback();
      };
      image.onerror = () => callback();
      image.src = this._qrcodePath;
    },

    updatePreviewSize(callback) {
      let windowWidth = 375;
      let windowHeight = 667;
      try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        windowWidth = info.windowWidth || windowWidth;
        windowHeight = info.windowHeight || windowHeight;
      } catch (e) {}

      this._windowWidth = windowWidth;
      const rpxPerPx = 750 / windowWidth;
      const viewportHeight = windowHeight * rpxPerPx;
      // 弹窗自身留白：标题 + 按钮组 + 关闭 + 内边距
      const chromeHeight = 340;
      const availableCanvasHeight = Math.max(420, viewportHeight * 0.86 - chromeHeight);
      const scale = Math.min(1, availableCanvasHeight / 996);

      this.setData({
        previewScale: Number(scale.toFixed(3)),
        previewWidth: Math.round(560 * scale),
        previewHeight: Math.round(996 * scale),
      }, callback);
    },

    roundRectPath(ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    },

    // iOS 液玻璃底色：aurora 多点径向渐变（与 app.wxss .aurora-bg 同源）
    drawAurora(ctx, W, H) {
      ctx.fillStyle = '#FBF9F6';
      ctx.fillRect(0, 0, W, H);
      const blobs = [
        [0.12, 0.06, 0.5, 'rgba(255, 178, 148, 0.45)'],
        [0.92, 0.05, 0.52, 'rgba(255, 210, 160, 0.38)'],
        [0.88, 0.86, 0.55, 'rgba(255, 196, 132, 0.4)'],
        [0.08, 0.92, 0.55, 'rgba(232, 180, 140, 0.32)'],
        [0.5, 0.46, 0.7, 'rgba(255, 226, 200, 0.32)'],
      ];
      blobs.forEach((item) => {
        const grad = ctx.createRadialGradient(W * item[0], H * item[1], 0, W * item[0], H * item[1], W * item[2]);
        grad.addColorStop(0, item[3]);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      });
      const wash = ctx.createLinearGradient(0, 0, 0, H);
      wash.addColorStop(0, 'rgba(251, 249, 246, 0.55)');
      wash.addColorStop(1, 'rgba(243, 236, 227, 0.45)');
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, W, H);
    },

    // 磨砂玻璃面板：半透明白渐变 + 白色发丝描边 + 顶部内高光 + 暖调投影
    drawGlassPanel(ctx, x, y, w, h, r, opts) {
      const o = opts || {};
      ctx.save();
      ctx.shadowColor = 'rgba(120, 90, 60, ' + (o.shadowAlpha || 0.18) + ')';
      ctx.shadowBlur = o.shadowBlur || 34;
      ctx.shadowOffsetY = o.shadowOffsetY || 16;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.56)');
      this.roundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      this.roundRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      this.roundRectPath(ctx, x, y, w, h, r);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + r, y + 2);
      ctx.lineTo(x + w - r, y + 2);
      ctx.stroke();
      ctx.restore();
    },

    drawPoster(W, H) {
      const ctx = this.ctx;
      const quote = this.data.quote || {};
      const content = quote.content || '每日一句';

      // 1. 液玻璃 aurora 底色
      this.drawAurora(ctx, W, H);

      // 2. 主玻璃金句卡（无顶部品牌条，给正文更多呼吸）
      const cardX = 48;
      const cardW = W - cardX * 2;
      const cardY = 100;
      const footerH = 150;
      const footerY = H - 90 - footerH;
      const cardMaxH = footerY - 40 - cardY;
      const padX = 56;
      const topPad = 176;
      const bottomPad = 178;
      let fontSize = 48;
      let lineHeight;
      let lines;
      for (;;) {
        ctx.font = 'bold ' + fontSize + 'px serif';
        lines = this.wrapText(ctx, content, cardW - padX * 2);
        lineHeight = Math.round(fontSize * 1.64);
        if (topPad + lines.length * lineHeight + bottomPad <= cardMaxH || fontSize <= 34) break;
        fontSize -= 6;
      }
      const maxLines = Math.max(1, Math.floor((cardMaxH - topPad - bottomPad) / lineHeight));
      if (lines.length > maxLines) lines = lines.slice(0, maxLines);
      const cardH = Math.max(700, Math.min(cardMaxH, topPad + lines.length * lineHeight + bottomPad));
      this.drawGlassPanel(ctx, cardX, cardY, cardW, cardH, 56, { shadowAlpha: 0.18, shadowBlur: 40, shadowOffsetY: 18 });

      // 金句正文（先确定 textY，再画装饰引号与正文）
      ctx.fillStyle = '#2A1E18';
      ctx.font = 'bold ' + fontSize + 'px serif';
      ctx.textBaseline = 'top';
      const textY = cardY + topPad;

      // 金色装饰引号 — 与首行顶部对齐，向左略缩进，融入正文区域
      ctx.save();
      ctx.globalAlpha = 0.17;
      ctx.fillStyle = '#C9943F';
      const quoteSize = Math.round(fontSize * 1.45);
      ctx.font = 'bold ' + quoteSize + 'px serif';
      ctx.textBaseline = 'top';
      ctx.fillText('“', cardX + Math.round(padX * 0.15), textY - Math.round(quoteSize * 0.06));
      ctx.restore();

      // 金句正文
      let y = textY;
      lines.forEach((line) => {
        ctx.fillText(line, cardX + padX, y);
        y += lineHeight;
      });

      // 分隔：金线 + 红印小方
      const divY = y + 44;
      const lineGrad = ctx.createLinearGradient(cardX + padX, 0, cardX + padX + 88, 0);
      lineGrad.addColorStop(0, '#D8AC5C');
      lineGrad.addColorStop(1, '#A5762C');
      this.roundRectPath(ctx, cardX + padX, divY, 88, 3, 2);
      ctx.fillStyle = lineGrad;
      ctx.fill();
      const sealGrad = ctx.createLinearGradient(cardX + padX + 102, divY - 5, cardX + padX + 116, divY + 9);
      sealGrad.addColorStop(0, '#D8483E');
      sealGrad.addColorStop(1, '#AD2822');
      this.roundRectPath(ctx, cardX + padX + 102, divY - 5, 14, 14, 4);
      ctx.fillStyle = sealGrad;
      ctx.fill();

      // 出处
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8B7355';
      ctx.font = '28px serif';
      const sourceLines = this.wrapText(ctx, quote.source || '《毛选摘录》', cardW - padX * 2).slice(0, 2);
      sourceLines.forEach((line, index) => {
        ctx.fillText(index === 0 ? '—— ' + line : line, cardX + cardW - padX, divY + 34 + index * 42);
      });
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // 3. 底部引导条：小程序码成功时绘制真实码，失败时保留搜索入口
      this.drawGlassPanel(ctx, cardX, footerY, cardW, footerH, footerH / 2, { shadowAlpha: 0.16, shadowBlur: 30, shadowOffsetY: 14 });
      ctx.fillStyle = '#6E5F55';
      ctx.font = '28px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('每日一句 · 汲取思想力量', cardX + 48, footerY + footerH / 2);
      if (this._qrcodeImage) {
        const qrSize = 112;
        const qrX = cardX + cardW - qrSize - 28;
        const qrY = footerY + 19;
        // 透明底小程序码直接叠在玻璃条上；再裁成圆角，去掉白底方块感
        ctx.save();
        this.roundRectPath(ctx, qrX, qrY, qrSize, qrSize, 18);
        ctx.clip();
        ctx.drawImage(this._qrcodeImage, qrX, qrY, qrSize, qrSize);
        ctx.restore();
      } else {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#A28F7D';
        ctx.font = '22px sans-serif';
        ctx.fillText('微信内搜索', cardX + cardW - 48, footerY + footerH / 2 - 20);
        ctx.fillStyle = '#CF3A32';
        ctx.font = 'bold 31px sans-serif';
        ctx.fillText('一句毛选', cardX + cardW - 48, footerY + footerH / 2 + 22);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

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
        success: () => {
          analytics.track('poster_save', {
            targetId: Number(this.data.quoteId || (this.data.quote && this.data.quote.id)) || 0,
          });
          showToast('已保存到相册', 'success');
        },
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
      this.lockPageScroll(false);
      this.triggerEvent('close');
    },

    preventBubble() {},
  },
});
