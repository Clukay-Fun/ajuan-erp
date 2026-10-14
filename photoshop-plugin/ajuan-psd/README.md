# 阿卷 PSD

Photoshop 2024 及以上的 UXP 面板。它读取阿卷 ERP 写入的 `psd-bridge/inbox`，替换 PNG/JPG 智能对象后另存 PSD。

1. 在阿卷 ERP 的「定制 → Photoshop」点“安装插件”。应用会把插件复制到稳定目录并打开 UXP Developer Tool；macOS 还会打开 Photoshop。等 Photoshop 出现在 UDT 后，首次添加该目录下的 `manifest.json` 并 Load。开发插件需在 UDT 中加载，Photoshop 完全退出后要再 Load 一次。macOS 上后续启动阿卷 ERP 时，如果 Photoshop 未运行，应用会再次打开 UDT 和 Photoshop。
2. 或在 Photoshop 打开开发者模式后，用「插件 → 开发 → 加载插件」选择 `manifest.json`。
3. 在面板里授权应用「定制」页显示的桥接目录。第一次处理任务时还需授权应用显示的导出目录；这两个目录的授权都会记住。
4. 插件加载后会在后台轮询并执行，不必一直打开面板。按钮「执行队列」和菜单「处理队列」只用于手动补跑。

`manifest.json` 里的 `loadEvent` 是 `startup`：插件一旦被加载，会随 Photoshop 启动并开始轮询。这不能代替开发版在退出后的那一次 Load。

开发模式下，只有修改插件代码后才需要在 UXP Developer Tools 里重新加载；普通导出不需要重载。

面板只打开桥接目录 `staging` 里的模板副本，另存到应用设置的导出目录，然后不保存并关闭副本。抠图 PNG 也写入导出目录。

模板同时保留外圆和内矩形：圆形位置位于 `slot_XX_circle` 组，内层 `slot_XX_rect` 组用固定矩形蒙版限制图片范围；名字图和狗图分别放在矩形左、右两个区域。插件只替换智能对象内容，再按各自矩形区域等比例缩放、居中。图片不拉伸，放不满的一边留白。
