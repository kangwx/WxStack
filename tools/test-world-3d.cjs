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
  initialize() {}
  setProperty(name, value) { this.properties[name] = value; }
}
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
  setPosition(x, y, z) { this.position = new Vec3(x, y, z); }
  setScale(x, y, z) { this.scale = new Vec3(x, y, z); }
  setRotationFromEuler() {}
  lookAt() {}
  destroy() { this.isValid = false; }
}
const cc = {
  sys: { isBrowser: false, localStorage: null },
  _decorator: { ccclass: () => Type => Type }, Component: class {},
  BoxCollider, Camera, Color: class { static WHITE = {}; }, DirectionalLight: class {},
  ERigidBodyType: { STATIC: 0, KINEMATIC: 1, DYNAMIC: 2 },
  Layers: { BitMask: { DEFAULT: 1, UI_2D: 2, PROFILER: 4 } },
  Material, Mesh: Asset, MeshRenderer, Node, RigidBody, UITransform, Vec3,
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
const theme = { background: null, blockColors: [{}], materialTextures: [] };
function setup() {
  const canvas = new Node('Canvas'); canvas.scene = new Node('Scene');
  const world = new StackWorld3D(canvas, 0.62);
  const base = { x: 0, z: 0, width: 5, depth: 5, level: 0 };
  const moving = { ...base, level: 1 };
  world.setTheme(theme); world.sync([base], moving);
  return { world, base, moving };
}

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
const gameCompiled = ts.transpileModule(gameSource, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
} }).outputText;
const gameSandbox = { exports: {}, require: id => id === 'cc' ? cc : { StackWorld3D } };
vm.runInNewContext(gameCompiled, gameSandbox);
const GamePrototype = gameSandbox.exports.StackGame.prototype;

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
      reducedMotion, perfectFrames: [], sparks: [], rings: [], cutSeams: [], visibleWidth: 750,
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
  Object.assign(game, {
    phase, reducedMotion, restartLock: 0, homeTransition: null, coins: 64,
    world3D: { setPaused(value) { pauses.push(value); } },
    transitionGraphics: { node: { active: false } }, transitionOpacity: { opacity: 0 },
    drawHomeTransition() {},
    showReadyScreen() { resets += 1; this.phase = 'ready'; },
  });
  return { game, pauses, resetCount: () => resets };
}

test('home return fades out, resets once behind cover, fades in and blocks repeated input', () => {
  for (const phase of ['gameover', 'paused']) {
    const { game, pauses, resetCount } = homeTransitionGame(phase);
    game.returnToHome();
    const transition = game.homeTransition;
    game.returnToHome();
    assert.equal(game.homeTransition, transition);
    assert.deepEqual(pauses, [true]);
    assert.equal(game.consumeActionDebounce(), false);
    game.updateHomeTransition(0.1);
    assert.ok(game.transitionOpacity.opacity > 0 && game.transitionOpacity.opacity < 255);
    assert.equal(resetCount(), 0);
    game.updateHomeTransition(0.1);
    assert.equal(resetCount(), 1);
    assert.equal(game.transitionOpacity.opacity, 255);
    game.updateHomeTransition(0.14);
    assert.ok(game.transitionOpacity.opacity > 0 && game.transitionOpacity.opacity < 255);
    game.updateHomeTransition(0.2);
    assert.equal(game.homeTransition, null);
    assert.equal(game.transitionGraphics.node.active, false);
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

test('first cut conserves width/depth, marks the cut edge, and settles before spawning debris', () => {
  for (const axis of ['x', 'z']) {
    for (const delta of [-1.5, 1.5]) {
      const base = { x: 0, z: 0, width: 5, depth: 5, level: 0, hue: 60 };
      const placed = { ...base, [axis]: delta, level: 1 };
      const game = Object.create(GamePrototype);
      const calls = [];
      let offcut;
      Object.assign(game, {
        current: placed, stack: [base], phase: 'dropping', moveAxis: axis,
        testModeEnabled: false, reducedMotion: true, fallingPieces: [], cutSeams: [], score: 0,
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
      assert.equal(game.cutSeams.length, 1);
      const seam = game.cutSeams[0];
      assert.equal(seam[axis + '1'], Math.sign(delta) * 2.5);
      assert.equal(seam[axis + '2'], Math.sign(delta) * 2.5);
      assert.equal(seam.life, 0.36);
    }
  }
});
