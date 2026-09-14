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
  _decorator: { ccclass: () => Type => Type }, Component: class { schedule() {} unschedule() {} },
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
const { CREAM_STYLE } = loadPlainModule('CreamStyle');
const sandbox = { exports: {}, require: id => {
  if (id === './CreamStyle') return { CREAM_STYLE };
  assert.equal(id, 'cc'); return cc;
} };
vm.runInNewContext(compiled, sandbox);
const { StackWorld3D } = sandbox.exports;
function setup() {
  const canvas = new Node('Canvas'); canvas.scene = new Node('Scene');
  const world = new StackWorld3D(canvas, 0.62);
  const base = { x: 0, z: 0, width: 5, depth: 5, level: 0 };
  const moving = { ...base, level: 1 };
  world.sync([base], moving);
  return { world, base, moving };
}

test('a newly constructed world binds the cream background before exposing the first frame', () => {
  const canvas = new Node('Canvas'); canvas.scene = new Node('Scene');
  const world = new StackWorld3D(canvas, 0.62);
  try {
    assert.equal(world.backgroundNode.active, true);
    const background = world.backgroundRenderer.material;
    assert.ok(background);
    assert.equal(background.destroyed, false);
    assert.deepEqual(background.properties.mainColor, new Color(...CREAM_STYLE.backgroundColor));
    assert.equal(background.properties.mainTexture, undefined);
    assert.equal(world.worldRoot.getChildByName('CreamToyStage').active, true);
    assert.equal(typeof world.setTheme, 'undefined');
  } finally {
    world.destroy();
  }
});



test('tower fades reuse transparent cream materials for debris and preserve background and physics', () => {
  const { world, base } = setup();
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
  const fragment = [...world.looseNodes.keys()][0];
  assert.equal(fragment.getChildByName('BlockVisual').getComponent(MeshRenderer).material, fade);
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
  assert.equal(incoming.getComponent(MeshRenderer).material, fade);
  const materials = [...world.ownedMaterials, ...world.toyMaterials];
  world.destroy();
  assert.ok(materials.every(material => material.destroyed));
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
test('cream blocks share one bevel mesh and eight persistent palette materials across restarts', () => {
  const { world, base } = setup();
  const blocks = Array.from({ length: 24 }, (_, level) => ({ ...base, level }));
  world.sync(blocks, null);
  const renderers = blocks.map(block => world.blockNodes.get(block).getChildByName('BlockVisual').getComponent(MeshRenderer));
  assert.ok(renderers.every(renderer => renderer.mesh === world.blockMesh));
  assert.equal(new Set(renderers.map(renderer => renderer.material)).size, 8);
  for (let index = 0; index < 24; index += 1) {
    assert.deepEqual(renderers[index].material.getProperty('mainColor'), new Color(...CREAM_STYLE.blockPalette[index % 8]));
    assert.equal(renderers[index].material.getProperty('mainTexture'), undefined);
  }
  const materials = [...world.ownedMaterials];
  for (let i = 0; i < 25; i += 1) {
    world.reset();
    world.sync(blocks, null);
    assert.deepEqual([...world.ownedMaterials], materials);
    assert.ok(materials.every(material => !material.destroyed));
  }
  const meshes = [world.blockMesh, world.backgroundRenderer.mesh];
  const stageMaterials = [...world.toyMaterials];
  world.destroy();
  assert.ok(materials.concat(stageMaterials).every(material => material.destroyed));
  assert.ok(meshes.every(mesh => mesh.destroyed));
});

test('cream bevel geometry stays within the physics footprint and has closed outward faces', () => {
  const { world } = setup();
  const mesh = world.blockMesh.geometry;
  assert.equal(mesh.indices.length, 132);
  const edgeCounts = new Map();
  const vertex = i => mesh.positions.slice(i * 3, i * 3 + 3);
  for (let i = 0; i < mesh.positions.length / 3; i += 1) {
    assert.ok(vertex(i).every(value => Number.isFinite(value) && Math.abs(value) <= 0.5));
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3);
    const [p, q, r] = ids.map(vertex);
    const a = q.map((v, j) => v - p[j]), b = r.map((v, j) => v - p[j]);
    const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    assert.ok(cross.reduce((sum, v, j) => sum + v * mesh.normals[ids[0]*3+j], 0) > 0);
    for (let j = 0; j < 3; j += 1) {
      const key = [vertex(ids[j]).join(','), vertex(ids[(j+1)%3]).join(',')].sort().join('|');
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    }
  }
  assert.ok([...edgeCounts.values()].every(count => count === 2));
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
  const originalCameraX = world.cameraNode.position.x;
  world.setCompositionOffset(-3.2);
  assert.ok(Math.abs(world.cameraNode.position.x - (originalCameraX - 3.2)) < 1e-9);
  assert.deepEqual({ ...block.position }, originalBlockPosition);
  world.setCompositionOffset(Number.NaN);
  assert.ok(Math.abs(world.cameraNode.position.x - originalCameraX) < 1e-9);
  world.destroy();
});

test('overview camera pulls back and targets the middle of the complete tower', () => {
  const { world, base } = setup();
  const blockPosition = { ...world.blockNodes.get(base).position };
  const originalCamera = { ...world.cameraNode.position };
  world.setOverview(19);
  world.tick(1, 19, 0, 0);
  assert.ok(Math.abs(world.cameraTargetY - 6.2) < 1e-9);
  assert.ok(world.cameraNode.position.x > originalCamera.x);
  assert.ok(world.cameraNode.position.z > originalCamera.z);
  assert.deepEqual({ ...world.blockNodes.get(base).position }, blockPosition);
  world.setOverview(null);
  world.tick(1, 19, 0, 0);
  assert.equal(world.overviewTopLevel, null);
  assert.ok(Math.abs(world.cameraNode.position.x - originalCamera.x) < 1e-9);
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
    world.setCompositionOffset(0);
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
function loadPlainModule(name) {
  const runtime = { exports: {}, require: id => { assert.equal(id, 'cc'); return cc; } };
  const moduleSource = fs.readFileSync(path.join(__dirname, `../assets/scripts/${name}.ts`), 'utf8');
  vm.runInNewContext(ts.transpileModule(moduleSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  } }).outputText, runtime);
  return runtime.exports;
}
const loadLayoutModule = () => loadPlainModule('ProjectorLayout');
const leaderboardData = loadPlainModule('Leaderboard');
const gameSandbox = { exports: {}, require: id => id === 'cc' ? cc
  : id === './ProjectorLayout' ? loadLayoutModule()
  : id === './Leaderboard' ? leaderboardData
  : id === './ReviveClient' ? loadPlainModule('ReviveClient')
  : id === './Stamina' ? loadPlainModule('Stamina')
  : id === './CreamStyle' ? { CREAM_STYLE }
  : id === './RemoteInput' ? loadPlainModule('RemoteInput') : { StackWorld3D },
  navigator: { userAgent: 'test-browser' } };
vm.runInNewContext(gameCompiled, gameSandbox);
const GamePrototype = gameSandbox.exports.StackGame.prototype;

function buildInitialWorld(game = new gameSandbox.exports.StackGame()) {
  game.node = new Node('Canvas');
  game.node.scene = new Node('Scene');
  const reachedUI = new Error('initial world construction completed');
  // Execute the real buildStage prefix, stopping at its first 2D UI node. No
  // asset callback or rendering hook has run at this point.
  game.makeNode = name => {
    assert.equal(name, 'StackRenderer');
    throw reachedUI;
  };
  try {
    assert.throws(() => game.buildStage(), error => error === reachedUI);
  } catch (error) {
    game.world3D?.destroy();
    throw error;
  }
  return game;
}

test('the controller creates a complete cream world before building its 2D interface', () => {
  const game = buildInitialWorld();
  const world = game.world3D;
  try {
    assert.equal(world.backgroundNode.active, true);
    const background = world.backgroundRenderer.material;
    assert.equal(background.destroyed, false);
    assert.deepEqual(background.properties.mainColor, new Color(...CREAM_STYLE.backgroundColor));
    assert.equal(background.properties.mainTexture, undefined);
    assert.equal(world.worldRoot.getChildByName('CreamToyStage').active, true);
  } finally {
    world.destroy();
  }
});

test('browser readiness follows the completed home setup and two draws, without any skin image request', () => {
  const original = { isBrowser: cc.sys.isBrowser, director: cc.director, Director: cc.Director,
    profiler: cc.profiler, ResolutionPolicy: cc.ResolutionPolicy, resources: cc.resources,
    setDesignResolutionSize: cc.view.setDesignResolutionSize, localStorage: cc.sys.localStorage };
  const draws = [];
  const requests = [];
  const events = [];
  const order = [];
  const game = new gameSandbox.exports.StackGame();
  Object.assign(game, { isValid: true, bestScore: 0,
    initializeAudio() {}, loadSettings() {},
    buildStage() { order.push('stage'); }, resizeStage() { order.push('resize'); },
    showReadyScreen() { order.push('home'); },
  });
  cc.sys.isBrowser = true;
  cc.sys.localStorage = { getItem: () => null, setItem() {} };
  cc.Director = { EVENT_AFTER_DRAW: 'after-draw' };
  cc.director = { once(event, callback) {
    assert.equal(event, 'after-draw');
    assert.deepEqual(order, ['stage', 'resize', 'home']);
    draws.push(callback);
  } };
  cc.profiler = { hideStats() {} };
  cc.ResolutionPolicy = { FIXED_HEIGHT: 0 };
  cc.view.setDesignResolutionSize = () => {};
  cc.resources = { load(name) { requests.push(name); } };
  gameSandbox.window = { dispatchEvent(event) { events.push(event.type); } };
  gameSandbox.Event = class { constructor(type) { this.type = type; } };
  try {
    game.onLoad();
    assert.equal(events.length, 0);
    assert.equal(draws.length, 1);
    draws.shift()();
    assert.equal(events.length, 0);
    assert.equal(draws.length, 1);
    draws.shift()();
    assert.deepEqual(events, ['stack-game-ready']);
    game.notifyBrowserReady();
    assert.equal(draws.length, 0, 'repeated requests cannot schedule another ready event');
    assert.deepEqual(requests, []);
    assert.doesNotMatch(gameSource, /resources\.load\(|skins\/|blockAtlases|skinBackgrounds|loadThemeBackgrounds/);
  } finally {
    cc.sys.isBrowser = original.isBrowser;
    cc.sys.localStorage = original.localStorage;
    cc.view.setDesignResolutionSize = original.setDesignResolutionSize;
    for (const key of ['director', 'Director', 'profiler', 'ResolutionPolicy', 'resources']) {
      if (original[key] === undefined) delete cc[key]; else cc[key] = original[key];
    }
    delete gameSandbox.window;
    delete gameSandbox.Event;
  }
});

test('browser readiness is cancelled for a destroyed controller and omitted outside browsers', () => {
  const originalBrowser = cc.sys.isBrowser;
  const originalDirector = cc.director;
  const originalDirectorType = cc.Director;
  const draws = [];
  const events = [];
  cc.Director = { EVENT_AFTER_DRAW: 'after-draw' };
  cc.director = { once(event, callback) { draws.push(callback); } };
  gameSandbox.window = { dispatchEvent(event) { events.push(event); } };
  gameSandbox.Event = class {};
  try {
    const game = new gameSandbox.exports.StackGame();
    game.isValid = true;
    cc.sys.isBrowser = false;
    game.notifyBrowserReady();
    assert.equal(draws.length, 0);
    cc.sys.isBrowser = true;
    game.notifyBrowserReady();
    draws.shift()();
    game.isValid = false;
    draws.shift()();
    assert.deepEqual(events, []);
  } finally {
    cc.sys.isBrowser = originalBrowser;
    if (originalDirector === undefined) delete cc.director; else cc.director = originalDirector;
    if (originalDirectorType === undefined) delete cc.Director; else cc.Director = originalDirectorType;
    delete gameSandbox.window;
    delete gameSandbox.Event;
  }
});

test('home button construction does not refresh focus before the start prompt exists', () => {
  const start = gameSource.indexOf('private buildHomeButtons');
  const end = gameSource.indexOf('private buildHomeOverlays', start);
  const buildHomeButtonsSource = gameSource.slice(start, end);
  assert.equal(buildHomeButtonsSource.includes('updateHomeMenuFocus()'), false);
  assert.ok(gameSource.includes('|| !this.startPromptLabel)'));
});

test('web startup cover prevents the engine clear color from flashing before the cream frame', () => {
  assert.match(webTemplate, /id="game-boot-cover"/);
  assert.match(webTemplate, /body\.game-ready #GameCanvas/);
  assert.match(webTemplate, /window\.addEventListener\('stack-game-ready'/);
  assert.match(gameSource, /window\.dispatchEvent\(new Event\('stack-game-ready'\)\)/);
  assert.match(gameSource, /this\.showReadyScreen\(\);\s*this\.notifyBrowserReady\(\);/);
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

function leaderboardInputGame() {
  const game = Object.create(GamePrototype);
  const opened = [];
  const pages = [];
  Object.assign(game, {
    phase: 'ready', homeTransition: null, homeOverlay: 'none', homeSelection: 0,
    heldKeys: new Set(), updateHomeMenuFocus() {}, drawFrame() {},
    openHomeOverlay(overlay) { opened.push(overlay); this.homeOverlay = overlay; },
    closeHomeOverlay() { this.homeOverlay = 'none'; },
    changeLeaderboardPage(direction) { pages.push(direction); },
  });
  return { game, opened, pages };
}

function gamepadEvent(x = 0, y = 0, useStick = false) {
  const zeroButton = { getValue: () => 0 };
  return { gamepad: {
    buttonSouth: zeroButton, buttonOptions: zeroButton, buttonNorth: zeroButton,
    buttonEast: zeroButton, buttonWest: zeroButton,
    dpad: { getValue: () => ({ x: useStick ? 0 : x, y: useStick ? 0 : y }) },
    leftStick: { getValue: () => ({ x: useStick ? x : 0, y: useStick ? y : 0 }) },
  } };
}

test('home Right, D and K open the leaderboard directly from any selection without a second confirm', () => {
  for (const key of [cc.KeyCode.ARROW_RIGHT, cc.KeyCode.KEY_D, cc.KeyCode.KEY_K]) {
    for (const selection of [0, 1, 2]) {
      const { game, opened, pages } = leaderboardInputGame();
      game.homeSelection = selection;
      game.handleKeyDownCode(key);
      assert.deepEqual(opened, ['leaderboard']);
      assert.equal(game.homeSelection, 1, 'return focus belongs to the leaderboard button');
      game.handleKeyDownCode(key);
      assert.deepEqual(pages, [], 'holding the opening key must not immediately turn a page');
      game.heldKeys.delete(key);
      game.handleKeyDownCode(cc.KeyCode.ESCAPE);
      assert.equal(game.homeOverlay, 'none');
      assert.equal(game.homeSelection, 1);
    }
  }
});

test('home vertical and left navigation retain their three-item wrap order', () => {
  const { game, opened } = leaderboardInputGame();
  for (const key of [cc.KeyCode.ARROW_DOWN, cc.KeyCode.KEY_S, cc.KeyCode.ARROW_DOWN]) {
    game.heldKeys.delete(key);
    game.handleKeyDownCode(key);
  }
  assert.equal(game.homeSelection, 0);
  for (const key of [cc.KeyCode.ARROW_UP, cc.KeyCode.KEY_W, cc.KeyCode.ARROW_LEFT, cc.KeyCode.KEY_A]) {
    const previous = game.homeSelection;
    game.handleKeyDownCode(key);
    assert.equal(game.homeSelection, (previous + 2) % 3);
  }
  assert.deepEqual(opened, []);
});

test('right gamepad d-pad and stick open the leaderboard once, while a fresh horizontal input pages it', () => {
  for (const useStick of [false, true]) {
    const { game, opened, pages } = leaderboardInputGame();
    game.homeSelection = 2;
    game.onGamepadInput(gamepadEvent(1, 0, useStick));
    assert.deepEqual(opened, ['leaderboard']);
    assert.equal(game.homeSelection, 1);
    game.onGamepadInput(gamepadEvent(1, 0, useStick));
    assert.deepEqual(pages, [], 'a held axis does not leak into paging');
    game.onGamepadInput(gamepadEvent());
    game.onGamepadInput(gamepadEvent(1, 0, useStick));
    game.onGamepadInput(gamepadEvent());
    game.onGamepadInput(gamepadEvent(-1, 0, useStick));
    assert.deepEqual(pages, [1, -1]);
  }
});

test('leaderboard left/right keys remain page actions instead of reopening the home panel', () => {
  const { game, opened, pages } = leaderboardInputGame();
  game.homeOverlay = 'leaderboard';
  for (const key of [cc.KeyCode.ARROW_RIGHT, cc.KeyCode.KEY_D, cc.KeyCode.ARROW_LEFT, cc.KeyCode.KEY_A]) {
    game.handleKeyDownCode(key);
  }
  assert.deepEqual(pages, [1, 1, -1, -1]);
  assert.deepEqual(opened, []);
});

test('nickname typing lets Chinese, English, editing keys and IME composition reach the native input', () => {
  const game = new gameSandbox.exports.StackGame();
  const routed = [];
  Object.assign(game, {
    nicknameEditing: true, nicknameInputActive: true, nicknameSelection: 0,
    nicknameEditor: { isFocused: () => true },
    handleKeyDownCode(key) { routed.push(key); },
  });
  const events = [
    ...['w', 'a', 's', 'd', 'p', 'r', 't', 'k', ' ', 'Backspace', 'ArrowLeft', 'ArrowRight', 'Enter', '你']
      .map(key => ({ key })),
    { key: 'Process', keyCode: 229, isComposing: true },
    { key: 'Enter', keyCode: 13, isComposing: true },
    { key: 'Escape', keyCode: 27, isComposing: true },
  ];
  for (const values of events) {
    const event = { ...values, target: { tagName: 'INPUT' },
      preventDefault() { assert.fail(`${values.key} must reach the nickname input`); },
      stopImmediatePropagation() {
        assert.ok(values.isComposing, `${values.key} must not be swallowed by game shortcuts`);
      },
    };
    game.onBrowserRemoteKeyDown(event);
    game.onBrowserRemoteKeyUp(event);
  }
  assert.deepEqual(routed, []);
});

function nicknameInputGame() {
  const game = new gameSandbox.exports.StackGame();
  const actions = [];
  Object.assign(game, {
    phase: 'ready', homeOverlay: 'settings', nicknameEditing: true,
    nicknameInputActive: true, nicknameSelection: 0,
    nicknameEditor: {
      blur() { game.nicknameInputActive = false; },
      focus() { game.nicknameInputActive = true; },
    },
    updateNicknameEditorUI() {},
    saveNicknameEditor() { actions.push('save'); },
    closeNicknameEditor() { actions.push('cancel'); this.nicknameEditing = false; },
    moveSettingsSelection() { assert.fail('modal navigation must not change underlying settings focus'); },
  });
  return { game, actions };
}

test('nickname Tab and Escape remain modal controls while ordinary input keys are not routed to the game', () => {
  const { game, actions } = nicknameInputGame();
  let prevented = 0;
  let stopped = 0;
  const key = (value, shiftKey = false) => game.onBrowserRemoteKeyDown({ key: value, shiftKey,
    preventDefault() { prevented += 1; }, stopImmediatePropagation() { stopped += 1; } });
  key('Tab');
  assert.equal(game.nicknameSelection, 1);
  assert.equal(game.nicknameInputActive, false);
  key('Tab', true);
  assert.equal(game.nicknameSelection, 0);
  key('Escape');
  assert.deepEqual(actions, ['cancel']);
  assert.equal(prevented, 3);
  assert.equal(stopped, 3);
});

test('Android nickname bridge confirms text before saving, supports focus directions and ignores native repeats', () => {
  const { game, actions } = nicknameInputGame();
  assert.equal(game.onAndroidRemoteKey(23, 0, 0), true);
  assert.equal(game.nicknameSelection, 1, 'native confirm ends text entry and selects Save');
  assert.equal(game.nicknameInputActive, false);
  assert.deepEqual(actions, [], 'confirming text must not save on the same press');
  game.onAndroidRemoteKey(23, 0, 1);
  assert.deepEqual(actions, [], 'held confirm does not immediately activate Save');
  game.heldKeys.add(cc.KeyCode.ENTER);
  game.onAndroidRemoteKey(23, 1, 0);
  assert.equal(game.heldKeys.has(cc.KeyCode.ENTER), false);
  game.onAndroidRemoteKey(23, 0, 0);
  assert.deepEqual(actions, ['save']);

  for (const [native, expected] of [[19, 2], [20, 1], [21, 2], [22, 1]]) {
    game.nicknameInputActive = true;
    game.nicknameSelection = 0;
    game.onAndroidRemoteKey(native, 0, 0);
    assert.equal(game.nicknameSelection, expected);
    assert.equal(game.nicknameInputActive, false);
    game.onAndroidRemoteKey(native, 0, 1);
    assert.equal(game.nicknameSelection, expected);
    game.onAndroidRemoteKey(native, 1, 0);
  }
  assert.equal(game.onAndroidRemoteKey(24, 0), false, 'volume stays with the host');
  assert.equal(game.onAndroidRemoteKey(23, 3), false, 'unknown native actions are rejected');
  game.onAndroidRemoteKey(4, 0, 0);
  assert.deepEqual(actions, ['save', 'cancel']);
});

test('nickname gamepad focus reaches input, Save and Cancel and a held direction does not skip an option', () => {
  const { game, actions } = nicknameInputGame();
  const confirm = () => {
    const event = gamepadEvent();
    event.gamepad.buttonSouth = { getValue: () => 1 };
    game.onGamepadInput(event);
  };
  game.onGamepadInput(gamepadEvent(1, 0));
  assert.equal(game.nicknameSelection, 1);
  assert.equal(game.nicknameInputActive, false);
  game.onGamepadInput(gamepadEvent(1, 0));
  assert.equal(game.nicknameSelection, 1);
  game.onGamepadInput(gamepadEvent());
  confirm();
  assert.deepEqual(actions, ['save']);
  game.onGamepadInput(gamepadEvent());
  game.onGamepadInput(gamepadEvent(-1, 0));
  assert.equal(game.nicknameSelection, 0);
  game.onGamepadInput(gamepadEvent());
  confirm();
  assert.equal(game.nicknameInputActive, true);
  game.onGamepadInput(gamepadEvent());
  game.onGamepadInput(gamepadEvent(-1, 0));
  assert.equal(game.nicknameSelection, 2);
  game.onGamepadInput(gamepadEvent());
  confirm();
  assert.deepEqual(actions, ['save', 'cancel']);
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
  }
});


test('the permanent cream table preserves block dimensions and resource ownership', () => {
  const { world, base } = setup();
  const stage = world.worldRoot.getChildByName('CreamToyStage');
  const materials = Array.from(world.toyMaterials);
  assert.equal(stage.active, true);
  assert.equal(stage.children.length, 17);
  const table = stage.getChildByName('TableCollision');
  const collider = table.getComponent(BoxCollider);
  assert.equal(table.getComponent(RigidBody).type, cc.ERigidBodyType.STATIC);
  assert.equal(table.getComponent(RigidBody).useGravity, false);
  assert.deepEqual(collider.size, new Vec3(9.2, 0.46, 9.2));
  assert.ok(Math.abs(table.position.y + collider.size.y / 2 + 0.14) < 1e-8);
  for (const node of stage.children) {
    if (node === table) continue;
    if (node.name === 'TowerPlinth' || node.name.startsWith('PastelToy-')) {
      assert.deepEqual(node.getComponent(BoxCollider).size, Vec3.ONE);
      assert.equal(node.getComponent(RigidBody).type, cc.ERigidBodyType.STATIC);
      assert.equal(node.getComponent(RigidBody).useGravity, false);
    } else {
      assert.ok(!node.getComponent(BoxCollider), 'paint, shadows and the already-covered table mesh need no extra collider');
      assert.ok(!node.getComponent(RigidBody));
    }
  }
  assert.equal(stage.children.filter(node => node.getComponent(BoxCollider)).length, 8);
  const plinth = stage.getChildByName('TowerPlinth');
  assert.deepEqual(plinth.scale, new Vec3(5.55, 0.16, 5.55));
  for (const node of stage.children.filter(node => node.name.startsWith('PastelToy-'))) {
    assert.equal(node.scale.x, 0.62);
    assert.equal(node.scale.z, 0.62);
    assert.ok(Math.abs(node.position.y - node.scale.y / 2 + 0.14) < 1e-8);
  }
  const block = world.blockNodes.get(base);
  assert.equal(block.getChildByName('BlockVisual').getComponent(MeshRenderer).mesh, world.blockMesh);
  assert.equal(block.scale.x, base.width);
  assert.equal(block.scale.z, base.depth);
  assert.deepEqual(world.backgroundRenderer.material.properties.mainColor, new Color(...CREAM_STYLE.backgroundColor));
  assert.deepEqual(Array.from(world.toyMaterials), materials);
  world.reset();
  assert.equal(stage.isValid, true);
  assert.equal(stage.getChildByName('TableCollision'), table);
  world.destroy();
  assert.ok(materials.every(material => material.destroyed));
});

test('all stage contacts never award a layer and all falling bodies use continuous collision detection', () => {
  const { world, base, moving } = setup();
  world.beginDrop(moving, base);
  assert.equal(world.droppingNode.getComponent(RigidBody).useCCD, true);
  for (const node of world.worldRoot.getChildByName('CreamToyStage').children.filter(node => node.getComponent(BoxCollider))) {
    world.dropCollider.emit('onCollisionEnter', node.getComponent(BoxCollider));
    world.dropCollider.emit('onCollisionStay', node.getComponent(BoxCollider));
    assert.equal(world.pollDrop(0.01), null, `${node.name} is not the intended stack support`);
  }
  assert.equal(world.pollDrop(2), 'missed');
  world.releaseMiss(moving, 'x', 1);
  world.spawnFragment({ ...base, width: 0.1 }, 'x', 1);
  assert.equal(world.looseNodes.size, 2);
  for (const node of world.looseNodes.keys()) {
    assert.equal(node.getComponent(RigidBody).useCCD, true);
    assert.equal(node.getComponent(RigidBody).type, cc.ERigidBodyType.DYNAMIC);
  }
  world.destroy();
});



function homeTransitionGame(phase = 'gameover', reducedMotion = false) {
  const game = Object.create(GamePrototype);
  let resets = 0;
  const pauses = [];
  const opacities = [];
  Object.assign(game, {
    phase, reducedMotion, restartLock: 0, homeTransition: null, coins: 64, homeOverlay: 'none',
    visibleWidth: 1920 / 1080 * 1334, visibleHeight: 1334,
    transitionViews: [], heldKeys: new Set(),
    world3D: { setPaused(value) { pauses.push(value); }, setPresentationOpacity(value) { opacities.push(value); } },
    transitionBlocker: { active: false }, effectsGraphics: { clear() {}, node: { active: true } },
    drawScreenDimmer(alpha) { this.dimAlpha = alpha; },
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

test('settings opening and closing retain their short guarded transitions and reduced motion skips them', () => {
  const { game, opacities } = homeTransitionGame('ready');
  Object.assign(game, { homeOverlay:'none',
    openHomeOverlayImmediately(overlay) { this.setScreen('ready', overlay); },
    closeHomeOverlayImmediately() { this.setScreen('ready'); } });
  game.openHomeOverlay('settings');
  game.openHomeOverlay('leaderboard');
  assert.equal(game.homeOverlay, 'none');
  game.updateHomeTransition(0.05);
  assert.ok(game.startGroup.position.x < 0);
  assert.ok(game.dimAlpha >= 18 && game.dimAlpha <= 51);
  game.updateHomeTransition(0.05);
  assert.equal(game.settingsGroup.position.x, 24);
  assert.equal(opacities.length, 0, 'menu changes must not fade/reset the tower');
  game.updateHomeTransition(0.16);
  assert.equal(game.homeOverlay, 'settings');
  assert.equal(game.homeTransition, null);
  game.closeHomeOverlay();
  assert.equal(game.homeOverlay, 'settings');
  game.updateHomeTransition(0.32);
  assert.equal(game.homeOverlay, 'none');
  game.reducedMotion=true;
  game.openHomeOverlay('settings');
  assert.equal(game.homeOverlay, 'settings');
  assert.equal(game.homeTransition, null);
});

test('leaderboard expands from the right preview into the center and exits to the right without moving the tower', () => {
  const { game, opacities } = homeTransitionGame('ready');
  Object.assign(game, {
    openHomeOverlayImmediately(overlay) { this.setScreen('ready', overlay); },
    closeHomeOverlayImmediately() { this.setScreen('ready'); },
  });
  const preview = loadLayoutModule().projectorLeaderboardPreviewLayout(game.visibleWidth, game.visibleHeight);
  game.openHomeOverlay('leaderboard');
  const opening = game.homeTransition;
  assert.equal(opening.kind, 'leaderboard-open');
  game.openHomeOverlay('settings');
  game.closeHomeOverlay();
  assert.equal(game.homeTransition, opening, 'repeated navigation cannot replace the drawer transition');
  game.updateHomeTransition(opening.outSeconds);
  assert.equal(game.homeOverlay, 'leaderboard');
  assert.equal(game.leaderboardGroup.position.x, preview.panelX);
  assert.ok(game.leaderboardGroup.position.x > 24, 'leaderboard moves farther than the regular menu entrance');
  assert.equal(game.leaderboardGroup.getComponent(UIOpacity).opacity, 0);
  game.updateHomeTransition(opening.inSeconds / 2);
  assert.ok(game.leaderboardGroup.position.x > 0 && game.leaderboardGroup.position.x < preview.panelX);
  assert.equal(opacities.length, 0, 'drawer movement does not fade the tower');
  game.updateHomeTransition(opening.inSeconds);
  assert.equal(game.homeTransition, null);
  assert.equal(game.leaderboardGroup.position.x, 0, 'open ranking finishes centered');
  assert.equal(game.leaderboardGroup.getComponent(UIOpacity).opacity, 255);
  assert.equal(game.leaderboardGroup.getComponent(Widget).enabled, true);

  game.closeHomeOverlay();
  const closing = game.homeTransition;
  assert.equal(closing.kind, 'leaderboard-close');
  game.updateHomeTransition(closing.outSeconds / 2);
  assert.ok(game.leaderboardGroup.position.x > 0, 'closing moves the ranking back to the right');
  game.updateHomeTransition(closing.outSeconds / 2);
  assert.equal(game.homeOverlay, 'none');
  assert.equal(game.leaderboardGroup.position.x, 0, 'hidden ranking position is restored for the next visit');
  assert.equal(game.startGroup.position.x, -24, 'home still uses its existing short entrance');
  game.updateHomeTransition(closing.inSeconds + 0.001);
  assert.equal(game.homeTransition, null);
  assert.equal(game.startGroup.position.x, 0);
  assert.equal(game.transitionBlocker.active, false);
});

test('leaderboard resize settles both longer drawer transitions before applying the new layout', () => {
  for (const [width, height] of [[320, 568], [1920, 1080], [2560, 1080]]) {
    for (const closing of [false, true]) {
      const { game } = homeTransitionGame('ready');
      game.visibleWidth = width / height * game.visibleHeight;
      Object.assign(game, {
        openHomeOverlayImmediately(overlay) { this.setScreen('ready', overlay); },
        closeHomeOverlayImmediately() { this.setScreen('ready'); },
      });
      if (closing) {
        game.setScreen('ready', 'leaderboard');
        game.closeHomeOverlay();
      } else {
        game.openHomeOverlay('leaderboard');
      }
      game.updateHomeTransition(0.05);
      let resized = false;
      game.resizeStage = () => {
        resized = true;
        assert.equal(game.homeTransition, null);
        assert.equal(game.homeOverlay, closing ? 'none' : 'leaderboard');
        const revealed = closing ? game.startGroup : game.leaderboardGroup;
        assert.equal(revealed.position.x, 0);
        assert.equal(revealed.getComponent(UIOpacity).opacity, 255);
        assert.equal(revealed.getComponent(Widget).enabled, true);
      };
      game.onCanvasResize();
      assert.equal(resized, true);
      assert.equal(game.transitionBlocker.active, false);
    }
  }
});

test('reduced motion opens and closes the centered ranking immediately without a slide or input blocker', () => {
  const { game } = homeTransitionGame('ready', true);
  Object.assign(game, {
    openHomeOverlayImmediately(overlay) { this.setScreen('ready', overlay); },
    closeHomeOverlayImmediately() { this.setScreen('ready'); },
  });
  game.onLeaderboardButton();
  assert.equal(game.homeOverlay, 'leaderboard');
  assert.equal(game.homeSelection, 1);
  assert.equal(game.homeTransition, null);
  assert.equal(game.leaderboardGroup.position.x, 0);
  assert.equal(game.transitionBlocker.active, false);
  game.closeHomeOverlay();
  assert.equal(game.homeOverlay, 'none');
  assert.equal(game.homeSelection, 1);
  assert.equal(game.homeTransition, null);
});

test('closing the real leaderboard restores button focus, invalidates pending loads and refreshes the home preview', () => {
  const { game } = homeTransitionGame('ready', true);
  let fullLoads = 0;
  let previewLoads = 0;
  let focused;
  Object.assign(game, {
    leaderboardRequest: 3, homeLeaderboardPreviewRequest: 4,
    loadLeaderboard() { fullLoads += 1; }, loadHomeLeaderboardPreview() { previewLoads += 1; },
    updateHomeMenuFocus() { focused = this.homeSelection; }, updateSettingsUI() {},
  });
  game.onLeaderboardButton();
  assert.equal(game.homeOverlay, 'leaderboard');
  assert.equal(fullLoads, 1);
  assert.equal(game.homeLeaderboardPreviewRequest, 5);
  assert.equal(game.leaderboardScrollTarget, 0, 'the full panel starts at the top of its list');
  game.closeHomeOverlay();
  assert.equal(game.homeOverlay, 'none');
  assert.equal(focused, 1);
  assert.equal(game.leaderboardRequest, 4);
  assert.equal(previewLoads, 1);
  assert.equal(game.startGroup.active, true);
  assert.equal(game.leaderboardGroup.active, false);
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

test('cream transitions cap the dimmer and restore complete panel opacity and anchors', () => {
  const { game } = homeTransitionGame('ready');
  game.beginScreenTransition(() => game.setScreen('ready', 'settings'), 'menu-open');
  for (let i = 0; i < 27; i += 1) {
    game.updateHomeTransition(0.01);
    assert.ok(game.dimAlpha >= 0 && game.dimAlpha <= 51);
  }
  assert.equal(game.settingsGroup.getComponent(UIOpacity).opacity, 255);
  assert.equal(game.settingsGroup.position.x, 0);
  assert.equal(game.settingsGroup.getComponent(Widget).enabled, true);
});

test('navigation has no full-screen cover renderer and panels own backgrounds with their content', () => {
  assert.doesNotMatch(gameSource, /transitionGraphics|drawHomeTransition|animateMenuEntrance/);
  for (const group of ['startGroup', 'pauseGroup', 'resultGroup']) {
    assert.ok(gameSource.includes(`this.${group}.addComponent(Graphics)`), group);
  }
  const backdrop = gameSource.slice(gameSource.indexOf('private drawOverlayBackdrop'), gameSource.indexOf('private drawOverlayButton'));
  assert.doesNotMatch(backdrop, /graphics\.rect\(/, 'modal panel must not carry a full-screen moving dimmer');
});

function loadGameSave(entries = {}, removeFailure = null) {
  const values = new Map(Object.entries(entries));
  const reads = [], writes = [], removals = [];
  const originalStorage = cc.sys.localStorage;
  cc.sys.localStorage = {
    getItem(key) { reads.push(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push(key); values.set(key, value); },
    removeItem(key) {
      removals.push(key);
      if (removeFailure && removeFailure(key)) throw new Error('removal unavailable');
      values.delete(key);
    },
  };
  try {
    const game = new gameSandbox.exports.StackGame();
    game.loadSettings();
    game.saveEconomy();
    return { game, values, reads, writes, removals };
  } finally {
    cc.sys.localStorage = originalStorage;
  }
}

const progressSave = {
  'wxstack-coins': '46', 'wxstack-initial-coins-v1': '1', 'wxstack-best-score': '28',
  'wxstack-sound-enabled': '0', 'wxstack-reduced-motion': '1', 'wxstack-nickname': '奶油玩家',
  'wxstack-leaderboard-v1': JSON.stringify({ version: 1, entries: [{ id: 'old-round', score: 28 }] }),
};
function assertProgressPreserved(game, values) {
  assert.equal(game.coins, 46);
  assert.equal(game.bestScore, 28);
  assert.equal(game.soundEnabled, false);
  assert.equal(game.reducedMotion, true);
  assert.equal(game.playerNickname, '奶油玩家');
  for (const [key, value] of Object.entries(progressSave)) assert.equal(values.get(key), value, key);
}
function assertCreamWorld(game) {
  buildInitialWorld(game);
  try {
    assert.deepEqual(game.world3D.backgroundRenderer.material.getProperty('mainColor'), new Color(...CREAM_STYLE.backgroundColor));
    assert.equal(game.world3D.worldRoot.getChildByName('CreamToyStage').active, true);
    assert.equal('selectedSkinId' in game, false);
    assert.equal('ownedSkins' in game, false);
  } finally {
    game.world3D.destroy();
  }
}

test('new players receive 100 coins and start directly in cream without appearance state', () => {
  const { game, values, reads, writes, removals } = loadGameSave();
  assert.equal(game.coins, 100);
  assert.equal(game.bestScore, 0);
  assert.equal(game.soundEnabled, true);
  assert.equal(game.reducedMotion, false);
  assert.equal(values.get('wxstack-initial-coins-v1'), '1');
  assert.deepEqual(removals, ['wxstack-selected-skin', 'wxstack-owned-skins']);
  assert.ok(reads.concat(writes).every(key => !key.includes('skin')));
  assertCreamWorld(game);
});

test('all retired selections and malformed skin records are removed while progress remains intact', () => {
  for (const selected of ['minimal-stack', 'classic', 'cyber-neon', 'porcelain-moon', 'pastel-toy', 'nature-zen', 'sunset', 'unknown']) {
    for (const owned of ['["classic","nature-zen"]', '{malformed']) {
      const { game, values, reads, writes } = loadGameSave({ ...progressSave,
        'wxstack-selected-skin': selected, 'wxstack-owned-skins': owned,
      });
      assert.equal(values.has('wxstack-selected-skin'), false);
      assert.equal(values.has('wxstack-owned-skins'), false);
      assertProgressPreserved(game, values);
      assert.ok(reads.concat(writes).every(key => !key.includes('skin')));
      assertCreamWorld(game);
    }
  }
});

test('a failed obsolete-key removal cannot prevent the other removal or loading saved progress', () => {
  for (const failedKey of ['wxstack-selected-skin', 'wxstack-owned-skins', 'both']) {
    const { game, values, reads, writes, removals } = loadGameSave({ ...progressSave,
      'wxstack-selected-skin': 'nature-zen', 'wxstack-owned-skins': '{malformed',
    }, key => key === failedKey || failedKey === 'both');
    assert.deepEqual(removals, ['wxstack-selected-skin', 'wxstack-owned-skins']);
    for (const key of removals) assert.equal(values.has(key), key === failedKey || failedKey === 'both');
    assertProgressPreserved(game, values);
    assert.ok(reads.concat(writes).every(key => !key.includes('skin')));
    assertCreamWorld(game);
  }
});

test('unavailable storage keeps cream startup and session settings usable', () => {
  const originalStorage = cc.sys.localStorage;
  try {
    for (const storage of [null, {
      getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); },
      removeItem() { throw new Error('blocked'); },
    }]) {
      cc.sys.localStorage = storage;
      const game = new gameSandbox.exports.StackGame();
      assert.doesNotThrow(() => game.loadSettings());
      assert.equal(game.coins, 100);
      assert.equal(game.bestScore, 0);
      assert.equal(game.soundEnabled, true);
      assert.equal(game.reducedMotion, false);
      assert.equal(game.playerNickname, leaderboardData.DEFAULT_NICKNAME);
      game.coins = 116;
      game.soundEnabled = false;
      game.reducedMotion = true;
      assert.doesNotThrow(() => game.saveEconomy());
      assert.doesNotThrow(() => game.saveUserSettings());
      assert.equal(game.coins, 116);
      assert.equal(game.soundEnabled, false);
      assert.equal(game.reducedMotion, true);
      assertCreamWorld(game);
    }
  } finally {
    cc.sys.localStorage = originalStorage;
  }
});

test('confirmed revival restores the top and moving block to half size while preserving lower layers and stamina', () => {
  const game = Object.create(GamePrototype);
  const stack = [{ x: 0.2, z: -0.1, width: 4, depth: 3, level: 0 },
    { x: 0.3, z: -0.1, width: 3.8, depth: 3, level: 1 }];
  let resets = 0;
  Object.assign(game, {
    phase: 'gameover', roundId: 'same-round', roundWasTest: false, roundNickname: '原玩家',
    roundPerfectCount: 1, roundRewardedPerfectCount: 1, coins: 101, score: 1, stack,
    world3D: { reset() { resets++; } },
    stamina: { spend() { assert.fail('revival must not spend stamina'); } },
    resultGroup: { active: true }, pauseGroup: { active: false },
    gameplayHudGroup: { active: false }, pauseButton: { active: false },
    fallingPieces: [{}], sparks: [{}], rings: [{}], perfectFrames: [{}],
    updateWorldComposition() {}, updateTestModeUI() {}, resetPerfectFeedback() {},
    setScore(value) { assert.equal(value, 1); }, drawFrame() {},
  });
  game.resumeRevivedRound();
  assert.equal(resets, 1);
  assert.equal(game.stack, stack);
  assert.equal(game.roundId, 'same-round');
  assert.equal(game.roundNickname, '原玩家');
  assert.equal(game.roundPerfectCount, 1);
  assert.equal(game.roundRewardedPerfectCount, 1);
  assert.equal(game.coins, 101);
  assert.equal(game.current.level, 2);
  assert.equal(game.current.width, 2.5);
  assert.equal(game.current.depth, 2.5);
  assert.equal(stack[1].width, 2.5);
  assert.equal(stack[1].depth, 2.5);
  assert.equal(stack[0].width, 4);
  assert.equal(stack[0].depth, 3);
  assert.equal(game.openingBlockEntering, true);
  assert.equal(game.gameplayHudGroup.active, true);
  assert.equal(game.resultGroup.active, false);
  assert.equal(game.fallingPieces.length, 0);
  assert.equal(game.phase, 'playing');
});

test('QR confirmation is accepted once and late responses after cancellation cannot resume play', async () => {
  const create = () => {
    const game = Object.create(GamePrototype);
    let resumed = 0, cancelled = 0;
    Object.assign(game, { isValid: true, phase: 'gameover', roundId: 'round-one',
      reviveRequest: 1, reviveUsed: false, revivePolling: false,
      reviveGroup: { active: true }, reviveQr: { clear() {} }, reviveStatusLabel: { string: '' },
      reviveSession: { expiresAt: Date.now() + 300000 },
      drawReviveQR() {},
      beginScreenTransition(swap) { swap(); }, resumeRevivedRound() { resumed++; },
      reviveClient: { async status() { return { state: 'confirmed' }; },
        async consume() { return { state: 'consumed' }; }, async cancel() { cancelled++; } },
    });
    return { game, resumed: () => resumed, cancelled: () => cancelled };
  };
  const accepted = create();
  await accepted.game.pollRevive();
  await accepted.game.pollRevive();
  assert.equal(accepted.resumed(), 1);
  assert.equal(accepted.game.reviveUsed, true);
  assert.equal(accepted.game.reviveGroup.active, false);
  const stale = create();
  let resolve;
  stale.game.reviveClient.status = () => new Promise(done => { resolve = done; });
  stale.game.reviveClient.consume = () => assert.fail('cancelled QR must not be consumed');
  const pending = stale.game.pollRevive();
  stale.game.closeRevive();
  resolve({ state: 'confirmed' });
  await pending;
  assert.equal(stale.resumed(), 0);
  assert.equal(stale.cancelled(), 1);
});

test('result focus skips used revival and the QR modal captures back, confirm and pointer input', () => {
  const game = Object.create(GamePrototype);
  Object.assign(game, { resultSelection: 0, reviveUsed: false, updateResultFocus() {},
    phase: 'gameover', heldKeys: new Set(), reviveGroup: { active: false }, homeOverlay: 'none' });
  game.moveResultSelection(-1); assert.equal(game.resultSelection, 2);
  game.moveResultSelection(1); assert.equal(game.resultSelection, 0);
  game.reviveUsed = true; game.resultSelection = 1;
  game.moveResultSelection(-1); assert.equal(game.resultSelection, 2);
  game.moveResultSelection(1); assert.equal(game.resultSelection, 1);
  let closes = 0;
  game.reviveGroup.active = true;
  game.closeRevive = () => { closes++; };
  game.returnToHome = game.tryPrimaryAction = () => assert.fail('modal input must not reach underlying buttons');
  game.handleKeyDownCode(cc.KeyCode.ESCAPE);
  game.handleKeyDownCode(cc.KeyCode.ENTER);
  game.onPointerAction();
  assert.equal(closes, 2);
});

test('rapid opening clicks cannot drop the first block before it enters the support footprint', () => {
  const game = Object.create(GamePrototype);
  const releases = [];
  const misses = [];
  Object.assign(game, {
    stack: [{ x: 0, z: 0, width: 5, depth: 5, level: 0 }],
    score: 0, phase: 'playing', spawnDelay: 0,
    world3D: { beginDrop(block) { releases.push(block); } },
    failPlacement(block) { misses.push(block); },
  });
  game.spawnMovingBlock();
  const first = game.current;
  for (let i = 0; i < 3; i += 1) {
    game.updateMovingBlock(0.05);
    game.placeCurrentBlock();
    assert.equal(game.current, first);
    assert.equal(game.phase, 'playing');
    assert.equal(releases.length, 0);
  }
  game.updateMovingBlock(0.4);
  game.placeCurrentBlock();
  assert.equal(releases.length, 1);
  assert.equal(game.phase, 'dropping');
  assert.equal(misses.length, 0);

  // A fresh round is protected again, but missing after the first pass is valid.
  game.phase = 'playing';
  game.spawnMovingBlock();
  game.placeCurrentBlock();
  assert.equal(releases.length, 1);
  for (let i = 0; i < 60; i += 1) game.updateMovingBlock(0.05);
  game.placeCurrentBlock();
  assert.equal(misses.length, 1);

  // Later blocks retain the normal immediate drop/miss rules.
  game.phase = 'playing';
  game.stack.push({ x: 0, z: 0, width: 5, depth: 5, level: 1 });
  game.spawnMovingBlock();
  game.placeCurrentBlock();
  assert.equal(misses.length, 2);
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
