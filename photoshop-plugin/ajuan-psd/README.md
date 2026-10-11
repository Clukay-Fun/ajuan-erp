# 阿卷 PSD

Photoshop 2024 及以上的 UXP 面板。它读取阿卷 ERP 写入的 `psd-bridge/inbox`，替换智能对象后另存 PSD。

1. 用 UXP Developer Tool 添加本目录并 Load。
2. 或在 Photoshop 打开开发者模式后，用「插件 → 开发 → 加载插件」选择 `manifest.json`。
3. 在面板里授权应用「定制」页显示的 `psd-bridge` 目录。
4. 生成任务后点「执行队列」。

面板只打开 `staging` 里的模板副本，另存到 `outputs`，然后不保存并关闭副本。
