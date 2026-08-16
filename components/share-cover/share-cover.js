/**
 * share-cover 分享封面组件
 *
 * 在金句加载时自动生成两张分享封面图：
 *   - 5:4 (1080×864)  → onShareAppMessage 好友分享卡片
 *   - 1:1 (1080×1080) → onShareTimeline 朋友圈卡片
 *
 * 设计语言与 app.wxss / share-poster 保持一致：
 *   毛选红 + 暖金 + iOS 液玻璃 aurora 底色
 *
 * 性能策略：
 *   - 按 quote.id + 视觉版本号 缓存，同一金句不重复生成
 *   - 先生成 5:4（主路径），再生成 1:1
 *   - JPG 0.92 质量，文件体积远小于 PNG
 *   - 生成 token 防止金句切换时的过期写入
 *
 * ⚠️ COVER_VERSION 维护说明：
 *   - 修改 drawCover / drawFooterBar / drawHeart / drawAurora / drawGlassPanel
 *     中任何会影响最终 PNG 像素的代码时，**必须**把 COVER_VERSION 往后 bump。
 *   - 否则模块级 COVER_CACHE 会把旧版本生成的封面路径原样返回，
 *     视觉调整在已安装 / 已缓存的客户端上看不出来。
 *   - v1: 初始版（引号浮在面板顶部）
 *   - v2: 引号与首行顶部对齐（修复引号漂浮问题）
 */

const { getRarity } = require('../../utils/rarity');
// 统一稀有度工具返回 legendary / epic / rare / common。
const computeRarity = getRarity;

// ---- 模块级缓存：key = quote.id @ COVER_VERSION ----
// 视觉版本号：任何影响封面像素的改动都要 bump，旧缓存自动失效
const COVER_VERSION = 'v3';
const COVER_CACHE = {};

// ---- 设计稿尺寸 ----
const APP_DESIGN = { w: 1080, h: 864 };
const TL_DESIGN  = { w: 1080, h: 1080 };

function getDpr() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
  } catch (e) {}
  return 2;
}

Component({
  options: { addGlobalClass: true },

  properties: {
    quote: { type: Object, value: null },
    // 外部可传入稀有度标签，未传则自动计算
    rarityLabel: { type: String, value: '' },
  },

  data: {},

  observers: {
    'quote': function (quote) {
      if (!quote || quote.id == null) return;
      this.scheduleGenerate(quote);
    },
  },

  lifetimes: {
    attached() {
      this._genToken = 0;
      this._lastKey = '';
    },
    ready() {
      // 若 quote 已存在但 observer 在 ready 前触发，补一次
      const q = this.data.quote;
      if (q && q.id != null && !this._lastKey) {
        this.scheduleGenerate(q);
      }
    },
    detached() {
      this._genToken++;
    },
  },

  methods: {

    // ============ 调度：去重 + 缓存 + 生成 ============

    scheduleGenerate(quote) {
      const key = String(quote.id) + '@' + COVER_VERSION;
      if (this._lastKey === key) return; // 同一金句同一版本不重复
      this._lastKey = key;

      const cached = COVER_CACHE[key];
      if (cached && cached.appMessagePath && cached.timelinePath) {
        // 命中缓存：版本对得上才用，否则视为过期
        this.triggerEvent('coverready', { ...cached, cached: true });
        return;
      }

      // 版本变化或首次进入：清掉该 quote 的旧版本缓存
      for (const k of Object.keys(COVER_CACHE)) {
        if (k.startsWith(String(quote.id) + '@') && k !== key) {
          delete COVER_CACHE[k];
        }
      }
      console.info('[share-cover] 生成新封面', { quoteId: quote.id, version: COVER_VERSION });

      this._genToken++;
      const token = this._genToken;
      const computedRarity = computeRarity(quote.id);
      const rarity = this.data.rarityLabel
        ? { ...computedRarity, label: this.data.rarityLabel }
        : computedRarity;

      // 先生成 5:4（主路径），成功后生成 1:1
      this.generateOne('app', quote, rarity, token, (appPath) => {
        if (token !== this._genToken) return; // 已过期
        this.generateOne('timeline', quote, rarity, token, (tlPath) => {
          if (token !== this._genToken) return;
          const result = { appMessagePath: appPath, timelinePath: tlPath };
          COVER_CACHE[key] = result;
          this.triggerEvent('coverready', result);
        });
      });
    },

    // ============ 单张生成：查询节点 → 绘制 → 导出 ============

    generateOne(type, quote, rarity, token, callback) {
      const canvasId = type === 'app' ? '#coverApp' : '#coverTimeline';
      const design = type === 'app' ? APP_DESIGN : TL_DESIGN;

      const query = wx.createSelectorQuery().in(this);
      query.select(canvasId).fields({ node: true, size: true }).exec((res) => {
        if (token !== this._genToken) return;
        if (!res || !res[0] || !res[0].node) {
          // 节点未就绪，短暂重试
          setTimeout(() => {
            if (token !== this._genToken) return;
            this.generateOne(type, quote, rarity, token, callback);
          }, 120);
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = getDpr();
        const layoutW = Math.max(1, res[0].width || 270);
        const layoutH = Math.max(1, res[0].height || (type === 'app' ? 216 : 270));

        canvas.width = Math.max(1, Math.round(layoutW * dpr));
        canvas.height = Math.max(1, Math.round(layoutH * dpr));
        ctx.scale(canvas.width / design.w, canvas.height / design.h);

        this.drawCover(ctx, design.w, design.h, quote, rarity, type);

        wx.canvasToTempFilePath({
          canvas: canvas,
          destWidth: design.w,
          destHeight: design.h,
          fileType: 'jpg',
          quality: 0.92,
          success: (res) => {
            if (token !== this._genToken) return;
            callback(res.tempFilePath);
          },
          fail: (err) => {
            console.error('[share-cover] 生成失败', type, err);
            callback(''); // 降级：空路径，WeChat 回退到截图
          },
        }, this);
      });
    },

    // ============ 绘制主流程 ============

    drawCover(ctx, W, H, quote, rarity, type) {
      const content = quote.content || '每日一句';
      const source = quote.source || '《毛选摘录》';
      const likes = (quote.stat && quote.stat.total) || 0;

      // 1. aurora 底色
      this.drawAurora(ctx, W, H);

      // 2. 主玻璃面板
      const margin = Math.round(W * 0.033); // ~36
      const panelX = margin;
      const panelY = margin;
      const panelW = W - margin * 2;
      const panelH = H - margin * 2;
      const panelR = Math.round(W * 0.041); // ~44
      this.drawGlassPanel(ctx, panelX, panelY, panelW, panelH, panelR);

      // 3. 内容绘制（裁剪到面板内）
      ctx.save();
      this.roundRectPath(ctx, panelX, panelY, panelW, panelH, panelR);
      ctx.clip();

      const padX = Math.round(W * 0.067); // ~72
      const contentW = panelW - padX * 2;

      // 3a. 金句正文布局计算（先确定 textY，再画装饰引号与正文）
      const footerH = Math.round(H * 0.092); // 底部栏高度
      const topPad = type === 'app' ? Math.round(H * 0.1) : Math.round(H * 0.12);
      const bottomReserve = footerH + Math.round(H * 0.06);
      const maxContentH = panelH - topPad - bottomReserve;

      let fontSize = type === 'app' ? 48 : 54;
      let lineHeight, lines;
      for (;;) {
        ctx.font = 'bold ' + fontSize + 'px serif';
        lines = this.wrapText(ctx, content, contentW);
        lineHeight = Math.round(fontSize * 1.62);
        if (topPad + lines.length * lineHeight <= maxContentH || fontSize <= 32) break;
        fontSize -= 4;
      }
      const maxLines = type === 'app' ? 4 : 6;
      if (lines.length > maxLines) lines = lines.slice(0, maxLines);

      const textY = panelY + topPad;

      // 3b. 金色装饰引号 — 与首行顶部对齐，向左略缩进，融入正文区域
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#C9943F';
      const quoteMarkSize = Math.round(H * 0.14);
      ctx.font = 'bold ' + quoteMarkSize + 'px serif';
      ctx.textBaseline = 'top';
      ctx.fillText('\u201C', panelX + Math.round(padX * 0.2), textY - Math.round(quoteMarkSize * 0.06));
      ctx.restore();

      // 3c. 金句正文
      ctx.fillStyle = '#2A1E18';
      ctx.font = 'bold ' + fontSize + 'px serif';
      ctx.textBaseline = 'top';
      let y = textY;
      lines.forEach((line) => {
        ctx.fillText(line, panelX + padX, y);
        y += lineHeight;
      });

      // 3d. 金线 + 红印分隔
      const divY = textY + Math.round(H * 0.035);
      const divX = panelX + padX;
      const lineW = Math.round(W * 0.082); // ~88
      const lineGrad = ctx.createLinearGradient(divX, 0, divX + lineW, 0);
      lineGrad.addColorStop(0, '#D8AC5C');
      lineGrad.addColorStop(1, '#A5762C');
      this.roundRectPath(ctx, divX, divY, lineW, 3, 2);
      ctx.fillStyle = lineGrad;
      ctx.fill();

      const sealSize = 14;
      const sealGrad = ctx.createLinearGradient(divX + lineW + 14, divY - 5, divX + lineW + 14 + sealSize, divY - 5 + sealSize);
      sealGrad.addColorStop(0, '#D8483E');
      sealGrad.addColorStop(1, '#AD2822');
      this.roundRectPath(ctx, divX + lineW + 14, divY - 5, sealSize, sealSize, 4);
      ctx.fillStyle = sealGrad;
      ctx.fill();

      // 3e. 出处（右对齐）
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8B7355';
      ctx.font = (type === 'app' ? 24 : 26) + 'px serif';
      ctx.textBaseline = 'top';
      const sourceText = '\u2014\u2014 ' + source;
      const sourceLines = this.wrapText(ctx, sourceText, contentW).slice(0, 2);
      sourceLines.forEach((line, i) => {
        ctx.fillText(line, panelX + panelW - padX, divY + 28 + i * 38);
      });
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // 3f. 底部信息栏
      const barY = panelY + panelH - footerH;
      this.drawFooterBar(ctx, panelX, barY, panelW, footerH, padX, rarity, likes, W);

      ctx.restore();
    },

    // ============ 底部栏：稀有度 + 点赞 + 品牌 ============

    drawFooterBar(ctx, panelX, barY, panelW, barH, padX, rarity, likes, W) {
      // 分隔线
      ctx.strokeStyle = 'rgba(201, 148, 63, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(panelX + padX, barY);
      ctx.lineTo(panelX + panelW - padX, barY);
      ctx.stroke();

      const centerY = barY + barH / 2;
      let leftX = panelX + padX;

      // 稀有度胶囊
      if (rarity && rarity.label) {
        const badgeFont = 22;
        ctx.font = 'bold ' + badgeFont + 'px sans-serif';
        const textW = ctx.measureText(rarity.label).width;
        const badgeW = textW + 36;
        const badgeH = 36;
        const badgeY = centerY - badgeH / 2;

        const bgGrad = ctx.createLinearGradient(leftX, badgeY, leftX + badgeW, badgeY);
        bgGrad.addColorStop(0, rarity.bg || rarity.color || '#9C8F84');
        bgGrad.addColorStop(1, rarity.bgDeep || rarity.colorDeep || '#7A6E64');
        this.roundRectPath(ctx, leftX, badgeY, badgeW, badgeH, badgeH / 2);
        ctx.fillStyle = bgGrad;
        ctx.fill();

        ctx.fillStyle = rarity.text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rarity.label, leftX + badgeW / 2, centerY);
        ctx.textAlign = 'left';

        leftX += badgeW + 20;
      }

      // 心形 + 点赞数
      if (likes > 0) {
        const heartSize = 16;
        this.drawHeart(ctx, leftX + heartSize / 2, centerY, heartSize, '#CF3A32');
        leftX += heartSize + 8;
        ctx.fillStyle = '#6E5F55';
        ctx.font = 'bold 24px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(likes), leftX, centerY);
        ctx.textBaseline = 'alphabetic';
      }

      // 品牌（右对齐）
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#A28F7D';
      ctx.font = '20px sans-serif';
      ctx.fillText('每日一句', panelX + panelW - padX, centerY - 16);
      ctx.fillStyle = '#CF3A32';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('一句毛选', panelX + panelW - padX, centerY + 16);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    },

    // ============ 心形绘制 ============

    drawHeart(ctx, cx, cy, size, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      const s = size;
      const top = cy - s * 0.25;
      ctx.moveTo(cx, cy + s * 0.45);
      ctx.bezierCurveTo(cx - s * 0.55, cy + s * 0.1, cx - s * 0.55, top - s * 0.1, cx, top + s * 0.2);
      ctx.bezierCurveTo(cx + s * 0.55, top - s * 0.1, cx + s * 0.55, cy + s * 0.1, cx, cy + s * 0.45);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    // ============ aurora 底色（与 app.wxss 同源） ============

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

    // ============ 磨砂玻璃面板 ============

    drawGlassPanel(ctx, x, y, w, h, r) {
      // 投影
      ctx.save();
      ctx.shadowColor = 'rgba(120, 90, 60, 0.16)';
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 16;
      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.56)');
      this.roundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      // 白色发丝描边
      this.roundRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 顶部内高光
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

    // ============ 工具：圆角路径 ============

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

    // ============ 工具：文本换行 ============

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
  },
});
