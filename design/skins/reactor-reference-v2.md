# 反应堆参考风格与返回首页过渡

## 视觉

根据用户提供的两张参考图调整极简叠境：无倒角直边立方体、干净的面明暗、逐层连续颜色。只改变极简主题，不影响其他皮肤。

方块仍使用图片贴图，不是运行时绘制纹理：中性图集乘以每层颜色，64 层循环；每 8 层平滑插值一次配色节点：深蓝、青蓝、嫩绿、金黄、橙色、奶油、淡紫、蓝色。片段沿用原层的纹理与颜色，物理形状不变。

- [中性方块图集](../../assets/resources/skins/minimal-neutral-v2.png)：1536×1024。
- [明亮青绿背景](../../assets/resources/skins/minimal-background-v2.png)：1024×1536。
- 内置 image_gen 生成，保留第一版图片，不覆盖资源。

## 页面切换

- 结束页提供「重新开始」「返回首页」，不再任意点击屏幕重开。
- 键盘方向键切换选择，回车/空格确认，Esc 返回；手柄方向键选择、A 确认、B 返回。
- 结束页与暂停页返回首页均先淡出 0.20 秒，在遮罩下重置场景，再淡入 0.28 秒；采用 smoothstep 缓动。
- 过渡期间暂停物理并拦截输入，避免按钮穿透、重复重置；减少动态效果开启时立即返回。
- 仅结算时发放奖励，返回动作不修改金币。

## 生成提示词

### 中性材质

Production game material atlas, 1536x1024 pixels. Exactly 3 columns x 2 rows of identical seamless near-white matte surface swatches, full bleed, zero gaps. Top row all three tiles neutral white #ffffff, bottom row all three tiles extremely pale neutral gray #f5f5f5. Each tile 512x512. Almost solid color with imperceptibly subtle satin material grain, no borders, no bevel shading, no outlines, no objects, no text, no perspective, no shadows. This texture is tinted by a 3D game material to make a sequence of vivid colored straight-edged stacking blocks; keep it completely neutral grayscale.

### 背景

Original minimalist mobile stacking game empty background, portrait 1024x1536. Perfectly smooth clean vertical gradient from fresh turquoise mint green #66cdb4 at top to luminous soft lime green #c4ef81 at bottom. Very restrained soft atmospheric color blending; no dark vignette, no grain, no noise, no clouds, no landscape, no objects, no tower, no text, no UI, no shapes, no horizon, no border. The image will be the background behind real-time flat shaded colored 3D blocks, inspired by minimalist arcade color aesthetics.
