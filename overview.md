# 一句毛选 微信小程序 - 项目说明

## 完成内容

当前项目包含首页、排行、我的、详情、收藏列表、点赞记录共 6 个页面，以及金句卡片、登录弹窗、空状态、分享海报和统一图标组件。

## 核心功能

- **首页**：随机展示一条毛选金句，支持「换一句」、点赞、收藏、生成海报分享；点击卡片进入详情。
- **排行**：今日/本周/本月三榜切换（支持点击 Tab 与左右滑动），榜单 Top 50，支持直接收藏。
- **我的**：展示微信头像昵称、收藏/点赞数量入口，支持退出登录；本机匿名点赞记录无需填写头像昵称即可查看。
- **收藏/点赞列表**：按时间倒序展示，收藏列表长按可取消收藏。
- **登录资料**：使用微信当前支持的 `chooseAvatar` 与 `nickname` 填写能力；登录后自动继续收藏或页面跳转。
- **分享海报**：基于 Canvas 2D 生成 750×1334 像素海报，可保存相册或转发。

## 技术要点

- **数据闭环**：金句库包含 100 条短句，每条均记录卷次、篇名、人民出版社版本说明与共产党员网卷次页面；已取得逐字核验证据的条目另存人民网/中国共产党新闻网核验链接并标记为 `verified`，其余标记为 `source-mapped`，不冒充已逐字核验。收藏 / 点赞状态已迁移至微信云开发（云端去重 + 多端同步），排行热度（趋势指标）仍使用本地存储与种子数据。
- **数据层**：`services/quote-service.js` 负责金句与排行统计；`services/user-service.js` 仅负责登录态（头像/昵称）；`services/reaction-service.js` 封装收藏 / 点赞的云端读写与本地缓存。
- **自定义底部导航**：使用 `custom-tab-bar` 实现，适配 iPhone 安全区。
- **性能**：排行榜使用 Swiper + 模板复用；setData 最小化；图片/海报按需生成。
- **视觉**：使用毛选红、金色、暖米白设计令牌；图标统一采用 Tabler Icons 2px 线性风格，卡片正文使用系统衬线字体。

## 云开发集成（收藏 / 点赞）

环境 ID：`cloud1-d9gudmlaz44a63ab3`（已在 `app.js` 的 `wx.cloud.init` 中配置）。

- **云函数 `cloudfunctions/reaction`**：统一处理收藏与点赞的 `add` / `remove` / `toggle` / `status` / `list` / `count`。用户身份由 `cloud.getWXContext().OPENID` 自动获取，无需自定义登录即可收藏 / 点赞。
- **去重保证**：每条记录使用确定式 `_id` = `openid__type__targetId`，天然杜绝「同一用户对同一内容的重复操作」；`toggle` 以云端状态为准返回最终 `status`。
- **数据库集合 `user_reactions`**，字段：
  - `openid`：用户标识（由云端注入）
  - `targetId`：目标内容 ID（金句 id，Number）
  - `type`：`favorite`（收藏）｜ `like`（点赞）
  - `createTime`：操作时间戳（`db.serverDate()`）
  - 建议集合权限设为「仅管理端可读写」，所有访问均经云函数（管理员权限）。
- **推荐索引**（在云开发控制台「数据库 → user_reactions → 索引管理」中创建）：
  - `openid_type`：`openid`(升序) + `type`(升序)。覆盖 `count` / `list` 的过滤条件，以及 `status` 批量查询的 `openid + type` 前缀，是必建索引。
  - `openid_type_time`：`openid`(升序) + `type`(升序) + `createTime`(降序)。在前一个基础上把 `createTime` 纳入索引，`list` 查询的「按时间倒序」可直接走索引、避免内存排序，收藏 / 点赞记录页更顺滑。
  - 说明：`add` / `remove` / `toggle` 与单条 `status` 均按确定式 `_id` 查询，走主键索引，无需额外索引；上述复合索引即可覆盖其余全部查询路径。
- **前端服务层 `services/reaction-service.js`**：调用云函数并维护本地缓存（即时渲染 + 弱网降级）；`toggle` 采用乐观更新，云端成功确认、失败回滚并提示。页面交互通过 `utils/interaction.js` 的 `runReaction` 统一处理加载态、防止重复点击与错误提示；`utils/cloud.js` 的 `callFunction` 内置失败重试（600ms / 1200ms 退避）。

### 部署步骤

1. 微信开发者工具导入项目，确认 `project.config.json` 已声明 `cloudfunctionRoot: "cloudfunctions/"`。
2. 在「云开发」控制台创建集合 `user_reactions`，权限设为「仅创建者可读写」或「仅管理端可读写」。
3. 在集合的「索引管理」中创建两个索引：`openid_type`（`openid` 升序 + `type` 升序）、`openid_type_time`（`openid` 升序 + `type` 升序 + `createTime` 降序）。
4. 右键 `cloudfunctions/reaction` → 上传并部署（云端安装 `wx-server-sdk`）。
5. 编译预览，收藏 / 点赞即实时同步至云端并在多端一致。

## 项目结构

```
yjmx/
├── app.js / app.json / app.wxss / project.config.json / sitemap.json
├── custom-tab-bar/          # 自定义底部导航
├── components/
│   ├── quote-card/          # 金句卡片
│   ├── login-modal/         # 登录弹窗
│   ├── empty-state/         # 空状态
│   └── share-poster/        # 分享海报
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

## 上线前必须接入

- ~~后端服务：获取 openid，实现跨设备收藏、点赞去重与全局排行。~~ 已通过微信云开发（`reaction` 云函数 + `user_reactions` 集合）实现跨设备同步与去重；全局点赞总数聚合可作为后续增强（当前排行热度仍为本地种子数据）。
- 真实小程序码：通过微信服务端 `getUnlimited` 接口生成并传给海报组件。当前海报明确显示“微信内搜索”，不会绘制伪二维码。
- 埋点上报服务：PRD 中的事件尚无可用接收端。
- 语料终校：当前 19 条已有独立权威网页逐字核验，余下 `source-mapped` 条目仍须以人民出版社 1991 年第 2 版纸质本逐句校勘后，才能统一升级为 `verified`。
