# 浏览器 Release 性能测量

使用 [browser-performance.cjs](../tools/browser-performance.cjs) 在冻结后的 Release 构建上测量。脚本不属于游戏运行时代码，也不依赖仅在 DEBUG 中存在的 `WxStackDiagnostics`。默认只接受服务器实际返回的 `src/settings.json` 中 `engine.debug === false`；读取失败或仍为 debug 构建会停止。`--allow-debug` 只用于排查，结果不能标为 Release 验收。

本工具首次交付只执行语法、参数与统计逻辑检查，没有启动浏览器测量，也没有填入示例性能数据。

## 执行

先完成 Release 构建并冻结产物，再以静态服务器提供 `build/web-mobile`，默认地址为 `http://127.0.0.1:7458/`。不要在同一轮测量中重建文件。扫码复活场景还需要正常运行的复活服务；可使用项目已有 `npm run revive:serve`，或通过 `--revive-service` 指定专用测试服务。

```sh
node tools/browser-performance.cjs --dry-run
node tools/browser-performance.cjs --output docs/qa/performance/release-final
```

默认测试 9 个场景，每个场景独立执行 3 次，每次预热 5 秒、采样 60 秒。每次都创建全新非持久化 BrowserContext，不连接用户 Chrome 会话，不读取或写入用户原有存档。所有测试成绩、金币、昵称、体力只存在于临时上下文中。

```sh
node tools/browser-performance.cjs --cases home,moving,perfect,stack100,stack300,stack500 --runs 3 --seconds 60
node tools/browser-performance.cjs --cases result,leaderboard,revive --revive-service http://127.0.0.1:7461
node tools/browser-performance.cjs --cases none --stability-minutes 15 --output docs/qa/performance/stability-final
```

可用 `PLAYWRIGHT_MODULE` 指向 Playwright 模块目录，`CHROME_EXECUTABLE` 指向 Chrome 可执行文件。默认路径采用本工作区的 bundled Playwright 与 macOS Google Chrome。默认打开有界面的独立 Chrome；只有显式传入 `--headless` 才使用无界面模式，两种模式不能混为同一环境比较。服务器设置文件有哈希名称时，使用 `--settings-path src/settings.<hash>.json`。

测试期间保持浏览器前台可见、不缩小窗口、不打开 DevTools、不运行其他采集/录像或大型构建。页面在采样期间进入隐藏状态会被标为无效。默认 viewport 为 1920×1080、DPR 为 1；报告同时保存实际 canvas 尺寸和 WebGL drawingBuffer 尺寸，因此不会把设置的 viewport 当作实际 GPU 帧缓冲尺寸。

## 场景含义

| 参数 | 设置与实际运行状态 | 是否使用预置数据 |
|---|---|---|
| `home` | 游戏真实首页，`phase=ready` | 无 |
| `moving` | 原 `uiAdapter.commands.startRound()`（缺失时使用 `startGame()`）开始对局，方块按原速度往返 | 无 |
| `perfect` | 普通模式观察真实移动坐标，只有距中心不超过 0.12 世界单位且不超过当前尺寸 4% 时，合成 Space 按下/释放，经原浏览器输入路由落块；至少已有 2 次真实完美落块才进入预热；采样必须继续产生完美落块 | 无；不打开完美测试模式，不直接调用特效，不修改坐标、速度或物理步长 |
| `stack100/300/500` | 正常开局后，仅在 setup 中构造指定数量的已落定层，通过 `world.restoreStack()` 恢复并正常 `spawnMovingBlock()`，保留对应分数下的原始速度和物理设置 | 有；数量指已落定层，另外还有 1 个正常移动块。明确记录为 fixture，不计真实循环 |
| `result` | 真实移动块走出支撑范围后合成确认，等待 `falling → gameover` 和原结算界面 | 无；零分真实失误 |
| `leaderboard` | 页面初始化前，在该临时上下文存入 10 条有明确测试昵称的合法本地成绩，然后走原打开榜单接口 | 有；仅本地显示 fixture，不是实际游戏成绩 |
| `revive` | 真实失败后调用原扫码复活流程；等专用服务创建会话、返回真实二维码模块与纹理后采样 | 无伪造二维码；服务缺失会记录失败，不把错误页当扫码页面 |

上述场景每秒保留实际 `phase`、score、perfectStreak、overlay、塔层数等状态。若 perfect 场景进入结算、moving 场景仍停在首页或测试模式意外开启，报告会标为 `invalid`，不能只取其中的帧率摘要用于验收。

## 15 分钟稳定性测试

`--stability-minutes 15` 在普通真实玩法中自动瞄准落块。默认每局成功叠 6 层后，等待当前块自然移出支撑面，再确认失误，经过物理/结算流程后使用原开局命令重开。可以用 `--cycle-placements` 改每局目标成功层数，但不改玩法速度或物理步长。

只将观察到本次脚本启动的 roundId 且经历 `falling → gameover` 的对局计为完成。报告保留每局开始/结束时间、分数、完美数和输入事件，不通过直接设置 `phase` 或手动填塔增加循环。`realCycleDelta.completed` 包含预热期已经开始、采样期内结束的首局；更严格的 `completedEntirelyInsideWindow` 只算开始和结束都发生在采样窗口内的对局。是否达到 50 次必须读取实际计数，脚本不会把运行 15 分钟自动换算成 50 次。

为避免本地体力耗尽中断长测，仅在两局之间余额为零时调用已有 `stamina.restore()`，并记录 `isolated-test-stamina-restore` 事件和总次数。它只补临时存档的经济状态；不打开完美测试模式，也不参与落块计分。预置高塔和页面切换从不计入稳定性循环。

## 输出及解释

每轮输出目录包含总 `manifest.json`、各次 `<case>-<run>.json` 和采样结束后的截图。已有 manifest 的目录会被拒绝，防止覆盖旧证据。

总报告记录开始/结束时间、参数、Chrome 版本、可执行路径、启动参数、系统/CPU/内存、UA、WebGL renderer/vendor/version、软件渲染检测、DPR、实际帧缓冲、served settings 的 SHA256、Creator 版本和 debug 标志。比较基线与新版本时，还应在外部保存对应构建产物哈希/源码提交与设备电源、温度、刷新率信息。

- `rawIntervalsMs` 保存所有外部 `requestAnimationFrame` 回调间隔，包括慢帧，没有剪裁离群点。P95/P99 使用最近秩分位数 `ceil(N×p)-1`；同时记录 P50、最大值、均值、总时长、间隔推算 FPS、超过 20/33.34/50ms 的次数。
- `counters` 每秒读取 Cocos `director.root.device` 的 drawCalls/triangles/instances，世界层数/碎片池、FX 活跃数/环池增长、该帧投影/缓存命中。缺失的引擎字段保留 `null`，不会伪装成 0。它们是每秒采样的瞬时值，不能当作每帧最大值。
- `memory` 保存 `performance.memory` 与 CDP Performance 起止读数。Chrome 使用 `--enable-precise-memory-info`；未提供该 API 的平台保留 `null`。不强制 GC。JS 堆变化包含游戏、浏览器与采样器，不等于 GPU 内存或泄漏量；原始间隔使用预分配 Float64Array，起止 Web API 堆快照均在该数组分配之后取得，导出 JSON 的额外数组分配发生在结束快照之后。CDP 起始读数早于采样缓冲分配，分析其差值时需扣除固定采样器开销。
- `events` 保留测量期真实输入、phase 转移、对局循环、测试体力补充。`validation` 记录背景页面、错误场景、无实际完美落块或无完整稳定性对局等失败。

**rAF 间隔是浏览器呈现回调节奏，不是 GPU 执行时间，也不是 Cocos update 或渲染函数 CPU 耗时。** JS 回调、浏览器调度、刷新率、GPU 同步等都可能影响它。这个脚本不推算不存在的 GPU 时间，也不会用桌面 Chrome 或 SwiftShader 结果宣称已达到 Android 投影/WebView 的 1080p 稳定 60fps。目标设备仍需相同场景下独立验证，必要时配合 Chrome/Android 原生跟踪分析 CPU/GPU 瓶颈。
