# 叠个正着（WxStack）

用 Cocos Creator 3.8.8 制作的移动端 3D 休闲堆塔游戏。方块沿 X/Z 两轴交替移动，点击后短距离下落，与目标塔层碰撞后保留重合部分；切片以独立刚体坠落，精准对齐会累计完美连击。

## 已实现

- 触屏、鼠标、空格、手柄 A 落块；P / Esc / Options 暂停，暂停菜单支持继续、重新开始、返回首页
- X/Z 两轴交替移动与随分数提升的速度曲线
- 实时重叠裁切、切片坠落、失败判定
- 完美连击、粒子、扩散方框、冲击环、轻量镜头震动与闪光反馈；特效位置由 3D 相机投影到 UI
- 完美粒子从新方块底部接触面的周边发射，白框在上下方块接缝平面扩散，使用成长后的宽深；不会在新方块顶面铺光。
- 开始、失败、截断独立音效；连续完美从 C5 开始按自然大调 `[0,2,4,5,7,9,11]` 跨八度升高，普通落块、失败和新一局重置
- 透视相机、3D 网格、Ammo 刚体、塔高镜头跟随、图片背景和自然主题材质贴图
- 安全区适配、750×1334 竖屏参考分辨率；投影首页支持 4:3 / 16:9 左右分区、大标题、纪录/金币信息卡与单列高对比焦点按钮，竖屏居中排布。[设计与验证](docs/projector-home.md)
- 游戏 HUD、设置、排行榜、暂停和结算沿用同一套投影大屏字号、信息卡与焦点样式；暂停隐藏底层 HUD，继续后恢复。[界面说明](docs/projector-screens.md)
- 中文首页、设置、皮肤商店、实时分数、结算页、本地最高分与金币存档
- 初始 100 金币、完美次数奖励与皮肤购买；完美测试开关位于设置页
- 六套图片资源主题；新玩家默认免费使用「极简叠境」，「清风原野」仍免费，已有玩家保留原先选择与存档。新增资源及生成提示词见 [极简叠境设计说明](design/skins/minimal-stack.md)。
- 极简叠境按反应堆参考图更新为直边方块、64 层连续配色与明亮青绿背景；使用中性图片贴图叠加材质色，其他主题不变。[新版资源与提示词](design/skins/reactor-reference-v2.md)。
- 结束页提供重新开始和返回首页；页面切换采用背景常驻、0.10 秒退出与 0.16 秒进入的轻滑动，过渡期间拦截输入，减少动态效果时直接切换。[过渡说明](docs/screen-transitions.md)

## 运行

用 Cocos Creator 3.8.8 打开项目：

```bash
CREATOR_APP=/Applications/Cocos/Creator/3.8.8/CocosCreator.app
"$CREATOR_APP/Contents/MacOS/CocosCreator" --project "$(pwd)"
```

入口场景为 `assets/scenes/Stack.scene`。首次拉取项目后请先让 Creator 完成一次资源导入，再执行下面的命令行检查或构建。

TypeScript 检查：

```bash
CREATOR_APP=/Applications/Cocos/Creator/3.8.8/CocosCreator.app
node "$CREATOR_APP/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc" \
  -p tsconfig.json --pretty false --skipLibCheck true
```

重新生成原创音效资源：

```bash
node tools/generate-audio.mjs
```

3D 控制器回归检查：

```bash
node --test tools/test-world-3d.cjs
```

测试使用 Creator 自带的 TypeScript 编译器和 Cocos 测试替身，覆盖碰撞事件过滤、超时、重开清场、材质及碎块回收；不代替浏览器中的 Ammo 与 GPU 验证。Creator 安装在其他位置时，设置 `COCOS_CREATOR_APP` 为应用完整路径。

Web Mobile 开发构建：

```bash
CREATOR_APP=/Applications/Cocos/Creator/3.8.8/CocosCreator.app
"$CREATOR_APP/Contents/MacOS/CocosCreator" \
  --project "$(pwd)" \
  --build "platform=web-mobile;debug=true"
```

正式发布时建议在 Creator 的构建面板关闭 `Debug`。项目自带 `build-templates/web-mobile/index.html`，用于保留 Web Mobile 的全屏与安全区 viewport 配置。

## 实现说明

`assets/scripts/StackGame.ts` 管理玩法、UI、计分、连击、金币、主题和音效；`assets/scripts/StackWorld3D.ts` 管理相机、网格、材质及物理碰撞。HUD 通过 `Widget` 与 `SafeArea` 适配屏幕；横向大屏会启用电视过扫描安全边距、放大文字与按钮，并把菜单和塔分区构图。

首页、设置、皮肤、暂停和结算界面均支持方向键 / 遥控器 D-pad 移动焦点，确认键执行，返回键关闭弹窗、暂停或回到上一级。兼容常见 Web TV 返回键码 `4`、`461`、`10009` 及确认键码 `13`、`23`。游戏失败后镜头自动对准塔身中段并按塔高拉远，在结算菜单旁保留整座积木全景。

塔层落稳后固定为静态刚体，保证经典裁切堆塔玩法稳定；移动块是运动学刚体，释放后切换为动态刚体。切片和失败块自由翻转坠落，只有与本次目标塔层的有效接触才会触发落地判定。这不是整塔可自由倾倒的平衡模拟。

方块当前使用无光照材质与六面顶点明暗，未启用实时 PBR 光照或阴影。方块共用网格，皮肤更换后释放旧材质；碎块最多保留 5 秒。背景采用等比铺满裁切，避免宽屏露边或拉伸。

## 常用参数

| 参数 | 位置 | 当前值 / 含义 |
| --- | --- | --- |
| `DROP_HEIGHT` | `StackWorld3D.ts` | `0.05`，新块底面与旧块顶面间距，单位为 3D 世界单位 |
| `BLOCK_3D_HEIGHT` | `StackGame.ts` | `0.62`，方块厚度 |
| `BASE_SIZE` | `StackGame.ts` | `5`，初始方块宽度和深度 |
| `PERFECT_THRESHOLD` | `StackGame.ts` | `0.14`，完美判定最大偏差；小方块同时受尺寸比例限制 |
| `PERFECT_GROWTH_START_STREAK` | `StackGame.ts` | `2`，从第几次连续完美开始恢复方块尺寸 |
| `PERFECT_GROWTH_STEP` | `StackGame.ts` | `0.12`，每次成长时宽和深的增加量 |
| `PERFECT_GROWTH_MAX_SIZE` | `StackGame.ts` | `5`，成长后的最大宽度和深度 |
| `MOVE_RANGE` | `StackGame.ts` | `6.1`，移动范围的半径 |
| `INITIAL_MOVE_SPEED` | `StackGame.ts` | `5.2`，每局开始时的方块移动速度 |
| `MOVE_SPEED_PER_SCORE` | `StackGame.ts` | `0.14`，每得 1 分增加的移动速度 |
| `MAX_MOVE_SPEED` | `StackGame.ts` | `9.2`，方块移动速度上限 |
| `MAX_DROP_SECONDS` | `StackWorld3D.ts` | `2`，没有有效落地时的最长等待秒数 |
| `FRAGMENT_LIFETIME` | `StackWorld3D.ts` | `5`，碎块最长存在秒数 |
| `CUT_PREVIEW_SECONDS` | `StackGame.ts` | `0.24`，普通裁剪后展示碎块分离、再生成下一块的间隔秒数 |

修改后需要刷新 Creator 预览，或重新构建 `build/web-mobile`。本地查看构建产物：

```bash
python3 -m http.server 7460 --bind 127.0.0.1 --directory build/web-mobile
```

打开 `http://127.0.0.1:7460/`。重新构建后刷新网页。

## 手动验收

1. 首页开始游戏，分别在 X/Z 方向部分重叠时落块，确认裁切、计分和碎块坠落。
2. 完全错开时落块，确认进入结算，不会被下层塔块或旧碎块误判为成功。
3. 开启完美测试，连续堆高，确认白框紧贴当前塔顶、粒子随相机跟随，音阶连续上升。
4. 在移动和释放时暂停，再继续、重新开始、返回首页，确认没有旧刚体残留。
5. 在 1920×1080 或投影全屏中，仅使用方向键、确认键和返回键走通首页、设置、皮肤、暂停及结算流程，确认焦点始终清晰可见。
6. 堆叠不同高度后故意失败，确认结算界面显示从底座到最高层的完整塔身，按钮仍位于大屏安全区内。
7. 切换皮肤，并检查 390×844 窄屏和 1440×900 宽屏：顶栏无重叠，宽屏首页、暂停和结算保持左右焦点分区，图片铺满、文字可读、自然主题纹理保留。

浏览器会自动遵循系统的“减少动态效果”偏好；也可在运行环境的本地存储中将 `wxstack-reduced-motion` 设置为 `1`。
