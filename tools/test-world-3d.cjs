// Controller regression tests with a small Cocos test double. These test event
// routing and resource ownership, not the Ammo solver or GPU rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
  static ZERO = new Vec3();
  static ONE = new Vec3(1, 1, 1);
  static UP = new Vec3(0, 1, 0);
}
class Asset {
  destroyed = false;
  destroy() { this.destroyed = true; }
}
class Material extends Asset {
  properties = {};
  initialize(info) { this.info = info; }
  setProperty(name, value) { this.properties[name] = value; }
  getProperty(name) { return this.properties[name]; }
}
class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) { Object.assign(this, { r, g, b, a }); }
  static WHITE = new Color();
}
class UIOpacity { opacity = 255; }
class Widget { enabled = true; isValid = true; updateAlignment() {} }
class MeshRenderer {
  setMaterial(material) { assert.equal(material.destroyed, false); this.material = material; }
}
class BoxCollider {
  events = new Map();
  on(name, callback, target) { this.events.set(name, { callback, target }); }
  off(name) { this.events.delete(name); }
  emit(name, other) {
    const event = this.events.get(name);
    if (event) event.callback.call(event.target, { otherCollider: other });
  }
}
class RigidBody {
  setLinearVelocity(value) { this.velocity = value; }
  setAngularVelocity(value) { this.angularVelocity = value; }
  wakeUp() {}
}
class Camera {
  static ProjectionType = { PERSPECTIVE: 0 };
  static ClearFlag = { SOLID_COLOR: 0, DEPTH_ONLY: 1 };
  camera = { update() {} };
  convertToUINode(pos) { return pos; }
  worldToScreen(pos) { return new Vec3(640 + pos.x * 50, 360 + pos.y * 50, 0.5); }
  screenToWorld(pos) { return new Vec3((pos.x - 640) * 2, (pos.y - 360) * 2, 0); }
}
class UITransform { convertToNodeSpaceAR(pos) { return pos; } }
class Node {
  active = true;
  isValid = true;
  components = new Map();
  children = [];
  position = new Vec3();
  constructor(name) { this.name = name; }
  addChild(node) { this.children.push(node); }
  addComponent(Type) { const c = new Type(); c.node = this; this.components.set(Type, c); return c; }
  getComponent(Type) { return this.components.get(Type); }
  getChildByName(name) { return this.children.find(c => c.name === name); }
  setPosition(x, y, z) { this.position = typeof x === 'object' ? new Vec3(x.x, x.y, x.z) : new Vec3(x, y, z); }
  setScale(x, y, z) { this.scale = new Vec3(x, y, z); }
  setRotationFromEuler() {}
  lookAt() {}
  destroy() { this.isValid = false; }
}
const cc = {
  sys: { isBrowser: false, localStorage: null },
  _decorator: { ccclass: () => Type => Type }, Component: class {},
  BoxCollider, Camera, Color, DirectionalLight: class {}, UIOpacity, Widget,
  Tween: { stopAllByTarget() {} },
  ERigidBodyType: { STATIC: 0, KINEMATIC: 1, DYNAMIC: 2 },
  Layers: { BitMask: { DEFAULT: 1, UI_2D: 2, PROFILER: 4 } },
  Material, Mesh: Asset, MeshRenderer, Node, RigidBody, UITransform, Vec3,
  KeyCode: {
    ENTER: 13, SPACE: 32, ESCAPE: 27,
    ARROW_LEFT: 37, ARROW_UP: 38, ARROW_RIGHT: 39, ARROW_DOWN: 40,
    KEY_A: 65, KEY_D: 68, KEY_K: 75, KEY_P: 80, KEY_R: 82,
    KEY_S: 83, KEY_T: 84, KEY_W: 87,
  },
  PhysicsSystem: { instance: { enable: true } },
  view: { getVisibleSize: () => ({ width: 750, height: 1334 }) },
  primitives: { box: () => ({ normals: [0, 1, 0, 1, 0, 0, 0, 0, 1] }) },
  utils: { createMesh: geometry => Object.assign(new Asset(), { geometry }) },
};
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/StackWorld3D.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
} }).outputText;
const sandbox = { exports: {}, require: id => { assert.equal(id, 'cc'); return cc; } };
vm.runInNewContext(compiled, sandbox);
const { StackWorld3D } = sandbox.exports;
const theme = { background: null, blockColors: [new Color(180, 220, 200)], materialTextures: [] };
function setup() {
  const canvas = new Node('Canvas'); canvas.scene = new Node('Scene');
  const world = new StackWorld3D(canvas, 0.62);
  const base = { x: 0, z: 0, width: 5, depth: 5, level: 0 };
  const moving = { ...base, level: 1 };
  world.setTheme(theme); world.sync([base], moving);
  return { world, base, moving };
}

test('cyber edges share assets, preserve colliders and hide when switching themes', () => {
  const { world, base, moving } = setup();
  const baseNode = world.blockNodes.get(base);
  const collider = baseNode.getComponent(BoxCollider);
  world.setTheme({ ...theme, outlineColor: {} });
  const edge = node => node.getChildByName('BlockVisual').getChildByName('ThemeOutline');
  const baseEdge = edge(baseNode);
  const movingEdge = edge(world.blockNodes.get(moving));
  assert.equal(baseEdge.active, true);
  assert.equal(baseEdge.getComponent(MeshRenderer).mesh, movingEdge.getComponent(MeshRenderer).mesh);
  assert.equal(baseNode.getComponent(BoxCollider), collider);
  const mesh = baseEdge.getComponent(MeshRenderer).mesh;
  assert.equal(mesh.geometry.indices.length, 12 * 36);
  assert.ok(mesh.geometry.positions.every(Number.isFinite));
  world.setTheme(theme);
  assert.equal(baseEdge.active, false);
  world.destroy();
  assert.equal(mesh.destroyed, true);
});

test('tower fades use shared transparent materials, include debris/edges and leave background and bodies intact', () => {
  const { world, base } = setup();
  world.setTheme({ ...theme, outlineColor: new Color(90, 245, 255) });
  world.spawnFragment({ ...base, x: 3, width: 1 }, 'x', 1);
  const baseNode = world.blockNodes.get(base);
  const collider = baseNode.getComponent(BoxCollider);
  const body = baseNode.getComponent(RigidBody);
  const visual = baseNode.getChildByName('BlockVisual');
  const renderer = visual.getComponent(MeshRenderer);
  const opaque = renderer.material;
  const background = world.backgroundRenderer.material;
  const originalPosition = baseNode.position;
  world.setPresentationOpacity(0.5);
  const fade = renderer.material;
  assert.equal(fade.info.technique, 1);
  assert.equal(fade.getProperty('mainColor').a, 128);
  assert.equal(visual.getChildByName('ThemeOutline').getComponent(MeshRenderer).material.getProperty('mainColor').a, 128);
  const fragment = [...world.looseNodes.keys()][0];
  assert.equal(fragment.getChildByName('BlockVisual').getComponent(MeshRenderer).material.info.technique, 1);
  const count = world.ownedMaterials.size;
  world.setPresentationOpacity(0.2);
  assert.equal(renderer.material, fade);
  assert.equal(world.ownedMaterials.size, count);
  assert.equal(world.backgroundRenderer.material, background);
  assert.equal(baseNode.getComponent(BoxCollider), collider);
  assert.equal(baseNode.getComponent(RigidBody), body);
  assert.equal(baseNode.position, originalPosition);
  world.setPresentationOpacity(0);
  assert.equal(visual.active, false);
  assert.equal(baseNode.active, true);
  assert.equal(fragment.getChildByName('BlockVisual').active, false);
  world.reset(); world.sync([base], null);
  assert.equal(world.blockNodes.get(base).getChildByName('BlockVisual').active, false);
  world.setPresentationOpacity(1);
  const incoming = world.blockNodes.get(base).getChildByName('BlockVisual');
  assert.equal(incoming.active, true);
  assert.equal(incoming.getComponent(MeshRenderer).material, opaque);
  assert.equal(opaque.getProperty('mainColor').a, 255);
  world.setPresentationOpacity(0.5);
  const retired = [...world.ownedMaterials];
  world.setTheme(theme);
  assert.ok(retired.every(m => m.destroyed));
  assert.equal(incoming.getComponent(MeshRenderer).material.getProperty('mainColor').a, 128);
  world.destroy();
  assert.equal(fade.destroyed, true);
});

test('only the intended support can resolve a drop, including a persistent contact', () => {
  const { world, base, moving } = setup();
  world.beginDrop(moving, base);
  const drop = world.dropCollider;
  const stray = new Node('StackBlock-0');
  drop.emit('onCollisionEnter', stray.addComponent(BoxCollider));
  assert.equal(world.pollDrop(0.1), null);
  drop.emit('onCollisionStay', world.blockNodes.get(base).getComponent(BoxCollider));
  assert.equal(world.pollDrop(0), 'landed');
  world.settle(moving);
  assert.equal(drop.events.size, 0);
  world.destroy();
});
test('a side contact below the target and a stalled drop do not award a landing', () => {
  const { world, base, moving } = setup();
  world.beginDrop(moving, base);
  world.droppingNode.setPosition(0, 0, 0);
  world.dropCollider.emit('onCollisionEnter', world.blockNodes.get(base).getComponent(BoxCollider));
  assert.equal(world.pollDrop(0.1), null);
  assert.equal(world.pollDrop(2), 'missed');
  world.destroy();
});
test('restart disables old colliders immediately and removes pending contact listeners', () => {
  const { world, base, moving } = setup();
  world.beginDrop(moving, base);
  const nodes = [...world.blockNodes.values()];
  const collider = world.dropCollider;
  world.setPaused(true);
  assert.equal(cc.PhysicsSystem.instance.enable, false);
  world.reset();
  assert.equal(cc.PhysicsSystem.instance.enable, true);
  assert.ok(nodes.every(n => !n.active));
  assert.equal(collider.events.size, 0);
  assert.equal(world.pollDrop(10), null);
  world.destroy();
});
test('theme changes release replaced materials and every block shares one mesh', () => {
  const { world, base, moving } = setup();
  const renderers = [...world.blockNodes.values()]
    .map(n => n.getChildByName('BlockVisual').getComponent(MeshRenderer));
  assert.equal(renderers[0].mesh, renderers[1].mesh);
  for (let i = 0; i < 25; i++) {
    const old = [...world.ownedMaterials];
    world.setTheme(theme);
    assert.ok(old.every(m => m.destroyed));
    assert.ok(renderers.every(r => !r.material.destroyed));
    assert.equal(world.ownedMaterials.size, 2);
  }
  world.destroy();
  assert.equal(renderers[0].mesh.destroyed, true);
});
test('decorated atlas uses separate top/side UVs and outward closed bevel faces', () => {
  const { world } = setup();
  for (let variant = 0; variant < 3; variant++) {
    const mesh = world.decoratedMeshes[variant].geometry;
    assert.equal(mesh.indices.length, 132);
    const edgeCounts = new Map();
    const vertex = i => mesh.positions.slice(i * 3, i * 3 + 3);
    for (let i = 0; i < mesh.positions.length / 3; i++) {
      const [u, v] = mesh.uvs.slice(i * 2, i * 2 + 2);
      assert.ok(u > variant / 3 && u < (variant + 1) / 3);
      assert.equal(v < 0.5, mesh.normals[i * 3 + 1] > 0.5);
      assert.ok(vertex(i).every(value => Math.abs(value) <= 0.5));
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const ids = mesh.indices.slice(i, i + 3);
      const [p, q, r] = ids.map(vertex);
      const a = q.map((v, j) => v - p[j]), b = r.map((v, j) => v - p[j]);
      const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      assert.ok(cross.reduce((sum, v, j) => sum + v * mesh.normals[ids[0]*3+j], 0) > 0);
      for (let j = 0; j < 3; j++) {
        const key = [vertex(ids[j]).join(','), vertex(ids[(j+1)%3]).join(',')].sort().join('|');
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      }
    }
    assert.ok([...edgeCounts.values()].every(count => count === 2));
  }
  const meshes = [...world.decoratedMeshes];
  world.destroy();
  assert.ok(meshes.every(mesh => mesh.destroyed));
});
test('decorated skins preserve image colors and restore classic meshes on switching back', () => {
  const { world, base, moving } = setup();
  const physical = world.blockNodes.get(moving);
  const renderer = physical.getChildByName('BlockVisual').getComponent(MeshRenderer);
  const originalScale = { ...physical.scale };
  const atlas = { texture: {} };
  world.setTheme({ ...theme, blockAtlas: atlas });
  assert.equal(renderer.mesh, world.decoratedMeshes[1]);
  assert.equal(renderer.material.properties.mainColor, cc.Color.WHITE);
  assert.equal(renderer.material.properties.mainTexture, atlas.texture);
  assert.deepEqual({ ...physical.scale }, originalScale);
  world.spawnFragment({ ...moving, width: 0.2 }, 'x', 1);
  const [loose] = world.looseNodes.keys();
  assert.equal(loose.getChildByName('BlockVisual').getComponent(MeshRenderer).mesh, world.decoratedMeshes[1]);
  world.setTheme(theme);
  assert.equal(renderer.mesh, world.blockMesh);
  assert.equal(loose.getChildByName('BlockVisual').getComponent(MeshRenderer).mesh, world.blockMesh);
  world.destroy();
});
test('perfect pulse scales only the visual child, freezes while paused, and settles', () => {
  const { world, base } = setup();
  const physical = world.blockNodes.get(base);
  const visual = physical.getChildByName('BlockVisual');
  const physicalScale = { ...physical.scale };
  world.pulsePerfect(base);
  assert.ok(visual.scale.x > 1);
  assert.deepEqual({ ...physical.scale }, physicalScale);

  world.setPaused(true);
  world.tick(0.12, 1, 0, 0);
  assert.equal(world.perfectPulses.get(physical), 0);
  const pausedScale = { ...visual.scale };
  world.tick(0.12, 1, 0, 0);
  assert.deepEqual({ ...visual.scale }, pausedScale);

  world.setPaused(false);
  world.tick(0.07, 1, 0, 0);
  assert.ok(visual.scale.x > 1.07);
  assert.deepEqual({ ...physical.scale }, physicalScale);
  world.tick(0.17, 1, 0, 0);
  assert.deepEqual({ ...visual.scale }, { x: 1, y: 1, z: 1 });
  assert.equal(world.perfectPulses.size, 0);
  world.destroy();
});
test('offscreen fragments expire even when they remain above the world floor', () => {
  const { world, moving } = setup();
  world.spawnFragment({ ...moving, level: 100 }, 'x', 1);
  const [fragment] = world.looseNodes.keys();
  world.tick(5.1, 100, 0, 0);
  assert.equal(world.looseNodes.size, 0);
  assert.equal(fragment.active, false);
  world.destroy();
});
test('effects use both cameras for a centered Canvas rather than adding half a viewport', () => {
  const canvas = new Node('Canvas'); canvas.scene = new Node('Scene');
  const camera = new Node('Camera'); camera.addComponent(Camera); canvas.addChild(camera);
  const effects = new Node('Effects'); effects.addComponent(UITransform);
  const world = new StackWorld3D(canvas, 0.62);
  const center = world.projectToUI(0, 0, 0, effects);
  assert.equal(center.x, 0);
  assert.equal(center.y, 0);
  const top = world.projectToUI(1, 0, 2, effects);
  assert.equal(top.x, 100);
  assert.equal(top.y, 124);
  world.destroy();
});

test('composition offset reframes menus without moving physical blocks', () => {
  const { world, base } = setup();
  const block = world.blockNodes.get(base);
  const originalBlockPosition = { ...block.position };
  world.setCompositionOffset(-3.2);
  assert.ok(Math.abs(world.cameraNode.position.x - 7.6) < 1e-9);
  assert.deepEqual({ ...block.position }, originalBlockPosition);
  world.setCompositionOffset(Number.NaN);
  assert.ok(Math.abs(world.cameraNode.position.x - 10.8) < 1e-9);
  world.destroy();
});

test('overview camera pulls back and targets the middle of the complete tower', () => {
  const { world, base } = setup();
  const blockPosition = { ...world.blockNodes.get(base).position };
  world.setOverview(19);
  world.tick(1, 19, 0, 0);
  assert.ok(Math.abs(world.cameraTargetY - 6.2) < 1e-9);
  assert.ok(world.cameraNode.position.x > 10.8);
  assert.ok(world.cameraNode.position.z > 13.6);
  assert.deepEqual({ ...world.blockNodes.get(base).position }, blockPosition);
  world.setOverview(null);
  world.tick(1, 19, 0, 0);
  assert.equal(world.overviewTopLevel, null);
  assert.ok(Math.abs(world.cameraNode.position.x - 10.8) < 1e-9);
  world.destroy();
});

test('overview backdrop moves behind the complete tower instead of hiding its lower blocks', () => {
  const { world } = setup();
  world.setOverview(27);
  world.tick(1, 27, 0, 0);
  const cameraDistance = Math.hypot(
    world.cameraNode.position.x,
    world.cameraNode.position.y - world.cameraCurrentY,
    world.cameraNode.position.z,
  );
  const backgroundDistance = -world.backgroundNode.position.z;
  assert.ok(backgroundDistance > cameraDistance);
  assert.ok(world.camera.far > backgroundDistance);

  world.setOverview(null);
  world.tick(1, 27, 0, 0);
  assert.equal(world.backgroundNode.position.z, -38);
  world.destroy();
});

test('paused resize and overview refresh backdrop coverage without a simulation tick', () => {
  const originalVisibleSize = cc.view.getVisibleSize;
  const { world, base } = setup();
  try {
    cc.view.getVisibleSize = () => ({ width: 390 / 844 * 1334, height: 1334 });
    world.setTheme({ ...theme, background: { texture: {}, rect: { width: 390, height: 844 } } });
    world.spawnFragment({ ...base, x: 3, width: 1 }, 'x', 1);
    const [fragment] = world.looseNodes.keys();
    const fragmentPosition = { ...fragment.position };
    const fragmentAge = world.looseNodes.get(fragment);
    const portraitScale = { ...world.backgroundNode.scale };
    const cameraCurrentY = world.cameraCurrentY;
    let pulseUpdates = 0;
    world.updatePerfectPulses = () => { pulseUpdates += 1; };
    world.setPaused(true);

    const assertCovered = () => {
      const visible = cc.view.getVisibleSize();
      const distance = -world.backgroundNode.position.z;
      const requiredHeight = 2 * distance * Math.tan(world.camera.fov * Math.PI / 360);
      assert.ok(world.backgroundNode.scale.y >= requiredHeight - 1e-8);
      assert.ok(world.backgroundNode.scale.x >= requiredHeight * visible.width / visible.height - 1e-8);
    };
    cc.view.getVisibleSize = () => ({ width: 1920 / 1080 * 1334, height: 1334 });
    world.setCompositionOffset(-4.3);
    assert.ok(world.backgroundNode.scale.x > portraitScale.x * 3, 'landscape immediately replaces the narrow portrait backdrop');
    assertCovered();

    world.setOverview(27);
    assert.ok(world.backgroundNode.position.z < -38, 'overview immediately moves the backdrop behind the tower');
    assertCovered();

    world.setTheme({ ...theme, background: { texture: {}, rect: { width: 1920, height: 1080 } } });
    assert.ok(Math.abs(world.backgroundNode.scale.x / world.backgroundNode.scale.y - 1920 / 1080) < 1e-8,
      'a new image aspect is applied even while paused');
    assertCovered();
    world.setOverview(null);
    assert.equal(world.backgroundNode.position.z, -38);
    assertCovered();

    assert.equal(cc.PhysicsSystem.instance.enable, false);
    assert.equal(world.paused, true);
    assert.equal(world.cameraCurrentY, cameraCurrentY, 'render-only refresh does not advance camera following');
    assert.equal(world.looseNodes.get(fragment), fragmentAge);
    assert.deepEqual({ ...fragment.position }, fragmentPosition);
    assert.equal(fragment.isValid, true);
    assert.equal(pulseUpdates, 0);
  } finally {
    cc.view.getVisibleSize = originalVisibleSize;
    world.destroy();
  }
});

test('first offcut separates outward on either axis and retains a physical upward kick', () => {
  for (const axis of ['x', 'z']) {
    for (const direction of [-1, 1]) {
      const { world, moving } = setup();
      const fragment = { ...moving, width: 0.2, depth: 0.2 };
      world.spawnFragment(fragment, axis, direction);
      const [node] = world.looseNodes.keys();
      const body = node.getComponent(RigidBody);
      assert.equal(node.position[axis], direction * 0.045);
      assert.equal(body.velocity[axis], direction * 3.2);
      assert.equal(body.velocity.y, 1.4);
      assert.equal(body.type, cc.ERigidBodyType.DYNAMIC);
      assert.equal(body.useGravity, true);
      world.destroy();
    }
  }
});

const gameSource = fs.readFileSync(path.join(__dirname, '../assets/scripts/StackGame.ts'), 'utf8');
const webTemplate = fs.readFileSync(path.join(__dirname, '../build-templates/web-mobile/index.html'), 'utf8');
const gameCompiled = ts.transpileModule(gameSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
} }).outputText;
function loadLayoutModule() {
  const runtime = { exports: {} };
  const layoutSource = fs.readFileSync(path.join(__dirname, '../assets/scripts/ProjectorLayout.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(layoutSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  } }).outputText, runtime);
  return runtime.exports;
}
const gameSandbox = { exports: {}, require: id => id === 'cc' ? cc
  : id === './ProjectorLayout' ? loadLayoutModule() : { StackWorld3D } };
vm.runInNewContext(gameCompiled, gameSandbox);
const GamePrototype = gameSandbox.exports.StackGame.prototype;

test('home button construction does not refresh focus before the start prompt exists', () => {
  const start = gameSource.indexOf('private buildHomeButtons');
  const end = gameSource.indexOf('private buildHomeOverlays', start);
  const buildHomeButtonsSource = gameSource.slice(start, end);
  assert.equal(buildHomeButtonsSource.includes('updateHomeMenuFocus()'), false);
  assert.ok(gameSource.includes('|| !this.startPromptLabel)'));
});

test('web startup cover prevents the engine clear color from flashing before the themed frame', () => {
  assert.match(webTemplate, /id="game-boot-cover"/);
  assert.match(webTemplate, /body\.game-ready #GameCanvas/);
  assert.match(webTemplate, /window\.addEventListener\('stack-game-ready'/);
  assert.match(gameSource, /window\.dispatchEvent\(new Event\('stack-game-ready'\)\)/);
  assert.match(gameSource, /this\.drawFrame\(\);\s*this\.notifyBrowserReady\(\);/);
});

test('home menu exposes default focus and remote direction, confirm, and back actions', () => {
  const game = Object.create(GamePrototype);
  let started = 0;
  let opened = '';
  let closed = 0;
  Object.assign(game, {
    phase: 'ready', homeTransition: null, homeOverlay: 'none', homeSelection: 0,
    heldKeys: new Set(), updateHomeMenuFocus() {}, drawFrame() {}, toggleTestMode() {},
    tryPrimaryAction() { started += 1; },
    openHomeOverlay(overlay) { opened = overlay; this.homeOverlay = overlay; },
    closeHomeOverlay() { closed += 1; this.homeOverlay = 'none'; },
  });

  game.handleKeyDownCode(cc.KeyCode.ARROW_DOWN);
  assert.equal(game.homeSelection, 1);
  game.heldKeys.delete(cc.KeyCode.ARROW_DOWN);
  game.handleKeyDownCode(23);
  assert.equal(opened, 'leaderboard');
  assert.equal(started, 0);
  game.heldKeys.delete(23);
  game.homeOverlay = 'settings';
  game.handleKeyDownCode(10009);
  assert.equal(closed, 1);

  game.heldKeys.delete(10009);
  game.homeSelection = 0;
  game.handleKeyDownCode(cc.KeyCode.ENTER);
  assert.equal(started, 1);
  game.handleKeyDownCode(66);
  assert.equal(started, 1);
});

test('skin menu uses one continuous vertical focus order including return home', () => {
  const game = Object.create(GamePrototype);
  Object.assign(game, { skinSelection: 0, updateSkinShopUI() {} });

  game.moveSkinSelection(0, -1);
  assert.equal(game.skinSelection, 1);
  game.moveSkinSelection(1, 0);
  assert.equal(game.skinSelection, 2);
  game.skinSelection = 6;
  game.moveSkinSelection(0, -1);
  assert.equal(game.skinSelection, 0);
  game.moveSkinSelection(0, 1);
  assert.equal(game.skinSelection, 6);
});

test('retained skin menu geometry keeps previews and text apart and respects legacy panel insets', () => {
  const horizontalGap = (leftCenter, leftWidth, rightCenter, rightWidth) =>
    rightCenter - rightWidth / 2 - (leftCenter + leftWidth / 2);
  const verticalGap = (upperCenter, upperHeight, lowerCenter, lowerHeight) =>
    upperCenter - upperHeight / 2 - (lowerCenter + lowerHeight / 2);

  assert.ok(horizontalGap(-205, 82, -15, 250) >= 16);
  assert.ok(horizontalGap(-205, 82, -5, 270) >= 16);
  assert.ok(verticalGap(545, 86, 450, 56) >= 16);
  // Live projector screen geometry is exercised through the actual controller
  // in test-home-layout.cjs, not asserted against retired coordinate literals.

  const game = Object.create(GamePrototype);
  Object.assign(game, { wideLayout: true, tvLayout: false, visibleWidth: 1400 });
  const panelCenter = game.panelCenterX();
  assert.ok(panelCenter - 610 / 2 >= -1400 / 2 + 24);
  game.wideLayout = false;
  assert.equal(game.panelCenterX(), 0);
});

test('pause, failure and result use a full-tower overview and share the projector composition breakpoint', () => {
  for (const [width, height, split] of [[1920, 1080, true], [1024, 768, true], [390, 844, false]]) {
    const composition = [];
    const overviews = [];
    const homePresentation = [];
    const game = Object.create(GamePrototype);
    Object.assign(game, {
      phase: 'falling', visibleWidth: width / height * 1334, visibleHeight: 1334, stack: [{ level: 12 }],
      world3D: {
        setHomePresentation(value) { homePresentation.push(value); },
        setCompositionOffset(value) { composition.push(value); },
        setOverview(value) { overviews.push(value); },
      },
    });
    for (const phase of ['ready', 'paused', 'falling', 'gameover', 'playing', 'dropping']) {
      game.phase = phase;
      game.updateWorldComposition();
    }
    const offset = split ? -4.3 : 0;
    assert.deepEqual(composition, [offset, offset, offset, offset, 0, 0], `${width}x${height}: active play is never side-shifted`);
    assert.deepEqual(overviews, [null, 12, 12, 12, null, null]);
    assert.deepEqual(homePresentation, [true, false, false, false, false, false]);
  }
});

test('home framing adds presentation space, survives reset, and restores gameplay camera exactly', () => {
  const { world } = setup();
  const gameplay = { ...world.cameraNode.position };
  world.setHomePresentation(true);
  const home = { ...world.cameraNode.position };
  assert.ok(Math.abs(home.z) > Math.abs(gameplay.z));
  world.setPresentationOpacity(0);
  world.reset();
  assert.equal(world.homePresentation, true);
  assert.equal(world.presentationOpacity, 0);
  assert.deepEqual({ ...world.cameraNode.position }, home);
  world.setHomePresentation(false);
  assert.deepEqual({ ...world.cameraNode.position }, gameplay);
  world.destroy();
});

test('perfect particles originate on the grown block contact perimeter, not its top', () => {
  const game = Object.create(GamePrototype);
  Object.assign(game, {
    sparks: [], rings: [],
    project(x, z, level) { return { x: (x - z) * 20, y: -(x + z) * 10 + level * 30 }; },
  });
  const block = { x: 1.3, z: -0.7, width: 4.62, depth: 3.12, level: 9, hue: 60 };
  game.spawnImpactFx(block, true, 4);
  assert.ok(game.sparks.length > 0);
  for (const spark of game.sparks) {
    assert.equal(spark.level, block.level);
    const dx = Math.abs(spark.worldX - block.x) / (block.width / 2);
    const dz = Math.abs(spark.worldZ - block.z) / (block.depth / 2);
    assert.ok(Math.abs(Math.max(dx, dz) - 1) < 1e-9);
    assert.ok(Math.abs(spark.worldX - block.x - block.width / 2) < 1e-9
      || Math.abs(spark.worldZ - block.z - block.depth / 2) < 1e-9);
  }
  game.sparks = [];
  game.spawnImpactFx(block, false);
  assert.ok(game.sparks.every(spark => spark.level === block.level + 1));
  assert.equal(game.rings[0].level, block.level + 1);
});

test('all perfect frame waves project to the contact plane, including reduced motion', () => {
  for (const reducedMotion of [false, true]) {
    const game = Object.create(GamePrototype);
    const heights = [];
    Object.assign(game, {
      reducedMotion, perfectFrames: [], sparks: [], rings: [], visibleWidth: 750,
      project(x, z, level) { heights.push(level); return { x: (x - z) * 20, y: (x + z) * 10 + level * 30 }; },
    });
    const block = { x: 1, z: 2, width: 5, depth: 4.8, level: 12, hue: 60 };
    game.spawnPerfectFrames(block, 8);
    const graphics = { clear() {}, moveTo() {}, lineTo() {}, close() {}, stroke() {} };
    for (const frame of game.perfectFrames) {
      frame.elapsed = frame.delay + 0.08;
      assert.equal(frame.fillAlpha, 0);
    }
    game.drawEffects(graphics);
    assert.ok(heights.length > 0);
    assert.ok(heights.every(level => level === block.level));
    heights.length = 0;
    game.topPoints(block);
    assert.ok(heights.every(level => level === block.level + 1));
  }
});

test('minimal layers interpolate through teal, lime, orange and cream without abrupt wrap', () => {
  const game = Object.create(GamePrototype);
  assert.deepEqual(Array.from(game.minimalLayerColor(16)), [174, 248, 124]);
  assert.deepEqual(Array.from(game.minimalLayerColor(40)), [255, 234, 201]);
  for (let level = 0; level < 128; level += 1) {
    const a = game.minimalLayerColor(level);
    const b = game.minimalLayerColor(level + 1);
    assert.ok(a.every((value, i) => Math.abs(value - b[i]) <= 23));
  }
});

test('sharp image blocks use six faces and per-layer tints without modifying colliders', () => {
  const { world, base, moving } = setup();
  const colors = [{ r: 30 }, { r: 50 }];
  const atlas = { texture: {} };
  world.setTheme({ ...theme, blockAtlas: atlas, blockAtlasOrder: [0], blockColors: colors, sharpEdges: true, tintAtlas: true });
  const node = world.blockNodes.get(base);
  const renderer = node.getChildByName('BlockVisual').getComponent(MeshRenderer);
  assert.equal(renderer.mesh.geometry.indices.length, 36);
  assert.equal(renderer.material.properties.mainTexture, atlas.texture);
  assert.equal(world.materialForLevel(0).properties.mainColor, colors[0]);
  assert.equal(world.materialForLevel(1).properties.mainColor, colors[1]);
  assert.equal(world.materialForLevel(2), world.materialForLevel(0));
  assert.equal(node.scale.x, base.width);
  assert.equal(node.scale.z, base.depth);
  world.setTheme({ ...theme, blockAtlas: atlas });
  assert.equal(renderer.mesh.geometry.indices.length, 132);
  assert.equal(renderer.material.properties.mainColor, cc.Color.WHITE);
  world.destroy();
});

function homeTransitionGame(phase = 'gameover', reducedMotion = false) {
  const game = Object.create(GamePrototype);
  let resets = 0;
  const pauses = [];
  const opacities = [];
  Object.assign(game, {
    phase, reducedMotion, restartLock: 0, homeTransition: null, coins: 64, homeOverlay: 'none',
    transitionViews: [], heldKeys: new Set(),
    world3D: { setPaused(value) { pauses.push(value); }, setPresentationOpacity(value) { opacities.push(value); } },
    transitionBlocker: { active: false }, effectsGraphics: { clear() {}, node: { active: true } },
    currentSkin: () => ({ visualStyle: 'minimal' }), drawScreenDimmer(alpha) { this.dimAlpha = alpha; },
    drawFrame() {},
    showReadyScreen() { resets += 1; this.setScreen('ready'); },
    setScreen(next, overlay = 'none') {
      this.phase = next; this.homeOverlay = overlay;
      this.startGroup.active = next === 'ready' && overlay === 'none';
      this.settingsGroup.active = overlay === 'settings';
      this.leaderboardGroup.active = overlay === 'leaderboard';
      this.pauseGroup.active = next === 'paused'; this.resultGroup.active = next === 'gameover';
      this.gameplayHudGroup.active = next !== 'ready';
      this.pauseButton.active = next === 'playing';
    },
  });
  for (const name of ['startGroup', 'settingsGroup', 'leaderboardGroup', 'pauseGroup', 'resultGroup', 'gameplayHudGroup', 'pauseButton']) {
    game[name] = new Node(name); game[name].addComponent(Widget);
  }
  game.testModeBadgeLabel = { node: new Node('TestBadge') };
  game.perfectLabel = { node: new Node('Perfect') };
  game.testModeBadgeLabel.node.active = game.perfectLabel.node.active = false;
  game.setScreen(phase);
  return { game, pauses, opacities, resetCount: () => resets };
}

test('home return fades the tower, resets once while invisible and blocks repeated input', () => {
  for (const phase of ['gameover', 'paused']) {
    const { game, pauses, opacities, resetCount } = homeTransitionGame(phase);
    game.returnToHome();
    const transition = game.homeTransition;
    game.returnToHome();
    assert.equal(game.homeTransition, transition);
    assert.deepEqual(pauses, [true]);
    assert.equal(game.consumeActionDebounce(), false);
    game.updateHomeTransition(0.05);
    assert.ok(opacities.at(-1) > 0 && opacities.at(-1) < 1);
    assert.equal(resetCount(), 0);
    game.updateHomeTransition(0.05);
    assert.equal(resetCount(), 1);
    assert.equal(opacities.at(-1), 0);
    assert.equal(game.startGroup.getComponent(UIOpacity).opacity, 0);
    assert.equal(game.startGroup.position.x, -24);
    game.updateHomeTransition(0.08);
    assert.ok(opacities.at(-1) > 0 && opacities.at(-1) < 1);
    game.updateHomeTransition(0.081);
    assert.equal(game.homeTransition, null);
    assert.equal(game.transitionBlocker.active, false);
    assert.equal(game.startGroup.position.x, 0);
    assert.equal(game.startGroup.getComponent(Widget).enabled, true);
    assert.equal(game.startGroup.getComponent(UIOpacity).opacity, 255);
    assert.equal(game.phase, 'ready');
    assert.equal(resetCount(), 1);
    assert.equal(game.coins, 64);
  }
});

test('reduced motion skips home fade and large frame steps still complete exactly once', () => {
  const reduced = homeTransitionGame('gameover', true);
  reduced.game.returnToHome();
  assert.equal(reduced.game.homeTransition, null);
  assert.equal(reduced.resetCount(), 1);
  const delayed = homeTransitionGame();
  delayed.game.returnToHome();
  delayed.game.updateHomeTransition(4);
  assert.equal(delayed.resetCount(), 1);
  assert.equal(delayed.game.homeTransition, null);
  const playing = homeTransitionGame('playing');
  playing.game.returnToHome();
  assert.equal(playing.resetCount(), 0);
  assert.equal(playing.game.homeTransition, null);
});

test('starting a round waits for the tower fade and resumes physics only after reveal', () => {
  const { game, pauses, opacities } = homeTransitionGame('ready');
  let starts = 0;
  Object.assign(game, { audioReady:true, homeOverlay:'none', updateAudioPrompt() {},
    startGameImmediately() { assert.equal(opacities.at(-1), 0); starts += 1; this.setScreen('playing'); this.world3D.setPaused(false); } });
  game.startGame(); game.startGame();
  assert.equal(starts, 0);
  game.updateHomeTransition(0.1);
  assert.equal(starts, 1);
  assert.equal(pauses[pauses.length - 1], true);
  assert.equal(game.consumeActionDebounce(), false);
  game.updateHomeTransition(0.16);
  assert.equal(pauses[pauses.length - 1], false);
  assert.equal(game.homeTransition, null);
});

test('menu opening and closing use one guarded transition and reduced motion skips it', () => {
  const { game, opacities } = homeTransitionGame('ready');
  Object.assign(game, { homeOverlay:'none',
    openHomeOverlayImmediately(overlay) { this.setScreen('ready', overlay); },
    closeHomeOverlayImmediately() { this.setScreen('ready'); } });
  game.openHomeOverlay('leaderboard');
  game.openHomeOverlay('settings');
  assert.equal(game.homeOverlay, 'none');
  game.updateHomeTransition(0.05);
  assert.ok(game.startGroup.position.x < 0);
  assert.ok(game.dimAlpha >= 18 && game.dimAlpha <= 51);
  game.updateHomeTransition(0.05);
  assert.equal(game.leaderboardGroup.position.x, 24);
  assert.equal(opacities.length, 0, 'menu changes must not fade/reset the tower');
  game.updateHomeTransition(0.16);
  assert.equal(game.homeOverlay, 'leaderboard');
  assert.equal(game.homeTransition, null);
  game.closeHomeOverlay();
  assert.equal(game.homeOverlay, 'leaderboard');
  game.updateHomeTransition(0.32);
  assert.equal(game.homeOverlay, 'none');
  game.reducedMotion=true;
  game.openHomeOverlay('settings');
  assert.equal(game.homeOverlay, 'settings');
  assert.equal(game.homeTransition, null);
});

test('backgrounding during start leaves the revealed round paused', () => {
  const { game } = homeTransitionGame('ready');
  Object.assign(game, { heldKeys:new Set([13]), pauseGame() { this.phase='paused'; } });
  game.beginScreenTransition(() => { game.phase='playing'; });
  game.onGameHide();
  assert.equal(game.heldKeys.size, 0);
  assert.equal(game.homeTransition, null, 'backgrounding must settle immediately rather than waiting for another frame');
  game.updateHomeTransition(1);
  assert.equal(game.phase, 'paused');
  assert.equal(game.homeTransition, null);
});

test('resize settles navigation before layout and remote keys pressed in transition remain held', () => {
  const { game } = homeTransitionGame('ready');
  game.beginScreenTransition(() => game.setScreen('playing'));
  game.handleKeyDownCode(13);
  assert.equal(game.heldKeys.has(13), true);
  game.resizeStage = () => {
    assert.equal(game.homeTransition, null);
    assert.equal(game.startGroup.position.x, 0);
    assert.equal(game.startGroup.getComponent(Widget).enabled, true);
  };
  game.onCanvasResize();
  game.handleKeyDownCode(13); // Would reach gameplay on a leaked held key.
  assert.equal(game.heldKeys.has(13), true);
});

test('all theme transitions cap the dimmer and restore complete panel opacity/anchors', () => {
  for (const skin of ['minimal-stack', 'classic', 'cyber-neon', 'porcelain-moon', 'pastel-toy', 'nature-zen']) {
    const { game } = homeTransitionGame('ready');
    delete game.currentSkin;
    game.selectedSkinId = skin;
    game.beginScreenTransition(() => game.setScreen('ready', 'settings'), 'menu-open');
    for (let i = 0; i < 27; i++) {
      game.updateHomeTransition(0.01);
      assert.ok(game.dimAlpha >= 0 && game.dimAlpha <= 51, skin);
    }
    assert.equal(game.settingsGroup.getComponent(UIOpacity).opacity, 255, skin);
    assert.equal(game.settingsGroup.position.x, 0, skin);
    assert.equal(game.settingsGroup.getComponent(Widget).enabled, true, skin);
  }
});

test('navigation has no full-screen cover renderer and panels own backgrounds with their content', () => {
  assert.doesNotMatch(gameSource, /transitionGraphics|drawHomeTransition|animateMenuEntrance/);
  for (const group of ['startGroup', 'pauseGroup', 'resultGroup']) {
    assert.ok(gameSource.includes(`this.${group}.addComponent(Graphics)`), group);
  }
  const backdrop = gameSource.slice(gameSource.indexOf('private drawOverlayBackdrop'), gameSource.indexOf('private drawOverlayButton'));
  assert.doesNotMatch(backdrop, /graphics\.rect\(/, 'modal panel must not carry a full-screen moving dimmer');
});

function loadSkinSave(entries = {}) {
  const values = new Map(Object.entries(entries));
  cc.sys.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
  const game = Object.create(GamePrototype);
  game.loadSettings();
  return { game, values };
}

test('new players start with the free minimal theme and 100 coins', () => {
  const { game } = loadSkinSave();
  assert.equal(game.selectedSkinId, 'minimal-stack');
  assert.deepEqual(Array.from(game.ownedSkins), ['minimal-stack', 'classic']);
  assert.equal(game.coins, 100);
});

test('adding the free theme preserves existing purchases, selection and coin balance', () => {
  for (const selected of ['classic', 'nature-zen']) {
    const { game, values } = loadSkinSave({
      'wxstack-selected-skin': selected,
      'wxstack-owned-skins': JSON.stringify(['classic', 'nature-zen']),
      'wxstack-coins': '46', 'wxstack-initial-coins-v1': '1',
      'wxstack-best-score': '28',
    });
    assert.equal(game.selectedSkinId, selected);
    assert.equal(game.coins, 46);
    assert.equal(game.bestScore, 28);
    assert.ok(game.ownedSkins.has('minimal-stack'));
    assert.ok(game.ownedSkins.has('nature-zen'));
    game.saveEconomy();
    assert.equal(values.get('wxstack-selected-skin'), selected);
    assert.ok(JSON.parse(values.get('wxstack-owned-skins')).includes('minimal-stack'));
  }
});

test('legacy skin migration still works and unknown selections fall back to minimal', () => {
  const { game } = loadSkinSave({
    'wxstack-selected-skin': 'sunset',
    'wxstack-owned-skins': '["sunset"]',
  });
  assert.equal(game.selectedSkinId, 'cyber-neon');
  assert.ok(game.ownedSkins.has('cyber-neon'));
  assert.equal(loadSkinSave({ 'wxstack-selected-skin': 'unknown' }).game.selectedSkinId, 'minimal-stack');
});

test('consecutive perfects grow both dimensions from streak two and cap at the base size', () => {
  const game = Object.create(GamePrototype);
  const block = { x: 0, z: 0, width: 4.5, depth: 4.7, level: 1, hue: 60 };
  game.perfectStreak = 1;
  assert.equal(game.growPerfectBlock(block), false);
  assert.equal(block.width, 4.5);
  assert.equal(block.depth, 4.7);

  game.perfectStreak = 2;
  assert.equal(game.growPerfectBlock(block), true);
  assert.equal(block.width, 4.62);
  assert.equal(block.depth, 4.82);
  for (let streak = 3; streak <= 20; streak += 1) {
    game.perfectStreak = streak;
    game.growPerfectBlock(block);
  }
  assert.equal(block.width, 5);
  assert.equal(block.depth, 5);
  assert.equal(game.growPerfectBlock(block), false);

  game.perfectToneStep = 7;
  game.resetPerfectChain();
  assert.equal(game.perfectStreak, 0);
  assert.equal(game.perfectToneStep, 0);
});

test('reduced motion suppresses only the perfect visual pulse', () => {
  for (const reducedMotion of [false, true]) {
    let pulses = 0;
    let particles = 0;
    const game = Object.create(GamePrototype);
    Object.assign(game, {
      reducedMotion, roundPerfectCount: 0, perfectStreak: 2, flashAlpha: 0,
      world3D: { pulsePerfect() { pulses += 1; } },
      perfectFeedbackEnergy() { return 2; }, playPerfectTone() {}, addTrauma() {},
      spawnImpactFx() { particles += 1; }, spawnPerfectFrames() {}, showPerfectText() {},
    });
    game.handlePerfectPlacement({ x: 0, z: 0, width: 5, depth: 5, level: 1, hue: 60 });
    assert.equal(pulses, reducedMotion ? 0 : 1);
    assert.equal(particles, reducedMotion ? 0 : 1);
    assert.equal(game.roundPerfectCount, 1);
  }
});

test('first cut conserves width/depth and settles before spawning debris without a seam overlay', () => {
  assert.equal(gameSource.includes('cutSeams'), false);
  assert.equal(gameSource.includes('spawnCutFeedback'), false);
  for (const axis of ['x', 'z']) {
    for (const delta of [-1.5, 1.5]) {
      const base = { x: 0, z: 0, width: 5, depth: 5, level: 0, hue: 60 };
      const placed = { ...base, [axis]: delta, level: 1 };
      const game = Object.create(GamePrototype);
      const calls = [];
      let offcut;
      Object.assign(game, {
        current: placed, stack: [base], phase: 'dropping', moveAxis: axis,
        testModeEnabled: false, reducedMotion: true, fallingPieces: [], score: 0,
        resetPerfectChain() {}, addTrauma() {}, playCutSound() {}, setScore() {},
        world3D: {
          settle(block) { calls.push('settle'); assert.equal(block[axis === 'x' ? 'width' : 'depth'], 3.5); },
          spawnFragment(fragment) { calls.push('fragment'); offcut = fragment; },
        },
      });
      game.resolveCurrentBlockLanding();
      assert.deepEqual(calls, ['settle', 'fragment']);
      const dimension = axis === 'x' ? 'width' : 'depth';
      assert.equal(placed[dimension] + offcut[dimension], 5);
      assert.equal(game.spawnDelay, 0.24);
    }
  }
});
