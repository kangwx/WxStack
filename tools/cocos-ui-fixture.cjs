// Offline deserialization of the checked-in UI prefabs for controller tests.
// Runs the real view components; does not emulate the Cocos renderer or native IME.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const contract = require('./ui-authoring/bindings-contract.json');
function scriptId(value) {
  const hex = value.replace(/-/g, ''), chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) { const n = parseInt(hex.slice(i, i + 3), 16); out += chars[n >> 6] + chars[n & 63]; }
  return out;
}
function createUIFixture(cc) {
  cc._decorator.property ??= () => () => {};
  cc.Color.equals ??= (a, b) => !!a && !!b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
  cc.Color.prototype.set ??= function (r, g, b, a = 255) {
    Object.assign(this, typeof r === 'object' ? r : { r, g, b, a }); return this;
  };
  cc.Vec3.prototype.set ??= function (x, y, z) { Object.assign(this, typeof x === 'object' ? x : { x, y, z }); return this; };
  cc.Vec4 ??= class { constructor(x=0,y=0,z=0,w=0) { Object.assign(this,{x,y,z,w}); } set(x,y,z,w) { Object.assign(this,{x,y,z,w}); return this; } };
  cc.SpriteFrame ??= class { destroy() { this.destroyed = true; } };
  cc.Material ??= class { properties = {}; setProperty(name, value) { this.properties[name] = value; } };
  cc.Sprite ??= class {
    color = new cc.Color();
    setSharedMaterial(material) { this.customMaterial = material; }
    getMaterialInstance() { return this.materialInstance ??= new cc.Material(); }
  };
  cc.Sprite.Type ??= { SIMPLE: 0, SLICED: 1, TILED: 2, FILLED: 3 };
  cc.SafeArea ??= class {};
  cc.SafeArea.prototype.updateArea ??= function () {};
  cc.BlockInputEvents ??= class {};
  cc.Button ??= class { static EventType = { CLICK: 'click' }; };
  cc.Label ??= class {};
  cc.Label.HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
  cc.Label.VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
  cc.Label.Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };
  cc.ScrollView ??= class { static EventType = { SCROLLING: 'scrolling' }; };
  cc.EditBox ??= class {};
  cc.MaskComponent ??= class { static Type = { GRAPHICS_RECT: 0 }; };
  cc.Texture2D ??= class {};
  cc.Prefab ??= class {};
  cc.Widget ??= class {};
  cc.Widget.prototype.updateAlignment ??= function () {};
  cc.UIOpacity ??= class {};
  cc.UITransform.prototype.setContentSize ??= function (width, height) {
    this.width = typeof width === 'object' ? width.width : width;
    this.height = typeof width === 'object' ? width.height : height;
  };
  cc.UITransform.prototype.setAnchorPoint ??= function (x, y) { this.anchorPoint = { x, y }; };
  if (!Object.getOwnPropertyDescriptor(cc.UITransform.prototype,'contentSize')) Object.defineProperty(cc.UITransform.prototype,'contentSize',{get(){return {width:this.width,height:this.height};}});
  cc.sys.getSafeAreaRect ??= () => ({x:0,y:0,...(cc.screen?.windowSize ?? cc.view.getVisibleSize())});
  if (!Object.getOwnPropertyDescriptor(cc.Node.prototype,'activeInHierarchy')) Object.defineProperty(cc.Node.prototype,'activeInHierarchy',{get(){return this.active !== false && (!this.parent || this.parent.activeInHierarchy);}});
  cc.Node.prototype.on ??= function () {};
  cc.Node.prototype.off ??= function () {};
  cc.Node.prototype.setParent ??= function (parent) { this.parent = parent; if (parent && !parent.children.includes(this)) parent.children.push(this); };
  cc.Node.prototype.getComponentsInChildren ??= function (Type) {
    const result = []; const visit = node => { const c=node.getComponent(Type); if(c)result.push(c); node.children.forEach(visit); }; visit(this); return result;
  };
  const cache = new Map();
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const context = { exports: {}, AbortController, TextEncoder, setTimeout, clearTimeout, require(id) {
      if (id === 'cc') return cc;
      if (id === 'cc/env') return { DEBUG: false };
      return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), id)));
    } };
    cache.set(name, context.exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'assets/scripts', name + '.ts'), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
    }).outputText, context);
    return context.exports;
  }
  const { StackUIVisual } = load('ui/StackUIVisual');
  const { StackUIViewBindings } = load('StackUIViewBindings');
  const { GameplayFxController } = load('ui/GameplayFxController');
  const { QRCodeView } = load('ui/QRCodeView');
  const qrUuid = JSON.parse(fs.readFileSync(path.join(root, 'assets/scripts/ui/QRCodeView.ts.meta'), 'utf8')).uuid;
  const custom = { [scriptId(contract.visualScriptUuid)]: StackUIVisual, [scriptId(contract.bindingScriptUuid)]: StackUIViewBindings,
    [scriptId(contract.fxScriptUuid)]: GameplayFxController, [scriptId(qrUuid)]: QRCodeView };
  const serialized = new Map(), assets = new Map();
  const prefabNames = new Map(Object.entries(contract.prefabs).map(([name, entry]) => [entry.uuid, name]));
  cc.instantiate ??= asset => {
    if (!(asset instanceof cc.Prefab) || !asset.fixturePrefabName) throw new Error('Unknown prefab asset in offline UI fixture');
    return prefab(asset.fixturePrefabName).root;
  };
  function prefab(name = 'GameUIRoot') {
    let data = serialized.get(name);
    if (!data) { data = JSON.parse(fs.readFileSync(path.join(root, contract.prefabs[name].path), 'utf8')); serialized.set(name, data); }
    const instances = data.map(item => {
      if (item.__type__ === 'cc.Node') return new cc.Node(item._name);
      const Type = custom[item.__type__] ?? (item.__type__ === 'cc.Mask' ? cc.MaskComponent : cc[item.__type__?.slice(3)]);
      return Type ? new Type() : {};
    });
    function resolve(value) {
      if (value === null || typeof value !== 'object') return value;
      if ('__id__' in value) return instances[value.__id__];
      if ('__uuid__' in value) {
        if (!assets.has(value.__uuid__)) {
          const name = prefabNames.get(value.__uuid__);
          assets.set(value.__uuid__, name ? Object.assign(new cc.Prefab(), { uuid: value.__uuid__, fixturePrefabName: name })
            : Object.assign(new cc.SpriteFrame(), { uuid: value.__uuid__ }));
        }
        return assets.get(value.__uuid__);
      }
      if (value.__type__ === 'cc.Color') return new cc.Color(value.r, value.g, value.b, value.a);
      if (Array.isArray(value)) return value.map(resolve);
      const out = {}; for (const [key, item] of Object.entries(value)) if (key !== '__type__') out[key] = resolve(item); return out;
    }
    data.forEach((item, i) => {
      const instance = instances[i];
      if (item.__type__ === 'cc.Node') {
        instance.active = item._active;
        instance.setPosition(item._lpos.x, item._lpos.y, item._lpos.z);
        instance.setScale(item._lscale.x, item._lscale.y, item._lscale.z);
        instance.children = item._children.map(ref => instances[ref.__id__]);
        instance._parent = item._parent ? instances[item._parent.__id__] : null;
        // Mocks without a parent accessor need a direct reference.
        if (!Object.getOwnPropertyDescriptor(cc.Node.prototype, 'parent')) instance.parent = instance._parent;
        return;
      }
      for (const [key, value] of Object.entries(item)) {
        if (key.startsWith('__') || ['_name','_objFlags','_id'].includes(key)) continue;
        const publicKey = key.startsWith('_') ? key.slice(1) : key;
        if (publicKey === 'contentSize') instance.setContentSize(value.width, value.height);
        else if (publicKey === 'anchorPoint') instance.setAnchorPoint(value.x, value.y);
        else instance[publicKey] = resolve(value);
      }
      if (instance.node && instance.node.components && instance.constructor !== Object) instance.node.components.set(instance.constructor, instance);
    });
    const rootNode = instances[data[0].data.__id__];
    const bindings = rootNode.getComponent(StackUIViewBindings);
    return { root: rootNode, bindings, instances };
  }
  function attachGame(game) {
    const loaded = prefab();
    game.ui = loaded.bindings;
    for (const key of Object.keys(loaded.bindings)) if (!['node','enabled','prefab','id'].includes(key)) game[key] = loaded.bindings[key];
    game.uiReady = true;
    game.presenter?.setVisible(true);
    game.initializePageViews();
    const {StackUIRenderer}=load('ui/StackUIRenderer');
    game.renderer=new StackUIRenderer(loaded.bindings,{home:()=>game.homeLayout(),panel:kind=>game.panelLayout(kind),hud:()=>game.hudLayout(),panelCenterX:width=>game.panelCenterX(width)},()=>({reducedMotion:game.reducedMotion,visibleWidth:game.visibleWidth,visibleHeight:game.visibleHeight,tvLayout:game.tvLayout}));
    loaded.bindings.gameplayFx.initialize((x,z,level,out)=>out.set(x,level,z));
    return loaded;
  }
  function find(node, name) {
    if (node.name === name) return node;
    for (const child of node.children) { const result = find(child, name); if (result) return result; }
    return null;
  }
  function button(parent, name = 'Button') {
    const node = find(prefab('HomeScreen').root, 'StartButton');
    node.name = name;
    node.parent = parent;
    if (!parent.children.includes(node)) parent.children.push(node);
    return { node, graphics: node.getComponent(StackUIVisual), label: node.children.map(child => child.getComponent(cc.Label)).find(Boolean) };
  }
  return { load, prefab, attachGame, find, button, StackUIVisual, StackUIViewBindings, GameplayFxController };
}
module.exports = { createUIFixture };
