const { entrypoints } = require('uxp')
const { app, action, core, constants } = require('photoshop')
const fs = require('uxp').storage.localFileSystem
const formats = require('uxp').storage.formats
const { fitContain } = require('./fit.js')

const TOKEN_KEY = 'ajuan.bridgeToken'
const SAVE_OPTIONS = {
  alphaChannels: true,
  annotations: true,
  embedColorProfile: true,
  layers: true,
  spotColors: true,
  maximizeCompatibility: true
}

entrypoints.setup({
  panels: {
    ajuanPsd: {
      show() {},
      hide() {}
    }
  }
})

function log(line) {
  const el = document.getElementById('log')
  el.textContent = `${el.textContent}\n${line}`.trim()
}

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
  const bounds = layer.boundsNoEffects || layer.bounds
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
  await action.batchPlay(descriptors, { synchronousExecution: true, modalBehavior: 'execute' })
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

async function scaleAroundCenter(layer, scale) {
  const percent = scale * 100
  await batch([
    {
      _obj: 'transform',
      _target: [{ _ref: 'layer', _id: layer.id }],
      freeTransformCenterState: { _enum: 'quadCenterState', _value: 'QCSAverage' },
      width: { _unit: 'percentUnit', _value: percent },
      height: { _unit: 'percentUnit', _value: percent },
      interfaceIconFrameDimmed: { _enum: 'interpolationType', _value: 'bicubic' },
      _options: { dialogOptions: 'dontDisplay' }
    }
  ])
}

async function moveLayer(layer, dx, dy) {
  await batch([
    {
      _obj: 'move',
      _target: [{ _ref: 'layer', _id: layer.id }],
      to: {
        _obj: 'offset',
        horizontal: { _unit: 'pixelsUnit', _value: dx },
        vertical: { _unit: 'pixelsUnit', _value: dy }
      },
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
  const before = boundsOf(layer)
  await selectLayer(layer)
  await replaceContents(image)
  const current = findLayer(doc, item.layerName)
  if (!current) throw new Error(`图层不存在: ${item.layerName}`)
  const fit = fitContain(before, boundsOf(current))
  if (Math.abs(fit.scale - 1) > 0.001) await scaleAroundCenter(current, fit.scale)
  if (Math.abs(fit.dx) > 0.5 || Math.abs(fit.dy) > 0.5) await moveLayer(current, fit.dx, fit.dy)
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
  const folder = await getBridge()
  const el = document.getElementById('folder')
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

async function processInbox() {
  const bridge = await getBridge()
  if (!bridge) {
    log('请先授权桥接目录')
    return
  }
  const inbox = await child(bridge, 'inbox')
  if (!inbox || !inbox.isFolder) {
    log('这个目录里没有 inbox。请改选 psd-bridge。')
    return
  }
  const entries = await inbox.getEntries()
  const jobs = entries.filter((entry) => entry.isFile && entry.name.endsWith('.json'))
  if (!jobs.length) {
    log('队列是空的')
    return
  }
  for (const file of jobs) await runJob(bridge, file)
}

function boot() {
  const auth = document.getElementById('auth')
  const run = document.getElementById('run')
  let running = false
  auth.addEventListener('click', () => {
    authorize().catch((err) => log(errorText(err)))
  })
  run.addEventListener('click', () => {
    if (running) return
    running = true
    run.disabled = true
    document.getElementById('log').textContent = '开始执行…'
    processInbox()
      .catch((err) => log(errorText(err)))
      .finally(() => {
        running = false
        run.disabled = false
      })
  })
  showFolder().catch((err) => log(errorText(err)))
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
