/**
 * 云函数调用封装与错误规范化
 */

function genRequestId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function normalizeError(err) {
  if (err && err.code) return err
  const msg = (err && err.errMsg) || (err && err.message) || ''
  let code = 'E_NETWORK'
  let message = '网络异常，请重试'
  if (/env|404011|501000|INVALID_ENV|could not find/i.test(msg)) {
    code = 'E_ENV'
    message = '云开发环境不可用，请先开通云开发并在 app.js 中配置环境'
  } else if (/Cloud API isn't enabled|cloud.init|未初始化/i.test(msg)) {
    code = 'E_ENV'
    message = '云能力未初始化，请检查 app.js 配置'
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
