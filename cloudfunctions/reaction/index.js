// 云函数：收藏 / 点赞 统一服务
// 所有读写均经由云函数（管理员权限），客户端不直接访问数据库，
// 因此集合权限可设为「仅管理端可读写」，最大限度保护用户数据。
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const COLLECTION = 'user_reactions';

// 确定式 _id：openid + 操作类型 + 目标内容ID
// 由于 _id 全局唯一，重复 add 不会新建第二条记录，天然杜绝「同一用户对同一内容重复操作」。
function buildId(openid, targetId, type) {
  return `${openid}__${type}__${targetId}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requireSingleTarget(targetId) {
  const tid = toNumber(targetId);
  if (tid == null) {
    return {
      error: { success: false, code: 'INVALID_TARGET', message: '目标内容ID不合法' },
    };
  }
  return { tid };
}

function normalizeTargetIds(targetIds) {
  if (!Array.isArray(targetIds)) return [];
  return Array.from(
    new Set(targetIds.map(toNumber).filter((n) => n != null))
  );
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { success: false, code: 'NO_OPENID', message: '无法获取用户身份，请重试' };
  }

  const { action, type, targetId, targetIds } = event;
  if (type !== 'favorite' && type !== 'like') {
    return { success: false, code: 'INVALID_TYPE', message: '操作类型不合法' };
  }

  const collection = db.collection(COLLECTION);

  try {
    // 新增（幂等：已存在则覆盖，不会重复）
    if (action === 'add') {
      const { tid, error } = requireSingleTarget(targetId);
      if (error) return error;
      const _id = buildId(OPENID, tid, type);
      await collection.doc(_id).set({
        data: { openid: OPENID, targetId: tid, type, createTime: db.serverDate() },
      });
      return { success: true, status: true, type, targetId: tid };
    }

    // 删除
    if (action === 'remove') {
      const { tid, error } = requireSingleTarget(targetId);
      if (error) return error;
      const _id = buildId(OPENID, tid, type);
      await collection.doc(_id).remove();
      return { success: true, status: false, type, targetId: tid };
    }

    // 切换（收藏<->取消收藏，点赞<->取消点赞）：以云端状态为准，保证最终一致
    if (action === 'toggle') {
      const { tid, error } = requireSingleTarget(targetId);
      if (error) return error;
      const _id = buildId(OPENID, tid, type);
      const found = await collection.where({ _id }).get();
      if (found.data && found.data.length > 0) {
        await collection.doc(_id).remove();
        return { success: true, status: false, type, targetId: tid, existed: true };
      }
      await collection.doc(_id).set({
        data: { openid: OPENID, targetId: tid, type, createTime: db.serverDate() },
      });
      return { success: true, status: true, type, targetId: tid, existed: false };
    }

    // 状态查询：支持批量（list 页面 / 首页一次性确认多条文案状态）
    if (action === 'status') {
      // 批量：优先使用 targetIds 数组
      if (Array.isArray(targetIds) && targetIds.length > 0) {
        const ids = normalizeTargetIds(targetIds);
        if (ids.length === 0) {
          return { success: true, map: {} };
        }
        const res = await collection
          .where({ openid: OPENID, type, targetId: _.in(ids) })
          .field({ targetId: true })
          .get();
        const map = {};
        ids.forEach((id) => (map[id] = false));
        res.data.forEach((d) => {
          map[d.targetId] = true;
        });
        return { success: true, map };
      }

      // 单条：使用 targetId
      const tid = toNumber(targetId);
      if (tid == null) {
        // 非法 ID 直接视为未收藏/未点赞，避免调用方因空 ID 收到错误
        return { success: true, status: false };
      }
      const _id = buildId(OPENID, tid, type);
      const res = await collection.where({ _id }).get();
      return { success: true, status: !!(res.data && res.data.length > 0) };
    }

    // 列表查询（按操作时间倒序，用于「我的收藏 / 点赞记录」）
    if (action === 'list') {
      const limit = Math.min(Math.max(toNumber(event.limit) || 200, 1), 1000);
      const res = await collection
        .where({ openid: OPENID, type })
        .orderBy('createTime', 'desc')
        .limit(limit)
        .get();
      const list = res.data.map((d) => ({
        targetId: d.targetId,
        createTime: d.createTime ? new Date(d.createTime).getTime() : 0,
      }));
      return { success: true, list };
    }

    // 计数查询（用于「我的」页展示收藏 / 点赞数量）
    if (action === 'count') {
      const res = await collection.where({ openid: OPENID, type }).count();
      return { success: true, total: res.total || 0 };
    }

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
