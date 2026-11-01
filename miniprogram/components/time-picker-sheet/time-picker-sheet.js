/**
 * C-01 时间选择器弹层
 *
 * 结构选择（哪一天 + 几点）由父页面计算后传入；组件只负责展示与收集，
 * 时间合法性校验由父页面（及云函数）完成。
 *
 * 属性：
 * - visible / mode('sleep'|'wake') / submitting / errorText
 * - title / desc / hint：文案
 * - day0Label / day1Label：两个可选日期按钮文案（如 '10月28日 周三'）
 * - seg1Disabled：第二天是否不可选（未来时间）
 * - initialSeg / initialTime：打开时的默认选择
 *
 * 事件：confirm { dt: 'YYYY-MM-DD HH:mm' } / cancel
 */
Component({
  options: {
    multipleSlots: false
  },
  properties: {
    theme: { type: String, value: 'light' },
    visible: { type: Boolean, value: false },
    mode: { type: String, value: 'sleep' },
    submitting: { type: Boolean, value: false },
    errorText: { type: String, value: '' },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    hint: { type: String, value: '' },
    day0Label: { type: String, value: '' },
    day1Label: { type: String, value: '' },
    seg1Disabled: { type: Boolean, value: false },
    initialSeg: { type: Number, value: 0 },
    initialTime: { type: String, value: '23:00' }
  },
  data: {
    seg: 0,
    timeValue: '23:00'
  },
  observers: {
    'visible, initialSeg, initialTime'(v) {
      if (v) {
        this.setData({
          seg: this.data.initialSeg,
          timeValue: this.data.initialTime
        })
      }
    }
  },
  methods: {
    onPickSeg(e) {
      const seg = +e.currentTarget.dataset.seg
      if (seg === 1 && this.data.seg1Disabled) return
      this.setData({ seg })
    },
    onTimeChange(e) {
      this.setData({ timeValue: e.detail.value })
    },
    onCancel() {
      if (this.data.submitting) return
      this.triggerEvent('cancel')
    },
    onConfirm() {
      if (this.data.submitting) return
      // 由父页面把 seg 换算成完整日期
      this.triggerEvent('confirm', { seg: this.data.seg, time: this.data.timeValue })
    },
    noop() {}
  }
})
