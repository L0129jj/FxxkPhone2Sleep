/**
 * 时间与记录周期工具（客户端，使用设备本地时间）
 *
 * 记录周期：归属日期 D 的一晚 = D 日 12:00（含）至 D+1 日 12:00（不含）。
 * 截止时间：D+1 日 12:00。周的口径：周一至周日，按归属日期计算。
 */

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

/** Date → 'YYYY-MM-DD'（本地） */
function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

/** Date → 'M月D日' */
function fmtMD(d) {
  return d.getMonth() + 1 + '月' + d.getDate() + '日'
}

/** Date → 'YYYY-MM-DD HH:mm'（本地） */
function fmtDT(d) {
  return fmtDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

/** 'YYYY-MM-DD HH:mm'（本地） → Date；非法返回 null */
function parseDT(s) {
  if (!/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.test(s || '')) return null
  const y = +s.slice(0, 4)
  const mo = +s.slice(5, 7)
  const d = +s.slice(8, 10)
  const hh = +s.slice(11, 13)
  const mm = +s.slice(14, 16)
  const t = new Date(y, mo - 1, d, hh, mm)
  if (t.getMonth() !== mo - 1 || t.getDate() !== d) return null
  return t
}

/** 'HH:mm' → 分钟数 */
function hmMin(hm) {
  return +hm.slice(0, 2) * 60 + +hm.slice(3, 5)
}

/** 当前时刻向下取整到分钟 */
function nowFloor() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d
}

/** 当前时刻的记录归属日期 D：12:00 前属于前一天 */
function periodDateOf(d) {
  const dd = d || new Date()
  if (dd.getHours() < 12) {
    const y = new Date(dd)
    y.setDate(y.getDate() - 1)
    return fmtDate(y)
  }
  return fmtDate(dd)
}

/** 'YYYY-MM-DD' → Date（当天 12:00 锚点） */
function dateAtNoon(dateStr) {
  return parseDT(dateStr + ' 12:00')
}

/** 周期起点：D 日 12:00 */
function periodStart(dateStr) {
  return dateAtNoon(dateStr)
}

/** 周期终点 / 截止：D+1 日 12:00 */
function periodEnd(dateStr) {
  const t = dateAtNoon(dateStr)
  t.setDate(t.getDate() + 1)
  return t
}

/** 日期加减 n 天，返回 'YYYY-MM-DD' */
function addDays(dateStr, n) {
  const t = dateAtNoon(dateStr)
  t.setDate(t.getDate() + n)
  return fmtDate(t)
}

/** 'YYYY-MM-DD' 所在周的周一 */
function mondayOf(dateStr) {
  const t = dateAtNoon(dateStr)
  const diff = (t.getDay() + 6) % 7 // 周一为 0
  t.setDate(t.getDate() - diff)
  return fmtDate(t)
}

/**
 * 目标时刻 'HH:mm' 按同一周期解释为完整时间：
 * 12:00–23:59 → D 日；00:00–11:59 → D+1 日（凌晨目标按次日解释）
 */
function targetSnapshotAt(dateStr, hm) {
  if (hmMin(hm) >= 720) return dateStr + ' ' + hm
  return addDays(dateStr, 1) + ' ' + hm
}

/** 时间选择器可选的两天：D 日与 D+1 日 */
function pickerDays(periodDateStr) {
  return [
    { date: periodDateStr, label: pickerDayLabel(periodDateStr) },
    { date: addDays(periodDateStr, 1), label: pickerDayLabel(addDays(periodDateStr, 1)) }
  ]
}

function pickerDayLabel(dateStr) {
  const t = dateAtNoon(dateStr)
  return fmtMD(t) + ' 周' + WEEK_CN[(t.getDay() + 6) % 7]
}

const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日']

module.exports = {
  pad2,
  fmtDate,
  fmtMD,
  fmtDT,
  parseDT,
  hmMin,
  nowFloor,
  periodDateOf,
  periodStart,
  periodEnd,
  addDays,
  mondayOf,
  targetSnapshotAt,
  pickerDays,
  pickerDayLabel,
  WEEK_CN
}
