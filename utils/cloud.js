// 云函数调用封装：自动重试 + 业务错误归一化
// 通过 module.__setCaller 可在测试 / 无云环境下注入模拟调用器。
const RETRY = 2;
const BASE_DELAY = 600;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultCaller(opts) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: opts.name,
      data: opts.data,
      success: resolve,
      fail: reject,
    });
  });
}

let currentCaller = null;

function getCaller() {
  if (currentCaller) return currentCaller;
  if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function') {
    return defaultCaller;
  }
  throw new Error('云能力未初始化：请确认已调用 wx.cloud.init 并上传云函数');
}

async function callFunction(name, data, options = {}) {
  const retry = options.retry != null ? options.retry : RETRY;
  const caller = getCaller();
  let attempt = 0;

  // 失败后按 600ms / 1200ms 退避重试，提升弱网下的成功率
  while (true) {
    attempt += 1;
    try {
      const res = await caller({ name, data });
      if (!res || (res.errMsg && String(res.errMsg).includes('fail'))) {
        throw new Error((res && res.errMsg) || '云函数调用失败');
      }
      const result = res.result;
      // 云函数返回的业务级失败，归一化为带 code 的 Error
      if (result && result.success === false) {
        const err = new Error(result.message || '操作失败');
        err.code = result.code || 'BUSINESS_ERROR';
        err.result = result;
        throw err;
      }
      return result;
    } catch (err) {
      if (attempt <= retry) {
        await delay(BASE_DELAY * attempt);
        continue;
      }
      err.retryExhausted = true;
      throw err;
    }
  }
}

module.exports = { callFunction };
module.exports.__setCaller = (fn) => {
  currentCaller = fn;
};
