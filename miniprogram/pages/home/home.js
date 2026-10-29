/**
 * P-01 首页
 *
 * 状态机：loading → 正常（未提交 / 待补齐 / 已完整）/ 编辑未保存 / 保存中 / 保存失败 / 读取失败
 * 规则要点：
 * - 默认红色「是」只是待提交值；打开页面或仅切换按钮不产生云端记录。
 * - 是否刷手机 + 准备入睡时间通过「几点睡」确认原子保存（saveBedtime）。
 * - 起床时间通过「几点起」确认保存（saveWakeTime），需已有睡前记录。
 * - 保存成功进入刚保存记录所属的周报；失败保留输入可重试。
 * - 页面停留跨过 12:00 自动刷新周期；周期过期由服务端最终判定。
 */
const api = require('../../utils/api.js')
const T = require('../../utils/time.js')

Page({
  data: {
    // 自定义导航
    statusBarHeight: 20,
    navHeight: 44,

    // 加载状态
    loading: true,
    loadFailed: false,
    loadErrorMsg: '',

    // 周期信息
    todayText: '',
    tagline: '记录睡前是否刷手机，看看每周的改变',
    periodDate: '',
    periodDateText: '',
    deadlineText: '',
    deadlineDayWord: '次日',
    firstUse: false,

    // 大按钮与记录状态
    pendingPhone: true,
    phoneSaved: null,
    hasSaved: false,
    dirty: false,
    sleepText: null,
    wakeText: null,
    statusText: '',
    statusWarn: false,
    saving: false,
    saveFailed: false,

    // 结果横幅（服务端判定）
    banner: { show: false, cls: 'pending', title: '', desc: '' },

    // 目标入口
    targetValueText: '未设置',
    targetSubText: '不检查按时睡觉',

    // 周报快捷卡片
    weekCardVisible: false,
    weekMetCount: 0,
    weekCompleteCount: 0,

    // 几点睡弹层
    sleepSheet: {
      visible: false,
      submitting: false,
      errorText: '',
      title: '今天几点睡',
      desc: '',
      hint: '',
      day0Label: '',
      day1Label: '',
      seg1Disabled: false,
      initialSeg: 0,
      initialTime: '23:00'
    },

    // 几点起弹层
    wakeSheet: {
      visible: false,
      submitting: false,
      errorText: '',
      title: '明天几点起',
      desc: '',
      hint: '',
      day0Label: '',
      day1Label: '',
      seg1Disabled: false,
      initialSeg: 0,
      initialTime: '07:30'
    },

    // 目标弹层
    targetSheet: {
      visible: false,
      submitting: false,
      errorText: '',
      initialEnabled: false,
      initialTime: '23:30',
      tonightSubmitted: false,
      tonightTargetText: '未设置',
      nextTargetText: '未设置',
      nextDateText: '',
      isFirstSetting: true
    }
  },

  // 非渲染态数据
  record: null,
  periodDate: '',
  tonightTarget: null,
  nextTarget: null,
  targetExists: false,
  hasAnyRecord: false,
  periodTimer: null,

  onLoad() {
    this.initNav()
  },

  onShow() {
    // 返回首页重新读取当前周期
    this.fetchAll()
    this.startPeriodWatcher()
  },

  onHide() {
    this.stopPeriodWatcher()
  },

  onUnload() {
    this.stopPeriodWatcher()
  },

  initNav() {
    try {
      const win = wx.getWindowInfo()
      const rect = wx.getMenuButtonBoundingClientRect()
      const navHeight = Math.max(44, (rect.top - win.statusBarHeight) * 2 + rect.height)
      this.setData({
        statusBarHeight: win.statusBarHeight || 20,
        navHeight
      })
    } catch (e) {
      /* 使用默认值 */
    }
  },

  /* ---------------- 数据读取 ---------------- */

  fetchAll() {
    this.setData({ loading: true, loadFailed: false })
    // 主数据：当前周期记录（关键路径，失败进入错误态）
    api
      .call('getCurrentRecord')
      .then((cur) => {
        this.applyCurrent(cur)
        this.setData({ loading: false })
        this.renderStates()
      })
      .catch((e) => this.handleLoadFail(e))
    // 次要数据：本周汇总（失败仅隐藏快捷卡片，不阻塞首页）
    api
      .call('getWeeklyReport', { weekStart: T.mondayOf(T.periodDateOf(new Date())) })
      .then((week) => {
        this.setData({
          weekCardVisible: true,
          weekMetCount: week.metCount || 0,
          weekCompleteCount: week.completeCount || 0
        })
      })
      .catch(() => {
        this.setData({ weekCardVisible: false })
      })
  },

  handleLoadFail(e) {
    this.setData({
      loading: false,
      loadFailed: true,
      loadErrorMsg: (e && e.message) || '读取失败，请重试'
    })
  },

  applyCurrent(cur) {
    const rec = cur.record || null
    this.record = rec
    this.periodDate = cur.periodDate
    this.tonightTarget = cur.tonightTarget || null
    this.nextTarget = cur.nextTarget || null
    this.targetExists = !!cur.targetExists
    this.hasAnyRecord = !!cur.hasAnyRecord

    const periodD = T.parseDT(cur.periodDate + ' 12:00')
    const now = new Date()
    const deadlineDayWord =
      T.fmtDate(T.periodEnd(cur.periodDate)) === T.fmtDate(now) ? '今天' : '次日'

    const savedPhone = rec && (rec.phone_used === true || rec.phone_used === false) ? rec.phone_used : null
    const pendingPhone = savedPhone === null ? true : savedPhone

    this.setData({
      periodDate: cur.periodDate,
      periodDateText: T.fmtMD(periodD),
      deadlineText: cur.deadlineText,
      deadlineDayWord,
      todayText: T.fmtMD(now) + ' · 周' + T.WEEK_CN[(now.getDay() + 6) % 7],
      firstUse: !this.hasAnyRecord,
      pendingPhone,
      phoneSaved: savedPhone,
      hasSaved: savedPhone !== null,
      sleepText: rec && rec.bedtime_at ? rec.bedtime_at.slice(11, 16) : null,
      wakeText: rec && rec.wake_at ? rec.wake_at.slice(11, 16) : null,
      saveFailed: false,
      targetSheet: {
        visible: false,
        submitting: false,
        errorText: '',
        initialEnabled: !!(this.tonightTarget || this.nextTarget),
        initialTime: (this.nextTarget && this.nextTarget.time) || (this.tonightTarget && this.tonightTarget.time) || '23:30',
        tonightSubmitted: !!(rec && rec.bedtime_at),
        tonightTargetText: this.tonightTarget ? this.tonightTarget.time : '未设置',
        nextTargetText: this.nextTarget ? this.nextTarget.time : '未设置',
        nextDateText: T.fmtMD(T.parseDT(T.addDays(cur.periodDate, 1) + ' 12:00')),
        isFirstSetting: !this.targetExists
      }
    })
    this.renderBanner()
  },

  /* ---------------- 状态渲染 ---------------- */

  renderStates() {
    const d = this.data
    let statusText = ''
    let statusWarn = false

    if (d.saving) {
      statusText = '正在保存……'
    } else if (d.saveFailed) {
      statusText = '保存失败，请重试'
      statusWarn = true
    } else if (d.hasSaved) {
      if (d.dirty) {
        statusText = '有修改尚未保存 · 确认几点睡后保存'
        statusWarn = true
      } else if (d.wakeText) {
        statusText = '已完整打卡 · ' + d.deadlineDayWord + ' 12:00 前仍可修改'
      } else {
        statusText = '待补齐起床时间，请于' + d.deadlineDayWord + ' 12:00 前完成'
      }
    } else {
      if (d.firstUse && d.pendingPhone) {
        statusText = '今天开始 · 默认「是」只是待提交值，确认几点睡后才记录'
      } else if (!d.pendingPhone) {
        statusText = '已切换为「否」· 确认几点睡后才保存'
        statusWarn = true
      } else {
        statusText = '默认「是」只是待提交值 · 确认几点睡后才记录'
      }
    }

    this.setData({ statusText, statusWarn })
  },

  renderBanner() {
    const rec = this.record
    let banner = { show: false, cls: 'pending', title: '', desc: '' }
    if (rec && rec.bedtime_at) {
      const ev = rec.eval || {}
      if (!ev.complete) {
        banner = {
          show: true,
          cls: 'pending',
          title: '待补齐起床时间',
          desc: '请于' + this.data.deadlineDayWord + ' 12:00 前点击「几点起」补齐，补齐后才计算本晚是否达标。'
        }
      } else if (ev.met) {
        banner = {
          show: true,
          cls: 'ok',
          title: '本晚已达标',
          desc: '完整打卡 · 没刷手机' + (rec.target_snapshot_at ? ' · 不晚于目标 ' + rec.target_snapshot_at.slice(11, 16) : '')
        }
      } else {
        banner = {
          show: true,
          cls: 'bad',
          title: '已完成，但未达标',
          desc: '未达标原因：' + (ev.reasons || []).join('、')
        }
      }
    }
    this.setData({ banner })
    this.renderTargetRow()
  },

  renderTargetRow() {
    const t = this.tonightTarget
    const rec = this.record
    let targetValueText = '未设置'
    let targetSubText = '不检查按时睡觉'
    if (t) {
      targetValueText = t.time
      targetSubText =
        rec && rec.bedtime_at
          ? '本晚按 ' + t.time + ' 计算 · 修改次晚生效'
          : '本晚生效 · 每晚沿用'
    } else if (this.nextTarget) {
      targetValueText = '下一晚 ' + this.nextTarget.time
      targetSubText = '本晚不检查按时睡觉'
    } else if (this.targetExists) {
      targetSubText = '目标已关闭 · 重新开启次晚生效'
    }
    this.setData({ targetValueText, targetSubText })
  },

  /* ---------------- 大按钮 ---------------- */

  onTogglePhone() {
    if (this.data.saving) return
    const pendingPhone = !this.data.pendingPhone
    const dirty = this.data.hasSaved && pendingPhone !== this.data.phoneSaved
    this.setData({ pendingPhone, dirty, saveFailed: false })
    this.renderStates()
  },

  /* ---------------- 几点睡 ---------------- */

  openSleepSheet() {
    if (this.data.saving) return
    const saved = this.record && this.record.bedtime_at ? this.record.bedtime_at : null
    let initialSeg = 0
    let initialTime = ''
    if (saved) {
      initialSeg = saved.slice(0, 10) === this.periodDate ? 0 : 1
      initialTime = saved.slice(11, 16)
    } else {
      const nf = T.nowFloor()
      initialSeg = T.fmtDate(nf) === this.periodDate ? 0 : 1
      initialTime = T.fmtDT(nf).slice(11, 16)
    }
    const seg1Disabled = !(new Date() < T.periodEnd(this.periodDate))
    const pmd = this.data.periodDateText
    this.setData({
      'sleepSheet.visible': true,
      'sleepSheet.errorText': '',
      'sleepSheet.submitting': false,
      'sleepSheet.title': '今天几点睡',
      'sleepSheet.desc': '记录归属：' + pmd + ' 这一晚 · 须在这一晚时间内',
      'sleepSheet.hint': '新记录默认当前时间；仅记录你自报的准备入睡时间，不测真实入睡。',
      'sleepSheet.day0Label': T.pickerDayLabel(this.periodDate),
      'sleepSheet.day1Label': T.pickerDayLabel(T.addDays(this.periodDate, 1)),
      'sleepSheet.seg1Disabled': seg1Disabled,
      'sleepSheet.initialSeg': initialSeg,
      'sleepSheet.initialTime': initialTime
    })
  },

  onSleepConfirm(e) {
    const { seg, time } = e.detail
    const err = this.validateSleep(seg, time)
    if (err) {
      this.setData({ 'sleepSheet.errorText': err })
      return
    }
    const dt = (seg === 0 ? this.periodDate : T.addDays(this.periodDate, 1)) + ' ' + time
    this.setData({ 'sleepSheet.submitting': true, 'sleepSheet.errorText': '', saving: true })
    this.renderStates()
    api
      .call('saveBedtime', {
        requestId: api.genRequestId(),
        recordDate: this.periodDate,
        phoneUsed: this.data.pendingPhone,
        bedtimeAt: dt,
        baseRevision: this.record ? this.record.revision || 0 : null
      })
      .then((res) => {
        this.record = res.record || null
        this.setData({
          'sleepSheet.visible': false,
          'sleepSheet.submitting': false,
          saving: false,
          saveFailed: false,
          hasSaved: true,
          phoneSaved: this.data.pendingPhone,
          dirty: false,
          sleepText: this.record && this.record.bedtime_at ? this.record.bedtime_at.slice(11, 16) : null
        })
        this.renderBanner()
        this.renderStates()
        this.goReportOf(this.periodDate)
      })
      .catch((err2) => this.handleSaveError(err2, 'sleepSheet'))
  },

  validateSleep(seg, time) {
    if (seg === 0 && time < '12:00') return '准备入睡时间需在 12:00 之后（12:00 前属于前一晚）'
    if (seg === 1 && time >= '12:00') return '次日时间需在 12:00 之前（12:00 起开始新的一晚）'
    const dt = (seg === 0 ? this.periodDate : T.addDays(this.periodDate, 1)) + ' ' + time
    const t = T.parseDT(dt)
    if (!t) return '请选择有效时间'
    if (t > T.nowFloor()) return '准备入睡时间不能晚于当前时间'
    if (this.record && this.record.wake_at && t >= T.parseDT(this.record.wake_at)) {
      return '新的准备入睡时间晚于已填写的起床时间（' + this.record.wake_at.slice(11, 16) + '），请先修改起床时间'
    }
    return ''
  },

  /* ---------------- 几点起 ---------------- */

  openWakeSheet() {
    if (this.data.saving) return
    if (!this.record || !this.record.bedtime_at) {
      wx.showToast({ title: '建议先填写「几点睡」，再补录起床时间', icon: 'none', duration: 2400 })
      this.openSleepSheet()
      return
    }
    const saved = this.record.wake_at
    let initialSeg = 0
    let initialTime = ''
    if (saved) {
      initialSeg = saved.slice(0, 10) === this.periodDate ? 0 : 1
      initialTime = saved.slice(11, 16)
    } else {
      const nf = T.nowFloor()
      initialSeg = T.fmtDate(nf) === this.periodDate ? 0 : 1
      initialTime = T.fmtDT(nf).slice(11, 16)
    }
    const seg1Disabled = !(new Date() < T.periodEnd(this.periodDate))
    this.setData({
      'wakeSheet.visible': true,
      'wakeSheet.errorText': '',
      'wakeSheet.submitting': false,
      'wakeSheet.title': this.data.periodDateText + ' 这晚几点起',
      'wakeSheet.desc': '补齐 ' + this.data.periodDateText + ' 这一晚 · 须在' + this.data.deadlineDayWord + ' 12:00 前',
      'wakeSheet.hint': '起床时间须晚于准备入睡时间（' + this.data.sleepText + '），且不能晚于当前时间。',
      'wakeSheet.day0Label': T.pickerDayLabel(this.periodDate),
      'wakeSheet.day1Label': T.pickerDayLabel(T.addDays(this.periodDate, 1)),
      'wakeSheet.seg1Disabled': seg1Disabled,
      'wakeSheet.initialSeg': initialSeg,
      'wakeSheet.initialTime': initialTime
    })
  },

  onWakeConfirm(e) {
    const { seg, time } = e.detail
    const err = this.validateWake(seg, time)
    if (err) {
      this.setData({ 'wakeSheet.errorText': err })
      return
    }
    const dt = (seg === 0 ? this.periodDate : T.addDays(this.periodDate, 1)) + ' ' + time
    this.setData({ 'wakeSheet.submitting': true, 'wakeSheet.errorText': '', saving: true })
    this.renderStates()
    api
      .call('saveWakeTime', {
        requestId: api.genRequestId(),
        recordDate: this.periodDate,
        wakeAt: dt,
        baseRevision: this.record ? this.record.revision || 0 : null
      })
      .then((res) => {
        this.record = res.record || null
        const ev = (this.record && this.record.eval) || {}
        this.setData({
          'wakeSheet.visible': false,
          'wakeSheet.submitting': false,
          saving: false,
          saveFailed: false,
          wakeText: this.record && this.record.wake_at ? this.record.wake_at.slice(11, 16) : null
        })
        this.renderBanner()
        this.renderStates()
        wx.showToast({ title: ev.met ? '已补齐 · 本晚达标' : '已补齐 · 本晚未达标', icon: 'none' })
        this.goReportOf(this.periodDate)
      })
      .catch((err2) => this.handleSaveError(err2, 'wakeSheet'))
  },

  validateWake(seg, time) {
    if (seg === 0 && time < '12:00') return '起床时间需在 12:00 之后'
    if (seg === 1 && time >= '12:00') return '起床时间需在次日 12:00 之前'
    const dt = (seg === 0 ? this.periodDate : T.addDays(this.periodDate, 1)) + ' ' + time
    const t = T.parseDT(dt)
    if (!t) return '请选择有效时间'
    if (t > T.nowFloor()) return '起床时间不能晚于当前时间'
    if (this.record && this.record.bedtime_at && t <= T.parseDT(this.record.bedtime_at)) {
      return '起床时间需晚于准备入睡时间（' + this.record.bedtime_at.slice(11, 16) + '）'
    }
    return ''
  },

  /* ---------------- 保存失败统一处理 ---------------- */

  handleSaveError(e, sheetKey) {
    const patch = { saving: false }
    if (sheetKey) patch[sheetKey + '.submitting'] = false
    const code = e && e.code
    if (code === 'E_PERIOD_EXPIRED') {
      if (sheetKey) patch[sheetKey + '.visible'] = false
      this.setData(patch)
      wx.showToast({ title: '已超过补录时间，下一晚再来记录', icon: 'none', duration: 2600 })
      this.fetchAll()
      return
    }
    if (code === 'E_CONFLICT') {
      if (sheetKey) patch[sheetKey + '.visible'] = false
      this.setData(patch)
      wx.showToast({ title: '记录已有更新，已重新读取，请重试', icon: 'none' })
      this.fetchAll()
      return
    }
    if (code === 'E_ENV') {
      if (sheetKey) patch[sheetKey + '.visible'] = false
      this.setData(patch)
      this.handleLoadFail(e)
      return
    }
    if (sheetKey) patch[sheetKey + '.errorText'] = e.message || '保存失败，请重试'
    this.setData(patch)
    this.setData({ saveFailed: true })
    this.renderStates()
  },

  /* ---------------- 目标弹层 ---------------- */

  openTargetSheet() {
    if (this.data.saving) return
    this.setData({ 'targetSheet.visible': true, 'targetSheet.errorText': '' })
  },

  onTargetSave(e) {
    const { enabled, time } = e.detail
    this.setData({ 'targetSheet.submitting': true, 'targetSheet.errorText': '' })
    api
      .call('updateTarget', { requestId: api.genRequestId(), enabled, targetTime: time })
      .then((res) => {
        const isTonight = res.effectiveDate === this.periodDate
        this.setData({
          'targetSheet.visible': false,
          'targetSheet.submitting': false
        })
        wx.showToast({
          title: !enabled
            ? '目标已关闭 · 从下一晚生效'
            : isTonight
              ? '目标已保存 · 本晚生效'
              : '目标已保存 · 从下一晚生效',
          icon: 'none'
        })
        this.fetchAll()
      })
      .catch((err) => {
        if (err.code === 'E_ENV') {
          this.setData({ 'targetSheet.visible': false, 'targetSheet.submitting': false })
          this.handleLoadFail(err)
          return
        }
        this.setData({
          'targetSheet.submitting': false,
          'targetSheet.errorText': err.message || '保存失败，请重试'
        })
      })
  },

  onSheetCancel(e) {
    const key = e.currentTarget.dataset.sheet
    this.setData({ [key + '.visible']: false, [key + '.errorText']: '' })
  },

  /* ---------------- 周报入口与周期 watcher ---------------- */

  goReport() {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  goReportOf(recordDate) {
    const weekStart = T.mondayOf(recordDate)
    wx.navigateTo({ url: '/pages/report/report?weekStart=' + weekStart })
  },

  startPeriodWatcher() {
    this.stopPeriodWatcher()
    this.periodTimer = setInterval(() => {
      if (this.data.saving || this.data.sleepSheet.submitting || this.data.wakeSheet.submitting) return
      const p = T.periodDateOf(new Date())
      if (this.periodDate && p !== this.periodDate) {
        this.fetchAll()
      }
    }, 20000)
  },

  stopPeriodWatcher() {
    if (this.periodTimer) {
      clearInterval(this.periodTimer)
      this.periodTimer = null
    }
  },

  onRetry() {
    this.fetchAll()
  }
})
