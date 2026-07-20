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

function test(name, fn) {
  try {
    storageData.clear();
    copiedAvatar = null;
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

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

test('退出登录后不暴露收藏状态和收藏数量', () => {
  const userService = require('../services/user-service');

  userService.login({ nickName: '读者', avatarUrl: '/avatar.png' });
  userService.favoriteQuote(1);
  assert.equal(userService.isFavorite(1), true);
  userService.logout();
  assert.equal(userService.isFavorite(1), false);
  assert.equal(userService.getFavoriteCount(), 0);
});

test('排行页再次显示时重新同步当前榜单', () => {
  const source = read('pages/rank/rank.js');
  const onShowBody = source.match(/onShow\(\) \{([\s\S]*?)\n  \},/)[1];
  assert.match(onShowBody, /loadRank\(this\.data\.activeTab\)/);
});

test('收藏登录成功后能够完成原操作', () => {
  const userService = require('../services/user-service');

  assert.equal(userService.favoriteQuote(1).reason, 'need_login');
  userService.login({ nickName: '读者', avatarUrl: '/avatar.png' });
  assert.equal(userService.favoriteQuote(1).reason, 'favorited');
  assert.equal(userService.isFavorite(1), true);
});

test('点赞记录保存精确时间并按时间倒序返回', () => {
  const userService = require('../services/user-service');
  const storage = require('../utils/storage');

  userService.likeQuote(1);
  const stored = storage.getLikedQuotes()[1];
  assert.equal(typeof stored.time, 'number');
  assert.match(stored.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(userService.getLikedQuotesList()[0].likeTime, stored.time);
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

console.log('全部测试通过');
