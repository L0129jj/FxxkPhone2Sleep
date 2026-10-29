/**
 * 云函数调用封装与错误规范化
 */

function genRequestId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function normalizeError(err) {
  if (err && err.code) return err
  const msg = String((err && err.errMsg) || (err && err.message) || '')
  // 原始错误输出到控制台，便于排查
  console.error('[api] 云调用失败原始错误:', msg || err)
  let code = 'E_NETWORK'
  let message = '网络异常，请重试'
  if (/not found|NOT_FOUND|找不到|not deploy|NOT_DEPLOY/i.test(msg)) {
    code = 'E_ENV'
    message = '云函数不存在或未部署：请在开发者工具中逐个右键 cloudfunctions 下的函数，选择「上传并部署：云端安装依赖」'
  } else if (/env check invalid|invalid env|could not find env|INVALID_ENV|501000/i.test(msg)) {
    code = 'E_ENV'
    message = '云开发环境不可用：请先在工具栏「云开发」中开通，并在 app.js 中配置环境 ID'
  } else if (/isn't enabled|not enabled|cloud.init|未初始化/i.test(msg)) {
    code = 'E_ENV'
    message = '云能力未开通或未初始化，请检查云开发配置'
  } else if (/timeout|TIMEOUT/i.test(msg)) {
    message = '请求超时，请重试'
  }
  const e = new Error(message)
  e.code = code
  e.raw = msg
  return e
}

/**
 * 调用云函数；约定云函数返回 { ok, data } 或 { ok:false, code, message, data }
 * 成功 resolve(data)，失败 reject(Error{code,message})
 */
function call(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data: data || {},
      success(res) {
        const r = res && res.result
        if (r && r.ok) {
          resolve(r.data || {})
        } else {
          const e = new Error((r && r.message) || '请求失败')
          e.code = (r && r.code) || 'E_INTERNAL'
          e.data = (r && r.data) || {}
          reject(e)
        }
      },
      fail(err) {
        reject(normalizeError(err))
      }
    })
  })
}

module.exports = {
  genRequestId,
  call
}
