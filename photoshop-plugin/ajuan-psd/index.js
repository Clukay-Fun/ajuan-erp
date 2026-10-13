const { entrypoints } = require('uxp')
const { app, action, core, constants } = require('photoshop')
const fs = require('uxp').storage.localFileSystem
const formats = require('uxp').storage.formats
const { fitToBounds } = require('./fit.js')

const TOKEN_KEY = 'ajuan.bridgeToken'
const POLL_INTERVAL_MS = 1000
const SAVE_OPTIONS = {
  alphaChannels: true,
  annotations: true,
  embedColorProfile: true,
  layers: true,
  spotColors: true,
  maximizeCompatibility: true
}

const lines = ['首次使用请授权 psd-bridge。之后生成任务会自动执行；“执行队列”仅用于手动补跑。']
let workerTimer = null
let panelRoot = null
let queueRunning = false
const boundClicks = new WeakSet()

function element(id) {
  if (panelRoot && typeof panelRoot.querySelector === 'function') {
    const found = panelRoot.querySelector('#' + id)
    if (found) return found
  }
  if (typeof document !== 'undefined' && document.getElementById) return document.getElementById(id)
  return null
}

function renderLog() {
  const el = element('log')
  if (el) el.textContent = lines.join('\n')
}

function log(line) {
  lines.push(line)
  if (lines.length > 80) lines.shift()
  renderLog()
}

entrypoints.setup({
  plugin: {
    create() {
      startWorker()
    },
    destroy() {
      stopWorker()
      unmountPanel()
    }
  },
  panels: {
    ajuanPsd: {
      create(rootNode) {
        mountPanel(rootNode)
      },
      destroy() {
        unmountPanel()
      },
      show(rootNode) {
        mountPanel(rootNode)
      },
      hide() {}
    }
  },
  commands: {
    ajuanRunQueue() {
      startWorker()
      runQueue({ silent: false })
    }
  }
})

function errorText(err) {
  if (!err) return '未知错误'
  if (typeof err === 'string') return err
  return err.message ? String(err.message) : String(err)
}

function num(value) {
  if (typeof value === 'number') return value
  if (value && typeof value._value === 'number') return value._value
  return Number(value)
}

function boundsOf(layer) {
  // `boundsNoEffects` can keep returning the smart-object mask bounds after
  // placedLayerReplaceContents. Use the actual layer bounds so the replacement
  // image is scaled back into the target rectangle.
  const bounds = layer.bounds
  return {
    left: num(bounds.left),
    top: num(bounds.top),
    right: num(bounds.right),
    bottom: num(bounds.bottom)
  }
}

function isSmartObject(layer) {
  const kind = layer.kind
  return kind === 'smartObject' || kind === constants.LayerKind.SMARTOBJECT
}

function isLocked(layer) {
  return layer.locked === true || layer.allLocked === true
}

function sameFile(doc, entry) {
  if (doc.name !== entry.name) return false
  const docPath = doc.path ? String(doc.path) : ''
  const entryPath = entry.nativePath ? String(entry.nativePath) : ''
  if (!docPath || !entryPath) return true
  const norm = (value) =>
    decodeURIComponent(value.replace(/^file:\/\//, ''))
      .replace(/\\/g, '/')
      .toLowerCase()
  return norm(docPath) === norm(entryPath)
}

function findLayer(container, name) {
  const layers = container.layers
  if (!layers) return null
  for (const layer of layers) {
    if (layer.name === name) return layer
    const nested = findLayer(layer, name)
    if (nested) return nested
  }
  return null
}

async function child(folder, name) {
  if (!folder) return null
  const entries = await folder.getEntries()
  return entries.find((entry) => entry.name === name) || null
}

async function ensureFolder(parent, name) {
  const found = await child(parent, name)
  if (found && found.isFolder) return found
  return parent.createFolder(name)
}

async function readText(file) {
  const data = await file.read({ format: formats.utf8 })
  return typeof data === 'string' ? data : new TextDecoder().decode(data)
}

async function park(file, folderName, job, bridge) {
  const folder = await ensureFolder(bridge, folderName)
  await file.write(JSON.stringify(job, null, 2), { format: formats.utf8 })
  const clash = await child(folder, file.name)
  if (clash) await clash.delete()
  await file.moveTo(folder)
}

async function batch(descriptors) {
  const results = await action.batchPlay(descriptors, { synchronousExecution: true, modalBehavior: 'execute' })
  for (const result of results) {
    if (result?._obj === 'error' || (typeof result?.result === 'number' && result.result < 0)) {
      throw new Error(result.message || `Photoshop 命令失败 (${result.result})`)
    }
  }
  return results
}

async function selectLayer(layer) {
  await batch([
    {
      _obj: 'select',
      _target: [{ _ref: 'layer', _id: layer.id }],
      makeVisible: false,
      _options: { dialogOptions: 'dontDisplay' }
    }
  ])
}

async function replaceContents(fileEntry) {
  const token = await fs.createSessionToken(fileEntry)
  await batch([
    {
      _obj: 'placedLayerReplaceContents',
      null: { _path: token, _kind: 'local' },
      _options: { dialogOptions: 'dontDisplay' }
    }
  ])
}

async function ensureOutput(outputs, name) {
  const found = await child(outputs, name)
  if (found) return found
  return outputs.createFile(name)
}

async function replaceOne(doc, staging, item) {
  const layer = findLayer(doc, item.layerName)
  if (!layer) throw new Error(`图层不存在: ${item.layerName}`)
  if (isLocked(layer)) throw new Error(`图层已锁定: ${item.layerName}`)
  if (!isSmartObject(layer)) throw new Error(`图层不是智能对象: ${item.layerName}`)
  const image = await child(staging, item.file)
  if (!image || !image.isFile) throw new Error(`素材文件不存在: ${item.file}`)
  // Template 2 keeps its empty lower-row targets hidden until the first asset
  // is assigned. Reveal before reading bounds so Photoshop reports the full
  // transformed smart-object rectangle consistently.
  layer.visible = true
  const before = boundsOf(layer)
  await selectLayer(layer)
  await replaceContents(image)
  const current = findLayer(doc, item.layerName)
  if (!current) throw new Error(`图层不存在: ${item.layerName}`)
  current.visible = true
  const afterReplace = boundsOf(current)
  const fit = fitToBounds(before, afterReplace)
  if (Math.abs(fit.scale - 1) > 0.001) {
    // Use Photoshop's Layer DOM transform methods instead of a hand-built
    // Action Manager transform descriptor.
    await current.scale(fit.scale * 100, fit.scale * 100, constants.AnchorPosition.MIDDLECENTER)
  }
  if (Math.abs(fit.dx) > 0.5 || Math.abs(fit.dy) > 0.5) await current.translate(fit.dx, fit.dy)

  const fittedLayer = findLayer(doc, item.layerName)
  if (!fittedLayer) throw new Error(`图层不存在: ${item.layerName}`)
  const fitted = boundsOf(fittedLayer)
  const tolerance = 2
  const targetCenterX = (before.left + before.right) / 2
  const targetCenterY = (before.top + before.bottom) / 2
  const fittedCenterX = (fitted.left + fitted.right) / 2
  const fittedCenterY = (fitted.top + fitted.bottom) / 2
  if (
    fitted.left < before.left - tolerance ||
    fitted.top < before.top - tolerance ||
    fitted.right > before.right + tolerance ||
    fitted.bottom > before.bottom + tolerance ||
    Math.abs(fittedCenterX - targetCenterX) > tolerance ||
    Math.abs(fittedCenterY - targetCenterY) > tolerance
  ) {
    throw new Error(
      `${item.layerName} 变换未落入模板范围：目标 ${Math.round(before.left)},${Math.round(before.top)},${Math.round(before.right)},${Math.round(before.bottom)}；结果 ${Math.round(fitted.left)},${Math.round(fitted.top)},${Math.round(fitted.right)},${Math.round(fitted.bottom)}`
    )
  }
}

async function runInPhotoshop(bridge, staging, job) {
  let doc = null
  const replaced = []
  try {
    const templateEntry = await child(staging, job.templateFile)
    if (!templateEntry || !templateEntry.isFile) throw new Error('任务素材目录里没有 template.psd')
    const opened = await app.open(templateEntry)
    if (!sameFile(opened, templateEntry)) throw new Error(`打开了错误文件: ${opened.name}`)
    doc = opened
    for (const item of job.replacements) {
      await replaceOne(doc, staging, item)
      replaced.push(item.layerName)
    }
    const outputs = await ensureFolder(bridge, 'outputs')
    const output = await ensureOutput(outputs, job.outputFile)
    await doc.saveAs.psd(output, SAVE_OPTIONS, true)
    await doc.close(constants.SaveOptions.DONOTSAVECHANGES)
    return replaced
  } catch (err) {
    if (doc) {
      try {
        await doc.close(constants.SaveOptions.DONOTSAVECHANGES)
      } catch {
        /* 副本保持未保存，磁盘上的模板副本不被写回 */
      }
    }
    throw err
  }
}

async function runJob(bridge, inboxFile) {
  const processing = await ensureFolder(bridge, 'processing')
  const clash = await child(processing, inboxFile.name)
  if (clash) await clash.delete()
  await inboxFile.moveTo(processing)
  const file = await child(processing, inboxFile.name)
  if (!file) throw new Error('任务文件移入 processing 后找不到了')
  let job
  try {
    job = JSON.parse(await readText(file))
  } catch {
    log(`${inboxFile.name} 无法解析，已留在 processing`)
    return
  }
  const fail = async (message) => {
    job.result = { ok: false, replaced: [], error: message, outputFile: null }
    await park(file, 'failed', job, bridge)
    log(`${job.id || inboxFile.name} 失败：${message}`)
  }
  if (!job || job.version !== 1 || !Array.isArray(job.replacements) || !job.replacements.length) {
    job = job && typeof job === 'object' ? job : { id: inboxFile.name }
    await fail('任务文件无效')
    return
  }
  const stagingRoot = await child(bridge, 'staging')
  const staging = stagingRoot ? await child(stagingRoot, String(job.id)) : null
  if (!staging || !staging.isFolder) {
    await fail('任务素材目录不存在')
    return
  }
  try {
    let replaced = []
    await core.executeAsModal(
      async () => {
        replaced = await runInPhotoshop(bridge, staging, job)
      },
      { commandName: '阿卷替换图层' }
    )
    job.result = { ok: true, replaced, error: null, outputFile: job.outputFile }
    await park(file, 'done', job, bridge)
    log(`${job.id} 已导出 ${job.outputFile}`)
  } catch (err) {
    await fail(errorText(err))
  }
}

async function getBridge() {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return null
  try {
    return await fs.getEntryForPersistentToken(token)
  } catch {
    return null
  }
}

async function showFolder() {
  const el = element('folder')
  if (!el) return
  const folder = await getBridge()
  el.textContent = folder
    ? `已授权：${folder.nativePath || folder.name}`
    : '尚未授权。请选择阿卷 ERP「定制」页里的 psd-bridge 目录。'
}

async function authorize() {
  const folder = await fs.getFolder()
  if (!folder) return
  const token = await fs.createPersistentToken(folder)
  localStorage.setItem(TOKEN_KEY, token)
  await showFolder()
  log('桥接目录已授权')
}

async function processInbox({ silent = false } = {}) {
  const bridge = await getBridge()
  if (!bridge) {
    if (!silent) log('请先授权桥接目录')
    return
  }
  const inbox = await child(bridge, 'inbox')
  if (!inbox || !inbox.isFolder) {
    if (!silent) log('这个目录里没有 inbox。请改选 psd-bridge。')
    return
  }
  const entries = await inbox.getEntries()
  const jobs = entries.filter((entry) => entry.isFile && entry.name.endsWith('.json'))
  if (!jobs.length) {
    if (!silent) log('队列是空的')
    return
  }
  for (const file of jobs) await runJob(bridge, file)
}

function runQueue(options) {
  if (queueRunning) return
  queueRunning = true
  const run = element('run')
  if (run) run.disabled = true
  if (!options?.silent) log('开始执行…')
  processInbox(options)
    .catch((err) => log(errorText(err)))
    .finally(() => {
      queueRunning = false
      const button = element('run')
      if (button) button.disabled = false
    })
}

function bindClick(el, handler) {
  if (!el || boundClicks.has(el)) return
  boundClicks.add(el)
  el.addEventListener('click', handler)
}

function mountPanel(rootNode) {
  if (rootNode && typeof rootNode.querySelector === 'function') panelRoot = rootNode
  bindClick(element('auth'), () => {
    authorize().catch((err) => log(errorText(err)))
  })
  bindClick(element('run'), () => {
    runQueue({ silent: false })
  })
  renderLog()
  showFolder().catch((err) => log(errorText(err)))
}

function unmountPanel() {
  panelRoot = null
}

function startWorker() {
  mountPanel()
  if (workerTimer) return
  runQueue({ silent: true })
  workerTimer = globalThis.setInterval(() => runQueue({ silent: true }), POLL_INTERVAL_MS)
}

function stopWorker() {
  if (!workerTimer) return
  globalThis.clearInterval(workerTimer)
  workerTimer = null
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWorker)
  else startWorker()
}
