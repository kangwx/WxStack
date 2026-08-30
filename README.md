# WxStack

用 Cocos Creator 3.8.8 制作的移动端休闲堆塔游戏。玩法参考经典《Stack》：方块沿两个等距轴交替移动，点击后保留与下层重合的部分，悬空切片会坠落；完全对齐会累计 `PERFECT` 连击。

## 已实现

- 触屏、鼠标、空格、手柄 A 落块；回车/Options 继续；R 随时重开
- X/Z 两轴交替移动与随分数提升的速度曲线
- 实时重叠裁切、切片坠落、失败判定
- PERFECT 连击、粒子、冲击环、缓动、轻量镜头震动与闪光反馈
- 开始、失败、普通截取独立音效；PERFECT 使用 A 大调五声音阶连续升调
- 塔高镜头跟随、动态渐变背景、彩色塔层
- 安全区适配、750×1334 竖屏参考分辨率、异形屏与宽屏自适应
- 开始页、实时分数、结算页、重新开始、本地最高分

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

Web Mobile 开发构建：

```bash
CREATOR_APP=/Applications/Cocos/Creator/3.8.8/CocosCreator.app
"$CREATOR_APP/Contents/MacOS/CocosCreator" \
  --project "$(pwd)" \
  --build "platform=web-mobile;debug=true"
```

正式发布时建议在 Creator 的构建面板关闭 `Debug`。项目自带 `build-templates/web-mobile/index.html`，用于保留 Web Mobile 的全屏与安全区 viewport 配置。

## 实现说明

玩法、画面与音效触发集中在 `assets/scripts/StackGame.ts`。塔块使用 `Graphics` 绘制等距立体几何，因此无需外部贴图、模型和物理引擎即可运行；HUD 通过 `Widget` 与 `SafeArea` 适配屏幕，最高分保存在本地存储中。原创单声道 WAV 位于 `assets/resources/audio`，可通过 `tools/generate-audio.mjs` 确定性重新生成。

浏览器会自动遵循系统的“减少动态效果”偏好；也可在运行环境的本地存储中将 `wxstack-reduced-motion` 设置为 `1`。
