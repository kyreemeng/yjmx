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

function fakeReactionCaller({ data }) {
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
  return Promise.resolve({ result: { success: false, code: 'INVALID_ACTION' } });
}
cloud.__setCaller(fakeReactionCaller);

test('语料不少于 100 条且每条包含出处与核验状态', () => {
  const quoteData = require('../utils/quote-data');
  const quotes = quoteData.getAllQuotes();

  assert.ok(quotes.length >= 100);
  quotes.forEach((quote) => {
    assert.equal(typeof quote.volume, 'number');
    assert.ok(quote.volume >= 1 && quote.volume <= 4);
    assert.match(quote.sourceTitle, /^《.+》$/);
    assert.match(quote.source, /^第[一二三四]卷 · 《.+》$/);
    assert.match(quote.sourceUrl, /^https:\/\/www\.12371\.cn\//);
    assert.equal(quote.author, '毛泽东');
    assert.ok(['verified', 'source-mapped'].includes(quote.verificationStatus));
    assert.equal(quote.charCount, quote.content.length);
  });
  assert.ok(quotes.filter((quote) => quote.verificationStatus === 'verified').length >= 18);
});

test('按 id 获取金句时也保留作者与出处元数据', () => {
  const { getQuoteById } = require('../utils/quote-data');
  const quote = getQuoteById(1);

  assert.equal(quote.author, '毛泽东');
  assert.ok(quote.volume);
  assert.ok(quote.sourceTitle);
  assert.ok(quote.sourceUrl);
});

test('排行榜点赞数相同时按最近点赞时间排序', () => {
  const storage = require('../utils/storage');
  const quoteService = require('../services/quote-service');
  const { getToday, getWeekKey, getMonthKey } = require('../utils/util');
  const base = {
    today: 10000,
    week: 10000,
    month: 10000,
    total: 10000,
    lastDate: getToday(),
    lastWeek: getWeekKey(),
    lastMonth: getMonthKey(),
  };
  storage.setQuoteStats({
    1: { ...base, lastLikeAt: 100 },
    2: { ...base, lastLikeAt: 200 },
  });

  const rank = quoteService.getRankQuotes('today');
  assert.deepEqual(rank.slice(0, 2).map((item) => item.id), [2, 1]);
});

test('点赞统计满足总计不小于月、月不小于周、周不小于今日', () => {
  const quoteService = require('../services/quote-service');
  const stats = quoteService.getStats();

  Object.values(stats).forEach((stat) => {
    assert.ok(stat.week >= stat.today);
    assert.ok(stat.month >= stat.week);
    assert.ok(stat.total >= stat.month);
  });
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
});

test('分享海报会按可用高度缩放，并处理相册权限失败', () => {
  const template = read('components/share-poster/share-poster.wxml');
  const source = read('components/share-poster/share-poster.js');

  assert.match(template, /previewWidth/);
  assert.match(template, /previewHeight/);
  assert.match(template, /previewScale/);
  assert.match(source, /updatePreviewSize/);
  assert.match(source, /scope\.writePhotosAlbum/);
  assert.match(source, /savePosterImage/);
});

test('我的页面登录后继续执行原先请求的页面跳转', () => {
  const source = read('pages/mine/mine.js');
  assert.match(source, /pendingRoute/);
  assert.match(source, /wx\.navigateTo\(\{ url: pendingRoute \}\)/);
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
  assert.match(onLoadBody, /loadRandomQuote/);
  assert.match(onLoadBody, /startDrawSequence/);
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
  await reactionService.toggle('like', 2);
  const list = await reactionService.getList('like');
  assert.deepEqual(list.map((item) => item.targetId), [2, 1]);
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

test('排行页再次显示时重新同步当前榜单', () => {
  const source = read('pages/rank/rank.js');
  const onShowBody = source.match(/onShow\(\) \{([\s\S]*?)\n  \},/)[1];
  assert.match(onShowBody, /loadRank\(this\.data\.activeTab\)/);
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

(async () => {
  for (const t of tests) {
    await t();
  }
  console.log('全部测试通过');
})();
