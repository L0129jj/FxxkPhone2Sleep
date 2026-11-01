'use strict'

/**
 * saveWakeTime：补录或修改起床时间，校验已有睡前记录及时间关系。
 * 入参：{ requestId, recordDate, wakeAt, baseRevision }
 */

const cloud = require('wx-server-sdk')
const core = require('./lib/core.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const EVENT = 'saveWakeTime'

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return core.fail('E_AUTH', '身份获取失败，请重新进入小程序')

    const db = cloud.database()
    await core.ensureCollections(db)

    const { requestId, recordDate, wakeAt, baseRevision } = event || {}

    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) {
      return core.fail('E_PARAM', '请求标识无效')
    }

    return await db.runTransaction(async (tx) => {
      // 幂等重放
      const prevLog = await core.findSuccessLog(tx, requestId, EVENT, OPENID)
      if (prevLog && prevLog.record_date) {
        const rec = await core.getRecord(tx, OPENID, prevLog.record_date)
        const ni = core.nowInfo()
        return core.ok({ record: core.withEval(rec, ni.epoch), periodDate: prevLog.record_date, replay: true })
      }

      if (!core.isDateStr(recordDate)) return core.fail('E_PARAM', '参数错误')
      if (!core.isDTStr(wakeAt)) return core.fail('E_PARAM', '参数错误')

      const ni = core.nowInfo()
      const curPeriod = core.periodDateOf(ni.epoch)
      if (recordDate !== curPeriod) {
        return core.fail('E_PERIOD_EXPIRED', '已超过补录时间，下一晚再来记录', { currentPeriodDate: curPeriod })
      }
      if (ni.epoch >= core.periodEnd(recordDate)) {
        return core.fail('E_PERIOD_EXPIRED', '已超过补录时间，下一晚再来记录', { currentPeriodDate: curPeriod })
      }

      const wakeEpoch = core.parseDT(wakeAt)
      const pStart = core.periodStart(recordDate)
      const pEnd = core.periodEnd(recordDate)
      if (!(wakeEpoch >= pStart && wakeEpoch < pEnd)) {
        return core.fail('E_TIME_INVALID', '起床时间需在这一晚范围内（12:00 至次日 12:00 前）')
      }
      if (wakeEpoch > ni.floorEpoch) {
        return core.fail('E_TIME_INVALID', '起床时间不能晚于当前时间')
      }

      const rec = await core.getRecord(tx, OPENID, recordDate)
      if (!rec || !rec.bedtime_at) {
        return core.fail('E_NEED_BEDTIME', '请先补充睡前信息（是否刷手机、几点睡）')
      }
      if (baseRevision !== (rec.revision || 0)) {
        return core.fail('E_CONFLICT', '记录已在其他页面更新，已为你重新读取')
      }
      if (wakeEpoch <= core.parseDT(rec.bedtime_at)) {
        return core.fail('E_TIME_INVALID', '起床时间需晚于准备入睡时间')
      }

      const now = new Date()
      await tx.collection('nightly_records')
        .doc(core.recordId(OPENID, recordDate))
        .update({ data: {
          wake_at: wakeAt,
          updated_at: now,
          revision: (rec.revision || 0) + 1
        } })

      const saved = await core.getRecord(tx, OPENID, recordDate)
      await core.writeLog(tx, {
        owner_id: OPENID,
        request_id: requestId || '',
        event: EVENT,
        result: 'success',
        error_code: '',
        record_date: recordDate
      })
      return core.ok({ record: core.withEval(saved, ni.epoch), periodDate: recordDate })
    })
  } catch (e) {
    console.error('saveWakeTime error', e)
    return core.fail('E_INTERNAL', '保存失败，请重试')
  }
}
