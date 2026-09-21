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

### Changed

### Fixed

### Removed

## [0.1.0] - 2026-09-21

### Added

- 初始化项目文档。
- 创建 `README.md` 和 `CHANGELOG.md`。
