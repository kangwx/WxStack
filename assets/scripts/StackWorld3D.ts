import {
  BoxCollider,
  Camera,
  Color,
  DirectionalLight,
  ERigidBodyType,
  Layers,
  Material,
  Mesh,
  MeshRenderer,
  Node,
  PhysicsSystem,
  RigidBody,
  SpriteFrame,
  Texture2D,
  UITransform,
  Vec3,
  primitives,
  utils,
  view,
} from 'cc';

export interface WorldBlockState {
  x: number;
  z: number;
  width: number;
  depth: number;
  level: number;
}

export interface StackWorldTheme {
  background: SpriteFrame | null;
  backgroundColor?: Color;
  softToy?: boolean;
  blockColors: readonly Color[];
  materialTextures: readonly SpriteFrame[];
  /** Three columns of materials; top faces in row 0, side faces in row 1. */
  blockAtlas?: SpriteFrame | null;
  blockAtlasOrder?: readonly number[];
  tintAtlas?: boolean;
  sharpEdges?: boolean;
  outlineColor?: Color;
  accentColor: Color;
  roughness: number;
  metallic: number;
}

export type DropResult = 'landed' | 'missed' | null;

const DEFAULT_LAYER = Layers.BitMask.DEFAULT;
const UI_LAYER = Layers.BitMask.UI_2D;
const PROFILER_LAYER = Layers.BitMask.PROFILER;
// Keep the moving block close to the landing surface so its footprint can be
// compared directly with the block below, while retaining a short physical drop.
const DROP_HEIGHT = 0.05;
const DROP_MISS_DISTANCE = 2.2;
const MAX_DROP_SECONDS = 2;
const FRAGMENT_LIFETIME = 5;
const BLOCK_VISUAL_NAME = 'BlockVisual';
const PERFECT_PULSE_DURATION = 0.24;
const BACKGROUND_BASE_DISTANCE = 38;
const HOME_PRESENTATION_DISTANCE_SCALE = 1.18;

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
  private readonly blockMesh: Mesh;
  private readonly decoratedMeshes: Mesh[] = [];
  private readonly sharpMesh: Mesh;
  private readonly toyMesh: Mesh;
  private toyStage: Node | null = null;
  private readonly toyMaterials = new Set<Material>();
  private outlineMesh: Mesh | null = null;
  private readonly blockMaterials = new Map<string, Material>();
  private readonly presentationMaterials = new Map<Material, { material: Material; color: Color }>();
  private presentationOpacity = 1;
  private readonly ownedMaterials = new Set<Material>();
  private backgroundMaterial: Material | null = null;
  private theme: StackWorldTheme | null = null;
  private droppingBlock: WorldBlockState | null = null;
  private droppingNode: Node | null = null;
  private dropCollider: BoxCollider | null = null;
  private landingNode: Node | null = null;
  private dropCollided = false;
  private dropElapsed = 0;
  private cameraTargetY = 1.35;
  private cameraCurrentY = 1.35;
  private compositionOffsetX = 0;
  private homePresentation = false;
  private overviewTopLevel: number | null = null;
  private paused = false;

  constructor(canvasNode: Node, private readonly blockHeight: number) {
    const scene = canvasNode.scene;
    this.worldRoot = new Node('StackWorld3D');
    this.worldRoot.layer = DEFAULT_LAYER;
    const box = primitives.box();
    box.colors = [];
    for (let i = 0; i < box.normals!.length; i += 3) {
      const [nx, ny, nz] = box.normals!.slice(i, i + 3);
      const shade = ny > 0.5 ? 1 : nz > 0.5 ? 0.86 : nx > 0.5 ? 0.74 : ny < -0.5 ? 0.5 : 0.66;
      box.colors.push(shade, shade, shade, 1);
    }
    this.blockMesh = utils.createMesh(box);
    this.sharpMesh = utils.createMesh(this.decoratedBlockGeometry(0, true));
    this.toyMesh = utils.createMesh(this.decoratedBlockGeometry(0, false, true));
    for (let variant = 0; variant < 3; variant += 1) {
      this.decoratedMeshes.push(utils.createMesh(this.decoratedBlockGeometry(variant)));
    }
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
    this.camera.clearColor = new Color(217, 231, 229, 255);

    this.backgroundNode = new Node('ThemeBackground3D');
    this.backgroundNode.layer = DEFAULT_LAYER;
    this.cameraNode.addChild(this.backgroundNode);
    this.backgroundNode.setPosition(0, 0, -BACKGROUND_BASE_DISTANCE);
    this.backgroundNode.setScale(23, 39, 0.04);
    this.backgroundRenderer = this.backgroundNode.addComponent(MeshRenderer);
    this.backgroundRenderer.mesh = utils.createMesh(primitives.box());

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

  setTheme(theme: StackWorldTheme): void {
    const retiredMaterials = Array.from(this.ownedMaterials);
    this.ownedMaterials.clear();
    this.theme = theme;
    this.blockMaterials.clear();
    this.presentationMaterials.clear();

    const background = new Material('StackBackground3D');
    const hasBackground = !!theme.background?.texture;
    background.initialize({
      effectName: 'builtin-unlit',
      defines: hasBackground ? { USE_TEXTURE: true } : undefined,
    });
    background.setProperty('mainColor', hasBackground ? Color.WHITE : theme.backgroundColor ?? Color.WHITE);
    if (hasBackground) {
      background.setProperty('mainTexture', theme.background!.texture);
    }
    this.backgroundRenderer.setMaterial(background, 0);
    this.backgroundMaterial = background;
    this.ownedMaterials.add(background);
    this.updateBackdropTransform();
    if (theme.softToy && !this.toyStage) this.createToyStage();
    if (this.toyStage) this.toyStage.active = !!theme.softToy;
    this.updateCameraTransform(0, 0);

    for (const [block, node] of this.blockNodes) {
      this.applyBlockMaterial(node, block.level);
    }
    for (const node of this.looseNodes.keys()) {
      const level = Number(node.name.split('-').pop()) || 0;
      this.applyBlockMaterial(node, level);
    }
    // Release only after all renderers have switched to the replacement assets.
    for (const material of retiredMaterials) {
      material.destroy();
    }
  }

  sync(stack: readonly WorldBlockState[], current: WorldBlockState | null): void {
    const visible = new Set<WorldBlockState>(stack);
    if (current) {
      visible.add(current);
    }

    for (const [block, node] of this.blockNodes) {
      if (!visible.has(block) && block !== this.droppingBlock) {
        this.perfectPulses.delete(node);
        node.active = false;
        node.destroy();
        this.blockNodes.delete(block);
      }
    }

    for (const block of stack) {
      const node = this.ensureBlockNode(block);
      this.makeStatic(node);
      this.positionStableBlock(node, block);
    }

    if (current) {
      const node = this.ensureBlockNode(current);
      if (current !== this.droppingBlock) {
        this.makeKinematic(node);
        node.setScale(current.width, this.blockHeight, current.depth);
        node.setPosition(current.x, this.movingBlockY(current), current.z);
        node.setRotationFromEuler(0, 0, 0);
      }
    }
  }

  beginDrop(block: WorldBlockState, support: WorldBlockState): void {
    this.clearDropListener();
    const node = this.ensureBlockNode(block);
    // Input may arrive before the next render sync; release at the visible footprint.
    node.setScale(block.width, this.blockHeight, block.depth);
    node.setPosition(block.x, this.movingBlockY(block), block.z);
    const body = node.getComponent(RigidBody)!;
    const collider = node.getComponent(BoxCollider)!;
    this.droppingBlock = block;
    this.droppingNode = node;
    this.dropCollider = collider;
    this.landingNode = this.ensureBlockNode(support);
    this.dropCollided = false;
    this.dropElapsed = 0;

    collider.on('onCollisionEnter', this.onDropCollision, this);
    collider.on('onCollisionStay', this.onDropCollision, this);
    body.type = ERigidBodyType.DYNAMIC;
    body.mass = Math.max(0.45, block.width * block.depth * 0.07);
    body.useCCD = true;
    body.useGravity = true;
    body.linearDamping = 0.06;
    body.angularDamping = 0.92;
    body.linearFactor = new Vec3(0, 1, 0);
    body.angularFactor = new Vec3(0, 0, 0);
    body.setLinearVelocity(new Vec3(0, -0.8, 0));
    body.setAngularVelocity(Vec3.ZERO);
    body.wakeUp();
  }

  pollDrop(dt: number): DropResult {
    if (!this.droppingBlock || !this.droppingNode) {
      return null;
    }
    this.dropElapsed += dt;
    if (this.dropCollided) {
      return 'landed';
    }

    const targetY = this.stableBlockY(this.droppingBlock);
    if (this.droppingNode.position.y < targetY - DROP_MISS_DISTANCE
      || this.dropElapsed >= MAX_DROP_SECONDS) {
      return 'missed';
    }
    return null;
  }

  settle(block: WorldBlockState): void {
    const node = this.blockNodes.get(block);
    if (!node) {
      return;
    }
    this.clearDropListener();
    this.droppingBlock = null;
    this.droppingNode = null;
    this.dropCollided = false;
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
    this.clearDropListener();
    this.droppingBlock = null;
    this.droppingNode = null;
    this.blockNodes.delete(block);
    this.looseNodes.set(node, 0);
    const body = node.getComponent(RigidBody)!;
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
    const node = this.createBlockNode(`CutFragment-${fragment.level}`, fragment.level);
    this.looseNodes.set(node, 0);
    node.setScale(fragment.width, this.blockHeight, fragment.depth);
    const sign = Math.sign(direction || 1);
    // A small clearance prevents the cut faces from immediately re-contacting.
    node.setPosition(
      fragment.x + (axis === 'x' ? sign * 0.045 : 0),
      this.stableBlockY(fragment) + 0.03,
      fragment.z + (axis === 'z' ? sign * 0.045 : 0),
    );
    const body = node.getComponent(RigidBody)!;
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
          node.active = false;
          node.destroy();
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

  /** Render-only fade: the theme background, rigid bodies and camera stay intact. */
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
      const texture = opaque.getProperty('mainTexture') as Texture2D | null;
      const color = opaque.getProperty('mainColor') as Color;
      const material = new Material('StackPresentationFade');
      // Built-in transparent technique; shared/cached per original material,
      // never a full-screen pass and never a material allocation per frame.
      material.initialize({
        effectName: 'builtin-unlit', technique: 1,
        defines: { USE_VERTEX_COLOR: opaque !== this.blockMaterials.get('outline'), USE_TEXTURE: !!texture },
      });
      if (texture) material.setProperty('mainTexture', texture);
      material.setProperty('mainColor', new Color(color.r, color.g, color.b, Math.round(color.a * this.presentationOpacity)));
      entry = { material, color };
      this.presentationMaterials.set(opaque, entry);
      this.ownedMaterials.add(material);
    }
    return entry.material;
  }

  reset(): void {
    // Keep presentationOpacity and homePresentation across resets: the caller
    // controls the destination framing while incoming meshes remain invisible.
    this.clearDropListener();
    this.droppingBlock = null;
    this.droppingNode = null;
    this.dropCollided = false;
    this.dropElapsed = 0;
    for (const node of this.blockNodes.values()) {
      node.active = false;
      node.destroy();
    }
    for (const node of this.looseNodes.keys()) {
      if (node.isValid) {
        node.active = false;
        node.destroy();
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
    for (const mesh of this.decoratedMeshes) {
      mesh.destroy();
    }
    this.sharpMesh.destroy();
    this.toyMesh.destroy();
    for (const material of this.toyMaterials) material.destroy();
    this.toyMaterials.clear();
    this.outlineMesh?.destroy();
    for (const material of this.ownedMaterials) {
      material.destroy();
    }
    this.blockMaterials.clear();
    this.ownedMaterials.clear();
    this.presentationMaterials.clear();
    this.backgroundMaterial = null;
    this.worldRoot.destroy();
  }

  private onDropCollision(event: { otherCollider?: BoxCollider }): void {
    // A falling fragment or a lower tier must never count as the target landing.
    if (event.otherCollider?.node === this.landingNode && this.droppingBlock
      && this.droppingNode!.position.y >= this.stableBlockY(this.droppingBlock) - 0.1) {
      this.dropCollided = true;
    }
  }

  private clearDropListener(): void {
    this.dropCollider?.off('onCollisionEnter', this.onDropCollision, this);
    this.dropCollider?.off('onCollisionStay', this.onDropCollision, this);
    this.dropCollider = null;
    this.landingNode = null;
  }

  private ensureBlockNode(block: WorldBlockState): Node {
    let node = this.blockNodes.get(block);
    if (!node?.isValid) {
      node = this.createBlockNode(`StackBlock-${block.level}`, block.level);
      this.blockNodes.set(block, node);
    }
    return node;
  }

  private createBlockNode(name: string, level: number): Node {
    const node = new Node(name);
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
    this.applyBlockMaterial(node, level);
    return node;
  }

  private applyBlockMaterial(node: Node, level: number): void {
    const renderer = this.blockVisual(node).getComponent(MeshRenderer);
    if (renderer) {
      const order = this.theme?.blockAtlasOrder;
      const variant = order?.length ? order[Math.abs(level) % order.length] : Math.abs(level) % 3;
      renderer.mesh = this.theme?.softToy ? this.toyMesh : this.theme?.blockAtlas?.texture
        ? (this.theme.sharpEdges ? this.sharpMesh : this.decoratedMeshes[variant])
        : this.blockMesh;
      renderer.setMaterial(this.presentationMaterial(this.materialForLevel(level)), 0);
    }
    const visual = this.blockVisual(node);
    visual.active = this.presentationOpacity > 0;
    let outline = visual.getChildByName('ThemeOutline');
    if (!this.theme?.outlineColor) {
      if (outline) outline.active = false;
      return;
    }
    if (!outline) {
      outline = new Node('ThemeOutline');
      outline.layer = DEFAULT_LAYER;
      visual.addChild(outline);
      outline.addComponent(MeshRenderer);
    }
    outline.active = true;
    if (!this.outlineMesh) this.outlineMesh = utils.createMesh(this.blockOutlineGeometry());
    let material = this.blockMaterials.get('outline');
    if (!material) {
      material = new Material('BlockOutline');
      material.initialize({ effectName: 'builtin-unlit' });
      material.setProperty('mainColor', this.theme.outlineColor);
      this.blockMaterials.set('outline', material);
      this.ownedMaterials.add(material);
    }
    const edges = outline.getComponent(MeshRenderer);
    edges.mesh = this.outlineMesh;
    edges.setMaterial(this.presentationMaterial(material), 0);
  }

  private blockOutlineGeometry() {
    // Twelve narrow solid edge strips, combined into one shared mesh. They sit
    // over the bevel, so no coplanar white seam or transparent sorting is needed.
    const cube = this.decoratedBlockGeometry(0, true);
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    const add = (center: number[], size: number[]) => {
      const offset = positions.length / 3;
      cube.positions.forEach((value, i) => positions.push(value * size[i % 3] + center[i % 3]));
      normals.push(...cube.normals);
      indices.push(...cube.indices.map(index => index + offset));
    };
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        add([0, a * 0.49, b * 0.492], [0.992, 0.026, 0.014]);
        add([a * 0.492, b * 0.49, 0], [0.014, 0.026, 0.992]);
        add([a * 0.492, 0, b * 0.492], [0.014, 0.992, 0.014]);
      }
    }
    return { positions, normals, indices };
  }

  private materialForLevel(level: number): Material {
    const theme = this.theme;
    const atlas = theme?.blockAtlas;
    const colorCount = Math.max(1, theme?.blockColors.length ?? 1);
    const textureCount = Math.max(1, theme?.materialTextures.length ?? 1);
    const colorIndex = Math.abs(level) % colorCount;
    const textureIndex = Math.abs(level) % textureCount;
    const materialKey = atlas?.texture ? (theme?.tintAtlas ? `tinted-atlas:${colorIndex}` : 'decorated-atlas') : `${colorIndex}:${textureIndex}`;
    const cached = this.blockMaterials.get(materialKey);
    if (cached) {
      return cached;
    }

    const textureFrame = atlas?.texture ? atlas : (theme?.materialTextures.length
      ? theme.materialTextures[textureIndex]
      : null);
    const material = new Material(`StackBlockMaterial-${level}`);
    material.initialize({
      effectName: 'builtin-unlit',
      defines: {
        USE_VERTEX_COLOR: true,
        USE_TEXTURE: !!textureFrame?.texture,
      },
    });
    const colors = theme?.blockColors ?? [Color.WHITE];
    const color = colors[colorIndex] ?? Color.WHITE;
    // Authored glaze/wood colors are already baked into the atlas.
    material.setProperty('mainColor', atlas?.texture && !theme?.tintAtlas ? Color.WHITE : color);
    if (textureFrame?.texture) {
      material.setProperty('mainTexture', textureFrame.texture);
    }
    this.blockMaterials.set(materialKey, material);
    this.ownedMaterials.add(material);
    return material;
  }

  /** Every stage object is solid; shadows and painted inlays are visual-only. */
  private createToyStage(): void {
    const root = new Node('CreamToyStage');
    root.layer = DEFAULT_LAYER;
    this.worldRoot.addChild(root);
    this.toyStage = root;
    const materials = new Map<string, Material>();
    const part = (name: string, position: number[], size: number[], rgb: number[], solid = false) => {
      const key = rgb.join(',');
      let material = materials.get(key);
      if (!material) {
        material = new Material(name);
        material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        material.setProperty('mainColor', new Color(rgb[0], rgb[1], rgb[2]));
        materials.set(key, material);
        this.toyMaterials.add(material);
      }
      const node = new Node(name);
      node.layer = DEFAULT_LAYER;
      root.addChild(node);
      node.setPosition(position[0], position[1], position[2]);
      node.setScale(size[0], size[1], size[2]);
      const renderer = node.addComponent(MeshRenderer);
      renderer.mesh = this.toyMesh;
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
    part('TableShadow', [0.18, -0.64, 0.2], [9.6, 0.08, 9.6], [181, 156, 150]);
    part('RoseTableEdge', [0, -0.42, 0], [9.2, 0.36, 9.2], [223, 175, 181]);
    part('CreamTableTop', [0, -0.2, 0], [9.2, 0.12, 9.2], [247, 232, 193]);
    part('TowerPlinth', [0, -0.06, 0], [5.55, 0.16, 5.55], [224, 210, 191], true);
    // One thick static box covers the cream surface and pink edge. Its top is
    // exactly y = -0.14; it follows the stage's theme visibility and lifetime.
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
      [-3.6, -2.9, 0.56, 153, 199, 199], [3.5, -2.8, 0.65, 197, 177, 208],
      [-3.6, 1.8, 0.85, 179, 211, 178], [3.6, 1.2, 0.78, 225, 175, 180],
      [-1.5, 3.65, 0.42, 222, 217, 153], [1.65, 3.65, 0.65, 236, 200, 161],
    ];
    toys.forEach(([x, z, h, r, g, b], i) => {
      part(`PastelToy-${i}`, [x, -0.14 + h / 2, z], [0.62, h, 0.62], [r, g, b], true);
      part(`ToyInlay-${i}`, [x, h * 0.42 - 0.14, z + 0.313], [0.38, 0.035, 0.008], [251, 240, 207]);
    });
  }

  private decoratedBlockGeometry(variant: number, sharp = false, soft = false) {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    // A 0.06-world-unit bevel at the initial 5 x 0.62 x 5 block size.
    const inner = sharp ? [0.5, 0.5, 0.5] : soft ? [0.47, 0.37, 0.47] : [0.488, 0.41, 0.488];
    const addFace = (points: number[][], normal: number[]) => {
      const a = points[1].map((value, i) => value - points[0][i]);
      const b = points[2].map((value, i) => value - points[0][i]);
      const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      if (cross.reduce((sum, value, i) => sum + value * normal[i], 0) < 0) points.reverse();
      const length = Math.hypot(...normal);
      const n = normal.map(value => value / length);
      const top = n[1] > 0.5;
      const shade = Math.min(1, 0.66 + Math.max(0, n[1]) * 0.34
        + Math.max(0, n[0]) * 0.08 + Math.max(0, n[2]) * 0.17);
      const start = positions.length / 3;
      for (const point of points) {
        positions.push(...point);
        normals.push(...n);
        colors.push(shade, shade, shade, 1);
        const u = top ? point[0] + 0.5
          : (Math.abs(n[0]) > Math.abs(n[2]) ? point[2] : point[0]) + 0.5;
        const v = top ? 0.5 - point[2] : 0.5 - point[1];
        // Inset each tile by two pixels to prevent neighboring colors bleeding.
        uvs.push((variant + (2 + u * 508) / 512) / 3, ((top ? 0 : 1) + (2 + v * 508) / 512) / 2);
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
    if (sharp) {
      return { positions, normals, uvs, colors, indices, minPos: new Vec3(-0.5, -0.5, -0.5), maxPos: new Vec3(0.5, 0.5, 0.5) };
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
    return { positions, normals, uvs, colors, indices, minPos: new Vec3(-0.5, -0.5, -0.5), maxPos: new Vec3(0.5, 0.5, 0.5) };
  }

  private blockVisual(node: Node): Node {
    return node.getChildByName(BLOCK_VISUAL_NAME) ?? node;
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
    const body = node.getComponent(RigidBody)!;
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
    const body = node.getComponent(RigidBody)!;
    if (body.type !== ERigidBodyType.KINEMATIC) {
      body.setLinearVelocity(Vec3.ZERO);
      body.setAngularVelocity(Vec3.ZERO);
      body.type = ERigidBodyType.KINEMATIC;
    }
    body.useGravity = false;
    body.linearFactor = new Vec3(0, 1, 0);
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

  projectToUI(x: number, z: number, level: number, uiNode: Node): Vec3 {
    // Refresh matrices before projecting: effects render in the same frame as follow/shake.
    this.camera.camera?.update();
    const screenPoint = this.camera.worldToScreen(new Vec3(x, level * this.blockHeight, z));
    if (this.uiCamera) {
      this.uiCamera.camera?.update();
      const worldPoint = this.uiCamera.screenToWorld(screenPoint);
      return uiNode.getComponent(UITransform)!.convertToNodeSpaceAR(worldPoint);
    }
    const visible = view.getVisibleSize();
    return new Vec3(
      (screenPoint.x / this.camera.camera.width - 0.5) * visible.width,
      (screenPoint.y / this.camera.camera.height - 0.5) * visible.height,
      0,
    );
  }

  private updateCameraTransform(shakeX: number, shakeY: number): void {
    const sx = shakeX * 0.012;
    const sy = shakeY * 0.012;
    const overviewScale = this.cameraOverviewScale()
      * (this.homePresentation ? (this.theme?.softToy ? 1.36 : HOME_PRESENTATION_DISTANCE_SCALE)
        : this.theme?.softToy ? 1.08 : 1);
    // The home still life includes the whole tabletop, not just the tower top.
    const focusY = this.cameraCurrentY - (this.homePresentation && this.theme?.softToy ? 0.85 : 0);
    const target = new Vec3(this.compositionOffsetX, focusY, 0);
    this.cameraNode.setPosition(
      10.8 * overviewScale + this.compositionOffsetX + sx,
      focusY + 9.2 * overviewScale + sy,
      13.6 * overviewScale,
    );
    this.cameraNode.lookAt(target, Vec3.UP);
    this.updateBackdropTransform();
  }

  private updateBackdropTransform(): void {
    // Refresh presentation independently of tick: paused viewport changes must
    // still cover the camera without advancing physics, pulses or debris.
    const visible = view.getVisibleSize();
    const viewportAspect = visible.width / Math.max(1, visible.height);
    const imageAspect = this.theme?.background?.rect
      ? this.theme.background.rect.width / this.theme.background.rect.height
      : viewportAspect;
    // The backdrop is camera-local. Move it with the overview camera so tall
    // towers never pass behind it when the camera pulls back.
    const backgroundDistance = BACKGROUND_BASE_DISTANCE * this.cameraOverviewScale();
    this.backgroundNode.setPosition(0, 0, -backgroundDistance);
    const height = 2 * backgroundDistance * Math.tan(this.camera.fov * Math.PI / 360);
    const coverHeight = Math.max(height, height * viewportAspect / imageAspect);
    this.backgroundNode.setScale(coverHeight * imageAspect, coverHeight, 0.04);
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
