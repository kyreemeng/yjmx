// 云函数：自建埋点（analytics_events）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'analytics_events';
const MAX_BATCH = 50;
const MAX_PROPS_KEYS = 20;
const MAX_PROPS_JSON = 2048;
const MAX_IDEMPKEY_LEN = 64;

const EVENT_WHITELIST = new Set([
  'app_open',
  'daily_show',
  'draw',
  'like',
  'favorite',
  'share',
  'poster_save',
  'rank_view',
  'favorite_filter',
  'streak_update',
  'qr_scan',
  'quote_view',
]);

const PROP_WHITELIST = new Set([
  'from',
  'scene',
  'qid',
  'period',
  'drawState',
  'filterTheme',
  'filterRarity',
  'streak',
  'targetId',
  'quoteId',
  'page',
  'envVersion',
  'width',
  'cached',
  'success',
  'errorCode',
  'shareType',
  'rankType',
  'extra',
  'source',
  'date',
  'daily',
  'status',
  'type',
  'sourceKey',
  'rarityKey',
  'force',
  'path',
  'phase',
]);

function fail(code, message, detail) {
  const out = { success: false, code, message };
  if (detail != null) out.detail = detail;
  return out;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeProps(props) {
  if (props == null) return {};
  if (typeof props !== 'object' || Array.isArray(props)) {
    return { error: fail('INVALID_PROPS', 'props 必须是对象') };
  }
  const keys = Object.keys(props);
  if (keys.length > MAX_PROPS_KEYS) {
    return { error: fail('PROPS_TOO_MANY_KEYS', `props 最多 ${MAX_PROPS_KEYS} 个字段`) };
  }
  const clean = {};
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (!PROP_WHITELIST.has(key)) {
      return { error: fail('PROPS_KEY_DENIED', `props 字段不在白名单: ${key}`) };
    }
    const val = props[key];
    if (val == null) continue;
    if (typeof val === 'string') {
      clean[key] = val.slice(0, 200);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      clean[key] = val;
    } else {
      return { error: fail('PROPS_VALUE_DENIED', `props.${key} 类型不支持`) };
    }
  }
  const size = Buffer.byteLength(JSON.stringify(clean), 'utf8');
  if (size > MAX_PROPS_JSON) {
    return { error: fail('PROPS_TOO_LARGE', `props 序列化后不能超过 ${MAX_PROPS_JSON} 字节`) };
  }
  return { props: clean };
}

function normalizeEvent(raw, openid) {
  if (!raw || typeof raw !== 'object') {
    return { error: fail('INVALID_EVENT', '事件格式不合法') };
  }
  const name = raw.event || raw.name;
  if (!name || typeof name !== 'string' || !EVENT_WHITELIST.has(name)) {
    return { error: fail('EVENT_DENIED', '事件不在白名单') };
  }

  const propsResult = sanitizeProps(raw.props || {});
  if (propsResult.error) return propsResult;

  let targetId = toNumber(raw.targetId);
  if (targetId == null && propsResult.props.targetId != null) {
    targetId = toNumber(propsResult.props.targetId);
  }
  if (targetId == null && propsResult.props.quoteId != null) {
    targetId = toNumber(propsResult.props.quoteId);
  }

  let idemKey = raw.idemKey != null ? String(raw.idemKey) : null;
  if (idemKey != null) {
    idemKey = idemKey.trim();
    if (!idemKey) idemKey = null;
    else if (idemKey.length > MAX_IDEMPKEY_LEN) {
      return { error: fail('INVALID_IDEMKEY', `idemKey 最长 ${MAX_IDEMPKEY_LEN}`) };
    }
  }

  const clientTs = toNumber(raw.clientTs) || Date.now();
  const doc = {
    openid: openid || '',
    event: name,
    targetId: targetId,
    props: propsResult.props,
    clientTs,
    serverTs: db.serverDate(),
    appVersion: raw.appVersion != null ? String(raw.appVersion).slice(0, 32) : null,
    wxScene: toNumber(raw.wxScene),
    idemKey,
  };
  return { doc, idemKey };
}

async function writeOne(doc, idemKey) {
  if (idemKey) {
    await db.collection(COLLECTION).doc(idemKey).set({ data: doc });
    return { written: true, idempotent: true };
  }
  await db.collection(COLLECTION).add({ data: doc });
  return { written: true, idempotent: false };
}

async function trackOne(raw, openid) {
  const normalized = normalizeEvent(raw, openid);
  if (normalized.error) return normalized.error;
  try {
    await writeOne(normalized.doc, normalized.idemKey);
    return { success: true };
  } catch (err) {
    return fail('WRITE_FAILED', err.message || '写入失败', String(err));
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'track';

  try {
    if (action === 'track') {
      const payload = event.event && typeof event.event === 'object'
        ? event.event
        : {
            event: event.event || event.name,
            targetId: event.targetId,
            props: event.props,
            clientTs: event.clientTs,
            appVersion: event.appVersion,
            wxScene: event.wxScene,
            idemKey: event.idemKey,
          };
      return await trackOne(payload, OPENID);
    }

    if (action === 'trackBatch') {
      const list = Array.isArray(event.events) ? event.events : Array.isArray(event.list) ? event.list : null;
      if (!list) {
        return fail('INVALID_BATCH', 'events 必须是数组');
      }
      if (list.length === 0) {
        return { success: true, accepted: 0, failed: 0, results: [] };
      }
      if (list.length > MAX_BATCH) {
        return fail('BATCH_TOO_LARGE', `单次最多 ${MAX_BATCH} 条`);
      }

      const results = [];
      let accepted = 0;
      let failed = 0;
      for (let i = 0; i < list.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await trackOne(list[i], OPENID);
        results.push(res);
        if (res && res.success) accepted += 1;
        else failed += 1;
      }
      return {
        success: failed === 0,
        accepted,
        failed,
        results,
        code: failed === 0 ? undefined : 'PARTIAL_FAILURE',
        message: failed === 0 ? undefined : '部分事件写入失败',
      };
    }

    return fail('INVALID_ACTION', '操作指令不合法');
  } catch (err) {
    return fail('SERVER_ERROR', err.message || '服务异常，请稍后重试', String(err));
  }
};
