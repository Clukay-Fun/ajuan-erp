/* eslint-disable */
// 附件上传 / 协议越界拒绝 / 商品图 / 备份恢复后窗口重载 / 回收目录 / 重启持久化
const { launch, assert, eq, sleep, ROOT } = require('./harness.cjs')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

function png(w, h, rgb) {
  const crc = (buf) => {
    let c = ~0
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
    return ~c >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const raw = Buffer.concat(
    Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.from(Array(w).fill(rgb).flat())]))
  )
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

module.exports = async () => {
  const t = await launch()
  const red = [...png(32, 32, [220, 60, 60])]
  await t.api(`opening.create({ skuId: 1, quantity: 50, unitCostCents: 1000, docDate: '2026-09-20', note: '' })`)
  const d = await t.api(
    `documents.createDraft({ type: 'inbound', docDate: '2026-09-21', channelId: null, externalOrderNo: '', note: '带图', items: [{ skuId: 1, quantity: 5, unitPriceCents: 1200 }] })`
  )
  const a = await t.api(
    `attachments.add(${d.id}, { fileName: '红.png', mime: 'image/png', data: new Uint8Array(${JSON.stringify(red)}).buffer })`
  )
  eq(a.mime, 'image/png', '附件类型')
  const badAtt = await t.apiErr(
    `attachments.add(${d.id}, { fileName: 'x.png', mime: 'image/png', data: new TextEncoder().encode('hello').buffer })`
  )
  eq(badAtt && badAtt.code, 'VALIDATION', '非图片拒绝')
  const loaded = await t.js(
    `return await new Promise(res => { const i = new Image(); i.onload = () => res(i.naturalWidth); i.onerror = () => res('err'); i.src = 'ajuan-file://attachments/${a.relPath}' })`
  )
  eq(loaded, 32, '协议应能加载附件图')
  const escape = await t.js(
    `return await fetch('ajuan-file://attachments/../ajuan.db').then(r => r.status).catch(() => 'blocked')`
  )
  assert(escape === 'blocked' || escape === 403, '越界路径应被拒绝')

  const p = await t.api(
    `products.setImage(1, { fileName: 'p.png', mime: 'image/png', data: new Uint8Array(${JSON.stringify(red)}).buffer })`
  )
  assert(p.imagePath && p.imagePath.startsWith('product/'), '商品图路径')
  await t.ui(`await click('商品', 500)`)
  await t.shot('backup-product-image.png')

  // 用与 createBackup 相同格式手工打一份备份（对话框无法自动化），随后改数据再恢复
  const AdmZip = require(path.join(ROOT, 'node_modules/adm-zip'))
  const { DatabaseSync } = require('node:sqlite')
  const crypto = require('node:crypto')
  const dbPath = path.join(t.ud, 'ajuan.db'),
    tmp = path.join(t.ud, 'copy.db')
  const dbc = new DatabaseSync(dbPath)
  dbc.exec(`VACUUM INTO '${tmp}'`)
  dbc.close()
  const zip = new AdmZip()
  const files = []
  const add = (entry, buf) => {
    zip.addFile(entry, buf)
    files.push({ path: entry, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') })
  }
  add('ajuan.db', fs.readFileSync(tmp))
  const walk = (dir, rel) => {
    for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
      const pp = path.join(dir, n.name)
      if (n.isDirectory()) walk(pp, rel + n.name + '/')
      else add('attachments/' + rel + n.name, fs.readFileSync(pp))
    }
  }
  walk(path.join(t.ud, 'attachments'), '')
  zip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify({
        app: 'ajuan-inventory',
        formatVersion: 1,
        appVersion: require('../../package.json').version,
        schemaVersion: 2,
        createdAt: new Date().toISOString(),
        counts: { documents: 2, movements: 1, attachments: 1 },
        files
      })
    )
  )
  const bk = path.join(t.ud, 'backup.zip')
  zip.writeZip(bk)

  await t.api(`documents.confirm(${d.id})`)
  eq((await t.api('inventory.getStock(1)')).quantity, 55, '恢复前库存 55')
  eq((await t.api(`backup.inspect(${JSON.stringify(bk)})`)).problems, [], '备份校验通过')
  await t.api(`backup.restore(${JSON.stringify(bk)})`)
  await sleep(1500)
  eq((await t.api('inventory.getStock(1)')).quantity, 50, '恢复后库存回到 50')
  eq((await t.api(`attachments.list(${d.id})`)).length, 1, '附件恢复')
  const trash = await t.api('backup.listTrash()')
  eq(trash.length, 1, '回收目录一份')
  await t.api('backup.clearTrash()')
  eq((await t.api('backup.listTrash()')).length, 0, '回收目录清空')

  // 持久化：另开一个连接直接读磁盘上的库（WAL 下可并发读），并确认窗口状态已落盘
  t.current().setSize(1100, 760)
  await sleep(600)
  const check = new DatabaseSync(dbPath)
  eq(check.prepare('SELECT quantity FROM sku_stock WHERE sku_id = 1').get(), { quantity: 50 }, '磁盘上的库存与内存一致')
  eq(check.prepare('SELECT MAX(version) AS v FROM schema_migrations').get(), { v: 5 }, 'schema 版本')
  check.close()
  const ws = JSON.parse(fs.readFileSync(path.join(t.ud, 'window-state.json'), 'utf8'))
  eq([ws.bounds.width, ws.bounds.height], [1100, 760], '窗口尺寸已记忆')
}
