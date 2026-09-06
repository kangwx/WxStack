# 极简叠境

本页保留第一版设计记录；当前版本已按用户参考图更新，见 [反应堆参考风格 v2](reactor-reference-v2.md)。

新增初始默认主题，参考经典反应堆堆塔游戏的极简方向，使用原创图片资源，不复制品牌或界面。

- `minimal-stack` 免费拥有，新存档默认启用；老存档的有效选择、购买记录及金币保持不变。
- 青绿背景、薄荷绿 → 海沫绿 → 水蓝 → 海沫绿的循环层色，无花纹、无金边；使用现有小倒角 3D 网格。
- 方块图集：[minimal-blocks.png](../../assets/resources/skins/minimal-blocks.png)，1536×1024，三列两行，顶面在上、侧面在下。
- 背景：[minimal-stack.png](../../assets/resources/skins/minimal-stack.png)，1024×1536。
- 通过内置 image_gen 生成，原图直接作为项目资源，没有运行时动态绘制皮肤。
- 六套皮肤按两列三行排列，清风原野仍免费可选。

## 完整生成提示词

### 方块材质

Create a production game texture atlas, exactly 1536x1024 pixels, flat orthographic 2D material swatches for a minimalist 3D stacking game. Exactly 3 equal columns and 2 equal rows with zero gutters, each cell 512x512 pixels; boundaries precisely x512,x1024,y512. Top row: full-bleed smooth matte ceramic/acrylic surface, column1 soft pale mint (#bcebd9), column2 seafoam turquoise (#91dccc), column3 muted aqua blue (#80c8cf). Bottom row: corresponding same-color side material in each column, slightly darker than its top. Restrained premium tactile matte finish, only extremely subtle tonal variation, almost solid colors, calm minimalist original mobile game art. Every cell covers entire square edge to edge; no frames or outlines or gold, no decorations, no symbols, no text, no object renders, no cubes, no perspective, no grid lines, no margins, no shadows between cells. Designed to be UV mapped onto real beveled cuboids, NOT an image of stacked cubes.

### 背景

Create an original minimalist mobile stacking game BACKGROUND image, vertical portrait exactly 1024x1536. A beautifully smooth atmospheric muted teal gradient, deep desaturated petrol teal (#254c58) at the top transitioning into soft gray teal (#699e9e) around center and misty pale green-teal (#aacdc2) at the bottom. Subtle ambient luminous haze concentrated behind the lower middle, understated fine matte grain only barely visible, sophisticated calm abstract atmosphere. Completely empty background; NO objects, NO cubes, NO tower, NO landscape, NO shapes, NO rings, NO horizon line, NO text, NO UI, NO logos, NO border. Upper two thirds kept quiet for white Chinese title and game HUD, lower third clean for real-time 3D blocks.
