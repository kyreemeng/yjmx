const storage = require('../utils/storage');
const { DEFAULT_AVATAR } = require('../utils/constants');

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

// 注：收藏 / 点赞相关逻辑已迁移至 services/reaction-service.js（云端同步）。
// 本模块仅负责用户资料（昵称 / 头像）的本地登录态。
module.exports = {
  isLogin,
  getUserInfo,
  login,
  logout,
};
