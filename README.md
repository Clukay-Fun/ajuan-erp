# 阿卷库存（ajuan-erp）

> 本地、单用户的成品库存管理桌面应用。首版管理一个成品“电动车发光小饰品”的入库、出库、库存流水与日期汇总。

产品与技术计划见 `docs/product-plan-v0.1.md`。

## 技术栈

Electron 43 · electron-vite · React 19 + TypeScript · CSS Modules + CSS Variables · Lucide · SQLite（M1 起）· Vitest · electron-builder

## 开发

```bash
npm install
npm run dev          # 开发模式（热更新）
npm run typecheck    # 主进程 / preload / renderer 类型检查
npm test             # Vitest
npm run build        # 产出 out/
npm run build:mac    # macOS Apple Silicon DMG（未签名时设 CSC_IDENTITY_AUTO_DISCOVERY=false）
npm run build:win    # Windows x64 NSIS 安装包
```

## 目录

```text
src/
├─ main/       Electron 主进程：窗口、IPC 处理、后续的 SQLite 服务
├─ preload/    contextBridge 白名单 API（window.ajuan.*）
├─ shared/     主进程与 renderer 共用的 IPC 契约与类型
└─ renderer/   React 页面：概览 / 商品 / 库存 / 单据 / 汇总 / 设置
tests/         Vitest 单元测试
docs/          产品与技术计划
```

## 安全边界

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- renderer 不能访问 Node、文件系统或 SQLite，只能调用 preload 暴露的按业务命名的方法
- 主进程校验每个 IPC 请求的来源帧；拒绝所有权限请求；`window.open` 与跨页导航被拦截
- 严格 CSP，不允许外部脚本与 CDN

## 里程碑

M0 桌面安全外壳 ✅ → M1 SQLite/商品/期初 → M2 入库出库作废 → M3 流水搜索汇总 → M4 CSV → M5 附件备份 → M6 UI 精修与双平台验收

## 许可证

未指定。
