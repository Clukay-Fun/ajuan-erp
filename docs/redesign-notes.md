# 阿卷 ERP 界面重构执行日志 (Redesign Notes)

> 记录重构各阶段的现状盘点、计划外的决定、与重构计划的偏差。

---

## 阶段 0：现状盘点

### 1. 验收命令清单

在 `package.json` 中配置的质量与验收命令如下：

| 命令分类 | 对应脚本名称 | 执行指令 |
| --- | --- | --- |
| **类型检查 (typecheck)** | `typecheck` | `tsc --noEmit -p config/tsconfig.node.json && tsc --noEmit -p config/tsconfig.web.json` |
| **代码检查 (lint)** | `lint` | `eslint . --config config/eslint.config.js && prettier --config config/.prettierrc --ignore-path config/.prettierignore --check .` |
| **单元测试 (test)** | `test` | `vitest run --config config/vitest.config.ts` |
| **开发调试 (dev)** | `dev` | `electron-vite dev --config config/electron.vite.config.ts` |
| **打包构建 (build)** | `build` | `electron-vite build --config config/electron.vite.config.ts` |
| **端到端测试 (e2e)** | `e2e` / `e2e:only` | `npm run build && node scripts/e2e.mjs` |

---

### 2. Renderer 目录结构与架构盘点

项目前端根路径为 `src/renderer/src/`。各部分职责明确：

#### 2.1 页面 (Pages)
- `pages/OverviewPage.tsx`：概览工作台，展示关键指标、出入库趋势、库存状态与最近单据。
- `pages/ProductsPage.tsx`：商品管理列表与商品画像。
- `pages/DocumentsPage.tsx`：单据中心包装入口，根据路由状态渲染 `DocumentList`、`DocumentEditor` 或 `DocumentDetailView`。
- `pages/PsdPage.tsx`：定制业务页面，包含模板、槽位、素材库、导出生成与任务队列。
- `pages/SettingsPage.tsx`：系统设置，集成外观、渠道、备份恢复、示例数据、更新与应用信息。

#### 2.2 自研组件及其所在文件
- **基础通用组件**（`components/`）：
  - `Badge.tsx` (`Badge.module.css`)：状态徽标与单据类型徽标。
  - `Button.tsx` (`Button.module.css`)：按钮控件（包含 primary、secondary、ghost、danger 变体）。
  - `ConfirmDialog.tsx` (`ConfirmDialog.module.css`)：模态二次确认弹窗（具备焦点锁定）。
  - `Drawer.tsx` (`Drawer.module.css`)：居中模态遮罩弹窗（历史命名为 Drawer，实际为 Modal）。
  - `Dropdown.tsx` (`Dropdown.module.css`)：受控下拉菜单选择器。
  - `EmptyState.tsx` (`EmptyState.module.css`)：空状态占位展示。
  - `Field.tsx` (`Field.module.css`)：带 Label、错误提示的表单输入容器。
  - `PageHeader.tsx` (`PageHeader.module.css`)：页面顶部标题栏及右侧动作操作区。
  - `Select.tsx`：原生 Select 语义封装。
  - `Shell.tsx` (`Shell.module.css`)：系统桌面外壳（左侧导航栏、主内容区）。
  - `Skeleton.tsx` (`Skeleton.module.css`)：骨架屏加载占位符。
  - `TableEmpty.tsx`：表格空数据行。
  - `Toast.tsx` (`Toast.module.css`)：全局浮层提示。
- **业务特性组件**（`features/`）：
  - `overview/TrendChart.tsx`：纯 SVG 逐日出入库双柱趋势图。
  - `products/ProductImage.tsx`：商品图片上传与缩略图展示。
  - `products/ProductMovements.tsx`：单商品专属库存变动流水表。
  - `products/ProductEditDrawer.tsx`：商品创建/编辑居中弹窗。
  - `products/OpeningStockDrawer.tsx`：期初库存录入居中弹窗。
  - `adjustments/AdjustmentDrawer.tsx`：库存调整（盘亏/盘盈）居中弹窗。
  - `documents/DocumentList.tsx`：单据列表筛选与管理。
  - `documents/DocumentEditor.tsx`：出入库开单表单居中弹窗。
  - `documents/DocumentDetailView.tsx`：单据详情与流转操作。
  - `attachments/AttachmentPanel.tsx`：单据图片附件上传网格与预览。
  - `csv/ImportDialog.tsx`：历史单据 CSV 导入居中弹窗。
  - `settings/AppearanceSettings.tsx`：主题偏好设置卡片。
  - `settings/BackupSettings.tsx`：数据备份与还原。
  - `settings/ChannelSettings.tsx`：销售渠道增改与启停。
  - `settings/DemoDataSettings.tsx`：示例数据载入。
  - `settings/TrashSettings.tsx`：业务数据清空与回收。
  - `settings/UpdateSettings.tsx`：软件版本检查与自动更新。

#### 2.3 现有 CSS Token 文件
- `styles/tokens.css`：当前统一定义了颜色变量（`--color-bg`, `--color-surface`, `--color-primary` 等）、间距标尺、圆角与阴影。
- `styles/global.css`：全局基础样式、字体平滑与盒模型重置。

#### 2.4 主题切换实现方式
- 位于 `src/renderer/src/lib/theme.ts`。
- 本地存储键：`ajuan.theme`（值为 `'system'` | `'light'` | `'dark'`）。
- 切换机制：通过给根元素 `document.documentElement.setAttribute('data-theme', theme)` 施加属性。当设置为 `'system'` 时移除该属性，交由 CSS 媒体查询 `@media (prefers-color-scheme: dark)` 驱动。

#### 2.5 导航与路由的实现方式
- 位于 `src/renderer/src/app/navigation.tsx` 与 `routes.ts`。
- 采用 React Context（`NavContext`）实现纯受控状态路由。状态对象为 `{ page: 'overview' | 'products' | 'documents' | 'psd' | 'settings', ...params }`。支持离开脏数据守卫（`dirtyGuard`）。

---

### 3. 弹窗与模态框使用点盘点与替换目标

| 当前组件/使用点 | 所在文件 | 当前形态 | 阶段 2~7 重构目标 |
| --- | --- | --- | --- |
| 商品详情弹窗 | `pages/ProductsPage.tsx` | `Drawer`（居中 Modal 640px） | 替换为 **右侧抽屉**（md: 600px），多级历史返回 |
| 商品新建/编辑弹窗 | `features/products/ProductEditDrawer.tsx` | `Drawer`（居中 Modal 540px） | 并入 **商品抽屉的编辑模式与新建模式** |
| 期初库存录入弹窗 | `features/products/OpeningStockDrawer.tsx` | `Drawer`（居中 Modal 540px） | 并入 **商品抽屉内的期初录入表单** |
| 库存调整弹窗 | `features/adjustments/AdjustmentDrawer.tsx` | `Drawer`（居中 Modal 540px） | 并入 **商品抽屉内嵌表单** 与 **开单抽屉（sm: 420px）**，两处复用同一组件 |
| 开单编辑器（出/入库） | `features/documents/DocumentEditor.tsx` | `Drawer`（居中 Modal 720px） | 替换为 **开单抽屉**（lg: 760px，极速键盘流） |
| 单据详情弹窗 | `features/documents/DocumentList.tsx` | `Drawer`（居中 Modal 640px） | 替换为 **单据抽屉**（md: 600px） |
| CSV 导入弹窗 | `features/csv/ImportDialog.tsx` | `ImportDialog`（居中 Modal 560px）| 替换为 **CSV 导入抽屉**（md: 600px） |
| Photoshop 设置抽屉 | `pages/PsdPage.tsx` | 自写 aside 右侧滑出抽屉 | **删除该抽屉**，全部内容迁移至 设置 › Photoshop 连接 |
| 离开守卫确认 | `app/navigation.tsx`, `DocumentEditor.tsx` | `ConfirmDialog` (alertdialog) | 保留为 **ConfirmDialog**（系统唯二允许的模态确认框之一） |
| 单据作废 / 冲回确认 | `features/documents/DocumentDetailView.tsx` | `ConfirmDialog` | 保留为 **ConfirmDialog** |
| 删除草稿 / 删除附件 | `DocumentDetailView.tsx`, `AttachmentPanel.tsx` | `ConfirmDialog` | 保留为 **ConfirmDialog** |
| 恢复备份 / 清空数据 / 载入示例 | `BackupSettings.tsx`, `TrashSettings.tsx`, `DemoDataSettings.tsx` | `ConfirmDialog` | 保留为 **ConfirmDialog** |
| 定制删除模板 / 删除素材 | `pages/PsdPage.tsx` | `ConfirmDialog` | 保留为 **ConfirmDialog** |

---

### 4. Preload `window.ajuan` API 全量盘点

| 模块 | 方法名 | 参数 | 返回值类型 | 读/写 | 阶段 4 规划 |
| --- | --- | --- | --- | --- | --- |
| `app` | `getInfo` | 无 | `AppInfo` | 读 | 复用（设置与应用信息） |
| `app` | `onState` | `handler` | 注销函数 | 读/事件 | 复用 |
| `update` | `getState` / `check` / `download` / `install` / `setAutoCheck` | 各异 | `UpdateState` 等 | 读/写 | 复用 |
| `products` | `get` / `list` / `getById` | `(id?)` | `Product[]` / `Product` | 读 | 复用，阶段 4 增加 `products.getLastPrices` |
| `products` | `create` / `update` / `setImage` / `clearImage` | 各异 | `Product` | 写 | 保持现有语义不动 |
| `inventory` | `getStock` / `listStock` | `(skuId?)` | `StockLevel` / `StockRow[]` | 读 | 复用 |
| `inventory` | `listMovements` | `filter` | `MovementRow[]` | 读 | 复用（商品抽屉库存流水） |
| `overview` | `get` | 无 | `Overview` | 读 | 现有接口，阶段 4 增加 `stats.getProductHealth` 和 `stats.getLatestActivityDate` |
| `summary` | `get` | `{ from, to, skuId? }` | `Summary` | 读 | 阶段 4 由更强规范的 `stats.getSummary` 与 `stats.getDailySeries` 升级承接 |
| `csv` | `pickImportFile` / `preview` / `commit` / `saveTemplate` | 各异 | 各异 | 读/写 | 保持现有语义不动 |
| `csv` | `exportMovements` / `exportSummary` / `exportDocument`| 各异 | `string \| null` | 读/文件导出 | 复用 |
| `opening` | `get` / `create` | `(skuId)` / `input` | `DocumentDetail` | 读/写 | 保持现有语义不动 |
| `documents` | `list` / `get` / `findDuplicate` | `filter` / `id` | `DocumentSummary[]` / `Detail` | 读 | 复用，阶段 4 增加 `documents.getPendingSummary` |
| `documents` | `createDraft` / `updateDraft` / `deleteDraft` / `confirm` / `void` | 各异 | 各异 | 写 | 保持现有语义不动 |
| `channels` | `list` / `create` / `update` | 各异 | `SalesChannel[]` / 单条 | 读/写 | 复用 |
| `attachments` | `list` / `add` / `remove` | 各异 | 各异 | 读/写 | 复用 |
| `backup` | `create` / `pick` / `inspect` / `restore` / `listTrash` / `clearTrash` | 各异 | 各异 | 读/写 | 复用 |
| `adjustments` | `create` | `input` | `DocumentDetail` | 写 | 保持现有语义不动 |
| `demo` | `hasData` / `seed` / `reset` | 无 | 各异 | 读/写 | 复用 |
| `psd` | `getBoard` / `pickTemplate` / `createTemplate` / `deleteTemplate` ... | 各异 | `PsdBoard` 等 | 读/写 | 全部底层保持不动，仅重构上层界面 |

---

### 5. 核心业务数据来源与计算逻辑解析

- **移动平均成本**：
  核心逻辑位于 `src/main/services/inventory.ts` 的 `applyMovement` 事务中。
  - 入库/期初（库存增加）时，加权累加成本：`cost_value += quantity_delta * unit_cost`；
  - 当前平均成本即 `avgCost = cost_value / quantity`（单位分，由 e4 精度通过 `e4ToCents` 换算）；
  - 出库（库存减少）时，单价强制取当前库存的移动平均成本 `cost_value_before / before`，对应出库成本自库存结存中扣减；若当期出库后库存归零，则直接将剩余成本全额扣尽，避免由于除法整除导致的小数舍入尾差残留。
- **出库「成本快照」**：
  位于 `src/main/services/documents.ts` 的 `confirmDocument`。
  出库单草稿确认生效时，系统为每条出库明细调用 `applyMovement` 记录出库流水，并抓取当前流水生成的 `unit_cost_e4`，立即回写更新至明细表的 `document_items.cost_snapshot_e4` 列。此快照永久固化该笔出库的历史成本，后续入库价格波动绝不影响该单据已实现的成本与毛利。
- **作废冲回**：
  位于 `src/main/services/documents.ts` 的 `voidDocument`。
  单据生效后不可直接删除或修改，作废时状态变更为 `voided`。系统检索该单据下所有的历史正向流水，逐条生成负向对冲流水（`kind = 'void'`，`quantityDelta = -mv.quantity_delta`），且反向冲回时严格沿用原流水写入的 `unit_cost_e4`，确保成本金额对称归还或回扣，不发生财务漂移。
- **TrendChart 数据源**：
  由 `reports.ts` 的 `getSummary` 提供。聚合区间内已确认单据，按天汇总入库量/入库额、出库量/出库额，出库成本基于每张单据的 `cost_snapshot_e4` 统计，得出各自然日真实毛利；`TrendChart.tsx` 基于此纯 SVG 绘制并排双柱与动态悬停交互。

---

### 6. 基线截图产物记录

基线截图脚本：`scripts/screenshot.ts`（使用 Playwright Electron 驱动，注入临时独立目录并在空库自动载入标准 demo 数据）。
尺寸涵盖 `{1280×800, 960×640}`，主题涵盖 `{浅色 (light), 深色 (dark)}`，输出位于 `docs/redesign/before/`。

---

## 阶段 1：设计 Token 与颜色语义

### 1. 三层 Token 体系落地
已在 `src/renderer/src/styles/` 下建立完整清晰的三层 Token 体系：
- **原始层 (Primitives)**：`tokens/primitives.css`
  - 沉淀基础灰阶板（Slate 浅色中性色）、深色灰阶板（Dark Surface）、冷苔墨绿（Cold Moss 品牌色）、经典数据色板（蓝色入库、琥珀出库、紫色调整、灰蓝期初、红色警报告急）。
- **语义层 (Semantic)**：`tokens/semantic.css`
  - 浅色模式（`:root` / `[data-theme='light']`）、深色模式（`[data-theme='dark']`）与高对比度模式（`[data-theme='high-contrast']`）的语义映射。
  - 核心定义：`--bg-app`、`--bg-surface`、`--bg-subtle`、`--border-subtle`、`--border-bold`、`--text-primary`、`--text-secondary`、`--text-muted`、`--accent`、`--accent-hover`、`--accent-text`、`--accent-subtle`。
  - 数据语义规范：入库（`--status-in` / `--status-in-bg`）、出库（`--status-out` / `--status-out-bg`）、调整（`--status-adjust` / `--status-adjust-bg`）、期初（`--status-opening` / `--status-opening-bg`）、危险（`--danger` / `--danger-bg`）、警告预警（`--warning` / `--warning-bg`）、图表颜色（`--chart-in` / `--chart-out`）。
  - 彻底杜绝使用绿色表示数据（原库存、入库使用绿色已被彻底剥离）。
- **基础与工具层 (Base & Utilities)**：`base.css`
  - 跨平台系统字体栈、等宽数字栈（`"SF Mono", Menlo, Consolas, monospace`）、字号标尺（12 / 13 / 14 / 16 / 20 / 28px）。
  - 通用工具类：`.num`（等宽排版与平滑变音）、`.mono`（等宽代码/单号）、`.tabular`。
  - 统一定义全站无障碍键盘焦点环样式与 `@media (prefers-reduced-motion: reduce)` 动画关闭规则。
- **向下兼容入口**：`tokens.css`
  - 保持对旧变量（如 `--color-bg`、`--color-surface` 等）的一对一兼容映射，确保现有页面在未重构前不破损。

### 2. 颜色合规性静态检测工具
- 新建脚本 `scripts/check-colors.mjs`，递归扫描 `src/renderer/src/` 下所有 `*.module.css`。
- 严禁任何十六进制（`#...`）、`rgb(...)`、`rgba(...)`、`hsl(...)` 裸字面量直接出现在组件样式中，违者立即报错并输出具体行号。
- 已挂接至 `package.json` 的 `npm run lint` 任务。

### 3. 硬编码颜色清零
- 对现有工程内 33 个 CSS Modules 文件执行颜色迁移，将 38 处硬编码裸色值替换为标准语义 Token。
- `node scripts/check-colors.mjs` 静态扫描退出码 0，100% 合规。

### 4. 验证情况
- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test`：82 项测试全数通过。
- `npm run build`：构建成功无异常。

