# 旧版真实浏览器截图基线

2026-09-14 19:08（Asia/Shanghai）采集首批 10 张真实截图。未修改当前项目源码，未使用用户浏览器或游戏存档。

- 源码：`/private/tmp/wxstack-ui-refactor-baseline/scripts` 与 `scenes` 的最初工作区快照，包含当时受控落块实现；18 个脚本/场景及元数据文件在构建前后 SHA-256 均不变。
- 临时工程：`/private/tmp/wxstack-ui-baseline-project`。资源图片/音频、文件夹元数据、构建模板和 profiles 来自当前工程，其余脚本/场景/settings/package/tsconfig 使用快照。
- 构建：Creator 3.8.8，`platform=web-mobile;debug=true`。构建日志明确记录 Finished，CLI 退出码 36；日志中的脚本 worker SIGTERM 信息原样保留。构建页面随后成功加载并执行正常游戏。
- 浏览器：Chrome 152.0.7977.83，headless，DPR 1；WebGL 报告 `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)`。
- 隔离：独立 Chrome 临时 profile，每种视口创建全新浏览器上下文；仅访问临时构建的 `127.0.0.1:7467`。全新玩家：金币 100、最高分 0、空榜、昵称“叠叠玩家”、体力 5；正常开局后体力为 4。
- 操作：调用原页面导航/暂停方法，保留正常转场。结算通过等待移动块无重叠后真实按空格完成零分失败，没有注入成绩或改写玩法状态。

| 1920×1080 | 390×844 |
|---|---|
| [首页](1920x1080-home.png) | [首页](390x844-home.png) |
| [设置](1920x1080-settings.png) | [设置](390x844-settings.png) |
| [昵称](1920x1080-nickname.png) | — |
| [空榜](1920x1080-leaderboard-empty.png) | [空榜](390x844-leaderboard-empty.png) |
| [游戏 HUD](1920x1080-gameplay.png) | — |
| [暂停](1920x1080-pause.png) | — |
| [零分结算](1920x1080-result-zero.png) | — |

已逐张查看，图片均有实际 UI 与场景内容。浏览器没有 pageerror；控制台记录两次 favicon 404 和一次“Can't add renderable component to this node because it already have one.”旧版警告。没有为消除日志而修改旧版实现。

复现脚本为 [capture.cjs](capture.cjs)，来源/哈希见 [source-manifest.json](source-manifest.json)，每张图片的状态和设备信息见 [browser-manifest.json](browser-manifest.json)。原始构建、HTTP 和截图日志一并保留。

这批截图覆盖默认焦点和基本页面，尚未覆盖非空 Top 10、二维码状态、其他分辨率、精确转场中间帧和全部焦点/错误态。动态塔体的位置取决于截图帧，UI 比较时应与动态场景差异分开判断；这些截图不代表 Android、投影仪、实体遥控器或 Release 性能验收。
