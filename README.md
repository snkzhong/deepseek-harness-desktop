<h1 align="center">DeepSeek Harness Desktop</h1>

<p align="center">
  <strong>面向 Windows、macOS 和 Linux 的 DeepSeek Harness 桌面客户端。</strong><br>
  下载即用,无需安装 Node.js、无需命令行。
</p>

<p align="center">
  <a href="https://github.com/snkzhong/deepseek-harness-desktop/releases/latest"><img src="https://img.shields.io/github/v/release/snkzhong/deepseek-harness-desktop?style=flat&label=release&color=4D6BFE" alt="Latest release"></a>
  <a href="https://github.com/snkzhong/deepseek-harness-desktop/releases"><img src="https://img.shields.io/github/downloads/snkzhong/deepseek-harness-desktop/total?style=flat&label=downloads&color=4D6BFE" alt="Total downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="Supported platforms: macOS, Windows and Linux">
</p>

DeepSeek Harness Desktop 把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(dsh)装进一个原生桌面应用。下载安装后打开就能用:它会自动准备好运行环境、启动服务,你直接在窗口里使用 dsh 的完整界面。

## 下载与安装

| 平台 | 下载 | 安装方式 |
| --- | --- | --- |
| macOS (Apple Silicon) | [下载 DMG](https://github.com/snkzhong/deepseek-harness-desktop/releases/latest) | 打开 DMG,将 DeepSeek Harness Desktop 拖入 Applications |
| Windows x64 | [下载安装程序](https://github.com/snkzhong/deepseek-harness-desktop/releases/latest) | 运行 NSIS 安装程序并按提示完成安装 |
| Linux x64 | [下载 AppImage / deb](https://github.com/snkzhong/deepseek-harness-desktop/releases/latest) | AppImage 直接运行;deb 用包管理器安装 |

- 内核已随安装包内置,首次启动无需联网下载,数秒进入界面。
- 无需安装 Node.js 或任何依赖,不想用了拖进垃圾桶即彻底卸载。

## 为什么需要桌面版

在浏览器里用 dsh 很好,但总差一点:要开终端、记端口、装环境。DeepSeek Harness Desktop 把这些全部收走——

- **下载即用**:安装包内置 dsh 内核,打开即进入界面;不碰你的终端和 `~/.dsh`
- **永不白屏**:启动有进度反馈,出问题能看到日志、一键导出诊断,绝不莫名闪退
- **崩溃自愈**:dsh 服务意外退出会自动重启,你的会话和凭证不丢
- **自动保持最新**:dsh 有新版本时自动更新,失败保留旧版,永远有可用版本
- **安全放心**:服务只监听本机随机端口并带访问令牌,不暴露到网络

## 主要功能

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 桌面窗口 | 可用 | dsh 完整界面装进原生窗口,启动直达,无需浏览器 |
| 系统托盘 | 可用 | 常驻托盘,后台继续运行任务,点击即回 |
| 自动更新 | 可用 | 应用与 dsh 内核分别自动更新,无需重装 |
| 诊断导出 | 可用 | 遇到问题一键导出日志,方便求助与反馈 |
| 系统通知 | 开发中 | 任务完成、需要确认时收到桌面通知 |
| 右键菜单 | 开发中 | 常用操作集成到原生右键菜单 |

桌面增强(通知、右键菜单等)将以 dsh 客户端插件形式随内核分发,可单独开关,开发进度见 [Issues](https://github.com/snkzhong/deepseek-harness-desktop/issues)。

## 常见问题

**首次启动要做什么?**
什么都不用做。打开应用,看到启动画面结束后即可使用。

**我的会话和数据存在哪?**
应用自己的数据目录,与命令行版 dsh(`~/.dsh`)完全隔离、互不影响。

**它是官方产品吗?**
不是。DeepSeek Harness Desktop 是社区开源项目,dsh 内核来自官方发行版,本项目不修改其任何代码。想通过命令行使用或参与核心开发,请前往 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 官方仓库。

**如何反馈问题?**
欢迎[提交 issue](https://github.com/snkzhong/deepseek-harness-desktop/issues);附上「诊断导出」的日志会大大加快定位。

## 开发

```bash
npm install          # Node ^22.19.0 || >=24.0.0
npm run dev          # 开发模式
npm run ci -- check  # typecheck + 测试 + 冒烟
npm run ci -- package --mac
```

CI、打包与发布流程见 [scripts/ci.mjs](scripts/ci.mjs) 与 [`.github/workflows/ci.yml`](.github/workflows/ci.yml);架构决策见 [AGENTS.md](../AGENTS.md)。

## 特别感谢

- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) —— 官方内核,本项目的一切能力来自它
- 以及每一位反馈问题和参与共建的用户

## License

[MIT](LICENSE)

> 本项目是基于 DeepSeek Harness 构建的社区桌面版本,并非 DeepSeek 官方产品。
>
> DeepSeek 是 DeepSeek AI 的商标,本项目与 DeepSeek 官方没有隶属关系,也未获得其背书。
