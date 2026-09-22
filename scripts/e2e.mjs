// 依次在 Electron 里跑 tests/e2e/*.e2e.cjs；任一失败即退出非零。先 npm run build。
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
const pkg = require('../package.json')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const only = process.argv[2]
const scenarios = readdirSync(resolve(root, 'tests/e2e'))
  .filter((f) => f.endsWith('.e2e.cjs'))
  .map((f) => f.replace('.e2e.cjs', ''))
  .filter((n) => !only || n === only)

let failed = 0
for (const name of scenarios) {
  const r = spawnSync(electron, [resolve(root, 'tests/e2e/run.cjs'), name], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    // 开发态 getApplicationVersion() 读 npm_package_version；直接 node 运行时补上
    env: { ...process.env, npm_package_version: pkg.version },
    timeout: 120_000
  })
  const out = (r.stdout?.toString() ?? '') + (r.stderr?.toString() ?? '')
  const lines = out.split('\n').filter((l) => /^(PASS|FAIL|断言|Error|\s+期望|\s+实际|\s+at )/.test(l))
  console.log(lines.join('\n') || out.slice(-600))
  if (r.status !== 0) failed++
}
console.log(failed ? `\n${failed} 个场景失败` : `\n全部 ${scenarios.length} 个场景通过`)
process.exit(failed ? 1 : 0)
