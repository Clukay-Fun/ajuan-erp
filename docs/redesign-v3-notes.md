# 阿卷 ERP 五页面改版 V3 交付说明

> 对应计划：`docs/redesign-v3-plan.md`
> 分支：`redesign/ui-v2`
> 完成日期：2026-10-21
> 截图：`docs/redesign/v3/`（1280×800 / 960×640 × 浅色 / 深色）

---

## 1. 阶段与提交

| 阶段 | 提交 | 内容 |
| --- | --- | --- |
| 1 | `redesign-v3(phase-1)` | 固定 170px 侧栏、设置专属导航与返回、页面常驻（keep-alive）、`usePageActive`、去掉业务页大标题、`RangeFilter` |
| 2 | `redesign-v3(phase-2)` | 概览：草稿提醒、固定近 30 天 KPI、全宽双折线趋势、全宽最近单据 |
| 3 | `redesign-v3(phase-3)` | 商品：三列大图卡片、库存徽标、详情大图与 5 项指标 |
| 4 | `redesign-v3(phase-4)` | 单据：单行工具条、9 列横向滚动、按类型金额汇总、导出当前列表 CSV |
| 5a | `redesign-v3(phase-5a)` | 新增 `psd.updateSlot`、`psd.renameTemplate` 与单测 |
| 5b | `redesign-v3(phase-5b)` | 定制：三选项卡、位置卡片、图层映射、选图弹窗、素材库、一步新建模板 |
| 6 | `redesign-v3(phase-6)` | 设置：外观偏好系统（浅/深两套配色、字号、动效）、模式缩略图、高级折叠 |
| 7 | `redesign-v3(phase-7)` | 回归：E2E、截图脚本、对比度测试、交付说明 |

---

## 2. 用户确认的决定（已落地）

| 决定 | 落地方式 |
| --- | --- |
| 浅色墨绿、深色紫罗兰，两种模式都能自定义 | `lib/appearance.ts` 默认浅色 `#2f7357` / 深色 `#7560dc`；外观页可分别或共用配色 |
| KPI 固定近 30 天 | 概览 KPI 固定调用 `stats.getSummary({近 30 天})`，卡片标注「近 30 天」；库存成本取当前快照 |
| 不保留逐日明细导出 | 概览删除明细视图、导出按钮与商品筛选；后端 `csv.exportSummary` 保留但界面不再调用 |
| 商品卡片显示库存徽标 | 卡片图片右上角沿用 `StockBadge` / `isStockAlert()`；库存正常不显示 |
| 不做打印 / 另存为 PDF | 单据详情只保留单据 CSV 导出 |
| Photoshop 未就绪时禁用生成 | 生产页将「Photoshop 未就绪」列为阻塞项；按钮禁用，状态胶囊可跳到 设置 › Photoshop 连接 |
| 返回应用完全不丢状态 | 业务页与设置页常驻挂载；筛选、滚动、选项卡、未提交标题都保留 |

---

## 3. 修改范围

### 3.1 新增 / 扩展接口

| 接口 | 读 / 写 | 说明 |
| --- | --- | --- |
| `csv.exportDocumentList(filter)` | 写用户选择的文件 | 主进程按同一筛选条件生成全部单据 CSV（含 UTF-8 BOM），复用现有 `csv-stringify` + `formatCents`；不受列表 1000 张上限限制 |
| `documents.count(filter)` | 只读 | 返回满足筛选条件的总数，用于提示列表是否被 1000 张上限截断 |
| `psd.updateSlot({ id, dogLayer, nameLayer })` | 写模板配置 | 校验图层名格式、模板内不重名、有排队/生成中任务时拒绝；不改 PSD 文件 |
| `psd.renameTemplate({ id, name })` | 写模板配置 | 只改 `psd_templates.name`，历史任务里的模板名不变 |
| `PsdJobItem.dogAssetId / nameAssetId` | 只读模型扩展 | 让素材删除能检查排队/生成中的任务是否仍引用该素材 |

未改数据库表结构、库存记账、成本核算、单据状态机、备份格式、桥接协议和 Photoshop 插件。生成任务仍走真实桥接目录与任务队列。

### 3.2 主要文件

- 全局：`app/App.tsx`、`app/usePageActive.ts`、`app/App.module.css`、`app/navigation.tsx`、`components/Shell*`、`components/SettingsNav*`、`styles/global.css`、`styles/base.css`
- 概览：`pages/OverviewPage*`、`features/overview/TrendChart*`、`components/ui/RangeFilter/*`
- 商品：`pages/ProductsPage*`、`features/products/ProductDrawerContent*`
- 单据：`pages/DocumentsPage*`、`features/documents/DocumentDrawerContent*`、`main/csvIo.ts`、`main/services/csvExport.ts`、`main/services/documents.ts`、`main/ipc.ts`、`preload/index.ts`、`shared/ipc.ts`
- 定制：`pages/PsdPage*`、`features/psd/ProductionView*`、`TemplatesView*`、`AssetLibraryView*`、`AssetPickerDialog*`、`SlotCard*`、`NewTemplateDialog*`、`main/services/psdExport.ts`、`main/psdIo.ts`、`shared/psd.ts`、`shared/schemas.ts`
- 设置：`pages/SettingsPage*`、`features/settings/AppearanceSettings*`、`lib/appearance.ts`、`main.tsx`
- 测试：`tests/e2e/*`（新增 `psd`、`keepalive`、`appearance`）、`tests/appearance.test.ts`、`tests/psdExport.test.ts`

---

## 4. 逐页验收对照

### 全局
- 主导航统一为 概览 / 商品 / 单据 / 定制，底部设置；固定约 170px，无收起入口。
- 进入设置后整个左栏替换为 230px 设置导航；「返回应用」回到进入前的业务页。
- 业务页与设置页常驻：筛选、表格滚动、PSD 生产页选图与标题都保留；隐藏页暂停看板轮询与 ⌘F。
- 四个业务页不再显示大标题，保留 `.srOnly` 屏幕阅读器标题。

### 概览
- 草稿提醒显示真实草稿数量、首张单号与件数；一张直接打开，多张进入已筛选草稿列表。
- 四张 KPI 固定近 30 天口径，库存成本取当前快照；无样本显示「—」与原因。
- 趋势为全宽双折线（蓝入库 / 橙棕出库），独立近 7 天 / 近 30 天 / 自定义；横轴稀疏刻度、悬停显示两组数字；失败显示错误而非 0。
- 最近单据全宽 6 列，独立日期筛选，点击打开真实单据弹窗；无明细视图和导出。

### 商品
- 卡片网格最多三列，1:1 大图 `object-fit: contain`，名称品牌色，显示库存 / 平均成本 / 默认售价 / 预警值；不显示可售天数。
- 库存异常徽标沿用 `StockBadge` 与 `isStockAlert()`。
- 详情主图约 166×166，5 项指标（当前库存、平均成本、库存成本、默认进价、默认售价）；期初、库存调整、流水保持原有真实业务逻辑。

### 单据
- 工具条压缩为开单 / 类型 / 状态 / 日期 / 搜索 / 总数 / 更多，窄窗口换行而不是隐藏功能。
- 保留 9 列；窗口不足时表格横向滚动。
- 「更多」含导出当前列表 CSV 与清除筛选条件；导出由主进程按同一筛选条件生成，不受列表 1000 张上限影响。
- 筛选交给主进程；列表最多显示最近 1000 张，超过时页面提示「共 N 张，只显示最近 1000 张」，导出仍包含全部 N 张。
- 详情弹窗宽 960px、最大 90vh、内部滚动；金额汇总按 出库 / 入库 / 调整 / 期初 区分；附件、导出、作废规则不变。

### 定制
- 生产 / 模板 / 素材库三个平级选项卡；生产页不再有素材库面板。
- 位置卡片最多 3 列，超过 9 个位置限高内部滚动；支持添加、删除（二次确认）、展开图层映射（失焦/回车保存）。
- 点狗图 / 名字图只打开对应类别的选图弹窗，支持搜索、单选、确认、导入。
- 模板页显示名称、PSD 路径、文件状态、位置数；支持使用模板、重命名、删除；新建模板一步完成。
- 素材库支持狗图 / 名字图切换、导入、抠白底、查看结果、删除；删除前检查排队/生成中任务与生产页选择。
- 生成按钮在缺图、图层名非法、模板丢失、Photoshop 未就绪、未填写标题时禁用并逐条说明原因。

### 设置
- 外观：模式三张纯 CSS 缩略图；主题设置大卡行式布局（主题 / 强调色 / 背景 / 前景）；正文对比度低于 4.5:1 时警告。
- 浅色默认墨绿、深色默认紫罗兰；分别设置开关默认开启，关闭后两模式共用一套配色；恢复默认分别回到墨绿 / 紫罗兰。
- 高级折叠：界面字号、表格字号、减少动态效果（跟随系统 / 开启 / 关闭）。
- 偏好存 `localStorage: ajuan.appearance`，在 `main.tsx` 首帧前应用；重载后保留。
- 销售渠道、Photoshop 连接、数据、更新与关于沿用原功能，只按设置页布局与说明收敛。

---

## 5. 验证结果

在 macOS（Electron 43）上执行：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过（颜色合规、CSS 变量、ESLint、Prettier） |
| `npm test` | 14 个文件 / 116 项通过 |
| `npm run build` | 通过 |
| `npm run e2e`（`ELECTRON_DISABLE_SANDBOX=1`） | 9 个场景通过：a11y、appearance、backup、csv、export-limit、flow、keepalive、psd、smoke |

新增 / 调整的验收覆盖：
- `appearance`：墨绿 / 紫罗兰默认值、自定义颜色与对比度提示、字号、减少动效、共用配色、重载后保留。
- `keepalive`：表格滚动位置、单据筛选、隐藏页不抢 ⌘F、回到页面刷新数据、设置来回保留未提交标题。
- `psd`：三选项卡、添加/删除位置、图层映射失焦保存、空素材选图弹窗、模板重命名。
- `csv`：除导入外，新增导出当前列表 CSV 的保存对话框打桩与文件内容断言（BOM、表头、行数）；导出改由主进程序列化。
- `export-limit`：造 1000+ 张单据，断言页面显示截断提示、导出文件仍包含全部单据。
- 任务完成 / 失败 Toast：由 Shell 全局轻量轮询，切到任何页面都能收到；定制页的 1.5 秒轮询只刷新页面数据。

截图脚本：`node scripts/screenshot-after.ts docs/redesign/v3`，输出 84 张（页面、单据 / 商品 / 定制弹窗、设置四个分类 × 两种尺寸 × 浅深色）。

---

## 6. 仍待人工确认

1. **Photoshop 实机出图**：自动化环境只验证任务进入真实队列与 UI 状态，不启动 Photoshop 执行替换；需在本机用真实 PSD 走一次成功、失败与结果文件核验。
2. **Windows 验收**：标题栏 overlay 与固定侧栏的拖拽区需在 Windows 上复查；本机只测了 macOS。
3. **PSD 图层是否存在**：按约定不扩展桥接协议读取图层，ERP 只校验图层名格式与重名；实际图层缺失以插件回执为准。
4. **自定义配色的可读性**：正文对比度不足会警告，但不会强制阻止保存；品牌文字色会自动调整到 4.5:1。
5. **模板 PSD 引用**：保存的是绝对路径；原文件移动或删除时模板页会显示「文件缺失」，需要重新创建模板（现有产品定义）。

---

## 7. 与计划的偏差

- 计划中「模板重命名」原建议只在模板页操作，实际同时支持模板卡片内联编辑与「更多」菜单入口，接口相同。
- 生产页为了让 `createJob` 有合法标题，保留了「定制标题」输入；它放在生成栏内，不额外增加页面模块。
- 计划的 `ProductImage` 加 `size="lg"` 改为直接使用现有数值 `size`（166），避免改动组件公开 API。
- 为支持「删除素材时检查排队/生成中任务」，在只读的 `PsdJobItem` 上补了素材 ID；不涉及持久化结构或插件协议。
