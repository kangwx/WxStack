const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const ctx={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../assets/scripts/CreamAppearance.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,ctx);
const {loadCreamAppearance,saveCreamAppearance,CREAM_APPEARANCE_STORAGE_KEY:key}=ctx.exports;
function storage(){const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
test('appearance defaults to standard and ignores legacy skins and corrupt values',()=>{
  for(const raw of [null,'','standard','neon','{"variant":"bright"}']){
    const s=storage();if(raw!==null)s.setItem(key,raw);s.setItem('wxstack-selected-skin','nature-zen');
    assert.equal(loadCreamAppearance(s),'standard');
  }
  assert.equal(loadCreamAppearance(null),'standard');
  assert.equal(loadCreamAppearance({getItem(){throw Error('blocked');}}),'standard');
});
test('both appearances persist independently without touching progress or other settings',()=>{
 const s=storage();s.setItem('wxstack-coins','350');s.setItem('wxstack-stamina-v1','saved stamina');
 for(const mode of ['bright','standard']){assert.equal(saveCreamAppearance(s,mode),true);assert.equal(loadCreamAppearance(s),mode);}
 assert.equal(s.getItem('wxstack-coins'),'350');assert.equal(s.getItem('wxstack-stamina-v1'),'saved stamina');
 assert.equal(saveCreamAppearance(null,'bright'),false);
 assert.equal(saveCreamAppearance({setItem(){throw Error('blocked');}},'bright'),false);
});
test('settings toggle applies immediately, remains usable without storage, and keyboard wraps seven actions',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../assets/scripts/StackGame.ts'),'utf8');
 const methods=source.slice(source.indexOf('  private onAppearanceToggle()'),source.indexOf('  private onPauseButton()'));
 const context={saveCreamAppearance,sys:{localStorage:null}};
 vm.runInNewContext(ts.transpileModule(methods.replace(/  private (\w+)\(/g,'function $1('),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,context);
 const applied=[];const game={homeOverlay:'none',creamAppearance:'standard',settingsSelection:0,world3D:{setAppearance:v=>applied.push(v)},updateSettingsUI(){}};
 context.onAppearanceToggle.call(game);assert.equal(applied.length,0);
 game.homeOverlay='settings';context.onAppearanceToggle.call(game);
 assert.equal(game.creamAppearance,'bright');assert.equal(game.settingsSelection,5);assert.match(game.nicknameStatus,/本次生效/);
 context.onAppearanceToggle.call(game);assert.equal(game.creamAppearance,'standard');assert.deepEqual(applied,['bright','standard']);
 game.settingsSelection=6;context.moveSettingsSelection.call(game,1);assert.equal(game.settingsSelection,0);
 context.moveSettingsSelection.call(game,-1);assert.equal(game.settingsSelection,6);
 let toggled=0;game.settingsSelection=5;game.onAppearanceToggle=()=>toggled++;context.activateSettingsSelection.call(game);assert.equal(toggled,1);
});
