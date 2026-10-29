'use strict'

/**
 * 业务核心库（云函数共享逻辑，时区无关实现）
 *
 * - 固定使用东八区（Asia/Shanghai）本地时间口径，所有换算基于 UTC 毫秒 + 8 小时偏移，
 *   不依赖运行环境的 TZ 设置。
 * - 记录周期：归属日期 D 的一晚 = D 日 12:00（含）至 D+1 日 12:00（不含）。
 * - 截止：D+1 日 12:00（服务端时间判定，11:59:59 可保存，12:00:00 拒绝）。
 * - 周口径：周一至周日，按归属日期。
 * - 目标时刻按同一周期解释：12:00–23:59 → D 日，00:00–11:59 → D+1 日。
 */

const CST = 8 * 3600 * 1000
const DAY = 24 * 3600 * 1000

/* ---------------- 基础时间换算 ---------------- */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

function isDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || '')
}

function isDTStr(s) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s || '')
}

function isHMStr(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '')
}

/** 'YYYY-MM-DD HH:mm'（东八区）→ UTC 毫秒；非法返回 NaN */
function parseDT(s) {
  if (!isDTStr(s)) return NaN
  const y = +s.slice(0, 4)
  const mo = +s.slice(5, 7)
  const d = +s.slice(8, 10)
  const hh = +s.slice(11, 13)
  const mm = +s.slice(14, 16)
  const t = new Date(Date.UTC(y, mo - 1, d, hh, mm))
  if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return NaN
  return t.getTime() - CST
}

/** UTC 毫秒 → 'YYYY-MM-DD HH:mm'（东八区） */
function fmtDT(epoch) {
  const d = new Date(epoch + CST)
  return (
    d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()) +
    ' ' + pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes())
  )
}

/** UTC 毫秒 → 'YYYY-MM-DD'（东八区） */
function fmtDate(epoch) {
  return fmtDT(epoch).slice(0, 10)
}

/** 'HH:mm' → 分钟数 */
function hmMin(hm) {
  return +hm.slice(0, 2) * 60 + +hm.slice(3, 5)
}

/** 当前服务端时刻：{ epoch, floorEpoch, dt, date }（dt 为取整到分钟的东八区时间串） */
function nowInfo() {
  const epoch = Date.now()
  const floorEpoch = Math.floor(epoch / 60000) * 60000
  const dt = fmtDT(floorEpoch)
  return { epoch, floorEpoch, dt, date: dt.slice(0, 10) }
}

/** 记录归属日期：东八区 12:00 前属于前一天 */
function periodDateOf(epoch) {
  const hh = new Date(epoch + CST).getUTCHours()
  return fmtDate(hh < 12 ? epoch - DAY : epoch)
}

/** 周期起点：D 日 12:00 */
function periodStart(dateStr) {
  return parseDT(dateStr + ' 12:00')
}

/** 周期终点（同时是截止时间）：D+1 日 12:00 */
function periodEnd(dateStr) {
  return parseDT(dateStr + ' 12:00') + DAY
}

/** 日期加减 n 天（以 12:00 为锚点），返回 'YYYY-MM-DD' */
function addDays(dateStr, n) {
  return fmtDate(parseDT(dateStr + ' 12:00') + n * DAY)
}

/** 'YYYY-MM-DD' 所在周的周一（按归属日期口径） */
function mondayOf(dateStr) {
  const noonUTC = parseDT(dateStr + ' 12:00') + CST
  const diff = (new Date(noonUTC).getUTCDay() + 6) % 7
  return fmtDate(noonUTC - diff * DAY)
}

/** 目标 'HH:mm' → 当晚完整时间：12:00–23:59 → D；00:00–11:59 → D+1 */
function targetSnapshotAt(dateStr, hm) {
  if (hmMin(hm) >= 720) return dateStr + ' ' + hm
  return addDays(dateStr, 1) + ' ' + hm
}

/* ---------------- 记录判定 ---------------- */

/**
 * 按记录与当前时间推导状态。
 * status: met | missed | incomplete | pending_sleep | pending_wake | not_started
 */
function evaluateRecord(rec, nowEpoch) {
  const D = rec.record_date
  const started = nowEpoch >= periodStart(D)
  const closed = nowEpoch >= periodEnd(D)
  const phoneSaved = rec.phone_used === false || rec.phone_used === true
  const complete = phoneSaved && !!rec.bedtime_at && !!rec.wake_at
  let status
  let met = false
  const reasons = []
  if (complete) {
    if (rec.phone_used === true) reasons.push('刷了手机')
    if (rec.target_snapshot_at) {
      const bed = parseDT(rec.bedtime_at)
      const target = parseDT(rec.target_snapshot_at)
      if (bed > target) reasons.push('晚于目标 ' + rec.target_snapshot_at.slice(11, 16))
    }
    met = reasons.length === 0
    status = met ? 'met' : 'missed'
  } else if (closed) {
    status = 'incomplete'
  } else if (started) {
    status = rec.bedtime_at ? 'pending_wake' : 'pending_sleep'
  } else {
    status = 'not_started'
  }
  return { started, closed, complete, status, met, reasons }
}

function withEval(rec, nowEpoch) {
  if (!rec) return null
  return Object.assign({}, rec, { eval: evaluateRecord(rec, nowEpoch) })
}

/** 空记录（无云端记录时的推导底板） */
function emptyRecord(dateStr) {
  return {
    owner_id: '',
    record_date: dateStr,
    phone_used: null,
    bedtime_at: null,
    wake_at: null,
    target_snapshot_at: null
  }
}

/* ---------------- 目标设置 ---------------- */

/**
 * 在设置列表中解析某一晚生效的目标。
 * 规则：取 effective_record_date <= D 中日期最大者；同日取 created_at 最晚（最后保存为准）。
 * enabled=false 视为无目标。返回 { time, snapshotAt } 或 null。
 */
function effectiveTarget(settings, dateStr) {
  let best = null
  for (const s of settings) {
    if (!s || s.effective_record_date > dateStr) continue
    if (
      !best ||
      s.effective_record_date > best.effective_record_date ||
      (s.effective_record_date === best.effective_record_date &&
        (s.created_at || 0) > (best.created_at || 0))
    ) {
      best = s
    }
  }
  if (!best || !best.enabled || !isHMStr(best.target_time)) return null
  return { time: best.target_time, snapshotAt: targetSnapshotAt(dateStr, best.target_time) }
}

/* ---------------- 数据库辅助 ---------------- */

function recordId(openid, dateStr) {
  return openid + '_' + dateStr
}

const COLLECTIONS = ['users', 'nightly_records', 'target_settings', 'operation_logs']
let ensured = false

/** 首次调用时创建缺失集合（已存在则忽略） */
async function ensureCollections(db) {
  if (ensured) return
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
    } catch (e) {
      /* 集合已存在 */
    }
  }
  ensured = true
}

/** 确保用户档案存在（身份来自云端上下文，doc _id = openid 保证幂等） */
async function ensureUser(db, openid) {
  const coll = db.collection('users')
  try {
    const r = await coll.doc(openid).get()
    if (r && r.data) return r.data
  } catch (e) {
    /* 不存在，继续创建 */
  }
  const now = new Date()
  try {
    await coll.add({
      data: {
        _id: openid,
        owner_id: openid,
        first_used_at: now,
        local_timezone: 'Asia/Shanghai',
        created_at: now
      }
    })
  } catch (e) {
    /* 并发下已创建，读取即可 */
  }
  try {
    const r = await coll.doc(openid).get()
    return r && r.data
  } catch (e) {
    return null
  }
}

async function getRecord(db, openid, dateStr) {
  try {
    const r = await db.collection('nightly_records').doc(recordId(openid, dateStr)).get()
    return (r && r.data) || null
  } catch (e) {
    return null
  }
}

async function getSettings(db, openid) {
  try {
    const r = await db
      .collection('target_settings')
      .where({ owner_id: openid })
      .orderBy('created_at', 'asc')
      .limit(100)
      .get()
    return (r && r.data) || []
  } catch (e) {
    return []
  }
}

async function findSuccessLog(db, requestId, event) {
  if (!requestId) return null
  try {
    const r = await db
      .collection('operation_logs')
      .where({ request_id: requestId, event, result: 'success' })
      .limit(1)
      .get()
    return (r.data && r.data[0]) || null
  } catch (e) {
    return null
  }
}

/** 写操作日志；顺带以约 10% 概率清理 30 天前日志 */
async function writeLog(db, entry) {
  try {
    await db.collection('operation_logs').add({
      data: Object.assign({ created_at: new Date() }, entry)
    })
    if (Math.random() < 0.1) {
      const cutoff = new Date(Date.now() - 30 * DAY)
      await db.collection('operation_logs').where({ created_at: db.command.lt(cutoff) }).remove()
    }
  } catch (e) {
    /* 日志失败不影响主流程 */
  }
}

/* ---------------- 响应封装 ---------------- */

function ok(data) {
  return { ok: true, data: data || {} }
}

function fail(code, message, data) {
  return { ok: false, code, message, data: data || {} }
}

module.exports = {
  CST,
  DAY,
  pad2,
  isDateStr,
  isDTStr,
  isHMStr,
  parseDT,
  fmtDT,
  fmtDate,
  hmMin,
  nowInfo,
  periodDateOf,
  periodStart,
  periodEnd,
  addDays,
  mondayOf,
  targetSnapshotAt,
  evaluateRecord,
  withEval,
  emptyRecord,
  effectiveTarget,
  recordId,
  ensureCollections,
  ensureUser,
  getRecord,
  getSettings,
  findSuccessLog,
  writeLog,
  ok,
  fail
}
