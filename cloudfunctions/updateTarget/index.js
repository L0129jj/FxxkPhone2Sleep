'use strict'

/**
 * updateTarget：设置、修改或关闭目标就寝时间，并计算生效归属日期。
 * 入参：{ requestId, enabled, targetTime }
 *
 * 生效规则：
 * - 首次设置且本晚尚未提交睡前记录 → 对本晚生效；
 * - 其余（已有设置的修改/关闭、重新开启、本晚已提交）→ 从下一晚生效。
 */

const cloud = require('wx-server-sdk')
const core = require('./lib/core.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const EVENT = 'updateTarget'

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return core.fail('E_AUTH', '身份获取失败，请重新进入小程序')

    const db = cloud.database()
    await core.ensureCollections(db)

    const { requestId, enabled, targetTime } = event || {}
    if (typeof enabled !== 'boolean') return core.fail('E_PARAM', '参数错误')
    if (enabled && !core.isHMStr(targetTime)) return core.fail('E_PARAM', '目标时间格式错误')

    // 幂等重放
    const prevLog = await core.findSuccessLog(db, requestId, EVENT, OPENID)
    if (prevLog && prevLog.effective_record_date) {
      const settings = await core.getSettings(db, OPENID)
      const ni = core.nowInfo()
      const p = core.periodDateOf(ni.epoch)
      return core.ok({
        effectiveDate: prevLog.effective_record_date,
        tonightTarget: core.effectiveTarget(settings, p),
        nextTarget: core.effectiveTarget(settings, core.addDays(p, 1)),
        replay: true
      })
    }

    const ni = core.nowInfo()
    const p = core.periodDateOf(ni.epoch)

    const settings = await core.getSettings(db, OPENID)
    const isFirstSetting = settings.length === 0
    const record = await core.getRecord(db, OPENID, p)
    const tonightSubmitted = !!(record && record.bedtime_at)

    const effectiveDate =
      isFirstSetting && !tonightSubmitted ? p : core.addDays(p, 1)

    await db.collection('target_settings').add({
      data: {
        owner_id: OPENID,
        enabled,
        target_time: enabled ? targetTime : '',
        effective_record_date: effectiveDate,
        request_id: requestId || '',
        created_at: new Date()
      }
    })

    const settingsAfter = await core.getSettings(db, OPENID)
    await core.writeLog(db, {
      owner_id: OPENID,
      request_id: requestId || '',
      event: EVENT,
      result: 'success',
      error_code: '',
      record_date: '',
      effective_record_date: effectiveDate
    })

    return core.ok({
      effectiveDate,
      tonightTarget: core.effectiveTarget(settingsAfter, p),
      nextTarget: core.effectiveTarget(settingsAfter, core.addDays(p, 1)),
      targetExists: settingsAfter.length > 0
    })
  } catch (e) {
    console.error('updateTarget error', e)
    return core.fail('E_INTERNAL', '保存失败，请重试')
  }
}
