'use strict'

/**
 * deleteMyData：清空当前用户的全部个人数据。
 * 删除范围：睡前记录、目标设置、操作日志、用户档案。
 * 身份只取自云函数上下文，不接受客户端传入 openid。
 */

const cloud = require('wx-server-sdk')
const core = require('./lib/core.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 先清业务数据，最后删用户档案；再次进入小程序会重新建立首次使用时间
const OWNER_COLLECTIONS = ['nightly_records', 'target_settings', 'operation_logs']

/** 循环删除直到没有匹配记录，避免单次删除数量上限 */
async function removeAllByOwner(db, name, openid) {
  let total = 0
  for (let i = 0; i < 50; i++) {
    const r = await db.collection(name).where({ owner_id: openid }).remove()
    const removed = (r && r.stats && r.stats.removed) || 0
    total += removed
    if (!removed) break
  }
  return total
}

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return core.fail('E_AUTH', '身份获取失败，请重新进入小程序')

    const db = cloud.database()
    await core.ensureCollections(db)

    const deleted = {}
    for (const name of OWNER_COLLECTIONS) {
      deleted[name] = await removeAllByOwner(db, name, OPENID)
    }

    try {
      await db.collection('users').doc(OPENID).remove()
      deleted.users = 1
    } catch (e) {
      deleted.users = 0
    }

    return core.ok({ deleted })
  } catch (e) {
    console.error('deleteMyData error', e)
    return core.fail('E_INTERNAL', '清空失败，请重试')
  }
}
