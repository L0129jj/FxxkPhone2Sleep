/**
 * C-02 目标就寝时间设置弹层
 *
 * 属性：
 * - visible / submitting / errorText
 * - initialEnabled / initialTime：打开时的开关与时间
 * - tonightSubmitted：本晚是否已提交睡前记录
 * - tonightTargetText / nextTargetText：当晚目标与下一晚安排文案（'23:30' 或 '未设置'）
 * - nextDateText：下一晚日期文案（如 '10月29日'），用于生效说明
 * - isFirstSetting：用户是否从未设置过目标（决定首次设置可否对本晚生效）
 *
 * 事件：save { enabled, time } / cancel
 */
Component({
  properties: {
    theme: { type: String, value: 'light' },
    visible: { type: Boolean, value: false },
    submitting: { type: Boolean, value: false },
    errorText: { type: String, value: '' },
    initialEnabled: { type: Boolean, value: false },
    initialTime: { type: String, value: '23:30' },
    tonightSubmitted: { type: Boolean, value: false },
    tonightTargetText: { type: String, value: '未设置' },
    nextTargetText: { type: String, value: '未设置' },
    nextDateText: { type: String, value: '' },
    isFirstSetting: { type: Boolean, value: true }
  },
  data: {
    switchOn: false,
    timeValue: '23:30',
    hintText: '',
    hintLocked: false
  },
  observers: {
    'visible, initialEnabled, initialTime'(v) {
      if (v) {
        this.setData({
          switchOn: this.data.initialEnabled,
          timeValue: this.data.initialTime || '23:30'
        })
        this.updateHint()
      }
    }
  },
  methods: {
    updateHint() {
      const { switchOn, tonightSubmitted, isFirstSetting, nextDateText, tonightTargetText } = this.data
      let hintText = ''
      let hintLocked = false
      if (tonightSubmitted) {
        hintLocked = true
        hintText = '本晚目标已锁定为 ' + tonightTargetText + '；本次修改自下一晚（' + nextDateText + '）生效，不影响本晚结果。'
      } else if (!isFirstSetting) {
        hintLocked = true
        hintText = switchOn
          ? '修改自下一晚（' + nextDateText + '）生效，本晚仍按原目标计算。'
          : '关闭自下一晚（' + nextDateText + '）生效，本晚仍按原目标计算。'
      } else if (switchOn) {
        hintText = '今晚尚未提交睡前记录，保存后对本晚生效。'
      } else {
        hintText = '当前未设置目标，不检查按时睡觉。'
      }
      this.setData({ hintText, hintLocked })
    },
    onToggleSwitch() {
      if (this.data.submitting) return
      this.setData({ switchOn: !this.data.switchOn })
      this.updateHint()
    },
    onTimeChange(e) {
      this.setData({ timeValue: e.detail.value })
    },
    onCancel() {
      if (this.data.submitting) return
      this.triggerEvent('cancel')
    },
    onSave() {
      if (this.data.submitting) return
      this.triggerEvent('save', { enabled: this.data.switchOn, time: this.data.timeValue })
    },
    noop() {}
  }
})
