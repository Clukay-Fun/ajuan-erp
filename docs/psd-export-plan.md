# PSD 定制导出开发计划

状态：应用侧、Photoshop 插件和模板已按本计划落地。`templates/slot-template.psd` 已由 Photoshop ExtendScript 生成，并在 Photoshop 2026 中验证可打开。

目标：按稳定图层名替换模板里的狗图和名字图，另存为新的 PSD。原始模板不被覆盖，其他图层和样式保持可编辑。

## 约束

- 不使用 Node.js PSD 库重写文件。复杂智能对象和图层样式交给 Photoshop 自己保存。
- 重新生成模板时运行 `templates/create-slot-template.jsx`，让 Photoshop 自己写入 PSD；不要用 Python/Node PSD 库改写主模板，否则 Photoshop 可能报版本不兼容。
- `templates/circle-base.psd` 保存圆形边框基础文件。模板脚本在每个位置建立外圆组和内矩形组蒙版；两个智能对象放在矩形的左右区域。
- 可替换图层必须是智能对象，名称稳定，例如 `slot_01_dog`、`slot_01_name`。
- 插件只打开任务目录里的模板副本，`saveAs` 另存，并以不保存的方式关闭副本。
- 第一版通信是文件队列：应用写入任务，插件自动轮询执行，应用再读结果。不做套接字自动连接。
- 生成任务时按需在后台启动 Photoshop，不把它拉到最前。任务完成后保留 Photoshop，供插件继续处理任务。
- 狗图边缘的红黄细边第一版不自动去除，放到白底上目视确认。
- 库存备份仍只包含数据库和单据附件。PSD 模板、素材和导出文件在数据目录里，换机器恢复时要单独拷贝 `psd-assets`、`psd-bridge`。

## 数据

迁移 `004_psd`：

- `psd_templates`：名称和原始 PSD 的绝对路径。路径只读，任务复制副本。
- `psd_slots`：`slot_01` 到 `slot_99`，以及狗图、名字图的图层名。同一模板内图层名不可重复。
- `psd_assets`：狗图或名字图的 PNG/JPG 副本、宽高、是否有透明通道。
- `psd_jobs` / `psd_job_items`：一次定制导出。状态为 `queued`、`running`、`done`、`failed`、`cancelled`。

素材副本在 `<userData>/psd-assets/`。桥接目录在「文稿/阿卷 ERP/psd-bridge/」，方便在 Photoshop 的文件夹选择框里点到：

```text
psd-bridge/
├─ inbox/<id>.json          应用最后写入，插件从这里取
├─ processing/<id>.json     插件正在处理
├─ done/<id>.json           成功结果
├─ failed/<id>.json         失败结果
├─ staging/<id>/            模板副本和本次 PNG/JPG
└─ outputs/<标题>.psd       另存结果
```

任务 JSON 版本为 1。里面只有 `template.psd` 和 PNG/JPG 文件名，不写原始 PSD 的绝对路径。输出文件名冲突时追加 `-2`、`-3`。

替换后按原图层边界等比例完整放入：`scale = min(目标宽 / 素材宽, 目标高 / 素材高)`，再把中心移回目标中心。不拉伸、不裁切图片。放不满的一边留白，图层本身保持在目标区域内。左右位置由 PSD 里 `dogLayer` 和 `nameLayer` 的边界决定，不在数据库里另存坐标。几何在 `photoshop-plugin/ajuan-psd/fit.js`，单元测试锁定。

当前使用的 `templates/slot-template.psd` 保留 6×3 网格，共 18 个 868×868 正方形位置。每格的 868×868 外圆组保留圆形边界，内缩 128 px 的 612×612 正方形区域由 `slot_XX_rect` 组蒙版限制，名字图和狗图各占一半（306×612），中间有分界线；内矩形的四角完整位于圆内。`templates/circle-base.psd` 是用户提供的圆形边框基础文件。`框.tif` 和 `图.tif` 只作排版参考，不导入 ERP。

## 插件

目录 `photoshop-plugin/ajuan-psd/`。Photoshop 2024 及以上。开发版用 UXP Developer Tool 加载；Photoshop 完全退出后要再 Load 一次。`host.data.loadEvent` 为 `startup`，插件加载后随宿主启动，轮询不依赖面板。详见 `docs/psd-launch-plan.md`。

面板负责授权 `psd-bridge`、显示日志和手动补跑。后台轮询在 `plugin.create` 里启动。开发模式只有修改插件代码后才需要重载。

每个任务：

1. 打开 `staging/<id>/template.psd`。打开的文档名或路径对不上就停止，并且不关闭那个文档。
2. 按图层名查找。找不到、被锁定、或不是智能对象时失败，错误分别是 `图层不存在: …`、`图层已锁定: …`、`图层不是智能对象: …`。
3. 用 `placedLayerReplaceContents` 替换内容，再按 `fit.js` 缩放和移动。
4. 把结果 `saveAs.psd` 到 `outputs/`，`asCopy`。
5. 关闭副本时不保存。成功写入 `done`，失败写入 `failed`。

图层不存在时不产生输出文件。多个位置在同一次模态操作里替换，只保存一次。

## 应用

侧栏新增「定制」。

- 模板：选择本机 PSD，添加位置。
- 素材：导入狗图和名字图 PNG/JPG，显示尺寸；没有透明通道时标明。
- 导出：勾选要替换的位置，选择两边的素材，生成任务。可以只替换一个位置，也可以一次替换多个。
- 任务：同步插件结果、取消排队、重试失败、把中断在 `processing` 的任务放回队列、在访达或资源管理器中显示输出。
- 打开桥接目录、插件目录和本机 Photoshop。找不到 Photoshop 时说明要先安装。

主进程对话框选择文件。渲染进程只拿路径和 `ajuan-file://psd-assets/` 缩略图。

## 已自动验证

- 生成任务后原始 PSD 的字节不变，任务 JSON 不含原始绝对路径。
- 输出文件名与模板路径不同；重名得到 `-2`。
- 两个位置会写出四条替换（每个位置狗图和名字图）。
- 插件结果 `图层不存在`、成功输出、处理中不可取消、中断后可重新排队。
- 正方形、竖向狗图、竖向名字图、宽图和高图都按同一比例缩放，中心与目标区域中心一致。
- 插件源码包含另存、不保存关闭、智能对象替换，以及上述错误文案。

## 拿到原始 PSD 后的手工验证

准备模板时把要换的图层做成智能对象，并按 `slot_01_dog`、`slot_01_name` 命名。用下面两张图做第一组：

- `ChatGPT 图像 2026年10月11日 19_29_41-1.png` 作为狗图
- `ChatGPT 图像 2026年10月11日 19_29_42-2.png` 作为名字图

通过标准：

1. 原 PSD 的修改时间不被这次导出改掉。
2. 输出 PSD 能在 Photoshop 里打开。
3. 只有指定位置被替换。
4. 狗和名字的位置、大小、层级正确；白底上确认狗图红黄细边是否要修。
5. 其他图层和效果还在。
6. 输出文件仍能继续改图层。

另外抽查：更长和更短的名字图、三种尺寸的狗图、多个位置一起换、故意写错图层名、锁定图层、输出重名、Photoshop 没开、面板打开期间又开了别的文档。

这些通过之后，再考虑把插件打成 `.ccx`，以及是否把 `psd-assets` 纳入备份。
