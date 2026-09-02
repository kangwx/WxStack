import {
  _decorator,
  AudioClip,
  AudioSource,
  BlockInputEvents,
  Button,
  Color,
  Component,
  EventGamepad,
  EventKeyboard,
  game,
  Game,
  Graphics,
  input,
  Input,
  KeyCode,
  Label,
  MaskComponent,
  Node,
  profiler,
  ResolutionPolicy,
  resources,
  SafeArea,
  screen,
  Sprite,
  SpriteFrame,
  sys,
  tween,
  Tween,
  UITransform,
  UIOpacity,
  Vec3,
  view,
  Widget,
} from 'cc';
import { StackWorld3D, StackWorldTheme } from './StackWorld3D';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const BASE_SIZE = 5;
const BLOCK_HEIGHT = 44;
const BLOCK_3D_HEIGHT = 0.62;
const MOVE_RANGE = 6.1;
const PERFECT_THRESHOLD = 0.14;
const INITIAL_COINS = 100;
const BEST_SCORE_STORAGE_KEY = 'wxstack-best-score';
const COIN_STORAGE_KEY = 'wxstack-coins';
const INITIAL_COIN_GRANT_STORAGE_KEY = 'wxstack-initial-coins-v1';
const OWNED_SKINS_STORAGE_KEY = 'wxstack-owned-skins';
const SELECTED_SKIN_STORAGE_KEY = 'wxstack-selected-skin';
const SOUND_STORAGE_KEY = 'wxstack-sound-enabled';
const REDUCED_MOTION_STORAGE_KEY = 'wxstack-reduced-motion';
const NATURAL_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MAJOR_NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'] as const;

const COPY = {
  title: '叠叠塔',
  subtitle: '让每一次落点都恰到好处',
  start: '点击屏幕开始',
  loadingAudio: '正在准备音效…',
  controls: '点击 / 空格释放方块 · P / Esc 暂停 · S 设置 · K 皮肤 · T 测试',
  precision: '连续精准落点可触发完美连击',
  best: '最高分',
  perfect: '完美',
  perfectTest: '完美测试',
  testOn: '开',
  testOff: '关',
  testing: '测试中',
  testScore: '测试成绩 · 不计最高分',
  coins: '金币',
  settings: '设置',
  skins: '皮肤',
  settingsTitle: '游戏设置',
  settingsHint: '设置会自动保存',
  sound: '游戏音效',
  reducedMotion: '减少动态效果',
  enabled: '开',
  disabled: '关',
  skinTitle: '皮肤商店',
  skinHint: '选择已拥有的皮肤，或使用金币解锁',
  close: '返回首页',
  equipped: '使用中',
  equip: '点击使用',
  unlock: '金币解锁',
  perfectReward: '本局完美',
  noTestCoins: '测试模式不结算金币',
  pause: '暂停',
  paused: '游戏已暂停',
  pauseHint: '塔会在这里等你',
  resume: '继续游戏',
  restartRound: '重新开始',
  home: '返回首页',
  pauseControls: '方向键选择 · 回车确认 · R 重新开始 · P / Esc 继续',
  gameOver: '塔止于此',
  restart: '点击任意处重新开始',
  newBest: '新纪录',
};

type GamePhase = 'ready' | 'playing' | 'dropping' | 'paused' | 'falling' | 'gameover';
type MoveAxis = 'x' | 'z';
const SKIN_IDS = ['classic', 'cyber-neon', 'porcelain-moon', 'pastel-toy', 'nature-zen'] as const;
type SkinId = typeof SKIN_IDS[number];
type SkinVisualStyle = 'breeze' | 'cyber' | 'porcelain' | 'pastel' | 'nature';
type RGB = readonly [number, number, number];
type HomeOverlay = 'none' | 'settings' | 'skins';
type NatureMaterialId = 'light-wood' | 'green-stone' | 'walnut';

interface SkinDefinition {
  id: SkinId;
  visualStyle: SkinVisualStyle;
  name: string;
  description: string;
  price: number;
  backgroundHue: number;
  backgroundSaturation: number;
  backgroundLightness: number;
  blockHue: number;
  blockHueStep: number;
  blockSaturation: number;
  blockLightness: number;
  blockPalette?: readonly RGB[];
  shadow: RGB;
  titleColor: RGB;
  textColor: RGB;
  mutedColor: RGB;
  accentColor: RGB;
  secondaryAccentColor: RGB;
  panelColor: RGB;
  buttonColor: RGB;
}

interface ButtonUI {
  node: Node;
  graphics: Graphics;
  label: Label;
}

interface SkinCardUI extends ButtonUI {
  title: Label;
  description: Label;
  status: Label;
  previewSprite: Sprite;
}

const SKINS: Record<SkinId, SkinDefinition> = {
  classic: {
    id: 'classic',
    visualStyle: 'breeze',
    name: '清风原野',
    description: '清新明亮的经典配色',
    price: 0,
    backgroundHue: 187,
    backgroundSaturation: 56,
    backgroundLightness: 53,
    blockHue: 86,
    blockHueStep: 16.5,
    blockSaturation: 72,
    blockLightness: 65,
    shadow: [12, 42, 58],
    titleColor: [255, 255, 255],
    textColor: [255, 255, 255],
    mutedColor: [215, 244, 247],
    accentColor: [164, 246, 223],
    secondaryAccentColor: [115, 220, 238],
    panelColor: [7, 31, 43],
    buttonColor: [18, 78, 90],
  },
  'cyber-neon': {
    id: 'cyber-neon',
    visualStyle: 'cyber',
    name: '赛博霓虹',
    description: '蓝紫霓虹与未来光栅',
    price: 12,
    backgroundHue: 235,
    backgroundSaturation: 78,
    backgroundLightness: 10,
    blockHue: 190,
    blockHueStep: 32,
    blockSaturation: 96,
    blockLightness: 58,
    blockPalette: [[9, 216, 255], [38, 120, 255], [113, 59, 244], [246, 45, 196]],
    shadow: [0, 2, 28],
    titleColor: [240, 250, 255],
    textColor: [235, 248, 255],
    mutedColor: [141, 218, 255],
    accentColor: [19, 226, 255],
    secondaryAccentColor: [255, 47, 202],
    panelColor: [5, 8, 35],
    buttonColor: [25, 18, 72],
  },
  'porcelain-moon': {
    id: 'porcelain-moon',
    visualStyle: 'porcelain',
    name: '东方瓷韵',
    description: '青花白瓷与鎏金明月',
    price: 18,
    backgroundHue: 218,
    backgroundSaturation: 68,
    backgroundLightness: 20,
    blockHue: 42,
    blockHueStep: 2,
    blockSaturation: 30,
    blockLightness: 91,
    blockPalette: [[247, 240, 219], [239, 235, 220], [250, 244, 226]],
    shadow: [4, 24, 55],
    titleColor: [18, 54, 94],
    textColor: [249, 232, 190],
    mutedColor: [221, 190, 126],
    accentColor: [212, 161, 67],
    secondaryAccentColor: [38, 91, 154],
    panelColor: [8, 31, 66],
    buttonColor: [245, 237, 215],
  },
  'pastel-toy': {
    id: 'pastel-toy',
    visualStyle: 'pastel',
    name: '奶油玩具',
    description: '柔软糖果色与童趣积木',
    price: 18,
    backgroundHue: 43,
    backgroundSaturation: 90,
    backgroundLightness: 91,
    blockHue: 162,
    blockHueStep: 58,
    blockSaturation: 60,
    blockLightness: 72,
    blockPalette: [[126, 225, 202], [145, 174, 236], [190, 129, 204], [255, 196, 80], [255, 123, 96]],
    shadow: [136, 84, 69],
    titleColor: [104, 56, 127],
    textColor: [103, 57, 126],
    mutedColor: [131, 92, 137],
    accentColor: [255, 118, 91],
    secondaryAccentColor: [255, 195, 74],
    panelColor: [91, 52, 110],
    buttonColor: [255, 118, 91],
  },
  'nature-zen': {
    id: 'nature-zen',
    visualStyle: 'nature',
    name: '自然禅意',
    description: '竹木山水与静谧涟漪',
    price: 24,
    backgroundHue: 48,
    backgroundSaturation: 27,
    backgroundLightness: 87,
    blockHue: 42,
    blockHueStep: 74,
    blockSaturation: 37,
    blockLightness: 58,
    blockPalette: [[224, 185, 102], [57, 83, 62], [119, 78, 49], [205, 164, 89]],
    shadow: [58, 75, 59],
    titleColor: [45, 73, 58],
    textColor: [45, 73, 58],
    mutedColor: [82, 101, 84],
    accentColor: [204, 158, 66],
    secondaryAccentColor: [83, 104, 73],
    panelColor: [39, 64, 49],
    buttonColor: [49, 76, 58],
  },
};

interface StackBlock {
  x: number;
  z: number;
  width: number;
  depth: number;
  level: number;
  hue: number;
}

interface FallingPiece extends StackBlock {
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  angularVelocity: number;
  opacity: number;
}

interface Spark {
  x: number;
  y: number;
  cameraYAtSpawn: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  trailLength: number;
  color: Color;
}

interface ImpactRing {
  worldX: number;
  worldZ: number;
  level: number;
  life: number;
  maxLife: number;
  radius: number;
  color: Color;
}

interface PerfectFrame {
  block: StackBlock;
  elapsed: number;
  delay: number;
  duration: number;
  startExpansion: number;
  maxExpansion: number;
  alpha: number;
  fillAlpha: number;
  lineWidth: number;
}

interface Point2 {
  x: number;
  y: number;
}

interface RenderedBlock {
  block: StackBlock;
  offsetY: number;
  rotation: number;
  opacity: number;
  offsetX: number;
}

interface BlockFaceGeometry {
  top: Point2[];
  bottom: Point2[];
}

interface NatureTextureFace {
  maskNode: Node;
  maskGraphics: Graphics;
  spriteNode: Node;
  sprite: Sprite;
}

interface NatureTextureBlock {
  node: Node;
  left: NatureTextureFace;
  right: NatureTextureFace;
  top: NatureTextureFace;
}

@ccclass('StackGame')
export class StackGame extends Component {
  private world3D!: StackWorld3D;
  private graphics!: Graphics;
  private effectsGraphics!: Graphics;
  private backgroundNode!: Node;
  private backgroundSprite!: Sprite;
  private skinBackgrounds = new Map<SkinId, SpriteFrame>();
  private natureTextureRoot!: Node;
  private natureTextureBlocks: NatureTextureBlock[] = [];
  private natureMaterialFrames = new Map<NatureMaterialId, SpriteFrame>();
  private homeTowerPreviewNode!: Node;
  private homeTowerPreviewSprite!: Sprite;
  private audioSource!: AudioSource;
  private audioClips = new Map<string, AudioClip>();
  private hudSafeRoot!: Node;
  private scoreLabel!: Label;
  private bestLabel!: Label;
  private testModeBadgeLabel!: Label;
  private perfectLabel!: Label;
  private startPromptLabel!: Label;
  private controlsLabel!: Label;
  private precisionTipLabel!: Label;
  private perfectOpacity!: UIOpacity;
  private startGroup!: Node;
  private testModeToggle!: Node;
  private testModeToggleGraphics!: Graphics;
  private testModeToggleLabel!: Label;
  private testModeStatusLabel!: Label;
  private resultGroup!: Node;
  private resultTitleLabel!: Label;
  private resultScoreLabel!: Label;
  private resultBestLabel!: Label;
  private pauseButton!: Node;
  private pauseButtonGraphics!: Graphics;
  private pauseButtonLabel!: Label;
  private pauseGroup!: Node;
  private resumeButton!: Node;
  private resumeButtonGraphics!: Graphics;
  private resumeButtonLabel!: Label;
  private restartButton!: Node;
  private restartButtonGraphics!: Graphics;
  private restartButtonLabel!: Label;
  private homeButton!: Node;
  private homeButtonGraphics!: Graphics;
  private homeButtonLabel!: Label;
  private homeCoinLabel!: Label;
  private settingsButton!: Node;
  private settingsButtonGraphics!: Graphics;
  private settingsButtonLabel!: Label;
  private skinsButton!: Node;
  private skinsButtonGraphics!: Graphics;
  private skinsButtonLabel!: Label;
  private settingsGroup!: Node;
  private settingsGraphics!: Graphics;
  private soundToggle!: ButtonUI;
  private motionToggle!: ButtonUI;
  private settingsCloseButton!: ButtonUI;
  private skinsGroup!: Node;
  private skinsGraphics!: Graphics;
  private skinsCoinLabel!: Label;
  private skinsHintLabel!: Label;
  private skinCards = new Map<SkinId, SkinCardUI>();
  private skinCardHandlers = new Map<SkinId, () => void>();
  private skinsCloseButton!: ButtonUI;
  private resultCoinLabel!: Label;

  private phase: GamePhase = 'ready';
  private stack: StackBlock[] = [];
  private current: StackBlock | null = null;
  private fallingPieces: FallingPiece[] = [];
  private sparks: Spark[] = [];
  private rings: ImpactRing[] = [];
  private perfectFrames: PerfectFrame[] = [];

  private score = 0;
  private bestScore = 0;
  private perfectStreak = 0;
  private perfectToneStep = 0;
  private roundPerfectCount = 0;
  private lastEarnedCoins = 0;
  private coins = INITIAL_COINS;
  private ownedSkins = new Set<SkinId>(['classic']);
  private selectedSkinId: SkinId = 'classic';
  private soundEnabled = true;
  private testModeEnabled = false;
  private moveAxis: MoveAxis = 'x';
  private moveDirection = 1;
  private moveSpeed = 6.4;
  private spawnDelay = 0;
  private resultDelay = 0;
  private restartLock = 0;
  private resumeInputLock = 0;
  private pauseSelection = 0;
  private phaseBeforePause: 'playing' | 'dropping' = 'playing';
  private homeOverlay: HomeOverlay = 'none';
  private settingsSelection = 0;
  private skinSelection = 0;

  private visibleWidth = DESIGN_WIDTH;
  private visibleHeight = DESIGN_HEIGHT;
  private isoX = 38;
  private isoY = 19;
  private worldOriginY = -320;
  private cameraY = 0;
  private targetCameraY = 0;

  private trauma = 0;
  private shakeTime = 0;
  private shakeX = 0;
  private shakeY = 0;
  private flashAlpha = 0;
  private promptTime = 0;
  private lastActionAt = 0;
  private heldKeys = new Set<KeyCode>();
  private gamepadSouthHeld = false;
  private gamepadOptionsHeld = false;
  private gamepadNorthHeld = false;
  private gamepadEastHeld = false;
  private gamepadWestHeld = false;
  private gamepadMenuAxisHeld = false;
  private reducedMotion = false;
  private audioReady = false;

  onLoad(): void {
    profiler.hideStats();
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_HEIGHT);
    this.initializeAudio();
    this.loadSettings();
    this.buildStage();
    this.resizeStage();
    this.showReadyScreen();
  }

  onEnable(): void {
    this.graphics.node.on(Node.EventType.TOUCH_END, this.onPointerAction, this);
    this.testModeToggle.on(Button.EventType.CLICK, this.onTestModeToggle, this);
    this.pauseButton.on(Button.EventType.CLICK, this.onPauseButton, this);
    this.resumeButton.on(Button.EventType.CLICK, this.onResumeButton, this);
    this.restartButton.on(Button.EventType.CLICK, this.onRestartButton, this);
    this.homeButton.on(Button.EventType.CLICK, this.onHomeButton, this);
    this.settingsButton.on(Button.EventType.CLICK, this.onSettingsButton, this);
    this.skinsButton.on(Button.EventType.CLICK, this.onSkinsButton, this);
    this.soundToggle.node.on(Button.EventType.CLICK, this.onSoundToggle, this);
    this.motionToggle.node.on(Button.EventType.CLICK, this.onMotionToggle, this);
    this.settingsCloseButton.node.on(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    for (const skinId of SKIN_IDS) {
      const card = this.skinCards.get(skinId);
      const handler = this.skinCardHandlers.get(skinId);
      if (card && handler) {
        card.node.on(Button.EventType.CLICK, handler, this);
      }
    }
    this.skinsCloseButton.node.on(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.on(Input.EventType.GAMEPAD_INPUT, this.onGamepadInput, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    view.on('canvas-resize', this.onCanvasResize, this);
    view.on('design-resolution-changed', this.onCanvasResize, this);
  }

  onDisable(): void {
    this.graphics.node.off(Node.EventType.TOUCH_END, this.onPointerAction, this);
    this.testModeToggle.off(Button.EventType.CLICK, this.onTestModeToggle, this);
    this.pauseButton.off(Button.EventType.CLICK, this.onPauseButton, this);
    this.resumeButton.off(Button.EventType.CLICK, this.onResumeButton, this);
    this.restartButton.off(Button.EventType.CLICK, this.onRestartButton, this);
    this.homeButton.off(Button.EventType.CLICK, this.onHomeButton, this);
    this.settingsButton.off(Button.EventType.CLICK, this.onSettingsButton, this);
    this.skinsButton.off(Button.EventType.CLICK, this.onSkinsButton, this);
    this.soundToggle.node.off(Button.EventType.CLICK, this.onSoundToggle, this);
    this.motionToggle.node.off(Button.EventType.CLICK, this.onMotionToggle, this);
    this.settingsCloseButton.node.off(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    for (const skinId of SKIN_IDS) {
      const card = this.skinCards.get(skinId);
      const handler = this.skinCardHandlers.get(skinId);
      if (card && handler) {
        card.node.off(Button.EventType.CLICK, handler, this);
      }
    }
    this.skinsCloseButton.node.off(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.off(Input.EventType.GAMEPAD_INPUT, this.onGamepadInput, this);
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    view.off('canvas-resize', this.onCanvasResize, this);
    view.off('design-resolution-changed', this.onCanvasResize, this);
    this.heldKeys.clear();
    this.gamepadSouthHeld = false;
    this.gamepadOptionsHeld = false;
    this.gamepadNorthHeld = false;
    this.gamepadEastHeld = false;
    this.gamepadWestHeld = false;
    this.gamepadMenuAxisHeld = false;
  }

  onDestroy(): void {
    this.world3D?.destroy();
  }

  update(dt: number): void {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (this.phase === 'paused') {
      return;
    }
    this.promptTime += elapsed;
    this.restartLock = Math.max(0, this.restartLock - elapsed);
    this.resumeInputLock = Math.max(0, this.resumeInputLock - elapsed);

    let movingElapsed = 0;
    if (this.phase === 'playing') {
      if (this.spawnDelay > 0) {
        const waitingTime = this.spawnDelay;
        this.spawnDelay -= elapsed;
        if (this.spawnDelay <= 0 && !this.current) {
          this.spawnMovingBlock();
          movingElapsed = Math.max(0, elapsed - waitingTime);
        }
      } else {
        movingElapsed = elapsed;
      }
    } else if (this.phase === 'falling') {
      this.resultDelay -= elapsed;
      if (this.resultDelay <= 0) {
        this.showResultScreen();
      }
    }

    // Keep real-time UI/state timers accurate while sub-stepping motion on slow frames.
    let simulationRemaining = Math.min(elapsed, 1);
    let movementRemaining = Math.min(movingElapsed, 1);
    while (simulationRemaining > 0.000001) {
      const step = Math.min(simulationRemaining, 1 / 20);
      this.updateShake(step);
      this.updateCamera(step);
      this.updateParticles(step);
      this.updateFallingPieces(step);
      if (movementRemaining > 0.000001) {
        const movementStep = Math.min(step, movementRemaining);
        this.updateMovingBlock(movementStep);
        movementRemaining -= movementStep;
      }
      simulationRemaining -= step;
    }

    const topBlock = this.current ?? this.stack[this.stack.length - 1];
    this.world3D.tick(elapsed, topBlock?.level ?? 0, this.shakeX, this.shakeY);
    if (this.phase === 'dropping' && this.current) {
      const dropResult = this.world3D.pollDrop(elapsed);
      if (dropResult === 'landed') {
        this.resolveCurrentBlockLanding();
      } else if (dropResult === 'missed') {
        const previous = this.stack[this.stack.length - 1];
        const currentCenter = this.moveAxis === 'x' ? this.current.x : this.current.z;
        const previousCenter = this.moveAxis === 'x' ? previous.x : previous.z;
        this.failPlacement(this.current, currentCenter - previousCenter);
      }
    }

    this.flashAlpha = Math.max(0, this.flashAlpha - elapsed * 3.8);
    this.drawFrame();
    this.animatePrompt();
  }

  private buildStage(): void {
    const canvasTransform = this.node.getComponent(UITransform);
    if (!canvasTransform) {
      this.node.addComponent(UITransform);
    }

    this.world3D = new StackWorld3D(this.node, BLOCK_3D_HEIGHT);

    this.backgroundNode = this.makeNode('ThemeBackground', this.node);
    this.backgroundNode.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    this.backgroundSprite = this.backgroundNode.addComponent(Sprite);
    this.backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.backgroundNode.active = false;

    const graphicsNode = this.makeNode('StackRenderer', this.node);
    graphicsNode.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    this.graphics = graphicsNode.addComponent(Graphics);

    this.natureTextureRoot = this.makeNode('NatureTextureBlocks', this.node);
    this.natureTextureRoot.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);

    this.homeTowerPreviewNode = this.makeNode('NatureHomeTower', this.node);
    this.homeTowerPreviewNode.addComponent(UITransform).setContentSize(405, 424);
    this.homeTowerPreviewNode.setPosition(0, -287, 0);
    this.homeTowerPreviewSprite = this.homeTowerPreviewNode.addComponent(Sprite);
    this.homeTowerPreviewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.homeTowerPreviewNode.active = false;

    const effectsNode = this.makeNode('StackEffects', this.node);
    effectsNode.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    this.effectsGraphics = effectsNode.addComponent(Graphics);

    this.hudSafeRoot = this.makeNode('SafeHud', this.node);
    this.hudSafeRoot.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    const safeArea = this.hudSafeRoot.addComponent(SafeArea);
    safeArea.updateArea();

    this.scoreLabel = this.makeLabel('Score', this.hudSafeRoot, '0', 92, new Color(255, 255, 255, 245), 260, 124);
    this.anchorTopCenter(this.scoreLabel.node, 36);

    this.bestLabel = this.makeLabel('Best', this.hudSafeRoot, `${COPY.best}\n0`, 26, new Color(255, 255, 255, 210), 180, 82);
    this.bestLabel.lineHeight = 30;
    this.anchorTopRight(this.bestLabel.node, 34, 32);

    this.testModeBadgeLabel = this.makeLabel('TestModeBadge', this.hudSafeRoot, COPY.testing, 24, new Color(255, 255, 255, 235), 132, 52);
    this.anchorTopLeft(this.testModeBadgeLabel.node, 34, 170);
    this.testModeBadgeLabel.node.active = false;

    this.perfectLabel = this.makeLabel('Perfect', this.hudSafeRoot, COPY.perfect, 42, new Color(255, 255, 255, 255), 420, 72);
    this.anchorCenter(this.perfectLabel.node, 0, 248);
    this.perfectOpacity = this.perfectLabel.node.addComponent(UIOpacity);
    this.perfectOpacity.opacity = 0;

    this.startGroup = this.makeFullNode('StartScreen', this.hudSafeRoot);
    this.buildTestModeToggle();
    this.buildHomeButtons();
    this.homeCoinLabel = this.makeLabel('HomeCoins', this.startGroup, `${COPY.coins}  0`, 27, new Color(255, 255, 255, 235), 220, 64);
    this.anchorTopCenter(this.homeCoinLabel.node, 34);
    this.makeCenteredLabel('Title', this.startGroup, COPY.title, 104, 214, 500, 130, new Color(255, 255, 255, 255));
    this.makeCenteredLabel('Subtitle', this.startGroup, COPY.subtitle, 30, 120, 620, 66, new Color(255, 255, 255, 225));
    this.startPromptLabel = this.makeCenteredLabel('StartPrompt', this.startGroup, this.audioReady ? COPY.start : COPY.loadingAudio, 38, -48, 560, 84, new Color(255, 255, 255, 255));
    this.controlsLabel = this.makeCenteredLabel('Controls', this.startGroup, COPY.controls, 24, -124, 650, 56, new Color(255, 255, 255, 185));
    this.precisionTipLabel = this.makeCenteredLabel('PrecisionTip', this.startGroup, COPY.precision, 22, -475, 660, 56, new Color(255, 255, 255, 155));

    this.resultGroup = this.makeFullNode('ResultScreen', this.hudSafeRoot);
    this.resultTitleLabel = this.makeCenteredLabel('ResultTitle', this.resultGroup, COPY.gameOver, 54, 172, 560, 86, new Color(255, 255, 255, 255));
    this.resultScoreLabel = this.makeCenteredLabel('ResultScore', this.resultGroup, '0', 116, 50, 400, 140, new Color(255, 255, 255, 255));
    this.resultBestLabel = this.makeCenteredLabel('ResultBest', this.resultGroup, '', 28, -42, 560, 68, new Color(255, 255, 255, 220));
    this.resultCoinLabel = this.makeCenteredLabel('ResultCoins', this.resultGroup, '', 25, -108, 600, 60, new Color(255, 245, 190, 245));
    this.makeCenteredLabel('Restart', this.resultGroup, COPY.restart, 30, -202, 620, 76, new Color(255, 255, 255, 235));
    this.resultGroup.active = false;

    this.buildPauseUI();
    this.buildHomeOverlays();
    this.loadThemeBackgrounds();
    this.loadNatureVisualAssets();
  }

  private buildHomeButtons(): void {
    const settings = this.makeMenuButton(this.startGroup, 'SettingsButton', COPY.settings, 146, 68);
    this.settingsButton = settings.node;
    this.settingsButtonGraphics = settings.graphics;
    this.settingsButtonLabel = settings.label;
    this.anchorTopRight(this.settingsButton, 116, 24);

    const skins = this.makeMenuButton(this.startGroup, 'SkinsButton', COPY.skins, 146, 68);
    this.skinsButton = skins.node;
    this.skinsButtonGraphics = skins.graphics;
    this.skinsButtonLabel = skins.label;
    this.anchorTopRight(this.skinsButton, 116, 182);

    this.drawHomeButton(this.settingsButtonGraphics, this.settingsButtonLabel, 138, 60);
    this.drawHomeButton(this.skinsButtonGraphics, this.skinsButtonLabel, 138, 60);
  }

  private buildHomeOverlays(): void {
    this.settingsGroup = this.makeFullNode('SettingsScreen', this.hudSafeRoot);
    this.settingsGraphics = this.settingsGroup.addComponent(Graphics);
    this.settingsGroup.addComponent(BlockInputEvents);
    this.makeCenteredLabel('SettingsTitle', this.settingsGroup, COPY.settingsTitle, 56, 250, 600, 88, new Color(255, 255, 255, 255));
    this.makeCenteredLabel('SettingsHint', this.settingsGroup, COPY.settingsHint, 23, 192, 560, 50, new Color(255, 255, 255, 160));
    this.soundToggle = this.makeOverlayButton(this.settingsGroup, 'SoundToggle', '', 500, 104, 0, 72);
    this.motionToggle = this.makeOverlayButton(this.settingsGroup, 'MotionToggle', '', 500, 104, 0, -54);
    this.settingsCloseButton = this.makeOverlayButton(this.settingsGroup, 'SettingsClose', COPY.close, 400, 92, 0, -242);
    this.settingsGroup.active = false;

    this.skinsGroup = this.makeFullNode('SkinsScreen', this.hudSafeRoot);
    this.skinsGraphics = this.skinsGroup.addComponent(Graphics);
    this.skinsGroup.addComponent(BlockInputEvents);
    this.makeCenteredLabel('SkinsTitle', this.skinsGroup, COPY.skinTitle, 54, 520, 600, 86, new Color(255, 255, 255, 255));
    this.skinsCoinLabel = this.makeCenteredLabel('SkinsCoins', this.skinsGroup, '', 28, 462, 420, 56, new Color(255, 245, 190, 255));
    const cardPositions: readonly Point2[] = [
      { x: -166, y: 300 },
      { x: 166, y: 300 },
      { x: -166, y: 65 },
      { x: 166, y: 65 },
      { x: 0, y: -170 },
    ];
    SKIN_IDS.forEach((skinId, index) => {
      const skin = SKINS[skinId];
      const position = cardPositions[index];
      this.skinCards.set(skinId, this.makeSkinCard(skin, position.x, position.y));
      this.skinCardHandlers.set(skinId, () => {
        this.skinSelection = index;
        this.useOrBuySkin(skinId);
      });
    });
    this.skinsHintLabel = this.makeCenteredLabel('SkinsHint', this.skinsGroup, COPY.skinHint, 22, -338, 660, 54, new Color(255, 255, 255, 170));
    this.skinsCloseButton = this.makeOverlayButton(this.skinsGroup, 'SkinsClose', COPY.close, 400, 88, 0, -448);
    this.skinsGroup.active = false;

    this.updateSettingsUI();
    this.updateSkinShopUI();
  }

  private makeMenuButton(parent: Node, name: string, text: string, width: number, height: number): ButtonUI {
    const node = this.makeNode(name, parent);
    node.addComponent(UITransform).setContentSize(width, height);
    const graphics = node.addComponent(Graphics);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    const label = this.makeLabel(`${name}Label`, node, text, 25, new Color(255, 255, 255, 238), width - 18, height - 8);
    return { node, graphics, label };
  }

  private makeOverlayButton(
    parent: Node,
    name: string,
    text: string,
    width: number,
    height: number,
    horizontalCenter: number,
    verticalCenter: number,
  ): ButtonUI {
    const ui = this.makeMenuButton(parent, name, text, width, height);
    this.anchorCenter(ui.node, horizontalCenter, verticalCenter);
    return ui;
  }

  private makeSkinCard(skin: SkinDefinition, horizontalCenter: number, verticalCenter: number): SkinCardUI {
    const node = this.makeNode(`SkinCard-${skin.id}`, this.skinsGroup);
    node.addComponent(UITransform).setContentSize(306, 218);
    this.anchorCenter(node, horizontalCenter, verticalCenter);
    const graphics = node.addComponent(Graphics);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    const previewNode = this.makeNode(`SkinPreview-${skin.id}`, node);
    previewNode.addComponent(UITransform).setContentSize(236, 78);
    previewNode.setPosition(0, -14, 0);
    const previewSprite = previewNode.addComponent(Sprite);
    previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    const title = this.makeLabel(`SkinTitle-${skin.id}`, node, skin.name, 27, new Color(255, 255, 255, 255), 260, 42);
    title.node.setPosition(0, 78, 0);
    const description = this.makeLabel(`SkinDescription-${skin.id}`, node, skin.description, 17, new Color(255, 255, 255, 170), 270, 36);
    description.node.setPosition(0, 49, 0);
    const status = this.makeLabel(`SkinStatus-${skin.id}`, node, '', 20, new Color(255, 255, 255, 245), 260, 44);
    status.node.setPosition(0, -82, 0);
    return { node, graphics, label: status, title, description, status, previewSprite };
  }

  private drawHomeButton(graphics: Graphics, label: Label, width: number, height: number): void {
    const skin = this.currentSkin();
    graphics.clear();
    graphics.fillColor = this.rgb(skin.buttonColor, 178);
    graphics.roundRect(-width * 0.5, -height * 0.5, width, height, height * 0.5);
    graphics.fill();
    graphics.strokeColor = this.rgb(skin.accentColor, 126);
    graphics.lineWidth = 2;
    graphics.roundRect(-width * 0.5, -height * 0.5, width, height, height * 0.5);
    graphics.stroke();
    label.color = this.textOnButton(skin.buttonColor);
  }

  private drawOverlayBackdrop(graphics: Graphics, panelWidth: number, panelHeight: number): void {
    const skin = this.currentSkin();
    graphics.clear();
    graphics.fillColor = new Color(2, 8, 18, 214);
    graphics.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
    graphics.fill();
    graphics.fillColor = this.rgb(skin.panelColor, 246);
    graphics.roundRect(-panelWidth * 0.5, -panelHeight * 0.5, panelWidth, panelHeight, 42);
    graphics.fill();
    graphics.strokeColor = this.rgb(skin.accentColor, 130);
    graphics.lineWidth = 2;
    graphics.roundRect(-panelWidth * 0.5, -panelHeight * 0.5, panelWidth, panelHeight, 42);
    graphics.stroke();
  }

  private drawOverlayButton(ui: ButtonUI, width: number, height: number, selected: boolean, prominent = false): void {
    const skin = this.currentSkin();
    const panelText = this.textOnButton(skin.panelColor);
    ui.graphics.clear();
    ui.graphics.fillColor = selected
      ? this.rgb(skin.accentColor, 244)
      : new Color(panelText.r, panelText.g, panelText.b, prominent ? 38 : 24);
    ui.graphics.roundRect(-width * 0.5, -height * 0.5, width, height, 28);
    ui.graphics.fill();
    ui.graphics.strokeColor = selected
      ? this.rgb(skin.accentColor, 238)
      : new Color(panelText.r, panelText.g, panelText.b, 72);
    ui.graphics.lineWidth = selected ? 3 : 2;
    ui.graphics.roundRect(-width * 0.5, -height * 0.5, width, height, 28);
    ui.graphics.stroke();
    ui.label.color = selected
      ? this.textOnButton(skin.accentColor)
      : new Color(panelText.r, panelText.g, panelText.b, 242);
    const scale = selected && !this.reducedMotion ? 1.018 : 1;
    ui.node.setScale(scale, scale, 1);
  }

  private updateSettingsUI(): void {
    if (!this.settingsGraphics) {
      return;
    }
    this.drawOverlayBackdrop(this.settingsGraphics, 620, 700);
    this.soundToggle.label.string = `${COPY.sound}　　${this.soundEnabled ? COPY.enabled : COPY.disabled}`;
    this.motionToggle.label.string = `${COPY.reducedMotion}　　${this.reducedMotion ? COPY.enabled : COPY.disabled}`;
    this.drawOverlayButton(this.soundToggle, 480, 92, this.homeOverlay === 'settings' && this.settingsSelection === 0);
    this.drawOverlayButton(this.motionToggle, 480, 92, this.homeOverlay === 'settings' && this.settingsSelection === 1);
    this.drawOverlayButton(this.settingsCloseButton, 380, 80, this.homeOverlay === 'settings' && this.settingsSelection === 2, true);
  }

  private updateSkinShopUI(): void {
    if (!this.skinsGraphics) {
      return;
    }
    this.drawOverlayBackdrop(this.skinsGraphics, 716, 1160);
    this.skinsCoinLabel.string = `${COPY.coins}  ${this.coins}`;
    SKIN_IDS.forEach((skinId, index) => {
      const card = this.skinCards.get(skinId);
      if (card) {
        this.drawSkinCard(card, SKINS[skinId], index);
      }
    });
    this.drawOverlayButton(
      this.skinsCloseButton,
      380,
      76,
      this.homeOverlay === 'skins' && this.skinSelection === SKIN_IDS.length,
      true,
    );
  }

  private drawSkinCard(card: SkinCardUI, skin: SkinDefinition, index: number): void {
    const current = this.currentSkin();
    const panelText = this.textOnButton(current.panelColor);
    const selected = this.selectedSkinId === skin.id;
    const focused = this.homeOverlay === 'skins' && this.skinSelection === index;
    const owned = this.ownedSkins.has(skin.id);
    const g = card.graphics;
    g.clear();
    g.fillColor = focused
      ? new Color(255, 255, 255, 232)
      : new Color(255, 255, 255, selected ? 42 : 22);
    g.roundRect(-145, -104, 290, 208, 28);
    g.fill();
    g.strokeColor = selected
      ? this.rgb(current.accentColor, 230)
      : new Color(panelText.r, panelText.g, panelText.b, focused ? 188 : 62);
    g.lineWidth = selected ? 4 : focused ? 3 : 2;
    g.roundRect(-145, -104, 290, 208, 28);
    g.stroke();

    card.previewSprite.spriteFrame = this.skinBackgrounds.get(skin.id) ?? null;

    card.title.color = focused ? this.rgb(current.panelColor) : panelText;
    card.description.color = focused
      ? this.rgb(current.panelColor, 190)
      : new Color(panelText.r, panelText.g, panelText.b, 170);
    card.status.string = selected
      ? COPY.equipped
      : owned
        ? COPY.equip
        : this.coins >= skin.price
          ? `${skin.price} ${COPY.unlock}`
          : `还差 ${skin.price - this.coins} ${COPY.coins}`;
    card.status.color = focused
      ? this.rgb(current.panelColor)
      : selected
        ? this.rgb(current.accentColor)
        : new Color(panelText.r, panelText.g, panelText.b, 238);
    const scale = focused && !this.reducedMotion ? 1.018 : 1;
    card.node.setScale(scale, scale, 1);
  }

  private buildPauseUI(): void {
    this.pauseButton = this.makeNode('PauseButton', this.hudSafeRoot);
    this.pauseButton.addComponent(UITransform).setContentSize(132, 80);
    this.anchorTopLeft(this.pauseButton, 24, 24);
    this.pauseButtonGraphics = this.pauseButton.addComponent(Graphics);
    const pauseButton = this.pauseButton.addComponent(Button);
    pauseButton.transition = Button.Transition.NONE;
    this.pauseButtonLabel = this.makeLabel(
      'PauseButtonLabel',
      this.pauseButton,
      `Ⅱ  ${COPY.pause}`,
      24,
      new Color(255, 255, 255, 238),
      116,
      60,
    );
    this.drawPauseHudButton();
    this.pauseButton.active = false;

    this.pauseGroup = this.makeFullNode('PauseScreen', this.hudSafeRoot);
    this.pauseGroup.addComponent(BlockInputEvents);
    this.makeCenteredLabel('PauseTitle', this.pauseGroup, COPY.paused, 56, 215, 580, 84, new Color(255, 255, 255, 255));
    this.makeCenteredLabel('PauseHint', this.pauseGroup, COPY.pauseHint, 25, 150, 580, 54, new Color(255, 255, 255, 190));

    const resume = this.makePauseMenuButton('ResumeButton', COPY.resume, 58);
    this.resumeButton = resume.node;
    this.resumeButtonGraphics = resume.graphics;
    this.resumeButtonLabel = resume.label;

    const restart = this.makePauseMenuButton('RestartButton', COPY.restartRound, -50);
    this.restartButton = restart.node;
    this.restartButtonGraphics = restart.graphics;
    this.restartButtonLabel = restart.label;

    const home = this.makePauseMenuButton('HomeButton', COPY.home, -158);
    this.homeButton = home.node;
    this.homeButtonGraphics = home.graphics;
    this.homeButtonLabel = home.label;

    this.makeCenteredLabel(
      'PauseControls',
      this.pauseGroup,
      COPY.pauseControls,
      22,
      -265,
      680,
      52,
      new Color(255, 255, 255, 150),
    );
    this.pauseSelection = 0;
    this.updatePauseMenuFocus();
    this.pauseGroup.active = false;
  }

  private makePauseMenuButton(
    name: string,
    text: string,
    verticalCenter: number,
  ): { node: Node; graphics: Graphics; label: Label } {
    const node = this.makeNode(name, this.pauseGroup);
    node.addComponent(UITransform).setContentSize(460, 100);
    this.anchorCenter(node, 0, verticalCenter);
    const graphics = node.addComponent(Graphics);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    const label = this.makeLabel(
      `${name}Label`,
      node,
      text,
      31,
      new Color(255, 255, 255, 245),
      420,
      82,
    );
    return { node, graphics, label };
  }

  private drawPauseHudButton(): void {
    const skin = this.currentSkin();
    const g = this.pauseButtonGraphics;
    g.clear();
    g.fillColor = this.rgb(skin.buttonColor, 184);
    g.roundRect(-62, -32, 124, 64, 30);
    g.fill();
    g.strokeColor = this.rgb(skin.accentColor, 118);
    g.lineWidth = 2;
    g.roundRect(-62, -32, 124, 64, 30);
    g.stroke();
  }

  private updatePauseMenuFocus(): void {
    this.drawPauseMenuButton(
      this.resumeButtonGraphics,
      this.resumeButtonLabel,
      this.resumeButton,
      this.pauseSelection === 0,
    );
    this.drawPauseMenuButton(
      this.restartButtonGraphics,
      this.restartButtonLabel,
      this.restartButton,
      this.pauseSelection === 1,
    );
    this.drawPauseMenuButton(
      this.homeButtonGraphics,
      this.homeButtonLabel,
      this.homeButton,
      this.pauseSelection === 2,
    );
  }

  private drawPauseMenuButton(graphics: Graphics, label: Label, node: Node, selected: boolean): void {
    const skin = this.currentSkin();
    const panelText = this.textOnButton(skin.panelColor);
    graphics.clear();
    graphics.fillColor = selected
      ? this.rgb(skin.accentColor, 242)
      : new Color(panelText.r, panelText.g, panelText.b, 24);
    graphics.roundRect(-220, -44, 440, 88, 26);
    graphics.fill();
    graphics.strokeColor = selected
      ? this.rgb(skin.accentColor, 235)
      : new Color(panelText.r, panelText.g, panelText.b, 76);
    graphics.lineWidth = selected ? 3 : 2;
    graphics.roundRect(-220, -44, 440, 88, 26);
    graphics.stroke();
    label.color = selected
      ? this.textOnButton(skin.accentColor)
      : new Color(panelText.r, panelText.g, panelText.b, 238);
    const scale = selected && !this.reducedMotion ? 1.025 : 1;
    node.setScale(scale, scale, 1);
  }

  private buildTestModeToggle(): void {
    this.testModeToggle = this.makeNode('TestModeToggle', this.startGroup);
    this.testModeToggle.addComponent(UITransform).setContentSize(300, 96);
    this.anchorTopLeft(this.testModeToggle, 28, 28);
    this.testModeToggleGraphics = this.testModeToggle.addComponent(Graphics);
    const button = this.testModeToggle.addComponent(Button);
    button.transition = Button.Transition.NONE;

    this.testModeToggleLabel = this.makeLabel(
      'TestModeLabel',
      this.testModeToggle,
      COPY.perfectTest,
      28,
      new Color(255, 255, 255, 185),
      150,
      64,
    );
    this.testModeToggleLabel.node.setPosition(-55, 0, 0);

    this.testModeStatusLabel = this.makeLabel(
      'TestModeStatus',
      this.testModeToggle,
      COPY.testOff,
      18,
      new Color(255, 255, 255, 205),
      32,
      40,
    );
    this.updateTestModeUI();
  }

  private updateTestModeUI(): void {
    const skin = this.currentSkin();
    const buttonText = this.textOnButton(skin.buttonColor);
    const g = this.testModeToggleGraphics;
    g.clear();
    g.fillColor = this.testModeEnabled
      ? this.rgb(skin.buttonColor, 214)
      : this.rgb(skin.buttonColor, 164);
    g.roundRect(-138, -36, 276, 72, 36);
    g.fill();
    g.strokeColor = this.rgb(skin.accentColor, this.testModeEnabled ? 180 : 106);
    g.lineWidth = 2;
    g.roundRect(-138, -36, 276, 72, 36);
    g.stroke();

    g.fillColor = this.testModeEnabled
      ? this.rgb(skin.accentColor, 235)
      : new Color(buttonText.r, buttonText.g, buttonText.b, 54);
    g.roundRect(40, -24, 92, 48, 24);
    g.fill();

    const knobX = this.testModeEnabled ? 108 : 64;
    g.fillColor = this.testModeEnabled
      ? this.textOnButton(skin.accentColor)
      : new Color(buttonText.r, buttonText.g, buttonText.b, 225);
    g.circle(knobX, 0, 18);
    g.fill();

    this.testModeToggleLabel.color = new Color(buttonText.r, buttonText.g, buttonText.b, this.testModeEnabled ? 255 : 205);
    this.testModeStatusLabel.string = this.testModeEnabled ? COPY.testOn : COPY.testOff;
    this.testModeStatusLabel.color = this.testModeEnabled
      ? this.textOnButton(skin.accentColor)
      : new Color(buttonText.r, buttonText.g, buttonText.b, 215);
    this.testModeStatusLabel.node.setPosition(this.testModeEnabled ? 64 : 108, 0, 0);
    this.testModeBadgeLabel.node.active = this.testModeEnabled && this.phase !== 'ready';
  }

  private showReadyScreen(): void {
    this.phase = 'ready';
    this.phaseBeforePause = 'playing';
    this.world3D.reset();
    this.homeOverlay = 'none';
    this.updateTestModeUI();
    this.resetPerfectFeedback();
    Tween.stopAllByTarget(this.resultGroup);
    Tween.stopAllByTarget(this.pauseGroup);
    Tween.stopAllByTarget(this.scoreLabel.node);
    this.scoreLabel.node.setScale(1, 1, 1);
    this.score = 0;
    this.roundPerfectCount = 0;
    this.lastEarnedCoins = 0;
    this.resetPerfectChain();
    this.pauseSelection = 0;
    this.resumeInputLock = 0;
    this.spawnDelay = 0;
    this.resultDelay = 0;
    this.restartLock = 0;
    this.trauma = 0;
    this.shakeTime = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.lastActionAt = Date.now();
    this.cameraY = 0;
    this.targetCameraY = 0;
    this.current = null;
    this.fallingPieces = [];
    this.sparks = [];
    this.rings = [];
    this.perfectFrames = [];
    this.stack = [];

    for (let level = 0; level < 5; level += 1) {
      const drift = level === 3 ? 0.12 : 0;
      this.stack.push({
        x: drift,
        z: -drift,
        width: BASE_SIZE,
        depth: BASE_SIZE,
        level,
        hue: this.hueForLevel(level + 2),
      });
    }

    this.startGroup.active = true;
    this.resultGroup.active = false;
    this.pauseGroup.active = false;
    this.settingsGroup.active = false;
    this.skinsGroup.active = false;
    this.pauseButton.active = false;
    this.scoreLabel.node.active = false;
    this.bestLabel.node.active = true;
    this.updateBestLabel();
    this.updateCoinLabels();
    this.updateAudioPrompt();
    this.applyThemeToUI();
    this.drawFrame();
  }

  private startGame(): void {
    if (!this.audioReady || this.homeOverlay !== 'none') {
      this.updateAudioPrompt();
      return;
    }
    Tween.stopAllByTarget(this.resultGroup);
    Tween.stopAllByTarget(this.pauseGroup);
    Tween.stopAllByTarget(this.scoreLabel.node);
    this.scoreLabel.node.setScale(1, 1, 1);
    this.resetPerfectFeedback();
    this.world3D.reset();
    this.phase = 'playing';
    this.phaseBeforePause = 'playing';
    this.updateTestModeUI();
    this.score = 0;
    this.roundPerfectCount = 0;
    this.lastEarnedCoins = 0;
    this.resetPerfectChain();
    this.moveSpeed = 6.4;
    this.cameraY = 0;
    this.targetCameraY = 0;
    this.trauma = 0;
    this.shakeTime = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.spawnDelay = 0;
    this.resultDelay = 0;
    this.resumeInputLock = 0;
    this.fallingPieces = [];
    this.sparks = [];
    this.rings = [];
    this.perfectFrames = [];
    this.stack = [{ x: 0, z: 0, width: BASE_SIZE, depth: BASE_SIZE, level: 0, hue: this.hueForLevel(0) }];
    this.current = null;

    this.startGroup.active = false;
    this.resultGroup.active = false;
    this.pauseGroup.active = false;
    this.settingsGroup.active = false;
    this.skinsGroup.active = false;
    this.pauseGroup.setScale(1, 1, 1);
    this.pauseButton.active = true;
    this.scoreLabel.node.active = true;
    this.bestLabel.node.active = true;
    this.setScore(0, false);
    this.spawnMovingBlock();
    this.playSound('start', 0.8);
  }

  private spawnMovingBlock(): void {
    const previous = this.stack[this.stack.length - 1];
    const level = previous.level + 1;
    this.moveAxis = level % 2 === 1 ? 'x' : 'z';
    this.moveDirection = level % 4 < 2 ? 1 : -1;
    this.moveSpeed = Math.min(11.2, 6.4 + this.score * 0.18);

    this.current = {
      x: previous.x,
      z: previous.z,
      width: previous.width,
      depth: previous.depth,
      level,
      hue: this.hueForLevel(level),
    };

    if (this.moveAxis === 'x') {
      this.current.x = previous.x - this.moveDirection * MOVE_RANGE;
    } else {
      this.current.z = previous.z - this.moveDirection * MOVE_RANGE;
    }
  }

  private updateMovingBlock(dt: number): void {
    if (!this.current) {
      return;
    }

    const previous = this.stack[this.stack.length - 1];
    const center = this.moveAxis === 'x' ? previous.x : previous.z;
    const next = (this.moveAxis === 'x' ? this.current.x : this.current.z) + this.moveDirection * this.moveSpeed * dt;
    const min = center - MOVE_RANGE;
    const max = center + MOVE_RANGE;
    let resolved = next;

    if (next > max) {
      resolved = max - (next - max);
      this.moveDirection = -1;
    } else if (next < min) {
      resolved = min + (min - next);
      this.moveDirection = 1;
    }

    if (this.moveAxis === 'x') {
      this.current.x = resolved;
    } else {
      this.current.z = resolved;
    }
  }

  private placeCurrentBlock(): void {
    if (!this.current || this.spawnDelay > 0 || this.phase !== 'playing') {
      return;
    }

    this.phase = 'dropping';
    this.world3D.beginDrop(this.current);
  }

  private resolveCurrentBlockLanding(): void {
    if (!this.current || this.phase !== 'dropping') {
      return;
    }

    const placed = this.current;
    const previous = this.stack[this.stack.length - 1];
    const currentCenter = this.moveAxis === 'x' ? placed.x : placed.z;
    const previousCenter = this.moveAxis === 'x' ? previous.x : previous.z;
    const currentSize = this.moveAxis === 'x' ? placed.width : placed.depth;
    const previousSize = this.moveAxis === 'x' ? previous.width : previous.depth;
    const delta = currentCenter - previousCenter;

    if (Math.abs(delta) >= (currentSize + previousSize) * 0.5) {
      this.failPlacement(placed, delta);
      return;
    }

    const isPerfect = this.testModeEnabled
      || Math.abs(delta) <= Math.min(PERFECT_THRESHOLD, currentSize * 0.045);
    if (isPerfect) {
      if (this.moveAxis === 'x') {
        placed.x = previous.x;
      } else {
        placed.z = previous.z;
      }
      this.perfectStreak += 1;
      this.handlePerfectPlacement(placed);
    } else {
      this.resetPerfectChain();
      this.trimBlockAndCreateFragment(placed, previous, delta);
      this.addTrauma(0.2);
      this.spawnImpactFx(placed, false);
      this.playCutSound();
    }

    this.world3D.settle(placed);

    this.stack.push(placed);
    this.current = null;
    this.phase = 'playing';
    this.setScore(this.score + 1, true);
    this.targetCameraY = -Math.max(0, (this.stack.length - 5) * BLOCK_HEIGHT);
    this.spawnDelay = isPerfect ? 0.095 : 0.055;
  }

  private trimBlockAndCreateFragment(placed: StackBlock, previous: StackBlock, delta: number): void {
    const axisCenter = this.moveAxis === 'x' ? placed.x : placed.z;
    const axisSize = this.moveAxis === 'x' ? placed.width : placed.depth;
    const previousCenter = this.moveAxis === 'x' ? previous.x : previous.z;
    const previousSize = this.moveAxis === 'x' ? previous.width : previous.depth;

    const currentMin = axisCenter - axisSize * 0.5;
    const currentMax = axisCenter + axisSize * 0.5;
    const previousMin = previousCenter - previousSize * 0.5;
    const previousMax = previousCenter + previousSize * 0.5;
    const overlapMin = Math.max(currentMin, previousMin);
    const overlapMax = Math.min(currentMax, previousMax);
    const overlapSize = Math.max(0, overlapMax - overlapMin);
    const retainedCenter = (overlapMin + overlapMax) * 0.5;

    const cutMin = delta > 0 ? overlapMax : currentMin;
    const cutMax = delta > 0 ? currentMax : overlapMin;
    const cutSize = Math.max(0, cutMax - cutMin);
    const cutCenter = (cutMin + cutMax) * 0.5;
    const screenDirection = Math.sign(delta || 1) * (this.moveAxis === 'x' ? 1 : -1);

    const fragment: FallingPiece = {
      ...placed,
      offsetX: 0,
      offsetY: 0,
      velocityX: screenDirection * (80 + cutSize * 13),
      velocityY: 45,
      rotation: 0,
      angularVelocity: screenDirection * (0.85 + cutSize * 0.16),
      opacity: 255,
    };

    if (this.moveAxis === 'x') {
      fragment.x = cutCenter;
      fragment.width = cutSize;
      placed.x = retainedCenter;
      placed.width = overlapSize;
    } else {
      fragment.z = cutCenter;
      fragment.depth = cutSize;
      placed.z = retainedCenter;
      placed.depth = overlapSize;
    }

    if (cutSize > 0.015) {
      this.fallingPieces.push(fragment);
      this.world3D.spawnFragment(fragment, this.moveAxis, delta);
    }
  }

  private handlePerfectPlacement(placed: StackBlock): void {
    this.roundPerfectCount += 1;
    const energy = this.perfectFeedbackEnergy(this.perfectStreak);
    this.playPerfectTone();
    this.addTrauma(
      Math.min(0.38, 0.13 + energy * 0.055),
      Math.min(0.62, 0.44 + energy * 0.03),
    );
    this.flashAlpha = this.reducedMotion
      ? 0
      : Math.min(0.11, 0.018 + (energy - 1) * 0.018);
    if (!this.reducedMotion) {
      this.spawnImpactFx(placed, true, this.perfectStreak);
    }
    this.spawnPerfectFrames(placed, this.perfectStreak);
    this.showPerfectText();
  }

  private failPlacement(placed: StackBlock, delta: number): void {
    const screenDirection = Math.sign(delta || 1) * (this.moveAxis === 'x' ? 1 : -1);
    const miss: FallingPiece = {
      ...placed,
      offsetX: 0,
      offsetY: 0,
      velocityX: screenDirection * 125,
      velocityY: 30,
      rotation: 0,
      angularVelocity: screenDirection * 1.45,
      opacity: 255,
    };
    this.fallingPieces.push(miss);
    this.world3D.releaseMiss(placed, this.moveAxis, delta);
    this.current = null;
    this.phase = 'falling';
    this.pauseButton.active = false;
    this.pauseGroup.active = false;
    this.resultDelay = this.reducedMotion ? 0.35 : 0.68;
    this.restartLock = this.resultDelay + 0.25;
    this.resetPerfectChain();
    this.perfectFrames = [];
    this.resetPerfectFeedback();
    this.addTrauma(0.72);
    this.flashAlpha = this.reducedMotion ? 0 : 0.28;
    this.playSound('end', 0.82);
  }

  private showResultScreen(): void {
    this.phase = 'gameover';
    this.pauseButton.active = false;
    this.pauseGroup.active = false;
    let newBest = false;
    if (!this.testModeEnabled && this.score > this.bestScore) {
      this.bestScore = this.score;
      newBest = true;
      this.saveBestScore();
    }

    this.lastEarnedCoins = this.testModeEnabled ? 0 : this.roundPerfectCount;
    if (this.lastEarnedCoins > 0) {
      this.coins += this.lastEarnedCoins;
      this.saveEconomy();
    }

    this.updateBestLabel();
    this.updateCoinLabels();
    this.resultTitleLabel.string = newBest ? COPY.newBest : COPY.gameOver;
    this.resultScoreLabel.string = `${this.score}`;
    this.resultBestLabel.string = this.testModeEnabled
      ? `${COPY.testScore}\n${COPY.best}  ${this.bestScore}`
      : `${COPY.best}  ${this.bestScore}`;
    this.resultCoinLabel.string = this.testModeEnabled
      ? COPY.noTestCoins
      : `${COPY.perfectReward} ${this.roundPerfectCount} 次  ·  ${COPY.coins} +${this.lastEarnedCoins}`;
    this.resultBestLabel.lineHeight = this.testModeEnabled ? 32 : 34;
    this.resultGroup.active = true;
    this.resultGroup.setScale(0.86, 0.86, 1);
    tween(this.resultGroup)
      .to(this.reducedMotion ? 0.01 : 0.24, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private setScore(value: number, animate: boolean): void {
    this.score = value;
    this.scoreLabel.string = `${this.score}`;
    if (!animate) {
      this.scoreLabel.node.setScale(1, 1, 1);
      return;
    }

    Tween.stopAllByTarget(this.scoreLabel.node);
    this.scoreLabel.node.setScale(1.18, 0.88, 1);
    tween(this.scoreLabel.node)
      .to(this.reducedMotion ? 0.01 : 0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private resetPerfectFeedback(): void {
    Tween.stopAllByTarget(this.perfectOpacity);
    Tween.stopAllByTarget(this.perfectLabel.node);
    this.perfectOpacity.opacity = 0;
    this.perfectLabel.node.setScale(1, 1, 1);
    this.perfectLabel.node.setPosition(0, 248, 0);
  }

  private showPerfectText(): void {
    const energy = this.perfectFeedbackEnergy(this.perfectStreak);
    const peakScale = this.reducedMotion ? 1 : 1 + Math.min(0.22, (energy - 1) * 0.048);
    Tween.stopAllByTarget(this.perfectOpacity);
    Tween.stopAllByTarget(this.perfectLabel.node);
    this.perfectLabel.string = this.perfectStreak > 1 ? `${COPY.perfect}  ×${this.perfectStreak}` : COPY.perfect;
    this.perfectOpacity.opacity = 255;
    this.perfectLabel.node.setScale(0.82, 0.82, 1);
    this.perfectLabel.node.setPosition(0, 228, 0);

    tween(this.perfectLabel.node)
      .to(
        this.reducedMotion ? 0.01 : 0.18,
        { scale: new Vec3(peakScale, peakScale, 1), position: new Vec3(0, 248, 0) },
        { easing: 'backOut' },
      )
      .to(this.reducedMotion ? 0.01 : 0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
      .start();
    tween(this.perfectOpacity)
      .delay(this.reducedMotion ? 0.25 : 0.48)
      .to(this.reducedMotion ? 0.01 : 0.32, { opacity: 0 }, { easing: 'quadOut' })
      .start();
  }

  private spawnImpactFx(block: StackBlock, perfect: boolean, intensity = 1): void {
    const center = this.projectWithoutShake(block.x, block.z, block.level + 1);
    const streak = Math.max(1, intensity);
    const energy = this.perfectFeedbackEnergy(streak);
    const amount = perfect ? Math.min(88, Math.round(17 + streak * 4 + energy * 4)) : 8;
    const accentColor = new Color(255, 238, 166, 255);
    for (let index = 0; index < amount; index += 1) {
      const angle = (Math.PI * 2 * index) / amount + Math.random() * 0.28;
      const isFastSpark = perfect && index % 5 === 0;
      const baseSpeed = perfect
        ? 96 + energy * 15 + Math.random() * (72 + energy * 16)
        : 58 + Math.random() * 45;
      const speed = baseSpeed * (isFastSpark ? 1.3 : 1);
      const perfectLife = Math.min(0.72, 0.45 + (energy - 1) * 0.065);
      const sparkLife = perfectLife * (isFastSpark ? 0.72 : 1);
      const hasTrail = perfect && (isFastSpark || index % 3 === 0);
      this.sparks.push({
        x: center.x,
        y: center.y,
        cameraYAtSpawn: this.cameraY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 30,
        life: perfect ? sparkLife : 0.48,
        maxLife: perfect ? sparkLife : 0.48,
        size: perfect
          ? (isFastSpark
            ? 2.4 + Math.random() * (2 + energy * 0.36)
            : 3.2 + Math.random() * (3.4 + energy * 0.78))
          : 2 + Math.random() * 3,
        trailLength: hasTrail
          ? (isFastSpark ? 14 + energy * 4 : 8 + energy * 3) + Math.random() * 5
          : 0,
        color: perfect
          ? (!isFastSpark && streak >= 3 && index % 4 === 0
            ? accentColor
            : new Color(255, 255, 255, 255))
          : this.hslToColor(block.hue + 18, 82, 74),
      });
    }

    if (this.sparks.length > 128) {
      this.sparks.splice(0, this.sparks.length - 128);
    }

    if (!perfect) {
      this.rings.push({
        worldX: block.x,
        worldZ: block.z,
        level: block.level + 1,
        life: 0.3,
        maxLife: 0.3,
        radius: 10,
        color: this.hslToColor(block.hue, 78, 80),
      });
    }
  }

  private spawnPerfectFrames(block: StackBlock, intensity: number): void {
    const streak = Math.max(1, intensity);
    const energy = this.perfectFeedbackEnergy(streak);
    const waveCount = this.reducedMotion
      ? 1
      : Math.min(6, Math.max(1, Math.ceil(Math.log2(streak + 1))));
    const primaryAlpha = this.reducedMotion
      ? Math.min(220, 140 + (energy - 1) * 18)
      : Math.min(255, 164 + (energy - 1) * 25);

    for (let wave = 0; wave < waveCount; wave += 1) {
      const waveFade = Math.pow(0.72, wave);
      this.perfectFrames.push({
        block: { ...block },
        elapsed: 0,
        delay: this.reducedMotion ? 0 : wave * 0.045,
        duration: this.reducedMotion
          ? 0.24
          : 0.34 + Math.min(0.16, (energy - 1) * 0.03) + wave * 0.045,
        startExpansion: this.reducedMotion ? 10 : 5 + wave * 4,
        maxExpansion: this.reducedMotion ? 10 : 42 + (energy - 1) * 15 + wave * 11,
        alpha: Math.max(42, primaryAlpha * waveFade),
        fillAlpha: wave === 0
          ? Math.min(
            this.reducedMotion ? 54 : 76,
            (this.reducedMotion ? 14 : 18) + (energy - 1) * (this.reducedMotion ? 10 : 16),
          )
          : 0,
        lineWidth: this.reducedMotion
          ? Math.min(5, 2.5 + (energy - 1) * 0.35)
          : Math.max(1.7, 2.8 + Math.min(2.2, (energy - 1) * 0.48) - wave * 0.16),
      });
    }

    if (this.perfectFrames.length > 12) {
      this.perfectFrames.splice(0, this.perfectFrames.length - 12);
    }
  }

  private perfectFeedbackEnergy(streak: number): number {
    return 1 + Math.log2(Math.max(1, streak));
  }

  private updateParticles(dt: number): void {
    for (const spark of this.sparks) {
      spark.life -= dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy -= 190 * dt;
      spark.vx *= Math.pow(0.18, dt);
    }
    this.sparks = this.sparks.filter((spark) => spark.life > 0);

    for (const ring of this.rings) {
      ring.life -= dt;
      ring.radius += dt * 190;
    }
    this.rings = this.rings.filter((ring) => ring.life > 0);

    for (const frame of this.perfectFrames) {
      frame.elapsed += dt;
    }
    this.perfectFrames = this.perfectFrames.filter((frame) => frame.elapsed < frame.delay + frame.duration);
  }

  private updateFallingPieces(dt: number): void {
    for (const piece of this.fallingPieces) {
      piece.velocityY -= 820 * dt;
      piece.offsetX += piece.velocityX * dt;
      piece.offsetY += piece.velocityY * dt;
      piece.rotation += piece.angularVelocity * dt;
      if (piece.offsetY < -this.visibleHeight * 0.58) {
        piece.opacity -= dt * 440;
      }
    }
    this.fallingPieces = this.fallingPieces.filter((piece) => piece.opacity > 0);
  }

  private updateCamera(dt: number): void {
    const follow = 1 - Math.exp(-5.2 * dt);
    this.cameraY += (this.targetCameraY - this.cameraY) * follow;
  }

  private addTrauma(amount: number, cap = 1): void {
    if (this.reducedMotion) {
      return;
    }
    this.trauma = Math.min(cap, this.trauma + amount);
  }

  private updateShake(dt: number): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.65);
    this.shakeTime += dt * 24;
    const strength = this.trauma * this.trauma;
    this.shakeX = strength * (5.5 * Math.sin(this.shakeTime * 1.7) + 2.4 * Math.sin(this.shakeTime * 3.1));
    this.shakeY = strength * (4.2 * Math.sin(this.shakeTime * 2.2 + 0.7) + 1.8 * Math.sin(this.shakeTime * 4.4));
  }

  private drawFrame(): void {
    const g = this.graphics;
    const effects = this.effectsGraphics;
    g.clear();
    effects.clear();
    this.backgroundNode.active = false;
    this.homeTowerPreviewNode.active = false;
    this.natureTextureRoot.active = false;
    this.world3D.sync(this.stack, this.current);
    this.drawEffects(effects);
    this.drawOverlay(effects);
    if (this.flashAlpha > 0) {
      effects.fillColor = new Color(255, 255, 255, Math.round(this.flashAlpha * 255));
      effects.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
      effects.fill();
    }
  }

  private drawBackground(g: Graphics): void {
    const skin = this.currentSkin();
    g.fillColor = this.hslToColor(
      skin.backgroundHue,
      skin.backgroundSaturation,
      skin.backgroundLightness,
    );
    g.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
    g.fill();
  }

  private drawTowerShadow(g: Graphics): void {
    const base = this.project(0, 0, 0);
    const [red, green, blue] = this.currentSkin().shadow;
    for (let index = 4; index >= 1; index -= 1) {
      const scale = index / 4;
      g.fillColor = new Color(red, green, blue, Math.round(9 + scale * 9));
      g.ellipse(base.x, base.y - 78 + 16 * scale, 160 * scale, 38 * scale);
      g.fill();
    }
  }

  private drawGuidePlatform(g: Graphics): void {
    const reference = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
    if (!reference) {
      return;
    }
    const level = reference.level + 0.02;
    const expansion = 0.55;
    const outline: StackBlock = {
      ...reference,
      width: reference.width + expansion,
      depth: reference.depth + expansion,
      level,
    };
    const points = this.topPoints(outline);
    g.strokeColor = this.rgb(this.currentSkin().accentColor, 42);
    g.lineWidth = 1.2;
    g.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      g.lineTo(points[index].x, points[index].y);
    }
    g.close();
    g.stroke();
  }

  private drawBlock(
    g: Graphics,
    block: StackBlock,
    offsetY = 0,
    rotation = 0,
    opacity = 255,
    offsetX = 0,
  ): void {
    if (block.width <= 0.01 || block.depth <= 0.01) {
      return;
    }

    const { top, bottom } = this.blockFaceGeometry(block, offsetY, rotation, offsetX);
    const skin = this.currentSkin();
    const colors = this.blockColorsForSkin(skin, block.level, opacity, block.hue);

    this.fillPolygon(g, [top[3], top[0], bottom[0], bottom[3]], colors.left);
    this.fillPolygon(g, [top[0], top[1], bottom[1], bottom[0]], colors.right);
    this.fillPolygon(g, top, colors.top);

    g.strokeColor = colors.outline;
    g.lineWidth = skin.visualStyle === 'cyber' ? 2.1 : 1.15;
    g.moveTo(top[3].x, top[3].y);
    g.lineTo(top[2].x, top[2].y);
    g.lineTo(top[1].x, top[1].y);
    g.stroke();

    if (skin.visualStyle === 'porcelain') {
      const leftMidA = this.midpoint(top[3], bottom[3]);
      const leftMidB = this.midpoint(top[0], bottom[0]);
      const rightMidA = this.midpoint(top[0], bottom[0]);
      const rightMidB = this.midpoint(top[1], bottom[1]);
      g.strokeColor = this.rgb(skin.secondaryAccentColor, Math.round(opacity * 0.76));
      g.lineWidth = 4;
      g.moveTo(leftMidA.x, leftMidA.y);
      g.lineTo(leftMidB.x, leftMidB.y);
      g.moveTo(rightMidA.x, rightMidA.y);
      g.lineTo(rightMidB.x, rightMidB.y);
      g.stroke();
    } else if (skin.visualStyle === 'pastel') {
      const faceCenter = this.quadCenter(top[3], top[0], bottom[0], bottom[3]);
      const decoration = skin.blockPalette?.[(block.level + 2) % skin.blockPalette.length] ?? skin.secondaryAccentColor;
      g.fillColor = this.rgb(decoration, Math.round(opacity * 0.85));
      g.circle(faceCenter.x, faceCenter.y, 4.5);
      g.fill();
    }
  }

  private blockFaceGeometry(
    block: StackBlock,
    offsetY = 0,
    rotation = 0,
    offsetX = 0,
  ): BlockFaceGeometry {
    const rawTop = this.topPoints(block).map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }));
    const center = rawTop.reduce((acc, point) => ({ x: acc.x + point.x / 4, y: acc.y + point.y / 4 }), { x: 0, y: 0 });
    const top = rotation === 0 ? rawTop : rawTop.map((point) => this.rotatePoint(point, center, rotation));
    const down = (point: Point2): Point2 => {
      const lowered = { x: point.x, y: point.y - BLOCK_HEIGHT };
      return rotation === 0 ? lowered : this.rotatePoint(lowered, center, rotation);
    };
    const bottom = top.map((_, index) => down(rawTop[index]));
    return { top, bottom };
  }

  private updateNatureTextureBlocks(renderedBlocks: readonly RenderedBlock[]): void {
    const materialsReady = this.natureMaterialFrames.size === 3;
    if (this.selectedSkinId !== 'nature-zen' || !materialsReady || renderedBlocks.length === 0) {
      this.natureTextureRoot.active = false;
      return;
    }

    this.natureTextureRoot.active = true;
    const margin = 160;
    const visibleBlocks = renderedBlocks.filter((rendered) => {
      const { top, bottom } = this.blockFaceGeometry(
        rendered.block,
        rendered.offsetY,
        rendered.rotation,
        rendered.offsetX,
      );
      const points = [...top, ...bottom];
      const minY = Math.min(...points.map((point) => point.y));
      const maxY = Math.max(...points.map((point) => point.y));
      return maxY >= -this.visibleHeight * 0.5 - margin
        && minY <= this.visibleHeight * 0.5 + margin;
    });

    visibleBlocks.forEach((rendered, index) => {
      const texturedBlock = this.ensureNatureTextureBlock(index);
      texturedBlock.node.active = true;
      const geometry = this.blockFaceGeometry(
        rendered.block,
        rendered.offsetY,
        rendered.rotation,
        rendered.offsetX,
      );
      const frame = this.natureMaterialFrames.get(this.natureMaterialForLevel(rendered.block.level));
      if (!frame) {
        texturedBlock.node.active = false;
        return;
      }

      const alpha = Math.round(rendered.opacity);
      this.configureNatureTextureFace(
        texturedBlock.left,
        [geometry.top[3], geometry.top[0], geometry.bottom[0], geometry.bottom[3]],
        frame,
        new Color(218, 220, 202, alpha),
        rendered.rotation * 180 / Math.PI,
      );
      this.configureNatureTextureFace(
        texturedBlock.right,
        [geometry.top[0], geometry.top[1], geometry.bottom[1], geometry.bottom[0]],
        frame,
        new Color(194, 199, 181, alpha),
        rendered.rotation * 180 / Math.PI,
      );
      this.configureNatureTextureFace(
        texturedBlock.top,
        geometry.top,
        frame,
        new Color(255, 249, 226, alpha),
        Math.atan2(this.isoY, this.isoX) * 180 / Math.PI + rendered.rotation * 180 / Math.PI,
        true,
      );
    });

    for (let index = visibleBlocks.length; index < this.natureTextureBlocks.length; index += 1) {
      this.natureTextureBlocks[index].node.active = false;
    }
  }

  private ensureNatureTextureBlock(index: number): NatureTextureBlock {
    const existing = this.natureTextureBlocks[index];
    if (existing) {
      return existing;
    }

    const node = this.makeNode(`NatureTextureBlock-${index}`, this.natureTextureRoot);
    node.addComponent(UITransform).setContentSize(this.visibleWidth, this.visibleHeight);
    const texturedBlock: NatureTextureBlock = {
      node,
      left: this.makeNatureTextureFace(node, 'Left'),
      right: this.makeNatureTextureFace(node, 'Right'),
      top: this.makeNatureTextureFace(node, 'Top'),
    };
    this.natureTextureBlocks.push(texturedBlock);
    return texturedBlock;
  }

  private makeNatureTextureFace(parent: Node, name: string): NatureTextureFace {
    const maskNode = this.makeNode(name, parent);
    maskNode.addComponent(UITransform).setContentSize(this.visibleWidth, this.visibleHeight);
    const mask = maskNode.addComponent(MaskComponent);
    mask.type = MaskComponent.Type.GRAPHICS_STENCIL;
    const maskGraphics = mask.subComp as Graphics;

    const spriteNode = this.makeNode(`${name}Texture`, maskNode);
    spriteNode.addComponent(UITransform).setContentSize(64, 64);
    const sprite = spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    return { maskNode, maskGraphics, spriteNode, sprite };
  }

  private configureNatureTextureFace(
    face: NatureTextureFace,
    points: readonly Point2[],
    frame: SpriteFrame,
    color: Color,
    textureRotation: number,
    squareCoverage = false,
  ): void {
    face.maskGraphics.clear();
    face.maskGraphics.fillColor = Color.WHITE;
    face.maskGraphics.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      face.maskGraphics.lineTo(points[index].x, points[index].y);
    }
    face.maskGraphics.close();
    face.maskGraphics.fill();

    const minX = Math.min(...points.map((point) => point.x));
    const maxX = Math.max(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxY = Math.max(...points.map((point) => point.y));
    const width = Math.max(4, maxX - minX + 6);
    const height = Math.max(4, maxY - minY + 6);
    const coverage = squareCoverage ? Math.hypot(width, height) + 12 : 0;

    face.sprite.spriteFrame = frame;
    face.sprite.color = color;
    face.spriteNode.getComponent(UITransform)?.setContentSize(
      squareCoverage ? coverage : width,
      squareCoverage ? coverage : height,
    );
    face.spriteNode.setPosition((minX + maxX) * 0.5, (minY + maxY) * 0.5, 0);
    face.spriteNode.setRotationFromEuler(0, 0, textureRotation);
  }

  private natureMaterialForLevel(level: number): NatureMaterialId {
    const sequence: readonly NatureMaterialId[] = [
      'green-stone',
      'light-wood',
      'walnut',
      'green-stone',
      'light-wood',
    ];
    return sequence[Math.abs(level) % sequence.length];
  }

  private drawNatureTextureEdges(g: Graphics, renderedBlocks: readonly RenderedBlock[]): void {
    if (!this.natureTextureRoot.active || renderedBlocks.length === 0) {
      return;
    }

    g.lineJoin = Graphics.LineJoin.ROUND;
    g.lineCap = Graphics.LineCap.ROUND;
    for (const rendered of renderedBlocks) {
      if (rendered.block.width <= 0.01 || rendered.block.depth <= 0.01) {
        continue;
      }
      const { top, bottom } = this.blockFaceGeometry(
        rendered.block,
        rendered.offsetY,
        rendered.rotation,
        rendered.offsetX,
      );
      const alpha = Math.max(0, Math.min(255, rendered.opacity));

      g.strokeColor = new Color(24, 37, 27, Math.round(alpha * 0.72));
      g.lineWidth = 5.4;
      g.moveTo(top[3].x, top[3].y);
      g.lineTo(top[2].x, top[2].y);
      g.lineTo(top[1].x, top[1].y);
      g.lineTo(bottom[1].x, bottom[1].y);
      g.lineTo(bottom[0].x, bottom[0].y);
      g.lineTo(bottom[3].x, bottom[3].y);
      g.close();
      g.stroke();

      g.strokeColor = new Color(210, 161, 68, Math.round(alpha * 0.92));
      g.lineWidth = 2.4;
      g.moveTo(top[3].x, top[3].y);
      g.lineTo(top[2].x, top[2].y);
      g.lineTo(top[1].x, top[1].y);
      g.lineTo(top[0].x, top[0].y);
      g.close();
      g.moveTo(top[3].x, top[3].y);
      g.lineTo(bottom[3].x, bottom[3].y);
      g.lineTo(bottom[0].x, bottom[0].y);
      g.lineTo(bottom[1].x, bottom[1].y);
      g.lineTo(top[1].x, top[1].y);
      g.stroke();

      g.strokeColor = new Color(255, 236, 174, Math.round(alpha * 0.78));
      g.lineWidth = 1.15;
      g.moveTo(top[3].x, top[3].y);
      g.lineTo(top[0].x, top[0].y);
      g.lineTo(top[1].x, top[1].y);
      g.stroke();
    }

    const emblemBlock = this.current ?? this.stack[this.stack.length - 1];
    const emblemState = [...renderedBlocks].reverse().find((rendered) => (
      rendered.block === emblemBlock
      && rendered.rotation === 0
      && rendered.opacity > 220
    ));
    if (emblemState) {
      const { top } = this.blockFaceGeometry(
        emblemState.block,
        emblemState.offsetY,
        emblemState.rotation,
        emblemState.offsetX,
      );
      const center = this.quadCenter(top[0], top[1], top[2], top[3]);
      const size = Math.max(7, Math.min(12, (emblemState.block.width + emblemState.block.depth) * 0.95));
      g.fillColor = new Color(178, 124, 42, 232);
      g.moveTo(center.x, center.y + size);
      g.lineTo(center.x + size, center.y);
      g.lineTo(center.x, center.y - size);
      g.lineTo(center.x - size, center.y);
      g.close();
      g.fill();
      g.strokeColor = new Color(255, 235, 167, 245);
      g.lineWidth = 1.5;
      g.stroke();
    }
  }

  private drawEffects(g: Graphics): void {
    for (const frame of this.perfectFrames) {
      if (frame.elapsed < frame.delay) {
        continue;
      }
      const progress = Math.min(1, (frame.elapsed - frame.delay) / frame.duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const fadeIn = Math.min(1, (frame.elapsed - frame.delay) / 0.035);
      const fade = fadeIn * Math.pow(1 - progress, 1.18);
      const center = this.project(frame.block.x, frame.block.z, frame.block.level + 1);
      const baseHalfWidth = (frame.block.width + frame.block.depth) * this.isoX * 0.5;
      const horizontalRoom = Math.max(0, this.visibleWidth * 0.5 - 32 - Math.abs(center.x) - baseHalfWidth);
      const maxExpansion = Math.min(frame.maxExpansion, horizontalRoom);
      const startExpansion = Math.min(frame.startExpansion, maxExpansion);
      const expansionPixels = startExpansion + (maxExpansion - startExpansion) * eased;
      const expansion = expansionPixels / Math.max(1, this.isoX);
      const outline: StackBlock = {
        ...frame.block,
        width: frame.block.width + expansion,
        depth: frame.block.depth + expansion,
        level: frame.block.level + 0.035,
      };
      const points = this.topPoints(outline);
      if (frame.fillAlpha > 0) {
        const fillFade = fadeIn * Math.pow(1 - progress, 4);
        this.fillPolygon(
          g,
          points,
          new Color(255, 255, 255, Math.round(frame.fillAlpha * fillFade)),
        );
      }
      g.strokeColor = new Color(255, 255, 255, Math.round(frame.alpha * fade));
      g.lineWidth = frame.lineWidth;
      g.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length; index += 1) {
        g.lineTo(points[index].x, points[index].y);
      }
      g.close();
      g.stroke();
    }

    for (const ring of this.rings) {
      const ratio = Math.max(0, ring.life / ring.maxLife);
      const center = this.project(ring.worldX, ring.worldZ, ring.level);
      g.strokeColor = new Color(ring.color.r, ring.color.g, ring.color.b, Math.round(ring.color.a * ratio));
      g.lineWidth = 1 + ratio * 2.5;
      g.circle(center.x, center.y, ring.radius);
      g.stroke();
    }

    for (const spark of this.sparks) {
      const ratio = Math.max(0, spark.life / spark.maxLife);
      const visibility = Math.pow(ratio, 0.65);
      const alpha = Math.round(255 * visibility);
      g.fillColor = new Color(spark.color.r, spark.color.g, spark.color.b, alpha);
      const size = Math.max(0.9, spark.size * (0.42 + ratio * 0.58));
      const cameraOffset = this.cameraY - spark.cameraYAtSpawn;
      const x = spark.x + this.shakeX;
      const y = spark.y + cameraOffset + this.shakeY;
      if (spark.trailLength > 0) {
        const speed = Math.max(1, Math.hypot(spark.vx, spark.vy));
        const trail = spark.trailLength * visibility;
        g.strokeColor = new Color(spark.color.r, spark.color.g, spark.color.b, Math.round(alpha * 0.72));
        g.lineWidth = Math.max(1, size * 0.58);
        g.moveTo(x - (spark.vx / speed) * trail, y - (spark.vy / speed) * trail);
        g.lineTo(x, y);
        g.stroke();
      }
      g.rect(
        x - size * 0.5,
        y - size * 0.5,
        size,
        size,
      );
      g.fill();
    }
  }

  private drawOverlay(g: Graphics): void {
    const skin = this.currentSkin();
    if (this.phase === 'ready') {
      g.fillColor = this.rgb(skin.panelColor, skin.visualStyle === 'pastel' || skin.visualStyle === 'nature' ? 8 : 22);
      g.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
      g.fill();

      const pulse = 0.5 + 0.5 * Math.sin(this.promptTime * 2.8);
      g.fillColor = this.rgb(skin.buttonColor, 205 + Math.round(pulse * 26));
      g.roundRect(-178, -104, 356, 94, 47);
      g.fill();
      g.strokeColor = this.rgb(skin.accentColor, 108 + Math.round(pulse * 92));
      g.lineWidth = 2;
      g.roundRect(-178, -104, 356, 94, 47);
      g.stroke();
    } else if (this.phase === 'paused') {
      g.fillColor = new Color(4, 18, 29, 188);
      g.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
      g.fill();
      g.fillColor = this.rgb(skin.panelColor, 238);
      g.roundRect(-285, -330, 570, 610, 38);
      g.fill();
      g.strokeColor = this.rgb(skin.accentColor, 122);
      g.lineWidth = 2;
      g.roundRect(-285, -330, 570, 610, 38);
      g.stroke();
    } else if (this.phase === 'gameover') {
      g.fillColor = new Color(6, 22, 34, 98);
      g.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
      g.fill();
      g.fillColor = this.rgb(skin.panelColor, 224);
      g.roundRect(-245, -285, 490, 520, 34);
      g.fill();
      g.strokeColor = this.rgb(skin.accentColor, 108);
      g.lineWidth = 1.5;
      g.roundRect(-245, -285, 490, 520, 34);
      g.stroke();
    }
  }

  private topPoints(block: StackBlock): Point2[] {
    const halfW = block.width * 0.5;
    const halfD = block.depth * 0.5;
    return [
      this.project(block.x - halfW, block.z - halfD, block.level + 1),
      this.project(block.x + halfW, block.z - halfD, block.level + 1),
      this.project(block.x + halfW, block.z + halfD, block.level + 1),
      this.project(block.x - halfW, block.z + halfD, block.level + 1),
    ];
  }

  private projectWithoutShake(x: number, z: number, level: number): Point2 {
    return {
      x: (x - z) * this.isoX,
      y: this.worldOriginY + (x + z) * this.isoY + level * BLOCK_HEIGHT + this.cameraY,
    };
  }

  private project(x: number, z: number, level: number): Point2 {
    const point = this.projectWithoutShake(x, z, level);
    return {
      x: point.x + this.shakeX,
      y: point.y + this.shakeY,
    };
  }

  private fillPolygon(g: Graphics, points: Point2[], color: Color): void {
    g.fillColor = color;
    g.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      g.lineTo(points[index].x, points[index].y);
    }
    g.close();
    g.fill();
  }

  private rotatePoint(point: Point2, center: Point2, radians: number): Point2 {
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: center.x + dx * cosine - dy * sine,
      y: center.y + dx * sine + dy * cosine,
    };
  }

  private initializeAudio(): void {
    this.audioSource = this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
    this.audioSource.playOnAwake = false;
    this.audioSource.loop = false;
    this.audioSource.volume = 0.7;

    resources.loadDir<AudioClip>('audio', AudioClip, (error, clips) => {
      if (error) {
        console.warn('[WxStack] Unable to load sound effects.', error);
        this.audioReady = true;
        this.updateAudioPrompt();
        return;
      }
      for (const clip of clips) {
        this.audioClips.set(clip.name, clip);
      }
      this.audioReady = true;
      this.updateAudioPrompt();
    });
  }

  private updateAudioPrompt(): void {
    if (this.startPromptLabel?.isValid) {
      this.startPromptLabel.string = this.audioReady ? COPY.start : COPY.loadingAudio;
    }
  }

  private playSound(name: string, volumeScale = 1): void {
    if (!this.soundEnabled) {
      return;
    }
    const clip = this.audioClips.get(name);
    if (!clip || !this.audioSource?.isValid) {
      return;
    }
    this.audioSource.playOneShot(clip, volumeScale);
  }

  private playCutSound(): void {
    this.playSound('cut-2', 0.65);
  }

  private playPerfectTone(): void {
    const step = this.perfectToneStep;
    const degree = step % NATURAL_MAJOR_INTERVALS.length;
    const noteName = NATURAL_MAJOR_NOTE_NAMES[degree];
    const clipName = step < NATURAL_MAJOR_INTERVALS.length
      ? `perfect-major-${noteName}5`
      : `perfect-rise-${noteName}`;

    // Advance from the gameplay event, even when audio is muted or a clip failed to load.
    this.perfectToneStep += 1;
    this.playSound(clipName, step < NATURAL_MAJOR_INTERVALS.length ? 0.82 : 0.76);
  }

  private resetPerfectChain(): void {
    this.perfectStreak = 0;
    this.perfectToneStep = 0;
  }

  private onPointerAction(): void {
    if (this.homeOverlay !== 'none') {
      return;
    }
    this.tryPrimaryAction();
  }

  private onTestModeToggle(): void {
    this.toggleTestMode();
  }

  private onSettingsButton(): void {
    this.openHomeOverlay('settings');
  }

  private onSkinsButton(): void {
    this.openHomeOverlay('skins');
  }

  private onSoundToggle(): void {
    this.settingsSelection = 0;
    this.toggleSoundSetting();
  }

  private onMotionToggle(): void {
    this.settingsSelection = 1;
    this.toggleMotionSetting();
  }

  private onCloseHomeOverlay(): void {
    this.closeHomeOverlay();
  }

  private openHomeOverlay(overlay: Exclude<HomeOverlay, 'none'>): void {
    if (this.phase !== 'ready' || this.homeOverlay !== 'none') {
      return;
    }
    this.homeOverlay = overlay;
    this.lastActionAt = Date.now();
    this.startGroup.active = false;
    this.settingsGroup.active = overlay === 'settings';
    this.skinsGroup.active = overlay === 'skins';

    const group = overlay === 'settings' ? this.settingsGroup : this.skinsGroup;
    if (overlay === 'settings') {
      this.settingsSelection = 0;
      this.updateSettingsUI();
    } else {
      this.skinSelection = Math.max(0, SKIN_IDS.indexOf(this.selectedSkinId));
      this.skinsHintLabel.string = COPY.skinHint;
      this.updateSkinShopUI();
    }
    Tween.stopAllByTarget(group);
    group.setScale(0.97, 0.97, 1);
    tween(group)
      .to(this.reducedMotion ? 0.01 : 0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private closeHomeOverlay(): void {
    if (this.phase !== 'ready' || this.homeOverlay === 'none') {
      return;
    }
    Tween.stopAllByTarget(this.settingsGroup);
    Tween.stopAllByTarget(this.skinsGroup);
    this.settingsGroup.active = false;
    this.skinsGroup.active = false;
    this.settingsGroup.setScale(1, 1, 1);
    this.skinsGroup.setScale(1, 1, 1);
    this.homeOverlay = 'none';
    this.startGroup.active = true;
    this.lastActionAt = Date.now();
    this.updateSettingsUI();
    this.updateSkinShopUI();
  }

  private toggleSoundSetting(): void {
    if (this.homeOverlay !== 'settings') {
      return;
    }
    this.soundEnabled = !this.soundEnabled;
    this.saveUserSettings();
    this.updateSettingsUI();
    if (this.soundEnabled) {
      this.playSound('start', 0.35);
    }
  }

  private toggleMotionSetting(): void {
    if (this.homeOverlay !== 'settings') {
      return;
    }
    this.reducedMotion = !this.reducedMotion;
    this.saveUserSettings();
    this.updateSettingsUI();
  }

  private useOrBuySkin(skinId: SkinId): void {
    if (this.homeOverlay !== 'skins') {
      return;
    }
    const skin = SKINS[skinId];
    if (!this.ownedSkins.has(skinId)) {
      if (this.coins < skin.price) {
        this.skinsHintLabel.string = `金币不足，还差 ${skin.price - this.coins} 枚`;
        this.updateSkinShopUI();
        return;
      }
      this.coins -= skin.price;
      this.ownedSkins.add(skinId);
      this.skinsHintLabel.string = `已解锁「${skin.name}」`;
    } else if (this.selectedSkinId === skinId) {
      this.skinsHintLabel.string = `正在使用「${skin.name}」`;
    } else {
      this.skinsHintLabel.string = `已换上「${skin.name}」`;
    }

    this.selectedSkinId = skinId;
    this.saveEconomy();
    this.updateCoinLabels();
    this.updateSkinShopUI();
    this.refreshVisibleSkin();
  }

  private moveSettingsSelection(direction: number): void {
    this.settingsSelection = (this.settingsSelection + (direction > 0 ? 1 : -1) + 3) % 3;
    this.updateSettingsUI();
  }

  private activateSettingsSelection(): void {
    if (this.settingsSelection === 0) {
      this.toggleSoundSetting();
    } else if (this.settingsSelection === 1) {
      this.toggleMotionSetting();
    } else {
      this.closeHomeOverlay();
    }
  }

  private moveSkinSelection(horizontal: number, vertical: number): void {
    const closeIndex = SKIN_IDS.length;
    if (this.skinSelection === closeIndex) {
      if (vertical > 0) {
        this.skinSelection = Math.max(0, SKIN_IDS.indexOf(this.selectedSkinId));
      }
      this.updateSkinShopUI();
      return;
    }

    if (Math.abs(horizontal) > Math.abs(vertical)) {
      const rowStart = Math.floor(this.skinSelection / 2) * 2;
      const candidate = rowStart + (horizontal > 0 ? 1 : 0);
      if (candidate < SKIN_IDS.length) {
        this.skinSelection = candidate;
      }
    } else if (vertical < 0) {
      const candidate = this.skinSelection + 2;
      this.skinSelection = candidate < SKIN_IDS.length ? candidate : closeIndex;
    } else if (vertical > 0) {
      this.skinSelection = Math.max(0, this.skinSelection - 2);
    }
    this.updateSkinShopUI();
  }

  private activateSkinSelection(): void {
    const skinId = SKIN_IDS[this.skinSelection];
    if (skinId) {
      this.useOrBuySkin(skinId);
    } else {
      this.closeHomeOverlay();
    }
  }

  private onPauseButton(): void {
    this.pauseGame();
  }

  private onResumeButton(): void {
    this.resumeGame();
  }

  private onRestartButton(): void {
    this.restartPausedGame();
  }

  private onHomeButton(): void {
    this.returnToHome();
  }

  private pauseGame(): void {
    if (this.phase !== 'playing' && this.phase !== 'dropping') {
      return;
    }

    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
    this.world3D.setPaused(true);
    this.pauseSelection = 0;
    this.resumeInputLock = 0;
    this.lastActionAt = Date.now();
    this.trauma = 0;
    this.shakeTime = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.resetPerfectFeedback();
    this.pauseButton.active = false;
    this.pauseGroup.active = true;
    this.updatePauseMenuFocus();
    this.drawFrame();

    Tween.stopAllByTarget(this.pauseGroup);
    this.pauseGroup.setScale(0.96, 0.96, 1);
    tween(this.pauseGroup)
      .to(this.reducedMotion ? 0.01 : 0.15, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private resumeGame(): void {
    if (this.phase !== 'paused') {
      return;
    }

    Tween.stopAllByTarget(this.pauseGroup);
    this.pauseGroup.active = false;
    this.pauseGroup.setScale(1, 1, 1);
    this.phase = this.phaseBeforePause;
    this.world3D.setPaused(false);
    this.pauseButton.active = true;
    this.resumeInputLock = 0.14;
    this.lastActionAt = Date.now();
  }

  private returnToHome(): void {
    if (this.phase !== 'paused') {
      return;
    }
    this.showReadyScreen();
  }

  private restartPausedGame(): void {
    if (this.phase !== 'paused') {
      return;
    }
    this.startGame();
  }

  private togglePause(): void {
    if (this.phase === 'playing' || this.phase === 'dropping') {
      this.pauseGame();
    } else if (this.phase === 'paused') {
      this.resumeGame();
    }
  }

  private selectPauseOption(direction: number): void {
    if (this.phase !== 'paused') {
      return;
    }
    this.pauseSelection = (this.pauseSelection + (direction > 0 ? 1 : -1) + 3) % 3;
    this.updatePauseMenuFocus();
  }

  private activatePauseSelection(): void {
    if (this.phase !== 'paused') {
      return;
    }
    if (this.pauseSelection === 0) {
      this.resumeGame();
    } else if (this.pauseSelection === 1) {
      this.restartPausedGame();
    } else {
      this.returnToHome();
    }
  }

  private onGameHide(): void {
    this.pauseGame();
  }

  private onKeyDown(event: EventKeyboard): void {
    const isPauseToggle = event.keyCode === KeyCode.ESCAPE
      || event.keyCode === KeyCode.KEY_P;
    const isMenuNavigation = event.keyCode === KeyCode.ARROW_UP
      || event.keyCode === KeyCode.ARROW_DOWN
      || event.keyCode === KeyCode.ARROW_LEFT
      || event.keyCode === KeyCode.ARROW_RIGHT
      || event.keyCode === KeyCode.KEY_A
      || event.keyCode === KeyCode.KEY_D
      || event.keyCode === KeyCode.KEY_W
      || event.keyCode === KeyCode.KEY_S;
    const isActionKey = event.keyCode === KeyCode.SPACE
      || event.keyCode === KeyCode.ENTER
      || event.keyCode === KeyCode.KEY_R
      || event.keyCode === KeyCode.KEY_T
      || event.keyCode === KeyCode.KEY_K
      || isPauseToggle
      || isMenuNavigation;
    if (!isActionKey || this.heldKeys.has(event.keyCode)) {
      return;
    }
    this.heldKeys.add(event.keyCode);

    if (this.homeOverlay !== 'none') {
      if (event.keyCode === KeyCode.ESCAPE) {
        this.closeHomeOverlay();
      } else if (this.homeOverlay === 'settings') {
        if (event.keyCode === KeyCode.ARROW_UP || event.keyCode === KeyCode.KEY_W) {
          this.moveSettingsSelection(-1);
        } else if (event.keyCode === KeyCode.ARROW_DOWN || event.keyCode === KeyCode.KEY_S) {
          this.moveSettingsSelection(1);
        } else if (event.keyCode === KeyCode.ARROW_LEFT
          || event.keyCode === KeyCode.ARROW_RIGHT
          || event.keyCode === KeyCode.KEY_A
          || event.keyCode === KeyCode.KEY_D
          || event.keyCode === KeyCode.SPACE
          || event.keyCode === KeyCode.ENTER) {
          this.activateSettingsSelection();
        }
      } else {
        if (event.keyCode === KeyCode.ARROW_LEFT || event.keyCode === KeyCode.KEY_A) {
          this.moveSkinSelection(-1, 0);
        } else if (event.keyCode === KeyCode.ARROW_RIGHT || event.keyCode === KeyCode.KEY_D) {
          this.moveSkinSelection(1, 0);
        } else if (event.keyCode === KeyCode.ARROW_UP || event.keyCode === KeyCode.KEY_W) {
          this.moveSkinSelection(0, 1);
        } else if (event.keyCode === KeyCode.ARROW_DOWN || event.keyCode === KeyCode.KEY_S) {
          this.moveSkinSelection(0, -1);
        } else if (event.keyCode === KeyCode.SPACE || event.keyCode === KeyCode.ENTER) {
          this.activateSkinSelection();
        }
      }
      return;
    }

    if (this.phase === 'ready') {
      if (event.keyCode === KeyCode.KEY_S) {
        this.openHomeOverlay('settings');
        return;
      }
      if (event.keyCode === KeyCode.KEY_K) {
        this.openHomeOverlay('skins');
        return;
      }
      if (isMenuNavigation) {
        return;
      }
    }

    if (isPauseToggle) {
      this.togglePause();
      return;
    }

    if (this.phase === 'paused') {
      if (event.keyCode === KeyCode.KEY_R) {
        this.restartPausedGame();
      } else if (event.keyCode === KeyCode.ARROW_UP || event.keyCode === KeyCode.KEY_W) {
        this.selectPauseOption(-1);
      } else if (event.keyCode === KeyCode.ARROW_DOWN || event.keyCode === KeyCode.KEY_S) {
        this.selectPauseOption(1);
      } else if (event.keyCode === KeyCode.SPACE || event.keyCode === KeyCode.ENTER) {
        this.activatePauseSelection();
      }
      return;
    }

    if (event.keyCode === KeyCode.KEY_T) {
      this.toggleTestMode();
    } else if (event.keyCode === KeyCode.SPACE) {
      this.tryPrimaryAction();
    } else if (event.keyCode === KeyCode.ENTER) {
      this.tryContinueAction();
    } else {
      this.tryRestartAction();
    }
  }

  private onKeyUp(event: EventKeyboard): void {
    this.heldKeys.delete(event.keyCode);
  }

  private onGamepadInput(event: EventGamepad): void {
    const southPressed = event.gamepad.buttonSouth.getValue() > 0.55;
    const optionsPressed = event.gamepad.buttonOptions.getValue() > 0.55;
    const northPressed = event.gamepad.buttonNorth.getValue() > 0.55;
    const eastPressed = event.gamepad.buttonEast.getValue() > 0.55;
    const westPressed = event.gamepad.buttonWest.getValue() > 0.55;
    const northJustPressed = northPressed && !this.gamepadNorthHeld;
    const southJustPressed = southPressed && !this.gamepadSouthHeld;
    const optionsJustPressed = optionsPressed && !this.gamepadOptionsHeld;
    const eastJustPressed = eastPressed && !this.gamepadEastHeld;
    const westJustPressed = westPressed && !this.gamepadWestHeld;
    const dpad = event.gamepad.dpad.getValue();
    const stick = event.gamepad.leftStick.getValue();
    const menuAxisX = Math.abs(dpad.x) > 0.55 ? dpad.x : stick.x;
    const menuAxisY = Math.abs(dpad.y) > 0.55 ? dpad.y : stick.y;
    const menuAxisPressed = Math.abs(menuAxisX) > 0.55 || Math.abs(menuAxisY) > 0.55;
    const menuAxisJustPressed = menuAxisPressed && !this.gamepadMenuAxisHeld;
    this.gamepadSouthHeld = southPressed;
    this.gamepadOptionsHeld = optionsPressed;
    this.gamepadNorthHeld = northPressed;
    this.gamepadEastHeld = eastPressed;
    this.gamepadWestHeld = westPressed;
    this.gamepadMenuAxisHeld = menuAxisPressed;

    if (this.homeOverlay !== 'none') {
      if (eastJustPressed || optionsJustPressed) {
        this.closeHomeOverlay();
        return;
      }
      if (menuAxisJustPressed) {
        if (this.homeOverlay === 'settings' && Math.abs(menuAxisY) > 0.55) {
          this.moveSettingsSelection(menuAxisY > 0 ? -1 : 1);
        } else if (this.homeOverlay === 'skins') {
          this.moveSkinSelection(menuAxisX, menuAxisY);
        }
      }
      if (southJustPressed) {
        if (this.homeOverlay === 'settings') {
          this.activateSettingsSelection();
        } else {
          this.activateSkinSelection();
        }
      }
      return;
    }

    if (optionsJustPressed && (this.phase === 'playing' || this.phase === 'dropping' || this.phase === 'paused')) {
      this.togglePause();
      return;
    }

    if (this.phase === 'paused') {
      if (menuAxisJustPressed && Math.abs(menuAxisY) > 0.55) {
        this.selectPauseOption(menuAxisY > 0 ? -1 : 1);
      }
      if (southJustPressed) {
        this.activatePauseSelection();
      }
      return;
    }

    if (this.phase === 'ready' && eastJustPressed) {
      this.openHomeOverlay('settings');
      return;
    }
    if (this.phase === 'ready' && westJustPressed) {
      this.openHomeOverlay('skins');
      return;
    }

    if (northJustPressed) {
      this.toggleTestMode();
      return;
    }
    if (southJustPressed) {
      this.tryPrimaryAction();
    }
    if (optionsJustPressed) {
      this.tryContinueAction();
    }
  }

  private toggleTestMode(): void {
    if (this.phase !== 'ready') {
      return;
    }
    this.testModeEnabled = !this.testModeEnabled;
    this.resetPerfectChain();
    this.resetPerfectFeedback();
    this.updateTestModeUI();

    Tween.stopAllByTarget(this.testModeToggle);
    this.testModeToggle.setScale(0.98, 0.98, 1);
    tween(this.testModeToggle)
      .to(this.reducedMotion ? 0.01 : 0.12, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' })
      .start();
  }

  private consumeActionDebounce(): boolean {
    const now = Date.now();
    if (now - this.lastActionAt < 90) {
      return false;
    }
    this.lastActionAt = now;
    return true;
  }

  private tryPrimaryAction(): void {
    if (!this.consumeActionDebounce()) {
      return;
    }
    if (this.phase === 'ready') {
      this.startGame();
    } else if (this.phase === 'playing' && this.resumeInputLock <= 0) {
      this.placeCurrentBlock();
    } else if (this.phase === 'gameover' && this.restartLock <= 0) {
      this.startGame();
    }
  }

  private tryContinueAction(): void {
    if ((this.phase !== 'ready' && this.phase !== 'gameover') || !this.consumeActionDebounce()) {
      return;
    }
    if (this.phase === 'ready' || this.restartLock <= 0) {
      this.startGame();
    }
  }

  private tryRestartAction(): void {
    if ((this.phase !== 'ready' && this.phase !== 'gameover') || !this.consumeActionDebounce()) {
      return;
    }
    if (this.phase === 'ready' || this.restartLock <= 0) {
      this.startGame();
    }
  }

  private onCanvasResize(): void {
    this.resizeStage();
  }

  private resizeStage(): void {
    const visible = view.getVisibleSize();
    const frame = screen.windowSize;
    this.visibleWidth = visible.width;
    this.visibleHeight = visible.height;
    this.isoX = Math.max(33, Math.min(43, this.visibleWidth / 18.5));
    this.isoY = this.isoX * 0.5;
    this.worldOriginY = -this.visibleHeight * 0.3;

    this.node.getComponent(UITransform)?.setContentSize(visible);
    this.backgroundNode?.getComponent(UITransform)?.setContentSize(visible);
    this.graphics?.node.getComponent(UITransform)?.setContentSize(visible);
    this.effectsGraphics?.node.getComponent(UITransform)?.setContentSize(visible);
    this.natureTextureRoot?.getComponent(UITransform)?.setContentSize(visible);
    for (const texturedBlock of this.natureTextureBlocks) {
      texturedBlock.node.getComponent(UITransform)?.setContentSize(visible);
      texturedBlock.left.maskNode.getComponent(UITransform)?.setContentSize(visible);
      texturedBlock.right.maskNode.getComponent(UITransform)?.setContentSize(visible);
      texturedBlock.top.maskNode.getComponent(UITransform)?.setContentSize(visible);
    }
    const towerWidth = Math.min(405, this.visibleWidth * 0.54);
    this.homeTowerPreviewNode?.getComponent(UITransform)?.setContentSize(towerWidth, towerWidth * 768 / 734);
    this.homeTowerPreviewNode?.setPosition(0, -this.visibleHeight * 0.215, 0);
    this.hudSafeRoot?.getComponent(UITransform)?.setContentSize(visible);
    this.hudSafeRoot?.getComponent(SafeArea)?.updateArea();

    const isShortPortrait = frame.width <= frame.height && this.visibleWidth / this.visibleHeight >= 0.54;
    this.controlsLabel.node.active = !isShortPortrait;
    this.precisionTipLabel.fontSize = isShortPortrait ? 28 : 22;
    this.precisionTipLabel.lineHeight = isShortPortrait ? 34 : 26;
    const muted = this.currentSkin().mutedColor;
    this.precisionTipLabel.color = this.rgb(muted, isShortPortrait ? 225 : 176);
    this.applyThemeToUI();
    if (this.phase === 'paused') {
      this.drawFrame();
    }
  }

  private animatePrompt(): void {
    if (!this.startGroup.active) {
      return;
    }
    const prompt = this.startGroup.getChildByName('StartPrompt');
    if (!prompt) {
      return;
    }
    const pulse = this.reducedMotion ? 1 : 1 + Math.sin(this.promptTime * 2.8) * 0.025;
    prompt.setScale(pulse, pulse, 1);
  }

  private loadSettings(): void {
    try {
      const storedBest = Number.parseInt(sys.localStorage.getItem(BEST_SCORE_STORAGE_KEY) || '0', 10);
      const storedCoins = Number.parseInt(
        sys.localStorage.getItem(COIN_STORAGE_KEY) ?? `${INITIAL_COINS}`,
        10,
      );
      this.bestScore = Number.isFinite(storedBest) ? Math.max(0, storedBest) : 0;
      this.coins = Number.isFinite(storedCoins) ? Math.max(0, storedCoins) : INITIAL_COINS;
      if (sys.localStorage.getItem(INITIAL_COIN_GRANT_STORAGE_KEY) !== '1') {
        this.coins = Math.max(INITIAL_COINS, this.coins);
        sys.localStorage.setItem(COIN_STORAGE_KEY, `${this.coins}`);
        sys.localStorage.setItem(INITIAL_COIN_GRANT_STORAGE_KEY, '1');
      }

      this.ownedSkins = new Set<SkinId>(['classic']);
      const ownedRaw = sys.localStorage.getItem(OWNED_SKINS_STORAGE_KEY);
      if (ownedRaw) {
        const owned = JSON.parse(ownedRaw) as unknown;
        if (Array.isArray(owned)) {
          for (const skinId of owned) {
            if (skinId === 'sunset') {
              this.ownedSkins.add('cyber-neon');
            } else if (typeof skinId === 'string' && (SKIN_IDS as readonly string[]).includes(skinId)) {
              this.ownedSkins.add(skinId as SkinId);
            }
          }
        }
      }
      const selected = sys.localStorage.getItem(SELECTED_SKIN_STORAGE_KEY);
      const migratedSelected = selected === 'sunset' ? 'cyber-neon' : selected;
      this.selectedSkinId = typeof migratedSelected === 'string'
        && (SKIN_IDS as readonly string[]).includes(migratedSelected)
        && this.ownedSkins.has(migratedSelected as SkinId)
        ? migratedSelected as SkinId
        : 'classic';
      this.soundEnabled = sys.localStorage.getItem(SOUND_STORAGE_KEY) !== '0';

      const prefersReducedMotion = sys.isBrowser
        && typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const storedMotion = sys.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
      this.reducedMotion = storedMotion === null ? prefersReducedMotion : storedMotion === '1';
    } catch {
      this.bestScore = 0;
      this.coins = INITIAL_COINS;
      this.ownedSkins = new Set<SkinId>(['classic']);
      this.selectedSkinId = 'classic';
      this.soundEnabled = true;
      this.reducedMotion = false;
    }
  }

  private saveBestScore(): void {
    try {
      sys.localStorage.setItem(BEST_SCORE_STORAGE_KEY, `${this.bestScore}`);
    } catch {
      // Private browsing and some mini-game runtimes can reject storage writes.
    }
  }

  private saveEconomy(): void {
    try {
      sys.localStorage.setItem(COIN_STORAGE_KEY, `${this.coins}`);
      sys.localStorage.setItem(OWNED_SKINS_STORAGE_KEY, JSON.stringify(Array.from(this.ownedSkins)));
      sys.localStorage.setItem(SELECTED_SKIN_STORAGE_KEY, this.selectedSkinId);
    } catch {
      // Keep the current session playable when persistent storage is unavailable.
    }
  }

  private saveUserSettings(): void {
    try {
      sys.localStorage.setItem(SOUND_STORAGE_KEY, this.soundEnabled ? '1' : '0');
      sys.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, this.reducedMotion ? '1' : '0');
    } catch {
      // Settings remain active for the current session.
    }
  }

  private updateBestLabel(): void {
    this.bestLabel.string = `${COPY.best}\n${this.bestScore}`;
  }

  private updateCoinLabels(): void {
    if (this.homeCoinLabel?.isValid) {
      this.homeCoinLabel.string = `${COPY.coins}  ${this.coins}`;
    }
    if (this.skinsCoinLabel?.isValid) {
      this.skinsCoinLabel.string = `${COPY.coins}  ${this.coins}`;
    }
  }

  private currentSkin(): SkinDefinition {
    return SKINS[this.selectedSkinId];
  }

  private loadThemeBackgrounds(): void {
    for (const skinId of SKIN_IDS) {
      resources.load(`skins/${skinId}/spriteFrame`, SpriteFrame, (error, frame) => {
        if (error || !frame) {
          return;
        }
        this.skinBackgrounds.set(skinId, frame);
        const card = this.skinCards.get(skinId);
        if (card?.previewSprite.isValid) {
          card.previewSprite.spriteFrame = frame;
        }
        if (this.selectedSkinId === skinId) {
          this.applyThemeBackground();
          this.drawFrame();
        }
      });
    }
  }

  private loadNatureVisualAssets(): void {
    resources.load('skins/nature-zen-tower/spriteFrame', SpriteFrame, (error, frame) => {
      if (error || !frame) {
        return;
      }
      this.homeTowerPreviewSprite.spriteFrame = frame;
      this.drawFrame();
    });

    const materials: readonly NatureMaterialId[] = ['light-wood', 'green-stone', 'walnut'];
    for (const material of materials) {
      resources.load(
        `skins/nature-zen-materials/${material}/spriteFrame`,
        SpriteFrame,
        (error, frame) => {
          if (error || !frame) {
            return;
          }
          this.natureMaterialFrames.set(material, frame);
          if (this.selectedSkinId === 'nature-zen') {
            this.applyWorld3DTheme();
          }
          this.drawFrame();
        },
      );
    }
  }

  private applyThemeBackground(): void {
    if (!this.backgroundSprite?.isValid) {
      return;
    }
    this.backgroundSprite.spriteFrame = this.skinBackgrounds.get(this.selectedSkinId) ?? null;
    this.applyWorld3DTheme();
  }

  private applyWorld3DTheme(): void {
    if (!this.world3D) {
      return;
    }
    const skin = this.currentSkin();
    const blockColors = Array.from({ length: 12 }, (_, level) => (
      this.blockColorsForSkin(skin, level, 255, this.hueForLevel(level)).top
    ));
    const materialTextures = skin.visualStyle === 'nature'
      ? [
        this.natureMaterialFrames.get('green-stone'),
        this.natureMaterialFrames.get('light-wood'),
        this.natureMaterialFrames.get('walnut'),
        this.natureMaterialFrames.get('green-stone'),
        this.natureMaterialFrames.get('light-wood'),
      ].filter((frame): frame is SpriteFrame => !!frame)
      : [];
    const theme: StackWorldTheme = {
      background: this.skinBackgrounds.get(this.selectedSkinId) ?? null,
      blockColors,
      materialTextures,
      accentColor: this.rgb(skin.accentColor),
      roughness: skin.visualStyle === 'cyber' ? 0.3 : skin.visualStyle === 'porcelain' ? 0.4 : 0.68,
      metallic: skin.visualStyle === 'cyber' ? 0.34 : skin.visualStyle === 'porcelain' ? 0.12 : 0.03,
    };
    this.world3D.setTheme(theme);
  }

  private refreshVisibleSkin(): void {
    for (const block of this.stack) {
      block.hue = this.hueForLevel(block.level);
    }
    if (this.current) {
      this.current.hue = this.hueForLevel(this.current.level);
    }
    for (const piece of this.fallingPieces) {
      piece.hue = this.hueForLevel(piece.level);
    }
    this.applyThemeBackground();
    this.applyThemeToUI();
    this.drawFrame();
  }

  private hueForLevel(level: number): number {
    const skin = this.currentSkin();
    return (skin.blockHue + level * skin.blockHueStep) % 360;
  }

  private blockColorsForSkin(
    skin: SkinDefinition,
    level: number,
    opacity: number,
    hueOverride?: number,
  ): { top: Color; left: Color; right: Color; outline: Color } {
    const paletteColor = skin.blockPalette?.[Math.abs(level) % skin.blockPalette.length];
    const top = paletteColor
      ? this.rgb(paletteColor, opacity)
      : this.hslToColor(
        hueOverride ?? skin.blockHue + level * skin.blockHueStep,
        skin.blockSaturation,
        skin.blockLightness,
        opacity,
      );

    if (skin.visualStyle === 'porcelain') {
      return {
        top,
        left: new Color(43, 88, 145, Math.round(opacity)),
        right: new Color(24, 57, 108, Math.round(opacity)),
        outline: this.rgb(skin.accentColor, Math.round(opacity * 0.92)),
      };
    }
    if (skin.visualStyle === 'cyber') {
      return {
        top,
        left: this.shade(top, 0.48, opacity),
        right: this.shade(top, 0.3, opacity),
        outline: this.rgb(skin.accentColor, Math.round(opacity * 0.88)),
      };
    }
    if (skin.visualStyle === 'pastel') {
      return {
        top,
        left: this.shade(top, 0.82, opacity),
        right: this.shade(top, 0.7, opacity),
        outline: new Color(255, 255, 255, Math.round(opacity * 0.5)),
      };
    }
    if (skin.visualStyle === 'nature') {
      return {
        top,
        left: this.shade(top, 0.64, opacity),
        right: this.shade(top, 0.48, opacity),
        outline: this.rgb(skin.accentColor, Math.round(opacity * 0.68)),
      };
    }
    return {
      top,
      left: this.shade(top, 0.74, opacity),
      right: this.shade(top, 0.58, opacity),
      outline: new Color(255, 255, 255, Math.round(opacity * 0.28)),
    };
  }

  private applyThemeToUI(): void {
    if (!this.startGroup?.isValid) {
      return;
    }
    const skin = this.currentSkin();
    const title = this.rgb(skin.titleColor);
    const text = this.rgb(skin.textColor);
    const muted = this.rgb(skin.mutedColor);
    const panelText = this.textOnButton(skin.panelColor);

    this.setNamedLabelColor(this.startGroup, 'Title', title);
    this.setNamedLabelColor(this.startGroup, 'Subtitle', this.rgb(skin.titleColor, 228));
    this.startPromptLabel.color = this.textOnButton(skin.buttonColor);
    this.controlsLabel.color = this.rgb(skin.mutedColor, 190);
    this.precisionTipLabel.color = this.rgb(skin.mutedColor, 176);
    this.homeCoinLabel.color = text;
    this.bestLabel.color = this.rgb(skin.textColor, 220);
    this.scoreLabel.color = this.rgb(skin.textColor, 245);
    this.testModeBadgeLabel.color = text;
    this.perfectLabel.color = this.rgb(skin.accentColor);

    this.resultTitleLabel.color = panelText;
    this.resultScoreLabel.color = panelText;
    this.resultBestLabel.color = new Color(panelText.r, panelText.g, panelText.b, 220);
    this.resultCoinLabel.color = this.rgb(skin.accentColor, 245);
    this.setNamedLabelColor(this.resultGroup, 'Restart', new Color(panelText.r, panelText.g, panelText.b, 235));

    this.pauseButtonLabel.color = text;
    this.setNamedLabelColor(this.pauseGroup, 'PauseTitle', panelText);
    this.setNamedLabelColor(this.pauseGroup, 'PauseHint', new Color(panelText.r, panelText.g, panelText.b, 178));
    this.setNamedLabelColor(this.pauseGroup, 'PauseControls', new Color(panelText.r, panelText.g, panelText.b, 158));

    this.setNamedLabelColor(this.settingsGroup, 'SettingsTitle', panelText);
    this.setNamedLabelColor(this.settingsGroup, 'SettingsHint', new Color(panelText.r, panelText.g, panelText.b, 170));
    this.setNamedLabelColor(this.skinsGroup, 'SkinsTitle', panelText);
    this.skinsCoinLabel.color = this.rgb(skin.accentColor);
    this.skinsHintLabel.color = new Color(panelText.r, panelText.g, panelText.b, 176);

    this.drawHomeButton(this.settingsButtonGraphics, this.settingsButtonLabel, 138, 60);
    this.drawHomeButton(this.skinsButtonGraphics, this.skinsButtonLabel, 138, 60);
    this.updateTestModeUI();
    this.updatePauseMenuFocus();
    this.updateSettingsUI();
    this.updateSkinShopUI();
  }

  private setNamedLabelColor(parent: Node, childName: string, color: Color): void {
    const label = parent.getChildByName(childName)?.getComponent(Label);
    if (label) {
      label.color = color;
    }
  }

  private rgb(value: RGB, alpha = 255): Color {
    return new Color(value[0], value[1], value[2], Math.round(alpha));
  }

  private textOnButton(background: RGB): Color {
    const luminance = background[0] * 0.299 + background[1] * 0.587 + background[2] * 0.114;
    return luminance > 158 ? this.rgb(this.currentSkin().panelColor) : new Color(255, 255, 255, 255);
  }

  private midpoint(a: Point2, b: Point2): Point2 {
    return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
  }

  private quadCenter(a: Point2, b: Point2, c: Point2, d: Point2): Point2 {
    return { x: (a.x + b.x + c.x + d.x) * 0.25, y: (a.y + b.y + c.y + d.y) * 0.25 };
  }

  private lerpPoint(a: Point2, b: Point2, t: number): Point2 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  private hslToColor(hue: number, saturation: number, lightness: number, alpha = 255): Color {
    const h = ((hue % 360) + 360) % 360 / 360;
    const s = Math.max(0, Math.min(1, saturation / 100));
    const l = Math.max(0, Math.min(1, lightness / 100));
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const channel = (offset: number): number => {
      let t = h + offset;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    if (s === 0) {
      const gray = Math.round(l * 255);
      return new Color(gray, gray, gray, Math.round(alpha));
    }
    return new Color(
      Math.round(channel(1 / 3) * 255),
      Math.round(channel(0) * 255),
      Math.round(channel(-1 / 3) * 255),
      Math.round(alpha),
    );
  }

  private shade(color: Color, factor: number, alpha = color.a): Color {
    return new Color(
      Math.round(color.r * factor),
      Math.round(color.g * factor),
      Math.round(color.b * factor),
      Math.round(alpha),
    );
  }

  private makeNode(name: string, parent: Node): Node {
    const node = new Node(name);
    node.parent = parent;
    node.layer = parent.layer;
    return node;
  }

  private makeFullNode(name: string, parent: Node): Node {
    const node = this.makeNode(name, parent);
    node.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    const widget = node.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.top = 0;
    widget.bottom = 0;
    widget.left = 0;
    widget.right = 0;
    return node;
  }

  private makeLabel(
    name: string,
    parent: Node,
    text: string,
    fontSize: number,
    color: Color,
    width: number,
    height: number,
  ): Label {
    const node = this.makeNode(name, parent);
    node.addComponent(UITransform).setContentSize(width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.2);
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    return label;
  }

  private makeCenteredLabel(
    name: string,
    parent: Node,
    text: string,
    fontSize: number,
    verticalCenter: number,
    width: number,
    height: number,
    color: Color,
  ): Label {
    const label = this.makeLabel(name, parent, text, fontSize, color, width, height);
    this.anchorCenter(label.node, 0, verticalCenter);
    return label;
  }

  private anchorTopCenter(node: Node, top: number): void {
    const widget = node.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignHorizontalCenter = true;
    widget.top = top;
    widget.horizontalCenter = 0;
  }

  private anchorTopRight(node: Node, top: number, right: number): void {
    const widget = node.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignRight = true;
    widget.top = top;
    widget.right = right;
  }

  private anchorTopLeft(node: Node, top: number, left: number): void {
    const widget = node.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignLeft = true;
    widget.top = top;
    widget.left = left;
  }

  private anchorCenter(node: Node, horizontalCenter: number, verticalCenter: number): void {
    const widget = node.addComponent(Widget);
    widget.isAlignHorizontalCenter = true;
    widget.isAlignVerticalCenter = true;
    widget.horizontalCenter = horizontalCenter;
    widget.verticalCenter = verticalCenter;
  }
}
