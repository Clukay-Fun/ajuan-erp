/* eslint-disable */
// Electron E2E 最小 harness：用临时 userData 启动打包产物，在真实 renderer 里执行脚本并断言。
// 用法：electron tests/e2e/run.cjs <scenario>   （由 scripts/e2e.mjs 调度）
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '../..')
const ARTIFACTS = path.join(ROOT, 'tests/e2e/.artifacts')

function assert(cond, msg) {
  if (!cond) throw new Error(`断言失败：${msg}`)
}
function eq(a, b, msg) {
  const A = JSON.stringify(a),
    B = JSON.stringify(b)
  if (A !== B) throw new Error(`断言失败：${msg}\n  期望 ${B}\n  实际 ${A}`)
}

async function launch({ userData } = {}) {
  const ud = userData ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-e2e-'))
  app.setPath('userData', ud)
  process.env.AJUAN_DATA_DIR = ud
  await app.whenReady()
  require(path.join(ROOT, 'out/main/index.js'))
  await sleep(1200)
  const win = BrowserWindow.getAllWindows()[0]
  win.setSize(1200, 800)
  return { ud, win, ...bind(win) }
}

function bind(win) {
  const current = () => BrowserWindow.getAllWindows()[0] ?? win
  const js = (code) => current().webContents.executeJavaScript(`(async () => { ${code} })()`)
  const api = (expr) =>
    js(
      `const r = await window.ajuan.${expr}; if (!r.ok) throw new Error(r.error.code + ': ' + r.error.message); return r.data`
    )
  const apiErr = (expr) => js(`const r = await window.ajuan.${expr}; return r.ok ? null : r.error`)
  const ui = (code) =>
    js(`${UI_HELPERS}\n${code}`).catch((err) => {
      console.error('失败步骤：' + code.trim().split('\n')[0])
      throw err
    })
  const shot = async (name) => {
    fs.mkdirSync(ARTIFACTS, { recursive: true })
    fs.writeFileSync(path.join(ARTIFACTS, name), (await current().webContents.capturePage()).toPNG())
  }
  return { js, api, apiErr, ui, shot, current }
}

// 注入到页面里的 DOM 操作辅助（React 受控输入需要走原生 setter + input 事件）
const UI_HELPERS = `
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const $ = (sel) => document.querySelector(sel)
  const $$ = (sel) => [...document.querySelectorAll(sel)]
  const btn = (text) => $$('button').find(b => b.textContent.trim() === text && b.getAttribute('role') !== 'tab')
  const click = async (text, wait = 300) => { const b = btn(text); if (!b) throw new Error('找不到按钮：' + text); b.click(); await sleep(wait) }
  const setVal = (el, v) => { const s = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }
  const setSel = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })) }
  const visible = (el) => el.offsetParent !== null
  const rows = () => $$('tbody tr').filter(visible)
  const pickOption = async (triggerIndex, text) => { const trig = $$('[aria-haspopup=listbox]').filter(visible)[triggerIndex]; trig.click(); await sleep(150); const opt = $$('[role=option]').find(o => o.textContent.trim().startsWith(text)); if (!opt) throw new Error('找不到选项：' + text); opt.click(); await sleep(200) }
  const label = (t) => $$('label').find(l => l.textContent.trim() === t)
  const inputOf = (t) => { const l = label(t); if (!l) throw new Error('找不到字段：' + t); return (l.htmlFor && document.getElementById(l.htmlFor)) || l.querySelector('input,textarea,select') || l.parentElement.querySelector('input,textarea,select') }
  // 主内容加上当前打开的抽屉 / 浮层（它们挂在 body 下的 portal 里）
  const text = () => [$('main'), ...$$('[role=dialog],[role=alertdialog]')].filter(Boolean).map(e => e.innerText).join(' ').replace(/\\s+/g, ' ')
  const drawer = () => $$('[role=dialog]').pop()
  const confirmIn = async (text, wait = 600) => { const b = $$('[role=alertdialog] button').find(b => b.textContent.trim() === text); if (!b) throw new Error('确认框里找不到按钮：' + text); b.click(); await sleep(wait) }
  const settingsNav = async (name, wait = 300) => { const b = $$('aside button').find(b => b.textContent.trim().startsWith(name)); if (!b) throw new Error('找不到设置分类：' + name); b.click(); await sleep(wait) }
  const key = (k, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts }))
`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

module.exports = { launch, assert, eq, sleep, ROOT, ARTIFACTS }
