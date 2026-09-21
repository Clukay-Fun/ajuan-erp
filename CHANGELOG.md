# Changelog

所有重要变更都记录在这里。

版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

- `MAJOR`：有破坏性变更，不再保持兼容。
- `MINOR`：增加向下兼容的新功能。
- `PATCH`：修复向下兼容的问题。

## [Unreleased]

### Added

- M0 桌面安全外壳：Electron + electron-vite + React 19 + TypeScript 项目骨架。
- 主进程 / preload / renderer 三层边界，`window.ajuan` 白名单 API 与 IPC 来源校验。
- 应用外壳：侧栏导航（概览 / 商品 / 库存 / 单据 / 汇总 / 设置）与各页空状态。
- 基础设计 Token（CSS Variables）与 CSS Modules 样式体系。
- Vitest 测试与 electron-builder 打包配置（Windows x64 NSIS、macOS arm64 DMG）。
- M1 数据层：`node:sqlite` 连接与事务封装、migration 机制、首版表结构（products / skus / sku_stock / documents / document_items / stock_movements / sales_channels / attachments）与种子数据。
- M1 业务：商品资料查看与编辑、期初库存录入（生成已确认期初单 + 不可变流水 + 库存快照）、移动加权平均成本核心 `applyMovement`。
- M1 界面：商品页资料卡、编辑抽屉、期初库存抽屉、Toast 与表单组件；设置页显示数据库路径。
- 共享层：Zod 校验规则、整数分 / e4 金额工具、`IpcResult` 错误传递。
- M2 单据：入库 / 出库草稿的创建、修改、删除；确认生效（逐行写流水，库存不足整单回滚）；作废（按原成本逐条反向冲回，原单与原流水保留）；期初单不可作废。
- M2 出库：销售渠道与外部订单号，同渠道重复订单号提示；出库确认时记录平均成本快照。
- M2 渠道：设置页新增、重命名、停用 / 启用销售渠道。
- M2 界面：单据列表（类型 / 状态筛选）、单据编辑页（多行明细、合计、库存不足禁用确认）、单据详情页（确认 / 删除草稿 / 作废对话框）、概览页入库出库快捷入口。

### Changed

### Fixed

### Removed

## [0.1.0] - 2026-09-21

### Added

- 初始化项目文档。
- 创建 `README.md` 和 `CHANGELOG.md`。
