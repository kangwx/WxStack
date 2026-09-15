import { _decorator, Color, Component, instantiate, Material, Node, Prefab, Sprite, UITransform, Vec3, Vec4 } from 'cc';

const { ccclass, property } = _decorator;
export const FX_SPARK_CAPACITY = 128;
export const FX_FRAME_CAPACITY = 12;
export const FX_RING_CAPACITY = 8;
const PROJECTION_CACHE_CAPACITY = 256;
export interface FxBlock { x: number; z: number; width: number; depth: number; level: number; hue: number }
export type FxProjection = (x: number, z: number, level: number, out: Vec3) => void;

interface SparkState {
  x: number; y: number; worldX: number; worldZ: number; level: number;
  vx: number; vy: number; life: number; maxLife: number; size: number; trailLength: number;
  color: Color;
}
interface RingState {
  worldX: number; worldZ: number; level: number; life: number; maxLife: number;
  radius: number; color: Color; params: Vec4;
}
interface FrameState {
  block: FxBlock; active: boolean; elapsed: number; delay: number; duration: number;
  startExpansion: number; maxExpansion: number; alpha: number; lineWidth: number;
}
interface SpriteBinding { sprite: Sprite; transform: UITransform; color: Color }

/** Prewarmed Sprite pools. Rings grow from a configured prefab when every slot is active. */
@ccclass('GameplayFxController')
export class GameplayFxController extends Component {
  @property([Sprite]) sparkSprites: Sprite[] = [];
  @property([Sprite]) trailSprites: Sprite[] = [];
  @property([Sprite]) frameSprites: Sprite[] = [];
  @property([Sprite]) ringSprites: Sprite[] = [];
  @property(Prefab) ringPrefab: Prefab | null = null;
  @property(Node) ringRoot: Node | null = null;
  @property(Sprite) flashSprite: Sprite | null = null;

  private readonly sparks: SparkState[] = Array.from({ length: FX_SPARK_CAPACITY }, () => ({
    x: 0, y: 0, worldX: 0, worldZ: 0, level: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
    size: 0, trailLength: 0, color: new Color(),
  }));
  private readonly rings: RingState[] = Array.from({ length: FX_RING_CAPACITY }, () => ({
    worldX: 0, worldZ: 0, level: 0, life: 0, maxLife: 0.3, radius: 10,
    color: new Color(), params: new Vec4(),
  }));
  private readonly frames: FrameState[] = Array.from({ length: FX_FRAME_CAPACITY }, () => ({
    block: { x: 0, z: 0, width: 0, depth: 0, level: 0, hue: 0 }, active: false,
    elapsed: 0, delay: 0, duration: 0, startExpansion: 0, maxExpansion: 0, alpha: 0, lineWidth: 0,
  }));
  private sparkViews: SpriteBinding[] = [];
  private trailViews: SpriteBinding[] = [];
  private frameViews: SpriteBinding[] = [];
  private ringViews: SpriteBinding[] = [];
  private ringMaterials: Material[] = [];
  private flashView!: SpriteBinding;
  private projection!: FxProjection;
  private initialized = false;
  private nextSpark = 0;
  private nextFrame = 0;
  private nextRing = 0;
  private flashAlpha = 0;
  private flashWidth = -1;
  private flashHeight = -1;
  private sparkCount = 0;
  private ringCount = 0;
  private frameCount = 0;
  private visualsDirty = false;
  private flashDirty = false;
  private projectionEpoch = 0;
  private projectionCalls = 0;
  private projectionHits = 0;
  private ringExpansions = 0;
  private ringHighWater = 0;
  private readonly cacheEpoch = new Uint32Array(PROJECTION_CACHE_CAPACITY);
  private readonly cacheWorldX = new Float64Array(PROJECTION_CACHE_CAPACITY);
  private readonly cacheWorldZ = new Float64Array(PROJECTION_CACHE_CAPACITY);
  private readonly cacheLevel = new Float64Array(PROJECTION_CACHE_CAPACITY);
  private readonly cacheScreenX = new Float64Array(PROJECTION_CACHE_CAPACITY);
  private readonly cacheScreenY = new Float64Array(PROJECTION_CACHE_CAPACITY);
  private readonly cacheScreenZ = new Float64Array(PROJECTION_CACHE_CAPACITY);
  private readonly center = new Vec3();
  private readonly anchor = new Vec3();
  private readonly corners = [new Vec3(), new Vec3(), new Vec3(), new Vec3()];

  get activeSparkCount(): number { return this.sparkCount; }
  get activeRingCount(): number { return this.ringCount; }
  get activeFrameCount(): number { return this.frameCount; }
  get activeCount(): number { return this.sparkCount + this.ringCount + this.frameCount; }
  get needsSimulation(): boolean { return this.activeCount > 0; }
  get needsProjection(): boolean { return this.activeCount > 0; }
  get needsRender(): boolean { return this.activeCount > 0 || this.visualsDirty || this.flashDirty || this.flashAlpha > 0; }
  get projectionCallsLastRender(): number { return this.projectionCalls; }
  get projectionCacheHitsLastRender(): number { return this.projectionHits; }
  get ringPoolCapacity(): number { return this.rings.length; }
  get ringExpansionCount(): number { return this.ringExpansions; }
  get peakActiveRingCount(): number { return this.ringHighWater; }

  /** Call once after serialized references are loaded. No nodes or render components are created. */
  initialize(projection: FxProjection): void {
    this.projection = projection;
    if (this.initialized) return;
    this.sparkViews = this.bindSprites(this.sparkSprites, FX_SPARK_CAPACITY, 'sparkSprites');
    this.trailViews = this.bindSprites(this.trailSprites, FX_SPARK_CAPACITY, 'trailSprites');
    this.frameViews = this.bindSprites(this.frameSprites, FX_FRAME_CAPACITY * 2, 'frameSprites');
    this.ringViews = this.bindSprites(this.ringSprites, FX_RING_CAPACITY, 'ringSprites');
    if (!this.ringPrefab || !this.ringRoot) throw new Error('[GameplayFxController] Missing configured ringPrefab/ringRoot');
    if (!this.flashSprite) throw new Error('[GameplayFxController] Missing flashSprite reference');
    this.flashView = this.bindSprite(this.flashSprite, 'flashSprite');
    this.ringMaterials = this.ringSprites.map((sprite, index) => this.bindRingMaterial(sprite, index));
    this.initialized = true;
    this.clear();
  }

  emitImpact(block: FxBlock, perfect: boolean, intensity = 1): void {
    this.requireInitialized();
    const streak = Math.max(1, intensity);
    const energy = 1 + Math.log2(streak);
    const amount = perfect ? Math.min(88, Math.round(17 + streak * 4 + energy * 4)) : 8;
    if (perfect) this.projection(block.x, block.z, block.level, this.center);
    for (let index = 0; index < amount; index++) {
      const spark = this.sparks[this.nextSpark];
      this.nextSpark = (this.nextSpark + 1) % FX_SPARK_CAPACITY;
      if (spark.life <= 0) this.sparkCount++;
      const angle = Math.PI * 2 * index / amount + Math.random() * 0.28;
      const fast = perfect && index % 5 === 0;
      const baseSpeed = perfect ? 96 + energy * 15 + Math.random() * (72 + energy * 16)
        : 58 + Math.random() * 45;
      const speed = baseSpeed * (fast ? 1.3 : 1);
      const life = Math.min(0.72, 0.45 + (energy - 1) * 0.065) * (fast ? 0.72 : 1);
      const edge = -1 + 2 * (index + 0.5) / amount;
      spark.worldX = block.x + (perfect ? (index % 2 === 0 ? 1 : edge) * block.width * 0.5 : 0);
      spark.worldZ = block.z + (perfect ? (index % 2 === 0 ? edge : 1) * block.depth * 0.5 : 0);
      if (perfect) this.projection(spark.worldX, spark.worldZ, block.level, this.anchor);
      const dx = perfect ? this.anchor.x - this.center.x : Math.cos(angle);
      const dy = perfect ? this.anchor.y - this.center.y : Math.sin(angle);
      const length = perfect ? Math.max(1, Math.hypot(dx, dy)) : 1;
      spark.x = spark.y = 0;
      spark.level = perfect ? block.level : block.level + 1;
      spark.vx = dx / length * speed;
      spark.vy = dy / length * speed + 30;
      spark.life = spark.maxLife = perfect ? life : 0.48;
      spark.size = perfect ? (fast ? 2.4 + Math.random() * (2 + energy * 0.36)
        : 3.2 + Math.random() * (3.4 + energy * 0.78)) : 2 + Math.random() * 3;
      spark.trailLength = perfect && (fast || index % 3 === 0)
        ? (fast ? 14 + energy * 4 : 8 + energy * 3) + Math.random() * 5 : 0;
      if (perfect) {
        const accent = !fast && streak >= 3 && index % 4 === 0;
        spark.color.set(255, accent ? 238 : 255, accent ? 166 : 255, 255);
      } else this.hslToColor(spark.color, block.hue + 18, 82, 74);
    }
    if (!perfect) {
      const ring = this.rings[this.acquireRing()];
      this.ringCount++;
      this.ringHighWater = Math.max(this.ringHighWater, this.ringCount);
      ring.worldX = block.x; ring.worldZ = block.z; ring.level = block.level + 1;
      ring.life = ring.maxLife = 0.3; ring.radius = 10;
      this.hslToColor(ring.color, block.hue, 78, 80);
    }
    this.visualsDirty = true;
  }

  emitPerfectFrames(block: FxBlock, intensity: number, reducedMotion: boolean): void {
    this.requireInitialized();
    const streak = Math.max(1, intensity);
    const energy = 1 + Math.log2(streak);
    const count = reducedMotion ? 1 : Math.min(6, Math.max(1, Math.ceil(Math.log2(streak + 1))));
    const alpha = reducedMotion ? Math.min(220, 140 + (energy - 1) * 18)
      : Math.min(255, 164 + (energy - 1) * 25);
    for (let wave = 0; wave < count; wave++) {
      const frame = this.frames[this.nextFrame];
      this.nextFrame = (this.nextFrame + 1) % FX_FRAME_CAPACITY;
      if (!frame.active) this.frameCount++;
      const copy = frame.block;
      copy.x = block.x; copy.z = block.z; copy.width = block.width; copy.depth = block.depth;
      copy.level = block.level; copy.hue = block.hue;
      frame.active = true; frame.elapsed = 0;
      frame.delay = reducedMotion ? 0 : wave * 0.045;
      frame.duration = reducedMotion ? 0.24 : 0.34 + Math.min(0.16, (energy - 1) * 0.03) + wave * 0.045;
      frame.startExpansion = reducedMotion ? 10 : 5 + wave * 4;
      frame.maxExpansion = reducedMotion ? 10 : 42 + (energy - 1) * 15 + wave * 11;
      frame.alpha = Math.max(42, alpha * Math.pow(0.72, wave));
      frame.lineWidth = reducedMotion ? Math.min(5, 2.5 + (energy - 1) * 0.35)
        : Math.max(1.7, 2.8 + Math.min(2.2, (energy - 1) * 0.48) - wave * 0.16);
    }
    this.visualsDirty = true;
  }

  /** Intentionally not Cocos update(): StackGame advances this with its existing simulation substeps. */
  step(dt: number): void {
    if (!this.initialized || !this.needsSimulation || !Number.isFinite(dt) || dt <= 0) return;
    const damping = Math.pow(0.18, dt);
    for (let i = 0; i < FX_SPARK_CAPACITY; i++) {
      const spark = this.sparks[i];
      if (spark.life <= 0) continue;
      spark.life -= dt; spark.x += spark.vx * dt; spark.y += spark.vy * dt;
      spark.vy -= 190 * dt; spark.vx *= damping;
      if (spark.life <= 0) this.sparkCount--;
    }
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      if (ring.life > 0) { ring.life -= dt; ring.radius += dt * 190; if (ring.life <= 0) this.ringCount--; }
    }
    for (let i = 0; i < FX_FRAME_CAPACITY; i++) {
      const frame = this.frames[i];
      if (!frame.active) continue;
      frame.elapsed += dt;
      if (frame.elapsed >= frame.delay + frame.duration) { frame.active = false; this.frameCount--; }
    }
    this.visualsDirty = true;
  }

  /** Project only active effects; every output vector, colour and material parameter is reused. */
  render(width: number, height: number): void {
    this.projectionCalls = this.projectionHits = 0;
    if (!this.initialized || !this.needsRender) return;
    this.projectionEpoch = (this.projectionEpoch + 1) >>> 0;
    if (this.projectionEpoch === 0) { this.cacheEpoch.fill(0); this.projectionEpoch = 1; }
    if (this.visualsDirty || this.activeCount > 0) {
    for (let i = 0; i < FX_FRAME_CAPACITY; i++) this.renderFrame(i, width);
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      const view = this.ringViews[i];
      if (ring.life <= 0) { this.hide(view); continue; }
      const ratio = Math.max(0, ring.life / ring.maxLife);
      const lineWidth = 1 + ratio * 2.5;
      const diameter = (ring.radius + lineWidth * 0.5 + 1) * 2;
      this.projectCached(ring.worldX, ring.worldZ, ring.level, this.anchor);
      this.paint(view, this.anchor.x, this.anchor.y, diameter, diameter,
        ring.color.r, ring.color.g, ring.color.b, Math.round(ring.color.a * ratio));
      ring.params.set(ring.radius, lineWidth, diameter, 0.65);
      this.ringMaterials[i].setProperty('ringParams', ring.params);
    }
    for (let i = 0; i < FX_SPARK_CAPACITY; i++) {
      const spark = this.sparks[i];
      const view = this.sparkViews[i];
      const trailView = this.trailViews[i];
      if (spark.life <= 0) { this.hide(view); this.hide(trailView); continue; }
      const ratio = Math.max(0, spark.life / spark.maxLife);
      const visibility = Math.pow(ratio, 0.65);
      const alpha = Math.round(255 * visibility);
      const size = Math.max(0.9, spark.size * (0.42 + ratio * 0.58));
      this.projectCached(spark.worldX, spark.worldZ, spark.level, this.anchor);
      const x = this.anchor.x + spark.x; const y = this.anchor.y + spark.y;
      if (spark.trailLength > 0) {
        const speed = Math.max(1, Math.hypot(spark.vx, spark.vy));
        const trail = spark.trailLength * visibility;
        this.line(trailView, x - spark.vx / speed * trail, y - spark.vy / speed * trail, x, y,
          Math.max(1, size * 0.58), spark.color.r, spark.color.g, spark.color.b, Math.round(alpha * 0.72));
      } else this.hide(trailView);
      this.paint(view, x, y, size, size, spark.color.r, spark.color.g, spark.color.b, alpha);
    }
    }
    if (this.flashAlpha <= 0) this.hide(this.flashView);
    else {
      if (width !== this.flashWidth || height !== this.flashHeight) {
        this.flashView.transform.setContentSize(width, height);
        this.flashWidth = width; this.flashHeight = height;
      }
      if (this.flashDirty || !this.flashView.sprite.node.active) {
        this.flashView.color.set(255, 255, 255, Math.round(this.flashAlpha * 255));
        this.flashView.sprite.color = this.flashView.color;
      }
      this.flashView.sprite.node.active = true;
    }
    this.visualsDirty = this.flashDirty = false;
  }

  setFlash(alpha: number): void {
    const next = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0;
    if (next !== this.flashAlpha) { this.flashAlpha = next; this.flashDirty = true; }
  }

  clearPerfectFrames(): void {
    for (let i = 0; i < FX_FRAME_CAPACITY; i++) {
      this.frames[i].active = false;
      if (this.initialized) { this.hide(this.frameViews[i * 2]); this.hide(this.frameViews[i * 2 + 1]); }
    }
    this.nextFrame = 0;
    this.frameCount = 0;
  }

  clear(): void {
    for (let i = 0; i < FX_SPARK_CAPACITY; i++) {
      this.sparks[i].life = 0;
      if (this.initialized) { this.hide(this.sparkViews[i]); this.hide(this.trailViews[i]); }
    }
    for (let i = 0; i < this.rings.length; i++) {
      this.rings[i].life = 0;
      if (this.initialized) this.hide(this.ringViews[i]);
    }
    this.clearPerfectFrames();
    this.nextSpark = this.nextRing = 0;
    this.sparkCount = this.ringCount = 0;
    this.flashAlpha = 0;
    if (this.initialized) this.hide(this.flashView);
    this.visualsDirty = this.flashDirty = false;
  }

  onDisable(): void { this.clear(); }

  /** Every live ring keeps its full lifetime; exceptional bursts grow from the authored prefab. */
  private acquireRing(): number {
    for (let offset = 0; offset < this.rings.length; offset++) {
      const index = (this.nextRing + offset) % this.rings.length;
      if (this.rings[index].life <= 0) {
        this.nextRing = (index + 1) % this.rings.length;
        return index;
      }
    }
    const index = this.rings.length;
    const node = instantiate(this.ringPrefab!);
    node.active = false;
    node.setParent(this.ringRoot!);
    const sprite = node.getComponent(Sprite);
    if (!sprite) { node.destroy(); throw new Error('[GameplayFxController] ringPrefab root needs its configured Sprite'); }
    const view = this.bindSprite(sprite, `ringSprites[${index}]`);
    const material = this.bindRingMaterial(sprite, index);
    this.ringSprites.push(sprite); this.ringViews.push(view); this.ringMaterials.push(material);
    this.rings.push({ worldX: 0, worldZ: 0, level: 0, life: 0, maxLife: 0.3, radius: 10,
      color: new Color(), params: new Vec4() });
    this.ringExpansions++;
    this.nextRing = 0;
    return index;
  }

  private bindRingMaterial(sprite: Sprite, index: number): Material {
    if (!sprite.customMaterial) throw new Error(`[GameplayFxController] ringSprites[${index}] needs impact-ring material`);
    // Root initialization may precede Sprite.onLoad; establish the authored material first.
    sprite.setSharedMaterial(sprite.customMaterial, 0);
    const instance = sprite.getMaterialInstance(0);
    if (!instance) throw new Error(`[GameplayFxController] ringSprites[${index}] material is unavailable`);
    return instance;
  }

  private renderFrame(index: number, width: number): void {
    const frame = this.frames[index];
    const a = this.frameViews[index * 2]; const b = this.frameViews[index * 2 + 1];
    if (!frame.active || frame.elapsed < frame.delay) { this.hide(a); this.hide(b); return; }
    const block = frame.block;
    const progress = Math.min(1, (frame.elapsed - frame.delay) / frame.duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const fadeIn = Math.min(1, (frame.elapsed - frame.delay) / 0.035);
    const fade = fadeIn * Math.pow(1 - progress, 1.18);
    this.projectCached(block.x, block.z, block.level, this.center);
    this.projectCorners(block, 0);
    let halfWidth = 0;
    for (let i = 0; i < 4; i++) halfWidth = Math.max(halfWidth, Math.abs(this.corners[i].x - this.center.x));
    const room = Math.max(0, width * 0.5 - 32 - Math.abs(this.center.x) - halfWidth);
    const max = Math.min(frame.maxExpansion, room);
    const start = Math.min(frame.startExpansion, max);
    const pixels = start + (max - start) * eased;
    const scale = Math.max(1, halfWidth * 2 / (block.width + block.depth));
    this.projectCorners(block, pixels / scale);
    const alpha = Math.round(frame.alpha * fade);
    // The camera sees +X/+Z edges. Rear edges and contact-plane fill remain absent.
    this.line(a, this.corners[1].x, this.corners[1].y, this.corners[2].x, this.corners[2].y,
      frame.lineWidth, 255, 255, 255, alpha);
    this.line(b, this.corners[2].x, this.corners[2].y, this.corners[3].x, this.corners[3].y,
      frame.lineWidth, 255, 255, 255, alpha);
  }

  private projectCorners(block: FxBlock, expansion: number): void {
    const halfW = (block.width + expansion) * 0.5;
    const halfD = (block.depth + expansion) * 0.5;
    this.projectCached(block.x - halfW, block.z - halfD, block.level, this.corners[0]);
    this.projectCached(block.x + halfW, block.z - halfD, block.level, this.corners[1]);
    this.projectCached(block.x + halfW, block.z + halfD, block.level, this.corners[2]);
    this.projectCached(block.x - halfW, block.z + halfD, block.level, this.corners[3]);
  }

  /** Exact world coordinates share a projected anchor only within this render call. */
  private projectCached(x: number, z: number, level: number, out: Vec3): void {
    const mask = PROJECTION_CACHE_CAPACITY - 1;
    let slot = (((x * 73856093) | 0) ^ ((z * 19349663) | 0) ^ ((level * 83492791) | 0)) & mask;
    for (let probe = 0; probe < PROJECTION_CACHE_CAPACITY; probe++) {
      if (this.cacheEpoch[slot] !== this.projectionEpoch) {
        this.projection(x, z, level, out); this.projectionCalls++;
        this.cacheEpoch[slot] = this.projectionEpoch;
        this.cacheWorldX[slot] = x; this.cacheWorldZ[slot] = z; this.cacheLevel[slot] = level;
        this.cacheScreenX[slot] = out.x; this.cacheScreenY[slot] = out.y; this.cacheScreenZ[slot] = out.z;
        return;
      }
      if (this.cacheWorldX[slot] === x && this.cacheWorldZ[slot] === z && this.cacheLevel[slot] === level) {
        out.set(this.cacheScreenX[slot], this.cacheScreenY[slot], this.cacheScreenZ[slot]);
        this.projectionHits++; return;
      }
      slot = (slot + 1) & mask;
    }
    // Exceptionally dense bursts retain exact rendering even when the fixed cache is full.
    this.projection(x, z, level, out); this.projectionCalls++;
  }

  private line(view: SpriteBinding, x1: number, y1: number, x2: number, y2: number,
    width: number, r: number, g: number, b: number, alpha: number): void {
    this.paint(view, (x1 + x2) * 0.5, (y1 + y2) * 0.5, Math.hypot(x2 - x1, y2 - y1), width, r, g, b, alpha);
    view.sprite.node.angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  }

  private paint(view: SpriteBinding, x: number, y: number, width: number, height: number,
    r: number, g: number, b: number, alpha: number): void {
    view.sprite.node.setPosition(x, y, 0);
    view.transform.setContentSize(width, height);
    view.color.set(r, g, b, alpha);
    view.sprite.color = view.color;
    if (!view.sprite.node.active) view.sprite.node.active = true;
  }

  private hide(view: SpriteBinding): void { if (view.sprite.node.active) view.sprite.node.active = false; }

  private bindSprites(sprites: Sprite[], expected: number, field: string): SpriteBinding[] {
    if (sprites.length !== expected) throw new Error(`[GameplayFxController] ${field} requires ${expected} serialized Sprites`);
    return sprites.map((sprite, index) => this.bindSprite(sprite, `${field}[${index}]`));
  }

  private bindSprite(sprite: Sprite, field: string): SpriteBinding {
    const transform = sprite?.node?.getComponent(UITransform);
    if (!transform) throw new Error(`[GameplayFxController] Missing ${field} Sprite/UITransform`);
    if (!sprite.spriteFrame) throw new Error(`[GameplayFxController] Missing ${field} SpriteFrame`);
    return { sprite, transform, color: new Color(255, 255, 255, 255) };
  }

  private requireInitialized(): void {
    if (!this.initialized) throw new Error('[GameplayFxController] initialize(projection) must run before emission');
  }

  private hslToColor(out: Color, hue: number, saturation: number, lightness: number): void {
    const h = ((hue % 360) + 360) % 360 / 360;
    const s = Math.max(0, Math.min(1, saturation / 100));
    const l = Math.max(0, Math.min(1, lightness / 100));
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    out.set(Math.round(this.hueChannel(h + 1 / 3, p, q) * 255),
      Math.round(this.hueChannel(h, p, q) * 255), Math.round(this.hueChannel(h - 1 / 3, p, q) * 255), 255);
  }

  private hueChannel(t: number, p: number, q: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
}
