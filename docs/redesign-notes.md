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

---

## 阶段 2：基础组件（Base UI）

### 1. 依赖安装与版本锁定
- 按照设计计划严格要求，安装 `@base-ui/react` 并精确锁定版本号为 `1.9.0`。
- 遵循依赖最小化原则，未引入任何非必需第三方包。

### 2. 标准组件库实现 (src/renderer/src/components/ui/)
共实现 18 类符合紧凑单人工作台风格的基础交互组件：
- **Button**：提供 `primary`（墨绿实心）、`secondary`（细描边）、`ghost`（幽灵态）、`danger`（红色描边）及 `danger-solid`；规范 `sm` (28px) 与 `md` (32px) 双尺寸；支持 `loading` 动画与 `disabledReason` 悬停提示。
- **IconButton**：强制 `label` 属性以确保 ARIA 无障碍访问，自动作为悬停 Tooltip 呈现。
- **Input / Textarea**：32px 高度规范，只读态自动应用 `--bg-subtle`，校验错误于底部提示 `--danger` 文本；支持前缀 (prefix) 与后缀 (suffix)。
- **NumberInput**：等宽数字靠右排版（`.num` / `.mono`），支持前缀（¥）与后缀（件），监听键盘上下键（↑/↓）进行受控步进微调与极值约束。
- **Select**：基于 Base UI Select 原语封装，具备完整的键盘上下切换与回车选中体验。
- **Combobox**：专用于商品检索，抽取并导出纯函数 `filterComboboxItems`，支持按名称、编码 (SPU)、SKU 与自定义关键字模糊匹配；选项支持缩略图与库存徽标。
- **DateInput / DateRangePicker**：单日采用统一样式原生日期框；区间选择基于 Base UI Popover 封装，内置「今天、近 7 天、近 30 天、本月、上月、全部」等预设与自定义起止区间。
- **SegmentedControl**：32px 紧凑分段切换器，选项支持携带微型数字胶囊徽标（如「草稿 1」）。
- **Badge**：
  - `DocTypeBadge`：入库（蓝）、出库（琥珀）、调整（紫）、期初（灰蓝）；
  - `DocStatusBadge`：草稿（灰色描边）、已生效（中性实心加 ✓）、已作废（中划线文本）；
  - `StockBadge`：告急（红）、低于预警（琥珀）、正常（中性）、已停用（灰）。
- **Drawer & DrawerHost**：
  - 从右侧滑出，提供 `sm` (420px)、`md` (600px)、`lg` (760px) 三种规范尺寸，并在小视口下自适应铺满；
  - 全局单例宿主 `DrawerHost`：打开新抽屉自动替换当前抽屉，并维持最多 5 级返回历史栈，顶部提供「← 返回 <上一个抽屉标题>」；
  - 抽屉关闭时自动将焦点归还给触发元素；
  - `dirtyGuard`：未保存时按 Esc 或点击关闭会触发确认弹窗拦截。
- **ConfirmDialog**：基于 Base UI AlertDialog 封装，作为系统唯一允许使用的模态对话框；强制指明具体动作（如「作废并冲回」而非「确定」）。
- **Menu**：基于 Base UI Menu 原语，提供紧凑下拉菜单项，右侧呈现快捷键徽记（如 `⌘N`），支持危险项红色高亮。
- **Tooltip**：基于 Base UI Tooltip 原语，设置 400ms 防误触延迟。
- **Toast & ToastViewport**：右下角堆叠通知队列，默认 3 秒自动淡出，支持「查看」等动作按钮与命令式 `toast.success/error/info`。
- **Table**：提供 36px 紧凑行高、吸顶表头（`--bg-subtle`）、数值右对齐、整行悬停高亮与指针光标样式。
- **Card / StatCard**：细边框无阴影卡片；StatCard 呈现 28px 等宽品牌色数字与 ▲▼ 环比变动百分比。
- **EmptyState**：居中微型灰度图元、一句话原因阐述与最多 3 个引导操作按钮。
- **PageHeader**：56px 高度标准顶栏，左侧 20px 品牌色大标题与计数，右侧操作区。

### 3. 开发环境组件预览画板 (/dev/ui)
- 在 `src/renderer/src/pages/DevUiPage.tsx` 实现全量组件画板，集中呈现所有变体与交互状态。
- 通过 `isDevUiEnabled` 与路由哈希 `#/dev/ui` 挂接，生产构建时自动排除。
- 画板内置实时浅色 / 深色主题无缝切换开关。

### 4. 自动化测试与产物
- 编写 `tests/ui-components.test.ts`，涵盖：
  - Combobox 多维模糊过滤与大小写不敏感匹配；
  - ConfirmDialog 点击取消不触发 onConfirm；
  - DrawerHost 全局单例、抽屉替换、5 级历史栈截断与 dirtyGuard 拦截。
- 编写 Playwright 组件截图脚本 `scripts/screenshot-components.ts`，产出组件截图并归档至 `docs/redesign/components/`：
  - `dev-ui-1280x800-light.png`（浅色画板全景）
  - `dev-ui-1280x800-dark.png`（深色画板全景）
  - `drawer-open-light.png`（中抽屉滑出交互）
  - `confirm-dialog-light.png`（模态确认框拦截）

### 5. 验收情况
- `npm run lint`：通过（52 个 CSS Modules 100% 遵守设计 Token，无裸色值）。
- `npm run typecheck`：通过（TypeScript 0 错误）。
- `npm test`：93 项单元测试全部通过。
- `npm run build`：构建成功无异常。

---

## 阶段 3：全局外壳

### 1. 跨平台标题栏与原生体验
- **macOS**：配置 `titleBarStyle: 'hiddenInset'`，侧栏顶部留出 44px 专属拖拽区（`-webkit-app-region: drag`），系统原生交通灯按钮自然嵌入，右侧留空。
- **Windows**：配置 `titleBarStyle: 'hidden'` 并接入原生 `titleBarOverlay`（高度 40px）。
- **主题联动 IPC**：新增 `windowSetTitleBarOverlay` IPC 通道，在应用切换浅色/深色主题时实时同步覆盖层背景色与图标前景色（当前开发机为 macOS，已通过 IPC 契约和单元测试保证 Windows 逻辑就绪）。

### 2. 双态紧凑侧边栏 (Sidebar)
- 展开宽度 208px，折叠宽度 56px，支持快捷键 `⌘\`（或 `Ctrl+\`）自由切换，折叠状态写入 `localStorage`（键名 `ajuan.sidebar.collapsed`）。
- 响应式适配：当视口宽度小于 1100px 时自动折叠，确保小屏下内容区不发生横向滚动。
- **开单分体按钮**：
  - 展开态：主按钮一键触发新建出库单（⌘N），右侧下拉箭头展开菜单（出库单 ⌘N、入库单 ⇧⌘N、库存调整、导入 CSV）；
  - 折叠态：紧凑 32px ＋ 图标按钮，悬停提示「快速开单」，点击调起开单操作菜单。
- **导航与动态角标**：
  - 概览（⌘1）、商品（⌘2）、单据（⌘3）；
  - 分组「生产」：定制（⌘4）；
  - 底部：设置（⌘5）、折叠切换按钮；
  - 单据项右侧动态呈现草稿数（琥珀色角标），定制项右侧呈现失败任务数（红色角标），数量为 0 时自动隐藏。
  - 折叠状态下隐藏文本与分组标，悬停时通过 400ms Tooltip 气泡展示页面名称与角标数。

### 3. 全局命令面板 (⌘K CommandPalette)
- 基于 Base UI Dialog 原语封装，居中悬浮于视口顶部 15% 处，宽 560px。
- 支持快捷键 `⌘K` 或 `Ctrl+K` 全局唤出与 Esc 快速折叠。
- 内容分组呈现：
  - **操作**：新建出库单、新建入库单、库存调整、新建商品、导入 CSV、导出流水、定制生产、创建备份；
  - **跳转**：五个一级页面快捷导航；
  - **商品**：实时检索商品名称、编码与 SKU，按 Enter 直接打开商品详情，按 `⌘Enter` 极速为该商品新建出库单；
  - **单据**：实时检索单号与外部订单号，最多展示 8 条。
- 搜索框为空时自动展示常用操作清单与快捷入口。
- 键盘上下方向键（↑/↓）循环切换高亮项，回车即刻执行。

### 4. 产物与验证
- 编写 Playwright 截图脚本 `scripts/screenshot-shell.ts`，验证并生成外壳截图存入 `docs/redesign/shell/`：
  - `shell-960x640-collapsed-light.png`（960×640 紧凑视口下侧栏折叠状态）
  - `shell-1280x800-expanded-light.png`（1280×800 展开侧栏浅色外壳）
  - `shell-1280x800-expanded-dark.png`（1280×800 展开侧栏深色外壳）
  - `shell-command-palette-search.png`（⌘K 命令面板搜索商品状态）
- 验收命令：
  - `npm run lint`：通过（53 个 CSS Modules 100% 合规）。
  - `npm run typecheck`：通过。
  - `npm test`：93 项单元测试全数通过。
  - `npm run build`：构建成功无异常。

---

## 阶段 4：只读数据接口

### 1. 新增接口契约与数据结构
按重构计划在 `src/shared/schemas.ts` 与 `src/shared/ipc.ts` 中完成了 6 项核心只读接口的入参与出参契约定义：
1. `stats.getSummary`：接受 `{ from, to }`，返回本期与上一个等长周期的财务指标汇总（出库金额、出库成本、毛利、毛利率、出库件数、出库单数、入库件数、入库金额）与环比变动百分比；
2. `stats.getDailySeries`：接受 `{ from, to, productId? }`，生成自然日补零的连续时序数据（入库件数/金额、出库件数/金额、出库成本、毛利）；
3. `stats.getLatestActivityDate`：无参接口，毫秒级快速检索全局最近一张已生效单据的业务日期，若无业务单据则返回 `null`；
4. `stats.getProductHealth`：接受 `{ windowDays = 30, baseDate? }`，返回每个启用商品的实时库存、平均成本、库存成本、预警值、窗口内出库件数与单数、可售天数及健康状态判定；
5. `documents.getPendingSummary`：无参接口，聚合所有草稿单据并返回单据列表与草稿总数；
6. `products.getLastPrices`：接受 `{ productIds }`，返回各商品最近一次生效入库的进价和出库售价。

### 2. 底层实现与安全边界
- 严禁任何数据库写入或 schema 变更，全量接口均为纯 `SELECT` 聚合查询；
- 在 `src/main/services/stats.ts` 中实现核心算法：
  - 可售天数根据出库单数（>= 3 笔且日均出库 > 0）判定，不足时返回 `null`（UI 显示为破折号）；
  - 健康状态按照 `inactive`（停用商品）、`critical`（库存 <= 0 且近期有出库）、`warning`（库存 <= 预警阈值 或 可售天数 <= 7 天）、`normal` 严谨分流；
  - 环比变动计算内置除以零防御，前周期为零时安全返回 `null`。
- 在 `src/main/ipc.ts` 与 `src/preload/index.ts` 完成双向绑定与暴露。

### 3. 单元测试与验收情况
- 新建专用测试套件 `tests/stats-readonly.test.ts`，覆盖 8 项核心边界场景；
- 全量自动化质量验证：
  - `npm run lint`：通过。
  - `npm run typecheck`：通过。
  - `npm test`：13 个测试套件、101 项单元测试全量通过。
  - `npm run build`：打包构建成功。

---

## 阶段 5：概览工作台

### 1. 结构与交互重构
- **页头与开单按钮收敛**：彻底移除概览页右上角分散的「入库」「出库」按钮（全局统一由侧边栏开单分体按钮与 ⌘N 快捷键承担），信息密度更高；
- **智能时间区间选择器**：
  - 默认取近 30 天，提供今天、7天、30天、本月、上月、自定义 6 档预设；
  - 接入 `stats.getLatestActivityDate`：若近 30 天无生效业务且历史有单据，自动将时间轴往前对齐至最近单据所在窗口，并展示气泡提示「近 30 天无单据，已智能匹配至 MM-DD ~ MM-DD」，附带「回到近 30 天」一键还原；
  - 仅在选择「自定义」时展开 `DateRangePicker`，平时零占位。
- **待处理事项条 (Pending Bar)**：
  - 页面顶部集中拦截待办事项：单据草稿（待确认数）、库存状态（告急与预警数）；
  - 点击草稿条目极速直达单据列表，点击预警条目直达商品列表；
  - 零待办时展示沉稳次级灰字「✓ 一切正常，当前暂无待处理草稿与库存告急」。
- **4 张 KPI 磁贴**：
  - 出库额（主数值、件数/单数、较上期环比，点击跳转出库单据）；
  - 出库毛利（主数值、毛利率、较上期环比，负毛利标红提示）；
  - 当前库存成本（全局库存成本、总件数与商品数，点击跳转商品列表）；
  - 最短可售天数（最短天数、对应商品名称，点击唤起商品抽屉，样本不足优雅展示破折号）。
- **双栏瀑布流主区 (2/3 与 1/3)**：
  - **左栏（出入库面板）**：
    - 集成商品筛选、视图切换（图表 / 明细）与逐日明细 CSV 导出按钮；
    - 纯 SVG 重构 `TrendChart`：超过 62 天自动按周聚合，最多 5 条网格线，鼠标悬停 Tooltip 呈现出入库件数/金额与毛利，空数据中央覆盖引导开单与切区间的 EmptyState；
    - 逐日明细表格：直接贴边（flush 模式），展示日期、出入库件数金额与毛利。
  - **右栏（库存面板与最近单据面板）**：
    - 通用 `Panel` 容器：标准 44px 紧凑面板头、右侧「全部 ›」跳转；
    - 库存卡：紧凑列表，带 32px 缩略图、商品名编码、当前库存、可售天数、健康徽标；
    - 动态细库存条：当前库存比例与预警阈值垂直标线，告急与预警商品置顶排序并标红左边框；
    - 最近单据：展示 5 张最近单据（包含草稿与作废），点击唤起右侧抽屉。
- **零商品首次使用空状态**：
  - 若商品数为 0，整页渲染标准 EmptyState，附带「新建第一个商品」、「导入 CSV」、「载入示例数据」（带 ConfirmDialog 二次确认）。

### 2. 新增与重构组件
- 新建 `src/renderer/src/components/ui/Panel/`（工作台通用 1px 细边框面板套件）；
- 重构 `src/renderer/src/features/overview/TrendChart.tsx` 与样式；
- 在应用根节点挂载全局单例抽屉宿主 `DrawerHost`，使概览工作台可随时唤起右侧抽屉；
- 重写 `src/renderer/src/pages/OverviewPage.tsx` 与 `OverviewPage.module.css`。

### 3. 产物与截图验收
- 编写 Playwright 截图脚本 `scripts/screenshot-overview.ts`，验证并生成全景截图存入 `docs/redesign/overview/`：
  - `overview-1280x820-light.png`（1280×820 宽屏标准浅色看板）
  - `overview-1280x820-dark.png`（1280×820 宽屏标准深色看板 Violet Night）
  - `overview-1024x768-light.png`（1024×768 紧凑单栏响应式浅色）
  - `overview-1024x768-dark.png`（1024×768 紧凑单栏响应式深色）
  - `overview-daily-table-view.png`（逐日明细表格贴边视图）
- 全量质量校验命令：
  - `npm run lint`：通过（54 个 CSS Modules 100% 合规）。
  - `npm run typecheck`：通过。
  - `npm test`：13 个测试套件、101 项单元测试全量通过。
  - `npm run build`：打包构建成功。






---

## 阶段 0–5 复核（接手审查，2026-10-20）

接手后对已提交的阶段 0–5 做了一次复核，发现并修复以下问题（随阶段 6 一起提交）：

### 与用户要求的偏差（用户已确认）
- **深色主题品牌色恢复为紫罗兰**（`--accent` `#7560dc`，文字强调 `--accent-text` `#aa95fa`），浅色保持墨绿。计划写的「深色也用墨绿」与用户此前的明确要求冲突，用户确认保留紫罗兰。
- 为避免与紫罗兰撞色，**「调整」类型色由紫改为青**（浅 `#1b7a8c` / 深 `#5cc4d6`）。
- **页面标题、KPI 数值、商品名、抽屉标题使用 `--accent-text`**（用户要求的「数字强调色」），计划中「品牌色只用于按钮/导航/链接」这一条不执行。

### 缺陷
- **大量 CSS 变量未定义**：`--font-size-*`、`--font-weight-*`、`--line-height-*`、`--radius-control/xs/full`、`--space-1-5/2-5`、`--transition-fast/normal`、`--dur-exit/slow`、`--ease-out`、`--status-critical`、`--warning-border/text` 等 20 余个变量被组件库引用却从未定义，导致字重、字号、过渡静默失效。已在 `base.css` / `semantic.css` 补齐，并新增 `scripts/check-css-vars.mjs` 接入 lint，防止回归。
- **⌘N 被处理两次**：旧的 `useShortcuts` 与新外壳同时监听，⌘N 先开出库单又被改成入库单。已删除 `useShortcuts`，快捷键统一由外壳处理（⌘N 出库、⇧⌘N 入库，与计划一致）。
- **阶段 3 导航状态未落地**：命令面板「打开商品」「新建商品」「导入 CSV」「库存调整」都只是跳页。新增 `app/entityDrawers.tsx`（`useEntityDrawers`），任何地方都能按 id 打开商品 / 单据抽屉；新增 `lib/dataEvents.ts`，抽屉写入后广播刷新底下的页面。偏差：没有把抽屉写进 `{ page, drawer }` 路由状态，而是由 DrawerHost 统一持有，效果等价且不需要改路由。
- **概览里的商品 / 单据抽屉是占位内容**（几行字加「前往商品列表」按钮）。已换成真实的商品抽屉与单据详情。
- **概览商品筛选没有实现**（`filterProductId` 没有 setter），逐日导出还把商品 id 当成 SKU id 传给接口。已补上商品筛选 Select，并改为传默认 SKU id。
- 概览时间范围每次进入都重置，计划要求本次会话内保留。已用模块级变量保存。
- **健康状态口径与计划不一致**：原实现为 critical/warning/normal（把「低于预警」和「可售 ≤7 天」混在一起，库存为 0 但近期无出库时还算正常）。已按计划改为 `out` → `critical`（可售 < 7 天）→ `low`（≤ 预警值）→ `ok`，另保留 `inactive`。补充 5 个单元测试覆盖空库、只有期初、样本不足、告急、低于预警与作废。
- **Select 显示原始 value**：Base UI 的 `Select.Value` 默认渲染 value 本身，空字符串选项（「全部」）显示成「请选择」，数字 value 显示成数字。已改为显示选项文字。
- 页面没有内边距（标题贴着侧栏、按钮贴窗口边），已在外壳内容区统一加内边距。
- 表格告警色条写在 `<tr>` 的 border 上，在当前表格模型下不显示；改为首格 inset 阴影。
- E2E 未纳入各阶段验收，且已失败：备份场景的 schema 版本断言仍是 3（实际 5）；流程场景依赖已删除的弹窗。已修复，`npm run e2e` 3/3 通过。

### 主进程改动说明
- `appState.ts`：开发模式下读取 `AJUAN_DATA_DIR`，让截图 / E2E 脚本使用临时数据目录，不碰开发库。只影响 dev，不影响打包版。

---

## 阶段 6：商品

- 列表页：标题 + 「新建商品」+「更多」（导入 CSV、导出全部流水）；搜索、计数、「显示已停用」；列为商品、SKU、库存、可售天数、平均成本、售价、预警值、状态（只在异常时显示）。告急 / 缺货行左侧红条，低于预警琥珀条。预警值双击就地编辑，Enter 保存、Esc 取消。
- 商品抽屉（md 600px）：标题为商品名（改名后同步，新增 `DrawerHelpers.setTitle`）；头部为图片、编码 · SKU · 单位、健康徽标、「编辑」与「更多」（停用 / 启用、导出该商品流水）；6 格紧凑 StatCard；期初信息条（单号可点开单据抽屉，带「← 返回 商品名」）；未录入期初时可在抽屉内录入（沿用 `opening.create`）；「调整库存」折叠段；库存流水（类型、渠道、日期范围、单号搜索、导出）。
- 调整表单 `AdjustmentForm`：按盘点数 / 按差额两种模式，提示条、动态按钮文案（「确认盘亏 3 件」）、原因必填。独立入口 `AdjustmentDrawerContent`（sm 抽屉，先选商品）复用同一组件。
  - 偏差修正：初版把盘盈的成本传成 `null`，在库存为 0 时会按 0 成本入账，而旧版默认按默认进价。已改回：有库存时传 `null`（服务端按 e4 精度取平均成本），无库存时传默认进价，与旧版行为一致。
- 编辑 / 新建在同一抽屉内，吸底栏「取消 / 保存」；未保存关闭需确认；新建时提示「SKU 将自动生成为 …-DEFAULT」。
- 删除旧的 `ProductEditDrawer`、`OpeningStockDrawer`。旧的 `AdjustmentDrawer` 仍被单据页引用，阶段 7 删除。
- 验收：`scripts/screenshot-products.ts` 覆盖双击改预警值 → 概览健康状态同步、盘亏 3 件 → 流水新增且结存正确、停用 / 启用、期初单据嵌套返回，截图在 `docs/redesign/products/`。E2E 流程场景改为在商品抽屉里录期初、按盘点数盘亏。

### 偏差：抽屉改为居中大弹窗（用户要求）
用户认为右侧抽屉内容太挤，要求改成弹窗。DrawerHost 的行为全部保留（同一时刻一层、原地替换、「← 返回」历史、未保存确认、焦点归还），只把外观改成居中弹窗：sm 480px（自适应高度）、md 880px、lg 960px，高度最多 860px。代码里仍沿用 Drawer 命名。商品详情的概要改为 6 格一行，流水表不再截断。
