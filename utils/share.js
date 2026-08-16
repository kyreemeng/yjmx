/**
 * 分享链路工具：统一标题、落地路径与归因参数。
 * query: id / from / scene / qid
 */

const DEFAULT_TITLE = '一句毛选';

function encodeQuoteScene(quoteId) {
  const id = Number(quoteId);
  if (!Number.isInteger(id) || id <= 0) return '';
  return `qid_${id}`;
}

function decodeQuoteScene(scene) {
  if (typeof scene !== 'string') return null;
  let decoded;
  try {
    decoded = decodeURIComponent(scene);
  } catch (err) {
    return null;
  }
  const matched = decoded.match(/^qid_([1-9]\d*)$/);
  return matched ? Number(matched[1]) : null;
}

function shortTitle(content, maxLen = 36) {
  const text = String(content || '').trim();
  if (!text) return DEFAULT_TITLE;
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function buildShareTitle(quote) {
  if (!quote || !quote.content) return DEFAULT_TITLE;
  return shortTitle(quote.content);
}

function buildSharePath(quoteId, { from = 'share', scene = 'appmessage' } = {}) {
  const id = Number(quoteId);
  if (!id) return '/pages/index/index';
  return `/pages/detail/detail?id=${id}&from=${encodeURIComponent(from)}&scene=${encodeURIComponent(scene)}&qid=${id}`;
}

function buildShareQuery(quoteId, { from = 'share', scene = 'timeline' } = {}) {
  const id = Number(quoteId);
  if (!id) return '';
  return `id=${id}&from=${encodeURIComponent(from)}&scene=${encodeURIComponent(scene)}&qid=${id}`;
}

function buildShareAppMessage(quote, extras = {}) {
  if (!quote) {
    return { title: DEFAULT_TITLE, path: '/pages/index/index', imageUrl: extras.imageUrl || '' };
  }
  return {
    title: buildShareTitle(quote),
    path: buildSharePath(quote.id, { from: extras.from || 'share', scene: extras.scene || 'appmessage' }),
    imageUrl: extras.imageUrl || '',
  };
}

function buildShareTimeline(quote, extras = {}) {
  if (!quote) {
    return { title: DEFAULT_TITLE, query: '', imageUrl: extras.imageUrl || '' };
  }
  return {
    title: buildShareTitle(quote),
    query: buildShareQuery(quote.id, { from: extras.from || 'share', scene: extras.scene || 'timeline' }),
    imageUrl: extras.imageUrl || '',
  };
}

/**
 * 统一构建双场景分享配置。
 * covers: { appMessagePath, timelinePath, posterPath? }
 *   - appMessagePath: 5:4 封面（share-cover 自动生成）
 *   - timelinePath:   1:1 封面（share-cover 自动生成）
 *   - posterPath:     海报图降级（share-poster 生成后传入）
 * 优先使用场景专用封面，缺失时降级到海报图，再降级到空（WeChat 截图）。
 */
function buildShareConfig(quote, covers = {}) {
  const appImageUrl = covers.appMessagePath || covers.posterPath || '';
  const tlImageUrl = covers.timelinePath || covers.posterPath || '';
  return {
    appMessage: buildShareAppMessage(quote, {
      from: 'share', scene: 'appmessage', imageUrl: appImageUrl,
    }),
    timeline: buildShareTimeline(quote, {
      from: 'share', scene: 'timeline', imageUrl: tlImageUrl,
    }),
  };
}

function captureShareEntry(options = {}, launchOptions = null) {
  const id = options.id ? Number(options.id) : null;
  const qid = options.qid ? Number(options.qid) : id;
  const entry = {
    id,
    qid,
    from: options.from || '',
    scene: options.scene || '',
    wxScene: launchOptions && launchOptions.scene != null ? launchOptions.scene : null,
    path: (launchOptions && launchOptions.path) || '',
    capturedAt: Date.now(),
  };

  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData) {
      app.globalData.shareEntry = entry;
    }
  } catch (err) {
    // ignore
  }

  try {
    wx.setStorageSync('last_share_entry', entry);
  } catch (err) {
    // ignore
  }

  return entry;
}

function consumeLaunchShare(launchOptions) {
  if (!launchOptions) return null;
  const query = launchOptions.query || {};
  // 部分场景 query 在 path 上
  if (!query.id && !query.qid && launchOptions.path) {
    const matched = String(launchOptions.path).match(/[?&]id=(\d+)/);
    if (matched) {
      return captureShareEntry({ id: matched[1], from: 'share', scene: 'launch' }, launchOptions);
    }
  }
  if (!query.id && !query.qid && !query.from && !query.scene) {
    return null;
  }
  return captureShareEntry(query, launchOptions);
}

module.exports = {
  DEFAULT_TITLE,
  encodeQuoteScene,
  decodeQuoteScene,
  buildShareTitle,
  buildSharePath,
  buildShareQuery,
  buildShareAppMessage,
  buildShareTimeline,
  buildShareConfig,
  captureShareEntry,
  consumeLaunchShare,
};
