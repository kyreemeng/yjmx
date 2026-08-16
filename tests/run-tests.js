const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const storageData = new Map();
let copiedAvatar = null;

global.wx = {
  getStorageSync(key) {
    return storageData.has(key) ? storageData.get(key) : '';
  },
  setStorageSync(key, value) {
    storageData.set(key, value);
  },
  removeStorageSync(key) {
    storageData.delete(key);
  },
  clearStorageSync() {
    storageData.clear();
  },
  env: {
    USER_DATA_PATH: '/mini-user-data',
  },
  getFileSystemManager() {
    return {
      copyFileSync(from, to) {
        copiedAvatar = { from, to };
      },
    };
  },
  showToast() {},
};

global.getApp = () => ({
  setUserInfo() {},
  clearUserInfo() {},
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function getSeedQuotes() {
  return JSON.parse(read('cloudfunctions/admin-migrate/quotes.seed.json'));
}

const tests = [];
function test(name, fn) {
  tests.push(async () => {
    try {
      storageData.clear();
      copiedAvatar = null;
      await fn();
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  });
}

// 模拟云端 reaction 云函数：以确定式 key 保证“同一用户对同一内容不重复”
const cloud = require('../utils/cloud');
const reactionService = require('../services/reaction-service');

const OPENID = 'test_openid';
const store = new Map(); // key: `${type}__${targetId}` -> createTime(ms)

function fakeReactionCaller({ name, data }) {
  if (name === 'quotes') {
    const quotes = getSeedQuotes();
    if (data.action === 'listActive') {
      return Promise.resolve({ result: { success: true, list: quotes, version: 'test-v1' } });
    }
    if (data.action === 'getById') {
      return Promise.resolve({
        result: { success: true, quote: quotes.find((item) => item.id === Number(data.id)) || null },
      });
    }
    if (data.action === 'getByIds') {
      const ids = new Set((data.ids || []).map(Number));
      return Promise.resolve({ result: { success: true, list: quotes.filter((item) => ids.has(item.id)) } });
    }
  }
  const { action, type, targetId } = data;
  const key = `${type}__${targetId}`;
  if (action === 'toggle') {
    if (store.has(key)) {
      store.delete(key);
      return Promise.resolve({ result: { success: true, status: false, type, targetId } });
    }
    store.set(key, Date.now());
    return Promise.resolve({ result: { success: true, status: true, type, targetId } });
  }
  if (action === 'status') {
    if (Array.isArray(data.targetIds)) {
      const map = {};
      data.targetIds.forEach((id) => {
        map[id] = store.has(`${type}__${id}`);
      });
      return Promise.resolve({ result: { success: true, map } });
    }
    return Promise.resolve({ result: { success: true, status: store.has(key) } });
  }
  if (action === 'list') {
    const list = [];
    store.forEach((time, k) => {
      const [t, id] = k.split('__');
      if (t === type) list.push({ targetId: Number(id), createTime: time });
    });
    list.sort((a, b) => b.createTime - a.createTime);
    return Promise.resolve({ result: { success: true, list } });
  }
  if (action === 'count') {
    let total = 0;
    store.forEach((_, k) => {
      if (k.startsWith(`${type}__`)) total += 1;
    });
    return Promise.resolve({ result: { success: true, total } });
  }
  if (action === 'add') {
    store.set(key, Date.now());
    return Promise.resolve({ result: { success: true, status: true, type, targetId } });
  }
  if (action === 'remove') {
    store.delete(key);
    return Promise.resolve({ result: { success: true, status: false, type, targetId } });
  }
  if (action === 'rank') {
    const period = data.period === 'week' || data.period === 'month' ? data.period : 'today';
    const limit = Math.min(Math.max(Number(data.limit) || 50, 1), 100);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    let start = now - dayMs;
    if (period === 'week') start = now - 7 * dayMs;
    if (period === 'month') start = now - 30 * dayMs;

    const counts = new Map();
    store.forEach((time, k) => {
      const [t, id] = k.split('__');
      if (t !== 'like') return;
      if (time < start) return;
      const tid = Number(id);
      const prev = counts.get(tid) || { count: 0, lastLikeAt: 0 };
      prev.count += 1;
      if (time > prev.lastLikeAt) prev.lastLikeAt = time;
      counts.set(tid, prev);
    });

    const list = Array.from(counts.entries())
      .map(([targetId, info]) => ({
        targetId,
        count: info.count,
        lastLikeAt: info.lastLikeAt,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.lastLikeAt - a.lastLikeAt;
      })
      .slice(0, limit);

    return Promise.resolve({ result: { success: true, period, list } });
  }
  if (action === 'likeCounts') {
    const ids = Array.isArray(data.targetIds)
      ? data.targetIds.map(Number).filter(Number.isFinite)
      : data.targetId != null
        ? [Number(data.targetId)]
        : [];
    const map = {};
    ids.forEach((id) => {
      map[id] = store.has(`like__${id}`) ? 1 : 0;
    });
    return Promise.resolve({ result: { success: true, map } });
  }
  return Promise.resolve({ result: { success: false, code: 'INVALID_ACTION' } });
}
cloud.__setCaller(fakeReactionCaller);

test('语料通过中性内容审核且每条包含出处元数据', () => {
  const quotes = getSeedQuotes();
  // 用码点拼接，避免测试源码直接出现敏感词字面量
  const forbiddenWords = [
    [20154, 27665],
    [32676, 20247],
    [38745, 21629],
    [25112, 20105],
    [25945, 26465],
    [25919, 20826],
    [39532, 20811, 24605],
    [21015, 23425],
  ].map((codes) => String.fromCharCode(...codes));
  const forbiddenContext = new RegExp(forbiddenWords.join('|'));

  assert.ok(quotes.length >= 80);
  assert.equal(new Set(quotes.map((quote) => quote.id)).size, quotes.length);
  assert.equal(new Set(quotes.map((quote) => quote.content)).size, quotes.length);
  quotes.forEach((quote) => {
    assert.equal(typeof quote.volume, 'number');
    assert.ok(quote.volume >= 1 && quote.volume <= 4);
    assert.match(quote.sourceTitle, /^《.+》$/);
    assert.match(quote.source, /^《.+》$/);
    assert.equal(quote.sourceUrl, null);
    assert.equal(quote.author, '');
    assert.equal(quote.verificationStatus, 'curated');
    assert.equal(quote.charCount, quote.content.length);
    assert.doesNotMatch(quote.content, forbiddenContext);
    assert.doesNotMatch(quote.sourceTitle, forbiddenContext);
    assert.doesNotMatch(quote.source, forbiddenContext);
  });
});

test('按 id 获取金句时也保留出处元数据', () => {
  const quote = getSeedQuotes().find((item) => item.id === 1);

  assert.equal(quote.author, '');
  assert.ok(quote.volume);
  assert.ok(quote.sourceTitle);
  assert.equal(quote.sourceUrl, null);
});

test('每日一句同日稳定且跨日变化', () => {
  const daily = require('../utils/daily');
  const quotes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  assert.equal(daily.pickDailyQuote(quotes, '2026-08-16').id, daily.pickDailyQuote(quotes, '2026-08-16').id);
  assert.notEqual(daily.pickDailyQuote(quotes, '2026-08-16').id, daily.pickDailyQuote(quotes, '2026-08-17').id);
});

test('连续访问按自然日递增、断签重置且同日幂等', () => {
  const daily = require('../utils/daily');
  assert.deepEqual(daily.updateStreak(null, '2026-08-16'), { count: 1, lastDate: '2026-08-16' });
  assert.deepEqual(daily.updateStreak({ count: 3, lastDate: '2026-08-16' }, '2026-08-16'), {
    count: 3,
    lastDate: '2026-08-16',
  });
  assert.deepEqual(daily.updateStreak({ count: 3, lastDate: '2026-08-16' }, '2026-08-17'), {
    count: 4,
    lastDate: '2026-08-17',
  });
  assert.deepEqual(daily.updateStreak({ count: 4, lastDate: '2026-08-17' }, '2026-08-20'), {
    count: 1,
    lastDate: '2026-08-20',
  });
});

test('每日一句与连续访问统一按东八区切日', () => {
  const { getChinaDateKey } = require('../utils/daily');
  assert.equal(getChinaDateKey(new Date('2026-08-16T15:59:59Z')), '2026-08-16');
  assert.equal(getChinaDateKey(new Date('2026-08-16T16:00:00Z')), '2026-08-17');
});

test('稀有度算法在所有展示场景共享同一结果', () => {
  const { getRarity } = require('../utils/rarity');
  [1, 12, 57, 114].forEach((id) => {
    const rarity = getRarity(id);
    assert.ok(['legendary', 'epic', 'rare', 'common'].includes(rarity.key));
    assert.ok(rarity.label);
  });
  assert.equal(read('pages/index/index.js').includes("require('../../utils/rarity')"), true);
  assert.equal(read('components/share-cover/share-cover.js').includes("require('../../utils/rarity')"), true);
});

test('收藏列表可按主题和稀有度组合筛选', () => {
  const { filterFavorites } = require('../utils/favorite-filter');
  const list = [
    { id: 1, sourceKey: 'PRACTICE', rarityKey: 'legendary' },
    { id: 2, sourceKey: 'PRACTICE', rarityKey: 'common' },
    { id: 3, sourceKey: 'CONTRADICTION', rarityKey: 'legendary' },
  ];
  assert.deepEqual(filterFavorites(list, 'PRACTICE', 'legendary').map((item) => item.id), [1]);
  assert.equal(filterFavorites(list, 'all', 'common').length, 1);
  assert.equal(filterFavorites(list, 'all', 'all').length, 3);
});

test('小程序码 scene 可稳定编码与解析', () => {
  const share = require('../utils/share');
  assert.equal(share.encodeQuoteScene(12), 'qid_12');
  assert.equal(share.decodeQuoteScene('qid_12'), 12);
  assert.equal(share.decodeQuoteScene('bad'), null);
});

test('排行榜数字使用中文计数单位', () => {
  const { formatNumber } = require('../utils/util');
  assert.equal(formatNumber(1234), '1,234');
  assert.equal(formatNumber(12600), '1.3万');
});

test('详情页隐藏换一句按钮', () => {
  const template = read('components/quote-card/quote-card.wxml');
  assert.match(template, /wx:if="\{\{showRefresh\}\}"[^>]*class="action-btn refresh"/);
});

test('登录组件使用头像昵称填写能力而非已失效的 getUserInfo', () => {
  const template = read('components/login-modal/login-modal.wxml');
  assert.doesNotMatch(template, /open-type="getUserInfo"/);
  assert.match(template, /open-type="chooseAvatar"/);
  assert.match(template, /type="nickname"/);
});

test('主要界面不再使用系统 emoji 充当图标', () => {
  const files = [
    'components/quote-card/quote-card.wxml',
    'components/empty-state/empty-state.wxml',
    'pages/rank/rank.wxml',
    'pages/mine/mine.wxml',
    'custom-tab-bar/index.wxml',
  ];
  const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u;

  files.forEach((file) => {
    assert.doesNotMatch(read(file), emojiPattern, file);
  });
});

test('分享海报不绘制不可扫描的伪小程序码', () => {
  const source = read('components/share-poster/share-poster.js');
  assert.doesNotMatch(source, /drawPlaceholderQR/);
  assert.match(source, /triggerEvent\('share'/);
  assert.match(source, /微信内搜索/);
  assert.match(source, /drawAurora/);
  assert.match(source, /const H = 1334/);
});

test('分享海报的装饰引号与首行顶部对齐且尺寸与正文同比例', () => {
  const source = read('components/share-poster/share-poster.js');

  // 1. 不再使用固定的 190px 巨大字号
  assert.doesNotMatch(source, /bold 190px serif/);

  // 2. 引号尺寸由正文 fontSize 推导（fontSize × 1.45），与正文同比例
  assert.match(source, /quoteSize\s*=\s*Math\.round\(fontSize\s*\*\s*1\.45\)/);

  // 3. 必须先确定 textY，再画引号
  const textYMatch = source.match(/const textY = cardY \+ topPad;/);
  assert.ok(textYMatch, '缺少 textY 计算（应在 fontSize 收敛后立即计算）');

  // 4. 引号 y 坐标基于 textY 偏移，与首行顶部对齐
  assert.match(source, /textY\s*-\s*Math\.round\(quoteSize\s*\*\s*0\.06\)/);

  // 5. 引号绘制段必须使用 textBaseline = 'top'
  const quoteSection = source.match(/金色装饰引号[\s\S]*?\n      \},/);
  assert.ok(quoteSection, '缺少装饰引号绘制段');
  assert.match(quoteSection[0], /textBaseline\s*=\s*'top'/);

  // 6. 绘制顺序：textY 计算 → 引号 → 正文
  const textYIdx = source.indexOf('const textY = cardY + topPad;');
  const quoteIdx = source.indexOf("fillText('\u201C'");
  const textIdx = source.indexOf('fillText(line, cardX + padX');
  assert.ok(textYIdx > 0 && quoteIdx > 0 && textIdx > 0, '缺少关键绘制调用');
  assert.ok(textYIdx < quoteIdx, 'textY 计算必须在引号之前');
  assert.ok(quoteIdx < textIdx, '引号必须在正文之前绘制');
});

test('分享海报会按可用高度缩放，并处理相册权限失败', () => {
  const template = read('components/share-poster/share-poster.wxml');
  const source = read('components/share-poster/share-poster.js');

  assert.match(template, /previewWidth/);
  assert.match(template, /previewHeight/);
  assert.match(source, /previewScale/);
  assert.match(source, /updatePreviewSize/);
  assert.match(source, /scope\.writePhotosAlbum/);
  assert.match(source, /savePosterImage/);
});

test('分享弹层拦截滚动穿透', () => {
  const template = read('components/share-poster/share-poster.wxml');
  const source = read('components/share-poster/share-poster.js');
  const indexSource = read('pages/index/index.js');
  const indexTemplate = read('pages/index/index.wxml');

  assert.match(template, /catchtouchmove="onPreventMove"/);
  assert.match(template, /poster-touch-shield/);
  assert.match(source, /lockPageScroll/);
  assert.match(source, /setPageStyle/);
  assert.match(source, /_blockPullDownRefresh/);
  assert.match(source, /stopPullDownRefresh/);
  assert.match(indexSource, /_blockPullDownRefresh \|\| this\.data\.showSharePoster/);
  assert.match(indexTemplate, /page-meta/);
});

test('排行榜内层滚动区实现下拉刷新', () => {
  const template = read('pages/rank/rank.wxml');
  const source = read('pages/rank/rank.js');
  assert.match(template, /refresher-enabled="\{\{true\}\}"/);
  assert.match(template, /bindrefresherrefresh="onRankRefresh"/);
  assert.match(source, /onRankRefresh/);
});

test('首页揭卡时将卡牌定位至舞台中心', () => {
  const template = read('pages/index/index.wxml');
  const style = read('pages/index/index.wxss');

  assert.match(template, /class="box-area state-\{\{drawState\}\}"/);
  assert.match(style, /\.box-area\.state-revealed \.card-stage/);
  assert.match(style, /position: absolute;/);
  assert.match(style, /top: 28rpx;/);
});

test('首页打开后默认自动拆卡，无需手动点击', () => {
  const source = read('pages/index/index.js');
  const onLoadBody = source.match(/onLoad\(options = \{\}\) \{([\s\S]*?)\n  \},/)[1];
  assert.match(onLoadBody, /loadDailyQuote/);
  assert.match(onLoadBody, /startDrawSequence/);
  assert.match(onLoadBody, /captureShareEntry/);
  assert.match(source, /startDrawSequence\(\) \{/);
});

test('个人中心提供居中授权与退出按钮', () => {
  const template = read('pages/mine/mine.wxml');
  const style = read('pages/mine/mine.wxss');

  assert.match(template, /class="login-btn"/);
  assert.match(template, /class="logout-btn"/);
  assert.match(style, /\.login-btn \{[\s\S]*?justify-content: center;/);
  assert.match(style, /\.logout-btn \{[\s\S]*?justify-content: center;/);
});

test('朋友圈分享能力已声明且首页会消费分享的金句 id', () => {
  const indexConfig = JSON.parse(read('pages/index/index.json'));
  const detailConfig = JSON.parse(read('pages/detail/detail.json'));
  const source = read('pages/index/index.js');

  assert.equal(indexConfig.enableShareTimeline, true);
  assert.equal(detailConfig.enableShareTimeline, true);
  assert.match(source, /loadSharedQuote/);
  assert.match(source, /options\.id/);
});

test('首页与详情操作栏提供系统转发入口', () => {
  assert.match(read('pages/index/index.wxml'), /open-type="share"/);
  assert.match(read('components/quote-card/quote-card.wxml'), /open-type="share"/);
  assert.match(read('pages/index/index.wxml'), /catchtap="onPoster"/);
  assert.match(read('components/quote-card/quote-card.wxml'), /catchtap="onPoster"/);
});

test('分享链路携带可追踪参数 from scene qid', () => {
  const share = require('../utils/share');
  const msg = share.buildShareAppMessage({ id: 12, content: '没有调查，没有发言权。' });
  assert.match(msg.path, /id=12/);
  assert.match(msg.path, /from=share/);
  assert.match(msg.path, /scene=appmessage/);
  assert.match(msg.path, /qid=12/);
  const timeline = share.buildShareTimeline({ id: 12, content: '没有调查，没有发言权。' });
  assert.match(timeline.query, /scene=timeline/);
  assert.match(timeline.query, /qid=12/);
});

test('启动参数会被消费为分享归因', () => {
  const share = require('../utils/share');
  const entry = share.consumeLaunchShare({
    scene: 1007,
    path: 'pages/detail/detail',
    query: { id: '12', from: 'share', scene: 'appmessage', qid: '12' },
  });
  assert.equal(entry.id, 12);
  assert.equal(entry.qid, 12);
  assert.equal(entry.from, 'share');
  assert.equal(entry.scene, 'appmessage');
  assert.equal(entry.wxScene, 1007);
});

test('我的页收藏无需登录即可进入', () => {
  const source = read('pages/mine/mine.js');
  const onFavoritesBody = source.match(/onFavorites\(\) \{([\s\S]*?)\n  \},/)[1];
  assert.doesNotMatch(onFavoritesBody, /isLogin/);
  assert.doesNotMatch(onFavoritesBody, /pendingRoute/);
  assert.match(onFavoritesBody, /pages\/favorites\/favorites/);
  assert.doesNotMatch(read('pages/mine/mine.wxml'), /登录后保存你的金句收藏/);
  assert.match(read('components/login-modal/login-modal.wxml'), /完善个人资料/);
});

test('未登录仍可查看本机匿名点赞记录', () => {
  const source = read('pages/mine/mine.js');
  const onLikesBody = source.match(/onLikes\(\) \{([\s\S]*?)\n  \},/)[1];
  assert.doesNotMatch(onLikesBody, /isLogin/);
  assert.match(onLikesBody, /pages\/likes\/likes/);
});

test('收藏切换具有幂等性且同一内容不会重复记录', async () => {
  store.clear();
  assert.equal(await reactionService.toggle('favorite', 1), true);
  assert.equal(await reactionService.toggle('favorite', 1), false);
  // 再次收藏仍为 true，云端不会出现重复记录
  assert.equal(await reactionService.toggle('favorite', 1), true);
  const list = await reactionService.getList('favorite');
  assert.equal(list.length, 1);
});

test('点赞记录按操作时间倒序返回', async () => {
  store.clear();
  await reactionService.toggle('like', 1);
  await new Promise((r) => setTimeout(r, 5));
  await reactionService.toggle('like', 5);
  const list = await reactionService.getList('like');
  assert.deepEqual(list.map((item) => item.targetId), [5, 1]);
});

test('云端状态查询可批量确认多条文案是否已收藏', async () => {
  store.clear();
  await reactionService.toggle('favorite', 5);
  await reactionService.toggle('favorite', 7);
  const map = await reactionService.batchStatus('favorite', [5, 6, 7]);
  assert.equal(map[5], true);
  assert.equal(map[6], false);
  assert.equal(map[7], true);
});

test('收藏列表携带金句内容与展示字段', async () => {
  store.clear();
  await reactionService.toggle('favorite', 1);
  const list = await reactionService.getListWithQuotes('favorite');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 1);
  assert.equal(typeof list[0].summary, 'string');
  assert.equal(typeof list[0].timeText, 'string');
});

test('云端调用失败时操作回滚并抛出错误', async () => {
  store.clear();
  const failingCaller = () =>
    Promise.resolve({ result: { success: false, code: 'SERVER_ERROR', message: '服务异常' } });
  cloud.__setCaller(failingCaller);
  let threw = false;
  try {
    await reactionService.toggle('favorite', 99);
  } catch (err) {
    threw = true;
  }
  assert.equal(threw, true);
  assert.equal(store.has('favorite__99'), false);
  cloud.__setCaller(fakeReactionCaller);
});

test('排行页再次显示时使用 TTL 节流且下拉可强制刷新', () => {
  const source = read('pages/rank/rank.js');
  const onShowBody = source.match(/onShow\(\) \{([\s\S]*?)\n  \},/)[1];
  assert.match(onShowBody, /loadRank\(this\.data\.activeTab,\s*\{\s*force:\s*false/);
  assert.match(source, /RANK_TTL_MS/);
  assert.match(source, /force:\s*true/);
});

test('埋点失败不会阻断业务且事件会进入批量队列', async () => {
  const analytics = require('../services/analytics-service');
  analytics.__setSender(() => Promise.reject(new Error('offline')));
  await assert.doesNotReject(() => analytics.track('draw', { targetId: 1 }));
  const queue = analytics.__getQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].event, 'draw');
  assert.equal(queue[0].props.targetId, 1);
  assert.equal(typeof queue[0].clientTs, 'number');
  analytics.__setSender(null);
});

test('应用生命周期使用服务端允许的 app_open 事件', () => {
  const source = read('app.js');
  assert.match(source, /analytics\.track\('app_open'/);
  assert.doesNotMatch(source, /analytics\.track\('app_(?:launch|show)'/);
});

test('运行时语料仅通过 quotes 云函数读取', () => {
  const quoteService = read('services/quote-service.js');
  const reactionSource = read('services/reaction-service.js');
  const rankSource = read('services/rank-service.js');
  assert.match(quoteService, /callFunction\('quotes'/);
  assert.doesNotMatch(quoteService, /utils\/quote-data/);
  assert.doesNotMatch(reactionSource, /utils\/quote-data/);
  assert.doesNotMatch(rankSource, /utils\/quote-data/);
});

test('点赞明细、总赞数和排行日期桶由事务保持一致', () => {
  const source = read('cloudfunctions/reaction/index.js');
  assert.match(source, /runTransaction/);
  assert.match(source, /like_counts/);
  assert.match(source, /rank_daily/);
  assert.match(source, /rank_snapshots/);
  assert.match(source, /createTime/);
});

test('真实小程序码只在云端生成且使用可解析 scene', () => {
  const source = read('cloudfunctions/qrcode/index.js');
  const posterSource = read('components/share-poster/share-poster.js');
  assert.match(source, /getUnlimited/);
  assert.match(source, /qid_/);
  assert.match(source, /pages\/detail\/detail/);
  assert.match(posterSource, /data:\s*\{\s*targetId:\s*quoteId/);
  assert.match(posterSource, /getAccountInfoSync/);
  assert.doesNotMatch(source, /AppSecret|appsecret|secret\s*:/i);
});

test('云端迁移种子保持全部 114 条既有 id', () => {
  const seed = JSON.parse(read('cloudfunctions/admin-migrate/quotes.seed.json'));
  assert.equal(seed.length, 114);
  assert.deepEqual(seed.map((quote) => quote.id), Array.from({ length: 114 }, (_, index) => index + 1));
});

test('环境配置集中管理且客户端不含密钥', () => {
  const appSource = read('app.js');
  const envSource = read('utils/env.js');
  assert.match(appSource, /utils\/env/);
  assert.match(envSource, /cloudEnvId/);
  assert.doesNotMatch(`${appSource}\n${envSource}`, /AppSecret|appsecret|secret\s*:/i);
});

test('无障碍字号、对比度与 88rpx 热区不会回退', () => {
  assert.doesNotMatch(read('app.json'), /#9C8F84/);
  assert.match(read('pages/favorites/favorites.wxss'), /\.item-action\s*\{[\s\S]*?min-height:\s*88rpx/);
  assert.match(read('pages/likes/likes.wxss'), /\.item-action\s*\{[\s\S]*?min-height:\s*88rpx/);
  assert.match(read('pages/index/index.wxss'), /\.card-seal-text\s*\{[\s\S]*?font-size:\s*22rpx/);
});

test('排行榜从云端聚合点赞热度', async () => {
  store.clear();
  const rankService = require('../services/rank-service');

  // 写入三条点赞记录（fake store 每条文案一条）
  store.set('like__3', Date.now() - 3000);
  store.set('like__2', Date.now() - 2000);
  store.set('like__1', Date.now() - 1000);

  const list = await rankService.getRankList('today', 50);
  assert.ok(Array.isArray(list));
  assert.equal(list.length, 3);
  // 同票时按最近点赞时间倒序：1 最新 → 2 → 3
  assert.deepEqual(list.map((item) => item.id), [1, 2, 3]);
  assert.ok(list.every((item) => item.count === 1));
  assert.ok(list.every((item) => item.summary && item.countText));
});

test('排行页接入 rank-service 云端数据', () => {
  const source = read('pages/rank/rank.js');
  assert.match(source, /rank-service/);
  assert.match(source, /rankService\.getRankList/);
  assert.doesNotMatch(source, /quoteService\.getRankQuotes/);
});

test('首页点赞数从云端拉取全网计数', async () => {
  store.clear();
  store.set('like__1', Date.now());
  const counts = await reactionService.getLikeCounts([1, 2]);
  assert.equal(counts[1], 1);
  assert.equal(counts[2], 0);

  const indexSource = read('pages/index/index.js');
  assert.match(indexSource, /getLikeCounts/);
  assert.doesNotMatch(indexSource, /incrementLike/);
});

test('收藏不再依赖自定义登录，未登录即可完成收藏并查询数量', async () => {
  store.clear();
  // 收藏走云端 openid，无需 userService.login
  assert.equal(await reactionService.toggle('favorite', 1), true);
  assert.equal(await reactionService.getStatus('favorite', 1), true);
  assert.equal(await reactionService.getCount('favorite'), 1);
});

test('点赞与取消点赞在云端保持最终一致', async () => {
  store.clear();
  assert.equal(await reactionService.toggle('like', 1), true);
  assert.equal(await reactionService.getStatus('like', 1), true);
  assert.equal(await reactionService.toggle('like', 1), false);
  assert.equal(await reactionService.getStatus('like', 1), false);
});

test('登录时将临时头像保存到小程序持久目录', () => {
  const userService = require('../services/user-service');
  const user = userService.login({ nickName: '读者', avatarUrl: 'wxfile://tmp/avatar.jpg' });

  assert.deepEqual(copiedAvatar, {
    from: 'wxfile://tmp/avatar.jpg',
    to: '/mini-user-data/user-avatar.jpg',
  });
  assert.equal(user.avatarUrl, '/mini-user-data/user-avatar.jpg');
});

test('分享封面组件包含双比例离屏画布与自动生成逻辑', () => {
  const template = read('components/share-cover/share-cover.wxml');
  const source = read('components/share-cover/share-cover.js');
  const style = read('components/share-cover/share-cover.wxss');

  // 双画布：5:4 好友 + 1:1 朋友圈
  assert.match(template, /id="coverApp"/);
  assert.match(template, /id="coverTimeline"/);
  assert.match(template, /type="2d"/);
  assert.match(style, /cover-canvas-app/);
  assert.match(style, /cover-canvas-timeline/);

  // 离屏隐藏
  assert.match(style, /left: -9999px/);
  assert.match(style, /opacity: 0/);

  // 自动生成 + 事件
  assert.match(source, /scheduleGenerate/);
  assert.match(source, /triggerEvent\('coverready'/);
  assert.match(source, /appMessagePath/);
  assert.match(source, /timelinePath/);

  // 设计稿尺寸
  assert.match(source, /APP_DESIGN.*1080.*864/);
  assert.match(source, /TL_DESIGN.*1080.*1080/);

  // JPG 导出
  assert.match(source, /fileType: 'jpg'/);
  assert.match(source, /quality: 0\.92/);

  // 稀有度计算
  assert.match(source, /computeRarity/);
  assert.match(source, /legendary/);
  assert.match(source, /epic/);
  assert.match(source, /rare/);
  assert.match(source, /common/);
});

test('分享封面缓存避免同一金句重复生成', () => {
  const source = read('components/share-cover/share-cover.js');
  assert.match(source, /COVER_CACHE/);
  assert.match(source, /_lastKey/);
});

test('分享封面缓存键带视觉版本号，修改绘制逻辑后旧缓存自动失效', () => {
  const source = read('components/share-cover/share-cover.js');

  // 1. 必须定义视觉版本号常量
  const versionMatch = source.match(/const COVER_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(versionMatch, '缺少 COVER_VERSION 常量定义');
  assert.match(versionMatch[1], /^v\d+$/, 'COVER_VERSION 应遵循 vN 格式，便于维护时递增');

  // 2. 缓存键必须包含 COVER_VERSION，避免视觉调整后还返回旧路径
  assert.match(source, /String\(quote\.id\)\s*\+\s*['"]@['"]\s*\+\s*COVER_VERSION/);

  // 3. 头部注释必须写明 bump 规则，否则后续维护者会忘记
  assert.match(source, /COVER_VERSION 维护说明/);
  assert.match(source, /必须[\s\S]{0,40}bump/);
});

test('分享封面在版本号变化时清理该 quote 的旧版本缓存条目', () => {
  const source = read('components/share-cover/share-cover.js');
  // 用正则确认清理逻辑存在：扫描 COVER_CACHE 的 keys，找出同 quote.id 不同版本号的条目并删除
  assert.match(source, /startsWith\(String\(quote\.id\)\s*\+\s*['"]@['"]\)/);
  assert.match(source, /delete COVER_CACHE\[k\]/);
});

test('buildShareConfig 为双场景分配正确封面并支持降级', () => {
  const share = require('../utils/share');
  const quote = { id: 42, content: '实践是检验真理的唯一标准。' };
  const covers = {
    appMessagePath: 'wxfile://app_cover.jpg',
    timelinePath: 'wxfile://tl_cover.jpg',
  };

  const config = share.buildShareConfig(quote, covers);
  assert.equal(config.appMessage.imageUrl, 'wxfile://app_cover.jpg');
  assert.equal(config.timeline.imageUrl, 'wxfile://tl_cover.jpg');
  assert.match(config.appMessage.path, /id=42/);
  assert.match(config.timeline.query, /id=42/);

  // 降级：仅有海报图时，两个场景都使用海报
  const config2 = share.buildShareConfig(quote, { posterPath: 'wxfile://poster.jpg' });
  assert.equal(config2.appMessage.imageUrl, 'wxfile://poster.jpg');
  assert.equal(config2.timeline.imageUrl, 'wxfile://poster.jpg');

  // 降级：无封面时回退空字符串
  const config3 = share.buildShareConfig(quote, {});
  assert.equal(config3.appMessage.imageUrl, '');
  assert.equal(config3.timeline.imageUrl, '');
});

test('首页与详情页接入分享封面自动生成', () => {
  const indexJson = JSON.parse(read('pages/index/index.json'));
  const detailJson = JSON.parse(read('pages/detail/detail.json'));
  const indexWxml = read('pages/index/index.wxml');
  const detailWxml = read('pages/detail/detail.wxml');
  const indexJs = read('pages/index/index.js');
  const detailJs = read('pages/detail/detail.js');

  // 组件注册
  assert.ok(indexJson.usingComponents['share-cover']);
  assert.ok(detailJson.usingComponents['share-cover']);

  // WXML 引用
  assert.match(indexWxml, /<share-cover/);
  assert.match(indexWxml, /bind:coverready="onCoverReady"/);
  assert.match(detailWxml, /<share-cover/);
  assert.match(detailWxml, /bind:coverready="onCoverReady"/);

  // JS 数据字段
  assert.match(indexJs, /shareCoverAppPath/);
  assert.match(indexJs, /shareCoverTimelinePath/);
  assert.match(detailJs, /shareCoverAppPath/);
  assert.match(detailJs, /shareCoverTimelinePath/);

  // onCoverReady 处理
  assert.match(indexJs, /onCoverReady/);
  assert.match(detailJs, /onCoverReady/);

  // 分享回调使用场景专用封面，降级到海报图
  assert.match(indexJs, /shareCoverAppPath \|\| this\.data\.shareCoverPath/);
  assert.match(indexJs, /shareCoverTimelinePath \|\| this\.data\.shareCoverPath/);
  assert.match(detailJs, /shareCoverAppPath \|\| this\.data\.shareCoverPath/);
  assert.match(detailJs, /shareCoverTimelinePath \|\| this\.data\.shareCoverPath/);
});

(async () => {
  for (const t of tests) {
    await t();
  }
  console.log('全部测试通过');
})();
