# 叠高高 · 标准与明亮版对比

- PNG：1500 × 2080，可直接分享。
- SVG：内嵌真实截图的矢量排版。
- HTML：图片全部内嵌，可离线查看、点击放大与打印。

保留原有奶油主题，当前风格为标准版，新增明亮版提亮方块与托盘。通过设置中的画面风格切换，立即生效并自动保存。

截图来自 docs/qa/cream-variants/，色板读取 assets/scripts/CreamStyle.ts；此稿未修改旧版整体设计稿。

重新生成：`node design/cream-ui-variants/build-design.cjs`。可用 `WXSTACK_SHARP_PATH` 指定 sharp 路径。优先使用成对的 gameplay-standard / gameplay-bright 截图，否则使用 home-standard / home-bright 截图。
