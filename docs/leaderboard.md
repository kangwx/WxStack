# 本地排行榜与线上接入

首页现在是「开始游戏 → 排行榜 → 设置」。皮肤商店入口及快捷入口已关闭，已选主题、已兑换皮肤和金币数据保留。

排行榜展示本机同一来源地址下的 Top 10 局成绩，每页 5 条。按层数降序、完美次数降序、完成时间升序排列，同分仍保留不同局记录。正常结算时提交一次；测试局和中途重开/退出的局不提交。已有最高分仅首次迁移为「历史最高」，不伪造时间和完美次数。

Web 版保存在 localStorage 的 `wxstack-leaderboard-v1`，格式为 `{ version: 1, entries: [...] }`。清除网页数据会清除排行；localhost、局域网 IP、不同端口以及不同浏览器/WebView 的存储各自独立。存储被拒绝时使用会话内排行，页面会提示无法跨会话保留。

操作：上下键选择上一页/下一页/返回；左右键直接翻页；确认键执行；返回键回首页。不可用的翻页按钮会变暗且不接收焦点。触摸与鼠标也可点击。

## 后续线上数据

`assets/scripts/Leaderboard.ts` 中的 `LeaderboardRepository` 提供异步 `list()` 和 `submit(result)`，界面不直接访问存储。接入线上时，实现此接口并替换 `StackGame.onLoad()` 中的实例化即可。当前没有任何网络上传。

- `RoundResult`：本局唯一 id、层数、完美次数、完成时间及测试标记。
- `LeaderboardEntry`：展示记录；历史导入项的时间/完美次数为 null。
- `LeaderboardSnapshot`：排行数据及持久化状态。线上适配器需返回已经验证、排序的条目；如改为玩家总榜，可扩展昵称和分页字段。
- `submit` 应使用本局 id 做幂等处理；线上服务应验证分数、玩家身份和测试资格，不能把客户端分数视为可信依据。
- 界面已有加载、空榜、失败、存储降级状态；关闭页面会忽略迟到的加载响应。

验证：`node --test tools/test-leaderboard.cjs tools/test-remote-input.cjs tools/test-world-3d.cjs`。
