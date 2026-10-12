# 阿卷 PSD

Photoshop 2024 及以上的 UXP 面板。它读取阿卷 ERP 写入的 `psd-bridge/inbox`，替换智能对象后另存 PSD。

1. 用 UXP Developer Tool 添加本目录并 Load。开发版没有安装进 Photoshop，完全退出后要再 Load 一次。同一次进程没退出则不用。
2. 或在 Photoshop 打开开发者模式后，用「插件 → 开发 → 加载插件」选择 `manifest.json`。
3. 在面板里授权应用「定制」页显示的 `psd-bridge` 目录。授权只需一次。
4. 插件加载后会在后台轮询并执行，不必一直打开面板。按钮「执行队列」和菜单「处理队列」只用于手动补跑。

`manifest.json` 里的 `loadEvent` 是 `startup`：插件一旦被加载，会随 Photoshop 启动并开始轮询。这不能代替开发版在退出后的那一次 Load。

开发模式下，只有修改插件代码后才需要在 UXP Developer Tools 里重新加载；普通导出不需要重载。

面板只打开 `staging` 里的模板副本，另存到 `outputs`，然后不保存并关闭副本。
