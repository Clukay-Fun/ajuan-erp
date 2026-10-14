# Photoshop 插件安装与启动

## macOS：UXP

ERP 把内置的 `photoshop-plugin/ajuan-psd/uxp` 复制到应用数据目录下的 `photoshop-plugin/ajuan-psd`。安装时打开 Photoshop，再把 UXP Developer Tools 切到前台；应用下次启动时也会打开两者。定制页提供单独的“打开 UXP Developer Tools”按钮。用户在 UXP Developer Tools 中用安装目录的 `manifest.json` 添加并加载插件，在 Photoshop 插件面板首次授权桥接目录及导出目录。ERP 不强制 Rosetta，也不关闭已打开的 Photoshop。UXP Developer Tools 仍负责插件的实际加载。

## Windows：CEP

ERP 把内置 CEP 扩展复制到 `%APPDATA%\Adobe\CEP\extensions\com.clukay.ajuan.psd`，写入 `ajuan-settings.json`，设置当前用户 `HKCU\Software\Adobe\CSXS.12\PlayerDebugMode=1`。重启 Photoshop 后，用户从「窗口 → 扩展（旧版）→ 阿卷 PSD」打开面板。可见面板不依赖 Node.js；独立后台扩展使用 Node.js 读取桥接队列，调用 `host.jsx` 完成处理。安装目录中的 `ajuan-worker.log` 记录队列状态。

两个平台复用原有的 PSD 导出和抠图任务协议。任务完成后 Photoshop 保持打开，后续任务继续使用已加载的插件。
