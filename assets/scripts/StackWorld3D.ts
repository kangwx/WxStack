import {
  BoxCollider,
  Camera,
  Color,
  DirectionalLight,
  ERigidBodyType,
  Layers,
  Material,
  MeshRenderer,
  Node,
  PhysicsSystem,
  RigidBody,
  SpriteFrame,
  Vec3,
  primitives,
  utils,
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
  blockColors: readonly Color[];
  materialTextures: readonly SpriteFrame[];
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

/**
 * Owns the perspective camera, real meshes and Ammo rigid bodies used by the
 * stack game. UI remains on the Canvas and is rendered by its original camera.
 */
export class StackWorld3D {
  private readonly worldRoot: Node;
  private readonly blockRoot: Node;
  private readonly cameraNode: Node;
  private readonly camera: Camera;
  private readonly backgroundNode: Node;
  private readonly backgroundRenderer: MeshRenderer;
  private readonly blockNodes = new Map<WorldBlockState, Node>();
  private readonly looseNodes = new Set<Node>();
  private readonly blockMaterials = new Map<string, Material>();
  private readonly ownedMaterials = new Set<Material>();
  private backgroundMaterial: Material | null = null;
  private theme: StackWorldTheme | null = null;
  private droppingBlock: WorldBlockState | null = null;
  private droppingNode: Node | null = null;
  private dropCollider: BoxCollider | null = null;
  private dropCollided = false;
  private dropElapsed = 0;
  private cameraTargetY = 1.35;
  private cameraCurrentY = 1.35;

  constructor(canvasNode: Node, private readonly blockHeight: number) {
    const scene = canvasNode.scene;
    this.worldRoot = new Node('StackWorld3D');
    this.worldRoot.layer = DEFAULT_LAYER;
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
    this.camera.far = 120;
    this.camera.priority = -10;
    this.camera.visibility = DEFAULT_LAYER;
    this.camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera.clearColor = new Color(217, 231, 229, 255);

    this.backgroundNode = new Node('ThemeBackground3D');
    this.backgroundNode.layer = DEFAULT_LAYER;
    this.cameraNode.addChild(this.backgroundNode);
    this.backgroundNode.setPosition(0, 0, -38);
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
    this.theme = theme;
    this.blockMaterials.clear();

    const background = new Material('StackBackground3D');
    const hasBackground = !!theme.background?.texture;
    background.initialize({
      effectName: 'builtin-unlit',
      defines: hasBackground ? { USE_TEXTURE: true } : undefined,
    });
    background.setProperty('mainColor', Color.WHITE);
    if (hasBackground) {
      background.setProperty('mainTexture', theme.background!.texture);
    }
    this.backgroundRenderer.setMaterial(background, 0);
    this.backgroundMaterial = background;
    this.ownedMaterials.add(background);

    for (const [block, node] of this.blockNodes) {
      this.applyBlockMaterial(node, block.level);
    }
    for (const node of this.looseNodes) {
      const level = Number(node.name.split('-').pop()) || 0;
      this.applyBlockMaterial(node, level);
    }
  }

  sync(stack: readonly WorldBlockState[], current: WorldBlockState | null): void {
    const visible = new Set<WorldBlockState>(stack);
    if (current) {
      visible.add(current);
    }

    for (const [block, node] of this.blockNodes) {
      if (!visible.has(block) && block !== this.droppingBlock) {
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

  beginDrop(block: WorldBlockState): void {
    const node = this.ensureBlockNode(block);
    const body = node.getComponent(RigidBody)!;
    const collider = node.getComponent(BoxCollider)!;
    this.droppingBlock = block;
    this.droppingNode = node;
    this.dropCollider = collider;
    this.dropCollided = false;
    this.dropElapsed = 0;

    collider.on('onCollisionEnter', this.onDropCollision, this);
    body.type = ERigidBodyType.DYNAMIC;
    body.mass = Math.max(0.45, block.width * block.depth * 0.07);
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
    if (this.droppingNode.position.y < targetY - DROP_MISS_DISTANCE) {
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

  releaseMiss(block: WorldBlockState, axis: 'x' | 'z', direction: number): void {
    const node = this.blockNodes.get(block);
    if (!node) {
      return;
    }
    this.clearDropListener();
    this.droppingBlock = null;
    this.droppingNode = null;
    this.blockNodes.delete(block);
    this.looseNodes.add(node);
    const body = node.getComponent(RigidBody)!;
    body.type = ERigidBodyType.DYNAMIC;
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
    this.looseNodes.add(node);
    node.setScale(fragment.width, this.blockHeight, fragment.depth);
    node.setPosition(fragment.x, this.stableBlockY(fragment) + 0.03, fragment.z);
    const body = node.getComponent(RigidBody)!;
    body.type = ERigidBodyType.DYNAMIC;
    body.mass = Math.max(0.18, fragment.width * fragment.depth * 0.06);
    body.useGravity = true;
    body.linearDamping = 0.03;
    body.angularDamping = 0.08;
    body.linearFactor = Vec3.ONE;
    body.angularFactor = Vec3.ONE;
    const impulse = Math.sign(direction || 1) * 2.1;
    body.setLinearVelocity(new Vec3(axis === 'x' ? impulse : 0, 0.55, axis === 'z' ? impulse : 0));
    body.setAngularVelocity(new Vec3(axis === 'z' ? 1.7 : 0.4, 0.75, axis === 'x' ? -1.7 : -0.4));
    body.wakeUp();
  }

  tick(dt: number, topLevel: number, shakeX: number, shakeY: number): void {
    this.cameraTargetY = Math.max(1.35, topLevel * this.blockHeight - 1.15);
    const follow = 1 - Math.exp(-4.8 * Math.max(0, dt));
    this.cameraCurrentY += (this.cameraTargetY - this.cameraCurrentY) * follow;
    this.updateCameraTransform(shakeX, shakeY);

    for (const node of Array.from(this.looseNodes)) {
      if (!node.isValid || node.position.y < -18) {
        this.looseNodes.delete(node);
        if (node.isValid) {
          node.destroy();
        }
      }
    }
  }

  setPaused(paused: boolean): void {
    PhysicsSystem.instance.enable = !paused;
  }

  reset(): void {
    this.clearDropListener();
    this.droppingBlock = null;
    this.droppingNode = null;
    this.dropCollided = false;
    this.dropElapsed = 0;
    for (const node of this.blockNodes.values()) {
      node.destroy();
    }
    for (const node of this.looseNodes) {
      if (node.isValid) {
        node.destroy();
      }
    }
    this.blockNodes.clear();
    this.looseNodes.clear();
    this.cameraTargetY = 1.35;
    this.cameraCurrentY = 1.35;
    PhysicsSystem.instance.enable = true;
    this.updateCameraTransform(0, 0);
  }

  destroy(): void {
    this.reset();
    for (const material of this.ownedMaterials) {
      material.destroy();
    }
    this.blockMaterials.clear();
    this.ownedMaterials.clear();
    this.backgroundMaterial = null;
    this.worldRoot.destroy();
  }

  private onDropCollision(event: { otherCollider?: BoxCollider }): void {
    const otherName = event.otherCollider?.node?.name ?? '';
    if (otherName.startsWith('StackBlock-')) {
      this.dropCollided = true;
    }
  }

  private clearDropListener(): void {
    this.dropCollider?.off('onCollisionEnter', this.onDropCollision, this);
    this.dropCollider = null;
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
    const renderer = node.addComponent(MeshRenderer);
    const box = primitives.box();
    box.colors = [];
    for (let i = 0; i < (box.normals?.length ?? 0); i += 3) {
      const nx = box.normals![i];
      const ny = box.normals![i + 1];
      const nz = box.normals![i + 2];
      const shade = ny > 0.5 ? 1 : nz > 0.5 ? 0.86 : nx > 0.5 ? 0.74 : ny < -0.5 ? 0.5 : 0.66;
      box.colors.push(shade, shade, shade, 1);
    }
    renderer.mesh = utils.createMesh(box);
    renderer.castShadow = true;
    renderer.receiveShadow = true;
    const collider = node.addComponent(BoxCollider);
    collider.size = Vec3.ONE;
    const body = node.addComponent(RigidBody);
    body.type = ERigidBodyType.STATIC;
    body.useGravity = false;
    this.applyBlockMaterial(node, level);
    return node;
  }

  private applyBlockMaterial(node: Node, level: number): void {
    const renderer = node.getComponent(MeshRenderer);
    if (renderer) {
      renderer.setMaterial(this.materialForLevel(level), 0);
    }
  }

  private materialForLevel(level: number): Material {
    const theme = this.theme;
    const colorCount = Math.max(1, theme?.blockColors.length ?? 1);
    const textureCount = Math.max(1, theme?.materialTextures.length ?? 1);
    const colorIndex = Math.abs(level) % colorCount;
    const textureIndex = Math.abs(level) % textureCount;
    const materialKey = `${colorIndex}:${textureIndex}`;
    const cached = this.blockMaterials.get(materialKey);
    if (cached) {
      return cached;
    }

    const textureFrame = theme?.materialTextures.length
      ? theme.materialTextures[textureIndex]
      : null;
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
    material.setProperty('mainColor', color);
    if (textureFrame?.texture) {
      material.setProperty('mainTexture', textureFrame.texture);
    }
    this.blockMaterials.set(materialKey, material);
    this.ownedMaterials.add(material);
    return material;
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

  private updateCameraTransform(shakeX: number, shakeY: number): void {
    const sx = shakeX * 0.012;
    const sy = shakeY * 0.012;
    const target = new Vec3(0, this.cameraCurrentY, 0);
    this.cameraNode.setPosition(10.8 + sx, this.cameraCurrentY + 9.2 + sy, 13.6);
    this.cameraNode.lookAt(target, Vec3.UP);
  }
}
