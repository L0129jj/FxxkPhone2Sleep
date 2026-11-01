'use strict'

/**
 * saveBedtime：原子保存「是否刷手机 + 准备入睡时间」，首次保存写入当晚目标快照。
 * 入参：{ requestId, recordDate, phoneUsed, bedtimeAt, baseRevision }
 */

const cloud = require('wx-server-sdk')
const core = require('./lib/core.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const EVENT = 'saveBedtime'

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return core.fail('E_AUTH', '身份获取失败，请重新进入小程序')

    const db = cloud.database()
    await core.ensureCollections(db)

    const { requestId, recordDate, phoneUsed, bedtimeAt, baseRevision } = event || {}

    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) {
      return core.fail('E_PARAM', '请求标识无效')
    }

    return await db.runTransaction(async (tx) => {
      // 幂等重放：同一请求已成功过，直接返回当时的记录，不重复计数
      const prevLog = await core.findSuccessLog(tx, requestId, EVENT, OPENID)
      if (prevLog && prevLog.record_date) {
        const rec = await core.getRecord(tx, OPENID, prevLog.record_date)
        const ni = core.nowInfo()
        return core.ok({ record: core.withEval(rec, ni.epoch), periodDate: prevLog.record_date, replay: true })
      }

      if (!core.isDateStr(recordDate)) return core.fail('E_PARAM', '参数错误')
      if (typeof phoneUsed !== 'boolean') return core.fail('E_PARAM', '参数错误')
      if (!core.isDTStr(bedtimeAt)) return core.fail('E_PARAM', '参数错误')

      const ni = core.nowInfo()
      const curPeriod = core.periodDateOf(ni.epoch)
      if (recordDate !== curPeriod) {
        return core.fail('E_PERIOD_EXPIRED', '已超过补录时间，下一晚再来记录', { currentPeriodDate: curPeriod })
      }
      // 截止判定以服务端接收时刻为准：D+1 12:00:00 起拒绝
      if (ni.epoch >= core.periodEnd(recordDate)) {
        return core.fail('E_PERIOD_EXPIRED', '已超过补录时间，下一晚再来记录', { currentPeriodDate: curPeriod })
      }

      const bedEpoch = core.parseDT(bedtimeAt)
      const pStart = core.periodStart(recordDate)
      const pEnd = core.periodEnd(recordDate)
      if (!(bedEpoch >= pStart && bedEpoch < pEnd)) {
        return core.fail('E_TIME_INVALID', '准备入睡时间需在这一晚范围内（12:00 至次日 12:00 前）')
      }
      if (bedEpoch > ni.floorEpoch) {
        return core.fail('E_TIME_INVALID', '准备入睡时间不能晚于当前时间')
      }

      const rec = await core.getRecord(tx, OPENID, recordDate)
      if ((rec && baseRevision !== (rec.revision || 0)) || (!rec && baseRevision != null)) {
        return core.fail('E_CONFLICT', '记录已在其他页面更新，已为你重新读取')
      }
      // 修改入睡时间不得使已有起床时间失效
      if (rec && rec.wake_at && bedEpoch >= core.parseDT(rec.wake_at)) {
        return core.fail('E_WAKE_CONFLICT', '新的准备入睡时间晚于已填写的起床时间，请先修改起床时间')
      }

      // 目标快照：仅首次保存睡前记录时写入，之后修改不替换
      const firstBedtime = !rec || !rec.bedtime_at
      let snapshot = rec ? rec.target_snapshot_at || null : null
      if (firstBedtime) {
        const settings = await core.getSettings(tx, OPENID)
        const t = core.effectiveTarget(settings, recordDate)
        snapshot = t ? t.snapshotAt : null
      }

      const now = new Date()
      const data = {
        owner_id: OPENID,
        record_date: recordDate,
        phone_used: phoneUsed,
        bedtime_at: bedtimeAt,
        target_snapshot_at: snapshot,
        updated_at: now,
        revision: ((rec && rec.revision) || 0) + 1
      }
      if (!rec) data.created_at = now

      // 事务中的文档读取和写入共同检测并发修改，更新保留已有字段。
      const records = tx.collection('nightly_records')
      const id = core.recordId(OPENID, recordDate)
      if (rec) {
        await records.doc(id).update({ data })
      } else {
        await records.add({ data: Object.assign({ _id: id }, data) })
      }

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
    console.error('saveBedtime error', e)
    return core.fail('E_INTERNAL', '保存失败，请重试')
  }
}
