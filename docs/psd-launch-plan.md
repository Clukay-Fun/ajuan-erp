# Photoshop 启动与插件常驻

状态：按本计划改插件入口和应用的启动方式。不打包 `.ccx`，也不做无界面 Photoshop。

## 结论

- 同一次 Photoshop 进程里，插件加载过就不用再打开 UXP Developer Tools。
- 开发版插件没有安装进 Photoshop。Photoshop 完全退出后，仍要在 UXP Developer Tools 里 Load 一次。`loadEvent: startup` 不能代替这次 Load。
- 插件一旦加载，轮询不依赖面板是否打开。面板只负责授权、日志和手动补跑。
- 应用生成任务时，若 Photoshop 没在运行，就在后台启动它，不把它拉到前台。连续创建任务共用同一次启动。
- 任务结束后保留 Photoshop 进程。开发版插件随宿主常驻，后续任务继续使用同一进程，不需要重新加载。
- 连续创建任务共用一次 Photoshop 启动；若 Photoshop 已运行则直接复用。
- Photoshop 仍会有启动画面和窗口。不做无界面宿主。

## 插件

`manifest.json` 的 `host.data` 只加 `loadEvent: startup`，不加 `apiVersion`。再加一个命令入口「处理队列」，方便从 Photoshop 的插件菜单手动补跑。

`index.js` 把队列从面板生命周期拆出：

- `plugin.create` 开始轮询 `psd-bridge/inbox`。
- `plugin.destroy` 停止轮询。
- 面板 `create` / `show` 用当次的 `rootNode` 绑定按钮。`destroy` 丢掉这次的根节点，下次打开重新绑定。
- 没有面板 DOM 时，日志先留在内存里，打开面板再显示。
- 替换后按图层边界等比例完整放入，不分别拉伸宽高。左右区域由模板里的智能对象边界决定；内层 `slot_XX_rect` 组蒙版限制图片范围，外层 `slot_XX_circle` 组保留圆形边界。

授权仍用原来的 persistent token，不需要每次重新授权。

## 应用

生成任务或重试时：

1. 用进程列表判断 Photoshop 是否已在运行。匹配主程序，排除 AdobeIPCBroker。
2. 没在运行就后台启动：macOS 用 `open -g`，Windows 用最小化启动。并发请求共用同一次启动。记录这次的进程号。
3. 已经在运行就不记录、结束后也不退出。启动过程中若发现进程已经出现，也不算应用启动的。
4. 队列里没有等待或处理中的任务后，只有进程号仍是当时启动的那个才退出。macOS 实际退出的是整个应用。
5. 「打开 Photoshop」按钮仍把窗口带到前台，并且不把这次记成应用启动的。
