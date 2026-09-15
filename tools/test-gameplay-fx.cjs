const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/ui/GameplayFxController.ts'), 'utf8');

function fixture() {
  const counts = { colors: 0, vectors: 0, materials: 0, nodes: 0, transforms: 0, instances: 0 };
  class Vector {
    constructor(x = 0, y = 0, z = 0, w = 0) { counts.vectors++; this.set(x, y, z, w); }
    set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; }
  }
  class Color {
    constructor(r = 255, g = 255, b = 255, a = 255) { counts.colors++; this.set(r, g, b, a); }
    set(r, g, b, a) { this.r = r; this.g = g; this.b = b; this.a = a; }
  }
  class UITransform {
    constructor() { counts.transforms++; }
    setContentSize(width, height) { this.width = width; this.height = height; }
  }
  class Sprite {
    constructor() {
      counts.nodes++;
      this.spriteFrame = {};
      this.transform = new UITransform();
      this.node = { active: false, x: 0, y: 0, angle: 0,
        setPosition(x, y) { this.x = x; this.y = y; },
        setParent(parent) { this.parent = parent; }, destroy() { this.destroyed = true; },
        getComponent: type => type === UITransform ? this.transform : type === Sprite ? this : null };
    }
    getMaterialInstance() {
      if (!this.material) {
        counts.materials++;
        this.material = { setProperty(name, value) { this[name] = value; } };
      }
      return this.material;
    }
    setSharedMaterial(material) { this.sharedMaterial = material; }
  }
  const cc = { Component: class {}, Node: class {}, Prefab: class {}, Color, Vec3: Vector, Vec4: Vector, Sprite, UITransform,
    instantiate(prefab) { assert.equal(prefab.kind,'impact-ring'); counts.instances++; return Object.assign(new Sprite(), {customMaterial:{}}).node; },
    _decorator: { ccclass: () => target => target, property: () => () => {} } };
  const random = Object.create(Math); random.random = () => 0.5;
  const runtime = { exports: {}, require(name) { assert.equal(name, 'cc'); return cc; }, Math: random };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
  } }).outputText, runtime);
  const fx = new runtime.exports.GameplayFxController();
  fx.sparkSprites = Array.from({ length: 128 }, () => new Sprite());
  fx.trailSprites = Array.from({ length: 128 }, () => new Sprite());
  fx.frameSprites = Array.from({ length: 24 }, () => new Sprite());
  fx.ringSprites = Array.from({ length: 8 }, () => Object.assign(new Sprite(), { customMaterial: {} }));
  fx.ringPrefab = { kind: 'impact-ring' }; fx.ringRoot = { name: 'RingsRoot' };
  fx.flashSprite = new Sprite();
  let offsetX = 0;
  let calls = 0;
  const outs = new Set();
  const projection = (x, z, level, out) => {
    calls++; outs.add(out);
    out.set((x - z) * 20 + offsetX, -(x + z) * 10 + level * 44, 0);
  };
  return { fx, counts, projection, initialize() { fx.initialize(projection); },
    calls: () => calls, outs, moveCamera(x) { offsetX = x; }, runtime };
}
const block = { x: 0.4, z: -0.2, width: 3.8, depth: 2.8, level: 7, hue: 190 };
const alive = list => list.filter(item => item.life > 0);
const near = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);

test('serialized Sprite pools fail explicitly on missing references and never construct replacement UI', () => {
  const f = fixture();
  f.fx.sparkSprites.pop();
  assert.throws(() => f.initialize(), /sparkSprites requires 128/);
  const g = fixture();
  g.fx.ringSprites[0].customMaterial = null;
  assert.throws(() => g.initialize(), /impact-ring material/);
  const h = fixture();
  h.fx.sparkSprites[0].spriteFrame = null;
  assert.throws(() => h.initialize(), /SpriteFrame/);
  assert.doesNotMatch(source, /\bGraphics\b|new\s+Node\b|addComponent\s*\(/);
  assert.match(source, /instantiate\(this\.ringPrefab!\)/, 'only the authored overflow-ring prefab can be instantiated');
});

test('normal impacts retain eight sparks, exact initial trajectory, HSL colour, and a 0.3 second expanding ring', () => {
  const f = fixture(); f.initialize();
  f.fx.emitImpact(block, false);
  assert.equal(alive(f.fx.sparks).length, 8);
  assert.equal(alive(f.fx.rings).length, 1);
  const spark = f.fx.sparks[0];
  near(spark.vx, Math.cos(0.14) * 80.5);
  near(spark.vy, Math.sin(0.14) * 80.5 + 30);
  assert.equal(spark.level, block.level + 1);
  assert.equal(spark.size, 3.5);
  assert.equal(spark.maxLife, 0.48);
  assert.equal(spark.trailLength, 0);
  assert.deepEqual([spark.color.r, spark.color.g, spark.color.b], [134, 192, 243]);
  const initialX = spark.vx; const initialY = spark.vy;
  f.fx.step(0.1); f.fx.render(750, 1334);
  near(spark.x, initialX * 0.1); near(spark.y, initialY * 0.1);
  near(spark.vx, initialX * Math.pow(0.18, 0.1)); near(spark.vy, initialY - 19);
  const ring = f.fx.rings[0];
  near(ring.radius, 29); near(ring.life, 0.2);
  near(f.fx.ringSprites[0].material.ringParams.y, 1 + 2.5 * 2 / 3);
  assert.equal(f.fx.ringSprites[0].node.active, true);
  f.fx.step(0.2); f.fx.render(750, 1334);
  assert.equal(f.fx.ringSprites[0].node.active, false);
});

test('perfect particles retain contact-plane origins on only the two front edges, trails, accent colours and camera following', () => {
  const f = fixture(); f.initialize();
  f.fx.emitImpact(block, true, 8);
  const sparks = alive(f.fx.sparks);
  assert.equal(sparks.length, 65);
  assert.equal(alive(f.fx.rings).length, 0);
  for (const spark of sparks) {
    assert.equal(spark.level, block.level);
    assert.ok(Math.abs(spark.worldX - (block.x + block.width / 2)) < 1e-8
      || Math.abs(spark.worldZ - (block.z + block.depth / 2)) < 1e-8);
    assert.ok(spark.worldX >= block.x - block.width / 2 && spark.worldX <= block.x + block.width / 2);
    assert.ok(spark.worldZ >= block.z - block.depth / 2 && spark.worldZ <= block.z + block.depth / 2);
  }
  assert.equal(sparks[0].maxLife, (0.45 + 3 * 0.065) * 0.72);
  assert.deepEqual([sparks[4].color.r, sparks[4].color.g, sparks[4].color.b], [255, 238, 166]);
  assert.ok(sparks[0].trailLength > 0);
  f.fx.render(750, 1334);
  const oldX = f.fx.sparkSprites[0].node.x;
  f.moveCamera(81); f.fx.render(750, 1334);
  near(f.fx.sparkSprites[0].node.x - oldX, 81);
  assert.equal(f.fx.trailSprites[0].node.active, true);
  assert.equal(f.fx.trailSprites[1].node.active, false);
});

test('perfect waves preserve timing, line width, front-edge geometry and copied grown block dimensions', () => {
  const f = fixture(); f.initialize();
  const placed = { ...block };
  f.fx.emitPerfectFrames(placed, 8, false);
  const frames = f.fx.frames.filter(frame => frame.active);
  assert.equal(frames.length, 4);
  near(frames[0].duration, 0.43); near(frames[3].delay, 0.135);
  assert.equal(frames[0].lineWidth, 4.24);
  placed.width = 1;
  assert.equal(frames[0].block.width, block.width);
  f.fx.render(750, 1334);
  assert.equal(f.fx.frameSprites[2].node.active, false, 'delayed wave has no visible Sprite');
  f.fx.step(0.05); f.fx.render(750, 1334);
  const lineA = f.fx.frameSprites[0]; const lineB = f.fx.frameSprites[1];
  assert.equal(lineA.node.active, true); assert.equal(lineB.node.active, true);
  assert.ok(lineA.node.angle < -90 && lineA.node.angle > -180);
  assert.ok(lineB.node.angle > 90 && lineB.node.angle < 180);
  near(lineA.transform.height, 4.24); near(lineB.transform.height, 4.24);
  assert.equal(f.fx.frameSprites[4].node.active, false, 'later front-edge wave is still delayed');
});

test('reduced motion retains one non-expanding 0.24 second contact frame and clearPerfectFrames leaves sparks intact', () => {
  const f = fixture(); f.initialize();
  f.fx.emitPerfectFrames(block, 64, true);
  const frames = f.fx.frames.filter(frame => frame.active);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].duration, 0.24);
  assert.equal(frames[0].delay, 0);
  assert.equal(frames[0].startExpansion, 10);
  assert.equal(frames[0].maxExpansion, 10);
  assert.equal(frames[0].alpha, 220);
  f.fx.step(0.05); f.fx.render(750, 1334);
  const width = f.fx.frameSprites[0].transform.width;
  f.fx.step(0.1); f.fx.render(750, 1334);
  near(f.fx.frameSprites[0].transform.width, width);
  f.fx.emitImpact(block, true, 1);
  f.fx.clearPerfectFrames();
  assert.equal(f.fx.frameSprites.filter(sprite => sprite.node.active).length, 0);
  assert.equal(alive(f.fx.sparks).length, 25);
});

test('fixed storage keeps the newest 128 sparks and 12 frames without growing node, colour, vector or material allocations', () => {
  const f = fixture(); f.initialize();
  const before = { ...f.counts };
  const sparkStorage = f.fx.sparks; const frameStorage = f.fx.frames;
  const firstSpark = f.fx.sparks[0]; const firstFrameBlock = f.fx.frames[0].block;
  for (let i = 0; i < 30; i++) {
    f.fx.emitImpact({ ...block, level: i }, true, 128);
    f.fx.emitPerfectFrames({ ...block, level: i }, 128, false);
    f.fx.step(0.001); f.fx.render(750, 1334);
  }
  assert.equal(alive(f.fx.sparks).length, 128);
  assert.equal(f.fx.frames.filter(frame => frame.active).length, 12);
  assert.ok(alive(f.fx.sparks).every(spark => spark.level >= 28));
  assert.ok(f.fx.frames.every(frame => frame.block.level >= 28));
  assert.equal(f.fx.sparks, sparkStorage); assert.equal(f.fx.frames, frameStorage);
  assert.equal(f.fx.sparks[0], firstSpark); assert.equal(f.fx.frames[0].block, firstFrameBlock);
  assert.deepEqual(f.counts, before);
  assert.ok(f.outs.size <= 6, 'projection uses only the preallocated center, anchor and corners');
});

test('flash size follows the viewport and idle, clear and disabled pools perform no projections', () => {
  const f = fixture(); f.initialize();
  f.fx.render(750, 1334); assert.equal(f.calls(), 0);
  f.fx.setFlash(0.28); f.fx.render(1920, 1080);
  assert.equal(f.fx.flashSprite.transform.width, 1920);
  assert.equal(f.fx.flashSprite.transform.height, 1080);
  assert.equal(f.fx.flashSprite.color.a, 71);
  f.fx.setFlash(0); f.fx.render(1920, 1080);
  assert.equal(f.fx.flashSprite.node.active, false);
  f.fx.emitImpact(block, false); f.fx.emitPerfectFrames(block, 8, false);
  f.fx.step(0.05); f.fx.render(750, 1334);
  f.fx.onDisable();
  const calls = f.calls(); f.fx.render(750, 1334);
  assert.equal(f.calls(), calls);
  const pools = [...f.fx.sparkSprites, ...f.fx.trailSprites, ...f.fx.frameSprites, ...f.fx.ringSprites];
  assert.ok(pools.every(sprite => !sprite.node.active));
});

test('ring shader computes continuous radius and line-width coverage from a standalone Sprite texture', () => {
  const effect = fs.readFileSync(path.join(__dirname, '../assets/scripts/fx-resources/impact-ring.effect'), 'utf8');
  assert.match(effect, /length\(uv0 - vec2\(0\.5\)\) \* ringParams\.z/);
  assert.match(effect, /ringParams\.y \* 0\.5/);
  assert.match(effect, /smoothstep/);
  const material = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/scripts/fx-resources/impact-ring.mtl'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/scripts/fx-resources/impact-ring.effect.meta'), 'utf8'));
  assert.equal(material._effectAsset.__uuid__, meta.uuid);
});

test('idle simulation and render do not even inspect effect pool slots, including flash-only changes', () => {
  const f = fixture(); f.initialize();
  let reads = 0;
  for (const field of ['sparks', 'rings', 'frames']) f.fx[field] = new Proxy(f.fx[field], {
    get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); },
  });
  for (let i = 0; i < 240; i++) { f.fx.step(1 / 60); f.fx.setFlash(0); f.fx.render(750, 1334); }
  assert.equal(reads, 0);
  assert.equal(f.fx.activeCount, 0); assert.equal(f.fx.needsSimulation, false);
  assert.equal(f.fx.needsProjection, false); assert.equal(f.fx.needsRender, false);
  f.fx.setFlash(.3); assert.equal(f.fx.needsRender, true);
  f.fx.render(1920, 1080); assert.equal(reads, 0); assert.equal(f.calls(), 0);
  assert.equal(f.fx.flashSprite.node.active, true);
  f.fx.setFlash(0); f.fx.render(1920, 1080);
  assert.equal(reads, 0); assert.equal(f.fx.flashSprite.node.active, false);
  assert.equal(f.fx.needsRender, false);
});

test('the final expiry still requests one hide pass before returning to sleep', () => {
  const f = fixture(); f.initialize();
  f.fx.emitImpact(block, false); f.fx.emitPerfectFrames(block, 1, true);
  assert.equal(f.fx.activeSparkCount, 8); assert.equal(f.fx.activeRingCount, 1); assert.equal(f.fx.activeFrameCount, 1);
  f.fx.step(.05); f.fx.render(750, 1334);
  assert.ok(f.fx.sparkSprites.some(s => s.node.active));
  f.fx.step(1);
  assert.equal(f.fx.activeCount, 0); assert.equal(f.fx.needsSimulation, false);
  assert.equal(f.fx.needsProjection, false); assert.equal(f.fx.needsRender, true);
  const before=f.calls(); f.fx.render(750, 1334);
  assert.equal(f.calls(),before); assert.equal(f.fx.needsRender,false);
  for(const sprite of [...f.fx.sparkSprites,...f.fx.trailSprites,...f.fx.frameSprites,...f.fx.ringSprites])assert.equal(sprite.node.active,false);
});

test('one render caches the shared normal-impact anchor, then invalidates it when the camera moves', () => {
  const f=fixture();f.initialize();f.fx.emitImpact(block,false);f.fx.step(.05);
  f.fx.render(750,1334);
  assert.equal(f.fx.projectionCallsLastRender,1);assert.equal(f.fx.projectionCacheHitsLastRender,8);
  const before=f.fx.sparkSprites[0].node.x;
  f.moveCamera(135);f.fx.render(750,1334);
  assert.equal(f.fx.projectionCallsLastRender,1);near(f.fx.sparkSprites[0].node.x-before,135);
});

test('simultaneous perfect frames reuse their center and base corners without allocating vectors', () => {
  const f=fixture();f.initialize();f.fx.emitPerfectFrames(block,128,false);f.fx.step(.3);
  const before={...f.counts};f.fx.render(750,1334);
  assert.equal(f.fx.activeFrameCount,6);
  assert.ok(f.fx.projectionCallsLastRender<=29);
  assert.ok(f.fx.projectionCacheHitsLastRender>=25);
  assert.deepEqual(f.counts,before);
});

test('a burst beyond eight live rings instantiates the configured prefab and never overwrites live rings', () => {
  const f=fixture();f.initialize();
  for(let i=0;i<12;i++)f.fx.emitImpact({...block,level:i},false);
  assert.equal(f.fx.activeRingCount,12);assert.equal(f.fx.ringPoolCapacity,12);
  assert.equal(f.fx.ringExpansionCount,4);assert.equal(f.fx.peakActiveRingCount,12);assert.equal(f.counts.instances,4);
  assert.deepEqual(Array.from(alive(f.fx.rings),r=>r.level).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i+1));
  f.fx.render(750,1334);assert.equal(f.fx.ringSprites.filter(s=>s.node.active).length,12);
  for(const sprite of f.fx.ringSprites.slice(8)){assert.equal(sprite.node.parent,f.fx.ringRoot);assert.equal(sprite.sharedMaterial,sprite.customMaterial);}
  f.fx.step(.31);f.fx.render(750,1334);assert.equal(f.fx.activeRingCount,0);
  const before={...f.counts};for(let i=0;i<12;i++)f.fx.emitImpact({...block,level:20+i},false);
  assert.equal(f.fx.activeRingCount,12);assert.deepEqual(f.counts,before,'expired overflow instances are reused');
  f.fx.clear();assert.equal(f.fx.activeCount,0);assert.equal(f.fx.needsRender,false);
});

test('ring overflow binding is mandatory, and its material is assigned before onLoad-created instances', () => {
  const missing=fixture();missing.fx.ringPrefab=null;assert.throws(()=>missing.initialize(),/configured ringPrefab\/ringRoot/);
  const f=fixture();
  for(const sprite of f.fx.ringSprites){const original=sprite.getMaterialInstance.bind(sprite);sprite.getMaterialInstance=function(){assert.equal(this.sharedMaterial,this.customMaterial);return original();};}
  f.initialize();assert.equal(f.fx.activeCount,0);
});
