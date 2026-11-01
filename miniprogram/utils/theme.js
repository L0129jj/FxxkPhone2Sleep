/**
 * 主题（浅色 / 深色）
 *
 * 首次进入跟随系统主题（取不到时用浅色），用户手动切换后写入本地存储，
 * 首页与周报页共用同一份选择。
 */
const STORAGE_KEY = 'ui_theme'
const LIGHT = 'light'
const DARK = 'dark'

function resolve() {
  let theme = ''
  try {
    theme = wx.getStorageSync(STORAGE_KEY)
  } catch (e) {
    /* 读取失败按系统主题 */
  }
  if (theme === LIGHT || theme === DARK) return theme

  let sys = LIGHT
  try {
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
    if (info && info.theme === 'dark') sys = DARK
  } catch (e) {
    /* 无系统主题信息时用浅色 */
  }
  return sys
}

function save(theme) {
  try {
    wx.setStorageSync(STORAGE_KEY, theme)
  } catch (e) {
    /* 存储失败仅本次生效 */
  }
}

function toggle(theme) {
  return theme === DARK ? LIGHT : DARK
}

function applyNavStyle(theme) {
  const dark = theme === DARK
  try {
    wx.setNavigationBarColor({
      frontColor: dark ? '#ffffff' : '#000000',
      backgroundColor: dark ? '#080a12' : '#f7f4ec'
    })
  } catch (e) {
    /* 自定义导航下以页面样式为准 */
  }
  try {
    // 下拉回弹区域与状态栏底色保持一致
    wx.setBackgroundColor({
      backgroundColor: dark ? '#080a12' : '#f7f4ec',
      backgroundColorTop: dark ? '#080a12' : '#f7f4ec',
      backgroundColorBottom: dark ? '#080a12' : '#f7f4ec'
    })
  } catch (e) {
    /* 低版本基础库忽略 */
  }
}

module.exports = {
  LIGHT,
  DARK,
  resolve,
  save,
  toggle,
  applyNavStyle
}
