// Offline authoring fixture only. Never imported by the game runtime.
// The source snapshot is intentionally frozen before the prefab migration.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
class Node {
  constructor(name) { this.name = name; this.children = []; this.components = new Map(); this.active = true; this.isValid = true; this.position = { x: 0, y: 0, z: 0 }; this.scale = { x: 1, y: 1, z: 1 }; this.layer = 33554432; }
  set parent(value) { if (this._parent) this._parent.children = this._parent.children.filter(n => n !== this); this._parent = value; if (value) value.children.push(this); }
  get parent() { return this._parent; }
  get worldPosition() { const p = this.parent?.worldPosition || { x: 0, y: 0, z: 0 }; return { x: p.x + this.position.x, y: p.y + this.position.y, z: p.z + this.position.z }; }
  addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); return c; }
  getComponent(Type) { return this.components.get(Type) || null; }
  getChildByName(name) { return this.children.find(n => n.name === name); }
  setPosition(x, y, z = 0) { this.position = typeof x === 'object' ? { ...x } : { x, y, z }; }
  setScale(x, y = x, z = 1) { this.scale = typeof x === 'object' ? { ...x } : { x, y, z }; }
  on() {} off() {}
}
Node.EventType = { TOUCH_END: 'touch-end' };
class UITransform { constructor() { this.width = 0; this.height = 0; this.anchorPoint = { x: .5, y: .5 }; } setContentSize(w, h) { this.width = typeof w === 'object' ? w.width : w; this.height = typeof w === 'object' ? w.height : h; } setAnchorPoint(x, y) { this.anchorPoint = { x, y }; } }
class Button { static Transition = { NONE: 0 }; static EventType = { CLICK: 'click' }; }
class Label { static HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 }; static VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 }; static Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 }; }
class Color { constructor(r = 255, g = 255, b = 255, a = 255) { Object.assign(this, { r, g, b, a }); } static WHITE = new Color(); }
class Graphics {
  constructor() { this.clear(); this.fillColor = new Color(); this.strokeColor = new Color(); this.lineWidth = 1; }
  clear() { this.commands = []; this.pending = []; }
  rect(x, y, width, height) { this.pending.push({ op: 'rect', x, y, width, height }); }
  roundRect(x, y, width, height, radius) { this.pending.push({ op: 'roundRect', x, y, width, height, radius }); }
  circle(x, y, radius) { this.pending.push({ op: 'circle', x, y, radius }); }
  moveTo(x, y) { this.pending.push({ op: 'moveTo', x, y }); }
  lineTo(x, y) { this.pending.push({ op: 'lineTo', x, y }); }
  close() { this.pending.push({ op: 'close' }); }
  fill() { this.commands.push({ operation: 'fill', color: { ...this.fillColor }, paths: this.pending.splice(0) }); }
  stroke() { this.commands.push({ operation: 'stroke', color: { ...this.strokeColor }, lineWidth: this.lineWidth, paths: this.pending.splice(0) }); }
}
class Widget {
  constructor() { this.enabled = true; }
  updateAlignment() {
    const t = this.node.getComponent(UITransform); const p = this.node.parent?.getComponent(UITransform); if (!t || !p) return;
    let { x, y } = this.node.position;
    if (this.isAlignLeft && this.isAlignRight) { t.width = p.width - (this.left || 0) - (this.right || 0); x = ((this.left || 0) - (this.right || 0)) / 2; }
    else if (this.isAlignLeft) x = -p.width / 2 + (this.left || 0) + t.width * t.anchorPoint.x;
    else if (this.isAlignRight) x = p.width / 2 - (this.right || 0) - t.width * (1 - t.anchorPoint.x);
    if (this.isAlignTop && this.isAlignBottom) { t.height = p.height - (this.top || 0) - (this.bottom || 0); y = ((this.bottom || 0) - (this.top || 0)) / 2; }
    else if (this.isAlignTop) y = p.height / 2 - (this.top || 0) - t.height * (1 - t.anchorPoint.y);
    else if (this.isAlignBottom) y = -p.height / 2 + (this.bottom || 0) + t.height * t.anchorPoint.y;
    if (this.isAlignHorizontalCenter) x = this.horizontalCenter || 0;
    if (this.isAlignVerticalCenter) y = this.verticalCenter || 0;
    this.node.setPosition(x, y, this.node.position.z);
  }
}
class ScrollView {
  static EventType = { SCROLLING: 'scrolling' };
  getScrollOffset() { return { x: 0, y: (this.content?.position.y || 0) - this.node.getComponent(UITransform).height / 2 }; }
  getMaxScrollOffset() { return { x: 0, y: Math.max(0, this.content.getComponent(UITransform).height - this.node.getComponent(UITransform).height) }; }
  stopAutoScroll() {} scrollToOffset(o) { this.content.setPosition(0, this.node.getComponent(UITransform).height / 2 + o.y); } scrollToTop() { this.scrollToOffset({ y: 0 }); }
}
class EditBox { static InputMode = { SINGLE_LINE: 6 }; static InputFlag = { DEFAULT: 5 }; static KeyboardReturnType = { DONE: 1 }; static EventType = {}; string = ''; blur() {} focus() {} }
class UIOpacity { opacity = 255; }
class SafeArea { updateArea() {} }
class BlockInputEvents {}
class MaskComponent { static Type = { GRAPHICS_RECT: 0 }; }
class StackWorld3D { reset() {} sync() {} setHomePresentation() {} setCompositionOffset() {} setOverview() {} }
const cc = { _decorator: { ccclass: () => Type => Type }, Component: class { schedule() {} unschedule() {} }, Node, UITransform, Button, Label, Color, Graphics, Widget, ScrollView, EditBox, UIOpacity, SafeArea, BlockInputEvents, MaskComponent,
  Vec2: class { constructor(x, y) { Object.assign(this, { x, y }); } }, Vec3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }, Tween: { stopAllByTarget() {} }, tween: () => ({ to() { return this; }, start() {} }),
  sys: { isBrowser: false, localStorage: null }, KeyCode: {}, resources: {}, input: {}, Input: { EventType: {} }, game: {}, Game: {}, view: {}, screen: {}, director: {}, Director: {}, profiler: {}, AudioClip: class {}, AudioSource: class {}, ResolutionPolicy: {},
};
function loadPlain(name) {
  const snapshot = path.join(__dirname, 'fixtures', `${name}.legacy.ts.txt`);
  const filename = fs.existsSync(snapshot) ? snapshot : path.join(__dirname, '../../assets/scripts', `${name}.ts`);
  const runtime = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText, runtime);
  return runtime.exports;
}
function build(width = 750, height = 1334) {
  const source = fs.readFileSync(path.join(__dirname, 'fixtures/StackGame.legacy.ts.txt'), 'utf8');
  const sandbox = { exports: {}, require: name => name === 'cc' ? cc : name === './StackWorld3D' ? { StackWorld3D } : name === './RemoteInput' ? {} : loadPlain(name.slice(2)) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true } }).outputText, sandbox);
  const game = new sandbox.exports.StackGame();
  game.node = new Node('GameUIRoot'); game.node.addComponent(UITransform).setContentSize(width, height);
  game.visibleWidth = width; game.visibleHeight = height; game.audioReady = true;
  game.buildStage();
  for (const n of [game.graphics.node, game.effectsGraphics.node, game.hudSafeRoot]) n.getComponent(UITransform).setContentSize(width, height);
  game.applyResponsiveLayout(); game.applyCreamStyleToUI(); game.drawOverlay(); game.drawScreenDimmer(18);
  const align = n => { n.getComponent(Widget)?.updateAlignment(); for (const child of n.children) align(child); }; align(game.node);
  return { game, cc };
}
module.exports = { build, cc, loadPlain };
