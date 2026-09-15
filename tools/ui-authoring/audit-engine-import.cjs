#!/usr/bin/env node
// Reads actual Creator library + build output. Does not import the authoring fixture.
const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');const c=require('./bindings-contract.json');
const read=filename=>JSON.parse(fs.readFileSync(filename,'utf8'));
const imported=id=>read(path.join(ROOT,'library',id.slice(0,2),id+'.json'));
let importedFrames=0;
for(const[name,asset]of Object.entries(c.assets)){
  const frame=imported(asset.spriteFrame);assert.equal(frame.__type__,'cc.SpriteFrame',name);const v=frame.content;
  assert.equal(v.rect.width,asset.width,name);assert.equal(v.rect.height,asset.height,name);assert.deepEqual(v.capInsets,[asset.border,asset.border,asset.border,asset.border],name);assert.equal(v.texture,asset.texture,name);assert.equal(v.packable,asset.packable,name);const texture=imported(asset.texture);assert.equal(texture.__type__,'cc.Texture2D',name);assert.equal(texture.content.mipmaps[0],asset.uuid,name);importedFrames++;
}
const build=path.join(ROOT,'build/web-mobile/assets/main');const config=read(path.join(build,'config.json'));
const representative=c.assets['fill-r28'].spriteFrame;
const packEntry=Object.entries(config.packs).find(([,ids])=>ids.some(x=>(typeof x==='number'?config.uuids[x]:x)===representative));assert.ok(packEntry,'real build contains the representative UI SpriteFrame');
const[packId,packedIds]=packEntry;const pack=read(path.join(build,'import',packId.slice(0,2),packId+'.json'));
const textures=pack[1].filter(x=>typeof x==='string'&&x.endsWith('@6c48a'));assert.equal(textures.length,1,'ordinary UI frames share one generated atlas texture');
const names=[];function visit(v){if(!v||typeof v!=='object')return;if(v.name&&v.rect&&v.capInsets)names.push(v.name);for(const x of Object.values(v))visit(x);}visit(pack);
for(const[name,a]of Object.entries(c.assets))if(a.packable)assert.ok(names.includes(name),name+' was included in the real build atlas');
const ring=c.assets['ring-white'];assert.ok(config.uuids.includes(ring.texture),'ring keeps an independent texture for 0–1 UVs');
console.log(JSON.stringify({creatorVersion:'3.8.8',importedSpriteFrames:importedFrames,packedOrdinaryFrames:names.length,sharedAtlasTexture:textures[0],ringTexture:ring.texture,verified:'Actual Creator library/import and Web Mobile build output'},null,2));
