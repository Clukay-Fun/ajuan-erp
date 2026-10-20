#!/usr/bin/env node
// 检查 renderer 里引用了却没有定义的 CSS 变量：未定义的 var() 会静默失效（字重、颜色退回继承值）。
// 带 fallback 的 var(--x, …) 与运行时由库注入的变量不算错误。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGET_DIR = path.join(ROOT, 'src/renderer/src')
// 由 Base UI 在运行时写到浮层元素上的变量，或由 TSX 内联 style 注入的变量
const RUNTIME_VARS = new Set(['--anchor-width', '--available-height', '--transform-origin'])

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : [full]
  })
}

const files = walk(TARGET_DIR).filter((f) => /\.(css|tsx?)$/.test(f))
const defined = new Set(RUNTIME_VARS)
const uses = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  // CSS 声明 `--x:`，以及 TSX 内联 style 里的 `'--x':`
  for (const m of content.matchAll(/['"]?(--[a-zA-Z0-9-]+)['"]?\s*:/g)) defined.add(m[1])
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g)) {
      if (m[2] === ',') continue
      uses.push({ name: m[1], file: path.relative(ROOT, file), line: i + 1 })
    }
  })
}

const missing = uses.filter((u) => !defined.has(u.name))
if (missing.length > 0) {
  console.error(`\n❌ 发现 ${missing.length} 处引用了未定义的 CSS 变量：\n`)
  for (const u of missing) console.error(`  ${u.file}:${u.line}  ${u.name}`)
  process.exit(1)
}
console.log(`✅ CSS 变量检查通过：${uses.length} 处引用均有定义。`)
