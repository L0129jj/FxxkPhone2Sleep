/**
 * FxxkPhone2Sleep 入口
 *
 * 云环境配置说明：
 * - 若你的云开发环境只有一个，保持 CLOUD_ENV_ID 为空字符串即可（自动使用默认环境）。
 * - 若有多个环境，把环境 ID 填入 CLOUD_ENV_ID（形如 'cloud1-2gxxxxx'，
 *   可在微信开发者工具「云开发」控制台 → 设置 → 环境名称 处查看）。
 */
const CLOUD_ENV_ID = ''

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库过低，无法使用云能力，请升级微信')
      this.globalData.cloudReady = false
      return
    }
    wx.cloud.init(
      CLOUD_ENV_ID ? { env: CLOUD_ENV_ID, traceUser: true } : { traceUser: true }
    )
    this.globalData.cloudReady = true
  },
  globalData: {
    cloudReady: false
  }
})
