# UI 预制体迁移进度

## 状态（2026-09-14）

本轮已生成完整页面预制体、类型化引用、Sprite 视觉层及固定池游戏特效，并开始替换 `StackGame` 的动态 UI 构建路径。**资源生成和单元测试不等于场景、浏览器和实机验收完成。** 架构、接入合同和验收清单见 [UI 重构开发说明](ui-refactor.md)。

此前文档提到的 `StackButton.prefab`、`StackUIButton.ts`、`tools/ui-baseline.cjs`、`tools/test-ui-prefab.cjs` 与 `tools/generate-ui-controls.cjs` 在本轮开始时并不存在，不能视为可复用的已交付资产。`ui-baseline-29bb2f5.json` 仅保留旧提交、六主题的离线摘要；它不是当前奶油风格的截图或 GPU 性能基线。已移除的皮肤商店、主题选择不属于此次迁移范围。

## 当前交付物

- `assets/prefabs/ui/GameUIRoot.prefab` 与首页、HUD、设置、昵称、排行榜、暂停、结算、扫码复活、游戏特效页面预制体。
- `assets/scripts/StackUIViewBindings.ts`：Inspector 序列化的节点、组件、固定列表和子控制器引用；由工具合同生成。
- `assets/scripts/ui/StackUIVisual.ts` 与 `assets/ui/primitives`：Sprite 填充、描边、焦点、箭头、头像、奖牌等视觉层。更新已有层，不创建控件或绘制路径。
- `assets/scripts/ui/GameplayFxController.ts`：128 颗粒子、128 条拖尾、12 组前侧双边框、8 个 SDF 圆环及一层闪光，状态、颜色、投影向量和环材质预热后复用。
- `QRCodeView.ts`：二维码显示控件；每个会话生成纹理，固定 Sprite 节点，不在每次倒计时时重新生成。
- `ReviveController.ts`：独立维护会话版本、局 ID、一次确认、轮询、消费与取消；销毁后不再通知 View。
- `UIRouter`、`UIInputRouter`、`StackGameUIAdapter`、`StackUIPresenter`、`UILayoutService`、`UITransitionController`：独立的路由、输入门禁、数据订阅、可见页刷新、尺寸去重及转场清锁模块。各模块存在并通过独立测试不代表每个页面已经全部接入。
- `PerformanceProbe.ts`：显式启用的 Debug 性能采样工具；性能数据需在目标设备实际运行后记录。

## 已执行与待执行的验证

| 项目 | 状态 |
|---|---|
| 重构开始前原行为测试 | 当时 192 项通过，属于迁移前记录 |
| `test-gameplay-fx.cjs` | 8 项通过；覆盖固定池、原轨迹与色值、接触面、前侧边框、减少动态效果、圆环参数和清理 |
| `test-ui-services.cjs` | 12 项通过；覆盖公开路由、输入、订阅、Presenter、布局与转场接口 |
| `test-revive-controller.cjs` / `test-qrcode-view.cjs` | 10 + 6 项通过；覆盖迟到响应、重开轮询隔离、消费响应丢失、过期取消，以及 quiet zone、采样模式、缓存和纹理释放 |
| TypeScript | 本轮公共模块交付时检查通过；后续改动仍需重跑 |
| 全量旧行为测试迁移 | 需要保留业务合同并替换旧 Graphics/动态工厂实现断言，以主任务最终执行结果为准 |
| Creator 导入、场景引用与 Web Mobile 构建 | 本阶段文档未记录最终完成结果，不能引用旧构建证明新页面可用 |
| 同环境截图、九宫格边缘、SDF 圆环、昵称原生输入 | 待实际渲染验收 |
| Release 性能、Android WebView、实体遥控器与投影仪 | 待目标设备验收；仓库不含 Android 宿主工程 |

## 维护与开发命令

```sh
node --test tools/test-ui-services.cjs tools/test-gameplay-fx.cjs
node /Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc -p tsconfig.json --pretty false --skipLibCheck true
node --test tools/test-*.cjs
```

本轮资源生成工具为 `tools/ui-authoring/generate.cjs`，依赖 Creator TypeScript 与 `sharp`；可通过 `COCOS_CREATOR_APP` 和 `UI_SHARP_MODULE` 指向本机安装。

**生成必须先通过 SHA256 清单保护，不得静默覆盖手工维护内容。** `tools/ui-authoring/guard-generated.cjs` 在写入前检查 `generated-files.json`：手改或删除已跟踪文件、输出计划撞上未跟踪的现有文件均报错并列出路径；未修改的资产正常自动生成。成功生成后才更新清单，本次显式接管了 contract 已声明的 197 个已知输出。编辑器修改须保留并同步 authoring 源，或将文件明确转为人工维护；不能靠删除清单或重新初始化绕过冲突。接入契约、首次接管与迁移人工所有权的方法见 `tools/ui-authoring/README.md`。`tools/ui-authoring/fixtures` 是离线构建输入，不应作为游戏运行时逻辑引入，也不代表真实截图。

最终验收记录应补齐代码版本、构建时间、浏览器/设备、分辨率与 DPR、测试结果及性能数据文件；未执行的项目继续标记待验收。
