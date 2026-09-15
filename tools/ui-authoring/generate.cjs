#!/usr/bin/env node
// Deterministic editor asset authoring. No game runtime imports this tool.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const guard = require('./guard-generated.cjs');
let generationTicket;
const { build, cc, loadPlain } = require('./legacy-fixture.cjs');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'assets/prefabs/ui');
const ART = path.join(ROOT, 'assets/ui/primitives');
const SHARP = process.env.UI_SHARP_MODULE || '/Users/wxkang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp';
const sharp = require(SHARP);
const VISUAL_UUID = '135ac581-eeb0-4ee1-91b3-581bd3544411';
const BINDINGS_UUID = '2c6c32c4-6d11-559e-9c4e-1aa9ae6b6dfb';
const FX_UUID = '3ca83576-bacf-4f47-90cf-f7796b643c75';
const RING_MATERIAL_UUID = '6c07cc72-6dc5-4d9d-884b-e0936571c462';
const QR_UUID = '38b42077-8d9b-4dd1-a4f4-fa6169c14543';
const RADII = [12, 16, 18, 20, 22, 24, 28, 36, 40, 42, 44];
const SLOTS = ['shadowSoft', 'shadowMid', 'shadow', 'fill', 'border', 'focus', 'arrow', 'avatar', 'badge', 'accent', 'detail', 'innerBorder'];
const FRAME_ARRAYS = ['fillFrames','borderFrames','borderStrongFrames','borderThinFrames','borderFineFrames','borderMediumFrames','avatarFrames','gradientFrames'];
// These labels change only during page/layout setup; scores, inputs and row data keep NONE.
const BITMAP_LABEL_NAMES = new Set(['ScoreCaption','BestCaption','HomeCoinCaption','HomeBestCaption',
  'Eyebrow','Title','Subtitle','Controls','PrecisionTip','PreviewTitle','PreviewSubtitle','PreviewHint',
  'ResultTitle','PauseTitle','PauseHint','PauseControls','SettingsTitle','SettingsHint',
  'NicknameTitle','NicknameDescription','LeaderboardTitle','LeaderboardRankHeading',
  'LeaderboardColumns','LeaderboardScoreHeading','ReviveTitle','ReviveHint']);
function labelCacheMode(node, label) { return label.string && BITMAP_LABEL_NAMES.has(node.name) ? 1 : 0; }
function uuid(key) { const x = crypto.createHash('sha256').update(`wxstack/ui-prefab/v1/${key}`).digest('hex'); return `${x.slice(0,8)}-${x.slice(8,12)}-5${x.slice(13,16)}-a${x.slice(17,20)}-${x.slice(20,32)}`; }
function fileId(key) { return crypto.createHash('sha256').update(key).digest('base64').slice(0, 22); }
function scriptId(value) { const hex=value.replace(/-/g,'');const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let result=hex.slice(0,5);for(let i=5;i<32;i+=3){const n=parseInt(hex.slice(i,i+3),16);result+=chars[n>>6]+chars[n&63];}return result; }
function writeJSON(filename, value) { guard.assertWritable(generationTicket, filename); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n'); }
function meta(filename, importer, version, assetUuid, extra = {}) { writeJSON(filename + '.meta', { ver: version, importer, imported: true, uuid: assetUuid, files: [], subMetas: {}, userData: {}, ...extra }); }
function folders(dir) { if (dir === path.join(ROOT, 'assets')) return; folders(path.dirname(dir)); fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(dir + '.meta')) meta(dir, 'directory', '1.2.0', uuid(path.relative(ROOT, dir))); }
const assets = {};
async function artwork(name, width, height, body, border = 0, packable = true) {
  const filename = path.join(ART, `${name}.png`); const id = uuid(`art/${name}`); const texture = `${id}@6c48a`; const frame = `${id}@f9941`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  const png = await sharp(Buffer.from(svg), { density: 144 }).resize(width, height).png({ compressionLevel: 9 }).toBuffer(); guard.assertWritable(generationTicket,filename); fs.writeFileSync(filename, png);
  const vertices = { rawPosition: [-width/2,-height/2,0,width/2,-height/2,0,-width/2,height/2,0,width/2,height/2,0], indexes:[0,1,2,2,1,3], uv:[0,height,width,height,0,0,width,0], nuv:[0,0,1,0,0,1,1,1], minPos:[-width/2,-height/2,0], maxPos:[width/2,height/2,0] };
  meta(filename, 'image', '1.0.27', id, { files: ['.json','.png'], subMetas: {
    '6c48a': { importer:'texture', uuid:texture, displayName:name, id:'6c48a', name:'texture', ver:'1.0.22', imported:true, files:['.json'], subMetas:{}, userData:{ wrapModeS:'clamp-to-edge', wrapModeT:'clamp-to-edge', imageUuidOrDatabaseUri:id, isUuid:true, visible:false, minfilter:'linear', magfilter:'linear', mipfilter:'none', anisotropy:1 } },
    'f9941': { importer:'sprite-frame', uuid:frame, displayName:name, id:'f9941', name:'spriteFrame', ver:'1.0.12', imported:true, files:['.json'], subMetas:{}, userData:{ trimThreshold:1,rotated:false,offsetX:0,offsetY:0,trimX:0,trimY:0,width,height,rawWidth:width,rawHeight:height,borderTop:border,borderBottom:border,borderLeft:border,borderRight:border,packable,pixelsToUnit:100,pivotX:.5,pivotY:.5,meshType:0,isUuid:true,imageUuidOrDatabaseUri:texture,atlasUuid:'',trimType:'none',vertices } }
  }, userData:{type:'sprite-frame',fixAlphaTransparencyArtifacts:false,hasAlpha:true,redirect:frame} });
  assets[name] = { uuid:id, spriteFrame:frame, texture,width,height,border,packable,path:path.relative(ROOT,filename) }; return assets[name];
}
function svgGraphics(g, size = 128) {
  let out = ''; const color = c => `rgba(${c.r},${c.g},${c.b},${(c.a ?? 255)/255})`;
  for (const command of g.commands) {
    const attrs = command.operation === 'stroke' ? `fill="none" stroke="${color(command.color)}" stroke-width="${command.lineWidth}"` : `fill="${color(command.color)}"`;
    let d = '';
    for (const p of command.paths) {
      if (p.op === 'rect' || p.op === 'roundRect') out += `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${p.radius || 0}" ${attrs}/>`;
      else if (p.op === 'circle') out += `<circle cx="${p.x}" cy="${p.y}" r="${p.radius}" ${attrs}/>`;
      else if (p.op === 'moveTo') d += `M${p.x},${p.y} `;
      else if (p.op === 'lineTo') d += `L${p.x},${p.y} `;
      else if (p.op === 'close') d += 'Z ';
    }
    if (d) out += `<path d="${d}" ${attrs}/>`;
  }
  return `<g transform="translate(${size/2},${size/2}) scale(1,-1)">${out}</g>`;
}
function newNode(name, parent, width = 0, height = 0) { const n = new cc.Node(name); if (parent) n.parent = parent; n.addComponent(cc.UITransform).setContentSize(width,height); return n; }
class Sprite { constructor(frame='white', type=0) { this.frame = frame; this.type = type; this.color = new cc.Color(); } }
class StackUIVisual {}
class StackUIViewBindings {}
class GameplayFxController {}
class QRCodeView {}
function sprite(parent, name, frame, width = 10, height = 10, active = false, type = 0) { const n = newNode(name,parent,width,height); n.active=active; const s=n.addComponent(Sprite); s.frame=frame; s.type=type; return s; }
function nearestRadius(r = 28) { return RADII.reduce((a,b) => Math.abs(b-r)<Math.abs(a-r) ? b:a); }
function setSprite(s, p, c) { s.node.active=true; s.node.setPosition(p.x + (p.width||0)/2,p.y+(p.height||0)/2,0); s.node.getComponent(cc.UITransform).setContentSize(p.width||p.radius*2,p.height||p.radius*2); if (p.op==='circle') s.node.setPosition(p.x,p.y,0); s.color={...c}; }
function visual(node, commands = []) {
  const result=node.addComponent(StackUIVisual); const roots=[];
  for (const name of SLOTS) { const frame=name==='shadowSoft'?'fill-r58':name==='shadowMid'?'fill-r51':name==='arrow'?'arrow':name==='avatar'?'avatar-0':name==='badge'?'circle':name==='focus'?'border-r36-w4':name==='border'||name==='innerBorder'?'border-r28-w2':name==='accent'||name==='detail'?'white':'fill-r28'; result[name]=sprite(node,`Visual${name[0].toUpperCase()+name.slice(1)}`,frame,100,60,false,['fill','shadowSoft','shadowMid','shadow','border','focus','detail','innerBorder'].includes(name)?1:0); roots.push(result[name].node); }
  // Place all visuals behind existing labels / child controls.
  node.children=[...roots,...node.children.filter(n=>!roots.includes(n))];
  result.fillFrames=RADII.map(r=>`fill-r${r}`); result.borderFrames=RADII.map(r=>`border-r${r}-w2`); result.borderStrongFrames=RADII.map(r=>`border-r${r}-w4`);result.borderThinFrames=RADII.map(r=>`border-r${r}-w1`);result.borderFineFrames=RADII.map(r=>`border-r${r}-w1.5`);result.borderMediumFrames=RADII.map(r=>`border-r${r}-w3`); result.avatarFrames=Array.from({length:6},(_,i)=>`avatar-${i}`);result.gradientFrames=['row-gradient-normal','row-gradient-current'];
  const rects=commands.flatMap(c=>c.paths.filter(p=>['rect','roundRect','circle'].includes(p.op)).map(p=>({c,p}))).sort((a,b)=>(b.p.width||b.p.radius*2)*(b.p.height||b.p.radius*2)-(a.p.width||a.p.radius*2)*(a.p.height||a.p.radius*2));
  const fill=rects.find(v=>v.c.operation==='fill'&&(v.c.color.a??255)>100);
  const shadow=rects.find(v=>v.c.operation==='fill'&&(v.c.color.a??255)<=100);
  const border=rects.find(v=>v.c.operation==='stroke'&&(!fill||Math.abs(v.p.width-fill.p.width)<6))||rects.find(v=>v.c.operation==='stroke');
  if(fill){setSprite(result.fill,fill.p,fill.c.color);result.fill.frame=fill.p.op==='circle'?'circle':`fill-r${nearestRadius(fill.p.radius)}`; if(fill.p.op==='rect')result.fill.frame='white';}
  if(shadow){setSprite(result.shadow,shadow.p,shadow.c.color);result.shadow.frame=shadow.p.op==='rect'?'white':`fill-r${nearestRadius(shadow.p.radius)}`;}
  if(border){const sw=border.c.lineWidth||2;setSprite(result.border,{...border.p,x:border.p.x-sw/2,y:border.p.y-sw/2,width:border.p.width+sw,height:border.p.height+sw},border.c.color);result.border.frame=`border-r${nearestRadius(border.p.radius)}-w${[1,1.5,2,3,4].includes(sw)?sw:2}`;}
  const focus=fill&&rects.find(v=>v.c.operation==='stroke'&&v.p.radius===36&&v.p.width>fill.p.width+10);
  if(focus){setSprite(result.focus,{...focus.p,x:focus.p.x-2,y:focus.p.y-2,width:focus.p.width+4,height:focus.p.height+4},focus.c.color);const arrow=commands.find(c=>c.operation==='fill'&&c.paths[0]?.op==='moveTo'&&c.paths.length===4);if(arrow){const p=arrow.paths[0];setSprite(result.arrow,{x:p.x,y:p.y,width:13,height:20},arrow.color);}}
  return result;
}
function nodePath(n, stop) { const names=[]; while(n&&n!==stop){names.unshift(n.name);n=n.parent;} return names.join('/'); }
function assetRef(frame) { return {__uuid__:assets[frame]?.spriteFrame||frame,__expectedType__:'cc.SpriteFrame'}; }
function serialize(root, name, binding = null, pageRoots = new Map()) {
  const id=uuid(`prefab/${name}`); const list=[{__type__:'cc.Prefab',_name:name,_objFlags:0,__editorExtras__:{},_native:'',data:{__id__:1},optimizationPolicy:0,persistent:false,asyncLoadAssets:false}]; const refs=new Map();
  const ref=x=>x?{__id__:refs.get(x)}:null;
  function allocNode(n) { refs.set(n,list.length);list.push({}); for(const child of n.children)allocNode(child);for(const c of n.components.values()){refs.set(c,list.length);list.push({});} }
  allocNode(root);
  function typed(v) { if(refs.has(v))return ref(v);if(Array.isArray(v))return v.map(typed);if(v&&typeof v==='object'){const result={};for(const [k,w]of Object.entries(v))result[k]=typed(w);return result;}return v; }
  const v3=(v={x:0,y:0,z:0})=>({__type__:'cc.Vec3',x:v.x??0,y:v.y??0,z:v.z??0});const color=c=>({__type__:'cc.Color',r:c?.r??255,g:c?.g??255,b:c?.b??255,a:c?.a??255});
  function owner(n){let p=n;while(p&&p!==root){if(pageRoots.has(p))return p;p=p.parent;}return root;}
  function visit(n){const own=owner(n);const ownName=pageRoots.get(own)||name;const local=nodePath(n,own)||n.name;const info={__type__:'cc.PrefabInfo',root:ref(own),asset:{__uuid__:uuid(`prefab/${ownName}`),__expectedType__:'cc.Prefab'},fileId:fileId(`${ownName}/${local}`)};
    const infoIndex=list.length;list.push(info);
    list[refs.get(n)]={__type__:'cc.Node',_name:n.name,_objFlags:0,__editorExtras__:{},_parent:n===root?null:ref(n.parent),_children:n.children.map(ref),_active:n===root||n===root.pageVisual?true:n.active,_components:[...n.components.values()].map(ref),_prefab:{__id__:infoIndex},_lpos:v3(n.position),_lrot:{__type__:'cc.Quat',x:0,y:0,z:0,w:1},_lscale:v3(n.scale),_mobility:0,_layer:33554432,_euler:v3(),_id:fileId(`${name}/${nodePath(n,root)}`)};
    for(const [Type,c]of n.components){const cp=list.length;list.push({__type__:'cc.CompPrefabInfo',fileId:fileId(`${ownName}/${local}/${Type.name}`)});const base={__type__:`cc.${Type.name}`,_name:'',_objFlags:0,__editorExtras__:{},node:ref(n),_enabled:c.enabled!==false,__prefab:{__id__:cp},_id:fileId(`${name}/${nodePath(n,root)}/${Type.name}`)};let fields={};
      if(Type===cc.UITransform)fields={_contentSize:{__type__:'cc.Size',width:c.width??0,height:c.height??0},_anchorPoint:{__type__:'cc.Vec2',...c.anchorPoint}};
      else if(Type===cc.Label)fields={_srcBlendFactor:2,_dstBlendFactor:4,_color:color(c.color),_customMaterial:null,_useOriginalSize:false,_string:c.string??'',_horizontalAlign:c.horizontalAlign??1,_verticalAlign:c.verticalAlign??1,_actualFontSize:c.fontSize||24,_fontSize:c.fontSize||24,_fontFamily:'Arial',_lineHeight:c.lineHeight||29,_overflow:c.overflow??2,_enableWrapText:c.enableWrapText!==false,_font:null,_isSystemFontUsed:true,_isItalic:false,_isBold:!!c.isBold,_isUnderline:false,_underlineHeight:2,_cacheMode:labelCacheMode(n,c)};
      else if(Type===Sprite)fields={_srcBlendFactor:2,_dstBlendFactor:4,_color:color(c.color),_customMaterial:c.material?{__uuid__:c.material,__expectedType__:'cc.Material'}:null,_spriteFrame:assetRef(c.frame),_type:c.type,_fillType:0,_sizeMode:0,_fillCenter:{__type__:'cc.Vec2',x:0,y:0},_fillStart:0,_fillRange:0,_isTrimmedMode:false,_useGrayscale:false,_atlas:null};
      else if(Type===cc.Button)fields={clickEvents:[],_interactable:true,_transition:0,_normalColor:color(),_hoverColor:color(),_pressedColor:color(),_disabledColor:color({r:124,g:124,b:124,a:255}),_normalSprite:null,_hoverSprite:null,_pressedSprite:null,_disabledSprite:null,_duration:.1,_zoomScale:1.2,_target:ref(n)};
      else if(Type===cc.Widget){const flag=(c.isAlignTop?1:0)|(c.isAlignVerticalCenter?2:0)|(c.isAlignBottom?4:0)|(c.isAlignLeft?8:0)|(c.isAlignHorizontalCenter?16:0)|(c.isAlignRight?32:0);fields={_alignFlags:flag,_target:null,_left:c.left||0,_right:c.right||0,_top:c.top||0,_bottom:c.bottom||0,_horizontalCenter:c.horizontalCenter||0,_verticalCenter:c.verticalCenter||0,_isAbsLeft:true,_isAbsRight:true,_isAbsTop:true,_isAbsBottom:true,_isAbsHorizontalCenter:true,_isAbsVerticalCenter:true,_originalWidth:0,_originalHeight:0,_alignMode:1,_lockFlags:0};}
      else if(Type===cc.UIOpacity)fields={_opacity:c.opacity};
      else if(Type===cc.ScrollView)fields={_content:ref(c.content),horizontal:!!c.horizontal,vertical:!!c.vertical,inertia:!!c.inertia,brake:c.brake??.65,elastic:!!c.elastic,bounceDuration:.23,scrollEvents:[],cancelInnerEvents:true,_horizontalScrollBar:null,_verticalScrollBar:null};
      else if(Type===cc.EditBox)fields={_backgroundImage:null,_string:c.string||'',_textLabel:ref(c.textLabel),_placeholderLabel:ref(c.placeholderLabel),_inputMode:c.inputMode,_inputFlag:c.inputFlag,_returnType:c.returnType,_maxLength:c.maxLength,editingDidBegan:[],textChanged:[],editingDidEnded:[],editingReturn:[]};
      else if(Type===cc.MaskComponent){base.__type__='cc.Mask';fields={_type:0,_segments:64,_inverted:false,_spriteFrame:null,_alphaThreshold:1};}
      else if(Type===StackUIVisual){base.__type__=scriptId(VISUAL_UUID);fields=Object.fromEntries(SLOTS.map(k=>[k,ref(c[k])]));for(const k of FRAME_ARRAYS)fields[k]=c[k].map(assetRef);}
      else if(Type===StackUIViewBindings){base.__type__=scriptId(BINDINGS_UUID);fields=typed(c.binding);}
      else if(Type===GameplayFxController){base.__type__=scriptId(FX_UUID);for(const k of ['sparkSprites','trailSprites','frameSprites','ringSprites'])fields[k]=c[k].map(ref);fields.flashSprite=ref(c.flashSprite);fields.ringRoot=ref(c.ringRoot);fields.ringPrefab={__uuid__:c.ringPrefab,__expectedType__:'cc.Prefab'};}
      else if(Type===QRCodeView){base.__type__=scriptId(QR_UUID);fields.image=ref(c.image);}
      list[refs.get(c)]={...base,...fields};
    }for(const child of n.children)visit(child);
  }visit(root); const filename=path.join(OUT,`${name}.prefab`);writeJSON(filename,list);meta(filename,'prefab','1.1.50',id,{files:['.json']});return {uuid:id,path:path.relative(ROOT,filename),nodeCount:[...refs.keys()].filter(x=>x instanceof cc.Node).length,componentCount:[...refs.keys()].filter(x=>!(x instanceof cc.Node)).length};
}
async function main(){
  const artworkNames=['white','ring-white','circle','arrow','energy-bolt',...RADII.flatMap(r=>[`fill-r${r}`,...[1,1.5,2,3,4].map(w=>`border-r${r}-w${w}`)]),...[2,5,10,51,58].map(r=>`fill-r${r}`),'row-gradient-normal','row-gradient-current',...[0,1,2,3,4,5].map(i=>`avatar-${i}`)];
  const prefabNames=['HomeScreen','GameplayHUD','SettingsScreen','NicknameDialog','LeaderboardScreen','PauseScreen','ResultScreen','ReviveDialog','GameplayFxRoot','ImpactRing','GameUIRoot'];
  generationTicket=guard.verify({root:ROOT,outputs:guard.uiOutputFiles({artworkNames,prefabNames})});
  folders(OUT);folders(ART);
  await artwork('white',2,2,'<rect width="2" height="2" fill="white"/>');
  await artwork('ring-white',2,2,'<rect width="2" height="2" fill="white"/>',0,false);
  await artwork('circle',128,128,'<circle cx="64" cy="64" r="63" fill="white"/>');
  await artwork('arrow',13,20,'<path d="M0 0L13 10L0 20Z" fill="white"/>');
  await artwork('energy-bolt',128,128,`<defs><linearGradient id="gold" x2="0" y2="1"><stop stop-color="#FFDF70"/><stop offset="1" stop-color="#FFB637"/></linearGradient></defs><circle cx="64" cy="67" r="54" fill="#E7B777" opacity=".18"/><circle cx="64" cy="61" r="54" fill="#FFF2BF" stroke="#FFDB82" stroke-width="3"/><path d="M72 22L37 67Q35 71 41 71H59L52 100Q51 106 57 101L92 55Q95 50 88 50H69L77 25Q79 19 72 22Z" fill="url(#gold)" stroke="#C98128" stroke-width="3" stroke-linejoin="round"/><path d="M68 31L46 62H58" fill="none" stroke="#FFF8D5" stroke-width="4" stroke-linecap="round"/>`);
  for(const radius of RADII){const size=radius*2+8;await artwork(`fill-r${radius}`,size,size,`<rect width="${size}" height="${size}" rx="${radius}" fill="white"/>`,radius);for(const lineWidth of [1,1.5,2,3,4]){const p=lineWidth/2;await artwork(`border-r${radius}-w${lineWidth}`,size,size,`<rect x="${p}" y="${p}" width="${size-lineWidth}" height="${size-lineWidth}" rx="${radius}" fill="none" stroke="white" stroke-width="${lineWidth}"/>`,radius+Math.ceil(lineWidth));}}
  for(const radius of [2,5,10,51,58]){const size=radius*2+8;await artwork(`fill-r${radius}`,size,size,`<rect width="${size}" height="${size}" rx="${radius}" fill="white"/>`,radius);}
  const {game}=build();
  // Extend the frozen fixture before Graphics are converted and typed bindings are encoded.
  game.appearanceToggle=game.makeOverlayButton(game.settingsGroup,'AppearanceToggle','画面风格 · 标准',500,72,0,-330);
  const settingsButtons=[game.soundToggle,game.motionToggle,{node:game.testModeToggle,graphics:game.testModeToggleGraphics,label:game.testModeToggleLabel},game.nicknameButton,game.restoreStaminaButton,game.appearanceToggle,game.settingsCloseButton];
  settingsButtons.forEach((ui,index)=>{const width=ui.node.getComponent(cc.UITransform).width;game.anchorCenter(ui.node,0,170-index*100);game.drawOverlayButton(ui,width,72,false);const labelTransform=ui.label.node.getComponent(cc.UITransform);labelTransform.setContentSize(labelTransform.width,60);});
  game.nicknameButton.label.node.setPosition(0,16,0);game.nicknameButton.label.node.getComponent(cc.UITransform).setContentSize(480,32);
  game.nicknameLabel.node.setPosition(0,-18,0);game.nicknameLabel.node.getComponent(cc.UITransform).setContentSize(464,26);
  const appearanceIndex=game.settingsGroup.children.indexOf(game.appearanceToggle.node);game.settingsGroup.children.splice(appearanceIndex,1);game.settingsGroup.children.splice(game.settingsGroup.children.indexOf(game.settingsCloseButton.node),0,game.appearanceToggle.node);
  for(const [name,top,bottom]of [['normal',[255,253,243],[246,234,220]],['current',[227,241,226],[213,233,218]]]){const g=new cc.Graphics();game.drawLeaderboardGradient(g,-80,-72,160,144,18,top,bottom);const body=svgGraphics(g,160).replace('translate(80,80)','translate(80,72)');await artwork(`row-gradient-${name}`,160,144,body,18);}
  for(const [index,score]of [0,50,100,200,350,500].entries()){const g=new cc.Graphics();game.drawRankAvatar(g,0,0,64,score);await artwork(`avatar-${index}`,128,128,svgGraphics(g));}
  const atlas=path.join(ART,'ui-controls.pac');writeJSON(atlas,{});meta(atlas,'auto-atlas','1.0.8',uuid('atlas/ui-controls'),{files:['.json'],userData:{maxWidth:1024,maxHeight:1024,padding:2,allowRotation:false,forceSquared:false,powerOfTwo:true,algorithm:'MaxRects',format:'png',quality:100,contourBleed:false,paddingBleed:true,filterUnused:true,removeTextureInBundle:true}});
  // All old Graphics components are replaced with authored Sprite layers.
  const visualMap=new Map();const specialGraphics=new Set([game.graphics,game.effectsGraphics,game.screenDimmer,game.reviveQr]);const visit=n=>{const g=n.getComponent(cc.Graphics);if(g){n.components.delete(cc.Graphics);if(!specialGraphics.has(g)){const v=visual(n,g.commands);visualMap.set(g,v);}}for(const child of [...n.children])visit(child);};visit(game.node);
  const gfxNode=game.graphics.node;gfxNode.name='GameplayInput';
  const oldFx=game.effectsGraphics.node;oldFx.parent=null;
  const extraBindings={};
  const leaderboardVisual=game.leaderboardGroup.getComponent(StackUIVisual);leaderboardVisual.accent.frame='fill-r5';leaderboardVisual.accent.type=1;
  const previewVisual=game.homeLeaderboardPreview.getComponent(StackUIVisual);previewVisual.accent.frame='fill-r2';previewVisual.accent.type=1;
  extraBindings.homeStatVisuals=[0,1].map(i=>visual(newNode(`HomeStatCard-${i}`,game.homeBestBadge,100,100)));
  const home=game.homeLayout();const style=loadPlain('CreamStyle').CREAM_STYLE;const oldStats=game.homeBestBadge.getComponent(StackUIVisual);for(const slot of SLOTS)oldStats[slot].node.active=false;
  extraBindings.homeStatVisuals.forEach((v,i)=>{const x=(i===0?-1:1)*home.statOffset;setSprite(v.fill,{x:x-home.statWidth/2,y:-home.statsHeight/2,width:home.statWidth,height:home.statsHeight},new cc.Color(...style.textColor,16));v.fill.frame='fill-r22';setSprite(v.border,{x:x-home.statWidth/2-.75,y:-home.statsHeight/2-.75,width:home.statWidth+1.5,height:home.statsHeight+1.5},new cc.Color(...style.accentColor,80));v.border.frame='border-r22-w1.5';});
  extraBindings.homeStaminaIcon=sprite(game.startGroup,'HomeStaminaIcon','energy-bolt',42,42,true);
  extraBindings.homeStaminaIcon.node.setPosition(-154,0,0);
  game.homeStaminaLabel.string='5/5 · 自然恢复已满';game.homeCoinLabel.string='100';
  extraBindings.homePreviewRowVisuals=[0,1,2].map(i=>visual(newNode(`PreviewRowVisual-${i}`,game.homeLeaderboardPreview,100,100)));
  extraBindings.homePreviewPodium=[0,1,2].map(i=>sprite(game.homeLeaderboardPreview,`PreviewPodium-${i}`,'fill-r10',100,100,false,1));
  extraBindings.previewHintBackground=sprite(game.homeLeaderboardPreview,'PreviewHintBackground','fill-r18',100,40,false,1);
  // QR texture is generated once per session; the view and Sprite are authored.
  extraBindings.reviveQr=sprite(game.reviveQr.node,'QRCode','white',360,360,true);
  game.reviveStatusLabel.string='进入扫码复活后生成二维码';
  extraBindings.qrCodeView=extraBindings.reviveQr.node.addComponent(QRCodeView);extraBindings.qrCodeView.image=extraBindings.reviveQr;
  extraBindings.reviveVisual=game.reviveGroup.getComponent(StackUIVisual);
  extraBindings.settingStateLabels=[game.soundToggle.node,game.motionToggle.node,game.testModeToggle].map(n=>n.getChildByName('SettingState').getComponent(cc.Label));
  extraBindings.screenDimmer=sprite(game.screenDimmer.node,'Dimmer','white',750,1334,true);extraBindings.screenDimmer.color=new cc.Color(2,8,18,18);
  game.homeBestBadge.children.unshift(...game.homeBestBadge.children.splice(-2));
  const extraPreview=game.homeLeaderboardPreview.children.splice(-7);game.homeLeaderboardPreview.children.splice(SLOTS.length,0,...extraPreview);
  const fxRoot=newNode('GameplayFxRoot',game.node,750,1334);game.node.children=game.node.children.filter(n=>n!==fxRoot);game.node.children.splice(1,0,fxRoot);
  const fxc=fxRoot.addComponent(GameplayFxController);fxc.frameSprites=[];fxc.ringSprites=[];fxc.sparkSprites=[];fxc.trailSprites=[];
  const frames=newNode('FramesRoot',fxRoot),rings=newNode('RingsRoot',fxRoot),sparks=newNode('SparksRoot',fxRoot);
  fxc.ringRoot=rings;fxc.ringPrefab=uuid('prefab/ImpactRing');
  const impactRing=sprite(null,'ImpactRing','ring-white');impactRing.material=RING_MATERIAL_UUID;
  for(let i=0;i<24;i++)fxc.frameSprites.push(sprite(frames,`FrameEdge-${i}`,'white'));
  for(let i=0;i<8;i++){const s=sprite(rings,`Ring-${i}`,'ring-white');s.material=RING_MATERIAL_UUID;fxc.ringSprites.push(s);}
  for(let i=0;i<128;i++){fxc.trailSprites.push(sprite(sparks,`Trail-${i}`,'white'));fxc.sparkSprites.push(sprite(sparks,`Spark-${i}`,'white'));}
  fxc.flashSprite=sprite(fxRoot,'Flash','white',750,1334);
  extraBindings.gameplayFx=fxc;
  for(const n of [game.startGroup,game.settingsGroup,game.leaderboardGroup,game.nicknameGroup,game.reviveGroup,game.pauseGroup,game.resultGroup,game.gameplayHudGroup,game.pauseButton,game.testModeBadgeLabel.node,game.perfectLabel.node])if(!n.getComponent(cc.UIOpacity))n.addComponent(cc.UIOpacity);
  // Layout widgets and animation transforms have separate ownership.
  const pagePairs=[[game.startGroup,'HomeScreen'],[game.gameplayHudGroup,'GameplayHUD'],[game.settingsGroup,'SettingsScreen'],[game.nicknameGroup,'NicknameDialog'],[game.leaderboardGroup,'LeaderboardScreen'],[game.pauseGroup,'PauseScreen'],[game.resultGroup,'ResultScreen'],[game.reviveGroup,'ReviveDialog']];
  const pages=new Map();extraBindings.pageLayoutRoots=[];extraBindings.pageVisualRoots=[];
  for(const[group,name]of pagePairs){const parent=group.parent;const index=parent.children.indexOf(group);const t=group.getComponent(cc.UITransform);const wrapper=newNode(`${name}LayoutRoot`,null,t.width,t.height);wrapper.parent=parent;parent.children.splice(parent.children.indexOf(wrapper),1);parent.children.splice(index,0,wrapper);wrapper.setPosition(group.position);group.setPosition(0,0,0);group.parent=wrapper;group.name='VisualRoot';wrapper.pageVisual=group;const widget=group.getComponent(cc.Widget);if(widget){group.components.delete(cc.Widget);wrapper.components.set(cc.Widget,widget);widget.node=wrapper;}pages.set(wrapper,name);extraBindings.pageLayoutRoots.push(wrapper);extraBindings.pageVisualRoots.push(group);}
  const rootWidget=game.node.addComponent(cc.Widget);Object.assign(rootWidget,{isAlignTop:true,isAlignBottom:true,isAlignLeft:true,isAlignRight:true,top:0,bottom:0,left:0,right:0});
  const binding={};const contract={fields:{},structs:{},assets,visualSlots:SLOTS,radii:RADII};
  const isComponent=x=>x&&x.node instanceof cc.Node&&x.constructor.name!=='Object';
  function encode(value,key){if(value instanceof cc.Node){contract.fields[key]={type:'Node',path:nodePath(value,game.node)};return value;}if(isComponent(value)){const actual=visualMap.get(value)||value;contract.fields[key]={type:actual.constructor.name,path:nodePath(actual.node,game.node)};return actual;}return null;}
  for(const[key,value]of Object.entries({...game,...extraBindings})){
    if(['node','graphics','effectsGraphics','world3D','audioSource'].includes(key))continue;
    const encoded=encode(value,key);if(encoded){binding[key]=encoded;continue;}
    if(value&&isComponent(value.graphics)&&value.node instanceof cc.Node){binding[key]={__type__:'StackUIButtonBinding',node:value.node,graphics:visualMap.get(value.graphics),label:value.label};contract.fields[key]={type:'StackUIButtonBinding'};continue;}
    if(Array.isArray(value)&&value.length){
      if(value.every(v=>v instanceof cc.Node||isComponent(v))){binding[key]=value.map((v,i)=>encode(v,`${key}[${i}]`));contract.fields[key]={type:binding[key][0].constructor.name,array:true};}
      else if(value.every(v=>v?.node instanceof cc.Node&&v.graphics)){const row='rank'in value[0];const type=row?'StackLeaderboardRowBinding':'StackUIButtonBinding';binding[key]=value.map(v=>Object.fromEntries([['__type__',type],...Object.entries(v).map(([k,w])=>[k,visualMap.get(w)||w])]));contract.fields[key]={type,array:true};}
    }
  }
  binding.graphics=gfxNode;contract.fields.graphics={type:'Node',path:nodePath(gfxNode,game.node)};
  contract.structs.StackUIButtonBinding={node:'Node',graphics:'StackUIVisual',label:'Label'};
  contract.structs.StackLeaderboardRowBinding={node:'Node',graphics:'StackUIVisual',rank:'Label',player:'Label',score:'Label',title:'Label',detail:'Label'};
  const bindingComponent=game.node.addComponent(StackUIViewBindings);bindingComponent.binding=binding;
  pages.set(fxRoot,'GameplayFxRoot');
  const prefabs={ImpactRing:serialize(impactRing.node,'ImpactRing')};for(const[n,name]of pages)prefabs[name]=serialize(n,name);
  prefabs.GameUIRoot=serialize(game.node,'GameUIRoot',binding,pages);
  contract.prefabs=prefabs;contract.bindingScriptUuid=BINDINGS_UUID;contract.visualScriptUuid=VISUAL_UUID;contract.fxScriptUuid=FX_UUID;
  writeJSON(path.join(__dirname,'bindings-contract.json'),contract);
  // Strongly typed references are serialized by Creator; no runtime path lookup.
  const imports=['_decorator','Component','Node','Label','Button','ScrollView','EditBox','UIOpacity','UITransform','Sprite'];
  const lines=[`// Generated by tools/ui-authoring/generate.cjs. Edit the authoring contract to change bindings.`,`import { ${imports.join(', ')} } from 'cc';`,`import { StackUIVisual } from './ui/StackUIVisual';`,`import { GameplayFxController } from './ui/GameplayFxController';`,`import { QRCodeView } from './ui/QRCodeView';`,`const { ccclass, property } = _decorator;`];
  for(const[name,fields]of Object.entries(contract.structs)){lines.push(`@ccclass('${name}')`,`export class ${name} {`);for(const[k,t]of Object.entries(fields))lines.push(`  @property(${t}) ${k}: ${t} = null!;`);lines.push('}');}
  lines.push(`@ccclass('StackUIViewBindings')`,`export class StackUIViewBindings extends Component {`);
  for(const[k,f]of Object.entries(contract.fields)){if(k.includes('['))continue;const t=f.type==='SafeArea'?'Component':f.type;lines.push(f.array?`  @property([${t}]) ${k}: ${t}[] = [];`:`  @property(${t}) ${k}: ${t} = null!;`);}lines.push('}');
  guard.assertWritable(generationTicket,path.join(ROOT,'assets/scripts/StackUIViewBindings.ts'));
  fs.writeFileSync(path.join(ROOT,'assets/scripts/StackUIViewBindings.ts'),lines.join('\n')+'\n');meta(path.join(ROOT,'assets/scripts/StackUIViewBindings.ts'),'typescript','4.0.24',BINDINGS_UUID);
  guard.record(generationTicket);
  console.log(JSON.stringify({prefabs,artworkCount:Object.keys(assets).length,bindingFieldCount:Object.keys(contract.fields).filter(k=>!k.includes('[')).length,contract:'tools/ui-authoring/bindings-contract.json'},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
