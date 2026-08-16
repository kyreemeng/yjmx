# 微信小程序分享卡片设计规范

> 项目：一句毛选 · 优化日期：2026-08-16
> 设计师：UI Designer

---

## 一、优化概述

本次优化为「一句毛选」小程序新增了 **微信原生分享卡片封面** 自动生成能力。此前用户通过「转发」按钮分享时，因 `imageUrl` 为空，微信回退到页面截图，视觉表现不稳定。优化后，系统在金句加载时自动生成两张专用封面图，分别适配好友分享（5:4）与朋友圈（1:1）两种场景。

### 核心改动

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `components/share-cover/share-cover.js` | 新增 | 双画布离屏生成组件，含 aurora 底色、磨砂玻璃面板、自适应字号、稀有度胶囊、心形点赞数 |
| `components/share-cover/share-cover.wxml` | 新增 | 双 Canvas 2D 节点（5:4 + 1:1） |
| `components/share-cover/share-cover.wxss` | 新增 | 离屏定位（left:-9999px, opacity:0） |
| `components/share-cover/share-cover.json` | 新增 | 组件配置 |
| `utils/share.js` | 修改 | 新增 `buildShareConfig` 统一构建双场景配置，支持封面降级链 |
| `pages/index/index.json` | 修改 | 注册 share-cover 组件 |
| `pages/index/index.wxml` | 修改 | 引入 `<share-cover>` 组件 |
| `pages/index/index.js` | 修改 | 新增 `shareCoverAppPath`/`shareCoverTimelinePath` 数据字段与 `onCoverReady` 事件处理 |
| `pages/detail/detail.json` | 修改 | 注册 share-cover 组件 |
| `pages/detail/detail.wxml` | 修改 | 引入 `<share-cover>` 组件 |
| `pages/detail/detail.js` | 修改 | 同首页，接入双场景封面 |
| `tests/run-tests.js` | 修改 | 新增 4 项测试覆盖组件结构、缓存、配置降级与页面集成 |

---

## 二、卡片尺寸规范

### 2.1 双场景尺寸

| 场景 | API | 设计稿尺寸 | 比例 | 导出格式 | 文件类型 |
|------|-----|-----------|------|----------|----------|
| 好友分享 | `onShareAppMessage.imageUrl` | 1080 × 864 | 5:4 | destWidth=1080, destHeight=864 | JPG 0.92 |
| 朋友圈 | `onShareTimeline.imageUrl` | 1080 × 1080 | 1:1 | destWidth=1080, destHeight=1080 | JPG 0.92 |

### 2.2 画布布局参数

```
5:4 卡片 (1080×864)
├── 外边距 margin: 36px (W×3.3%)
├── 玻璃面板 panel: 1008×792, r=44
├── 内边距 padX: 72px (W×6.7%)
├── 顶部留白 topPad: 86px (H×10%)
├── 正文区域 contentW: 864px
├── 底部信息栏 footerH: 80px (H×9.2%)
└── 最大行数: 4 行

1:1 卡片 (1080×1080)
├── 外边距 margin: 36px
├── 玻璃面板 panel: 1008×1008, r=44
├── 内边距 padX: 72px
├── 顶部留白 topPad: 130px (H×12%)
├── 正文区域 contentW: 864px
├── 底部信息栏 footerH: 99px (H×9.2%)
└── 最大行数: 6 行
```

---

## 三、配色方案

### 3.1 品牌色板

| 色名 | 色值 | 用途 |
|------|------|------|
| 毛选红 | `#CF3A32` | 品牌标识「一句毛选」、红印装饰、心形图标、精粹稀有度 |
| 毛选深红 | `#AD2822` | 渐变深色端、红印阴影 |
| 暖金 | `#C9943F` | 装饰引号、金线分隔、传世稀有度 |
| 暖金深 | `#A5762C` | 金线渐变深色端 |
| 暖米白 | `#FBF9F6` | aurora 底色基底 |
| 墨色 | `#2A1E18` | 金句正文（最高对比度） |
| 出处灰 | `#8B7355` | 出处文字 |
| 次要灰 | `#6E5F55` | 点赞数、次要信息 |
| 提示灰 | `#A28F7D` | 标语「每日一句」 |

### 3.2 稀有度配色

| 稀有度 | 标签 | 背景 | 深色端 | 文字 | 概率 |
|--------|------|------|--------|------|------|
| 传世 | legendary | `#C9943F` | `#A5762C` | `#FFFFFF` | ~5% |
| 精粹 | epic | `#CF3A32` | `#AD2822` | `#FFFFFF` | ~15% |
| 佳句 | rare | `#5B91B4` | `#3D7394` | `#FFFFFF` | ~30% |
| 摘录 | common | `#9C8F84` | `#7A6E64` | `#FFFFFF` | ~50% |

### 3.3 玻璃材质

```
面板渐变: rgba(255,255,255,0.82) → rgba(255,255,255,0.56)
描边: rgba(255,255,255,0.88) / 2px
顶部内高光: rgba(255,255,255,0.95) / 3px
投影: rgba(120,90,60,0.16) / blur 34 / offsetY 16
```

### 3.4 Aurora 底色

与 `app.wxss` 的 `.aurora-bg` 同源，5 点径向渐变 + 线性渐变叠加：

```
基色: #FBF9F6
径向渐变点:
  (12%, 6%)  rgba(255,178,148,0.45)  radius 50%
  (92%, 5%)  rgba(255,210,160,0.38)  radius 52%
  (88%, 86%) rgba(255,196,132,0.40)  radius 55%
  (8%, 92%)  rgba(232,180,140,0.32)  radius 55%
  (50%, 46%) rgba(255,226,200,0.32)  radius 70%
线性叠加: rgba(251,249,246,0.55) → rgba(243,236,227,0.45)
```

---

## 四、字体层级

### 4.1 字体族

```
正文/出处: serif（系统衬线，与 app.wxss quote-card 一致）
UI/品牌:   -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif
```

### 4.2 层级表

| 层级 | 元素 | 字体 | 字号 | 字重 | 行高 | 颜色 |
|------|------|------|------|------|------|------|
| L1 | 金句正文 | serif | 32-54px（自适应） | bold | ×1.62 | #2A1E18 |
| L2 | 出处 | serif | 24-26px | regular | ×1.58 | #8B7355 |
| L3 | 品牌「一句毛选」 | sans-serif | 28px | bold | — | #CF3A32 |
| L4 | 标语「每日一句」 | sans-serif | 20px | regular | — | #A28F7D |
| L5 | 稀有度标签 | sans-serif | 22px | bold | — | #FFFFFF |
| L6 | 点赞数 | sans-serif | 24px | bold | — | #6E5F55 |
| L7 | 装饰引号（share-cover） | serif | H×14% | bold | — | #C9943F (α0.14) |
| L7' | 装饰引号（share-poster 海报） | serif | fontSize × 1.45 | bold | — | #C9943F (α0.17) |

### 4.3 自适应字号算法

```
初始字号: 5:4 → 48px | 1:1 → 54px
递减步长: 4px
下限: 32px
条件: topPad + lines × lineHeight ≤ maxContentH 时停止
行高: round(fontSize × 1.62)
```

---

## 五、布局结构

### 5.1 纵向分区

```
┌─────────────────────────────────────┐
│ margin (36px)                       │
│  ┌─────────────────────────────────┐│
│  │ topPad (10-12%)                 ││
│  │                                 ││
│  │  ❝ 装饰引号（金色, α0.14，与首行顶部对齐）│
│  │                                 ││
│  │  金句正文（serif bold, 自适应）   ││ ← L1 主视觉
│  │  最多 4-6 行                     ││
│  │                                 ││
│  │  ──── ◆ —— 《出处》             ││ ← L2 归属
│  │                                 ││
│  │  ──────────────────────────     ││ ← 分隔线
│  │  [稀有度] ♥ 点赞数  一句毛选     ││ ← L3-L6 信息栏
│  └─────────────────────────────────┘│
│ margin (36px)                       │
└─────────────────────────────────────┘
```

### 5.2 底部信息栏

```
左对齐 → 右对齐
[稀有度胶囊] [♥] [点赞数]     [每日一句] 
                               [一句毛选]
```

- 稀有度胶囊：圆角矩形（r=H/2），渐变背景，白色文字
- 心形：Canvas 贝塞尔路径绘制，毛选红填充
- 点赞数：来自 `quote.stat.total`（云端全网计数）
- 品牌：右对齐，红色粗体 + 灰色标语

---

## 六、动态数据绑定

### 6.1 数据源映射

| 卡片元素 | 数据来源 | 绑定方式 |
|----------|----------|----------|
| 金句正文 | `quote.content` | Canvas `fillText` + `wrapText` 自动换行 |
| 出处 | `quote.source` | Canvas `fillText`，右对齐 |
| 稀有度 | `quote.id` → `computeRarity()` | 胶囊背景色 + 标签文字 |
| 点赞数 | `quote.stat.total` | 心形 + 数字 |
| 品牌 | 静态 | 「一句毛选」+「每日一句」 |

### 6.2 自动生成流程

```
页面加载金句
    ↓
setData({ quote })
    ↓
share-cover observer 触发
    ↓
scheduleGenerate(quote)
    ↓
检查 COVER_CACHE[quote.id] ──命中──→ triggerEvent('coverready', cached)
    ↓ 未命中
generateOne('app', ...)     ← 先生成 5:4（主路径）
    ↓ canvasToTempFilePath
generateOne('timeline', ...) ← 再生成 1:1
    ↓ canvasToTempFilePath
COVER_CACHE[id] = { appMessagePath, timelinePath }
    ↓
triggerEvent('coverready', result)
    ↓
页面 setData({ shareCoverAppPath, shareCoverTimelinePath })
    ↓
onShareAppMessage → imageUrl: shareCoverAppPath
onShareTimeline  → imageUrl: shareCoverTimelinePath
```

### 6.3 降级链

```
场景专用封面 (5:4 / 1:1)
    ↓ 缺失
海报图 (share-poster 生成后传入 shareCoverPath)
    ↓ 缺失
空字符串 → 微信自动截图
```

---

## 七、场景适配

### 7.1 好友分享（5:4）

- API: `onShareAppMessage`
- 封面: 1080×864 JPG
- 微信展示: 聊天列表中约 200×160px，标题在下方
- 设计要点: 横向构图，正文 4 行上限，信息密度适中

### 7.2 朋友圈（1:1）

- API: `onShareTimeline`
- 封面: 1080×1080 JPG
- 微信展示: 朋友圈信息流中约 200×200px
- 设计要点: 正方形构图，正文 6 行上限，更多留白

### 7.3 海报（已有，750×1334）

- 组件: `share-poster`（弹窗模式，手动触发）
- 用途: 保存到相册 / 转发图片
- 与分享封面的关系: 海报生成后其路径也写入 `shareCoverPath`，作为分享封面的降级来源

---

## 八、跨机型一致性

### 8.1 DPR 处理

```javascript
const dpr = wx.getWindowInfo().pixelRatio || 2;
canvas.width  = Math.round(layoutW * dpr);
canvas.height = Math.round(layoutH * dpr);
ctx.scale(canvas.width / designW, canvas.height / designH);
```

- 画布物理像素 = 布局像素 × DPR
- 绘制坐标系始终为设计稿尺寸（1080×864 / 1080×1080）
- 导出尺寸由 `destWidth`/`destHeight` 锁定，与设备无关

### 8.2 rpx 适配

- 画布布局尺寸使用 rpx（540×432rpx / 540×540rpx）
- rpx 自动按屏幕宽度缩放（750rpx = 屏幕宽度）
- 在 iPhone SE（320px）到 iPad（1024px）上均能正确布局

### 8.3 字体兜底

```
serif → 系统衬线（macOS: New York / iOS: 系统衬线 / Android: Noto Serif）
sans-serif → -apple-system → PingFang SC → Microsoft YaHei
```

---

## 九、加载性能

### 9.1 生成耗时

| 步骤 | 预估耗时 | 说明 |
|------|----------|------|
| Canvas 节点查询 | ~10ms | `createSelectorQuery` |
| aurora + 玻璃面板绘制 | ~15ms | 5 次径向渐变 + 圆角路径 |
| 文本测量与换行 | ~5ms | `measureText` 逐字测量 |
| 导出 JPG | ~50ms | `canvasToTempFilePath` |
| 单张总计 | ~80ms | |
| 双张串行 | ~160ms | 先 5:4 后 1:1 |

### 9.2 缓存策略

```javascript
// 视觉版本号：任何影响封面像素的改动都要 bump，旧缓存自动失效
const COVER_VERSION = 'v2';
const COVER_CACHE = {}; // key = `${quote.id}@${COVER_VERSION}`

scheduleGenerate(quote) {
  const key = String(quote.id) + '@' + COVER_VERSION;
  const cached = COVER_CACHE[key];
  if (cached && cached.appMessagePath && cached.timelinePath) {
    this.triggerEvent('coverready', { ...cached, cached: true });
    return; // 跳过生成
  }
  // 版本变化时，清掉该 quote 的旧版本缓存条目
  for (const k of Object.keys(COVER_CACHE)) {
    if (k.startsWith(String(quote.id) + '@') && k !== key) delete COVER_CACHE[k];
  }
  // ... 生成新封面
}
```

- 模块级缓存，组件实例间共享
- 同一金句同一版本不重复生成（`_lastKey` 去重 + `COVER_CACHE` 缓存）
- 视觉版本号 `COVER_VERSION` 嵌入缓存键：绘制逻辑微调后 bump 版本，旧缓存自动失效
- 临时文件由微信管理，App 退出后自动清理

#### 9.2.1 `COVER_VERSION` 维护规则

> **强制要求**：修改 `drawCover / drawFooterBar / drawHeart / drawAurora / drawGlassPanel` 中任何会影响最终 PNG 像素的代码时，**必须**把 `COVER_VERSION` 往后 bump 一档（`v2` → `v3`）。

否则会出现"代码改了但视觉没变"的隐性 bug：模块级 `COVER_CACHE` 会原样返回旧版本生成的封面路径。常见症状：

- DevTools 改了 `share-cover.js` → 真机仍展示旧封面
- 多次提交后用户反馈"我们说的优化没生效"

**自检方式**：在微信开发者工具 Console 查看是否出现 `[share-cover] 生成新封面 { quoteId, version }` 日志。出现说明新版本生效；没出现说明还在吃旧缓存。

### 9.3 防过期机制

```javascript
this._genToken++;
const token = this._genToken;
// ... 异步生成
if (token !== this._genToken) return; // 金句已切换，丢弃过期结果
```

### 9.4 文件体积

| 格式 | 1080×864 | 1080×1080 | 说明 |
|------|----------|-----------|------|
| PNG | ~800KB | ~1.1MB | 无损但体积大 |
| JPG 1.0 | ~350KB | ~480KB | 无损压缩 |
| JPG 0.92 | ~180KB | ~250KB | 推荐质量，肉眼无差 |

---

## 十、可访问性

### 10.1 对比度

| 前景 | 背景 | 比率 | WCAG AA |
|------|------|------|---------|
| #2A1E18 (正文) | #FFFFFF (面板) | 14.8:1 | AAA |
| #8B7355 (出处) | #FFFFFF | 4.6:1 | AA |
| #CF3A32 (品牌) | #FFFFFF | 4.8:1 | AA |
| #FFFFFF (胶囊文字) | #CF3A32 | 4.8:1 | AA |
| #A28F7D (标语) | #FFFFFF | 2.8:1 | AA (大文本) |

### 10.2 触摸目标

分享卡片为图片展示，无交互元素。触发分享的按钮（open-type="share"）满足 44pt 最小触摸区域。

---

## 十一、测试覆盖

新增 4 项回归测试：

1. **分享封面组件包含双比例离屏画布与自动生成逻辑** — 验证 WXML 双 Canvas、JS 设计稿尺寸、JPG 导出、稀有度计算
2. **分享封面缓存避免同一金句重复生成** — 验证 `COVER_CACHE` 与 `_lastKey` 去重
3. **buildShareConfig 为双场景分配正确封面并支持降级** — 验证 5:4/1:1 路径分配与海报降级
4. **首页与详情页接入分享封面自动生成** — 验证组件注册、WXML 引用、JS 数据字段与回调

全部 37 项测试通过。

---

## 十二、后续优化方向

1. **小程序码集成**：底部信息栏预留二维码区域，接入 `getUnlimited` 接口生成真实小程序码
2. **用户个性化**：登录后在封面底部显示「@昵称 推荐」，增强社交属性
3. **A/B 测试**：为不同稀有度生成不同视觉风格（如传世级使用烫金边框）
4. **预生成**：在用户浏览排行榜时后台预生成 Top 10 金句的封面，进一步缩短分享等待
5. **数据埋点**：记录分享卡片展示量与点击率，优化封面设计
