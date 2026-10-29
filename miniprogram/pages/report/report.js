/**
 * P-02 周报页
 *
 * - 主动进入默认当前自然周；保存后可带 weekStart 进入所属周（周一上午补录周日晚
 *   记录时会落在上一周）。
 * - 七个日项展示归属日期、三项记录、当晚目标及结果；缺失字段显示「未填写」。
 * - 提供上一周 / 下一周切换，不浏览未来周；最早可查看周为首次使用所在周。
 * - 读取失败显示错误与重试入口，不将失败伪装成零达标。
 */
const api = require('../../utils/api.js')
const T = require('../../utils/time.js')

const BADGE = {
  met: { label: '已达标', cls: 'ok' },
  missed: { label: '已完成 · 未达标', cls: 'bad' },
  incomplete: { label: '未完成打卡', cls: 'muted' },
  pending_sleep: { label: '待提交睡前记录', cls: 'pending' },
  pending_wake: { label: '待补齐起床时间', cls: 'pending' },
  not_started: { label: '未开始', cls: 'future' },
  not_used: { label: '未使用', cls: 'future' }
}

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 44,
    loading: true,
    loadFailed: false,
    loadErrorMsg: '',

    weekRange: '',
    weekLabelText: '本周',
    summaryLabel: '本周已达标',
    metCount: 0,
    metPct: 0,
    completeCount: 0,
    dots: [],
    firstUseHint: false,
    todayTag: '',

    days: [],
    canPrev: false,
    canNext: false
  },

  weekStart: '',
  earliestWeekStart: '',
  currentWeekStart: '',

  onLoad(options) {
    this.initNav()
    let weekStart = ''
    if (options && options.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(options.weekStart)) {
      weekStart = options.weekStart
    }
    if (!weekStart) {
      weekStart = T.mondayOf(T.periodDateOf(new Date()))
    }
    this.fetch(weekStart)
  },

  initNav() {
    try {
      const win = wx.getWindowInfo()
      const rect = wx.getMenuButtonBoundingClientRect()
      this.setData({
        statusBarHeight: win.statusBarHeight || 20,
        navHeight: Math.max(44, (rect.top - win.statusBarHeight) * 2 + rect.height)
      })
    } catch (e) {
      /* 使用默认值 */
    }
  },

  fetch(weekStart) {
    this.setData({ loading: true, loadFailed: false })
    api
      .call('getWeeklyReport', { weekStart })
      .then((res) => {
        this.weekStart = res.weekStart
        this.earliestWeekStart = res.earliestWeekStart || res.weekStart
        this.currentWeekStart = res.currentWeekStart || res.weekStart
        this.render(res)
      })
      .catch((e) => {
        // 越界时自动收敛到合法周，其余情况展示错误与重试
        if (e && e.code === 'E_WEEK_INVALID' && e.data && e.data.earliestWeekStart) {
          this.fetch(e.data.earliestWeekStart)
          return
        }
        this.setData({
          loading: false,
          loadFailed: true,
          loadErrorMsg: (e && e.message) || '读取失败，请重试'
        })
      })
  },

  render(res) {
    const days = (res.days || []).map((d, i) => {
      const badge = BADGE[d.status] || BADGE.not_started
      const tags = []
      if (d.status === 'pending_sleep') {
        tags.push({ text: '睡前记录未提交', cls: '' })
      }
      if (d.phone_used === true) tags.push({ text: '刷了手机', cls: 'warn' })
      else if (d.phone_used === false) tags.push({ text: '没刷手机', cls: 'good' })
      if (d.target) tags.push({ text: '目标 ' + d.target, cls: '' })

      const completeLike = d.status === 'met' || d.status === 'missed'
      return {
        date: d.date,
        dayNum: +d.date.slice(8, 10),
        weekday: d.weekday,
        status: d.status,
        bedtime: d.bedtime,
        wake: d.wake,
        badgeLabel: badge.label,
        badgeCls: badge.cls,
        tags,
        reasonText: (d.reasons || []).join('、'),
        editable: completeLike && !d.closed,
        isCurrent: false
      }
    })
    // 当前周才高亮「今晚」所在日项
    if (res.isCurrentWeek) {
      const p = T.periodDateOf(new Date())
      days.forEach((x) => {
        x.isCurrent = x.date === p
      })
    }

    const weekEnd = T.parseDT(res.weekEnd + ' 12:00')
    this.setData({
      loading: false,
      weekRange: T.fmtMD(T.parseDT(res.weekStart + ' 12:00')) + ' – ' + T.fmtMD(weekEnd),
      weekLabelText: res.isCurrentWeek ? '本周' : '历史周 · 只读',
      summaryLabel: res.isCurrentWeek ? '本周已达标' : '该周已达标',
      metCount: res.metCount,
      metPct: Math.round(((res.metCount || 0) / 7) * 100),
      completeCount: res.completeCount,
      dots: (res.days || []).map((d, i) => ({ key: i, on: d.status === 'met' })),
      firstUseHint: res.isCurrentWeek && !res.hasAnyRecord,
      todayTag: res.isCurrentWeek
        ? '今天 · 周' + T.WEEK_CN[(new Date().getDay() + 6) % 7]
        : '历史周 · 只读',
      days,
      canPrev: res.weekStart > (this.earliestWeekStart || res.weekStart),
      canNext: res.weekStart < (this.currentWeekStart || res.weekStart)
    })
  },

  currentPeriodDateLocal() {
    return T.periodDateOf(new Date())
  },

  onPrevWeek() {
    if (!this.data.canPrev || this.data.loading) return
    this.fetch(T.addDays(this.weekStart, -7))
  },

  onNextWeek() {
    if (!this.data.canNext || this.data.loading) return
    this.fetch(T.addDays(this.weekStart, 7))
  },

  onRetry() {
    this.fetch(this.weekStart || T.mondayOf(T.periodDateOf(new Date())))
  },

  onBack() {
    wx.navigateBack({
      fail() {
        wx.reLaunch({ url: '/pages/home/home' })
      }
    })
  }
})
