// Appearance changes operate on live world materials; these tests do not emulate a GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  static ZERO = new Vec3(); static ONE = new Vec3(1, 1, 1); static UP = new Vec3(0, 1, 0);
}
class Asset {
  destroys = 0;
  destroy() { this.destroys++; }
}
class Material extends Asset {
  properties = {};
  initialize(info) { this.info = info; }
  setProperty(key, value) { this.properties[key] = value; }
  getProperty(key) { return this.properties[key]; }
}
class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) { Object.assign(this, { r, g, b, a }); }
}
class MeshRenderer { setMaterial(material) { this.material = material; } }
class RigidBody {
  setLinearVelocity(value) { this.velocity = value; }
  setAngularVelocity(value) { this.angularVelocity = value; }
  wakeUp() {}
}
class BoxCollider {}
class Camera {
  static ProjectionType = { PERSPECTIVE: 0 };
  static ClearFlag = { SOLID_COLOR: 0, DEPTH_ONLY: 1 };
}
class Node {
  active = true; isValid = true; components = new Map(); children = []; position = new Vec3();
  constructor(name) { this.name = name; }
  addChild(node) { this.children.push(node); }
  addComponent(Type) { const c = new Type(); this.components.set(Type, c); return c; }
  getComponent(Type) { return this.components.get(Type); }
  getChildByName(name) { return this.children.find(child => child.name === name); }
  setPosition(x, y, z) { this.position = new Vec3(x, y, z); }
  setScale(x, y, z) { this.scale = new Vec3(x, y, z); }
  setRotationFromEuler() {} lookAt() {}
  destroy() { this.isValid = false; }
}
const cc = {
  BoxCollider, Camera, Color, DirectionalLight: class {}, Material, Mat4: class {}, MeshRenderer,
  Node, RigidBody, Vec3, ERigidBodyType: { STATIC: 0, KINEMATIC: 1, DYNAMIC: 2 },
  Layers: { BitMask: { DEFAULT: 1, UI_2D: 2, PROFILER: 4 } },
  PhysicsSystem: { instance: { enable: true } },
  view: { getVisibleSize: () => ({ width: 1280, height: 720 }) },
  primitives: { box: () => ({}) },
  utils: { createMesh: geometry => Object.assign(new Asset(), { geometry }) },
};
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = fs.readFileSync(path.join(__dirname, '../assets/scripts', name + '.ts'), 'utf8');
  const context = { exports: {}, require: id => id === 'cc' ? cc : load(id.slice(2)) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  } }).outputText, context);
  cache.set(name, context.exports);
  return context.exports;
}
const { StackWorld3D } = load('StackWorld3D');
const { CREAM_STYLE, CREAM_BRIGHT_WORLD, CREAM_BRIGHT_COLOR_SCALE } = load('CreamStyle');
function setup() {
  const canvas = new Node('Canvas'); canvas.scene = new Node('Scene');
  const world = new StackWorld3D(canvas, 0.62);
  const blocks = Array.from({ length: 8 }, (_, level) => ({ x: 0, z: 0, width: 5, depth: 5, level }));
  const moving = { ...blocks[0], level: 8 };
  world.sync(blocks, moving);
  return { world, blocks, moving, stage: world.worldRoot.getChildByName('CreamToyStage') };
}
const renderer = node => node.getChildByName('BlockVisual').getComponent(MeshRenderer);
const color = (material, rgb, alpha = 255) => assert.deepEqual(material.getProperty('mainColor'), new Color(...rgb, alpha));
const scale = (material, amount) => assert.deepEqual(material.getProperty('colorScale'), new Vec3(amount, amount, amount));

test('standard remains the original eight-color world, tray, and camera-clear background', () => {
  const { world, stage } = setup();
  try {
    for (const [index, material] of world.blockMaterials) {
      color(material, CREAM_STYLE.blockPalette[index]); scale(material, 1);
    }
    for (const [name, key] of [['TableShadow', 'stageShadow'], ['RoseTableEdge', 'tableEdge'],
      ['CreamTableTop', 'tableTop'], ['TowerPlinth', 'plinth'], ['ToyInlay-0', 'toyInlay']]) {
      const material = stage.getChildByName(name).getComponent(MeshRenderer).material;
      color(material, CREAM_STYLE[key]); scale(material, 1);
    }
    assert.deepEqual(world.camera.clearColor, new Color(...CREAM_STYLE.backgroundColor));
    assert.equal(world.backgroundRenderer.enabled, false);
    assert.equal(world.blockMesh.geometry.indices.length, 132);
  } finally { world.destroy(); }
});

test('bright switch updates live and pooled blocks and tray in place without affecting a drop or camera', () => {
  const { world, blocks, moving, stage } = setup();
  try {
    world.spawnFragment({ ...blocks[3], x: 3, width: 1 }, 'x', 1);
    world.beginDrop(moving, blocks[7]); world.pollDrop(0.02); world.setPaused(true);
    const materials = [...world.ownedMaterials, ...world.toyMaterials];
    const mesh = world.blockMesh, cameraPosition = world.cameraNode.position;
    const body = world.blockViews.get(world.droppingNode).body, elapsed = world.dropElapsed;
    const nodePositions = [...world.blockViews.keys()].map(node => node.position);
    const originalBindings = [...world.blockViews.values()].map(view => view.renderer.material);
    world.setAppearance('bright');
    for (const [index, material] of world.blockMaterials) {
      color(material, CREAM_BRIGHT_WORLD.blockPalette[index]); scale(material, CREAM_BRIGHT_COLOR_SCALE);
    }
    const tray = stage.getChildByName('CreamTableTop').getComponent(MeshRenderer).material;
    color(tray, CREAM_BRIGHT_WORLD.tableTop); scale(tray, CREAM_BRIGHT_COLOR_SCALE);
    color(stage.getChildByName('PastelToy-0').getComponent(MeshRenderer).material, CREAM_BRIGHT_WORLD.blockPalette[0]);
    for (let i = 0; i < 50; i++) { world.setAppearance('standard'); world.setAppearance('bright'); }
    assert.deepEqual([...world.ownedMaterials, ...world.toyMaterials], materials);
    assert.deepEqual([...world.blockViews.values()].map(view => view.renderer.material), originalBindings);
    assert.deepEqual([...world.blockViews.keys()].map(node => node.position), nodePositions);
    assert.equal(world.blockMesh, mesh); assert.equal(world.cameraNode.position, cameraPosition);
    assert.equal(world.blockViews.get(world.droppingNode).body, body);
    assert.equal(world.droppingBlock, moving); assert.equal(world.dropElapsed, elapsed);
    assert.equal(world.paused, true); assert.equal(cc.PhysicsSystem.instance.enable, false);
    assert.deepEqual(world.camera.clearColor, new Color(...CREAM_STYLE.backgroundColor));
    assert.equal(world.backgroundRenderer.enabled, false);
  } finally { world.destroy(); }
});

test('appearance updates cached fade colors and brightness while preserving opacity and hidden state', () => {
  const { world, blocks } = setup();
  try {
    world.spawnFragment({ ...blocks[0], x: 3, width: 1 }, 'x', 1);
    world.setPresentationOpacity(0.4);
    const node = world.blockNodes.get(blocks[0]), fade = renderer(node).material;
    const count = world.ownedMaterials.size;
    world.setAppearance('bright');
    assert.equal(renderer(node).material, fade);
    color(fade, CREAM_BRIGHT_WORLD.blockPalette[0], 102); scale(fade, CREAM_BRIGHT_COLOR_SCALE);
    world.setPresentationOpacity(0.2); color(fade, CREAM_BRIGHT_WORLD.blockPalette[0], 51);
    world.setPresentationOpacity(0); world.setAppearance('standard');
    color(fade, CREAM_STYLE.blockPalette[0], 0); scale(fade, 1);
    assert.equal(node.getChildByName('BlockVisual').active, false);
    world.setPresentationOpacity(0.5); color(fade, CREAM_STYLE.blockPalette[0], 128);
    assert.equal(world.ownedMaterials.size, count);
    world.setPresentationOpacity(1); world.setAppearance('bright'); world.setPresentationOpacity(0.5);
    color(fade, CREAM_BRIGHT_WORLD.blockPalette[0], 128); scale(fade, CREAM_BRIGHT_COLOR_SCALE);
  } finally { world.destroy(); }
});

test('bright survives reset and initializes new fade materials correctly; owned resources are released once', () => {
  const { world, blocks } = setup();
  world.setAppearance('bright'); world.reset(); world.sync(blocks, null);
  world.setPresentationOpacity(0.5);
  for (const block of blocks) {
    const material = renderer(world.blockNodes.get(block)).material;
    color(material, CREAM_BRIGHT_WORLD.blockPalette[block.level], 128);
    scale(material, CREAM_BRIGHT_COLOR_SCALE);
  }
  const resources = [...world.ownedMaterials, ...world.toyMaterials, world.blockMesh, world.backgroundRenderer.mesh];
  world.destroy();
  assert.ok(resources.every(resource => resource.destroys === 1));
  assert.equal(world.toyMaterialColors.size, 0);
});

test('vivid palette retains color separation and bright highlights after the Cocos HDR/ACES transform', () => {
  // Mirrors builtin-unlit and legacy/output-standard's RGB-square/ACES/sqrt
  // transform. This guards against a palette-only adjustment lost in tone mapping.
  const channel = (value, shade, multiplier) => {
    const c = (value / 255) ** 2 * shade ** 2 * multiplier;
    return Math.sqrt(c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14)) * 255;
  };
  for (const [index, rgb] of CREAM_BRIGHT_WORLD.blockPalette.entries()) {
    for (const shade of [0.74, 0.83, 1]) {
      const display = rgb.map(value => channel(value, shade, CREAM_BRIGHT_COLOR_SCALE));
      const original = CREAM_STYLE.blockPalette[index].map(value => channel(value, shade, 1));
      const chroma = values => Math.max(...values) - Math.min(...values);
      assert.ok(chroma(display) > chroma(original) + 15, 'vivid colors must not wash out to gray');
      assert.ok(Math.max(...display) > 220, 'lit color channel should remain bright');
    }
  }
  for (const key of ['tableTop', 'plinth']) {
    const display = CREAM_BRIGHT_WORLD[key].map(value => channel(value, 0.74, CREAM_BRIGHT_COLOR_SCALE));
    assert.ok(Math.min(...display) > 220, 'cream tray should stay luminous');
  }
});
