const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const contract = require('./bindings-contract.json');
class Color { constructor(r=255,g=255,b=255,a=255){Object.assign(this,{r,g,b,a});} static WHITE=new Color();static equals(a,b){return a.r===b.r&&a.g===b.g&&a.b===b.b&&a.a===b.a;} }
class UITransform {width=0;height=0;setContentSize(width,height){Object.assign(this,{width,height});}}
class Sprite {static Type={SIMPLE:0,SLICED:1};constructor(){const t=new UITransform();this.color=new Color();this.node={active:false,position:{x:0,y:0},getComponent:()=>t,setPosition(x,y){this.position={x,y};}};}}
const cc={_decorator:{ccclass:()=>Type=>Type,property:()=>()=>{}},Color,Component:class{},Sprite,SpriteFrame:class{},UITransform};
const sandbox={exports:{},require:()=>cc};
const source=fs.readFileSync(path.join(__dirname,'../../assets/scripts/ui/StackUIVisual.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText,sandbox);
function visual(){const v=new sandbox.exports.StackUIVisual();v.node={name:'TestVisual'};for(const slot of contract.visualSlots)v[slot]=new Sprite();for(const name of ['fillFrames','borderFrames','borderStrongFrames','borderThinFrames','borderFineFrames','borderMediumFrames'])v[name]=contract.radii.map(r=>({name,r}));v.avatarFrames=Array.from({length:6},(_,i)=>({tier:i}));v.gradientFrames=[{kind:'normal'},{kind:'current'}];v.validateBindings();return v;}
test('box preserves exact 1/1.5/2/3/4px frame choice and outer stroke bounds',()=>{
  const v=visual(),stroke=new Color(1,2,3);for(const[width,name]of [[1,'borderThinFrames'],[1.5,'borderFineFrames'],[2,'borderFrames'],[3,'borderMediumFrames'],[4,'borderStrongFrames']]){v.box(500,144,18,Color.WHITE,stroke,width);assert.equal(v.border.spriteFrame.name,name);assert.equal(v.border.spriteFrame.r,18);assert.equal(v.border.node.getComponent().width,500+width);assert.equal(v.border.node.getComponent().height,144+width);}
});
test('gradient selection changes shared frames without creating a material',()=>{
  const v=visual();v.gradientBox(500,144,false,Color.WHITE);assert.equal(v.fill.spriteFrame.kind,'normal');v.gradientBox(500,144,true,Color.WHITE,3);assert.equal(v.fill.spriteFrame.kind,'current');assert.equal(v.border.spriteFrame.name,'borderMediumFrames');
});
test('leaderboard layered shadow keeps the original size, offset and alpha for all three layers',()=>{
  const v=visual();v.setLayeredShadow(640,1100);for(const[sprite,inset,alpha]of [[v.shadowSoft,14,12],[v.shadowMid,7,22],[v.shadow,0,36]]){assert.equal(sprite.node.getComponent().width,640+inset*2);assert.equal(sprite.node.getComponent().height,1100+inset*2);assert.equal(sprite.node.position.y,-8);assert.deepEqual([sprite.color.r,sprite.color.g,sprite.color.b,sprite.color.a],[133,104,106,alpha]);}v.reset();for(const name of contract.visualSlots)assert.equal(v[name].node.active,false);
});
test('normal and highlighted gradient endpoints match the legacy RGB values',async()=>{
  const sharp=require(process.env.UI_SHARP_MODULE||'/Users/wxkang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
  for(const[name,top,bottom]of [['normal',[255,253,243],[246,234,220]],['current',[227,241,226],[213,233,218]]]){const {data,info}=await sharp(path.join(__dirname,`../../assets/ui/primitives/row-gradient-${name}.png`)).raw().toBuffer({resolveWithObject:true});for(const[y,expected]of [[0,top],[143,bottom]]){const offset=(y*info.width+80)*info.channels;assert.deepEqual([...data.subarray(offset,offset+3)],expected);}}
});
