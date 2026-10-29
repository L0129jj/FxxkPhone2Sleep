'use strict'

/**
 * getWeeklyReport：返回指定周（周一日期）七日日项与达标总数。
 * 入参：{ weekStart }
 *
 * 日项状态：met | missed | incomplete | pending_sleep | pending_wake | not_started | not_used
 */

const cloud = require('wx-server-sdk')
const core = require('./lib/core.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext()
    if (!OPENID) return core.fail('E_AUTH', '身份获取失败，请重新进入小程序')

    const db = cloud.database()
    await core.ensureCollections(db)
    const user = await core.ensureUser(db, OPENID)

    const ni = core.nowInfo()
    const curPeriod = core.periodDateOf(ni.epoch)
    const curWeekMonday = core.mondayOf(curPeriod)

    const weekStart = (event && event.weekStart) || curWeekMonday
    if (!core.isDateStr(weekStart) || core.mondayOf(weekStart) !== weekStart) {
      return core.fail('E_WEEK_INVALID', '周起始日期无效')
    }
    if (weekStart > curWeekMonday) {
      return core.fail('E_WEEK_INVALID', '不能查看未来周')
    }

    // 首次使用前的夜晚视为「未使用」；最早可查看周 = 首次使用所在周
    const firstUsedEpoch =
      user && user.first_used_at && user.first_used_at.getTime
        ? user.first_used_at.getTime()
        : ni.epoch
    const firstUsedDT = core.fmtDT(firstUsedEpoch)
    const firstUsedDate = firstUsedDT.slice(0, 10)
    const firstUsableDate = firstUsedDT.slice(11, 16) < '12:00'
      ? core.addDays(firstUsedDate, -1)
      : firstUsedDate
    const earliestWeekStart = core.mondayOf(firstUsableDate)
    if (weekStart < earliestWeekStart) {
      return core.fail('E_WEEK_INVALID', '最早可查看 ' + earliestWeekStart.slice(5, 7) + '月' + earliestWeekStart.slice(8, 10) + '日 所在周', {
        earliestWeekStart
      })
    }

    const settings = await core.getSettings(db, OPENID)
    const weekEnd = core.addDays(weekStart, 6)

    let hasAnyRecord = false
    const days = []
    let metCount = 0
    let completeCount = 0

    for (let i = 0; i < 7; i++) {
      const D = core.addDays(weekStart, i)
      const closed = ni.epoch >= core.periodEnd(D)
      const item = {
        date: D,
        label: D.slice(5, 7) + '月' + D.slice(8, 10) + '日',
        weekday: '周' + ['一', '二', '三', '四', '五', '六', '日'][i],
        phone_used: null,
        bedtime: null,
        wake: null,
        target: null,
        closed,
        status: 'not_started',
        met: false,
        reasons: []
      }

      // 周期结束早于首次使用 → 未使用
      if (core.periodEnd(D) < firstUsedEpoch) {
        item.status = 'not_used'
        days.push(item)
        continue
      }

      const rec = await core.getRecord(db, OPENID, D)
      const base = rec || core.emptyRecord(D)
      const ev = core.evaluateRecord(base, ni.epoch)

      item.phone_used = base.phone_used
      item.bedtime = base.bedtime_at ? base.bedtime_at.slice(11, 16) : null
      item.wake = base.wake_at ? base.wake_at.slice(11, 16) : null
      // 已提交睡前记录 → 展示当晚目标快照；未提交 → 展示当前生效目标
      if (base.bedtime_at) {
        item.target = base.target_snapshot_at ? base.target_snapshot_at.slice(11, 16) : null
      } else {
        const t = core.effectiveTarget(settings, D)
        item.target = t ? t.time : null
      }
      item.status = ev.status
      item.met = ev.met
      item.reasons = ev.reasons

      if (rec) hasAnyRecord = true
      if (ev.status === 'met') metCount++
      if (ev.status === 'met' || ev.status === 'missed') completeCount++
      days.push(item)
    }

    return core.ok({
      weekStart,
      weekEnd,
      days,
      metCount,
      completeCount,
      isCurrentWeek: weekStart === curWeekMonday,
      earliestWeekStart,
      currentWeekStart: curWeekMonday,
      firstUsedDate,
      hasAnyRecord
    })
  } catch (e) {
    console.error('getWeeklyReport error', e)
    return core.fail('E_INTERNAL', '读取失败，请重试')
  }
}
