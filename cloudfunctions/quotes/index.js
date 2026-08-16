// 云函数：语料只读服务（管理端读 quotes 集合）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'quotes';
const MAX_IDS = 100;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeIds(ids) {
  if (!Array.isArray(ids)) return [];
  return Array.from(new Set(ids.map(toNumber).filter((n) => n != null && n > 0)));
}

function publicQuote(doc) {
  if (!doc) return null;
  return {
    id: toNumber(doc.id),
    content: doc.content || '',
    volume: toNumber(doc.volume) || 0,
    sourceKey: doc.sourceKey || null,
    sourceTitle: doc.sourceTitle || doc.source || '',
    source: doc.source || doc.sourceTitle || '',
    sourceUrl: doc.sourceUrl == null ? null : doc.sourceUrl,
    sourcePublisher: doc.sourcePublisher == null ? null : doc.sourcePublisher,
    sourceEdition: doc.sourceEdition == null ? null : doc.sourceEdition,
    verificationUrl: doc.verificationUrl == null ? null : doc.verificationUrl,
    verificationPublisher: doc.verificationPublisher == null ? null : doc.verificationPublisher,
    verificationStatus: doc.verificationStatus || 'curated',
    verifiedAt: doc.verifiedAt == null ? null : doc.verifiedAt,
    quoteType: doc.quoteType || 'short_excerpt',
    charCount: toNumber(doc.charCount) || (doc.content ? String(doc.content).length : 0),
    normalization: doc.normalization || null,
    author: doc.author == null ? '' : doc.author,
    status: doc.status || 'active',
    sort: toNumber(doc.sort) != null ? toNumber(doc.sort) : toNumber(doc.id),
  };
}

async function listActive() {
  const PAGE = 100;
  const list = [];
  let skip = 0;
  while (true) {
    const res = await db
      .collection(COLLECTION)
      .where({ status: 'active' })
      .orderBy('sort', 'asc')
      .skip(skip)
      .limit(PAGE)
      .get();
    const rows = res.data || [];
    rows.forEach((row) => {
      const q = publicQuote(row);
      if (q && q.id != null) list.push(q);
    });
    if (rows.length < PAGE) break;
    skip += PAGE;
    if (skip > 5000) break;
  }
  return { success: true, list, total: list.length };
}

async function getById(event) {
  const tid = toNumber(event.id != null ? event.id : event.targetId);
  if (tid == null || tid <= 0) {
    return { success: false, code: 'INVALID_ID', message: '金句ID不合法' };
  }
  try {
    const res = await db.collection(COLLECTION).doc(String(tid)).get();
    const q = publicQuote(res.data);
    if (!q || q.status !== 'active') {
      return { success: false, code: 'NOT_FOUND', message: '金句不存在或未上架' };
    }
    return { success: true, quote: q };
  } catch (err) {
    return { success: false, code: 'NOT_FOUND', message: '金句不存在或未上架' };
  }
}

async function getByIds(event) {
  const raw = Array.isArray(event.ids)
    ? event.ids
    : Array.isArray(event.targetIds)
      ? event.targetIds
      : [];
  const ids = normalizeIds(raw);
  if (ids.length === 0) {
    return { success: true, list: [], map: {} };
  }
  if (ids.length > MAX_IDS) {
    return {
      success: false,
      code: 'TOO_MANY_IDS',
      message: `单次最多查询 ${MAX_IDS} 条`,
    };
  }

  const list = [];
  const map = {};
  // 优先按确定式 _id 逐条读取，避免 _.in 长度限制
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await db.collection(COLLECTION).doc(String(id)).get();
        const q = publicQuote(res.data);
        if (!q || q.status !== 'active' || q.id == null) return;
        map[q.id] = q;
      } catch (err) {
        // miss
      }
    })
  );
  ids.forEach((id) => {
    if (map[id]) list.push(map[id]);
  });
  return { success: true, list, map };
}

exports.main = async (event = {}) => {
  const action = event.action;
  try {
    if (action === 'listActive') return await listActive();
    if (action === 'getById') return await getById(event);
    if (action === 'getByIds') return await getByIds(event);
    return { success: false, code: 'INVALID_ACTION', message: '操作指令不合法' };
  } catch (err) {
    return {
      success: false,
      code: 'SERVER_ERROR',
      message: err.message || '服务异常，请稍后重试',
      detail: String(err),
    };
  }
};
