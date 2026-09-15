# Holatek 激励广告

## 配置

`assets/scripts/RewardAdConfig.ts` 使用以下正式配置：

- API：`https://store.app.holatek.cn`
- gameId：`gm0c9bfa4495724696`
- 体力恢复 sceneId：`EnergyRecovery`，adType 为 1
- 复活 sceneId：`Revive`，adType 为 2

测试广告位和测试用户为空，不覆盖正式配置；SN 未填写，也不会自动采集设备序列号。双倍金币入口未启用。

## 游戏入口与奖励

- 体力为零时，点击开始/重新开始进入广告弹窗；设置页的“看视频 · 恢复体力”也可打开。
- 手机扫码完整观看广告，接口确认 completed 为 1 后，体力增加 5 点，无上限（例如 5 → 10、8 → 13、10 → 15）。自然恢复仍每 30 分钟 1 点，恢复到 5 点为止；不会自动开局或额外扣体力。
- 结算页“看视频 · 复活”使用复活广告位。观看完成后自动关闭弹窗并继续当前局，无需确认。每局一次，保留分数，下方塔层不变，塔顶和新方块的宽、深分别至少恢复到初始尺寸的 50%，超过 50% 的尺寸保持不变。
- 观看中“关闭”或返回键取消。未完成、失败、取消或超时都不发奖。
- 新开局、返回首页、页面转场、组件禁用和销毁都会取消请求与定时器。晚到的回调无效，发奖时再次检查局标识。

二维码在本地编码，由现有 Cocos `QRCodeView` 显示。不依赖 CDN，也不再需要 `npm run revive:serve` 提供复活确认。旧局域网服务只保留作历史开发工具。

## 网络与轮询

`RewardAdClient` 缓存匿名 userId；请求必须 HTTP 成功且 code 为 100。POST `/appstore/game-center/ad/url` 请求链接，GET `/appstore/game-center/ad/status` 查询结果，携带 `_ts` 且禁用缓存。仅接受 HTTPS 广告链接。每次请求 10 秒超时。

`RewardAdController` 在链接展示 15 秒后开始查询，每 2 秒一次。网络错误按 4 秒、8 秒退避，连续 4 次失败停止。整个等待上限 180 秒，倒计时独立运行，超时可取消仍在进行中的请求。关闭后清除当前奖励动作，再调用业务发奖，防止重复回调重复发奖。

## 验证与边界

2026-09-15，两个正式广告位的链接接口均返回 HTTP 200 / code 100 / adUrl，响应包含 `Access-Control-Allow-Origin: *`。浏览器中已实测设置入口获取并显示真实广告二维码、倒计时及关闭返回，控制台无错误。该验证没有观看真实广告或伪造完成状态。

运行 `node --test tools/test-reward-ad.cjs tools/test-stamina.cjs`；二维码编码也会与 npm qrcode 的输出比较。`node tools/build-reward-qr.cjs` 可从锁定的 npm 依赖重新生成 Cocos 编码模块，保留第三方许可。

真实手机广告播放及回传完成仍需设备实测。后端接口以 userId/gameId/sceneId 查询，未提供单次观看凭证；客户端依照文档信任 completed。后端应在每次新建广告链接时隔离/重置完成状态，否则可能把历史观看当作当前观看。
