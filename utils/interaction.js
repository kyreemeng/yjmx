// 交互动作包装：统一的加载态 + 错误提示 + 防止重复点击
// 用法（页面方法内）：
//   await runReaction.call(this, async () => { ... await reactionService.toggle(...) });
async function runReaction(work, { loadingTitle = '处理中' } = {}) {
  if (this._acting) return; // 防止重复触发
  this._acting = true;
  wx.showLoading({ title: loadingTitle, mask: true });
  try {
    const result = await work.call(this);
    wx.hideLoading();
    this._acting = false;
    return result;
  } catch (err) {
    wx.hideLoading();
    this._acting = false;
    const msg = (err && err.message) || '操作失败，请稍后重试';
    wx.showToast({ title: msg, icon: 'none' });
    throw err;
  }
}

module.exports = { runReaction };
