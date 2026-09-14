# 页面过渡

## 表现与实现

- 首页、设置、排行榜、进入游戏及游戏返回首页共用 100ms 退出 + 160ms 进入的两段过渡。
- 面板退出使用 cubic-in，进入使用 cubic-out；位移 24 个设计单位。前进左出右入，返回右出左入。HUD 只淡入淡出。
- 首页、暂停和结算面板的 Graphics 与内容放在同一个节点，整组控制 UIOpacity 和位移。动画期间仅暂停组节点的 Widget，完成后恢复原位置、透明度及对齐状态。
- ScreenDimmer 独立常驻，不随面板移动，透明度不超过 51/255。TransitionInputBlocker 只拦截输入，不挂载渲染组件；不存在整屏纯色转场。
- StackWorld3D.setPresentationOpacity 只控制积木和碎片的可视节点。使用缓存的 builtin-unlit transparent 材质；完全淡出后才重置积木和镜头，结束后换回原不透明材质。奶油背景、碰撞体和刚体不参与淡出。
- 菜单间切换不重置或淡出积木。游戏逻辑及物理在转场期间暂停，按键抬起前不允许穿透进入新一局。
- 减少动态效果时直接切换。切后台和窗口尺寸变化会完成当前切换并清理动画；切后台进入的新一局保持暂停。

## 回归检查

```sh
node /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc -p tsconfig.json --pretty false --skipLibCheck true
node --test tools/test-world-3d.cjs tools/test-remote-input.cjs tools/test-leaderboard.cjs
```

2026-09-11：类型检查、51 项测试通过；Cocos Web Mobile 构建成功。

- 自动化：两段过渡的起始/中间/结束状态、重置前完全隐藏、重复输入、菜单与游戏切换、后台立即收敛、缩放时恢复 Widget、减少动态效果、奶油画面的压暗上限、材质缓存及销毁、碎片与背景隔离。测试使用 Cocos test double，不代表 GPU 或 Android 实机验证。
- 浏览器视觉检查：1920×1080 的首页、排行榜、设置及进入游戏；1280×720 的暂停及返回首页；390×844 的首页、排行榜、设置、游戏、失败结算、返回和减少动态效果开关。所见页面背景持续可见，浏览器日志没有警告或错误。
- 260ms 动画的精确中间帧由时间步进单测验证；浏览器工具截图未覆盖每个 GPU 帧，不据此声称逐帧或帧率验收。
- 尚无 Android WebView 实机连接；实际遥控器、WebView 帧率及奶油风格的实机视觉验收仍需设备测试。

## 后续首页布局更新

390px 宽竖屏首页原有的“完美测试”开关与最高分徽章重叠，已在后续投影首页重设计中解决：测试开关移至设置，首页纪录与金币统一成双列信息卡。新的整组面板继续使用本文的过渡机制。详见 [投影首页设计与验证](projector-home.md)。
