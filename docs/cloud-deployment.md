# 云端部署与迁移手册

本文档覆盖「一句毛选」云开发集合、索引、云函数部署、数据迁移、校验与回滚。**不替代**微信云开发控制台的实际创建与上传操作。

## 1. 集合与权限

全部业务集合权限统一设为 **仅管理端可读写**（客户端一律走云函数）。

| 集合 | 用途 | 主键 `_id` 约定 |
|---|---|---|
| `user_reactions` | 收藏/点赞明细（事实来源） | `${openid}__${type}__${targetId}` |
| `like_counts` | 全网点赞计数表 | `String(targetId)` |
| `rank_daily` | 东八区日桶增量 | `${yyyyMMdd}__${targetId}` |
| `rank_snapshots` | 今日/本周/本月排行快照 | `today` / `week` / `month` |
| `quotes` | 云端语料 | `String(id)` |
| `analytics_events` | 自建埋点 | 自动，或 `idemKey` |
| `qrcode_cache` | 小程序码缓存 | `${scene}__${envVersion}__${width}` |

### 字段要点

- `user_reactions`：`openid`、`targetId`(number)、`type`(`like`|`favorite`)、`createTime`
- `like_counts`：`targetId`、`total`、`lastLikeAt`、`updatedAt`
- `rank_daily`：`day`(`yyyyMMdd`)、`targetId`、`count`、`lastLikeAt`
- `rank_snapshots`：`period`、`list[{targetId,count,lastLikeAt}]`、`generatedAt`、`version`
- `quotes`：与种子一致，含 `status`(`active`|`hidden`)、`sort`、`contentHash`、`sourceKey`
- `analytics_events`：`event`、`props`、`clientTs`、`serverTs`、`idemKey?`
- `qrcode_cache`：`fileID`、`scene`、`page`、`width`、`envVersion`

云存储目录建议：`qrcodes/{envVersion}/qid_{id}_{width}.png`

## 2. 推荐索引

在控制台「数据库 → 索引管理」创建（写入前建好更稳）。

### `user_reactions`

| 索引 | 字段 |
|---|---|
| `openid_type` | openid ASC, type ASC |
| `openid_type_time` | openid ASC, type ASC, createTime DESC |
| `type_time` | type ASC, createTime ASC |
| `type_target` | type ASC, targetId ASC |

### `rank_daily`

| 索引 | 字段 |
|---|---|
| `day_count` | day ASC, count DESC |
| `day_target` | day ASC, targetId ASC |

### `quotes`

| 索引 | 字段 |
|---|---|
| `status_sort` | status ASC, sort ASC |
| `status_id` | status ASC, id ASC |

### `analytics_events`

| 索引 | 字段 |
|---|---|
| `event_time` | event ASC, serverTs DESC |
| `time` | serverTs DESC |

`like_counts` / `rank_snapshots` / `qrcode_cache` 依赖主键即可。

## 3. 云函数清单

| 目录 | 职责 | 触发 |
|---|---|---|
| `reaction` | 赞藏读写；like 事务同步明细/计数/日桶；rank/likeCounts 读快照与计数表 | 客户端 |
| `quotes` | `listActive` / `getById` / `getByIds` | 客户端 |
| `qrcode` | `getUnlimited`，scene=`qid_<id>`，缓存 fileID | 客户端 |
| `analytics` | `track` / `trackBatch`，事件与 props 白名单 | 客户端 |
| `rank-rebuild` | 从 `rank_daily` 写三份 `rank_snapshots` | 定时每 5 分钟 |
| `admin-migrate` | 播种/回填/重建/校验（口令保护） | 控制台手动 |

依赖：各函数 `package.json` 使用 `wx-server-sdk ~2.6.3`。部署时选择「云端安装依赖」，**不要**把本地 `node_modules` 当作唯一来源依赖。

`qrcode/config.json` 已声明 `wxacode.getUnlimited` 权限。  
`rank-rebuild/config.json` 已声明定时触发器：`0 */5 * * * * *`。

## 4. 部署顺序

1. 控制台创建上述 7 个集合，权限设为仅管理端；创建索引。
2. 部署 `admin-migrate`，在云函数配置中设置环境变量 `ADMIN_MIGRATE_TOKEN`（强随机口令，勿写入小程序端）。
3. 部署 `rank-rebuild`（确保定时触发器生效）。
4. 部署增强版 `reaction`。
5. 部署 `quotes`、`analytics`、`qrcode`。
6. 执行迁移（见下节）并 `verify`。
7. 再发布依赖新云函数的前端版本。

本地语法检查（不安装依赖）：

```bash
node --check cloudfunctions/reaction/index.js
node --check cloudfunctions/quotes/index.js
node --check cloudfunctions/qrcode/index.js
node --check cloudfunctions/analytics/index.js
node --check cloudfunctions/rank-rebuild/index.js
node --check cloudfunctions/admin-migrate/index.js
```

## 5. 迁移步骤（幂等）

在云开发控制台「云函数 → admin-migrate → 测试」调用，`token` 必须与环境变量一致。分页扫描统一按 **100** 条。

```json
{ "action": "seedQuotes", "token": "<ADMIN_MIGRATE_TOKEN>" }
```

```json
{ "action": "backfillLikeCounts", "token": "<ADMIN_MIGRATE_TOKEN>" }
```

```json
{ "action": "backfillRankDaily", "token": "<ADMIN_MIGRATE_TOKEN>" }
```

```json
{ "action": "rebuild", "token": "<ADMIN_MIGRATE_TOKEN>" }
```

```json
{ "action": "verify", "token": "<ADMIN_MIGRATE_TOKEN>" }
```

建议严格按以上顺序执行。各步骤可重复执行：

- `seedQuotes`：按 `_id=String(id)` upsert，种子来自同目录 `quotes.seed.json`（由仓库语料生成后复制，**不可**在云端 `require` 小程序 `utils/quote-data.js`）。
- `backfillLikeCounts` / `backfillRankDaily`：全量扫描 `user_reactions` 中 `type=like`，清空对应派生集合后幂等重建。执行期间避免同时发布互动写入。
- `rebuild`：`callFunction('rank-rebuild')` 生成三榜快照。
- `verify`：核对 active 语料数量、Σ`like_counts.total` 与 like 明细总数、随机抽样、三份快照是否存在。

## 6. 行为约定（运维需知）

- **点赞事务**：`like` 的 add/remove/toggle 在 `runTransaction` 内只使用 `doc` 操作，同步 `user_reactions` + `like_counts` + `rank_daily`。
- **取消点赞日桶**：按原 reaction 的 `createTime` 对应东八区 `yyyyMMdd` 扣减，避免跨日错账。
- **favorite**：只写明细，不动计数表。
- **remove 不存在**：幂等返回成功（`status:false`）。
- **likeCounts**：优先读 `like_counts`，失败降级原聚合。
- **rank**：优先读 `rank_snapshots`，缺失降级原实时聚合/扫描。
- **qrcode**：开发/体验可传 `envVersion`（白名单 `release|trial|develop`）；正式版 `checkPath=true`。
- **analytics**：事件与 props 白名单；可选 `idemKey` 幂等；失败返回结构化错误，客户端应不阻断主流程。

## 7. 校验清单

- [ ] `quotes` active 数量 = 种子条数（当前 114）
- [ ] 抽查 id=1 / id=114 正文与本地语料一致
- [ ] `Σ like_counts.total` == `user_reactions` 中 like 条数
- [ ] 随机 20 个 `targetId` 明细 count == `like_counts.total`
- [ ] `rank_snapshots` 的 today/week/month 均存在
- [ ] 真机点赞后 `like_counts` 即时变化；排行在一个触发周期内更新
- [ ] 海报请求 `qrcode` 成功返回 `fileID`；失败时前端文本降级仍可用
- [ ] 埋点 `track`/`trackBatch` 非法事件被拒绝且业务不中断

## 8. 回滚

| 场景 | 做法 |
|---|---|
| 前端异常 | 回退小程序版本；云函数可保留（旧前端仍走 `reaction` 兼容契约） |
| `reaction` 异常 | 回滚到上一版云函数；`likeCounts`/`rank` 仍可降级到明细聚合 |
| 计数漂移 | 重新跑 `backfillLikeCounts` → `backfillRankDaily` → `rebuild` → `verify` |
| 语料错误 | 修正 `quotes.seed.json` 后重跑 `seedQuotes`（幂等覆盖） |
| 迁移口令泄露 | 轮换 `ADMIN_MIGRATE_TOKEN`；稳定后可禁用/删除 `admin-migrate` |
| 定时任务异常 | 关闭 `rank-rebuild` 触发器；rank 自动降级实时聚合 |

**原则**：先保证读路径可降级，再修写路径；不要直接清 `user_reactions` 明细。

## 9. 安全注意

- 禁止把 `ADMIN_MIGRATE_TOKEN`、AppSecret 写入小程序代码或仓库明文。
- 小程序码只由 `qrcode` 云函数生成。
- 迁移完成后建议禁用 `admin-migrate` 或移除其调用入口。
