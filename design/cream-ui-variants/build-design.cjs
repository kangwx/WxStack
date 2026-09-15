#!/usr/bin/env node
'use strict';

// Lay out actual preview captures without repainting their contents.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const captureRoot = path.join(root, 'docs/qa/cream-variants');
const sharpPath = process.env.WXSTACK_SHARP_PATH || '/Users/wxkang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp';
const source = fs.readFileSync(path.join(root, 'assets/scripts/CreamStyle.ts'), 'utf8');
const section = name => {
  const found = source.match(new RegExp(`export const ${name}[^=]*= \\{([\\s\\S]*?)\\n\\}`));
  if (!found) throw new Error(`Missing palette: ${name}`);
  return found[1];
};
const toHex = values => '#' + values.map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const readRgb = (text, key) => {
  const found = text.match(new RegExp(`${key}: \\[([^\\]]+)\\]`));
  if (!found) throw new Error(`Missing palette color: ${key}`);
  return toHex(found[1].split(',').map(v => v.trim()));
};
const readWorld = text => {
  const blockText = text.match(/blockPalette:\s*\[([\s\S]*?)\n\s*\]/);
  if (!blockText) throw new Error('Missing block palette');
  return {
    blocks: [...blockText[1].matchAll(/\[(\d+),\s*(\d+),\s*(\d+)\]/g)].map(m => toHex(m.slice(1))),
    tray: readRgb(text, 'tableTop'), edge: readRgb(text, 'tableEdge'), base: readRgb(text, 'plinth'),
  };
};
const standardSource = section('CREAM_STYLE');
const brightSource = section('CREAM_BRIGHT_WORLD');
const style = {
  background: readRgb(standardSource, 'backgroundColor'), panel: readRgb(standardSource, 'panelColor'),
  ink: readRgb(standardSource, 'textColor'), muted: readRgb(standardSource, 'mutedColor'),
  accent: readRgb(standardSource, 'accentColor'), pink: readRgb(standardSource, 'buttonColor'),
};
const worlds = { standard: readWorld(standardSource), bright: readWorld(brightSource) };
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const dataUrl = file => {
  const bytes = fs.readFileSync(file);
  // The browser may write JPEG bytes into files with a .png extension.
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,` + bytes.toString('base64');
};
const captured = name => fs.existsSync(path.join(captureRoot, name));
const hasGameplayPair = ['gameplay-standard-1280x720.png', 'gameplay-bright-1280x720.png'].every(captured);
const screenKind = hasGameplayPair ? 'gameplay' : 'home';
const screens = [
  { id: 'standard', title: '标准版', tag: '当前风格', note: '柔和奶油色 · 原有积木与托盘', file: `${screenKind}-standard-1280x720.png` },
  { id: 'bright', title: '明亮版', tag: '新增风格', note: '积木更明亮 · 托盘更通透', file: `${screenKind}-bright-1280x720.png` },
  { id: 'settings', title: '设置 · 画面风格', tag: '随时切换', note: '标准 / 明亮 · 即时生效并自动保存', file: 'settings-bright-1280x720.png' },
];
const missing = screens.filter(s => !captured(s.file));
if (missing.length) throw new Error('Waiting for actual preview screenshots: ' + missing.map(s => s.file).join(', '));
screens.forEach(s => { s.data = dataUrl(path.join(captureRoot, s.file)); });
const width = 1500, height = 2080;
const text = (x, y, value, size = 20, weight = 400, color = style.ink, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${esc(value)}</text>`;
const rect = (x, y, w, h, fill = style.panel, radius = 24, stroke = '#E9DDCF') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const image = (data, x, y, w, h) => `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" href="${data}"/>`;
function worldSpec(id, y) {
  const p = worlds[id];
  let out = text(1134, y + 107, '八色积木', 22, 600);
  p.blocks.forEach((color, i) => {
    const x = 1134 + (i % 4) * 65, sy = y + 129 + Math.floor(i / 4) * 63;
    out += rect(x, sy, 50, 48, color, 12, 'none');
  });
  out += text(1134, y + 299, '奶油托盘', 22, 600);
  [['托盘表面', p.tray], ['托盘侧面', p.edge], ['底座', p.base]].forEach(([label, color], i) => {
    out += rect(1134, y + 325 + i * 53, 44, 35, color, 9);
    out += text(1190, y + 348 + i * 53, label, 17, 500);
    out += text(1408, y + 348 + i * 53, color, 14, 400, style.muted, 'text-anchor="end"');
  });
  out += text(1134, y + 525, '色板来自游戏实际配置', 16, 400, style.muted);
  out += text(1134, y + 550, '材质效果以左侧预览为准', 16, 400, style.muted);
  return out;
}
function settingsSpec(y) {
  let out = text(1134, y + 107, '设置 → 画面风格', 22, 600);
  out += rect(1134, y + 137, 274, 54, style.background, 16, 'none');
  out += text(1271, y + 172, '标准 / 明亮', 21, 600, style.ink, 'text-anchor="middle"');
  out += text(1134, y + 247, '点击切换后立即生效，', 19, 400, style.muted);
  out += text(1134, y + 283, '下次启动保留所选版本。', 19, 400, style.muted);
  out += text(1134, y + 375, '同一个奶油主题', 22, 600);
  out += text(1134, y + 414, '两种方块与托盘表现', 19, 400, style.muted);
  out += rect(1134, y + 476, 274, 55, style.accent, 16, 'none');
  out += text(1271, y + 511, '当前预览：明亮版', 18, 600, style.ink, 'text-anchor="middle"');
  return out;
}
function makeSvg() {
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif}</style>`;
  out += rect(0, 0, width, height, style.background, 0, 'none');
  out += text(64, 66, '叠高高 / 奶油主题 · 双版本设计稿', 20, 600, style.muted);
  out += text(64, 140, '熟悉的奶油，更明亮的积木。', 55, 700);
  out += text(64, 188, '当前风格保留为标准版；明亮版提亮游戏中的八色方块与托盘。', 24, 400, style.muted);
  out += rect(1192, 40, 244, 40, style.accent, 20, 'none');
  out += text(1314, 67, '标准 × 明亮 · 实际预览', 16, 600, style.ink, 'text-anchor="middle"');
  screens.forEach((s, index) => {
    const y = 230 + index * 592;
    out += rect(64, y, 1372, 568, style.panel, 26);
    out += text(88, y + 40, `0${index + 1}  ${s.title}`, 27, 650);
    out += text(1100, y + 39, s.note, 18, 400, style.muted, 'text-anchor="end"');
    out += rect(1216, y + 16, 192, 34, index === 1 ? style.accent : style.background, 17, 'none');
    out += text(1312, y + 39, s.tag, 16, 600, style.ink, 'text-anchor="middle"');
    out += image(s.data, 88, y + 63, 1012, 569.25 - 64);
    // Images retain 16:9 proportions and fit within the left preview column.
    out += s.id === 'settings' ? settingsSpec(y) : worldSpec(s.id, y);
  });
  out += text(64, 2047, `画面：docs/qa/cream-variants/ · 色板：CreamStyle.ts · ${hasGameplayPair ? '游戏' : '首页'}与设置实际截图`, 16, 400, style.muted);
  out += text(1436, 2047, '等比例展示 · 可离线查看', 16, 400, style.muted, 'text-anchor="end"');
  return out + '</svg>';
}
function paletteHtml(id) {
  const p = worlds[id];
  return `<aside><h3>八色积木</h3><div class="blocks">${p.blocks.map(color => `<i style="background:${color}" title="${color}"></i>`).join('')}</div><h3>奶油托盘</h3><div class="tray">${[['托盘表面', p.tray], ['托盘侧面', p.edge], ['底座', p.base]].map(([label, color]) => `<div><i style="background:${color}"></i><span>${label}</span><code>${color}</code></div>`).join('')}</div><p class="source">色板来自游戏实际配置，材质效果以预览为准。</p></aside>`;
}
function makeHtml() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>叠高高 · 标准与明亮版设计稿</title><style>
  :root{--bg:${style.background};--panel:${style.panel};--ink:${style.ink};--muted:${style.muted};--accent:${style.accent};--line:#e9ddcf}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.65}main{max-width:1500px;padding:48px 64px 28px;margin:auto}header{margin-bottom:34px}.eyebrow{font-size:16px;font-weight:600;color:var(--muted);margin:0 0 18px}h1{font-size:clamp(30px,4vw,55px);line-height:1.25;margin:0 0 18px}header p{font-size:20px;color:var(--muted);margin:0}.card{background:var(--panel);border:1px solid var(--line);border-radius:26px;margin:24px 0;padding:20px 24px 24px}.card-head{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:18px}h2{font-size:25px;margin:0;white-space:nowrap}.note{font-size:15px;color:var(--muted);margin:0 auto 0 10px}.tag{border-radius:99px;padding:5px 18px;background:var(--bg);font-size:14px;white-space:nowrap}.bright .tag{background:var(--accent)}.content{display:grid;grid-template-columns:minmax(0,1fr) 274px;gap:32px;align-items:center}.image-button{display:block;padding:0;border:0;background:none;cursor:zoom-in;width:100%}.image-button:focus-visible{outline:3px solid #62977c;outline-offset:4px}.image-button img{display:block;width:100%;height:auto}h3{font-size:21px;margin:0 0 16px}.blocks{display:grid;grid-template-columns:repeat(4,1fr);gap:13px;margin-bottom:36px}.blocks i{display:block;height:48px;border-radius:12px}.tray>div{display:flex;align-items:center;gap:12px;margin:16px 0;font-size:15px}.tray i{width:40px;height:32px;display:block;border:1px solid var(--line);border-radius:9px}.tray code{margin-left:auto;font-size:12px;color:var(--muted)}aside p{font-size:17px;color:var(--muted)}.source{font-size:13px;margin:32px 0 0}.switch{border-radius:16px;background:var(--bg);text-align:center;padding:12px;font-weight:600;font-size:20px}.saved{margin-top:30px;background:var(--accent);font-size:16px}.settings h3:nth-of-type(2){margin-top:38px}footer{display:flex;justify-content:space-between;gap:20px;color:var(--muted);font-size:12px;padding-top:14px}footer p{margin:0}.tools{font:inherit;font-size:13px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:99px;padding:8px 16px;cursor:pointer;margin-top:20px}dialog{border:0;border-radius:20px;padding:20px;background:var(--panel);width:min(95vw,1420px);max-height:94vh;color:var(--ink)}dialog::backdrop{background:#342c35cc}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}dialog button{border:0;border-radius:99px;background:var(--accent);color:var(--ink);padding:8px 18px;cursor:pointer;font:inherit}dialog img{display:block;max-width:100%;max-height:80vh;margin:auto;object-fit:contain}@media(max-width:1050px){main{padding:32px 28px}.card-head{flex-wrap:wrap}.note{order:3;flex-basis:100%;margin:0}.content{grid-template-columns:minmax(0,1fr)}aside{display:grid;grid-template-columns:1fr 1fr;column-gap:28px;align-items:start}.blocks{grid-column:1;grid-row:2}.tray{grid-column:2;grid-row:2}.source{grid-column:1/-1;margin-top:8px}.settings aside{display:block}.settings h3:nth-of-type(2){margin-top:24px}.settings .switch{max-width:320px}.card h2{font-size:22px}}@media(max-width:600px){main{padding:28px 14px}.card{padding:16px 12px;border-radius:18px}h1{font-size:31px}header p{font-size:16px}.card-head{gap:10px}.tag{font-size:12px;padding:4px 12px}h3{font-size:17px}.content{gap:24px}aside{column-gap:18px}.blocks{gap:8px}.blocks i{height:31px;border-radius:8px}.tray>div{font-size:12px;gap:6px}.tray code{font-size:10px}.tray i{width:22px;height:24px}footer{display:block}footer p{margin-bottom:10px}}@media print{@page{size:A3 portrait;margin:10mm}main{padding:0;max-width:none}h1{font-size:37px}header p{font-size:15px}.tools,dialog{display:none!important}.card{break-inside:avoid;padding:16px;margin:16px 0}.content{grid-template-columns:minmax(0,1fr) 220px;gap:20px}.card h2{font-size:20px}.note{font-size:12px}aside{display:block}h3{font-size:18px}.blocks{gap:10px;margin-bottom:24px}.blocks i{height:34px}.tray>div{margin:11px 0}.source{font-size:11px}footer{font-size:9px}}
  </style></head><body><main><header><p class="eyebrow">叠高高 / 奶油主题 · 双版本设计稿</p><h1>熟悉的奶油，更明亮的积木。</h1><p>当前风格保留为标准版；明亮版提亮游戏中的八色方块与托盘。</p><button class="tools" onclick="window.print()">打印 / 保存 PDF</button></header>${screens.map((s, i) => `<section class="card ${s.id}"><div class="card-head"><h2>0${i + 1} ${s.title}</h2><p class="note">${s.note}</p><span class="tag">${s.tag}</span></div><div class="content"><button class="image-button" aria-label="放大${s.title}实际截图" data-title="${s.title}"><img src="${s.data}" width="1280" height="720" alt="叠高高${s.title}实际预览截图"></button>${s.id === 'settings' ? '<aside><h3>设置 → 画面风格</h3><div class="switch">标准 / 明亮</div><p>点击切换后立即生效，下次启动保留所选版本。</p><h3>同一个奶油主题</h3><p>两种方块与托盘表现。</p><div class="switch saved">当前预览：明亮版</div></aside>' : paletteHtml(s.id)}</div></section>`).join('')}<footer><p>画面：docs/qa/cream-variants/ · 色板：assets/scripts/CreamStyle.ts<br>全部图片内嵌，可离线浏览，点击截图可放大。</p><p>等比例展示，原始截图未改绘。</p></footer></main><dialog id="viewer"><div class="dialog-head"><b id="viewer-title"></b><button id="close-viewer">关闭</button></div><img id="viewer-image" alt=""></dialog><script>const viewer=document.getElementById('viewer');document.querySelectorAll('.image-button').forEach(button=>button.addEventListener('click',()=>{const image=button.querySelector('img');document.getElementById('viewer-title').textContent=button.dataset.title;const large=document.getElementById('viewer-image');large.src=image.src;large.alt=image.alt;viewer.showModal()}));document.getElementById('close-viewer').addEventListener('click',()=>viewer.close());viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close()});</script></body></html>`;
}
async function main() {
  const svg = makeSvg();
  const files = ['svg', 'html', 'png'].map(ext => path.join(__dirname, `叠高高-标准与明亮版对比.${ext}`));
  fs.writeFileSync(files[0], svg);
  fs.writeFileSync(files[1], makeHtml());
  await require(sharpPath)(Buffer.from(svg)).png().toFile(files[2]);
  fs.writeFileSync(path.join(__dirname, 'README.md'), `# 叠高高 · 标准与明亮版对比\n\n- PNG：1500 × 2080，可直接分享。\n- SVG：内嵌真实截图的矢量排版。\n- HTML：图片全部内嵌，可离线查看、点击放大与打印。\n\n保留原有奶油主题，当前风格为标准版，新增明亮版提亮方块与托盘。通过设置中的画面风格切换，立即生效并自动保存。\n\n截图来自 docs/qa/cream-variants/，色板读取 assets/scripts/CreamStyle.ts；此稿未修改旧版整体设计稿。\n\n重新生成：\`node design/cream-ui-variants/build-design.cjs\`。可用 \`WXSTACK_SHARP_PATH\` 指定 sharp 路径。优先使用成对的 gameplay-standard / gameplay-bright 截图，否则使用 home-standard / home-bright 截图。\n`);
  console.log(JSON.stringify({ files, size: `${width} × ${height}`, screenshots: screens.map(s => s.file) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
