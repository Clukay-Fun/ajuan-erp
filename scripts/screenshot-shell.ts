import { _electron as electron } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs/redesign/shell');

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function run(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ajuan-shell-screenshot-'));

  console.log('正在启动 Electron 实例生成阶段 3 全局外壳截图...');
  const app = await electron.launch({
    args: [`--user-data-dir=${ud}`, ROOT],
    env: {
      ...process.env,
      AJUAN_DATA_DIR: ud,
      npm_package_version: '0.2.7',
    },
  });

  try {
    const page = await app.firstWindow();

    // 1. 测试 960x640 窗口：侧栏自动默认折叠，无横向滚动
    await page.setViewportSize({ width: 960, height: 640 });
    await sleep(1500);

    // 载入示例业务数据
    await page.evaluate(async () => {
      try {
        // @ts-expect-error window.ajuan
        await window.ajuan.demo.seed();
      } catch {
        // 忽略
      }
    });
    await sleep(800);

    console.log('截取 960x640 紧凑视口下侧栏折叠状态...');
    await page.screenshot({
      path: path.join(OUT_DIR, 'shell-960x640-collapsed-light.png'),
    });

    // 2. 调整为 1280x800：展开侧栏，截取深浅两色概览外壳
    await page.setViewportSize({ width: 1280, height: 800 });
    await sleep(600);

    // 按 ⌘\ 展开侧栏
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+\\' : 'Control+\\');
    await sleep(400);

    console.log('截取 1280x800 展开侧栏浅色外壳...');
    await page.screenshot({
      path: path.join(OUT_DIR, 'shell-1280x800-expanded-light.png'),
    });

    console.log('截取 1280x800 展开侧栏深色外壳...');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await sleep(400);
    await page.screenshot({
      path: path.join(OUT_DIR, 'shell-1280x800-expanded-dark.png'),
    });

    // 3. 打开 ⌘K 命令面板并输入商品检索
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await sleep(300);

    console.log('唤出 ⌘K 命令面板并检索...');
    await page.keyboard.press(isMac ? 'Meta+k' : 'Control+k');
    await sleep(600);

    await page.keyboard.type('立牌', { delay: 100 });
    await sleep(600);

    console.log('截取命令面板检索状态...');
    await page.screenshot({
      path: path.join(OUT_DIR, 'shell-command-palette-search.png'),
    });

    await page.keyboard.press('Escape');
    await sleep(300);

    console.log('全局外壳验证与截图全部完成！');
  } finally {
    await app.close();
    try {
      fs.rmSync(ud, { recursive: true, force: true });
    } catch {
      // 忽略清理临时目录错误
    }
  }
}

run().catch((err) => {
  console.error('阶段 3 外壳截图失败:', err);
  process.exit(1);
});
