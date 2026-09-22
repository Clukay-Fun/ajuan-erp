# 阿卷库存（ajuan-erp）

> 本地、单用户的成品库存管理桌面应用。首版管理一个成品“电动车发光小饰品”的入库、出库、库存流水与日期汇总。

产品与技术计划见 `docs/product-plan-v0.1.md`，视觉系统见 `docs/design-system.md`。

## 技术栈

Electron 43 · electron-vite · React 19 + TypeScript · CSS Modules + CSS Variables · Lucide · SQLite（`node:sqlite`，Node 24 内置）· Vitest · electron-builder

## 开发

```bash
npm install
npm run dev          # 开发模式（热更新）
npm run typecheck    # 主进程 / preload / renderer 类型检查
npm test             # Vitest 单元测试
npm run e2e          # 构建后在 Electron 里跑 tests/e2e 场景（npm run e2e:only <name> 跳过构建）
npm run lint         # ESLint + Prettier 检查
npm run build        # 产出 out/
npm run build:mac    # macOS Apple Silicon DMG（未签名时设 CSC_IDENTITY_AUTO_DISCOVERY=false）
npm run build:win    # Windows x64 NSIS 安装包
```

## 目录

```text
src/
├─ main/       Electron 主进程：窗口、IPC 处理
│  ├─ db/       node:sqlite 连接、事务与 migration
│  └─ services/ 商品 / 库存流水 / 期初等业务服务（纯函数，可直接单测）
├─ preload/    contextBridge 白名单 API（window.ajuan.*）
├─ shared/     主进程与 renderer 共用的 IPC 契约与类型
└─ renderer/   React 页面：概览 / 商品 / 库存 / 单据 / 汇总 / 设置
   ├─ app/       页面路由与导航上下文（无 router 依赖，state 驱动）
   ├─ components/ Button / Field / Select / Drawer / ConfirmDialog / Toast / Badge 等通用组件
   └─ features/  按业务拆分的页面块（products / documents / settings）
tests/         Vitest 单元测试；tests/e2e/ 为 Electron 端到端场景
docs/          产品与技术计划
```

## 安全边界

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- renderer 不能访问 Node、文件系统或 SQLite，只能调用 preload 暴露的按业务命名的方法
- 主进程校验每个 IPC 请求的来源帧；拒绝所有权限请求；`window.open` 与跨页导航被拦截
- 严格 CSP，不允许外部脚本与 CDN

## 数据与金额约定

- 数据库位于用户数据目录下的 `ajuan.db`（WAL 模式）；`schema_migrations` 记录已执行版本，启动时自动补齐。
- 对外金额一律整数分；库存成本总额与平均成本用 1/10000 元（e4）的定点整数，见 `src/shared/money.ts`。
- `sku_stock` 是当前快照，`stock_movements` 是不可变流水，任意时点库存可由流水重放。
- 业务时间（`doc_date` / `occurred_at`）用本地时间、无时区后缀；审计时间戳（`created_at` / `confirmed_at` / `voided_at`）用 ISO UTC。
- 概览与汇总只统计 `status = 'confirmed'` 的入库 / 出库单，按 `doc_date` 归属；作废单与草稿不计。流水页则展示全部记录含作废冲回。

## 附件与备份

- 附件文件在 `<userData>/attachments/YYYY/MM/<uuid>.<ext>`，数据库只存相对路径；renderer 通过 `ajuan-file://attachments/<relPath>` 读取，主进程解析路径后拒绝任何越出附件目录的请求。
- 备份是 zip：`manifest.json`（app / formatVersion / schemaVersion / counts / 每个文件的 size + sha256）+ `ajuan.db` + `attachments/**`。
- 恢复前校验 manifest 与哈希并试开数据库；现有数据整体移到 `<userData>/restore-trash/<时间戳>/`，需要时可手动找回；恢复后按需执行 migration 并重载窗口。
- 数据库连接由 `src/main/appState.ts` 持有，恢复时关闭并替换。

## CSV 导入约定

- 一行 = 一张已生效单据的一行明细；列：`类型,日期,数量,单价,渠道,外部订单号,备注`，表头必须与模板一致（应用内可下载模板）。
- 编码优先严格 UTF-8，失败按 GBK 解码；导出文件带 BOM。
- 校验阶段不写库；按日期（同日按行序）模拟库存，出库不足视为错误；任一行错误整批不写。
- 重复外部订单号（文件内或与已有单据）是警告而非错误，需用户勾选确认后才能导入。
- 文件读写与对话框只在主进程；renderer 只传递路径字符串，且只接受 `.csv` / `.txt`、≤ 5MB、≤ 5000 行。

## 里程碑

M0 桌面安全外壳 ✅ → M1 SQLite/商品/期初 ✅ → M2 入库出库作废 ✅ → M3 流水搜索汇总 ✅ → M4 CSV ✅ → M5 附件备份 ✅ → M6 UI 精修 ✅ → v0.2 库存调整 / 商品图 / E2E ✅（Windows 冒烟待做）

## 许可证

未指定。
