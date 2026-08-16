// 云函数：无限小程序码生成 + 云存储缓存
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const CACHE = 'qrcode_cache';
const PAGE = 'pages/detail/detail';
const ENV_WHITELIST = new Set(['release', 'trial', 'develop']);
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 280;
const MAX_WIDTH = 1280;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fail(code, message, detail) {
  const out = { success: false, code, message };
  if (detail != null) out.detail = detail;
  return out;
}

function buildScene(targetId) {
  return `qid_${targetId}`;
}

function buildCacheId(scene, envVersion, width) {
  // hyaline：透明底，避免白底方块与海报玻璃条色调冲突
  return `${scene}__${envVersion}__${width}__hyaline`;
}

async function readCache(cacheId) {
  try {
    const res = await db.collection(CACHE).doc(cacheId).get();
    if (res && res.data && res.data.fileID) return res.data;
  } catch (err) {
    // miss
  }
  return null;
}

async function writeCache(cacheId, data) {
  await db.collection(CACHE).doc(cacheId).set({
    data: {
      ...data,
      createdAt: db.serverDate(),
    },
  });
}

async function uploadBuffer(scene, envVersion, width, buffer) {
  const cloudPath = `qrcodes/${envVersion}/${scene}_${width}.png`;
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer,
  });
  return upload.fileID;
}

exports.main = async (event = {}) => {
  const action = event.action || 'getUnlimited';
  if (action !== 'getUnlimited') {
    return fail('INVALID_ACTION', '操作指令不合法');
  }

  const tid = toNumber(
    event.targetId != null ? event.targetId : event.quoteId != null ? event.quoteId : event.id
  );
  if (tid == null || tid <= 0 || !Number.isInteger(tid)) {
    return fail('INVALID_TARGET', '目标内容ID不合法');
  }

  let envVersion = event.envVersion || 'release';
  if (!ENV_WHITELIST.has(envVersion)) {
    return fail('INVALID_ENV', 'envVersion 仅支持 release/trial/develop');
  }

  let width = toNumber(event.width);
  if (width == null) width = DEFAULT_WIDTH;
  width = Math.round(width);
  if (width < MIN_WIDTH || width > MAX_WIDTH) {
    return fail('INVALID_WIDTH', `width 需在 ${MIN_WIDTH}-${MAX_WIDTH} 之间`);
  }

  const scene = buildScene(tid);
  if (scene.length > 32) {
    return fail('INVALID_SCENE', 'scene 超过 32 字符限制');
  }

  const cacheId = buildCacheId(scene, envVersion, width);

  try {
    const cached = await readCache(cacheId);
    if (cached && cached.fileID) {
      return {
        success: true,
        fileID: cached.fileID,
        scene,
        page: PAGE,
        width,
        envVersion,
        cached: true,
      };
    }

    const checkPath = envVersion === 'release';
    let resp;
    try {
      resp = await cloud.openapi.wxacode.getUnlimited({
        scene,
        page: PAGE,
        width,
        checkPath,
        envVersion,
        autoColor: false,
        lineColor: { r: 42, g: 30, b: 24 },
        isHyaline: true,
      });
    } catch (apiErr) {
      return fail(
        'WXACODE_FAILED',
        apiErr.message || '小程序码生成失败',
        String(apiErr)
      );
    }

    const buffer = resp && (resp.buffer || resp.fileContent);
    if (!buffer) {
      return fail('WXACODE_EMPTY', '小程序码返回为空', resp && resp.errMsg);
    }

    const fileID = await uploadBuffer(scene, envVersion, width, buffer);
    await writeCache(cacheId, {
      scene,
      sceneKey: scene,
      targetId: tid,
      fileID,
      page: PAGE,
      width,
      envVersion,
    });

    return {
      success: true,
      fileID,
      scene,
      page: PAGE,
      width,
      envVersion,
      cached: false,
    };
  } catch (err) {
    return fail('SERVER_ERROR', err.message || '服务异常，请稍后重试', String(err));
  }
};
