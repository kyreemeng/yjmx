# P0–P2 升级发布检查

## 云端

- 创建并设为仅管理端可读写：`quotes`、`like_counts`、`rank_daily`、`rank_snapshots`、`analytics_events`、`qrcode_cache`
- 为 `user_reactions`、`rank_daily`、`quotes`、`analytics_events` 创建部署文档列出的索引
- 配置 `ADMIN_MIGRATE_TOKEN`，依次执行语料导入、赞数回填、日期桶回填、快照重建和校验
- 部署 `reaction`、`quotes`、`analytics`、`qrcode`、`rank-rebuild`
- 确认 `rank-rebuild` 每 5 分钟触发一次
- 校验语料数量为 114，历史金句 ID 未变化
- 校验 `like_counts.total` 总和与点赞明细总数相等

## 开发者工具与真机

- 首次联网启动能拉取语料；首次离线显示可重试错误，不白屏
- 同一自然日“今日一句”保持一致，次日变化
- 连续访问同日不重复增加，断签后从 1 开始
- 额外拆卡不重复优先，已见图鉴去重
- 点赞、收藏在首页、详情、排行、收藏和点赞列表间保持一致
- 排行普通返回页面不重复请求，下拉刷新强制更新
- 收藏可按主题、稀有度组合筛选，并可恢复全部
- 海报优先绘制真实小程序码；生成失败仍可保存文本降级海报
- 扫码落到对应详情页并记录扫码来源
- 辅助文字在浅色背景可读，主要触控区不小于 88rpx

## 埋点

- 验证 `app_open`、`daily_show`、`draw`、`like`、`favorite`
- 验证 `share`、`poster_save`、`rank_view`、`favorite_filter`
- 验证 `streak_update`、`qr_scan`
- 断网时业务不被阻断；恢复网络后队列可再次上报

## 发布

- 体验版小程序码使用正确 `env_version`
- 正式版详情页路径已发布，`getUnlimited` 路径校验开启
- 管理迁移函数禁用或移除 `ADMIN_MIGRATE_TOKEN`
- 执行 `node tests/run-tests.js`
- 执行云函数语法检查与 `git diff --check`
