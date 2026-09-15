const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ROOT = path.resolve(__dirname, '../..');
const contract = require('./bindings-contract.json');
const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
const prefab = name => read(contract.prefabs[name].path);
function scriptId(value) { const hex=value.replace(/-/g,'');const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let result=hex.slice(0,5);for(let i=5;i<32;i+=3){const n=parseInt(hex.slice(i,i+3),16);result+=chars[n>>6]+chars[n&63];}return result; }
function walk(value, visit) { if(!value||typeof value!=='object')return;visit(value);for(const child of Object.values(value))walk(child,visit); }
for(const name of Object.keys(contract.prefabs))test(`${name}: real Cocos prefab with complete local references and no application Graphics`,()=>{
  const data=prefab(name);assert.equal(data[0].__type__,'cc.Prefab');assert.equal(data[data[0].data.__id__].__type__,'cc.Node');
  walk(data,o=>{if('__id__'in o){assert.ok(Number.isInteger(o.__id__));assert.ok(data[o.__id__]);}assert.notEqual(o.__type__,'cc.Graphics');});
  assert.equal(read(contract.prefabs[name].path+'.meta').uuid,contract.prefabs[name].uuid);
  const nodeIds=new Set();for(const item of data.filter(o=>o.__type__==='cc.Node')){assert.ok(!nodeIds.has(item._id),'node IDs are unique');nodeIds.add(item._id);}
});
test('typed root bindings include all pages, latest revive flow, settings state and independent FX',()=>{
  const data=prefab('GameUIRoot');const bindings=data.find(o=>o.__type__===scriptId(contract.bindingScriptUuid));assert.ok(bindings);
  for(const[key,field]of Object.entries(contract.fields)){if(key.includes('['))continue;assert.ok(key in bindings,key);if(field.array)assert.ok(Array.isArray(bindings[key]),key);else assert.ok(bindings[key],key);}
  assert.equal(data[bindings.graphics.__id__].__type__,'cc.Node');assert.equal(data[bindings.screenDimmer.__id__].__type__,'cc.Sprite');assert.equal(data[bindings.reviveQr.__id__].__type__,'cc.Sprite');
  assert.equal(bindings.settingStateLabels.length,3);assert.equal(bindings.homeStatVisuals.length,2);assert.equal(bindings.homePreviewRowVisuals.length,3);assert.equal(bindings.homePreviewPodium.length,3);
  assert.equal(bindings.leaderboardRows.length,10);assert.equal(bindings.leaderboardRows[0].__type__,'StackLeaderboardRowBinding');assert.equal(bindings.resultReviveButton.__type__,'StackUIButtonBinding');
  const qr=data[bindings.qrCodeView.__id__];assert.equal(qr.image.__id__,bindings.reviveQr.__id__);
  const scroll=data[bindings.leaderboardScroll.__id__];assert.equal(scroll._content.__id__,bindings.leaderboardContent.__id__,'Creator serializes the backing _content field, not the public accessor');
});
test('all visual slots and texture variants are serialized',()=>{
  const data=prefab('GameUIRoot');for(const v of data.filter(o=>o.__type__===scriptId(contract.visualScriptUuid))){for(const slot of contract.visualSlots)assert.equal(data[v[slot].__id__].__type__,'cc.Sprite');for(const key of ['fillFrames','borderFrames','borderStrongFrames','borderThinFrames','borderFineFrames','borderMediumFrames'])assert.equal(v[key].length,11);assert.equal(v.avatarFrames.length,6);assert.equal(v.gradientFrames.length,2);}
});
test('rounded preview and panel detail layers use nine-slice without stretching their corners',()=>{
  const data=prefab('GameUIRoot'),b=data.find(o=>o.__type__===scriptId(contract.bindingScriptUuid));
  for(const ref of b.homePreviewPodium){const s=data[ref.__id__];assert.equal(s._type,1);assert.equal(s._spriteFrame.__uuid__,contract.assets['fill-r10'].spriteFrame);}
  const hint=data[b.previewHintBackground.__id__];assert.equal(hint._type,1);assert.equal(hint._spriteFrame.__uuid__,contract.assets['fill-r18'].spriteFrame);
  const panel=data[b.leaderboardGraphics.__id__];for(const slot of ['detail','innerBorder'])assert.equal(data[panel[slot].__id__]._type,1);
  assert.equal(data[panel.accent.__id__]._spriteFrame.__uuid__,contract.assets['fill-r5'].spriteFrame);
});
test('static captions use BITMAP caching while data-driven labels and inputs retain NONE',()=>{
  const data=prefab('GameUIRoot'),labels=data.filter(o=>o.__type__==='cc.Label'),named=name=>labels.filter(l=>data[l.node.__id__]._name===name);
  for(const name of ['Eyebrow','Subtitle','HomeCoinCaption','ScoreCaption','SettingsTitle','ReviveHint'])assert.equal(named(name)[0]._cacheMode,1,name);
  for(const name of ['Score','Best','HomeStamina','HomeCoins','NicknameText','NicknamePlaceholder','LeaderboardStatus','PreviewRank-0','PreviewTitle-0','ReviveStatus'])for(const label of named(name))assert.equal(label._cacheMode,0,name);
  assert.ok(labels.every(l=>l._cacheMode!==2),'CHAR caching is not applied indiscriminately');
});
test('standalone pages have visible authored roots, while the game starts with only its home screen',()=>{
  for(const name of ['HomeScreen','GameplayHUD','SettingsScreen','NicknameDialog','LeaderboardScreen','PauseScreen','ResultScreen','ReviveDialog'])assert.equal(prefab(name)[1]._active,true,name);
  const data=prefab('GameUIRoot'),b=data.find(o=>o.__type__===scriptId(contract.bindingScriptUuid));assert.equal(data[b.startGroup.__id__]._active,true);for(const key of ['settingsGroup','nicknameGroup','leaderboardGroup','pauseGroup','resultGroup','reviveGroup','gameplayHudGroup'])assert.equal(data[b[key].__id__]._active,false,key);
  for(const ref of b.homeStatVisuals){const visual=data[ref.__id__];const sprite=data[visual.fill.__id__];assert.equal(data[sprite.node.__id__]._active,true);}
});
test('every transition target has authored opacity, with no need for runtime addComponent',()=>{
  const data=prefab('GameUIRoot'),b=data.find(o=>o.__type__===scriptId(contract.bindingScriptUuid));
  for(const key of ['startGroup','settingsGroup','leaderboardGroup','nicknameGroup','reviveGroup','pauseGroup','resultGroup','gameplayHudGroup','pauseButton']){const n=data[b[key].__id__];assert.ok(n._components.some(ref=>data[ref.__id__].__type__==='cc.UIOpacity'),key);}
});
test('page layout widgets and visual animation roots have separate ownership',()=>{
  const data=prefab('GameUIRoot'),b=data.find(o=>o.__type__===scriptId(contract.bindingScriptUuid));assert.equal(b.pageLayoutRoots.length,8);assert.equal(b.pageVisualRoots.length,8);
  b.pageLayoutRoots.forEach((ref,i)=>{const layout=data[ref.__id__],visual=data[b.pageVisualRoots[i].__id__];assert.equal(visual._parent.__id__,ref.__id__);assert.equal(visual._name,'VisualRoot');assert.ok(layout._components.some(r=>data[r.__id__].__type__==='cc.Widget'));assert.ok(!visual._components.some(r=>data[r.__id__].__type__==='cc.Widget'));assert.ok(visual._components.some(r=>data[r.__id__].__type__==='cc.UIOpacity'));});
  assert.ok(data[1]._components.some(r=>data[r.__id__].__type__==='cc.Widget'),'root fills Canvas on wide displays');
});
test('preview row/podium/hint decorations render above the panel fill and below text',()=>{
  const data=prefab('GameUIRoot'),b=data.find(o=>o.__type__===scriptId(contract.bindingScriptUuid)),n=data[b.homeLeaderboardPreview.__id__];const order=n._children.map(r=>r.__id__);const panel=data[b.homeLeaderboardPreviewGraphics.__id__];const fillNode=data[panel.fill.__id__].node.__id__;const titleNode=data[b.homeLeaderboardPreviewTitle.__id__].node.__id__;
  const nodes=[...b.homePreviewPodium.map(r=>data[r.__id__].node.__id__),data[b.previewHintBackground.__id__].node.__id__,...b.homePreviewRowVisuals.map(r=>data[r.__id__].node.__id__)];for(const id of nodes){assert.ok(order.indexOf(id)>order.indexOf(fillNode));assert.ok(order.indexOf(id)<order.indexOf(titleNode));}
});
test('FX pool sizes, order and independent ring UV texture are authored',()=>{
  const data=prefab('GameplayFxRoot'),c=data.find(o=>o.__type__===scriptId(contract.fxScriptUuid));
  for(const[key,count]of Object.entries({sparkSprites:128,trailSprites:128,frameSprites:24,ringSprites:8})){assert.equal(c[key].length,count);for(const r of c[key]){const s=data[r.__id__];assert.equal(s.__type__,'cc.Sprite');assert.equal(data[s.node.__id__]._active,false);}}
  const r=data[c.ringSprites[0].__id__];assert.equal(r._spriteFrame.__uuid__,contract.assets['ring-white'].spriteFrame);assert.equal(contract.assets['ring-white'].packable,false);assert.ok(r._customMaterial);
  assert.equal(c.ringPrefab.__uuid__,contract.prefabs.ImpactRing.uuid);assert.equal(data[c.ringRoot.__id__]._name,'RingsRoot');const overflow=prefab('ImpactRing');assert.ok(overflow.some(o=>o.__type__==='cc.Sprite'&&o._customMaterial&&o._spriteFrame.__uuid__===contract.assets['ring-white'].spriteFrame));
  const root=data[1];assert.deepEqual(root._children.map(r=>data[r.__id__]._name),['FramesRoot','RingsRoot','SparksRoot','Flash']);
});
test('PNG dimensions, UUIDs and nine-slice limits match the authored manifest',()=>{
  const seen=new Set();for(const asset of Object.values(contract.assets)){const buffer=fs.readFileSync(path.join(ROOT,asset.path));assert.equal(buffer.subarray(1,4).toString(),'PNG');assert.equal(buffer.readUInt32BE(16),asset.width);assert.equal(buffer.readUInt32BE(20),asset.height);const meta=read(asset.path+'.meta');assert.equal(meta.uuid,asset.uuid);assert.equal(meta.subMetas.f9941.uuid,asset.spriteFrame);assert.ok(asset.border*2<=asset.width);assert.ok(asset.border*2<=asset.height);assert.ok(!seen.has(asset.uuid));seen.add(asset.uuid);}
});
