#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TARGET_DIR = path.join(ROOT, 'src/renderer/src')

function findFiles(dir, filter) {
  let results = []
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat && stat.isDirectory()) {
      results = results.concat(findFiles(fullPath, filter))
    } else if (filter(fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

const cssFiles = findFiles(TARGET_DIR, (f) => f.endsWith('.module.css'))
const COLOR_REGEX = /(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/g

let errors = []

for (const file of cssFiles) {
  const relPath = path.relative(ROOT, file)
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split('\n')

  let inBlockComment = false

  lines.forEach((line, index) => {
    let cleanLine = line

    // 处理多行注释跨行
    if (inBlockComment) {
      const endComment = cleanLine.indexOf('*/')
      if (endComment !== -1) {
        cleanLine = cleanLine.substring(endComment + 2)
        inBlockComment = false
      } else {
        return
      }
    }

    // 去除单行内的 /* ... */
    cleanLine = cleanLine.replace(/\/\*.*?\*\//g, '')

    // 如果还有开始注释
    const startComment = cleanLine.indexOf('/*')
    if (startComment !== -1) {
      cleanLine = cleanLine.substring(0, startComment)
      inBlockComment = true
    }

    // 匹配裸色值（排除 url() 与 var() 中的安全占位）
    const matches = cleanLine.match(COLOR_REGEX)
    if (matches) {
      // 检查每项匹配是否在 var() 中
      for (const m of matches) {
        // 如果该行包含了 var( 且颜色值只是 var 的默认 fallback，或者直接是独立颜色属性
        // 按照阶段 1 规范，module.css 中完全不允许出现任何裸色字面量
        errors.push({
          file: relPath,
          line: index + 1,
          color: m,
          raw: line.trim()
        })
      }
    }
  })
}

if (errors.length > 0) {
  console.error(`\n❌ 在 CSS Modules 中发现 ${errors.length} 处裸颜色字面量，请替换为语义 Token：\n`)
  for (const err of errors) {
    console.error(`  ${err.file}:${err.line} -> ${err.color} (在 "${err.raw}")`)
  }
  process.exit(1)
} else {
  console.log(`\n✅ 颜色合规性检查通过：已扫描 ${cssFiles.length} 个 CSS Modules 文件，无裸颜色字面量。`)
  process.exit(0)
}
