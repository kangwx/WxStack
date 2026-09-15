#!/usr/bin/env node
'use strict';

// Assemble the actual preview captures. No screen is redrawn or retouched.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const captureRoot = path.join(root, 'docs/qa/bright-refresh');
const sharpPath = process.env.WXSTACK_SHARP_PATH || '/Users/wxkang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp';
const paletteSource = fs.readFileSync(path.join(root, 'assets/scripts/CreamStyle.ts'), 'utf8');
const rgb = key => {
  const match = paletteSource.match(new RegExp(`${key}: \\[([^\\]]+)\\]`));
  if (!match) throw new Error(`Missing palette field: ${key}`);
  return '#' + match[1].split(',').map(v => Number(v.trim()).toString(16).padStart(2, '0')).join('').toUpperCase();
};
const palette = {
  background: rgb('backgroundColor'), panel: rgb('panelColor'), text: rgb('textColor'),
  muted: rgb('mutedColor'), mint: rgb('accentColor'), pink: rgb('buttonColor'),
  lilac: rgb('secondaryAccentColor'), shadow: rgb('shadow'),
};
const blockMatch = paletteSource.match(/blockPalette:\s*\[([\s\S]*?)\]\s*as/);
const blockPalette = [...blockMatch[1].matchAll(/\[(\d+),\s*(\d+),\s*(\d+)\]/g)]
  .map(m => '#' + m.slice(1).map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase());
const screens = [
  { id: 'home', label: '首页', note: '主入口 · 体力 / 记录 / 金币', file: 'home-1280x720.png', width: 1280, height: 720 },
  { id: 'gameplay', label: '游戏进行中', note: '落块区域与游戏 HUD', file: 'gameplay-1280x720.png', width: 1280, height: 720 },
  { id: 'pause', label: '暂停', note: '局内操作与继续入口', file: 'pause-1280x720.png', width: 1280, height: 720 },
  { id: 'settings', label: '设置', note: '昵称 / 音效 / 动效 / 体力', file: 'settings-1280x720.png', width: 1280, height: 720 },
  { id: 'leaderboard', label: '排行榜', note: '本机成绩列表', file: 'leaderboard-1280x720.png', width: 1280, height: 720 },
  { id: 'result', label: '结算', note: '本局成绩与复活入口', file: 'result-1280x720.png', width: 1280, height: 720 },
  { id: 'mobile', label: '竖屏首页', note: '390 × 844 · 响应式预览', file: 'home-390x844.png', width: 390, height: 844 },
];
const missing = screens.filter(s => !fs.existsSync(path.join(captureRoot, s.file)));
if (missing.length) throw new Error('Missing actual preview screenshots: ' + missing.map(s => s.file).join(', '));
const dataUrl = file => {
  const bytes = fs.readFileSync(file);
  // Browser captures can contain JPEG bytes despite a .png filename.
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,` + bytes.toString('base64');
};
screens.forEach(s => { s.data = dataUrl(path.join(captureRoot, s.file)); });
const energy = dataUrl(path.join(root, 'assets/ui/primitives/energy-bolt.png'));
const byId = Object.fromEntries(screens.map(s => [s.id, s]));
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const swatches = [
  ['奶油背景', palette.background], ['柔白面板', palette.panel], ['薄荷主操作', palette.mint],
  ['浅桃按钮', palette.pink], ['淡紫辅助', palette.lilac], ['深梅子文字', palette.text],
];

function svgText(x, y, text, size = 20, weight = 400, color = palette.text, attrs = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${attrs}>${esc(text)}</text>`;
}
function roundedRect(x, y, width, height, fill = palette.panel, radius = 24, stroke = '#E7DACE') {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
}
function svgImage(data, x, y, width, height) {
  return `<image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" href="${data}"/>`;
}
function screenCard(id, x, y, width = 524) {
  const s = byId[id], imageWidth = width - 24, imageHeight = imageWidth * s.height / s.width;
  return roundedRect(x, y, width, imageHeight + 58, palette.panel, 18)
    + svgText(x + 18, y + 29, s.label, 20, 600)
    + svgText(x + width - 18, y + 28, `${s.width} × ${s.height}`, 14, 400, palette.muted, 'text-anchor="end"')
    + svgImage(s.data, x + 12, y + 44, imageWidth, imageHeight);
}
function makeSvg() {
  let content = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1500" height="2775" viewBox="0 0 1500 2775"><style>text { font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; }</style>`;
  content += `<rect width="1500" height="2775" fill="${palette.background}"/>`;
  content += roundedRect(1190, 42, 246, 40, palette.mint, 20, 'none');
  content += svgText(1313, 69, '实际预览 · 明亮奶油风格', 16, 600, palette.text, 'text-anchor="middle"');
  content += svgText(64, 65, '叠高高 / 界面设计稿', 18, 600, palette.muted);
  content += svgText(64, 140, '轻盈色彩，叠起好心情。', 60, 700);
  content += svgText(64, 183, '保留奶油积木主题，以更明亮的背景、薄荷主按钮和闪电体力图标统一当前界面。', 23, 400, palette.muted);
  content += roundedRect(64, 225, 1372, 817, palette.panel, 28);
  content += svgText(88, 259, '01  首页 · 横屏总览', 21, 600);
  content += svgText(1412, 258, '1280 × 720 / 实际画面', 17, 400, palette.muted, 'text-anchor="end"');
  content += svgImage(byId.home.data, 88, 274, 1324, 744.75);

  content += svgText(64, 1122, '02  完整界面', 30, 650);
  content += svgText(1436, 1120, '同一套色彩与积木材质，覆盖横屏和竖屏', 20, 400, palette.muted, 'text-anchor="end"');
  content += screenCard('gameplay', 64, 1170);
  content += screenCard('pause', 612, 1170);
  content += screenCard('settings', 64, 1526);
  content += screenCard('leaderboard', 612, 1526);
  content += screenCard('result', 64, 1882);
  content += roundedRect(1160, 1170, 276, 573, palette.panel, 18);
  content += svgText(1178, 1199, '竖屏首页', 20, 600);
  content += svgText(1178, 1227, '390 × 844', 15, 400, palette.muted);
  content += svgImage(byId.mobile.data, 1182, 1235, 232, 502.0718);

  content += roundedRect(612, 1882, 524, 339.25, palette.panel, 18);
  content += svgText(636, 1923, '复活 · 广告完成后自动继续', 24, 600);
  content += roundedRect(636, 1945, 178, 34, palette.mint, 17, 'none');
  content += svgText(725, 1968, '每局可复活 1 次', 16, 600, palette.text, 'text-anchor="middle"');
  [
    '宽、长分别判断，最低恢复至初始尺寸的 50%。',
    '已经超过 50% 的尺寸保持不变。',
    '广告完成后自动返回游戏，无需再次确认。',
  ].forEach((line, i) => { content += svgText(636, 2020 + i * 40, line, 19, 400, palette.muted); });
  content += svgText(636, 2179, '以上为当前交互规则；画面均来自实际预览。', 17, 400, palette.muted);

  content += roundedRect(1160, 1767, 276, 454.25, palette.panel, 18);
  content += svgText(1182, 1805, '体力图标', 23, 600);
  content += svgImage(energy, 1234, 1830, 128, 128);
  content += svgText(1298, 1994, '奶油徽章 × 暖黄闪电', 18, 600, palette.text, 'text-anchor="middle"');
  content += svgText(1298, 2024, '实际游戏资产 · 128 × 128 PNG', 13, 400, palette.muted, 'text-anchor="middle"');
  content += svgText(1182, 2070, '初始体力：5 点', 18, 500);
  content += svgText(1182, 2104, '每 30 分钟自然恢复 1 点', 18, 400, palette.muted);
  content += svgText(1182, 2138, '自然恢复上限：5 点', 18, 400, palette.muted);
  content += svgText(1182, 2182, '看广告 +5 点，累积无上限', 17, 600);

  content += svgText(64, 2295, '03  视觉规范', 30, 650);
  content += roundedRect(64, 2330, 1372, 330, palette.panel, 24);
  swatches.forEach(([name, color], i) => {
    const x = 88 + i * 222;
    content += roundedRect(x, 2354, 214, 70, color, 14);
    content += svgText(x, 2455, name, 19, 600);
    content += svgText(x, 2483, color, 17, 400, palette.muted);
  });
  content += svgText(88, 2536, '八色积木', 19, 600);
  blockPalette.forEach((color, i) => { content += roundedRect(230 + i * 59, 2509, 45, 37, color, 8, 'none'); });
  content += svgText(88, 2601, '柔和圆角  /  深梅子文字  /  低对比阴影  /  薄荷主操作  /  实际闪电图片展示体力', 20, 400, palette.muted);
  content += svgText(64, 2712, '截图来源：当前可运行版本 · docs/qa/bright-refresh/   |   色板来源：CreamStyle.ts', 17, 400, palette.muted);
  content += svgText(1436, 2741, '2026.09.15  ·  等比例展示，原始截图未改绘', 16, 400, palette.muted, 'text-anchor="end"');
  return content + '</svg>';
}

function figure(s, extra = '') {
  return `<figure class="screen ${extra}"><figcaption><b>${s.label}</b><span>${s.width} × ${s.height}</span></figcaption><button class="image-button" data-image="${s.id}" aria-label="查看${s.label}原始截图"><img src="${s.data}" width="${s.width}" height="${s.height}" alt="叠高高${s.label}实际预览"/></button><p>${s.note}</p></figure>`;
}
function makeHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>叠高高 · 整体界面设计稿</title><style>
  :root{--bg:${palette.background};--panel:${palette.panel};--ink:${palette.text};--muted:${palette.muted};--mint:${palette.mint};--line:#e7dace}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.65}main{max-width:1440px;margin:auto;padding:48px 32px 30px}header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:30px}.eyebrow{margin:0 0 10px;font-size:15px;letter-spacing:.09em;font-weight:650}h1{font-size:clamp(32px,4.5vw,56px);line-height:1.2;letter-spacing:-.02em;margin:0 0 20px}.intro{font-size:18px;max-width:840px;margin:0;color:var(--muted)}.pill{background:var(--mint);border-radius:99px;padding:9px 18px;white-space:nowrap;font-size:13px;font-weight:650}.section-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:48px 0 18px}.section-head h2{font-size:24px;margin:0}.section-head p{font-size:14px;color:var(--muted);margin:0}.screen{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:20px;overflow:hidden;padding:14px}.screen figcaption{display:flex;align-items:center;justify-content:space-between;padding:0 4px 11px;gap:10px}.screen figcaption span{font-size:12px;color:var(--muted)}.screen b{font-size:17px}.image-button{cursor:zoom-in;padding:0;border:0;width:100%;display:block;background:none}.image-button:focus-visible{outline:3px solid #5d9b80;outline-offset:3px}.screen img{display:block;width:100%;height:auto}.screen p{font-size:13px;color:var(--muted);margin:10px 4px 1px}.hero{padding:20px;border-radius:26px}.hero figcaption{padding-bottom:14px}.pages{display:grid;grid-template-columns:minmax(0,1fr) 276px;gap:24px;align-items:start}.screens{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.aside{display:grid;gap:24px}.phone img{max-width:232px;margin:auto}.phone figcaption{flex-direction:column;align-items:flex-start;gap:0}.card{border:1px solid var(--line);border-radius:20px;background:var(--panel);padding:24px}.card h3{font-size:21px;line-height:1.45;margin:0 0 16px}.card p{font-size:15px;margin:12px 0;color:var(--muted)}.card .small-pill{display:inline-block;font-size:13px;line-height:1.5;border-radius:99px;background:var(--mint);padding:6px 12px;color:var(--ink);font-weight:600}.energy-art{display:block;width:128px;height:128px;margin:18px auto}.asset{text-align:center;font-size:13px!important}.card ul{padding-left:18px;font-size:14px;margin-bottom:0;color:var(--muted)}.card li{margin:6px 0}.card .bonus{font-size:15px;font-weight:650;color:var(--ink)}.palette{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px}.swatch{height:66px;border-radius:13px;border:1px solid var(--line);margin-bottom:10px}.color b,.color code{display:block}.color b{font-size:15px}.color code{font-size:12px;color:var(--muted)}.blocks{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:28px}.blocks b{font-size:15px;margin-right:14px}.block{width:38px;height:30px;border-radius:7px}.tokens{margin:24px 0 0;color:var(--muted);font-size:15px}footer{display:flex;justify-content:space-between;gap:20px;padding-top:32px;font-size:12px;color:var(--muted)}footer p{margin:0}dialog{border:0;padding:20px;border-radius:20px;background:var(--panel);width:min(95vw,1400px);max-height:94vh;color:var(--ink)}dialog::backdrop{background:#322b35cc}dialog .bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}dialog button{border:1px solid var(--line);background:var(--mint);color:var(--ink);border-radius:99px;padding:8px 18px;cursor:pointer}dialog img{display:block;max-width:100%;max-height:80vh;object-fit:contain;margin:auto}.print-note{color:var(--muted);font-size:12px;margin-top:6px}.tools{border:1px solid var(--line);background:var(--panel);border-radius:99px;padding:8px 14px;cursor:pointer;font:inherit;font-size:13px;color:var(--ink);margin-top:12px}
  @media(max-width:1000px){header{flex-direction:column}.pages{grid-template-columns:minmax(0,1fr)}.aside{grid-template-columns:1fr 1fr}.phone img{max-width:232px}.palette{grid-template-columns:repeat(3,minmax(0,1fr))}.section-head{align-items:flex-start;flex-direction:column;gap:4px}}@media(max-width:620px){main{padding:28px 16px}.screens,.aside{grid-template-columns:1fr}.hero{padding:12px}.screen figcaption span{font-size:11px}.section-head{margin-top:32px}.palette{grid-template-columns:repeat(2,minmax(0,1fr))}footer{flex-direction:column}h1{font-size:34px}.intro{font-size:16px}}@media print{@page{size:A3 portrait;margin:10mm}body{background:white}main{max-width:none;padding:0}header{margin-bottom:20px}h1{font-size:36px}.intro{font-size:13px}.pill{font-size:10px}.tools,.print-note,dialog{display:none!important}.hero{break-inside:avoid;page-break-after:always}.pages{display:block}.screens{grid-template-columns:1fr 1fr;gap:16px}.aside{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.screen,.card,.palette{break-inside:avoid}.phone img{max-width:160px}.section-head{margin:24px 0 12px}.section-head h2{font-size:20px}.screen p,.card p,.card ul{font-size:11px}.palette{grid-template-columns:repeat(6,minmax(0,1fr))}.swatch{height:42px}footer{font-size:9px}.tokens{font-size:12px}}
  </style></head><body><main><header><div><p class="eyebrow">叠高高 / 界面设计稿</p><h1>轻盈色彩，叠起好心情。</h1><p class="intro">保留奶油积木主题，以更明亮的背景、薄荷主按钮和闪电体力图标统一当前界面。以下均为当前版本的实际预览截图，可点击查看完整画面。</p></div><div><span class="pill">实际预览 · 2026.09.15</span><br><button class="tools" onclick="window.print()">打印 / 保存为 PDF</button><p class="print-note">全部图片已内嵌，可离线浏览</p></div></header>
  <div class="section-head"><h2>01 首页 · 横屏总览</h2><p>主入口、积木展示与排行榜信息</p></div>${figure(byId.home,'hero')}
  <div class="section-head"><h2>02 完整界面</h2><p>同一套色彩与积木材质，覆盖横屏和竖屏</p></div><div class="pages"><div class="screens">${['gameplay','pause','settings','leaderboard','result'].map(id=>figure(byId[id])).join('')}<article class="card"><h3>复活 · 广告完成后自动继续</h3><span class="small-pill">每局可复活 1 次</span><p>宽、长分别判断，最低恢复至初始尺寸的 <b>50%</b>；已经超过 50% 的尺寸保持不变。</p><p>完成广告后自动回到游戏界面，无需再次确认。</p><p>此处为当前交互规则说明；展示的界面均来自实际预览。</p></article></div><aside class="aside">${figure(byId.mobile,'phone')}<article class="card"><h3>体力图标</h3><img class="energy-art" src="${energy}" width="128" height="128" alt="奶油圆形徽章与暖黄色闪电体力图标"><p class="asset"><b>奶油徽章 × 暖黄闪电</b><br>实际游戏资产 · 128 × 128 PNG</p><ul><li>初始体力 5 点</li><li>每 30 分钟自然恢复 1 点</li><li>自然恢复上限为 5 点</li></ul><p class="bonus">看广告 +5 点，累积无上限。</p></article></aside></div>
  <div class="section-head"><h2>03 视觉规范</h2><p>读取游戏当前 CreamStyle.ts 色板</p></div><section class="card"><div class="palette">${swatches.map(([name,color])=>`<div class="color"><div class="swatch" style="background:${color}"></div><b>${name}</b><code>${color}</code></div>`).join('')}</div><div class="blocks"><b>八色积木</b>${blockPalette.map(color=>`<span class="block" style="background:${color}" title="${color}"></span>`).join('')}</div><p class="tokens">柔和圆角 / 深梅子文字 / 低对比阴影 / 薄荷主操作 / 实际闪电图片展示体力</p></section><footer><p>截图来源：docs/qa/bright-refresh/ · 色板：assets/scripts/CreamStyle.ts<br>图标：assets/ui/primitives/energy-bolt.png</p><p>等比例展示，原始截图未改绘。<br>本文件包含全部图像，不依赖外部网络或字体服务。</p></footer></main><dialog id="viewer"><div class="bar"><b id="viewer-title"></b><button type="button" onclick="document.querySelector('#viewer').close()">关闭</button></div><img id="viewer-image" alt=""></dialog><script>document.querySelectorAll('[data-image]').forEach(button=>button.addEventListener('click',()=>{const figure=button.closest('figure');const image=button.querySelector('img');const viewer=document.querySelector('#viewer');document.querySelector('#viewer-title').textContent=figure.querySelector('figcaption').textContent;document.querySelector('#viewer-image').src=image.src;document.querySelector('#viewer-image').alt=image.alt;viewer.showModal()}));document.querySelector('#viewer').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close()});</script></body></html>`;
}

async function main() {
  const svg = makeSvg();
  const svgFile = path.join(__dirname, '叠高高-整体设计稿.svg');
  const htmlFile = path.join(__dirname, '叠高高-整体设计稿.html');
  const pngFile = path.join(__dirname, '叠高高-整体设计稿.png');
  fs.writeFileSync(svgFile, svg);
  fs.writeFileSync(htmlFile, makeHtml());
  const sharp = require(sharpPath);
  await sharp(Buffer.from(svg)).png().toFile(pngFile);
  fs.writeFileSync(path.join(__dirname, 'README.md'), `# 叠高高 · 整体界面设计稿\n\n- \`叠高高-整体设计稿.png\`：1500 × 2775 设计总览，可直接分享。\n- \`叠高高-整体设计稿.svg\`：嵌入原始截图的矢量排版稿。\n- \`叠高高-整体设计稿.html\`：图片全部内嵌，可离线浏览、点击放大、打印。\n\n界面截图来自 \`docs/qa/bright-refresh/\`，未修改截图内容；色板读取 \`assets/scripts/CreamStyle.ts\`，体力图片读取 \`assets/ui/primitives/energy-bolt.png\`。\n\n重新生成：\`node design/cream-ui-2026-09-15/build-design.cjs\`。如需指定 sharp 位置，设置 \`WXSTACK_SHARP_PATH\`。\n`);
  console.log(JSON.stringify({ files: [pngFile, svgFile, htmlFile], size: '1500 × 2775', screens: screens.length }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
