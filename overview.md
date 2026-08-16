# 一句毛选 微信小程序 - 项目说明

## 完成内容

当前项目包含首页、排行、我的、详情、收藏列表、点赞记录共 6 个页面，以及金句卡片、登录弹窗、空状态、分享海报、分享封面和统一图标组件。

## 核心功能

- **首页**：每日固定展示一条毛选金句，记录连续访问与图鉴进度；支持额外拆卡、点赞、收藏和生成带真实小程序码的分享海报。
- **排行**：今日/本周/本月三榜切换（支持点击 Tab 与左右滑动），榜单 Top 50，支持直接收藏。
- **我的**：展示微信头像昵称、收藏/点赞数量入口，支持退出登录；本机匿名点赞记录无需填写头像昵称即可查看。
- **收藏/点赞列表**：按时间倒序展示，支持一键取消收藏 / 点赞并与云端实时同步；收藏可按主题和稀有度筛选。
- **登录资料**：使用微信当前支持的 `chooseAvatar` 与 `nickname` 填写能力；登录后自动继续收藏或页面跳转。
- **分享海报**：基于 Canvas 2D 生成 750×1334 像素海报，可保存相册或转发。
- **分享封面**：`share-cover` 组件在金句加载时自动生成 5:4（好友分享）与 1:1（朋友圈）双比例封面图，按 quote.id 缓存，JPG 0.92 导出。包含 aurora 底色、磨砂玻璃面板、金句正文（自适应字号）、出处、稀有度胶囊、心形点赞数与品牌标识。通过 `onCoverReady` 事件将路径回传页面，用于 `onShareAppMessage` / `onShareTimeline` 的 `imageUrl`。

## 技术要点

- **数据闭环**：114 条语料以云数据库 `quotes` 为唯一运行时来源，客户端仅缓存最近一次云端结果；收藏、点赞、总赞数和排行榜均由云端维护。
- **数据层**：`services/quote-service.js` 负责云语料、每日一句、连续访问与图鉴；`services/user-service.js` 仅负责本地资料；`services/reaction-service.js` 封装收藏 / 点赞；`services/rank-service.js` 封装带 TTL 的排行榜快照读取。
- **一致性**：点赞明细、总赞数和排行日期桶在云函数事务中同步；排行榜由定时任务预聚合，快照缺失时回退实时聚合。
- **运营数据**：关键访问、抽卡、互动、分享、筛选与扫码事件写入 `analytics_events`，失败不会阻断主流程。
- **自定义底部导航**：使用 `custom-tab-bar` 实现，适配 iPhone 安全区。
- **性能**：排行榜使用 Swiper + 模板复用；setData 最小化；图片/海报按需生成；分享封面按 quote.id 缓存，双画布串行生成（~160ms），JPG 0.92 导出。
- **视觉**：使用毛选红、暖金、暖米白设计令牌（避免紫调）；图标统一采用 Tabler Icons 2px 线性风格；列表采用 iOS inset grouped；导航 / Tab 为贴边毛玻璃；卡片正文使用系统衬线字体。

## 云开发集成

环境 ID 由 `utils/env.js` 统一配置，云函数使用 `cloud.DYNAMIC_CURRENT_ENV`。

- **`reaction`**：收藏、点赞、总赞数和排行读取；用户身份来自 OPENID。
- **`quotes`**：读取上架语料。
- **`qrcode`**：生成并缓存 `getUnlimited` 小程序码。
- **`analytics`**：批量接收白名单埋点。
- **`rank-rebuild`**：每 5 分钟生成今日、本周、本月排行榜快照。
- **`admin-migrate`**：受管理员口令保护的幂等初始化与校验工具。
- **去重保证**：每条记录使用确定式 `_id` = `openid__type__targetId`，天然杜绝「同一用户对同一内容的重复操作」；`toggle` 以云端状态为准返回最终 `status`。
- **数据库集合**：`user_reactions`、`quotes`、`like_counts`、`rank_daily`、`rank_snapshots`、`analytics_events`、`qrcode_cache`。详细权限、索引与迁移步骤见 `docs/cloud-deployment.md`。
- **`user_reactions` 字段**：
  - `openid`：用户标识（由云端注入）
  - `targetId`：目标内容 ID（金句 id，Number）
  - `type`：`favorite`（收藏）｜ `like`（点赞）
  - `createTime`：操作时间戳（`db.serverDate()`）
  - 建议集合权限设为「仅管理端可读写」，所有访问均经云函数（管理员权限）。
- **推荐索引**（在云开发控制台「数据库 → user_reactions → 索引管理」中创建）：
  - `openid_type`：`openid`(升序) + `type`(升序)。覆盖 `count` / `list` 的过滤条件，以及 `status` 批量查询的 `openid + type` 前缀，是必建索引。
  - `openid_type_time`：`openid`(升序) + `type`(升序) + `createTime`(降序)。在前一个基础上把 `createTime` 纳入索引，`list` 查询的「按时间倒序」可直接走索引。
  - `type_time`：`type`(升序) + `createTime`(升序)。覆盖排行 `rank` 的时间窗过滤，避免全表扫描。
  - 说明：`add` / `remove` / `toggle` 与单条 `status` 均按确定式 `_id` 查询，走主键索引。
- **前端服务层**：`services/reaction-service.js` 负责收藏 / 点赞（乐观更新 + 本地缓存）；`services/rank-service.js` 调用 `rank` 并拼装金句内容；`utils/interaction.js` 防重复点击；`utils/cloud.js` 内置失败重试。

### 部署步骤

按 `docs/cloud-deployment.md` 创建集合与索引，依次部署迁移、业务和定时函数；完成 114 条语料、赞数总和与排行快照校验后再发布前端。

## 项目结构

```
yjmx/
├── app.js / app.json / app.wxss / project.config.json / sitemap.json
├── custom-tab-bar/          # 自定义底部导航
├── components/
│   ├── quote-card/          # 金句卡片
│   ├── login-modal/         # 登录弹窗
│   ├── empty-state/         # 空状态
│   ├── share-poster/        # 分享海报
│   └── share-cover/         # 分享封面（5:4 + 1:1 自动生成）
├── pages/
│   ├── index/               # 首页
│   ├── rank/                # 排行
│   ├── mine/                # 我的
│   ├── detail/              # 金句详情
│   ├── favorites/           # 收藏列表
│   └── likes/               # 点赞记录
├── services/                # 业务逻辑
└── utils/                   # 数据、工具、常量、请求封装
```

## 使用方式

1. 使用微信开发者工具导入 `/Users/kyree/Desktop/code/yjmx`。
2. 在「详情」→「本地设置」中可勾选「不校验合法域名」等调试选项。
3. 点击「编译」即可预览。
4. 执行 `node tests/run-tests.js` 可运行本地回归测试。

## 上线前检查

- 执行 `admin-migrate` 并通过语料、赞数与排行一致性校验。
- 确认 `rank-rebuild` 定时触发器、集合权限与复合索引生效。
- 体验版验证 `getUnlimited` 环境参数，正式版确认详情页路径已发布。
- 完成语料终校；当前条目统一标记为 `curated`。
