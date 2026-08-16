// 交互动作包装：防重复点击 + 错误提示
// Apple Design：点赞/收藏须即时反馈，禁止全屏 Loading 遮罩打断手势
// 用法（页面方法内）：
//   await runReaction.call(this, async () => { ... await reactionService.toggle(...) });
async function runReaction(work) {
  if (this._acting) return; // 防止重复触发
  this._acting = true;
  try {
    const result = await work.call(this);
    this._acting = false;
    return result;
  } catch (err) {
    this._acting = false;
    const msg = (err && err.message) || '操作失败，请稍后重试';
    wx.showToast({ title: msg, icon: 'none' });
    throw err;
  }
}

module.exports = { runReaction };
