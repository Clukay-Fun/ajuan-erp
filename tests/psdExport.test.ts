import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { deflateSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { testDb } from './helpers'
import { allocateOutputName, parseCutoutJobFile, parseJobFile, safeOutputBase } from '@shared/psd'
import { ServiceError } from '../src/main/services/errors'
import {
  addPsdSlot,
  cancelPsdCutoutJob,
  cancelPsdJob,
  confirmPsdCutoutJob,
  createPsdCutoutJob,
  createPsdJob,
  createPsdTemplate,
  deletePsdAsset,
  deletePsdTemplate,
  findPhotoshopApp,
  getPsdBoard,
  inspectCutoutPng,
  importPsdAsset,
  requeueStuckPsdJobs,
  retryPsdJob,
  resolvePsdCutoutResultPath,
  resolvePsdOutputPath,
  syncPsdCutoutResults,
  syncPsdResults,
  type PsdPaths
} from '../src/main/services/psdExport'
import { createLaunchGate, darwinPhotoshopPids, windowsPhotoshopPids } from '../src/main/photoshopProcess'

const require = createRequire(import.meta.url)
const { fitToBounds } = require('../photoshop-plugin/ajuan-psd/uxp/fit.js') as {
  fitToBounds: (
    oldBounds: { left: number; top: number; right: number; bottom: number },
    newBounds: { left: number; top: number; right: number; bottom: number }
  ) => { scale: number; dx: number; dy: number }
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function png(width: number, height: number, colorType = 6): Buffer {
  const buf = Buffer.alloc(26)
  PNG_SIG.copy(buf)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  buf[24] = 8
  buf[25] = colorType
  return buf
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function rgbaPng(width: number, height: number, alphaAt: (x: number, y: number) => number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'ascii')
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(body), 0)
    return Buffer.concat([head, data, tail])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const scanlines = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    scanlines[row] = 0
    for (let x = 0; x < width; x++) {
      const pixel = row + 1 + x * 4
      scanlines[pixel] = 0
      scanlines[pixel + 1] = 0
      scanlines[pixel + 2] = 0
      scanlines[pixel + 3] = alphaAt(x, y)
    }
  }
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function cutoutPng(): Buffer {
  return rgbaPng(40, 40, (x, y) => (x >= 10 && x <= 29 && y >= 10 && y <= 29 ? 255 : 0))
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9
  ])
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ajuan-psd-'))
  const paths: PsdPaths = { assetsDir: join(root, 'assets'), bridgeDir: join(root, 'bridge') }
  const psd = join(root, 'template.psd')
  writeFileSync(psd, Buffer.from('8BPS-original-content'))
  const dog = join(root, 'dog.png')
  const name = join(root, 'name.png')
  writeFileSync(dog, png(1254, 1254))
  writeFileSync(name, png(2172, 724))
  return {
    root,
    paths,
    psd,
    dog,
    name,
    db: testDb(),
    cleanup: () => {
      rmSync(root, { recursive: true, force: true })
    }
  }
}

const roots: { cleanup: () => void }[] = []
afterEach(() => {
  while (roots.length) roots.pop()!.cleanup()
})

function useFixture() {
  const fx = fixture()
  roots.push(fx)
  return fx
}

function boardOf(fx: ReturnType<typeof fixture>) {
  return getPsdBoard(fx.db, fx.paths, { photoshopPath: null, pluginDir: '/plugin' })
}

function seed(fx: ReturnType<typeof fixture>, slots = ['slot_01']) {
  const templateId = createPsdTemplate(fx.db, { name: '六宫格', sourcePath: fx.psd })
  const slotIds = slots.map((slotKey) =>
    addPsdSlot(fx.db, {
      templateId,
      slotKey,
      dogLayer: `${slotKey}_dog`,
      nameLayer: `${slotKey}_name`
    })
  )
  const dogId = importPsdAsset(fx.db, fx.paths, 'dog', fx.dog)
  const nameId = importPsdAsset(fx.db, fx.paths, 'name', fx.name)
  return { templateId, slotIds, dogId, nameId }
}

describe('等比例放进原边界', () => {
  it('相同边界不缩放也不移动', () => {
    expect(
      fitToBounds({ left: 0, top: 0, right: 100, bottom: 100 }, { left: 0, top: 0, right: 100, bottom: 100 })
    ).toEqual({
      scale: 1,
      dx: 0,
      dy: 0
    })
  })

  it('正方形放进横向区域时按高度缩小，中心对齐', () => {
    const fit = fitToBounds({ left: 0, top: 0, right: 800, bottom: 400 }, { left: 0, top: 0, right: 500, bottom: 500 })
    expect(fit.scale).toBeCloseTo(400 / 500)
    expect(fit.dx).toBeCloseTo(400 - 250)
    expect(fit.dy).toBeCloseTo(200 - 250)
  })

  it('心形名字 JPG 的大画布会缩到目标智能对象范围内', () => {
    const target = { left: 412, top: 1338, right: 799, bottom: 1546 }
    const replacedJpg = { left: -957, top: -641, right: 2168, bottom: 3526 }
    const fit = fitToBounds(target, replacedJpg)
    const scaledWidth = (replacedJpg.right - replacedJpg.left) * fit.scale
    const scaledHeight = (replacedJpg.bottom - replacedJpg.top) * fit.scale
    const centerX = (target.left + target.right) / 2
    const centerY = (target.top + target.bottom) / 2

    expect(fit.scale).toBeCloseTo(208 / 4167)
    expect(fit.dx).toBeCloseTo(0)
    expect(fit.dy).toBeCloseTo(-0.5)
    expect(scaledWidth).toBeLessThan(target.right - target.left)
    expect(scaledHeight).toBeCloseTo(target.bottom - target.top)
    expect((replacedJpg.left + replacedJpg.right) / 2 + fit.dx).toBeCloseTo(centerX)
    expect((replacedJpg.top + replacedJpg.bottom) / 2 + fit.dy).toBeCloseTo(centerY)
  })

  it('竖向狗图和名字图按更紧的一边缩放，宽图和高图都不拉伸', () => {
    const left = { left: 140, top: 240, right: 960, bottom: 1240 }
    const dog = fitToBounds(left, { left: 0, top: 0, right: 627, bottom: 992 })
    expect(dog.scale).toBeCloseTo(Math.min(820 / 627, 1000 / 992))
    expect(dog.dx).toBeCloseTo(550 - 313.5)
    expect(dog.dy).toBeCloseTo(740 - 496)

    const right = { left: 1040, top: 240, right: 1860, bottom: 1240 }
    const name = fitToBounds(right, { left: 0, top: 0, right: 750, bottom: 1000 })
    expect(name.scale).toBeCloseTo(Math.min(820 / 750, 1000 / 1000))
    expect(name.dx).toBeCloseTo(1450 - 375)
    expect(name.dy).toBeCloseTo(740 - 500)

    const box = { left: 0, top: 0, right: 1000, bottom: 1000 }
    expect(fitToBounds(box, { left: 0, top: 0, right: 2000, bottom: 500 }).scale).toBeCloseTo(0.5)
    expect(fitToBounds(box, { left: 0, top: 0, right: 500, bottom: 2000 }).scale).toBeCloseTo(0.5)
  })

  it('边界无效时不能缩放', () => {
    expect(() =>
      fitToBounds({ left: 0, top: 0, right: 0, bottom: 10 }, { left: 0, top: 0, right: 10, bottom: 10 })
    ).toThrow('图层边界无效')
  })
})

describe('任务文件名', () => {
  it('去掉路径字符，重名追加序号', () => {
    expect(safeOutputBase('a/b:c')).toBe('a b c')
    expect(allocateOutputName('张三', ['张三.psd'])).toBe('张三-2.psd')
    expect(allocateOutputName('张三', [])).toBe('张三.psd')
  })

  it('拒绝带路径的任务文件', () => {
    expect(() =>
      parseJobFile({
        version: 1,
        id: 1,
        title: '张三',
        templateFile: 'template.psd',
        outputFile: '../out.psd',
        replacements: [{ layerName: 'slot_01_dog', file: 'slot_01_dog.png' }]
      })
    ).toThrow('任务文件无效')
  })
})

describe('PSD 任务', () => {
  it('PSD 导出任务记录独立导出目录并将完成路径同步到列表', () => {
    const fx = useFixture()
    fx.paths.outputDir = join(fx.root, 'downloads', '阿卷 ERP')
    const seeded = seed(fx)
    const id = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '独立目录',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const spec = parseJobFile(JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${id}.json`), 'utf8')))
    expect(spec.outputDir).toBe(fx.paths.outputDir)
    writeFileSync(join(fx.paths.outputDir, spec.outputFile), Buffer.from('8BPS-output'))
    finishLikePlugin(fx, id, { ok: true, replaced: ['slot_01_dog'], error: null, outputFile: spec.outputFile })

    syncPsdResults(fx.db, fx.paths)

    expect(boardOf(fx).jobs.find((job) => job.id === id)).toMatchObject({
      status: 'done',
      outputPath: join(fx.paths.outputDir, spec.outputFile)
    })
  })

  it('生成任务不改原始 PSD，也不把原始路径写进任务', () => {
    const fx = useFixture()
    const before = readFileSync(fx.psd)
    const mtime = statSync(fx.psd).mtimeMs
    const seeded = seed(fx)
    const jobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '张三',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    expect(readFileSync(fx.psd).equals(before)).toBe(true)
    expect(statSync(fx.psd).mtimeMs).toBe(mtime)
    const spec = parseJobFile(JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`), 'utf8')))
    expect(spec.templateFile).toBe('template.psd')
    expect(spec.outputFile).toBe('张三.psd')
    expect(JSON.stringify(spec)).not.toContain(fx.psd)
    expect(spec.replacements.map((item) => item.layerName)).toEqual(['slot_01_dog', 'slot_01_name'])
    const staged = readFileSync(join(fx.paths.bridgeDir, 'staging', String(jobId), 'template.psd'))
    expect(staged.equals(before)).toBe(true)
    expect(join(fx.paths.bridgeDir, 'staging', String(jobId), 'template.psd')).not.toBe(fx.psd)
    const view = boardOf(fx).jobs.find((job) => job.id === jobId)
    expect(view?.status).toBe('queued')
    expect(view?.outputPath).toBeNull()
  })

  it('一次任务可以替换多个位置，重名输出追加序号', () => {
    const fx = useFixture()
    const seeded = seed(fx, ['slot_01', 'slot_02'])
    const first = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '客户',
      items: [
        { slotId: seeded.slotIds[1], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId },
        { slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }
      ]
    })
    const second = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '客户',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const firstSpec = parseJobFile(JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${first}.json`), 'utf8')))
    const secondSpec = parseJobFile(
      JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${second}.json`), 'utf8'))
    )
    expect(firstSpec.replacements.map((item) => item.file)).toEqual([
      'slot_01_dog.png',
      'slot_01_name.png',
      'slot_02_dog.png',
      'slot_02_name.png'
    ])
    expect(secondSpec.outputFile).toBe('客户-2.psd')
    expect(readFileSync(fx.psd).toString()).toBe('8BPS-original-content')
  })

  it('同步插件的成功、缺图层和锁定结果，原文件仍不变', () => {
    const fx = useFixture()
    const before = readFileSync(fx.psd)
    const seeded = seed(fx)
    const missing = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '缺图层',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const locked = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '锁定',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const done = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '完成',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    finishLikePlugin(fx, missing, { ok: false, replaced: [], error: '图层不存在: slot_02_dog', outputFile: null })
    finishLikePlugin(fx, locked, { ok: false, replaced: [], error: '图层已锁定: slot_01_dog', outputFile: null })
    const outputFile = '完成.psd'
    writeFileSync(join(fx.paths.bridgeDir, 'outputs', outputFile), Buffer.from('8BPS-output'))
    finishLikePlugin(fx, done, { ok: true, replaced: ['slot_01_dog', 'slot_01_name'], error: null, outputFile })
    const jobs = boardOf(fx).jobs
    expect(jobs.find((job) => job.id === missing)?.error).toBe('图层不存在: slot_02_dog')
    expect(jobs.find((job) => job.id === locked)?.error).toBe('图层已锁定: slot_01_dog')
    const exported = jobs.find((job) => job.id === done)
    expect(exported?.status).toBe('done')
    expect(exported?.outputPath).toBe(join(fx.paths.bridgeDir, 'outputs', outputFile))
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', String(done)))).toBe(false)
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', String(missing)))).toBe(true)
    expect(readFileSync(fx.psd).equals(before)).toBe(true)
    retryPsdJob(fx.db, fx.paths, missing)
    expect(existsSync(join(fx.paths.bridgeDir, 'inbox', `${missing}.json`))).toBe(true)
    expect(boardOf(fx).jobs.find((job) => job.id === missing)?.status).toBe('queued')
  })

  it('处理中的任务不能取消，放回队列后可以取消', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const jobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '进行中',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    mkdirSync(join(fx.paths.bridgeDir, 'processing'), { recursive: true })
    renameSync(
      join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`),
      join(fx.paths.bridgeDir, 'processing', `${jobId}.json`)
    )
    expect(boardOf(fx).jobs[0]?.status).toBe('running')
    expect(() => cancelPsdJob(fx.db, fx.paths, jobId)).toThrow(ServiceError)
    expect(requeueStuckPsdJobs(fx.db, fx.paths)).toBe(1)
    cancelPsdJob(fx.db, fx.paths, jobId)
    expect(boardOf(fx).jobs[0]?.status).toBe('cancelled')
    expect(existsSync(join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`))).toBe(false)
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', String(jobId)))).toBe(false)
  })

  it('等待中的素材和重复图层不能删改，无透明通道会记下来', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    writeFileSync(join(fx.root, 'flat.png'), png(800, 200, 2))
    const flatId = importPsdAsset(fx.db, fx.paths, 'name', join(fx.root, 'flat.png'))
    expect(boardOf(fx).assets.find((asset) => asset.id === flatId)?.hasAlpha).toBe(false)
    createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '占用',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    expect(() => deletePsdAsset(fx.db, fx.paths, seeded.dogId)).toThrow('等待中的导出任务')
    expect(() =>
      addPsdSlot(fx.db, {
        templateId: seeded.templateId,
        slotKey: 'slot_02',
        dogLayer: 'slot_01_name',
        nameLayer: 'slot_02_name'
      })
    ).toThrow('图层名已经用在别的位置上')
    writeFileSync(join(fx.root, 'note.jpg'), Buffer.from('not a png'))
    expect(() => importPsdAsset(fx.db, fx.paths, 'dog', join(fx.root, 'note.jpg'))).toThrow('只支持 PNG / JPG')
  })

  it('导入 JPG 并在任务目录中保留 JPG 格式', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const dogPath = join(fx.root, '测试狗.jpg')
    const namePath = join(fx.root, '测试名字.jpeg')
    writeFileSync(dogPath, jpeg(629, 971))
    writeFileSync(namePath, jpeg(750, 1250))
    const dogId = importPsdAsset(fx.db, fx.paths, 'dog', dogPath)
    const nameId = importPsdAsset(fx.db, fx.paths, 'name', namePath)
    const dog = boardOf(fx).assets.find((asset) => asset.id === dogId)
    expect(dog).toMatchObject({ label: '测试狗', width: 629, height: 971, hasAlpha: false })
    expect(dog?.fileUrl).toContain('.jpg')

    const jobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: 'JPG 测试',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: dogId, nameAssetId: nameId }]
    })
    const job = JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`), 'utf8'))
    expect(job.replacements).toEqual([
      { layerName: 'slot_01_dog', file: 'slot_01_dog.jpg' },
      { layerName: 'slot_01_name', file: 'slot_01_name.jpg' }
    ])
    expect(readFileSync(join(fx.paths.bridgeDir, 'staging', String(jobId), 'slot_01_dog.jpg'))).toEqual(jpeg(629, 971))
  })

  it('完成后可以删除模板，历史任务仍留着模板名', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const jobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '归档',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    writeFileSync(join(fx.paths.bridgeDir, 'outputs', '归档.psd'), Buffer.from('8BPS-output'))
    finishLikePlugin(fx, jobId, { ok: true, replaced: ['slot_01_dog'], error: null, outputFile: '归档.psd' })
    expect(boardOf(fx).jobs[0]?.status).toBe('done')
    deletePsdTemplate(fx.db, seeded.templateId)
    const job = boardOf(fx).jobs[0]
    expect(job?.templateId).toBeNull()
    expect(job?.templateName).toBe('六宫格')
    expect(boardOf(fx).templates).toHaveLength(0)
  })

  it('桥接目录里的文件不能当作模板', () => {
    const fx = useFixture()
    const inside = join(fx.paths.bridgeDir, 'local.psd')
    mkdirSync(fx.paths.bridgeDir, { recursive: true })
    writeFileSync(inside, Buffer.from('8BPS-inside'))
    const templateId = createPsdTemplate(fx.db, { name: '内部', sourcePath: inside })
    const slotId = addPsdSlot(fx.db, {
      templateId,
      slotKey: 'slot_01',
      dogLayer: 'slot_01_dog',
      nameLayer: 'slot_01_name'
    })
    const dogId = importPsdAsset(fx.db, fx.paths, 'dog', fx.dog)
    const nameId = importPsdAsset(fx.db, fx.paths, 'name', fx.name)
    expect(() =>
      createPsdJob(fx.db, fx.paths, {
        templateId,
        title: '不行',
        items: [{ slotId, dogAssetId: dogId, nameAssetId: nameId }]
      })
    ).toThrow('桥接目录以外')
  })
})

describe('Photoshop 抠白底任务', () => {
  it('抠图结果写到可配置的导出目录，并通过任务编号提供预览', () => {
    const fx = useFixture()
    fx.paths.outputDir = join(fx.root, 'downloads', '阿卷 ERP')
    const seeded = seed(fx)
    const id = createPsdCutoutJob(fx.db, fx.paths, seeded.dogId)
    const inbox = join(fx.paths.bridgeDir, 'inbox', `cutout-${id}.json`)
    const processing = join(fx.paths.bridgeDir, 'processing', `cutout-${id}.json`)
    const done = join(fx.paths.bridgeDir, 'done', `cutout-${id}.json`)
    const task = parseCutoutJobFile(JSON.parse(readFileSync(inbox, 'utf8')))
    expect(task.outputDir).toBe(fx.paths.outputDir)
    const resultPath = resolvePsdOutputPath(fx.paths.outputDir, task.outputFile)
    expect(resultPath).toBe(join(fx.paths.outputDir, task.outputFile))
    writeFileSync(resultPath, cutoutPng())
    renameSync(inbox, processing)
    writeFileSync(
      processing,
      JSON.stringify({ ...task, result: { ok: true, error: null, outputFile: task.outputFile } })
    )

    syncPsdCutoutResults(fx.db, fx.paths)

    expect(boardOf(fx).cutouts.find((job) => job.id === id)).toMatchObject({
      status: 'ready',
      resultUrl: `ajuan-file://psd-cutout/${id}`
    })
    expect(resolvePsdCutoutResultPath(fx.db, id)).toBe(resultPath)
    expect(existsSync(done)).toBe(true)

    fx.paths.outputDir = join(fx.root, 'another-export-folder')
    expect(() => syncPsdCutoutResults(fx.db, fx.paths)).not.toThrow()
    expect(resolvePsdCutoutResultPath(fx.db, id)).toBe(resultPath)
  })

  it('任务独立于 PSD 导出队列，输入副本保留原素材格式', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const original = readFileSync(fx.dog)
    const psdJobId = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '并行导出',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
    })
    const cutoutId = createPsdCutoutJob(fx.db, fx.paths, seeded.dogId)
    const cutout = parseCutoutJobFile(
      JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `cutout-${cutoutId}.json`), 'utf8'))
    )
    expect(cutout).toMatchObject({
      type: 'cutout',
      kind: 'dog',
      sourceFile: 'source.png',
      outputFile: `cutout-${cutoutId}.png`
    })
    expect(readFileSync(join(fx.paths.bridgeDir, 'staging', `cutout-${cutoutId}`, 'source.png'))).toEqual(original)
    expect(boardOf(fx).cutouts.find((job) => job.id === cutoutId)?.status).toBe('queued')
    expect(boardOf(fx).jobs.find((job) => job.id === psdJobId)?.status).toBe('queued')
    expect(readFileSync(fx.dog)).toEqual(original)
  })

  it('识别 processing / ready 状态，并拒绝无透明像素的输出 PNG', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const id = createPsdCutoutJob(fx.db, fx.paths, seeded.nameId)
    const inbox = join(fx.paths.bridgeDir, 'inbox', `cutout-${id}.json`)
    renameSync(inbox, join(fx.paths.bridgeDir, 'processing', `cutout-${id}.json`))
    expect(boardOf(fx).cutouts.find((job) => job.id === id)?.status).toBe('running')
    const task = parseCutoutJobFile(
      JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'processing', `cutout-${id}.json`), 'utf8'))
    )
    writeFileSync(
      join(fx.paths.bridgeDir, 'outputs', task.outputFile),
      rgbaPng(40, 40, () => 255)
    )
    finishCutoutLikePlugin(fx, id, { ok: true, error: null, outputFile: task.outputFile })
    const ready = boardOf(fx).cutouts.find((job) => job.id === id)
    expect(ready?.status).toBe('failed')
    expect(ready?.error).toContain('没有真实透明像素')
    expect(existsSync(join(fx.paths.bridgeDir, 'outputs', task.outputFile))).toBe(false)
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', `cutout-${id}`))).toBe(false)
  })

  it('Photoshop 报告处理失败后清理临时文件，原图和 PSD 导出队列不受影响', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const original = readFileSync(fx.dog)
    const id = createPsdCutoutJob(fx.db, fx.paths, seeded.dogId)
    const spec = parseCutoutJobFile(
      JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `cutout-${id}.json`), 'utf8'))
    )
    writeFileSync(join(fx.paths.bridgeDir, 'outputs', spec.outputFile), cutoutPng())
    finishCutoutLikePlugin(fx, id, { ok: false, error: '主体识别失败', outputFile: null })

    const board = boardOf(fx)
    expect(board.cutouts.find((job) => job.id === id)).toMatchObject({ status: 'failed', error: '主体识别失败' })
    expect(existsSync(join(fx.paths.bridgeDir, 'outputs', spec.outputFile))).toBe(false)
    expect(existsSync(join(fx.paths.bridgeDir, 'staging', `cutout-${id}`))).toBe(false)
    expect(readFileSync(fx.dog)).toEqual(original)
    expect(board.assets).toHaveLength(2)
    expect(() =>
      createPsdJob(fx.db, fx.paths, {
        templateId: seeded.templateId,
        title: '抠图失败后仍可导出',
        items: [{ slotId: seeded.slotIds[0], dogAssetId: seeded.dogId, nameAssetId: seeded.nameId }]
      })
    ).not.toThrow()
  })

  it('确认会新增透明素材；取消会清理临时 PNG，原图与 PSD 导出仍可用', () => {
    const fx = useFixture()
    const seeded = seed(fx)
    const original = readFileSync(fx.dog)

    const cancelledId = createPsdCutoutJob(fx.db, fx.paths, seeded.dogId)
    const cancelledSpec = parseCutoutJobFile(
      JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `cutout-${cancelledId}.json`), 'utf8'))
    )
    writeFileSync(join(fx.paths.bridgeDir, 'outputs', cancelledSpec.outputFile), cutoutPng())
    finishCutoutLikePlugin(fx, cancelledId, { ok: true, error: null, outputFile: cancelledSpec.outputFile })
    syncPsdCutoutResults(fx.db, fx.paths)
    expect(boardOf(fx).cutouts.find((job) => job.id === cancelledId)).toMatchObject({
      status: 'ready',
      resultUrl: `ajuan-file://psd-cutout/${cancelledId}`
    })
    expect(() => inspectCutoutPng(cutoutPng())).not.toThrow()
    cancelPsdCutoutJob(fx.db, fx.paths, cancelledId)
    expect(boardOf(fx).cutouts.find((job) => job.id === cancelledId)?.status).toBe('cancelled')
    expect(existsSync(join(fx.paths.bridgeDir, 'outputs', cancelledSpec.outputFile))).toBe(false)
    expect(readFileSync(fx.dog)).toEqual(original)
    expect(boardOf(fx).assets).toHaveLength(2)

    const confirmedId = createPsdCutoutJob(fx.db, fx.paths, seeded.dogId)
    const confirmedSpec = parseCutoutJobFile(
      JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `cutout-${confirmedId}.json`), 'utf8'))
    )
    writeFileSync(join(fx.paths.bridgeDir, 'outputs', confirmedSpec.outputFile), cutoutPng())
    finishCutoutLikePlugin(fx, confirmedId, { ok: true, error: null, outputFile: confirmedSpec.outputFile })
    syncPsdCutoutResults(fx.db, fx.paths)
    const newAssetId = confirmPsdCutoutJob(fx.db, fx.paths, confirmedId)
    const board = boardOf(fx)
    const newAsset = board.assets.find((asset) => asset.id === newAssetId)
    expect(newAsset).toMatchObject({ kind: 'dog', label: 'dog（抠图）', width: 40, height: 40, hasAlpha: true })
    expect(board.cutouts.find((job) => job.id === confirmedId)).toMatchObject({
      status: 'confirmed',
      confirmedAssetId: newAssetId,
      resultUrl: null
    })
    expect(existsSync(join(fx.paths.bridgeDir, 'outputs', confirmedSpec.outputFile))).toBe(false)
    expect(readFileSync(fx.dog)).toEqual(original)

    const exportJob = createPsdJob(fx.db, fx.paths, {
      templateId: seeded.templateId,
      title: '确认后导出',
      items: [{ slotId: seeded.slotIds[0], dogAssetId: newAssetId, nameAssetId: seeded.nameId }]
    })
    expect(
      parseJobFile(JSON.parse(readFileSync(join(fx.paths.bridgeDir, 'inbox', `${exportJob}.json`), 'utf8')))
        .replacements[0]?.file
    ).toBe('slot_01_dog.png')
  })
})

describe('Photoshop 安装位置', () => {
  it('找不到时返回空，找得到时取版本名较新的一个', () => {
    const fx = useFixture()
    expect(findPhotoshopApp([join(fx.root, 'missing')])).toBeNull()
    const older = join(fx.root, 'Adobe Photoshop 2024.app')
    const newer = join(fx.root, 'Adobe Photoshop 2025', 'Photoshop.exe')
    mkdirSync(older)
    mkdirSync(join(fx.root, 'Adobe Photoshop 2025'))
    writeFileSync(newer, '')
    expect(findPhotoshopApp([fx.root])).toBe(newer)
  })
})

describe('插件约定', () => {
  it('安装为 CEP 面板并由隐藏后台扩展处理 Photoshop 队列', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../photoshop-plugin/ajuan-psd')
    const panel = readFileSync(join(root, 'index.js'), 'utf8')
    const worker = readFileSync(join(root, 'worker.js'), 'utf8')
    const host = readFileSync(join(root, 'host.jsx'), 'utf8')
    const manifest = readFileSync(join(root, 'CSXS/manifest.xml'), 'utf8')
    expect(manifest).toContain('com.clukay.ajuan.psd.panel')
    expect(manifest).toContain('com.clukay.ajuan.psd.worker')
    expect(manifest).toContain('<Type>Custom</Type>')
    expect(manifest).toContain('<Event>applicationActivate</Event>')
    expect(manifest).toContain('--enable-nodejs')
    expect(manifest.split('<Extension Id="com.clukay.ajuan.psd.panel">')[1]).not.toContain('--enable-nodejs')
    expect(panel).toContain('window.cep')
    expect(panel).not.toContain("require('fs')")
    expect(worker).toContain('replace(/^file:')
    expect(worker).toContain('AjuanPS.runHex(')
    expect(worker).toContain('payload.templatePath')
    expect(worker).toContain('Photoshop 导出参数不完整')
    expect(host).toContain('placedLayerReplaceContents')
    expect(host).toContain('function decodeHex(hex)')
    expect(host).toContain('Photoshop 收到的导出任务缺少 templatePath')
    expect(host).toContain('layer.resize(scale * 100, scale * 100, AnchorPosition.MIDDLECENTER)')
    expect(host).toContain("layer.translate(UnitValue(dx, 'px'), UnitValue(dy, 'px'))")
    expect(host).toContain('变换未落入模板范围')
    expect(host).toContain('doc.saveAs(output, options, true, Extension.LOWERCASE)')
    expect(host).toContain('DONOTSAVECHANGES')
    expect(host).toContain('图层不存在:')
    expect(host).toContain('图层已锁定:')
    expect(host).toContain('图层不是智能对象:')
    expect(host).toContain('打开了错误文件:')
    expect(host).not.toMatch(/doc\.save\(/)
  })

  it('macOS UXP 插件保留独立入口和队列处理', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../photoshop-plugin/ajuan-psd/uxp')
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
    const script = readFileSync(join(root, 'index.js'), 'utf8')
    expect(manifest.host.app).toBe('PS')
    expect(manifest.entrypoints.some((entry: { type: string }) => entry.type === 'panel')).toBe(true)
    expect(script).toContain('entrypoints.setup(')
    expect(script).toContain('runQueue(')
  })

  it('CEP JSX 按任务类型分别打开 PSD 模板与抠图原图', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../photoshop-plugin/ajuan-psd')
    const source = readFileSync(join(root, 'host.jsx'), 'utf8').replace(/^#target photoshop\s*/, '')
    const dispatch = (payload: Record<string, unknown>) => {
      const json = JSON.stringify(payload)
      let hex = ''
      for (let i = 0; i < json.length; i++) hex += ('000' + json.charCodeAt(i).toString(16)).slice(-4)
      const raw = runInNewContext(`${source}\nAjuanPS.runHex("${hex}")`, {
        File: (path: string) => ({ exists: true, fsName: path }),
        app: {
          open: (file: { fsName: string }) => {
            throw new Error(`OPEN_CALLED:${file.fsName}`)
          }
        }
      }) as string
      return JSON.parse(raw) as { ok: boolean; error: string }
    }

    const exported = dispatch({
      kind: 'export',
      templatePath: 'C:\\Bridge\\staging\\5\\template.psd',
      outputPath: 'C:\\Downloads\\out.psd',
      replacements: []
    })
    const cutout = dispatch({
      kind: 'cutout',
      sourcePath: 'C:\\Bridge\\staging\\cutout-6\\source.jpg',
      outputPath: 'C:\\Downloads\\out.png',
      assetKind: 'dog'
    })

    expect(exported.error).toBe('OPEN_CALLED:C:\\Bridge\\staging\\5\\template.psd')
    expect(cutout.error).toBe('OPEN_CALLED:C:\\Bridge\\staging\\cutout-6\\source.jpg')
  })
})

describe('Photoshop 进程', () => {
  it('只认 Photoshop 主进程，不把 AdobeIPCBroker 算作宿主', () => {
    const listing = [
      '17829 /Applications/Utilities/AdobeIPCBroker -launchedbyvulcan /Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app/Contents/MacOS/Adobe Photoshop 2026',
      '19606 /Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app/Contents/MacOS/Adobe Photoshop 2026'
    ].join('\n')
    expect(darwinPhotoshopPids(listing)).toEqual([19606])
    expect(windowsPhotoshopPids('"Photoshop.exe","4242","Console","1","120,000 K"')).toEqual([4242])
  })

  it('并发启动共用同一次，结束后下一次会重新启动', async () => {
    const gate = createLaunchGate<number>()
    let starts = 0
    let release!: (pid: number) => void
    const started = new Promise<number>((resolve) => {
      release = resolve
    })
    const first = gate.run(async () => {
      starts += 1
      return started
    })
    const second = gate.run(async () => {
      starts += 1
      return 2
    })
    expect(starts).toBe(1)
    release(9)
    await expect(first).resolves.toBe(9)
    await expect(second).resolves.toBe(9)
    await expect(
      gate.run(async () => {
        starts += 1
        return 3
      })
    ).resolves.toBe(3)
    expect(starts).toBe(2)
  })
})

function finishLikePlugin(
  fx: ReturnType<typeof fixture>,
  jobId: number,
  result: { ok: boolean; replaced: string[]; error: string | null; outputFile: string | null }
): void {
  const inbox = join(fx.paths.bridgeDir, 'inbox', `${jobId}.json`)
  const spec = parseJobFile(JSON.parse(readFileSync(inbox, 'utf8')))
  const folder = result.ok ? 'done' : 'failed'
  writeFileSync(join(fx.paths.bridgeDir, folder, `${jobId}.json`), JSON.stringify({ ...spec, result }, null, 2))
  rmSync(inbox)
}

function finishCutoutLikePlugin(
  fx: ReturnType<typeof fixture>,
  jobId: number,
  result: { ok: boolean; error: string | null; outputFile: string | null }
): void {
  const key = `cutout-${jobId}`
  const inbox = join(fx.paths.bridgeDir, 'inbox', `${key}.json`)
  const processing = join(fx.paths.bridgeDir, 'processing', `${key}.json`)
  const done = join(fx.paths.bridgeDir, result.ok ? 'done' : 'failed', `${key}.json`)
  if (existsSync(inbox)) renameSync(inbox, processing)
  const spec = parseCutoutJobFile(JSON.parse(readFileSync(processing, 'utf8')))
  writeFileSync(processing, JSON.stringify({ ...spec, result }, null, 2))
  renameSync(processing, done)
}
