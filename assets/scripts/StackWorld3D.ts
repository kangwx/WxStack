import {
  BoxCollider,
  Camera,
  Color,
  DirectionalLight,
  director,
  ERigidBodyType,
  Layers,
  gfx,
  Material,
  Mat4,
  Mesh,
  MeshRenderer,
  Node,
  PhysicsSystem,
  RigidBody,
  Vec3,
  primitives,
  utils,
  view,
} from 'cc';
import { CREAM_STYLE, CREAM_BRIGHT_WORLD, CREAM_BRIGHT_COLOR_SCALE, CreamVariant, CreamWorldPalette, RGB } from './CreamStyle';

export interface WorldBlockState {
  x: number;
  z: number;
  width: number;
  depth: number;
  level: number;
}

export type DropResult = 'landed' | 'missed' | null;
export interface WorldDiagnostics {
  activeBlocks: number;
  looseCount: number;
  fragmentPoolCapacity: number;
  fragmentPoolAvailable: number;
  growthCount: number;
  isInstancingEnabled: boolean;
}

const DEFAULT_LAYER = Layers.BitMask.DEFAULT;
const UI_LAYER = Layers.BitMask.UI_2D;
const PROFILER_LAYER = Layers.BitMask.PROFILER;
// Keep the moving block close to the landing surface so its footprint can be
// compared directly with the block below, while retaining a short physical drop.
const DROP_HEIGHT = 0.05;
const DROP_SECONDS = 0.09;
const FRAGMENT_LIFETIME = 5;
const BLOCK_VISUAL_NAME = 'BlockVisual';
const PERFECT_PULSE_DURATION = 0.24;
const BACKGROUND_BASE_DISTANCE = 38;
const FRAGMENT_POOL_PREWARM = 32;

interface BlockView {
  visual: Node;
  renderer: MeshRenderer;
  body: RigidBody;
  collider: BoxCollider;
  pool: 'block' | 'fragment';
}

type ToyColor = Exclude<keyof CreamWorldPalette, 'blockPalette'> | number;

/**
 * Owns the perspective camera, real meshes and Ammo rigid bodies used by the
 * stack game. UI remains on the Canvas and is rendered by its original camera.
 */
export class StackWorld3D {
  private readonly worldRoot: Node;
  private readonly blockRoot: Node;
  private readonly cameraNode: Node;
  private readonly camera: Camera;
  private readonly uiCamera: Camera | null;
  private readonly backgroundNode: Node;
  private readonly backgroundRenderer: MeshRenderer;
  private readonly blockNodes = new Map<WorldBlockState, Node>();
  private readonly looseNodes = new Map<Node, number>();
  private readonly perfectPulses = new Map<Node, number>();
  private readonly blockViews = new Map<Node, BlockView>();
  private readonly blockPool: Node[] = [];
  private readonly fragmentPool: Node[] = [];
  private fragmentCapacity = 0;
  private fragmentGrowthCount = 0;
  readonly instancingEnabled: boolean;
  private readonly blockMesh: Mesh;
  private readonly toyMaterials = new Set<Material>();
  private readonly toyMaterialColors = new Map<Material, ToyColor>();
  private readonly blockMaterials = new Map<number, Material>();
  private readonly presentationMaterials = new Map<Material, { material: Material; color: Color }>();
  private presentationOpacity = 1;
  private readonly ownedMaterials = new Set<Material>();
  private appearance: CreamVariant = 'standard';
  private appearancePalette: CreamWorldPalette = CREAM_STYLE;
  private appearanceColorScale = 1;
  private droppingBlock: WorldBlockState | null = null;
  private droppingNode: Node | null = null;
  private dropElapsed = 0;
  private dropOverlapsSupport = false;
  private cameraTargetY = 1.35;
  private cameraCurrentY = 1.35;
  private compositionOffsetX = 0;
  private homePresentation = false;
  private overviewTopLevel: number | null = null;
  private paused = false;
  private projectionNode: Node | null = null;
  private projectionReady = false;
  private readonly projectionWorld = new Vec3();
  private readonly projectionScreen = new Vec3();
  private readonly projectionUI = new Vec3();
  private readonly projectionInverse = new Mat4();
  private readonly cameraTarget = new Vec3();
  private lastCameraX = NaN;
  private lastCameraY = NaN;
  private lastCameraZ = NaN;
  private lastFocusY = NaN;
  private lastFocusX = NaN;
  private backdropWidth = NaN;
  private backdropHeight = NaN;
  private backdropDistance = NaN;

  get activeBlocks(): number { return this.blockNodes.size; }
  get looseCount(): number { return this.looseNodes.size; }
  get fragmentPoolCapacity(): number { return this.fragmentCapacity; }
  get fragmentPoolAvailable(): number { return this.fragmentPool.length; }
  /** Lifetime overflow allocations beyond the prewarmed fragment pool. */
  get growthCount(): number { return this.fragmentGrowthCount; }
  get isInstancingEnabled(): boolean { return this.instancingEnabled; }
  /** Snapshot allocation is reserved for explicit diagnostics, not the frame loop. */
  getDiagnostics(): Readonly<WorldDiagnostics> {
    return Object.freeze({ activeBlocks: this.activeBlocks, looseCount: this.looseCount,
      fragmentPoolCapacity: this.fragmentPoolCapacity, fragmentPoolAvailable: this.fragmentPoolAvailable,
      growthCount: this.growthCount, isInstancingEnabled: this.isInstancingEnabled });
  }

  constructor(canvasNode: Node, private readonly blockHeight: number) {
    const device = director?.root?.device;
    this.instancingEnabled = Boolean(gfx?.Feature && device?.hasFeature(gfx.Feature.INSTANCED_ARRAYS));
    const scene = canvasNode.scene;
    this.worldRoot = new Node('StackWorld3D');
    this.worldRoot.layer = DEFAULT_LAYER;
    this.blockMesh = utils.createMesh(this.creamBlockGeometry());
    if (scene) {
      scene.addChild(this.worldRoot);
    }

    this.blockRoot = new Node('PhysicalBlocks');
    this.blockRoot.layer = DEFAULT_LAYER;
    this.worldRoot.addChild(this.blockRoot);

    this.cameraNode = new Node('PerspectiveCamera');
    this.cameraNode.layer = DEFAULT_LAYER;
    this.worldRoot.addChild(this.cameraNode);
    this.camera = this.cameraNode.addComponent(Camera);
    this.camera.projection = Camera.ProjectionType.PERSPECTIVE;
    this.camera.fov = 34;
    this.camera.near = 0.1;
    this.camera.far = 600;
    this.camera.priority = -10;
    this.camera.visibility = DEFAULT_LAYER;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = new Color(...CREAM_STYLE.backgroundColor);

    this.backgroundNode = new Node('CreamBackground3D');
    // Bind a material before activation so the first frame cannot flash purple.
    this.backgroundNode.active = false;
    this.backgroundNode.layer = DEFAULT_LAYER;
    this.cameraNode.addChild(this.backgroundNode);
    this.backgroundNode.setPosition(0, 0, -BACKGROUND_BASE_DISTANCE);
    this.backgroundNode.setScale(23, 39, 0.04);
    this.backgroundRenderer = this.backgroundNode.addComponent(MeshRenderer);
    this.backgroundRenderer.mesh = utils.createMesh(primitives.box());
    const background = new Material('StackBackground3D');
    background.initialize({ effectName: 'builtin-unlit' });
    background.setProperty('mainColor', new Color(...CREAM_STYLE.backgroundColor));
    this.backgroundRenderer.setMaterial(background, 0);
    // Use the camera clear color for a faithful cream backdrop; ACES tone mapping
    // on the unlit plane would turn the same palette color gray.
    this.backgroundRenderer.enabled = false;
    this.ownedMaterials.add(background);
    this.backgroundNode.active = true;
    for (let level = 0; level < CREAM_STYLE.blockPalette.length; level += 1) {
      this.materialForLevel(level);
    }
    this.createToyStage();
    for (let index = 0; index < FRAGMENT_POOL_PREWARM; index += 1) {
      const node = this.createBlockNode(`PooledFragment-${index}`, index, 'fragment');
      // Trigger Cocos onLoad once so Ammo bodies are allocated before first impact.
      // Disable synchronously before a rendered frame or physics step can see them.
      node.active = true;
      node.active = false;
      this.fragmentPool.push(node);
    }

    const lightNode = new Node('KeyLight');
    lightNode.layer = DEFAULT_LAYER;
    this.worldRoot.addChild(lightNode);
    lightNode.setRotationFromEuler(-52, -38, 0);
    const light = lightNode.addComponent(DirectionalLight);
    light.color = new Color(255, 245, 220, 255);
    light.illuminance = 72000;

    const rimNode = new Node('RimLight');
    rimNode.layer = DEFAULT_LAYER;
    this.worldRoot.addChild(rimNode);
    rimNode.setRotationFromEuler(-28, 142, 0);
    const rim = rimNode.addComponent(DirectionalLight);
    rim.color = new Color(176, 211, 255, 255);
    rim.illuminance = 18000;

    const uiCamera = canvasNode.getChildByName('Camera')?.getComponent(Camera);
    this.uiCamera = uiCamera ?? null;
    if (uiCamera) {
      uiCamera.priority = 10;
      uiCamera.visibility = UI_LAYER | PROFILER_LAYER;
      uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
    }

    PhysicsSystem.instance.gravity = new Vec3(0, -24, 0);
    PhysicsSystem.instance.fixedTimeStep = 1 / 60;
    PhysicsSystem.instance.maxSubSteps = 3;
    this.updateCameraTransform(0, 0);
  }

  sync(stack: readonly WorldBlockState[], current: WorldBlockState | null): void {
    this.restoreStack(stack, current);
  }

  /** Reconcile structure only on initial load, restore or truncation; never per frame. */
  restoreStack(stack: readonly WorldBlockState[], current: WorldBlockState | null = null): void {
    const visible = new Set<WorldBlockState>(stack);
    if (current) {
      visible.add(current);
    }

    for (const [block, node] of this.blockNodes) {
      if (!visible.has(block) && block !== this.droppingBlock) {
        this.recycleBlockNode(node);
        this.blockNodes.delete(block);
      }
    }

    for (const block of stack) {
      this.updateSettledBlock(block);
    }

    if (current) {
      if (current !== this.droppingBlock) {
        this.spawnMovingBlock(current);
      }
    }
  }

  spawnMovingBlock(block: WorldBlockState): void {
    const node = this.ensureBlockNode(block);
    this.makeKinematic(node);
    node.setScale(block.width, this.blockHeight, block.depth);
    node.setRotationFromEuler(0, 0, 0);
    this.updateMovingBlock(block);
  }

  updateMovingBlock(block: WorldBlockState): void {
    if (block === this.droppingBlock) return;
    const node = this.blockNodes.get(block);
    if (node) node.setPosition(block.x, this.movingBlockY(block), block.z);
  }

  updateSettledBlock(block: WorldBlockState): void {
    const node = this.ensureBlockNode(block);
    this.makeStatic(node);
    this.positionStableBlock(node, block);
  }

  removeBlock(block: WorldBlockState): void {
    const node = this.blockNodes.get(block);
    if (!node) return;
    if (this.droppingBlock === block) {
      this.droppingBlock = null;
      this.droppingNode = null;
      this.dropElapsed = 0;
      this.dropOverlapsSupport = false;
    }
    this.blockNodes.delete(block);
    this.recycleBlockNode(node);
  }

  beginDrop(block: WorldBlockState, support: WorldBlockState): void {
    const node = this.ensureBlockNode(block);
    // Retained blocks are governed by footprint rules. Physics remains on detached pieces.
    this.makeKinematic(node);
    node.setScale(block.width, this.blockHeight, block.depth);
    node.setPosition(block.x, this.movingBlockY(block), block.z);
    node.setRotationFromEuler(0, 0, 0);
    const supportNode = this.ensureBlockNode(support);
    this.makeStatic(supportNode);
    this.positionStableBlock(supportNode, support);
    this.droppingBlock = block;
    this.droppingNode = node;
    this.dropOverlapsSupport = Math.abs(block.x - support.x) < (block.width + support.width) * 0.5
      && Math.abs(block.z - support.z) < (block.depth + support.depth) * 0.5;
    this.dropElapsed = 0;
  }

  pollDrop(dt: number): DropResult {
    if (!this.droppingBlock || !this.droppingNode) return null;
    if (this.paused) return null;
    this.dropElapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const progress = Math.min(1, this.dropElapsed / DROP_SECONDS);
    const block = this.droppingBlock;
    const y = this.stableBlockY(block) + DROP_HEIGHT * (1 - progress * progress);
    this.droppingNode.setPosition(block.x, y, block.z);
    if (progress < 1) return null;
    return this.dropOverlapsSupport ? 'landed' : 'missed';
  }

  settle(block: WorldBlockState): void {
    const node = this.blockNodes.get(block);
    if (!node) {
      return;
    }
    this.droppingBlock = null;
    this.droppingNode = null;
    this.makeStatic(node);
    this.positionStableBlock(node, block);
  }

  pulsePerfect(block: WorldBlockState): void {
    const node = this.blockNodes.get(block);
    if (!node?.isValid) {
      return;
    }
    this.perfectPulses.set(node, 0);
    this.blockVisual(node).setScale(1.015, 1.008, 1.015);
  }

  releaseMiss(block: WorldBlockState, axis: 'x' | 'z', direction: number): void {
    const node = this.blockNodes.get(block);
    if (!node) {
      return;
    }
    this.droppingBlock = null;
    this.droppingNode = null;
    this.blockNodes.delete(block);
    this.looseNodes.set(node, 0);
    const body = this.blockViews.get(node)!.body;
    body.type = ERigidBodyType.DYNAMIC;
    body.useCCD = true;
    body.useGravity = true;
    body.linearFactor = Vec3.ONE;
    body.angularFactor = Vec3.ONE;
    body.angularDamping = 0.08;
    const lateral = Math.sign(direction || 1) * 2.4;
    body.setLinearVelocity(new Vec3(axis === 'x' ? lateral : 0, -1.2, axis === 'z' ? lateral : 0));
    body.setAngularVelocity(new Vec3(axis === 'z' ? 1.5 : 0.5, 0.7, axis === 'x' ? -1.5 : -0.5));
    body.wakeUp();
  }

  spawnFragment(fragment: WorldBlockState, axis: 'x' | 'z', direction: number): void {
    if (fragment.width <= 0.015 || fragment.depth <= 0.015) {
      return;
    }
    const node = this.acquireBlockNode(`CutFragment-${fragment.level}`, fragment.level, 'fragment');
    this.looseNodes.set(node, 0);
    node.setScale(fragment.width, this.blockHeight, fragment.depth);
    const sign = Math.sign(direction || 1);
    // A small clearance prevents the cut faces from immediately re-contacting.
    node.setPosition(
      fragment.x + (axis === 'x' ? sign * 0.045 : 0),
      this.stableBlockY(fragment) + 0.03,
      fragment.z + (axis === 'z' ? sign * 0.045 : 0),
    );
    const body = this.blockViews.get(node)!.body;
    body.type = ERigidBodyType.DYNAMIC;
    body.mass = Math.max(0.18, fragment.width * fragment.depth * 0.06);
    body.useCCD = true;
    body.useGravity = true;
    body.linearDamping = 0.03;
    body.angularDamping = 0.08;
    body.linearFactor = Vec3.ONE;
    body.angularFactor = Vec3.ONE;
    const impulse = sign * 3.2;
    body.setLinearVelocity(new Vec3(axis === 'x' ? impulse : 0, 1.4, axis === 'z' ? impulse : 0));
    body.setAngularVelocity(new Vec3(axis === 'z' ? 1.7 : 0.4, 0.75, axis === 'x' ? -1.7 : -0.4));
    body.wakeUp();
  }

  tick(dt: number, topLevel: number, shakeX: number, shakeY: number): void {
    this.projectionReady = false;
    this.cameraTargetY = this.overviewTopLevel === null
      ? Math.max(1.35, topLevel * this.blockHeight - 1.15)
      : Math.max(0.9, (this.overviewTopLevel + 1) * this.blockHeight * 0.5);
    const followSpeed = this.overviewTopLevel === null ? 4.8 : 6.4;
    const follow = 1 - Math.exp(-followSpeed * Math.max(0, dt));
    this.cameraCurrentY += (this.cameraTargetY - this.cameraCurrentY) * follow;
    this.updateCameraTransform(shakeX, shakeY);

    if (!this.paused) {
      this.updatePerfectPulses(dt);
    }

    for (const [node, age] of this.looseNodes) {
      this.looseNodes.set(node, age + dt);
      if (!node.isValid || node.position.y < -18 || age + dt >= FRAGMENT_LIFETIME) {
        this.looseNodes.delete(node);
        if (node.isValid) {
          this.recycleBlockNode(node);
        }
      }
    }
  }

  setCompositionOffset(offsetX: number): void {
    this.compositionOffsetX = Number.isFinite(offsetX) ? offsetX : 0;
    this.updateCameraTransform(0, 0);
  }

  /** Leave breathing room around the home tower without altering gameplay framing. */
  setHomePresentation(enabled: boolean): void {
    if (this.homePresentation === enabled) return;
    this.homePresentation = enabled;
    this.updateCameraTransform(0, 0);
  }

  setOverview(topLevel: number | null): void {
    this.overviewTopLevel = topLevel === null || !Number.isFinite(topLevel)
      ? null
      : Math.max(0, topLevel);
    if (this.overviewTopLevel !== null) {
      this.cameraTargetY = Math.max(0.9, (this.overviewTopLevel + 1) * this.blockHeight * 0.5);
    }
    this.updateCameraTransform(0, 0);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    PhysicsSystem.instance.enable = !paused;
  }

  /** Recolor existing shared materials without replacing meshes or game state. */
  setAppearance(variant: CreamVariant): void {
    const next = variant === 'bright' ? 'bright' : 'standard';
    if (next === this.appearance) return;
    this.appearance = next;
    this.appearancePalette = next === 'bright' ? CREAM_BRIGHT_WORLD : CREAM_STYLE;
    this.appearanceColorScale = next === 'bright' ? CREAM_BRIGHT_COLOR_SCALE : 1;
    for (const [level, material] of this.blockMaterials) {
      this.updateMaterialAppearance(material, this.appearancePalette.blockPalette[level]);
    }
    for (const [material, color] of this.toyMaterialColors) {
      this.updateMaterialAppearance(material, this.toyColor(color));
    }
    // Both visible and pooled fragments use the same eight block materials.
    // Update cached transparent copies too, including a transition at opacity 0.
    for (const [opaque, entry] of this.presentationMaterials) {
      const color = opaque.getProperty('mainColor') as Color;
      entry.color = color;
      entry.material.setProperty('mainColor', new Color(color.r, color.g, color.b,
        Math.round(color.a * this.presentationOpacity)));
      entry.material.setProperty('colorScale', new Vec3(this.appearanceColorScale,
        this.appearanceColorScale, this.appearanceColorScale));
    }
  }

  private updateMaterialAppearance(material: Material, rgb: RGB): void {
    material.setProperty('mainColor', new Color(...rgb));
    material.setProperty('colorScale', new Vec3(this.appearanceColorScale,
      this.appearanceColorScale, this.appearanceColorScale));
  }

  private toyColor(color: ToyColor): RGB {
    return typeof color === 'number' ? this.appearancePalette.blockPalette[color]
      : this.appearancePalette[color];
  }

  /** Render-only fade: the cream background, rigid bodies and camera stay intact. */
  setPresentationOpacity(opacity: number): void {
    const next = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
    if (next === this.presentationOpacity) return;
    const rebind = (next < 1) !== (this.presentationOpacity < 1)
      || (next > 0) !== (this.presentationOpacity > 0);
    this.presentationOpacity = next;
    for (const { material, color } of this.presentationMaterials.values()) {
      material.setProperty('mainColor', new Color(color.r, color.g, color.b, Math.round(color.a * next)));
    }
    if (rebind) {
      for (const [block, node] of this.blockNodes) this.applyBlockMaterial(node, block.level);
      for (const node of this.looseNodes.keys()) {
        if (node.isValid) this.applyBlockMaterial(node, Number(node.name.split('-').pop()) || 0);
      }
    }
  }

  private presentationMaterial(opaque: Material): Material {
    if (this.presentationOpacity === 1) return opaque;
    let entry = this.presentationMaterials.get(opaque);
    if (!entry) {
      const color = opaque.getProperty('mainColor') as Color;
      const material = new Material('StackPresentationFade');
      // Built-in transparent technique; shared/cached per original material,
      // never a full-screen pass and never a material allocation per frame.
      material.initialize({
        effectName: 'builtin-unlit', technique: 1,
        defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: false },
      });
      material.setProperty('mainColor', new Color(color.r, color.g, color.b, Math.round(color.a * this.presentationOpacity)));
      material.setProperty('colorScale', new Vec3(this.appearanceColorScale,
        this.appearanceColorScale, this.appearanceColorScale));
      entry = { material, color };
      this.presentationMaterials.set(opaque, entry);
      this.ownedMaterials.add(material);
    }
    return entry.material;
  }

  reset(): void {
    // Keep presentationOpacity and homePresentation across resets: the caller
    // controls the destination framing while incoming meshes remain invisible.
    this.droppingBlock = null;
    this.droppingNode = null;
    this.dropOverlapsSupport = false;
    this.dropElapsed = 0;
    for (const node of this.blockNodes.values()) {
      this.recycleBlockNode(node);
    }
    for (const node of this.looseNodes.keys()) {
      if (node.isValid) {
        this.recycleBlockNode(node);
      }
    }
    this.blockNodes.clear();
    this.looseNodes.clear();
    this.perfectPulses.clear();
    this.cameraTargetY = 1.35;
    this.cameraCurrentY = 1.35;
    this.overviewTopLevel = null;
    this.paused = false;
    PhysicsSystem.instance.enable = true;
    this.updateCameraTransform(0, 0);
  }

  destroy(): void {
    this.reset();
    this.worldRoot.active = false;
    this.backgroundRenderer.mesh?.destroy();
    this.blockMesh.destroy();
    for (const material of this.toyMaterials) material.destroy();
    this.toyMaterials.clear();
    this.toyMaterialColors.clear();
    for (const material of this.ownedMaterials) {
      material.destroy();
    }
    this.blockMaterials.clear();
    this.ownedMaterials.clear();
    this.presentationMaterials.clear();
    this.worldRoot.destroy();
    this.blockViews.clear();
    this.blockPool.length = 0;
    this.fragmentPool.length = 0;
    this.fragmentCapacity = 0;
    this.projectionNode = null;
  }

  private ensureBlockNode(block: WorldBlockState): Node {
    let node = this.blockNodes.get(block);
    if (!node?.isValid) {
      node = this.acquireBlockNode(`StackBlock-${block.level}`, block.level, 'block');
      this.blockNodes.set(block, node);
    }
    return node;
  }

  private acquireBlockNode(name: string, level: number, pool: BlockView['pool']): Node {
    const nodes = pool === 'fragment' ? this.fragmentPool : this.blockPool;
    let node = nodes.pop();
    while (node && !node.isValid) {
      this.blockViews.delete(node);
      if (pool === 'fragment') this.fragmentCapacity--;
      node = nodes.pop();
    }
    if (!node) {
      node = this.createBlockNode(name, level, pool);
      if (pool === 'fragment') this.fragmentGrowthCount++;
    }
    node.name = name;
    this.applyBlockMaterial(node, level);
    node.active = true;
    return node;
  }

  private recycleBlockNode(node: Node): void {
    node.active = false;
    this.perfectPulses.delete(node);
    const entry = this.blockViews.get(node);
    if (!entry) return;
    const body = entry.body;
    body.setLinearVelocity(Vec3.ZERO);
    body.setAngularVelocity(Vec3.ZERO);
    body.type = ERigidBodyType.STATIC;
    body.useGravity = false;
    body.useCCD = false;
    body.mass = 1;
    body.linearDamping = 0;
    body.angularDamping = 0;
    body.linearFactor = Vec3.ONE;
    body.angularFactor = Vec3.ONE;
    entry.visual.setScale(1, 1, 1);
    node.setRotationFromEuler(0, 0, 0);
    const pool = entry.pool === 'fragment' ? this.fragmentPool : this.blockPool;
    pool.push(node);
  }

  private createBlockNode(name: string, level: number, pool: BlockView['pool']): Node {
    if (pool === 'fragment') this.fragmentCapacity++;
    const node = new Node(name);
    node.active = false;
    node.layer = DEFAULT_LAYER;
    this.blockRoot.addChild(node);
    const visual = new Node(BLOCK_VISUAL_NAME);
    visual.layer = DEFAULT_LAYER;
    visual.setScale(1, 1, 1);
    node.addChild(visual);
    const renderer = visual.addComponent(MeshRenderer);
    renderer.mesh = this.blockMesh;
    const collider = node.addComponent(BoxCollider);
    collider.size = Vec3.ONE;
    const body = node.addComponent(RigidBody);
    body.type = ERigidBodyType.STATIC;
    body.useGravity = false;
    this.blockViews.set(node, { visual, renderer, body, collider, pool });
    this.applyBlockMaterial(node, level);
    return node;
  }

  private applyBlockMaterial(node: Node, level: number): void {
    const { renderer, visual } = this.blockViews.get(node)!;
    renderer.setMaterial(this.presentationMaterial(this.materialForLevel(level)), 0);
    visual.active = this.presentationOpacity > 0;
  }

  private materialForLevel(level: number): Material {
    const colorIndex = Math.abs(level) % CREAM_STYLE.blockPalette.length;
    const cached = this.blockMaterials.get(colorIndex);
    if (cached) {
      return cached;
    }

    const material = new Material(`StackBlockMaterial-${colorIndex}`);
    material.initialize({
      effectName: 'builtin-unlit',
      defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: this.instancingEnabled },
    });
    this.updateMaterialAppearance(material, this.appearancePalette.blockPalette[colorIndex]);
    this.blockMaterials.set(colorIndex, material);
    this.ownedMaterials.add(material);
    return material;
  }

  /** Every stage object is solid; shadows and painted inlays are visual-only. */
  private createToyStage(): void {
    const root = new Node('CreamToyStage');
    root.layer = DEFAULT_LAYER;
    this.worldRoot.addChild(root);
    const materials = new Map<string, Material>();
    const part = (name: string, position: number[], size: number[], color: ToyColor, solid = false) => {
      const key = String(color);
      let material = materials.get(key);
      if (!material) {
        material = new Material(name);
        material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        this.updateMaterialAppearance(material, this.toyColor(color));
        materials.set(key, material);
        this.toyMaterials.add(material);
        this.toyMaterialColors.set(material, color);
      }
      const node = new Node(name);
      node.layer = DEFAULT_LAYER;
      root.addChild(node);
      node.setPosition(position[0], position[1], position[2]);
      node.setScale(size[0], size[1], size[2]);
      const renderer = node.addComponent(MeshRenderer);
      renderer.mesh = this.blockMesh;
      renderer.setMaterial(material, 0);
      if (solid) {
        // Match the rendered dimensions through node scale. Stage props stay
        // fixed while dynamic blocks and cut fragments collide with them.
        const body = node.addComponent(RigidBody);
        body.type = ERigidBodyType.STATIC;
        body.useGravity = false;
        const collider = node.addComponent(BoxCollider);
        collider.size = Vec3.ONE;
      }
    };
    part('TableShadow', [0.18, -0.64, 0.2], [9.6, 0.08, 9.6], 'stageShadow');
    part('RoseTableEdge', [0, -0.42, 0], [9.2, 0.36, 9.2], 'tableEdge');
    part('CreamTableTop', [0, -0.2, 0], [9.2, 0.12, 9.2], 'tableTop');
    part('TowerPlinth', [0, -0.06, 0], [5.55, 0.16, 5.55], 'plinth', true);
    // One thick static box covers the cream surface and pink edge. Its top is
    // exactly y = -0.14; it follows the stage's visibility and lifetime.
    const table = new Node('TableCollision');
    table.layer = DEFAULT_LAYER;
    root.addChild(table);
    table.setPosition(0, -0.37, 0);
    const tableBody = table.addComponent(RigidBody);
    tableBody.type = ERigidBodyType.STATIC;
    tableBody.useGravity = false;
    const tableCollider = table.addComponent(BoxCollider);
    tableCollider.size = new Vec3(9.2, 0.46, 9.2);
    const toys = [
      [-3.6, -2.9, 0.56, 0], [3.5, -2.8, 0.65, 5],
      [-3.6, 1.8, 0.85, 1], [3.6, 1.2, 0.78, 4],
      [-1.5, 3.65, 0.42, 2], [1.65, 3.65, 0.65, 3],
    ];
    toys.forEach(([x, z, h, colorIndex], i) => {
      part(`PastelToy-${i}`, [x, -0.14 + h / 2, z], [0.62, h, 0.62], colorIndex, true);
      part(`ToyInlay-${i}`, [x, h * 0.42 - 0.14, z + 0.313], [0.38, 0.035, 0.008], 'toyInlay');
    });
  }

  private creamBlockGeometry() {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    // Broad, softly shaded bevels give every solid a painted wooden-toy finish.
    const inner = [0.47, 0.37, 0.47];
    const addFace = (points: number[][], normal: number[]) => {
      const a = points[1].map((value, i) => value - points[0][i]);
      const b = points[2].map((value, i) => value - points[0][i]);
      const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      if (cross.reduce((sum, value, i) => sum + value * normal[i], 0) < 0) points.reverse();
      const length = Math.hypot(...normal);
      const n = normal.map(value => value / length);
      const shade = Math.min(1, 0.66 + Math.max(0, n[1]) * 0.34
        + Math.max(0, n[0]) * 0.08 + Math.max(0, n[2]) * 0.17);
      const start = positions.length / 3;
      for (const point of points) {
        positions.push(...point);
        normals.push(...n);
        colors.push(shade, shade, shade, 1);
      }
      for (let i = 1; i < points.length - 1; i += 1) indices.push(start, start + i, start + i + 1);
    };
    // Six broad faces, twelve bevel strips, and eight closed corner triangles.
    for (let axis = 0; axis < 3; axis += 1) {
      const a = (axis + 1) % 3;
      const b = (axis + 2) % 3;
      for (const sign of [-1, 1]) {
        const normal = [0, 0, 0]; normal[axis] = sign;
        addFace([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sa, sb]) => {
          const point = [0, 0, 0]; point[axis] = sign * 0.5;
          point[a] = sa * inner[a]; point[b] = sb * inner[b]; return point;
        }), normal);
      }
    }
    for (let a = 0; a < 3; a += 1) {
      for (let b = a + 1; b < 3; b += 1) {
        const c = 3 - a - b;
        for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
          const normal = [0, 0, 0]; normal[a] = sa; normal[b] = sb;
          const point = (face: number, sc: number) => {
            const p = [0, 0, 0]; p[a] = sa * (face === a ? 0.5 : inner[a]);
            p[b] = sb * (face === b ? 0.5 : inner[b]); p[c] = sc * inner[c]; return p;
          };
          addFace([point(a, -1), point(a, 1), point(b, 1), point(b, -1)], normal);
        }
      }
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const signs = [sx, sy, sz];
      addFace([0, 1, 2].map(axis => signs.map((sign, i) => sign * (i === axis ? 0.5 : inner[i]))), signs);
    }
    return { positions, normals, colors, indices, minPos: new Vec3(-0.5, -0.5, -0.5), maxPos: new Vec3(0.5, 0.5, 0.5) };
  }

  private blockVisual(node: Node): Node {
    return this.blockViews.get(node)?.visual ?? node;
  }

  private updatePerfectPulses(dt: number): void {
    for (const [node, elapsed] of this.perfectPulses) {
      if (!node.isValid) {
        this.perfectPulses.delete(node);
        continue;
      }
      const nextElapsed = elapsed + Math.max(0, dt);
      const visual = this.blockVisual(node);
      if (nextElapsed >= PERFECT_PULSE_DURATION) {
        visual.setScale(1, 1, 1);
        this.perfectPulses.delete(node);
        continue;
      }

      const progress = nextElapsed / PERFECT_PULSE_DURATION;
      let pulse: number;
      if (progress < 0.3) {
        const rise = progress / 0.3;
        pulse = 1 - Math.pow(1 - rise, 3);
      } else {
        const settle = (progress - 0.3) / 0.7;
        pulse = Math.pow(1 - settle, 2) * Math.cos(settle * Math.PI * 1.2);
      }
      visual.setScale(1 + pulse * 0.08, 1 + pulse * 0.045, 1 + pulse * 0.08);
      this.perfectPulses.set(node, nextElapsed);
    }
  }

  private makeStatic(node: Node): void {
    const body = this.blockViews.get(node)!.body;
    if (body.type !== ERigidBodyType.STATIC) {
      body.setLinearVelocity(Vec3.ZERO);
      body.setAngularVelocity(Vec3.ZERO);
      body.type = ERigidBodyType.STATIC;
    }
    body.useGravity = false;
    body.linearFactor = Vec3.ONE;
    body.angularFactor = Vec3.ONE;
  }

  private makeKinematic(node: Node): void {
    const body = this.blockViews.get(node)!.body;
    if (body.type !== ERigidBodyType.KINEMATIC) {
      body.setLinearVelocity(Vec3.ZERO);
      body.setAngularVelocity(Vec3.ZERO);
      body.type = ERigidBodyType.KINEMATIC;
    }
    body.useGravity = false;
    body.linearFactor = Vec3.UP;
    body.angularFactor = Vec3.ZERO;
  }

  private positionStableBlock(node: Node, block: WorldBlockState): void {
    node.setScale(block.width, this.blockHeight, block.depth);
    node.setPosition(block.x, this.stableBlockY(block), block.z);
    node.setRotationFromEuler(0, 0, 0);
  }

  private stableBlockY(block: WorldBlockState): number {
    return block.level * this.blockHeight + this.blockHeight * 0.5;
  }

  private movingBlockY(block: WorldBlockState): number {
    return this.stableBlockY(block) + DROP_HEIGHT;
  }

  /** Call after camera/UI layout updates and before projecting any effects in a frame. */
  prepareProjection(uiNode: Node): void {
    if (this.projectionReady && this.projectionNode === uiNode) return;
    this.camera.camera?.update();
    this.uiCamera?.camera?.update();
    uiNode.getWorldMatrix(this.projectionInverse);
    Mat4.invert(this.projectionInverse, this.projectionInverse);
    this.projectionNode = uiNode;
    this.projectionReady = true;
  }

  projectToUI(x: number, z: number, level: number, uiNode: Node, out: Vec3 = new Vec3()): Vec3 {
    if (!this.projectionReady || this.projectionNode !== uiNode) this.prepareProjection(uiNode);
    this.projectionWorld.set(x, level * this.blockHeight, z);
    this.camera.worldToScreen(this.projectionWorld, this.projectionScreen);
    if (this.uiCamera) {
      this.uiCamera.screenToWorld(this.projectionScreen, this.projectionUI);
      return Vec3.transformMat4(out, this.projectionUI, this.projectionInverse);
    }
    const visible = view.getVisibleSize();
    return out.set(
      (this.projectionScreen.x / this.camera.camera.width - 0.5) * visible.width,
      (this.projectionScreen.y / this.camera.camera.height - 0.5) * visible.height,
      0,
    );
  }

  private updateCameraTransform(shakeX: number, shakeY: number): void {
    const sx = shakeX * 0.012;
    const sy = shakeY * 0.012;
    const overviewScale = this.cameraOverviewScale()
      * (this.homePresentation ? 1.36 : 1.08);
    // The home still life includes the whole tabletop, not just the tower top.
    const focusY = this.cameraCurrentY - (this.homePresentation ? 0.85 : 0);
    const x = 10.8 * overviewScale + this.compositionOffsetX + sx;
    const y = focusY + 9.2 * overviewScale + sy;
    const z = 13.6 * overviewScale;
    if (x !== this.lastCameraX || y !== this.lastCameraY || z !== this.lastCameraZ
      || focusY !== this.lastFocusY || this.compositionOffsetX !== this.lastFocusX) {
      this.cameraNode.setPosition(x, y, z);
      this.cameraTarget.set(this.compositionOffsetX, focusY, 0);
      this.cameraNode.lookAt(this.cameraTarget, Vec3.UP);
      this.lastCameraX = x;
      this.lastCameraY = y;
      this.lastCameraZ = z;
      this.lastFocusY = focusY;
      this.lastFocusX = this.compositionOffsetX;
      this.projectionReady = false;
    }
    this.updateBackdropTransform();
  }

  private updateBackdropTransform(): void {
    // Refresh presentation independently of tick: paused viewport changes must
    // still cover the camera without advancing physics, pulses or debris.
    const visible = view.getVisibleSize();
    const viewportAspect = visible.width / Math.max(1, visible.height);
    // The backdrop is camera-local. Move it with the overview camera so tall
    // towers never pass behind it when the camera pulls back.
    const backgroundDistance = BACKGROUND_BASE_DISTANCE * this.cameraOverviewScale();
    const height = 2 * backgroundDistance * Math.tan(this.camera.fov * Math.PI / 360);
    const width = height * viewportAspect;
    if (width !== this.backdropWidth || height !== this.backdropHeight || backgroundDistance !== this.backdropDistance) {
      this.backgroundNode.setPosition(0, 0, -backgroundDistance);
      this.backgroundNode.setScale(width, height, 0.04);
      this.backdropWidth = width;
      this.backdropHeight = height;
      this.backdropDistance = backgroundDistance;
      this.projectionReady = false;
    }
  }

  private cameraOverviewScale(): number {
    if (this.overviewTopLevel === null) {
      return 1;
    }
    const overviewHeight = (this.overviewTopLevel + 1) * this.blockHeight;
    // Pull back enough to keep the base and the highest settled block inside the
    // vertical field of view. Short towers still get a small establishing shot.
    return Math.max(1.1, (overviewHeight + 2.8) / 9.2);
  }
}
