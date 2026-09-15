# UI 重构开发说明

## 目标与边界

固定页面和控件使用 Creator 可查看、可绑定的预制体；运行时只切换页面、更新数据、调整响应式尺寸和播放反馈。减少静态面板重绘、重复布局、粒子对象分配与重复世界投影，同时保留奶油风格、玩法手感、计分、存档、输入和转场。

不新增广告 SDK、付费恢复、主题商店、成长系统或玩法规则。当前体力规则是 5 点上限、每 30 分钟恢复一点、跨日不重置、设置免费补满；扫码复活是独立跨设备确认，不是激励广告。

## 结构与职责

| 模块 | 职责与边界 |
|---|---|
| `StackGame` / `StackWorld3D` | 玩法命令、物理、塔体、计分和游戏生命周期；UI 不反向持有或改写存档 |
| `StackUIViewBindings` | 预制体类型化引用和固定行绑定，缺引用立即报错，禁止动态补节点 |
| `StackUIVisual` | 更新现有 Sprite 层的尺寸、颜色和资源；按钮、焦点、背景的视觉状态与真实命中区域一致 |
| `StackGameUIAdapter` | 发布只读的基础游戏状态快照，暴露原游戏命令；只在状态变化事件后调用 `publish()` |
| `StackUIPresenter<T>` | 每页一个实例；合并变更，只读取并渲染可见页 |
| `ScreenViews` | 八个页面 View，接收窄类型绑定与明确页面模型；只更新已有文字、按钮可用性和内容布局 |
| `UIRouter` / `UIInputRouter` | 底页、弹层栈、返回焦点、转场锁和重复输入门禁；不替代原生文字输入 |
| `UILayoutService` | 仅在视口、物理窗口、安全区或 DPR 改变时应用一次响应式布局 |
| `UITransitionController` | 转场计时、正常收敛、取消和输入锁清理；不同页面的视觉曲线由调用方保留 |
| `GameplayFxController` / `QRCodeView` | 固定 Sprite 特效池、每会话二维码纹理生命周期 |
| `ReviveController` | 会话版本、当前局校验、每秒轮询、消费确认、过期与取消；不操作游戏奖励或体力 |
| `PerformanceProbe` | Debug 显式采样帧时间、工作区间、计数器和设备信息；不自动宣称性能达标 |

页面集合为首页、游戏 HUD、设置、昵称、排行榜、暂停、结算和扫码复活。`GameUIRoot` 聚合页面引用，`GameplayFxRoot` 为游戏特效的局部投影坐标系。静态页面使用现有 `ProjectorLayout` 几何，保留窄屏与投影横屏分区；不要重新发明断点或字号体系。

## 公共模块接入合同

### 数据与页面刷新

```ts
const presenter = new StackUIPresenter(readPageSnapshot, renderPageSnapshot);
presenter.setVisible(pageNode.activeInHierarchy);
const subscription = adapter.subscribe(() => presenter.invalidate());
// 在一批游戏命令/事件之后，或主循环末尾统一调用：
presenter.flush();
```

- Presenter 初始隐藏。`invalidate()` 只置脏；`flush()` 仅在可见且有变更时读一次快照并渲染一次，返回是否实际渲染。隐藏期间没有主动读取或刷新，重新显示时渲染最新状态。
- 渲染中发生的新 invalidation 留给下一次 flush，禁止递归渲染；渲染异常保留待刷新标记。销毁时执行 subscription、presenter 和 adapter 的 `dispose()`。
- Adapter 复制并冻结 `GameUIState`，避免数据提供方复用对象导致变化漏报。`commands` 原样委托玩法层；不能把按钮渲染当作开始游戏或消费体力的触发器。
- 体力和二维码剩余时间由可取消的低频时钟 invalidation，文字只在显示秒数变化时赋值。状态变化时刷新受影响的页面，不能每帧重设所有 Label、Sprite、Widget。

### 八个页面 View

`ScreenViews.ts` 提供 `UIView<TModel,TLayout>` 和 `HomeScreenView`、`GameplayHudView`、`SettingsScreenView`、`NicknameDialogView`、`LeaderboardScreenView`、`PauseScreenView`、`ResultScreenView`、`ReviveDialogView`。构造参数是 `StackUIViewBindings` 的页面专属 `Pick`，可直接传完整的已绑定 `ui`；类型约束防止页面任意访问其他页。View 不创建节点或组件、不读取存档、不调游戏命令，也不接管根节点显隐、焦点装饰或转场。

```ts
const view = new HomeScreenView(ui);
const presenter = new StackUIPresenter(readHomeModel, model => view.render(model));
// 在 UILayoutService 的变化回调内应用已有 ProjectorLayout 算出的内容几何：
view.applyLayout({ coins: { width: 160, height: 50,
  widget: { horizontalCenter: 20, verticalCenter: -10 }, fontSize: 32, lineHeight: 38 } });
```

模型字段见各页导出的 `*Model`：Home 明确金币、最高纪录、体力/开始文案和可选预览行；HUD 明确当前分数、最高分、纪录差、完美文案和测试提示；Result 明确标题、成绩、奖励、复活与重开状态；Revive 明确状态、关闭按钮和二维码显隐。其余页面使用设置状态文案、昵称草稿/提示、排行榜固定行和暂停按钮各自的模型，没有通用事件字典。

`render()` 检查组件当前值，相同文字和可用性不重复赋值。可选字段省略时保留原值；昵称错误提示只更新 `hintText`，不要附带旧保存昵称覆盖正在输入的草稿。榜单行数少于绑定行数时清除旧文本并隐藏多余行。计分、金币和体力文案由控制层传入，View 不重新计算奖励规则。

每页 `*Layout` 只接受其已有内容标签/按钮的几何；`position` 仅允许无启用 Widget 的节点，有 Widget 时传 `widget` 偏移，不能同时声明两个位置所有者。重复尺寸和偏移跳过更新，已绑定组件会缓存。布局不设置 scale 或 opacity，HUD 完美提示位置仍归动画所有者；复活二维码 resize 只更新尺寸，不生成或替换纹理。`tools/test-screen-views.cjs` 的 10 项行为测试覆盖八页更新、重复赋值、昵称草稿、二维码生命周期边界、Widget 所有权与隐藏页刷新。

### 布局

```ts
const layout = new UILayoutService(metrics => applyExistingProjectorLayout(metrics));
layout.update({ width, height, frameWidth, frameHeight,
  safeTop, safeRight, safeBottom, safeLeft, pixelRatio });
```

`width/height` 是 UI 可见设计空间；`frameWidth/frameHeight` 保留物理窗口断点依据，缺省等于可见尺寸。安全区缺省 0，DPR 缺省 1。重复尺寸不执行 callback；最小化产生的零尺寸、非有限数或负安全区不覆盖上一次有效布局。应用失败时不缓存半完成结果，同一尺寸事件可重试。销毁时 `dispose()`。

### 路由、输入和转场

```ts
const routes = new UIRouter();
const transition = new UITransitionController(locked => { routes.transitionLocked = locked; });
transition.begin({ duration: 0.26, reducedMotion,
  onProgress: progress => applyExistingTransition(progress),
  onComplete: finishNavigation,
  onCancel: normalizeCancelledNavigation });
transition.step(dt);
```

- `UIRouter.reset(base)` 设置底页并清空弹层；`push(screen, returnFocus)` 保存返回焦点；`pop()` 返回退出页和返回焦点。重复弹层及转场期间的 push/pop 被拒绝。路由变更后同步页面可见性与 Presenter。
- `UIInputRouter.keyDown/keyUp` 处理按住状态，`acceptAction(locked, delayMs)` 合并混合输入源的短时间重复动作；被锁动作不消耗下一次动作额度。页面失焦/后台调用 `clear()`，清除按住状态和防抖时间。
- Transition 重复 begin 不打断当前转场；正常完成、取消、销毁或进度回调异常均释放输入锁。`finish()` 用于 resize/后台时立即到达最终状态，完成回调只执行一次；`cancel()` 调用清理回调；销毁使用 `dispose()`。
- 同一视觉属性只能由布局或当前转场中的一方写入。resize 时先 `finish()`，再布局；销毁先停时钟/订阅并取消转场。保留原菜单滑动、排行榜抽屉、塔体淡出交换和减少动态效果的区别。
- 昵称编辑仍放行普通按键、空格、退格和 IME composition；原 `WxStackRemote` 桥接保留。弹层确认/返回不得穿透到落块或重开按钮。

### 游戏特效

```ts
fx.initialize((x, z, level, out) => world.projectToUI(x, z, level, fx.node, out));
// 在世界相机/布局更新后、emitImpact 或 render 前准备一次投影：
world.prepareProjection(fx.node);
fx.emitImpact(block, true, streak);
fx.emitPerfectFrames(block, streak, reducedMotion);
// 使用原游戏模拟子步；组件没有自动 update()。
fx.step(stepSeconds);
fx.setFlash(flashAlpha);
fx.render(visibleWidth, visibleHeight);
```

- 输出参数是复用的 `Vec3`；保持 128 颗粒子、12 组边框上限，圆环预热 8 个，耗尽后从已绑定 `ImpactRing` 预制体扩充，不能覆盖尚存活的圆环。保留原颜色、速度、寿命、拖尾、连击能量和粒子只从前侧接触边发射的规则。
- 完美边框仅画前侧两条线，不添加接触面填充或背面边框；减少动态效果保留单个静止扩张量的 0.24 秒边框，是否发射粒子仍由原玩法决定。
- 圆环 0.3 秒，使用 SDF 材质连续调整半径和线宽。圆环的白 SpriteFrame 必须独立、UV 为 0..1、禁止图集打包；其他白色特效可以共用图集。材质实例仅在初始化创建。
- `clearPerfectFrames()` 只清完美边框；新局、回首页和复活重建时按原逻辑 `clear()`；暂停不推进 `step()`。闪光衰减仍归玩法层，避免两个计时器同时推进。
- `QRCodeView` 每会话只生成一次纹理；倒计时只更改 Label。会话取消/过期或页面销毁释放纹理，并保留异步 request token 与 round ID 校验。

### 扫码复活控制器

```ts
const revive = new ReviveController({
  client: reviveClient,
  scheduler: {
    schedule: (callback, seconds) => component.schedule(callback, seconds),
    unschedule: callback => component.unschedule(callback),
  },
  getContext: () => ({ roundId, isValid: component.isValid,
    canRevive: phase === 'gameover' && !reviveUsed }),
  onState: renderReviveState,
  onConfirmed: confirmedRoundId => resumeConfirmedRound(confirmedRoundId),
});
await revive.open();
```

`open()` 拒绝重复打开、无效或已确认的同一局。入口仍由游戏拒绝转场期间的操作。`state` 包含 `status`、`session`、`secondsRemaining` 和保留原文案的 `message`；状态为 `closed/creating/waiting/retrying/expired/error`。`onState` 只显示/隐藏页面、更新文字，并在 session 改变时调用 `QRCodeView.show()`；session 为空时 `clear()`。

控制器收到 `confirmed` 后先消费，再以 `consumed` 确认成功；消费响应丢失时下一次查询的 `consumed` 也可完成复活。回调前已关闭弹层和轮询，游戏回调再标记本局已复活并执行既有恢复转场。控制器不发金币、不扣体力、不改塔体。

`close()` 失效旧版本、取消计时器并尽力取消服务器会话。旧网络请求的 finally 不会清除新会话的轮询锁；关闭、换局、组件失效后的状态或消费结果不能复活。`dispose()` 还会禁止重开，并避免通知销毁中的 View。二维码纹理采用四模块白色 quiet zone、nearest/no-mip/clamp 采样和 `packable=false`，上传失败释放临时资源并保留旧会话图像；改变 UITransform 尺寸不生成纹理。

## 资源维护与验证

`tools/ui-authoring/generate.cjs` 维护预制体、基础图片、Bindings 与 authoring 合同。生成源和输出应一同审查；`guard-generated.cjs` 必须在所有写入前校验 `generated-files.json` 中的 SHA256，检测 Inspector 手改、删除和新路径所有权冲突，成功生成后才更新清单。197 个已知输出已显式初始化；清单与生成文件、稳定 UUID 和 `.meta` 必须一并提交。接入 API 与人工维护转换规则见 `tools/ui-authoring/README.md`。

| 验证层级 | 必查内容 |
|---|---|
| 静态资产与类型 | 全部引用可解析；固定页无动态控件工厂；按钮含真实 Button；列表/ScrollView/Mask/EditBox 序列化完整；TypeScript 通过 |
| 公开行为单测 | 路由与返回焦点、重复输入、隐藏页零刷新、重复布局零执行、转场异常清锁、特效轨迹/池容量/颜色/生命周期 |
| 玩法与存档回归 | 体力扣除幂等、跨日不重置、离线恢复、昵称确认、排行 0/1/10 条、扫码取消/迟到/重复确认、复活后金币增量与同局榜单更新 |
| 实际视觉 | 320×568、360×800、390×844、1024×768、1280×720、1920×1080、2560×1080、3840×2160；九宫格、焦点扩边、长中文、排行榜末行、二维码、减少动态效果和关键转场帧 |
| 性能与泄漏 | 同设备同构建配置：首页静置、普通落块、连续完美、失败碎片、100 层、排行榜滚动、反复切页；记录 FPS、P95/P99 帧时间、>50ms 比例、DrawCall、CPU 分段、堆内存及节点/材质数量 |
| 实机 | Android WebView 软键盘/遥控桥接、触摸、手柄、后台恢复及投影亮度；没有设备时明确待验收 |

旧测试中针对 `makeMenuButton`、`recordingGraphics`、源码字符串或绘图命令的断言必须改为预制体结构和公开行为合同，不能通过删除失败测试宣布迁移完成。迁移前 192 项通过是历史基线；最终以当前源码全量测试、构建和真实运行记录为准。

Debug 用于定位瓶颈，Release 用于最终流畅度对比。记录环境、分辨率、DPR、预热时间与采样时长；缺少迁移前同环境数据时，不填写“提升百分比”。本说明不代表浏览器/Android/投影实机或最终性能验收已通过，当前状态以 [迁移记录](ui-prefab-migration.md) 为准。
