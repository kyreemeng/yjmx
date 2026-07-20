const { getQuoteById } = require('../utils/quote-data');
const storage = require('../utils/storage');
const { FAVORITE_LIMIT, DEFAULT_AVATAR } = require('../utils/constants');
const { getToday, showToast } = require('../utils/util');

function isLogin() {
  const userInfo = storage.getUserInfo();
  return !!(userInfo && userInfo.isLogin);
}

function getUserInfo() {
  return storage.getUserInfo() || { nickName: '点击登录', avatarUrl: DEFAULT_AVATAR, isLogin: false };
}

function persistAvatarUrl(avatarUrl) {
  if (!avatarUrl || !/^wxfile:|^http:\/\/tmp\//.test(avatarUrl)) return avatarUrl || DEFAULT_AVATAR;
  if (!wx.getFileSystemManager || !wx.env || !wx.env.USER_DATA_PATH) return avatarUrl;

  const extensionMatch = avatarUrl.match(/\.(png|jpe?g|webp)(?:\?|$)/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  const savedPath = `${wx.env.USER_DATA_PATH}/user-avatar.${extension}`;

  try {
    const fileSystem = wx.getFileSystemManager();
    try {
      if (fileSystem.unlinkSync) fileSystem.unlinkSync(savedPath);
    } catch (err) {
      // 首次保存时文件不存在，继续复制即可
    }
    fileSystem.copyFileSync(avatarUrl, savedPath);
    return savedPath;
  } catch (err) {
    console.error('保存用户头像失败', err);
    return avatarUrl;
  }
}

function login(userInfo) {
  const info = {
    ...userInfo,
    nickName: String(userInfo.nickName || '微信用户').trim() || '微信用户',
    avatarUrl: persistAvatarUrl(userInfo.avatarUrl),
    isLogin: true,
    loginTime: Date.now(),
  };
  storage.setUserInfo(info);
  const app = getApp();
  if (app && app.setUserInfo) {
    app.setUserInfo(info);
  }
  return info;
}

function logout() {
  storage.removeUserInfo();
  const app = getApp();
  if (app && app.clearUserInfo) {
    app.clearUserInfo();
  }
  return true;
}

function getLikedQuotes() {
  return storage.getLikedQuotes();
}

function isLiked(quoteId) {
  const liked = getLikedQuotes();
  const today = getToday();
  const record = liked[quoteId];
  const likeDate = typeof record === 'string' ? record : record && record.date;
  return likeDate === today;
}

function likeQuote(quoteId) {
  if (isLiked(quoteId)) {
    return { success: false, reason: 'already_liked', message: '今天已经点过赞啦~' };
  }
  const liked = getLikedQuotes();
  liked[quoteId] = {
    date: getToday(),
    time: Date.now(),
  };
  storage.setLikedQuotes(liked);
  return { success: true, reason: 'liked' };
}

function getLikedQuoteIds() {
  const liked = getLikedQuotes();
  return Object.keys(liked).map(Number).sort((a, b) => {
    const recordA = liked[a];
    const recordB = liked[b];
    const dateA = typeof recordA === 'string' ? recordA : recordA.date;
    const dateB = typeof recordB === 'string' ? recordB : recordB.date;
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    const timeA = typeof recordA === 'string' ? 0 : recordA.time || 0;
    const timeB = typeof recordB === 'string' ? 0 : recordB.time || 0;
    if (timeA !== timeB) return timeB - timeA;
    return b - a;
  });
}

function getLikedQuotesList() {
  const ids = getLikedQuoteIds();
  const quotes = getQuoteById ? ids.map((id) => getQuoteById(id)).filter(Boolean) : [];
  const liked = getLikedQuotes();
  return quotes.map((q) => {
    const record = liked[q.id];
    return {
      ...q,
      likeDate: typeof record === 'string' ? record : record.date,
      likeTime: typeof record === 'string' ? 0 : record.time || 0,
    };
  });
}

function getFavorites() {
  return storage.getFavoriteQuotes();
}

function isFavorite(quoteId) {
  if (!isLogin()) return false;
  const favorites = getFavorites();
  return !!favorites[quoteId];
}

function favoriteQuote(quoteId) {
  if (!isLogin()) {
    return { success: false, reason: 'need_login', message: '登录后可收藏金句' };
  }
  const favorites = getFavorites();
  const count = Object.keys(favorites).length;
  if (count >= FAVORITE_LIMIT) {
    return { success: false, reason: 'limit_reached', message: `收藏夹已满（${FAVORITE_LIMIT}/${FAVORITE_LIMIT}），请清理后再收藏` };
  }
  if (favorites[quoteId]) {
    return { success: true, reason: 'already_favorite' };
  }
  favorites[quoteId] = Date.now();
  storage.setFavoriteQuotes(favorites);
  return { success: true, reason: 'favorited', message: '已收藏' };
}

function unfavoriteQuote(quoteId) {
  const favorites = getFavorites();
  if (!favorites[quoteId]) {
    return { success: true, reason: 'not_favorite' };
  }
  delete favorites[quoteId];
  storage.setFavoriteQuotes(favorites);
  return { success: true, reason: 'unfavorited', message: '已取消收藏' };
}

function toggleFavorite(quoteId) {
  if (isFavorite(quoteId)) {
    return unfavoriteQuote(quoteId);
  }
  return favoriteQuote(quoteId);
}

function getFavoriteQuoteIds() {
  if (!isLogin()) return [];
  const favorites = getFavorites();
  return Object.keys(favorites)
    .map(Number)
    .sort((a, b) => favorites[b] - favorites[a]);
}

function getFavoriteQuotesList() {
  const ids = getFavoriteQuoteIds();
  const quotes = ids.map((id) => getQuoteById(id)).filter(Boolean);
  const favorites = getFavorites();
  return quotes.map((q) => ({ ...q, favoriteTime: favorites[q.id] }));
}

function getFavoriteCount() {
  if (!isLogin()) return 0;
  return Object.keys(getFavorites()).length;
}

function getLikeCount() {
  return Object.keys(getLikedQuotes()).length;
}

module.exports = {
  isLogin,
  getUserInfo,
  login,
  logout,
  isLiked,
  likeQuote,
  getLikedQuoteIds,
  getLikedQuotesList,
  isFavorite,
  favoriteQuote,
  unfavoriteQuote,
  toggleFavorite,
  getFavoriteQuoteIds,
  getFavoriteQuotesList,
  getFavoriteCount,
  getLikeCount,
};
