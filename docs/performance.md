# 性能采样与 Android 投影设备验收

当前目标是 Android 投影设备以实际 1920×1080 渲染缓冲区运行、稳定达到 60 fps。**目标设备验收状态：未验证（not-verified）**。本文和单元测试没有产生任何实机帧率数据。

`PerformanceProbe` 是调试采样工具，默认关闭；只有 Creator 的 `DEBUG` 为真并且创建时显式传入 `enabled: true` 才能启动。普通发布构建即使传入 `enabled: true` 也不会采集。工具不读写存档、不请求网络、不自动下载文件，不自动判断目标设备是否验收通过。

## 接入合同

脚本位于 `assets/scripts/ui/PerformanceProbe.ts`。调用者持有一个实例；不要每帧重新构造。以下是接入示例，是否已有控制台入口以实际 `StackGame` 接线为准：

```ts
const probe = new PerformanceProbe({
  enabled: debugSamplingExplicitlyRequested,
  durationSeconds: 60,
  sectionNames: ['update', 'world', 'ui', 'fx'],
  counterNames: ['drawCalls', 'triangles', 'activeNodes', 'rigidBodies', 'sparks'],
});

probe.start('home-idle-run-1');

// 每个渲染帧；即使游戏暂停或有提前 return，也要经过 finally。
probe.beginSection('update');
try {
  probe.beginSection('world');
  // world.tick(...) 等本帧工作。
  probe.endSection('world');
  // 同样围住实际执行的 ui / fx 工作，不对未执行工作补写估计时间。
  // 有实际引擎计数时再提供；没有时不填，不用 0 代替未知。
  probe.recordCounter('activeNodes', actualActiveNodeCount);
} finally {
  probe.endSection('update');
  probe.recordFrame(rawRenderDtSeconds);
}

const result = probe.snapshot();
const json = probe.exportJSON();
```

- `start(label?)`：开始一次采样；禁用或正在采样时返回 `false`。首次开始预分配默认 18,000 个帧样本及每个已配置分段的缓冲区；后续复用。
- `recordFrame(dtSeconds)`：传入原始渲染帧间隔，单位秒。不要传入物理子步时间、`Math.min(dt, ...)` 后的模拟时间或人为填写的 `1/60`。
- `beginSection(name)` / `endSection(name, workUnits = 1)`：记录同步 JavaScript 调用耗时及工作计数；名称必须在构造时注册。分段之间可以嵌套，但同名分段重入不会覆盖开始时间。分段耗时不等于 GPU 耗时或完整 Ammo 求解耗时；包含关系也意味着不能直接把各分段相加。
- `recordCounter(name, value)`：对已配置的真实计数记录最新值、最小值、最大值及平均值。未配置、未提供或不可用的计数保持缺失/`null`。
- `snapshot()`：返回活动轮次的摘要，或者最近完成轮次；会分配和排序，仅在需要查看时调用，不能逐帧调用。
- `stop()`：提前停止，标记为 `stopped/manual`，不能当作完整 60 秒轮次。
- `exportJSON()`：返回 JSON 字符串，包含最近三个结束轮次及当前活动轮次，不负责写文件。三轮使用不同 label；开始第四轮会移除最早轮次，因此切换测试场景前先导出。

每次采样按单调时钟的真实墙钟时间判断 60 秒是否结束，在达到时长后的下一次 `recordFrame()` 自动结束；不会因为帧间隔之和不足而补造帧。若页面停在后台、画面尺寸变化、发生调试断点或临时停止输入，应手动停止并重新采样该轮，不能用这样的数据宣称流畅度通过。

## 输出字段

`frameTiming` 与每个分段包含 `count`、`averageMs`、`p95Ms`、`p99Ms`、`maxMs`、严格大于 50 ms 的数量及百分比。百分位使用 nearest-rank；`averageFps = 1000 / averageMs`，只用于辅助观察，不能替代 p95/p99 和长帧比例。

缓冲区满后继续累计总数、总耗时、最大值和长帧数量；`overflowCount` 明确记录未存入缓冲区的样本数，此时百分位只代表已存样本，不能用于完整轮次验收。`invalidCount` 记录负数、NaN 和无限值。无观测值时输出 `null`，不输出虚假的 0 ms 或 60 fps。

环境在开始与结束时采集：

- 实际 WebGL `drawingBufferWidth/Height`，不可用时退回 Canvas 的像素缓冲区尺寸；分别标注来源。设计分辨率、CSS 尺寸和 DPR 单独记录，不能将 CSS 1920×1080 当成实际 1080p。
- 可用的 WebGL 版本、renderer/vendor、是否取得未屏蔽的 GPU 信息。浏览器隐私限制或不支持时保留 `null`。
- User-Agent、平台、逻辑处理器数、可用时的设备内存与 JavaScript heap；heap 不可用不表示无内存占用，开始/结束差值也不能单独证明存在或不存在泄漏。

JSON 的 `targetAcceptance.status` 固定为 `not-verified`。这是防止把开发机或模拟环境的数据误当成 Android 投影设备验收；正式通过结论须另外附上设备、构建与现场测试证据。

## 三轮采样步骤

1. 固定设备型号、Android/WebView 版本、游戏构建版本、实际 framebuffer 尺寸、电源与性能模式。关闭调试断点和 DevTools CPU/GPU 节流；先正常游玩、打开各页面并触发特效完成预热。
2. 每个场景运行三次 60 秒，每轮分别开始/导出或在同场景三轮后统一导出。比较原版与重构版时使用同一设备、同一输入流程、同一分辨率和相同构建模式；调试工具引入的开销要注明。
3. 至少记录：首页静置/呼吸动效、菜单切换、常规裁切、连续完美特效、100/300 层高塔、失败碎片及结算总览。另做 50 次开关页面/重开后的资源数量观察；不要在同一轮临时混合多个场景而失去可比性。
4. 保存每个原始 JSON，检查完整时长、有效样本、`overflowCount === 0`、实际 1080p，以及三轮的 p95/p99、长帧比例和各 CPU 分段。GPU/物理诊断结合 Creator profiler、浏览器 Performance trace 和实际 draw calls，不能仅由 FPS 反推瓶颈。
5. 最后在正常发布配置实机复核手感和长帧。不得通过降低移动速度、改为 30 fps、减少原有粒子或未声明地降低分辨率来满足这次重构目标。

当前没有可用于本轮验收的 Android 投影设备采样。本次环境内的 `adb devices -l` 尝试因沙箱不允许 ADB 服务监听而失败，因此该次命令不能证明“设备不存在”，也不能作为连接状态或性能证据。获得有效设备连接后再进行上述实机步骤。

## 自动验证

```sh
node --test tools/test-performance-probe.cjs
```

测试使用显式标记的合成时钟和设备 fixture，覆盖默认关闭、发布构建禁止启用、缓冲区复用、三轮 60 秒、真实计数、分位统计、溢出/无效数据、计时分段、可选环境信息与无存档/网络调用。这些 fixture 不是性能基准结果。
