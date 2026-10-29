'use strict'

/**
 * getCurrentRecord：返回当前周期、已保存记录、当晚目标与下一晚安排。
 */

const cloud = require('wx-server-sdk')
const core = require('./lib/core.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return core.fail('E_AUTH', '身份获取失败，请重新进入小程序')

    const db = cloud.database()
    await core.ensureCollections(db)
    await core.ensureUser(db, OPENID)

    const ni = core.nowInfo()
    const periodDate = core.periodDateOf(ni.epoch)

    const record = await core.getRecord(db, OPENID, periodDate)
    const settings = await core.getSettings(db, OPENID)

    // 当晚目标：已提交睡前记录则用快照（可为空，锁定）；未提交则用当前生效目标
    const submitted = !!(record && record.bedtime_at)
    let tonightTarget = null
    let tonightTargetLocked = false
    if (submitted) {
      tonightTargetLocked = true
      tonightTarget = record.target_snapshot_at
        ? { time: record.target_snapshot_at.slice(11, 16), snapshotAt: record.target_snapshot_at }
        : null
    } else {
      tonightTarget = core.effectiveTarget(settings, periodDate)
    }
    const nextTarget = core.effectiveTarget(settings, core.addDays(periodDate, 1))

    const deadlineDate = core.addDays(periodDate, 1)

    let hasAnyRecord = false
    try {
      const anyRec = await db
        .collection('nightly_records')
        .where({ owner_id: OPENID })
        .limit(1)
        .get()
      hasAnyRecord = !!(anyRec.data && anyRec.data.length)
    } catch (e) {
      hasAnyRecord = false
    }

    return core.ok({
      serverNow: core.fmtDT(ni.epoch),
      periodDate,
      deadlineDate,
      deadlineText: deadlineDate.slice(5, 7) + '月' + deadlineDate.slice(8, 10) + '日 12:00',
      record: core.withEval(record, ni.epoch),
      tonightTarget,
      tonightTargetLocked,
      nextTarget,
      targetExists: settings.length > 0,
      weekStart: core.mondayOf(periodDate),
      hasAnyRecord
    })
  } catch (e) {
    console.error('getCurrentRecord error', e)
    return core.fail('E_INTERNAL', '读取失败，请重试')
  }
}
