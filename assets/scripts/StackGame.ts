import {
  _decorator,
  AudioClip,
  AudioSource,
  BlockInputEvents,
  Button,
  Color,
  Component,
  director,
  Director,
  EditBox,
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
  ScrollView,
  screen,
  Sprite,
  SpriteFrame,
  sys,
  tween,
  Tween,
  UITransform,
  UIOpacity,
  Vec2,
  Vec3,
  view,
  Widget,
} from 'cc';
import { StackWorld3D, StackWorldTheme } from './StackWorld3D';
import { androidGameKey, browserGameKey } from './RemoteInput';
import {
  DEFAULT_NICKNAME, LeaderboardEntry, LeaderboardRepository, LocalLeaderboardRepository,
  NICKNAME_MAX_LENGTH, leaderboardTitle, leaderboardTier, loadNickname, normalizeNickname, saveNickname,
} from './Leaderboard';
import { projectorHudLayout, projectorLeaderboardPreviewLayout, projectorPanelLayout } from './ProjectorLayout';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const BASE_SIZE = 5;
const BLOCK_HEIGHT = 44;
const BLOCK_3D_HEIGHT = 0.62;
const MOVE_RANGE = 6.1;
const INITIAL_MOVE_SPEED = 3.8;
const MOVE_SPEED_PER_SCORE = 0.08;
const MOVE_SPEED_WARMUP_SCORE = 5;
const MAX_MOVE_SPEED = 6.8;
const PERFECT_THRESHOLD = 0.14;
const PERFECT_GROWTH_START_STREAK = 2;
const PERFECT_GROWTH_STEP = 0.12;
const PERFECT_GROWTH_MAX_SIZE = BASE_SIZE;
const CUT_PREVIEW_SECONDS = 0.24;
const GAME_OVER_REVEAL_SECONDS = 0.42;
const REDUCED_MOTION_GAME_OVER_REVEAL_SECONDS = 0.12;
const HOME_FADE_OUT_SECONDS = 0.1;
const HOME_FADE_IN_SECONDS = 0.16;
const MENU_SLIDE_DISTANCE = 24;
const MENU_DIMMER_MAX_ALPHA = 51;
type ScreenTransitionKind = 'menu-open' | 'menu-close' | 'leaderboard-open' | 'leaderboard-close' | 'game-start' | 'home-return';
const WIDE_LAYOUT_MIN_ASPECT = 1.35;
const WIDE_LAYOUT_MIN_FRAME_WIDTH = 1024;
const TV_LAYOUT_MIN_ASPECT = 1.45;
const TV_LAYOUT_MIN_FRAME_WIDTH = 1280;
const COMPACT_PORTRAIT_MAX_FRAME_WIDTH = 480;
const WIDE_FOCUS_WIDTH = 1600;
const WIDE_PANEL_CENTER_X = -430;
const WIDE_WORLD_COMPOSITION_X = -3.4;
const TV_UI_SCALE = 1.12;
const TV_OVERSCAN_INSET = 64;
const HOME_MENU_BUTTON_WIDTH = 356;
const HOME_MENU_BUTTON_HEIGHT = 88;
const HOME_MENU_START_Y = 0;
const HOME_MENU_LEADERBOARD_Y = -122;
const HOME_MENU_SETTINGS_Y = -244;
const HOME_PANEL_WIDTH = 610;
const HOME_PANEL_HEIGHT = 960;
const SKIN_CARD_WIDTH = 520;
const SKIN_CARD_HEIGHT = 112;
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
const REMOTE_CONFIRM_KEY_CODES = new Set([23]);
const REMOTE_BACK_KEY_CODES = new Set([4, 461, 10009]);

const COPY = {
  eyebrow: '轻松堆叠 · 挑战新高',
  title: '叠个正着',
  subtitle: '让每一次落点都恰到好处',
  start: '开始游戏',
  startRemote: '开始游戏',
  loadingAudio: '正在准备音效…',
  controls: '点击 / 空格释放方块 · P / Esc 暂停 · K 排行榜 · T 测试',
  controlsWide: '方向键选择 · 确认键操作 · 返回键暂停 / 返回',
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
  leaderboard: '排行榜',
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
  restart: '方向键选择 · 确认键确定 · 返回键回首页',
  newBest: '新纪录',
};

type GamePhase = 'ready' | 'playing' | 'dropping' | 'paused' | 'falling' | 'gameover';
type MoveAxis = 'x' | 'z';
const SKIN_IDS = ['minimal-stack', 'classic', 'cyber-neon', 'porcelain-moon', 'pastel-toy', 'nature-zen'] as const;
type SkinId = typeof SKIN_IDS[number];
const DEFAULT_SKIN_ID: SkinId = 'minimal-stack';
const FREE_SKIN_IDS: readonly SkinId[] = [DEFAULT_SKIN_ID, 'classic'];
type SkinVisualStyle = 'minimal' | 'breeze' | 'cyber' | 'porcelain' | 'pastel' | 'nature';
type RGB = readonly [number, number, number];
type HomeOverlay = 'none' | 'settings' | 'skins' | 'leaderboard';
type NatureMaterialId = 'light-wood' | 'green-stone' | 'walnut';

interface SkinDefinition {
  id: SkinId;
  visualStyle: SkinVisualStyle;
  name: string;
  description: string;
  blockAtlasResource: string;
  backgroundResource?: string;
  blockAtlasOrder: readonly number[];
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
  'minimal-stack': {
    id: 'minimal-stack',
    visualStyle: 'minimal',
    name: '奶油积木',
    description: '初始免费 · 粉彩积木与奶油玩具台',
    blockAtlasResource: 'minimal-neutral-v2',
    backgroundResource: 'minimal-background-v2',
    blockAtlasOrder: [0],
    price: 0,
    backgroundHue: 12,
    backgroundSaturation: 24,
    backgroundLightness: 78,
    blockHue: 166,
    blockHueStep: 5,
    blockSaturation: 48,
    blockLightness: 76,
    blockPalette: [[188, 235, 217], [145, 220, 204], [128, 200, 207], [145, 220, 204]],
    shadow: [133, 104, 106],
    titleColor: [83, 67, 78],
    textColor: [83, 67, 78],
    mutedColor: [105, 86, 94],
    accentColor: [174, 207, 197],
    secondaryAccentColor: [201, 187, 214],
    panelColor: [255, 248, 231],
    buttonColor: [234, 215, 218],
  },
  classic: {
    id: 'classic',
    visualStyle: 'breeze',
    name: '清风原野',
    description: '清透树脂与轻盈叶纹',
    blockAtlasResource: 'breeze-blocks-v2',
    blockAtlasOrder: [0, 1, 2, 0, 1],
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
    description: '霓虹电路与金属光轨',
    blockAtlasResource: 'cyber-blocks-v2',
    blockAtlasOrder: [1, 0, 2, 1, 0],
    price: 100,
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
    blockAtlasResource: 'porcelain-blocks-v2',
    blockAtlasOrder: [2, 0, 1, 2, 0],
    price: 200,
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
    description: '奶油糖果色与星星压纹',
    blockAtlasResource: 'pastel-blocks-v2',
    blockAtlasOrder: [2, 1, 0, 2, 1],
    price: 200,
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
    blockAtlasResource: 'zen-blocks-v2',
    blockAtlasOrder: [1, 0, 2, 1, 0],
    price: 300,
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
  worldX: number;
  worldZ: number;
  level: number;
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
  private blockAtlases = new Map<SkinId, SpriteFrame>();
  private homeTowerPreviewNode!: Node;
  private homeTowerPreviewSprite!: Sprite;
  private audioSource!: AudioSource;
  private audioClips = new Map<string, AudioClip>();
  private hudSafeRoot!: Node;
  private gameplayHudGroup!: Node;
  private scoreHudCard!: Node;
  private scoreHudGraphics!: Graphics;
  private bestHudCard!: Node;
  private bestHudGraphics!: Graphics;
  private scoreCaptionLabel!: Label;
  private bestCaptionLabel!: Label;
  private scoreLabel!: Label;
  private bestLabel!: Label;
  private recordGapNode!: Node;
  private recordGapGraphics!: Graphics;
  private recordGapLabel!: Label;
  private homeBestLabel!: Label;
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
  private resultGroup!: Node;
  private resultRestartButton!: ButtonUI;
  private resultHomeButton!: ButtonUI;
  private resultSelection = 0;
  private homeSelection = 0;
  private startButton!: Node;
  private startButtonGraphics!: Graphics;
  private homeBestCaption!: Label;
  private homeCoinCaption!: Label;
  private homeTransition: {
    kind: ScreenTransitionKind;
    elapsed: number; swapped: boolean; swap: () => void;
    outSeconds: number; inSeconds: number; pauseOnComplete: boolean;
    direction: number; fadeWorld: boolean; fromDim: number; toDim: number;
  } | null = null;
  private transitionViews: {
    node: Node; position: Vec3; widget: Widget | null; widgetEnabled: boolean;
    opacity: UIOpacity; baseOpacity: number; slide: boolean;
  }[] = [];
  private transitionBlocker!: Node;
  private screenDimmer!: Graphics;
  private homePanelGraphics!: Graphics;
  private pausePanelGraphics!: Graphics;
  private resultPanelGraphics!: Graphics;
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
  private homeBestBadge!: Node;
  private settingsButton!: Node;
  private settingsButtonGraphics!: Graphics;
  private settingsButtonLabel!: Label;
  private leaderboardButton!: Node;
  private leaderboardButtonGraphics!: Graphics;
  private leaderboardButtonLabel!: Label;
  private homeLeaderboardPreview!: Node;
  private homeLeaderboardPreviewGraphics!: Graphics;
  private homeLeaderboardPreviewTitle!: Label;
  private homeLeaderboardPreviewHint!: Label;
  private homeLeaderboardPreviewEmpty!: Label;
  private homeLeaderboardPreviewRows: Label[] = [];
  private homeLeaderboardPreviewDetails: Label[] = [];
  private homeLeaderboardPreviewRanks: Label[] = [];
  private homeLeaderboardPreviewTitles: Label[] = [];
  private homeLeaderboardPreviewSubtitle: Label;
  private homeLeaderboardPreviewEntries: LeaderboardEntry[] = [];
  private homeLeaderboardPreviewRequest = 0;
  private settingsGroup!: Node;
  private settingsGraphics!: Graphics;
  private soundToggle!: ButtonUI;
  private motionToggle!: ButtonUI;
  private settingsCloseButton!: ButtonUI;
  private nicknameButton!: ButtonUI;
  private nicknameLabel!: Label;
  private nicknameGroup!: Node;
  private nicknameGraphics!: Graphics;
  private nicknameEditor!: EditBox;
  private nicknameInputGraphics!: Graphics;
  private nicknameHint!: Label;
  private nicknameSaveButton!: ButtonUI;
  private nicknameCancelButton!: ButtonUI;
  private nicknameEditing = false;
  private nicknameInputActive = false;
  private nicknameSelection = 0;
  private playerNickname = DEFAULT_NICKNAME;
  private roundNickname = DEFAULT_NICKNAME;
  private nicknameStatus = '';
  private skinsGroup!: Node;
  private skinsGraphics!: Graphics;
  private skinsCoinLabel!: Label;
  private skinsHintLabel!: Label;
  private skinCards = new Map<SkinId, SkinCardUI>();
  private skinCardHandlers = new Map<SkinId, () => void>();
  private skinsCloseButton!: ButtonUI;
  private resultCoinLabel!: Label;
  private leaderboard!: LeaderboardRepository;
  private leaderboardGroup!: Node;
  private leaderboardGraphics!: Graphics;
  private leaderboardStatus!: Label;
  private leaderboardEmpty!: Label;
  private leaderboardPageLabel!: Label;
  private leaderboardRows: { node: Node; graphics: Graphics; rank: Label; player: Label; score: Label; title: Label; detail: Label }[] = [];
  private leaderboardScroll!: ScrollView;
  private leaderboardViewport!: Node;
  private leaderboardContent!: Node;
  private leaderboardScrollTrack!: Graphics;
  private leaderboardScrollTarget = 0;
  private leaderboardButtons: ButtonUI[] = [];
  private leaderboardHandlers: (() => void)[] = [];
  private leaderboardEntries: LeaderboardEntry[] = [];
  private leaderboardRequest = 0;
  private leaderboardLoading = false;
  private roundId = '';
  private submittedRoundId = '';
  private roundWasTest = false;
  private leaderboardSaveFailed = false;
  private leaderboardSubmission: Promise<unknown> | null = null;

  private phase: GamePhase = 'ready';
  private stack: StackBlock[] = [];
  private current: StackBlock | null = null;
  private fallingPieces: FallingPiece[] = [];
  private sparks: Spark[] = [];
  private rings: ImpactRing[] = [];
  private perfectFrames: PerfectFrame[] = [];

  private score = 0;
  private bestScore = 0;
  private roundBestScore = 0;
  private perfectStreak = 0;
  private perfectToneStep = 0;
  private roundPerfectCount = 0;
  private lastEarnedCoins = 0;
  private coins = INITIAL_COINS;
  private ownedSkins = new Set<SkinId>(FREE_SKIN_IDS);
  private selectedSkinId: SkinId = DEFAULT_SKIN_ID;
  private soundEnabled = true;
  private testModeEnabled = false;
  private moveAxis: MoveAxis = 'x';
  private moveDirection = 1;
  private moveSpeed = INITIAL_MOVE_SPEED;
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
  private wideLayout = false;
  private tvLayout = false;
  private compactPortrait = false;
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
  private heldKeys = new Set<number>();
  private gamepadSouthHeld = false;
  private gamepadOptionsHeld = false;
  private gamepadNorthHeld = false;
  private gamepadEastHeld = false;
  private gamepadWestHeld = false;
  private gamepadMenuAxisHeld = false;
  private reducedMotion = false;
  private audioReady = false;
  private browserReadyNotified = false;
  private readonly focusGameCanvas = (): void => {
    if (this.nicknameInputActive) return;
    const canvas = document.getElementById('GameCanvas');
    if (canvas && !document.hidden) {
      canvas.setAttribute('tabindex', '0');
      canvas.focus();
    }
  };
  private readonly clearBrowserKeys = (): void => { this.heldKeys.clear(); };
  private readonly onAndroidRemoteKey = (code: number, action = 0, repeat = 0): boolean => {
    const normalized = androidGameKey(code);
    if (!normalized || (action !== 0 && action !== 1)) return false;
    if (action === 1) this.heldKeys.delete(normalized);
    else if (!repeat) {
      this.heldKeys.delete(normalized);
      // A host-forwarded remote key never reaches the native text input.
      if (this.nicknameEditing && this.nicknameInputActive && normalized === KeyCode.ENTER) this.onNicknameInputReturn();
      else if (this.nicknameEditing && this.nicknameInputActive
          && [KeyCode.ARROW_UP, KeyCode.ARROW_DOWN, KeyCode.ARROW_LEFT, KeyCode.ARROW_RIGHT].indexOf(normalized) >= 0) {
        this.moveNicknameSelection(normalized === KeyCode.ARROW_UP || normalized === KeyCode.ARROW_LEFT ? -1 : 1);
      } else this.handleKeyDownCode(normalized);
    }
    return true;
  };
  private readonly onBrowserRemoteKeyDown = (event: KeyboardEvent): void => {
    if (this.nicknameEditing) {
      if (event.isComposing || event.keyCode === 229) {
        // Let the IME commit text, but keep Cocos's Enter listener from ending composition.
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === 'Escape') this.closeNicknameEditor();
        else this.moveNicknameSelection(event.shiftKey ? -1 : 1);
        return;
      }
      if (this.nicknameInputActive) return;
    }
    const keyCode = browserGameKey(event, /Android/i.test(navigator.userAgent));
    if (!keyCode || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    // Some WebViews omit keyup when focus changes. A fresh down is a new press.
    this.heldKeys.delete(keyCode);
    this.handleKeyDownCode(keyCode);
  };
  private readonly onBrowserRemoteKeyUp = (event: KeyboardEvent): void => {
    const keyCode = browserGameKey(event, /Android/i.test(navigator.userAgent));
    if (this.nicknameEditing) {
      if (keyCode) this.heldKeys.delete(keyCode);
      return;
    }
    if (keyCode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.heldKeys.delete(keyCode);
    }
  };

  onLoad(): void {
    profiler.hideStats();
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_HEIGHT);
    this.initializeAudio();
    this.loadSettings();
    this.leaderboard = new LocalLeaderboardRepository(sys.localStorage, this.bestScore);
    this.buildStage();
    this.resizeStage();
    this.showReadyScreen();
  }

  onEnable(): void {
    this.graphics.node.on(Node.EventType.TOUCH_END, this.onPointerAction, this);
    this.startButton.on(Button.EventType.CLICK, this.tryPrimaryAction, this);
    this.testModeToggle.on(Button.EventType.CLICK, this.onTestModeToggle, this);
    this.pauseButton.on(Button.EventType.CLICK, this.onPauseButton, this);
    this.resumeButton.on(Button.EventType.CLICK, this.onResumeButton, this);
    this.restartButton.on(Button.EventType.CLICK, this.onRestartButton, this);
    this.homeButton.on(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultHomeButton.node.on(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultRestartButton.node.on(Button.EventType.CLICK, this.tryRestartAction, this);
    this.settingsButton.on(Button.EventType.CLICK, this.onSettingsButton, this);
    this.leaderboardButton.on(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.homeLeaderboardPreview.on(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.soundToggle.node.on(Button.EventType.CLICK, this.onSoundToggle, this);
    this.motionToggle.node.on(Button.EventType.CLICK, this.onMotionToggle, this);
    this.settingsCloseButton.node.on(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    this.nicknameButton.node.on(Button.EventType.CLICK, this.openNicknameEditor, this);
    this.nicknameSaveButton.node.on(Button.EventType.CLICK, this.saveNicknameEditor, this);
    this.nicknameCancelButton.node.on(Button.EventType.CLICK, this.closeNicknameEditor, this);
    this.nicknameEditor.node.on(EditBox.EventType.EDITING_DID_BEGAN, this.onNicknameInputBegan, this);
    this.nicknameEditor.node.on(EditBox.EventType.EDITING_DID_ENDED, this.onNicknameInputEnded, this);
    this.nicknameEditor.node.on(EditBox.EventType.EDITING_RETURN, this.onNicknameInputReturn, this);
    for (const skinId of SKIN_IDS) {
      const card = this.skinCards.get(skinId);
      const handler = this.skinCardHandlers.get(skinId);
      if (card && handler) {
        card.node.on(Button.EventType.CLICK, handler, this);
      }
    }
    this.skinsCloseButton.node.on(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    this.leaderboardButtons.forEach((button, index) => {
      button.node.on(Button.EventType.CLICK, this.leaderboardHandlers[index], this);
    });
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.on(Input.EventType.GAMEPAD_INPUT, this.onGamepadInput, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    view.on('canvas-resize', this.onCanvasResize, this);
    view.on('design-resolution-changed', this.onCanvasResize, this);
    if (sys.isBrowser && typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onBrowserRemoteKeyDown, true);
      window.addEventListener('keyup', this.onBrowserRemoteKeyUp, true);
      window.addEventListener('focus', this.focusGameCanvas);
      window.addEventListener('blur', this.clearBrowserKeys);
      document.addEventListener('visibilitychange', this.clearBrowserKeys);
      document.addEventListener('visibilitychange', this.focusGameCanvas);
      (window as any).WxStackRemote = { dispatchKey: this.onAndroidRemoteKey, isTextEditing: () => this.nicknameInputActive };
      this.focusGameCanvas();
    }
  }

  onDisable(): void {
    this.graphics.node.off(Node.EventType.TOUCH_END, this.onPointerAction, this);
    this.startButton.off(Button.EventType.CLICK, this.tryPrimaryAction, this);
    this.testModeToggle.off(Button.EventType.CLICK, this.onTestModeToggle, this);
    this.pauseButton.off(Button.EventType.CLICK, this.onPauseButton, this);
    this.resumeButton.off(Button.EventType.CLICK, this.onResumeButton, this);
    this.restartButton.off(Button.EventType.CLICK, this.onRestartButton, this);
    this.homeButton.off(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultHomeButton.node.off(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultRestartButton.node.off(Button.EventType.CLICK, this.tryRestartAction, this);
    this.settingsButton.off(Button.EventType.CLICK, this.onSettingsButton, this);
    this.leaderboardButton.off(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.homeLeaderboardPreview.off(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.homeLeaderboardPreviewRequest += 1;
    this.soundToggle.node.off(Button.EventType.CLICK, this.onSoundToggle, this);
    this.motionToggle.node.off(Button.EventType.CLICK, this.onMotionToggle, this);
    this.settingsCloseButton.node.off(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    this.nicknameButton.node.off(Button.EventType.CLICK, this.openNicknameEditor, this);
    this.nicknameSaveButton.node.off(Button.EventType.CLICK, this.saveNicknameEditor, this);
    this.nicknameCancelButton.node.off(Button.EventType.CLICK, this.closeNicknameEditor, this);
    this.nicknameEditor.node.off(EditBox.EventType.EDITING_DID_BEGAN, this.onNicknameInputBegan, this);
    this.nicknameEditor.node.off(EditBox.EventType.EDITING_DID_ENDED, this.onNicknameInputEnded, this);
    this.nicknameEditor.node.off(EditBox.EventType.EDITING_RETURN, this.onNicknameInputReturn, this);
    this.nicknameEditor.blur();
    this.nicknameInputActive = false;
    for (const skinId of SKIN_IDS) {
      const card = this.skinCards.get(skinId);
      const handler = this.skinCardHandlers.get(skinId);
      if (card && handler) {
        card.node.off(Button.EventType.CLICK, handler, this);
      }
    }
    this.skinsCloseButton.node.off(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    this.leaderboardRequest += 1;
    this.leaderboardButtons.forEach((button, index) => {
      button.node.off(Button.EventType.CLICK, this.leaderboardHandlers[index], this);
    });
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.off(Input.EventType.GAMEPAD_INPUT, this.onGamepadInput, this);
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    view.off('canvas-resize', this.onCanvasResize, this);
    view.off('design-resolution-changed', this.onCanvasResize, this);
    if (sys.isBrowser && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onBrowserRemoteKeyDown, true);
      window.removeEventListener('keyup', this.onBrowserRemoteKeyUp, true);
      window.removeEventListener('focus', this.focusGameCanvas);
      window.removeEventListener('blur', this.clearBrowserKeys);
      document.removeEventListener('visibilitychange', this.clearBrowserKeys);
      document.removeEventListener('visibilitychange', this.focusGameCanvas);
      if ((window as any).WxStackRemote?.dispatchKey === this.onAndroidRemoteKey) delete (window as any).WxStackRemote;
    }
    this.heldKeys.clear();
    this.gamepadSouthHeld = false;
    this.gamepadOptionsHeld = false;
    this.gamepadNorthHeld = false;
    this.gamepadEastHeld = false;
    this.gamepadWestHeld = false;
    this.gamepadMenuAxisHeld = false;
    if (this.homeTransition) {
      this.finishScreenTransition();
      this.showReadyScreen();
    }
  }

  onDestroy(): void {
    this.world3D?.destroy();
  }

  update(dt: number): void {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (this.homeTransition) {
      this.updateHomeTransition(elapsed);
      return;
    }
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

    // A stationary, lightly tinted backdrop. Panels own their own graphics so
    // their labels, focus rings and backgrounds animate as one visual unit.
    this.screenDimmer = this.makeFullNode('ScreenDimmer', this.node).addComponent(Graphics);

    this.hudSafeRoot = this.makeNode('SafeHud', this.node);
    this.hudSafeRoot.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    const safeArea = this.hudSafeRoot.addComponent(SafeArea);
    safeArea.updateArea();

    this.gameplayHudGroup = this.makeFullNode('GameplayHud', this.hudSafeRoot);
    this.scoreHudCard = this.makeNode('ScoreHudCard', this.gameplayHudGroup);
    this.scoreHudCard.addComponent(UITransform).setContentSize(152, 112);
    this.anchorTopLeft(this.scoreHudCard, 42, 32);
    this.scoreHudGraphics = this.scoreHudCard.addComponent(Graphics);
    this.scoreCaptionLabel = this.makeLabel('ScoreCaption', this.scoreHudCard, '当前分数', 17, new Color(255, 255, 255, 210), 126, 28);
    this.scoreCaptionLabel.node.setPosition(0, 30, 0);
    this.scoreLabel = this.makeLabel('Score', this.scoreHudCard, '0', 48, new Color(255, 255, 255, 245), 126, 62);
    this.scoreLabel.node.setPosition(0, -12, 0);

    this.bestHudCard = this.makeNode('BestHudCard', this.gameplayHudGroup);
    this.bestHudCard.addComponent(UITransform).setContentSize(152, 112);
    this.anchorTopLeft(this.bestHudCard, 42, 198);
    this.bestHudGraphics = this.bestHudCard.addComponent(Graphics);
    this.bestCaptionLabel = this.makeLabel('BestCaption', this.bestHudCard, COPY.best, 17, new Color(255, 255, 255, 210), 126, 28);
    this.bestCaptionLabel.node.setPosition(0, 30, 0);
    this.bestLabel = this.makeLabel('Best', this.bestHudCard, '0', 40, new Color(255, 255, 255, 235), 126, 58);
    this.bestLabel.node.setPosition(0, -12, 0);
    this.buildRecordGapHud();
    this.gameplayHudGroup.active = false;

    this.testModeBadgeLabel = this.makeLabel('TestModeBadge', this.hudSafeRoot, COPY.testing, 24, new Color(255, 255, 255, 235), 132, 52);
    this.anchorTopLeft(this.testModeBadgeLabel.node, 34, 170);
    this.testModeBadgeLabel.node.active = false;

    this.perfectLabel = this.makeLabel('Perfect', this.hudSafeRoot, COPY.perfect, 42, new Color(255, 255, 255, 255), 420, 72);
    this.anchorCenter(this.perfectLabel.node, 0, 248);
    this.perfectOpacity = this.perfectLabel.node.addComponent(UIOpacity);
    this.perfectOpacity.opacity = 0;

    this.startGroup = this.makeFullNode('StartScreen', this.hudSafeRoot);
    this.homePanelGraphics = this.startGroup.addComponent(Graphics);
    this.buildHomeButtons();
    this.homeCoinLabel = this.makeLabel('HomeCoins', this.startGroup, '0', 54, Color.WHITE, 280, 76);
    this.anchorCenter(this.homeCoinLabel.node, 0, 0);
    this.homeCoinCaption = this.makeCenteredLabel('HomeCoinCaption', this.startGroup, '金币', 28, 0, 280, 44, Color.WHITE);
    this.homeBestCaption = this.makeCenteredLabel('HomeBestCaption', this.startGroup, '最高纪录', 28, 0, 280, 44, Color.WHITE);
    this.homeBestBadge = this.makeNode('HomeBestBadge', this.startGroup);
    this.homeBestBadge.addComponent(UITransform).setContentSize(400, 84);
    this.homeBestBadge.addComponent(Graphics);
    this.anchorCenter(this.homeBestBadge, 0, 0);
    this.homeBestLabel = this.makeLabel('HomeBest', this.startGroup, '0', 54, Color.WHITE, 280, 76);
    this.homeCoinLabel.isBold = true;
    this.homeBestLabel.isBold = true;
    this.anchorCenter(this.homeBestLabel.node, 0, 0);
    this.makeCenteredLabel('Eyebrow', this.startGroup, COPY.eyebrow, 22, 326, 540, 48, new Color(255, 255, 255, 210));
    this.makeCenteredLabel('Title', this.startGroup, COPY.title, 104, 214, 500, 130, new Color(255, 255, 255, 255));
    this.makeCenteredLabel('Subtitle', this.startGroup, COPY.subtitle, 30, 120, 620, 66, new Color(255, 255, 255, 225));
    const start = this.makeMenuButton(this.startGroup, 'StartButton', this.audioReady ? COPY.start : COPY.loadingAudio, 620, 116);
    this.startButton = start.node;
    this.startButtonGraphics = start.graphics;
    this.startPromptLabel = start.label;
    this.anchorCenter(this.startButton, 0, 0);
    this.controlsLabel = this.makeCenteredLabel('Controls', this.startGroup, COPY.controls, 24, -350, 560, 56, new Color(255, 255, 255, 185));
    this.precisionTipLabel = this.makeCenteredLabel('PrecisionTip', this.startGroup, COPY.precision, 22, -425, 560, 56, new Color(255, 255, 255, 155));
    this.buildHomeLeaderboardPreview();

    this.resultGroup = this.makeFullNode('ResultScreen', this.hudSafeRoot);
    this.resultPanelGraphics = this.resultGroup.addComponent(Graphics);
    this.resultGroup.addComponent(BlockInputEvents);
    this.resultTitleLabel = this.makeCenteredLabel('ResultTitle', this.resultGroup, COPY.gameOver, 54, 190, 540, 78, new Color(255, 255, 255, 255));
    this.resultScoreLabel = this.makeCenteredLabel('ResultScore', this.resultGroup, '0', 108, 62, 380, 128, new Color(255, 255, 255, 255));
    this.resultBestLabel = this.makeCenteredLabel('ResultBest', this.resultGroup, '', 27, -47, 520, 56, new Color(255, 255, 255, 220));
    this.resultCoinLabel = this.makeCenteredLabel('ResultCoins', this.resultGroup, '', 24, -116, 540, 48, new Color(255, 245, 190, 245));
    this.resultRestartButton = this.makeOverlayButton(this.resultGroup, 'ResultRestart', COPY.restartRound, 400, 88, 0, -220);
    this.resultHomeButton = this.makeOverlayButton(this.resultGroup, 'ResultHome', COPY.home, 400, 88, 0, -338);
    this.makeCenteredLabel('Restart', this.resultGroup, COPY.restart, 20, -430, 540, 42, new Color(255, 255, 255, 200));
    this.resultGroup.active = false;

    this.buildPauseUI();
    this.buildHomeOverlays();
    this.loadThemeBackgrounds();
    this.loadBlockVisualAssets();
  }

  private buildHomeButtons(): void {
    const settings = this.makeMenuButton(
      this.startGroup,
      'SettingsButton',
      COPY.settings,
      HOME_MENU_BUTTON_WIDTH,
      HOME_MENU_BUTTON_HEIGHT,
    );
    this.settingsButton = settings.node;
    this.settingsButtonGraphics = settings.graphics;
    this.settingsButtonLabel = settings.label;
    this.anchorCenter(this.settingsButton, 0, HOME_MENU_SETTINGS_Y);

    const leaderboard = this.makeMenuButton(
      this.startGroup,
      'LeaderboardButton',
      COPY.leaderboard,
      HOME_MENU_BUTTON_WIDTH,
      HOME_MENU_BUTTON_HEIGHT,
    );
    this.leaderboardButton = leaderboard.node;
    this.leaderboardButtonGraphics = leaderboard.graphics;
    this.leaderboardButtonLabel = leaderboard.label;
    this.anchorCenter(this.leaderboardButton, 0, HOME_MENU_LEADERBOARD_Y);

    this.drawHomeButton(
      this.leaderboardButtonGraphics,
      this.leaderboardButtonLabel,
      HOME_MENU_BUTTON_WIDTH,
      HOME_MENU_BUTTON_HEIGHT,
    );
    this.drawHomeButton(
      this.settingsButtonGraphics,
      this.settingsButtonLabel,
      HOME_MENU_BUTTON_WIDTH,
      HOME_MENU_BUTTON_HEIGHT,
    );
  }

  private buildHomeLeaderboardPreview(): void {
    this.homeLeaderboardPreview = this.makeNode('HomeLeaderboardPreview', this.startGroup);
    this.homeLeaderboardPreview.addComponent(UITransform);
    this.anchorCenter(this.homeLeaderboardPreview, 0, 0);
    this.homeLeaderboardPreviewGraphics = this.homeLeaderboardPreview.addComponent(Graphics);
    this.homeLeaderboardPreview.addComponent(Button).transition = Button.Transition.NONE;
    this.homeLeaderboardPreviewTitle = this.makeLabel('PreviewTitle', this.homeLeaderboardPreview,
      '排行榜 →', 34, Color.WHITE, 312, 44);
    this.homeLeaderboardPreviewTitle.isBold = true;
    this.homeLeaderboardPreviewSubtitle = this.makeLabel('PreviewSubtitle', this.homeLeaderboardPreview,
      '本机 TOP 3 · 挑战新高度', 22, Color.WHITE, 352, 30);
    this.homeLeaderboardPreviewRanks = [];
    this.homeLeaderboardPreviewTitles = [];
    for (let index = 0; index < 3; index += 1) {
      const row = this.makeLabel(`PreviewRank-${index}`, this.homeLeaderboardPreview, '', 36, Color.WHITE, 312, 48);
      row.horizontalAlign = Label.HorizontalAlign.LEFT;
      this.homeLeaderboardPreviewRows.push(row);
      const detail = this.makeLabel(`PreviewPlayer-${index}`, this.homeLeaderboardPreview, '', 22, Color.WHITE, 312, 28);
      detail.horizontalAlign = Label.HorizontalAlign.LEFT;
      this.homeLeaderboardPreviewDetails.push(detail);
      const rank = this.makeLabel(`PreviewMedal-${index}`, this.homeLeaderboardPreview, `${index + 1}`, 26, Color.WHITE, 46, 42);
      rank.isBold = true;
      this.homeLeaderboardPreviewRanks.push(rank);
      const title = this.makeLabel(`PreviewTitle-${index}`, this.homeLeaderboardPreview, '', 22, Color.WHITE, 190, 30);
      title.horizontalAlign = Label.HorizontalAlign.LEFT;
      this.homeLeaderboardPreviewTitles.push(title);
    }
    this.homeLeaderboardPreviewEmpty = this.makeLabel('PreviewEmpty', this.homeLeaderboardPreview,
      '正在加载…', 24, Color.WHITE, 312, 70);
    this.homeLeaderboardPreviewHint = this.makeLabel('PreviewHint', this.homeLeaderboardPreview,
      '查看完整榜单  →', 24, Color.WHITE, 312, 34);
  }

  private updateHomeLeaderboardPreviewUI(): void {
    if (!this.homeLeaderboardPreview) return;
    const layout = projectorLeaderboardPreviewLayout(this.visibleWidth, this.visibleHeight);
    const compact = layout.rowYs.length === 1;
    const skin = this.currentSkin();
    const text = skin.id === 'minimal-stack' ? this.rgb(skin.textColor) : this.textOnButton(skin.panelColor);
    const soft = skin.id === 'minimal-stack';
    const g = this.homeLeaderboardPreviewGraphics;
    g.clear();
    g.fillColor = this.rgb(skin.panelColor);
    g.roundRect(-layout.panelWidth / 2, -layout.panelHeight / 2, layout.panelWidth, layout.panelHeight, compact ? 16 : 28);
    g.fill();
    g.lineWidth = 2;
    g.strokeColor = soft ? new Color(255, 255, 249) : this.rgb(skin.accentColor);
    g.roundRect(-layout.panelWidth / 2 + 2, -layout.panelHeight / 2 + 2,
      layout.panelWidth - 4, layout.panelHeight - 4, compact ? 14 : 26);
    g.stroke();
    const place = (label: Label, y: number, size: number, height: number) => {
      label.node.setPosition(0, y, 0);
      label.node.getComponent(UITransform)?.setContentSize(layout.panelWidth - (compact ? 24 : 48), height);
      label.fontSize = size;
      label.lineHeight = Math.round(size * 1.2);
      label.enableWrapText = false;
      label.color = text;
    };
    const column = (label: Label, x: number, width: number) => {
      label.node.setPosition(x, label.node.position.y, 0);
      const transform = label.node.getComponent(UITransform)!;
      transform.setContentSize(width, transform.height);
    };
    this.setCenteredNodeLayout(this.homeLeaderboardPreview, layout.panelX, layout.panelY);
    this.homeLeaderboardPreview.getComponent(UITransform)?.setContentSize(layout.panelWidth, layout.panelHeight);
    place(this.homeLeaderboardPreviewTitle, layout.titleY, layout.titleSize, compact ? 30 : 48);
    if (compact && this.homeLeaderboardPreviewEntries.length) column(this.homeLeaderboardPreviewTitle, 22, layout.panelWidth - 70);
    this.homeLeaderboardPreviewTitle.string = compact ? '排行榜 →' : '排行榜';
    this.homeLeaderboardPreviewSubtitle.node.active = !compact;
    place(this.homeLeaderboardPreviewSubtitle, layout.titleY - 43, 22, 30);
    if (!compact) {
      g.fillColor = this.rgb(skin.accentColor);
      g.roundRect(-24, layout.titleY + 33, 48, 4, 2); g.fill();
      g.fillColor = soft ? new Color(220, 235, 222) : this.rgb(skin.buttonColor);
      g.roundRect(-layout.panelWidth / 2 + 24, layout.hintY - 24, layout.panelWidth - 48, 48, 18); g.fill();
    }
    this.homeLeaderboardPreviewRows.forEach((row, index) => {
      const entry = this.homeLeaderboardPreviewEntries[index];
      row.node.active = !!entry && index < layout.rowYs.length;
      row.string = entry ? (compact ? `${index + 1}  ·  ${entry.score} 层` : `${entry.score} 层`) : '';
      const y = layout.rowYs[index] ?? 0;
      place(row, y - (compact ? 0 : 19), compact ? layout.scoreSize : 30, compact ? 30 : 38);
      row.isBold = true;
      row.horizontalAlign = compact ? Label.HorizontalAlign.CENTER : Label.HorizontalAlign.RIGHT;
      if (!compact) column(row, 133, 118);
      else if (entry && index === 0) {
        column(row, 22, layout.panelWidth - 70);
        this.drawRankAvatar(g, -layout.panelWidth / 2 + 28, 0, 21, entry.score);
      }
      const detail = this.homeLeaderboardPreviewDetails[index];
      detail.node.active = !!entry && !compact;
      detail.string = entry ? entry.nickname || '本地玩家' : '';
      place(detail, y + 23, 27, 34);
      detail.isBold = index === 0;
      column(detail, 47, 290);
      const rank = this.homeLeaderboardPreviewRanks[index];
      const title = this.homeLeaderboardPreviewTitles[index];
      rank.node.active = title.node.active = !!entry && !compact;
      title.string = entry ? leaderboardTitle(entry.score) : '';
      place(title, y - 19, 22, 30); column(title, -20, 156);
      place(rank, y - 22, 17, 24); column(rank, -144, 24);
      rank.color = new Color(79, 62, 47);
      if (entry && !compact) {
        g.fillColor = soft ? (index === 0 ? new Color(248, 232, 196) : new Color(246, 237, 224))
          : new Color(text.r, text.g, text.b, index === 0 ? 22 : 12);
        g.roundRect(-layout.panelWidth / 2 + 18, y - 46, layout.panelWidth - 36, 92, 20); g.fill();
        this.drawRankAvatar(g, -166, y + 4, 31, entry.score);
        this.drawRankNumberBadge(g, -144, y - 22, 12, index);
      }
    });
    this.homeLeaderboardPreviewEmpty.node.active = this.homeLeaderboardPreviewEntries.length === 0;
    place(this.homeLeaderboardPreviewEmpty, compact ? layout.rowYs[0] : -48, layout.captionSize, compact ? 30 : 70);
    if (!compact && this.homeLeaderboardPreviewEmpty.node.active) {
      // A small podium gives loading, empty and retry states the same visual identity.
      for (const [x, height, color] of [
        [-58, 42, [206, 216, 220]], [0, 70, [235, 194, 112]], [58, 30, [221, 179, 152]],
      ] as [number, number, RGB][]) {
        g.fillColor = this.rgb(color);
        g.roundRect(x - 24, 12, 48, height, 10); g.fill();
      }
    }
    this.homeLeaderboardPreviewHint.node.active = !compact;
    place(this.homeLeaderboardPreviewHint, layout.hintY, layout.captionSize, 34);
    if (!compact && !soft) this.homeLeaderboardPreviewHint.color = this.textOnButton(skin.buttonColor);
  }

  private async loadHomeLeaderboardPreview(): Promise<void> {
    if (!this.homeLeaderboardPreview) return;
    const request = ++this.homeLeaderboardPreviewRequest;
    this.homeLeaderboardPreviewEmpty.string = '正在加载…';
    this.updateHomeLeaderboardPreviewUI();
    const stillHome = () => this.isValid && request === this.homeLeaderboardPreviewRequest
      && this.phase === 'ready' && this.homeOverlay === 'none';
    try {
      await this.leaderboardSubmission;
      const snapshot = await this.leaderboard.list();
      if (!stillHome()) return;
      this.homeLeaderboardPreviewEntries = snapshot.entries.slice(0, 3);
      this.homeLeaderboardPreviewEmpty.string = '暂无成绩，等你上榜';
    } catch {
      if (!stillHome()) return;
      this.homeLeaderboardPreviewEntries = [];
      this.homeLeaderboardPreviewEmpty.string = '暂不可用，点击重试';
    }
    this.updateHomeLeaderboardPreviewUI();
  }

  private buildHomeOverlays(): void {
    this.settingsGroup = this.makeFullNode('SettingsScreen', this.hudSafeRoot);
    this.settingsGraphics = this.settingsGroup.addComponent(Graphics);
    this.settingsGroup.addComponent(BlockInputEvents);
    this.makeCenteredLabel('SettingsTitle', this.settingsGroup, COPY.settingsTitle, 56, 270, 520, 88, new Color(255, 255, 255, 255));
    this.makeCenteredLabel('SettingsHint', this.settingsGroup, COPY.settingsHint, 23, 185, 520, 50, new Color(255, 255, 255, 160));
    this.soundToggle = this.makeOverlayButton(this.settingsGroup, 'SoundToggle', '', 500, 104, 0, 65);
    this.motionToggle = this.makeOverlayButton(this.settingsGroup, 'MotionToggle', '', 500, 104, 0, -70);
    this.buildTestModeToggle();
    this.nicknameButton = this.makeOverlayButton(this.settingsGroup, 'NicknameButton', '修改昵称', 500, 104, 0, -282);
    this.nicknameLabel = this.makeLabel('CurrentNickname', this.nicknameButton.node, this.playerNickname, 25, Color.WHITE, 360, 30);
    this.settingsCloseButton = this.makeOverlayButton(this.settingsGroup, 'SettingsClose', COPY.close, 400, 92, 0, -250);
    this.settingsGroup.active = false;
    this.buildNicknameEditor();

    this.skinsGroup = this.makeFullNode('SkinsScreen', this.hudSafeRoot);
    this.skinsGraphics = this.skinsGroup.addComponent(Graphics);
    this.skinsGroup.addComponent(BlockInputEvents);
    this.makeCenteredLabel('SkinsTitle', this.skinsGroup, COPY.skinTitle, 54, 545, 520, 86, new Color(255, 255, 255, 255));
    this.skinsCoinLabel = this.makeCenteredLabel('SkinsCoins', this.skinsGroup, '', 28, 450, 420, 56, new Color(255, 245, 190, 255));
    const cardPositions: readonly Point2[] = [
      { x: 0, y: 305 },
      { x: 0, y: 169 },
      { x: 0, y: 33 },
      { x: 0, y: -103 },
      { x: 0, y: -239 },
      { x: 0, y: -375 },
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
    this.skinsHintLabel = this.makeCenteredLabel('SkinsHint', this.skinsGroup, COPY.skinHint, 20, -475, 520, 48, new Color(255, 255, 255, 170));
    this.skinsHintLabel.node.active = false;
    this.skinsCloseButton = this.makeOverlayButton(this.skinsGroup, 'SkinsClose', COPY.close, 420, 82, 0, -510);
    this.skinsGroup.active = false;

    this.buildLeaderboardUI();

    this.transitionBlocker = this.makeFullNode('TransitionInputBlocker', this.node);
    this.transitionBlocker.addComponent(BlockInputEvents);
    this.transitionBlocker.active = false;

    this.updateSettingsUI();
    this.updateSkinShopUI();
  }

  private buildLeaderboardUI(): void {
    this.leaderboardGroup = this.makeFullNode('LeaderboardScreen', this.hudSafeRoot);
    this.leaderboardGraphics = this.leaderboardGroup.addComponent(Graphics);
    this.leaderboardGroup.addComponent(BlockInputEvents);
    this.makeCenteredLabel('LeaderboardTitle', this.leaderboardGroup, COPY.leaderboard, 54, 450, 520, 82, Color.WHITE);
    this.leaderboardStatus = this.makeCenteredLabel('LeaderboardStatus', this.leaderboardGroup, '本机 Top 10 · 每局成绩', 24, 377, 530, 52, Color.WHITE);
    this.makeCenteredLabel('LeaderboardRankHeading', this.leaderboardGroup, '排名', 23, 310, 74, 42, Color.WHITE);
    const columns = this.makeCenteredLabel('LeaderboardColumns', this.leaderboardGroup, '玩家 / 段位', 23, 310, 390, 42, Color.WHITE);
    columns.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.makeCenteredLabel('LeaderboardScoreHeading', this.leaderboardGroup, '叠高 / 层', 23, 310, 180, 42, Color.WHITE);
    this.leaderboardViewport = this.makeNode('LeaderboardViewport', this.leaderboardGroup);
    this.leaderboardViewport.addComponent(UITransform).setContentSize(520, 768);
    this.leaderboardViewport.addComponent(MaskComponent).type = MaskComponent.Type.GRAPHICS_RECT;
    this.leaderboardContent = this.makeNode('LeaderboardContent', this.leaderboardViewport);
    const contentTransform = this.leaderboardContent.addComponent(UITransform);
    contentTransform.setAnchorPoint(0.5, 1);
    contentTransform.setContentSize(520, 1584);
    this.leaderboardScroll = this.leaderboardViewport.addComponent(ScrollView);
    this.leaderboardScroll.content = this.leaderboardContent;
    this.leaderboardScroll.horizontal = false;
    this.leaderboardScroll.vertical = true;
    this.leaderboardScroll.elastic = false;
    this.leaderboardScroll.inertia = true;
    this.leaderboardScroll.brake = 0.65;
    this.leaderboardScroll.cancelInnerEvents = true;
    const track = this.makeNode('LeaderboardScrollTrack', this.leaderboardGroup);
    track.addComponent(UITransform);
    this.leaderboardScrollTrack = track.addComponent(Graphics);
    this.leaderboardViewport.on(ScrollView.EventType.SCROLLING, this.updateLeaderboardScrollTrack, this);
    for (let index = 0; index < 10; index += 1) {
      const node = this.makeNode(`LeaderboardRow-${index}`, this.leaderboardContent);
      node.addComponent(UITransform).setContentSize(520, 82);
      const graphics = node.addComponent(Graphics);
      const rank = this.makeLabel('Rank', node, '', 36, Color.WHITE, 74, 62);
      rank.isBold = true;
      rank.node.setPosition(-209, 0, 0);
      const player = this.makeLabel('Player', node, '', 24, Color.WHITE, 390, 30);
      player.horizontalAlign = Label.HorizontalAlign.LEFT;
      const score = this.makeLabel('Score', node, '', 30, Color.WHITE, 390, 40);
      score.isBold = true;
      score.horizontalAlign = Label.HorizontalAlign.CENTER;
      score.node.setPosition(43, 19, 0);
      const detail = this.makeLabel('Detail', node, '', 21, Color.WHITE, 390, 32);
      detail.horizontalAlign = Label.HorizontalAlign.LEFT;
      detail.node.setPosition(43, -22, 0);
      const title = this.makeLabel('Title', node, '', 26, Color.WHITE, 390, 36);
      title.horizontalAlign = Label.HorizontalAlign.LEFT;
      this.leaderboardRows.push({ node, graphics, rank, player, score, title, detail });
    }
    this.leaderboardEmpty = this.makeCenteredLabel('LeaderboardEmpty', this.leaderboardGroup, '', 30, 80, 520, 160, Color.WHITE);
    this.leaderboardPageLabel = this.makeCenteredLabel('LeaderboardScrollHint', this.leaderboardGroup, '', 22, -538, 520, 38, Color.WHITE);
    this.leaderboardButtons.push(this.makeOverlayButton(this.leaderboardGroup, 'LeaderboardClose', '×', 76, 76, 0, 0));
    this.leaderboardHandlers.push(() => this.closeHomeOverlay());
    this.leaderboardGroup.active = false;
  }

  private updateLeaderboardUI(): void {
    if (!this.leaderboardGraphics) return;
    const layout = this.panelLayout('leaderboard');
    this.drawLeaderboardPanel();
    const soft = this.currentSkin().id === 'minimal-stack';
    const text = soft ? new Color(83, 67, 78) : new Color(240, 250, 249, 255);
    const secondary = soft ? new Color(105, 86, 94) : new Color(181, 212, 217, 255);
    const accent = soft ? new Color(87, 126, 113) : new Color(148, 232, 207, 255);
    for (const name of ['LeaderboardTitle', 'LeaderboardStatus', 'LeaderboardRankHeading', 'LeaderboardColumns', 'LeaderboardScoreHeading', 'LeaderboardEmpty', 'LeaderboardScrollHint']) {
      this.setNamedLabelColor(this.leaderboardGroup, name, name === 'LeaderboardTitle' || name === 'LeaderboardEmpty'
        ? text : secondary);
    }
    // Decorative divider and accent underline keep the header distinct from the moving list.
    const panel = this.leaderboardGraphics;
    panel.fillColor = accent;
    panel.roundRect(-layout.contentWidth / 2, layout.subtitleY - 5, 68, 10, 5);
    panel.fill();
    panel.fillColor = new Color(text.r, text.g, text.b, 28);
    panel.rect(-layout.contentWidth / 2, layout.listTop + 9, layout.contentWidth, 1);
    panel.fill();
    this.leaderboardRows.forEach((row, index) => {
      const rank = index;
      const entry = this.leaderboardEntries[rank];
      row.node.active = !!entry && !this.leaderboardLoading;
      if (!entry) return;
      const currentRound = entry.id === this.submittedRoundId;
      row.graphics.clear();
      this.drawLeaderboardGradient(row.graphics, -layout.rowWidth / 2, -layout.rowHeight / 2,
        layout.rowWidth, layout.rowHeight, 18,
        soft ? (currentRound ? [227, 241, 226] : [255, 253, 243]) : currentRound ? [48, 99, 101] : [39, 83, 87],
        soft ? (currentRound ? [213, 233, 218] : [246, 234, 220]) : [28, 65, 69]);
      row.graphics.strokeColor = currentRound ? accent : soft ? new Color(169, 139, 133, 75) : new Color(112, 182, 179, 80);
      row.graphics.lineWidth = currentRound ? 3 : 1;
      row.graphics.roundRect(-layout.rowWidth / 2, -layout.rowHeight / 2, layout.rowWidth, layout.rowHeight, 18);
      row.graphics.stroke();
      // Avatar follows the score tier; the small numbered badge follows list position.
      this.drawRankAvatar(row.graphics, layout.rankX, 5, 40, entry.score);
      this.drawRankNumberBadge(row.graphics, layout.rankX + 26, -28, 18, rank);
      row.rank.string = rank < 9 ? `0${rank + 1}` : `${rank + 1}`;
      row.player.string = `${entry.nickname || '本地玩家'}${currentRound ? ' · 本局' : ''}`;
      row.score.string = `${entry.score}`;
      row.title.string = leaderboardTitle(entry.score);
      if (entry.kind === 'legacy') row.detail.string = '历史纪录 · 详情未记录';
      else {
        const date = new Date(entry.finishedAt!);
        const pad = (value: number) => value < 10 ? `0${value}` : `${value}`;
        row.detail.string = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}  · 完美 ${entry.perfectCount} 次`;
      }
      row.rank.color = new Color(56, 46, 31, 255);
      row.score.color = text;
      row.player.color = text;
      row.title.color = soft ? new Color(120, 81, 42) : new Color(249, 222, 149, 255);
      row.title.isBold = true;
      row.detail.color = soft ? secondary : new Color(191, 216, 221, 255);
    });
    this.leaderboardEmpty.node.active = this.leaderboardLoading || this.leaderboardEntries.length === 0;
    this.leaderboardPageLabel.string = this.leaderboardLoading ? '' : this.leaderboardEntries.length > 4
      ? '↑ ↓ 滚动  ·  滑动 / 滚轮  ·  返回键关闭' : '本机成绩  ·  返回键关闭';
    this.leaderboardButtons.forEach(button => {
      button.graphics.clear();
      button.label.string = '';
      button.graphics.strokeColor = accent;
      button.graphics.lineWidth = 4;
      button.graphics.moveTo(-17, -17);
      button.graphics.lineTo(17, 17);
      button.graphics.moveTo(-17, 17);
      button.graphics.lineTo(17, -17);
      button.graphics.stroke();
    });
    this.layoutLeaderboardList();
  }

  /** Opaque rounded gradient: short horizontal bands avoid bitmap assets and scale cleanly on TVs. */
  private drawLeaderboardGradient(g: Graphics, x: number, y: number, width: number, height: number,
    radius: number, top: number[], bottom: number[]): void {
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const band = height / steps;
      const edge = Math.min((i + 0.5) * band, height - (i + 0.5) * band);
      const inset = edge < radius ? radius - Math.sqrt(Math.max(0, radius * radius - (radius - edge) ** 2)) : 0;
      g.fillColor = new Color(...bottom.map((value, channel) => Math.round(value + (top[channel] - value) * t)) as [number, number, number]);
      g.rect(x + inset, y + i * band, width - inset * 2, band + 0.2);
      g.fill();
    }
  }

  private drawLeaderboardPanel(): void {
    const soft = this.currentSkin().id === 'minimal-stack';
    const layout = this.panelLayout('leaderboard');
    const g = this.leaderboardGraphics;
    const w = layout.panelWidth;
    const h = layout.panelHeight;
    g.clear();
    for (const [inset, alpha] of [[14, 12], [7, 22], [0, 36]]) {
      g.fillColor = soft ? new Color(133, 104, 106, alpha) : new Color(8, 42, 43, alpha);
      g.roundRect(-w / 2 - inset, -h / 2 - inset - 8, w + inset * 2, h + inset * 2, 44 + inset);
      g.fill();
    }
    if (soft) {
      g.fillColor = new Color(255, 248, 231);
      g.roundRect(-w / 2, -h / 2, w, h, 44);
      g.fill();
    } else {
      this.drawLeaderboardGradient(g, -w / 2, -h / 2, w, h, 44, [35, 85, 88], [16, 49, 54]);
    }
    g.strokeColor = soft ? new Color(255, 255, 245, 220) : new Color(111, 201, 191, 120);
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, 44);
    g.stroke();
    g.strokeColor = new Color(174, 234, 220, 30);
    g.roundRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 40);
    g.stroke();
    g.fillColor = soft ? new Color(190, 157, 146, 32) : new Color(9, 38, 42, 96);
    g.roundRect(-layout.contentWidth / 2 - 6, layout.listTop - layout.listHeight - 4,
      layout.contentWidth + 12, layout.listHeight + 80, 24);
    g.fill();
  }

  private drawRankNumberBadge(g: Graphics, x: number, y: number, radius: number, rank: number): void {
    const colors = [[245, 201, 105], [203, 221, 230], [220, 165, 126]];
    const c = colors[rank] ?? [241, 231, 215];
    g.fillColor = new Color(c[0], c[1], c[2]);
    g.circle(x, y, radius); g.fill();
    g.strokeColor = new Color(255, 250, 237);
    g.lineWidth = 2; g.circle(x, y, radius); g.stroke();
  }

  /** Six code-drawn toy portraits: distinct silhouettes remain legible at HUD size. */
  private drawRankAvatar(g: Graphics, x: number, y: number, radius: number, score: number): void {
    const tier = leaderboardTier(score);
    const backgrounds: readonly RGB[] = [[244, 220, 196], [226, 233, 243], [252, 234, 177],
      [207, 235, 222], [208, 230, 248], [234, 217, 246]];
    const coats: readonly RGB[] = [[179, 120, 81], [133, 153, 181], [204, 145, 49],
      [68, 145, 129], [82, 130, 193], [137, 99, 174]];
    const coat = coats[tier];
    const face: RGB = [255, 242, 215];
    const ink: RGB = [62, 51, 64];
    const s = radius / 50;
    const circle = (cx: number, cy: number, r: number, color: RGB) => {
      g.fillColor = this.rgb(color); g.circle(x + cx * s, y + cy * s, r * s); g.fill();
    };
    const rect = (cx: number, cy: number, w: number, h: number, r: number, color: RGB) => {
      g.fillColor = this.rgb(color);
      g.roundRect(x + cx * s, y + cy * s, w * s, h * s, r * s); g.fill();
    };
    const polygon = (points: number[][], color: RGB) => {
      g.fillColor = this.rgb(color);
      g.moveTo(x + points[0][0] * s, y + points[0][1] * s);
      for (const [px, py] of points.slice(1)) g.lineTo(x + px * s, y + py * s);
      g.close(); g.fill();
    };
    circle(0, 0, 50, backgrounds[tier]);
    g.strokeColor = new Color(255, 253, 240); g.lineWidth = 2 * s;
    g.circle(x, y, 47 * s); g.stroke();
    if (tier === 0) { // Bronze bear: rounded ears and a warm copper coat.
      circle(-23, 23, 13, coat); circle(23, 23, 13, coat);
      circle(-23, 23, 6, face); circle(23, 23, 6, face);
    } else if (tier === 1) { // Silver cat: pointed ears.
      polygon([[-31, 6], [-29, 38], [-6, 20]], coat);
      polygon([[31, 6], [29, 38], [6, 20]], coat);
    } else if (tier === 2) { // Golden lion: a broad sun-shaped mane.
      polygon(Array.from({ length: 24 }, (_, i) => {
        const angle = i * Math.PI / 12; const r = i % 2 ? 33 : 42;
        return [Math.cos(angle) * r, Math.sin(angle) * r - 3];
      }), coat);
    } else if (tier === 3) { // Platinum owl: swept feathers and eye discs.
      polygon([[-35, -23], [-38, 32], [-9, 18], [9, 18], [38, 32], [35, -23], [0, -39]], coat);
    } else if (tier === 4) { // Diamond robot: square head and crystal antenna.
      rect(-3, 20, 6, 16, 2, coat);
      polygon([[0, 45], [10, 36], [0, 27], [-10, 36]], [77, 180, 210]);
      rect(-37, -10, 9, 18, 4, coat); rect(28, -10, 9, 18, 4, coat);
    }
    rect(-31, -31, 62, 56, tier === 4 ? 10 : 23, coat);
    rect(-24, -25, 48, 39, tier === 4 ? 7 : 18, face);
    if (tier === 3) {
      circle(-12, 1, 14, face); circle(12, 1, 14, face);
      polygon([[-5, -8], [5, -8], [0, -16]], [204, 145, 49]);
    }
    circle(-11, 0, tier === 3 ? 5 : 3.8, ink); circle(11, 0, tier === 3 ? 5 : 3.8, ink);
    if (tier !== 3) {
      circle(-19, -10, 4, [232, 169, 163]); circle(19, -10, 4, [232, 169, 163]);
      g.strokeColor = this.rgb(ink); g.lineWidth = 2.5 * s;
      g.moveTo(x - 5 * s, y - 11 * s); g.lineTo(x, y - 15 * s); g.lineTo(x + 5 * s, y - 11 * s); g.stroke();
    }
    if (tier === 5) { // King: purple cloak, three-point crown and a ruby.
      polygon([[-26, 18], [-30, 38], [-13, 28], [0, 44], [13, 28], [30, 38], [26, 18]], [236, 191, 83]);
      rect(-25, 15, 50, 8, 3, [250, 216, 125]);
      polygon([[0, 31], [6, 25], [0, 19], [-6, 25]], [177, 91, 133]);
    }
  }

  private moveLeaderboardSelection(direction: number): void {
    this.scrollLeaderboard(direction);
  }

  private activateLeaderboardSelection(): void {
    if (this.homeOverlay === 'leaderboard') this.closeHomeOverlay();
  }

  private changeLeaderboardPage(direction: number): void {
    this.scrollLeaderboard(direction);
  }

  private scrollLeaderboard(direction: number): void {
    if (this.homeOverlay !== 'leaderboard' || this.leaderboardLoading || !this.leaderboardScroll) return;
    const layout = this.panelLayout('leaderboard');
    const current = this.leaderboardScroll.getScrollOffset().y;
    const start = current;
    this.leaderboardScrollTarget = Math.max(0, Math.min(this.leaderboardScroll.getMaxScrollOffset().y,
      start + Math.sign(direction) * (layout.rowHeight + layout.rowGap)));
    this.leaderboardScroll.stopAutoScroll();
    this.leaderboardScroll.scrollToOffset(new Vec2(0, this.leaderboardScrollTarget), this.reducedMotion ? 0 : 0.16);
    this.updateLeaderboardScrollTrack();
  }

  private updateLeaderboardScrollTrack(): void {
    if (!this.leaderboardScrollTrack) return;
    const layout = this.panelLayout('leaderboard');
    const g = this.leaderboardScrollTrack;
    g.clear();
    const max = this.leaderboardScroll.getMaxScrollOffset().y;
    if (max <= 0 || this.leaderboardLoading) return;
    const x = layout.contentWidth / 2 - 5;
    const height = Math.max(48, layout.listHeight * layout.listHeight / (max + layout.listHeight));
    const progress = Math.max(0, Math.min(1, this.leaderboardScroll.getScrollOffset().y / max));
    g.fillColor = new Color(130, 189, 190, 90);
    g.roundRect(x, layout.listTop - layout.listHeight, 5, layout.listHeight, 2);
    g.fill();
    g.fillColor = this.currentSkin().id === 'minimal-stack' ? new Color(87, 126, 113) : new Color(148, 232, 207, 255);
    g.roundRect(x, layout.listTop - height - progress * (layout.listHeight - height), 5, height, 2);
    g.fill();
  }

  private layoutLeaderboardList(): void {
    if (!this.leaderboardScroll) return;
    const rank = this.panelLayout('leaderboard');
    const previous = this.leaderboardScroll.getScrollOffset().y;
    this.leaderboardScroll.stopAutoScroll();
    this.leaderboardScroll.inertia = !this.reducedMotion;
    this.leaderboardViewport.setPosition(-10, rank.listTop - rank.listHeight / 2, 0);
    this.leaderboardViewport.getComponent(UITransform).setContentSize(rank.rowWidth, rank.listHeight);
    const count = this.leaderboardLoading ? 0 : this.leaderboardEntries.length;
    const height = Math.max(rank.listHeight, count * (rank.rowHeight + rank.rowGap) - rank.rowGap);
    this.leaderboardContent.getComponent(UITransform).setContentSize(rank.rowWidth, height);
    const offset = Math.max(0, Math.min(previous, height - rank.listHeight));
    this.leaderboardContent.setPosition(0, rank.listHeight / 2 + offset, 0);
    this.leaderboardScrollTarget = offset;
    this.leaderboardRows.forEach((row, index) => {
      row.node.getComponent(UITransform).setContentSize(rank.rowWidth, rank.rowHeight);
      row.node.setPosition(0, rank.rowYs[index], 0);
      const scale = rank.rowHeight / 144;
      for (const [label, x, y, width, height, size] of [
        [row.rank, rank.rankX + 26, -28, 36, 32, 22],
        [row.player, rank.detailX, 40, rank.split ? rank.detailWidth : rank.rowWidth - rank.rankWidth - 64, 40, rank.split ? 32 : 28],
        [row.title, rank.detailX, 0, rank.detailWidth, 36, 26],
        [row.detail, rank.detailX, -40, rank.rowWidth - rank.rankWidth - 64, 30, 22],
        [row.score, rank.scoreX, rank.split ? 20 : -4, rank.scoreWidth, rank.split ? 70 : 48, rank.split ? 54 : 40],
      ] as [Label, number, number, number, number, number][]) {
        // Metadata may span the score column on its own bottom line.
        const labelX = label === row.detail || (label === row.player && !rank.split)
          ? rank.detailX - rank.detailWidth / 2 + width / 2 : x;
        label.node.setPosition(labelX, y * scale, 0);
        label.node.getComponent(UITransform).setContentSize(width, height * scale);
        label.fontSize = size * scale;
        label.lineHeight = Math.round(label.fontSize * 1.2);
        label.enableWrapText = false;
      }
      row.player.isBold = true;
    });
    this.updateLeaderboardScrollTrack();
  }

  private async loadLeaderboard(): Promise<void> {
    const request = ++this.leaderboardRequest;
    this.leaderboardLoading = true;
    this.leaderboardEntries = [];
    this.leaderboardEmpty.string = '正在加载成绩…';
    this.leaderboardStatus.string = '本机 Top 10 · 每局成绩';
    this.updateLeaderboardUI();
    try {
      await this.leaderboardSubmission;
      const snapshot = await this.leaderboard.list();
      if (!this.isValid || request !== this.leaderboardRequest || this.homeOverlay !== 'leaderboard') return;
      this.leaderboardEntries = snapshot.entries.slice(0, 10);
      this.leaderboardStatus.string = this.leaderboardSaveFailed ? '本局成绩暂未保存'
        : snapshot.persistent ? '本机 Top 10 · 每局成绩' : '本次会话排行 · 关闭后不保留';
      this.leaderboardEmpty.string = '还没有成绩\n完成一局即可上榜';
    } catch {
      if (!this.isValid || request !== this.leaderboardRequest || this.homeOverlay !== 'leaderboard') return;
      this.leaderboardEmpty.string = '成绩暂时无法加载\n请返回后重试';
    }
    this.leaderboardLoading = false;
    this.updateLeaderboardUI();
  }

  private recordLeaderboardResult(): void {
    if (!this.roundId || this.submittedRoundId === this.roundId) return;
    this.submittedRoundId = this.roundId;
    this.leaderboardSaveFailed = false;
    this.leaderboardSubmission = this.leaderboard.submit({
      id: this.roundId, score: this.score, perfectCount: this.roundPerfectCount,
      finishedAt: Date.now(), testMode: this.roundWasTest || this.testModeEnabled,
      nickname: this.roundNickname,
    }).catch(() => { this.leaderboardSaveFailed = true; });
  }

  private makeMenuButton(parent: Node, name: string, text: string, width: number, height: number): ButtonUI {
    const node = this.makeNode(name, parent);
    node.addComponent(UITransform).setContentSize(width, height);
    const graphics = node.addComponent(Graphics);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    const label = this.makeLabel(`${name}Label`, node, text, 30, new Color(255, 255, 255, 238), width - 18, height - 8);
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
    node.addComponent(UITransform).setContentSize(SKIN_CARD_WIDTH + 16, SKIN_CARD_HEIGHT + 8);
    this.anchorCenter(node, horizontalCenter, verticalCenter);
    const graphics = node.addComponent(Graphics);
    const button = node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    const previewNode = this.makeNode(`SkinPreview-${skin.id}`, node);
    previewNode.addComponent(UITransform).setContentSize(82, 74);
    previewNode.setPosition(-205, 0, 0);
    const previewSprite = previewNode.addComponent(Sprite);
    previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    const title = this.makeLabel(`SkinTitle-${skin.id}`, node, skin.name, 25, new Color(255, 255, 255, 255), 250, 38);
    title.horizontalAlign = Label.HorizontalAlign.LEFT;
    title.node.setPosition(-15, 21, 0);
    const description = this.makeLabel(`SkinDescription-${skin.id}`, node, skin.description, 16, new Color(255, 255, 255, 170), 270, 34);
    description.horizontalAlign = Label.HorizontalAlign.LEFT;
    description.node.setPosition(-5, -19, 0);
    const status = this.makeLabel(`SkinStatus-${skin.id}`, node, '', 17, new Color(255, 255, 255, 245), 110, 44);
    status.node.setPosition(195, 0, 0);
    return { node, graphics, label: status, title, description, status, previewSprite };
  }

  private drawHomeButton(
    graphics: Graphics,
    label: Label,
    width: number,
    height: number,
    selected = false,
  ): void {
    const skin = this.currentSkin();
    graphics.clear();
    graphics.fillColor = selected
      ? this.rgb(skin.accentColor)
      : this.rgb(skin.buttonColor);
    graphics.roundRect(-width * 0.5, -height * 0.5, width, height, 28);
    graphics.fill();
    graphics.strokeColor = this.rgb(skin.accentColor, selected ? 255 : 126);
    graphics.lineWidth = selected ? 4 : 2;
    graphics.roundRect(-width * 0.5, -height * 0.5, width, height, 28);
    graphics.stroke();
    if (selected) this.drawHomeFocus(graphics, 0, width, height);
    label.color = selected
      ? this.textOnButton(skin.accentColor)
      : this.textOnButton(skin.buttonColor);
    const focusScale = selected && !this.reducedMotion ? 1.018 : 1;
    graphics.node.setScale(focusScale, focusScale, 1);
  }

  private updateHomeMenuFocus(): void {
    if (!this.settingsButtonGraphics || !this.leaderboardButtonGraphics || !this.startPromptLabel) {
      return;
    }
    const layout = this.homeLayout();
    this.drawHomeButton(this.startButtonGraphics, this.startPromptLabel, layout.buttonWidth, layout.buttonHeight,
      this.homeOverlay === 'none' && this.homeSelection === 0);
    this.drawHomeButton(
      this.leaderboardButtonGraphics,
      this.leaderboardButtonLabel,
      layout.buttonWidth,
      layout.buttonHeight,
      this.homeOverlay === 'none' && this.homeSelection === 1,
    );
    this.drawHomeButton(
      this.settingsButtonGraphics,
      this.settingsButtonLabel,
      layout.buttonWidth,
      layout.buttonHeight,
      this.homeOverlay === 'none' && this.homeSelection === 2,
    );
    this.startPromptLabel.color = this.homeOverlay === 'none' && this.homeSelection === 0
      ? this.textOnButton(this.currentSkin().accentColor)
      : this.textOnButton(this.currentSkin().buttonColor);
  }

  private drawHomeFocus(graphics: Graphics, x: number, width: number, height: number): void {
    graphics.strokeColor = this.textOnButton(this.currentSkin().panelColor);
    graphics.lineWidth = 4;
    graphics.roundRect(x - width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 36);
    graphics.stroke();
    graphics.fillColor = this.textOnButton(this.currentSkin().accentColor);
    graphics.moveTo(x - width / 2 + 26, -10);
    graphics.lineTo(x - width / 2 + 39, 0);
    graphics.lineTo(x - width / 2 + 26, 10);
    graphics.close();
    graphics.fill();
  }

  private drawOverlayBackdrop(graphics: Graphics, panelWidth: number, panelHeight: number): void {
    const skin = this.currentSkin();
    const safeInset = this.tvLayout ? TV_OVERSCAN_INSET : 24;
    const effectiveWidth = Math.min(panelWidth, Math.max(0, this.visibleWidth - safeInset * 2));
    const effectiveHeight = Math.min(panelHeight, Math.max(0, this.visibleHeight - safeInset * 2));
    const panelX = this.panelCenterX(effectiveWidth);
    graphics.clear();
    graphics.fillColor = this.rgb(skin.panelColor, 255);
    graphics.roundRect(panelX - effectiveWidth * 0.5, -effectiveHeight * 0.5, effectiveWidth, effectiveHeight, 42);
    graphics.fill();
    graphics.strokeColor = this.rgb(skin.accentColor, 130);
    graphics.lineWidth = 2;
    graphics.roundRect(panelX - effectiveWidth * 0.5, -effectiveHeight * 0.5, effectiveWidth, effectiveHeight, 42);
    graphics.stroke();
  }

  private drawOverlayButton(ui: ButtonUI, width: number, height: number, selected: boolean, prominent = false): void {
    // The hit rectangle, fill and focus use one size; avoid a second TV scale.
    ui.node.getComponent(UITransform)?.setContentSize(width, height);
    this.drawHomeButton(ui.graphics, ui.label, width, height, selected);
  }

  private drawSettingToggle(ui: ButtonUI, caption: string, enabled: boolean, selected: boolean): void {
    const layout = this.panelLayout('settings');
    this.drawOverlayButton(ui, layout.buttonWidth, layout.buttonHeight, selected);
    ui.label.string = caption;
    ui.label.horizontalAlign = Label.HorizontalAlign.LEFT;
    ui.label.node.setPosition(-36, 0, 0);
    ui.label.node.getComponent(UITransform)?.setContentSize(layout.buttonWidth - 200, layout.buttonHeight - 12);
    let state = ui.node.getChildByName('SettingState')?.getComponent(Label);
    if (!state) state = this.makeLabel('SettingState', ui.node, '', 30, Color.WHITE, 64, 56);
    state.string = enabled ? COPY.enabled : COPY.disabled;
    state.fontSize = layout.split ? 32 : 28;
    state.lineHeight = Math.round(state.fontSize * 1.2);
    state.isBold = true;
    state.node.setPosition(layout.buttonWidth / 2 - 68, 0, 0);
    state.color = ui.label.color;
    const color = ui.label.color;
    ui.graphics.fillColor = new Color(color.r, color.g, color.b, enabled ? 26 : 12);
    ui.graphics.roundRect(layout.buttonWidth / 2 - 104, -28, 72, 56, 18);
    ui.graphics.fill();
    ui.graphics.strokeColor = new Color(color.r, color.g, color.b, 110);
    ui.graphics.lineWidth = 2;
    ui.graphics.roundRect(layout.buttonWidth / 2 - 104, -28, 72, 56, 18);
    ui.graphics.stroke();
  }

  private buildNicknameEditor(): void {
    this.nicknameGroup = this.makeFullNode('NicknameScreen', this.hudSafeRoot);
    // Configure SINGLE_LINE before EditBox initializes its native DOM element.
    this.nicknameGroup.active = false;
    this.nicknameGroup.addComponent(BlockInputEvents);
    this.nicknameGraphics = this.nicknameGroup.addComponent(Graphics);
    this.makeCenteredLabel('NicknameTitle', this.nicknameGroup, '修改昵称', 54, 190, 520, 72, Color.WHITE);
    this.makeCenteredLabel('NicknameDescription', this.nicknameGroup, '1–12 个字符 · 仅保存在本机', 24, 112, 520, 40, Color.WHITE);
    const inputNode = this.makeNode('NicknameInput', this.nicknameGroup);
    inputNode.addComponent(UITransform).setContentSize(500, 80);
    this.anchorCenter(inputNode, 0, 28);
    this.nicknameInputGraphics = inputNode.addComponent(Graphics);
    this.nicknameEditor = inputNode.addComponent(EditBox);
    this.nicknameEditor.inputMode = EditBox.InputMode.SINGLE_LINE;
    this.nicknameEditor.inputFlag = EditBox.InputFlag.DEFAULT;
    this.nicknameEditor.returnType = EditBox.KeyboardReturnType.DONE;
    // Validate Unicode code points on save instead of truncating surrogate pairs.
    this.nicknameEditor.maxLength = -1;
    const text = this.nicknameEditor.textLabel
      ?? this.makeLabel('NicknameText', inputNode, '', 34, Color.WHITE, 480, 80);
    const placeholder = this.nicknameEditor.placeholderLabel
      ?? this.makeLabel('NicknamePlaceholder', inputNode, '输入你的昵称', 30, Color.WHITE, 480, 80);
    placeholder.string = '输入你的昵称';
    for (const label of [text, placeholder]) {
      label.node.getComponent(UITransform)?.setAnchorPoint(0, 1);
      label.horizontalAlign = Label.HorizontalAlign.LEFT;
      label.verticalAlign = Label.VerticalAlign.CENTER;
      label.enableWrapText = false;
    }
    this.nicknameEditor.textLabel = text;
    this.nicknameEditor.placeholderLabel = placeholder;
    this.nicknameHint = this.makeCenteredLabel('NicknameHint', this.nicknameGroup, '', 22, -45, 520, 52, Color.WHITE);
    this.nicknameSaveButton = this.makeOverlayButton(this.nicknameGroup, 'NicknameSave', '保存', 220, 88, -122, -142);
    this.nicknameCancelButton = this.makeOverlayButton(this.nicknameGroup, 'NicknameCancel', '取消', 220, 88, 122, -142);
  }

  private updateNicknameEditorUI(): void {
    if (!this.nicknameGroup) return;
    const layout = this.panelLayout('settings');
    const width = Math.min(640, this.visibleWidth - 56);
    const content = width - 64;
    const skin = this.currentSkin();
    const text = this.textOnButton(skin.panelColor);
    const g = this.nicknameGraphics;
    g.clear();
    g.fillColor = this.rgb(skin.panelColor);
    g.roundRect(-width / 2, -250, width, 500, 36);
    g.fill();
    this.layoutPanelLabel(this.nicknameGroup, 'NicknameTitle', 0, 176, content, 72, 52, true);
    this.layoutPanelLabel(this.nicknameGroup, 'NicknameDescription', 0, 104, content, 40, 24);
    this.layoutPanelLabel(this.nicknameGroup, 'NicknameHint', 0, -48, content, 52, 22);
    for (const name of ['NicknameTitle', 'NicknameDescription', 'NicknameHint']) this.setNamedLabelColor(this.nicknameGroup, name, text);
    this.setCenteredNodeLayout(this.nicknameEditor.node, 0, 28);
    this.nicknameEditor.node.getComponent(UITransform)?.setContentSize(content, 80);
    for (const label of [this.nicknameEditor.textLabel, this.nicknameEditor.placeholderLabel]) {
      if (label) { label.color = text; label.fontSize = 32; label.lineHeight = 40; }
    }
    const input = this.nicknameInputGraphics;
    input.clear();
    input.fillColor = new Color(text.r, text.g, text.b, 18);
    input.roundRect(-content / 2, -40, content, 80, 16);
    input.fill();
    input.lineWidth = this.nicknameSelection === 0 ? 4 : 2;
    input.strokeColor = text;
    input.roundRect(-content / 2, -40, content, 80, 16);
    input.stroke();
    const buttonWidth = (content - 28) / 2;
    for (const [button, index, x] of [
      [this.nicknameSaveButton, 1, -(buttonWidth + 28) / 2],
      [this.nicknameCancelButton, 2, (buttonWidth + 28) / 2],
    ] as [ButtonUI, number, number][]) {
      this.layoutPanelButton(button, x, -146, buttonWidth, 88, Math.min(layout.bodyFont, 36));
      this.drawOverlayButton(button, buttonWidth, 88, this.nicknameSelection === index);
    }
  }

  private openNicknameEditor(): void {
    if (this.homeTransition || this.homeOverlay !== 'settings' || this.nicknameEditing) return;
    this.settingsSelection = 3;
    this.nicknameEditing = true;
    this.nicknameSelection = 0;
    this.nicknameEditor.string = this.playerNickname;
    this.nicknameHint.string = '保存后用于新成绩，已有成绩昵称不变';
    this.settingsGroup.active = false;
    this.nicknameGroup.active = true;
    this.updateNicknameEditorUI();
    this.nicknameEditor.focus();
  }

  private onNicknameInputBegan(): void {
    this.nicknameInputActive = true;
    this.nicknameSelection = 0;
    this.updateNicknameEditorUI();
  }

  private onNicknameInputEnded(): void {
    this.nicknameInputActive = false;
  }

  private onNicknameInputReturn(): void {
    if (!this.nicknameEditing) return;
    // Completing text entry selects Save; it never submits a half-composed name.
    this.nicknameEditor.blur();
    this.nicknameInputActive = false;
    this.nicknameSelection = 1;
    this.updateNicknameEditorUI();
    if (sys.isBrowser) this.focusGameCanvas();
  }

  private moveNicknameSelection(direction: number): void {
    this.nicknameEditor.blur();
    this.nicknameInputActive = false;
    this.nicknameSelection = (this.nicknameSelection + (direction > 0 ? 1 : -1) + 3) % 3;
    this.updateNicknameEditorUI();
    if (sys.isBrowser) this.focusGameCanvas();
  }

  private activateNicknameSelection(): void {
    if (this.nicknameSelection === 0) this.nicknameEditor.focus();
    else if (this.nicknameSelection === 1) this.saveNicknameEditor();
    else this.closeNicknameEditor();
  }

  private saveNicknameEditor(): void {
    if (!this.nicknameEditing) return;
    const value = normalizeNickname(this.nicknameEditor.string);
    if (!value || Array.from(value).length > NICKNAME_MAX_LENGTH) {
      this.nicknameHint.string = value ? '昵称最多 12 个字符，请缩短后保存' : '昵称不能为空';
      this.updateNicknameEditorUI();
      return;
    }
    const persistent = saveNickname(sys.localStorage, value);
    this.playerNickname = value;
    this.nicknameStatus = persistent ? '昵称已保存 · 仅影响新成绩' : '昵称本次生效 · 本机存储不可用';
    this.closeNicknameEditor();
  }

  private closeNicknameEditor(): void {
    if (!this.nicknameEditing) return;
    this.nicknameEditor.blur();
    this.nicknameInputActive = false;
    this.nicknameEditing = false;
    this.nicknameGroup.active = false;
    this.settingsGroup.active = true;
    this.settingsSelection = 3;
    this.updateSettingsUI();
    if (sys.isBrowser) this.focusGameCanvas();
    this.lastActionAt = Date.now();
  }

  private updateSettingsUI(): void {
    if (!this.settingsGraphics) {
      return;
    }
    const layout = this.panelLayout('settings');
    this.drawProjectorPanel(this.settingsGraphics, layout);
    this.drawSettingToggle(this.soundToggle, COPY.sound, this.soundEnabled, this.homeOverlay === 'settings' && this.settingsSelection === 0);
    this.drawSettingToggle(this.motionToggle, COPY.reducedMotion, this.reducedMotion, this.homeOverlay === 'settings' && this.settingsSelection === 1);
    this.updateTestModeUI();
    this.drawOverlayButton(this.nicknameButton, layout.buttonWidth, layout.buttonHeight, this.homeOverlay === 'settings' && this.settingsSelection === 3);
    this.nicknameButton.label.node.setPosition(0, 20, 0);
    this.nicknameButton.label.node.getComponent(UITransform)?.setContentSize(layout.buttonWidth - 100, 42);
    this.nicknameButton.label.fontSize = layout.bodyFont - 6;
    this.nicknameLabel.node.setPosition(0, -24, 0);
    this.nicknameLabel.node.getComponent(UITransform)?.setContentSize(layout.buttonWidth - 80, 32);
    this.nicknameLabel.string = this.playerNickname;
    this.nicknameLabel.color = this.nicknameButton.label.color;
    this.nicknameLabel.enableWrapText = false;
    this.setNamedLabelText(this.settingsGroup, 'SettingsHint', this.nicknameStatus || COPY.settingsHint);
    this.drawOverlayButton(this.settingsCloseButton, layout.buttonWidth, layout.buttonHeight, this.homeOverlay === 'settings' && this.settingsSelection === 4, true);
  }

  private updateSkinShopUI(): void {
    if (!this.skinsGraphics) {
      return;
    }
    this.drawOverlayBackdrop(this.skinsGraphics, 620, 1240);
    this.skinsCoinLabel.string = `${COPY.coins}  ${this.coins}`;
    SKIN_IDS.forEach((skinId, index) => {
      const card = this.skinCards.get(skinId);
      if (card) {
        this.drawSkinCard(card, SKINS[skinId], index);
      }
    });
    this.drawOverlayButton(
      this.skinsCloseButton,
      420,
      82,
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
    g.roundRect(-SKIN_CARD_WIDTH * 0.5, -SKIN_CARD_HEIGHT * 0.5, SKIN_CARD_WIDTH, SKIN_CARD_HEIGHT, 28);
    g.fill();
    g.strokeColor = selected
      ? this.rgb(current.accentColor, 230)
      : new Color(panelText.r, panelText.g, panelText.b, focused ? 188 : 62);
    g.lineWidth = selected ? 4 : focused ? 3 : 2;
    g.roundRect(-SKIN_CARD_WIDTH * 0.5, -SKIN_CARD_HEIGHT * 0.5, SKIN_CARD_WIDTH, SKIN_CARD_HEIGHT, 28);
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
    const fitScale = this.compactPortrait
      ? Math.min(1, Math.max(0.86, (this.visibleWidth - 56) / SKIN_CARD_WIDTH))
      : 1;
    const scale = fitScale * (focused && !this.reducedMotion ? 1.018 : 1);
    card.node.setScale(scale, scale, 1);
  }

  private buildRecordGapHud(): void {
    const hud = this.hudLayout();
    this.recordGapNode = this.makeNode('RecordGap', this.gameplayHudGroup);
    this.recordGapNode.addComponent(UITransform).setContentSize(hud.recordGapWidth, hud.recordGapHeight);
    this.anchorTopLeft(this.recordGapNode, hud.recordGapTop, hud.edgeInset);
    this.recordGapGraphics = this.recordGapNode.addComponent(Graphics);
    this.recordGapLabel = this.makeLabel('RecordGapText', this.recordGapNode, '', hud.captionSize,
      Color.WHITE, hud.recordGapWidth - 24, hud.recordGapHeight - 8);
    this.recordGapLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.recordGapLabel.enableWrapText = false;
    this.recordGapLabel.overflow = Label.Overflow.SHRINK;
  }

  private drawGameplayHudCards(): void {
    const skin = this.currentSkin();
    const panelText = skin.id === 'minimal-stack' ? this.rgb(skin.textColor) : this.textOnButton(skin.panelColor);
    const layout = this.hudLayout();
    const drawCard = (graphics: Graphics): void => {
      graphics.clear();
      graphics.fillColor = this.rgb(skin.panelColor);
      graphics.roundRect(-layout.cardWidth / 2, -layout.cardHeight / 2, layout.cardWidth, layout.cardHeight, 24);
      graphics.fill();
      graphics.strokeColor = this.rgb(skin.accentColor, 112);
      graphics.lineWidth = 2;
      graphics.roundRect(-layout.cardWidth / 2, -layout.cardHeight / 2, layout.cardWidth, layout.cardHeight, 24);
      graphics.stroke();
    };
    drawCard(this.scoreHudGraphics);
    drawCard(this.bestHudGraphics);
    this.scoreCaptionLabel.color = this.bestCaptionLabel.color = new Color(panelText.r, panelText.g, panelText.b, 225);
    this.scoreLabel.color = this.bestLabel.color = panelText;
    const gap = this.recordGapGraphics;
    gap.clear();
    gap.fillColor = this.rgb(skin.panelColor);
    gap.roundRect(-layout.recordGapWidth / 2, -layout.recordGapHeight / 2,
      layout.recordGapWidth, layout.recordGapHeight, 12);
    gap.fill();
    this.recordGapLabel.color = panelText;
    this.drawPauseHudButton();
  }

  private buildPauseUI(): void {
    this.pauseButton = this.makeNode('PauseButton', this.hudSafeRoot);
    this.pauseButton.addComponent(UITransform).setContentSize(132, 80);
    this.anchorTopRight(this.pauseButton, 64, 64);
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
    this.pausePanelGraphics = this.pauseGroup.addComponent(Graphics);
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
    const layout = this.hudLayout();
    const g = this.pauseButtonGraphics;
    g.clear();
    g.fillColor = this.rgb(skin.buttonColor);
    g.roundRect(-layout.pauseWidth / 2, -layout.pauseHeight / 2, layout.pauseWidth, layout.pauseHeight, 28);
    g.fill();
    g.strokeColor = this.rgb(skin.accentColor, 118);
    g.lineWidth = 2;
    g.roundRect(-layout.pauseWidth / 2, -layout.pauseHeight / 2, layout.pauseWidth, layout.pauseHeight, 28);
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
    const layout = this.panelLayout('pause');
    this.drawOverlayButton({ node, graphics, label }, layout.buttonWidth, layout.buttonHeight, selected);
  }

  private buildTestModeToggle(): void {
    const ui = this.makeOverlayButton(this.settingsGroup, 'TestModeToggle', '', 500, 104, 0, -165);
    this.testModeToggle = ui.node;
    this.testModeToggleGraphics = ui.graphics;
    this.testModeToggleLabel = ui.label;
    this.updateTestModeUI();
  }

  private updateTestModeUI(): void {
    if (!this.testModeToggleGraphics) return;
    this.drawSettingToggle({ node: this.testModeToggle, graphics: this.testModeToggleGraphics, label: this.testModeToggleLabel },
      COPY.perfectTest, this.testModeEnabled, this.homeOverlay === 'settings' && this.settingsSelection === 2);
    this.testModeBadgeLabel.node.active = this.testModeEnabled && (this.phase === 'playing' || this.phase === 'dropping');
    this.updateRecordGap();
  }

  private showReadyScreen(): void {
    this.phase = 'ready';
    this.updateWorldComposition();
    this.phaseBeforePause = 'playing';
    this.world3D.reset();
    this.homeOverlay = 'none';
    this.homeSelection = 0;
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
    this.leaderboardGroup.active = false;
    this.gameplayHudGroup.active = false;
    this.homeBestLabel.node.active = true;
    this.updateBestLabel();
    this.updateCoinLabels();
    this.updateAudioPrompt();
    this.applyThemeToUI();
    void this.loadHomeLeaderboardPreview();
    this.drawFrame();
  }

  private startGame(): void {
    if (this.homeTransition || !this.audioReady || this.homeOverlay !== 'none') {
      this.updateAudioPrompt();
      return;
    }
    this.beginScreenTransition(() => this.startGameImmediately(), 'game-start');
  }

  private startGameImmediately(): void {
    Tween.stopAllByTarget(this.resultGroup);
    Tween.stopAllByTarget(this.pauseGroup);
    Tween.stopAllByTarget(this.scoreLabel.node);
    this.scoreLabel.node.setScale(1, 1, 1);
    this.resetPerfectFeedback();
    this.world3D.reset();
    this.phase = 'playing';
    this.roundId = `round-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    this.roundWasTest = this.testModeEnabled;
    this.roundNickname = this.playerNickname;
    // Keep the record being chased fixed until the next round starts.
    this.roundBestScore = this.bestScore;
    this.updateWorldComposition();
    this.phaseBeforePause = 'playing';
    this.updateTestModeUI();
    this.score = 0;
    this.roundPerfectCount = 0;
    this.lastEarnedCoins = 0;
    this.resetPerfectChain();
    this.moveSpeed = INITIAL_MOVE_SPEED;
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
    this.leaderboardGroup.active = false;
    this.pauseButton.active = true;
    this.gameplayHudGroup.active = true;
    this.homeBestLabel.node.active = false;
    this.setScore(0, false);
    this.spawnMovingBlock();
    this.playSound('start', 0.8);
  }

  private spawnMovingBlock(): void {
    const previous = this.stack[this.stack.length - 1];
    const level = previous.level + 1;
    this.moveAxis = level % 2 === 1 ? 'x' : 'z';
    this.moveDirection = level % 4 < 2 ? 1 : -1;
    const speedProgress = Math.max(0, this.score - MOVE_SPEED_WARMUP_SCORE);
    this.moveSpeed = Math.min(MAX_MOVE_SPEED, INITIAL_MOVE_SPEED + speedProgress * MOVE_SPEED_PER_SCORE);

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

    const placed = this.current;
    const previous = this.stack[this.stack.length - 1];
    const currentCenter = this.moveAxis === 'x' ? placed.x : placed.z;
    const previousCenter = this.moveAxis === 'x' ? previous.x : previous.z;
    const currentSize = this.moveAxis === 'x' ? placed.width : placed.depth;
    const previousSize = this.moveAxis === 'x' ? previous.width : previous.depth;
    const delta = currentCenter - previousCenter;

    this.phase = 'dropping';
    this.world3D.beginDrop(placed, previous);

    // A fully separated footprint cannot land on the target block. Resolve the
    // failure now so the result does not wait for the rigid body to fall away.
    if (Math.abs(delta) >= (currentSize + previousSize) * 0.5) {
      this.failPlacement(placed, delta);
    }
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
    let fragment: FallingPiece | null = null;
    if (isPerfect) {
      if (this.moveAxis === 'x') {
        placed.x = previous.x;
      } else {
        placed.z = previous.z;
      }
      this.perfectStreak += 1;
      this.growPerfectBlock(placed);
    } else {
      this.resetPerfectChain();
      fragment = this.trimBlockAndCreateFragment(placed, previous, delta);
      this.addTrauma(0.2);
      this.playCutSound();
    }

    this.world3D.settle(placed);
    if (isPerfect) {
      this.handlePerfectPlacement(placed);
    } else if (fragment) {
      // Shrink the retained collider before enabling the detached rigid body.
      this.world3D.spawnFragment(fragment, this.moveAxis, delta);
    }

    this.stack.push(placed);
    this.current = null;
    this.phase = 'playing';
    this.setScore(this.score + 1, true);
    this.targetCameraY = -Math.max(0, (this.stack.length - 5) * BLOCK_HEIGHT);
    this.spawnDelay = isPerfect ? 0.095 : CUT_PREVIEW_SECONDS;
  }

  private growPerfectBlock(placed: StackBlock): boolean {
    if (this.perfectStreak < PERFECT_GROWTH_START_STREAK) {
      return false;
    }
    const previousWidth = placed.width;
    const previousDepth = placed.depth;
    placed.width = Math.min(PERFECT_GROWTH_MAX_SIZE, placed.width + PERFECT_GROWTH_STEP);
    placed.depth = Math.min(PERFECT_GROWTH_MAX_SIZE, placed.depth + PERFECT_GROWTH_STEP);
    return placed.width > previousWidth || placed.depth > previousDepth;
  }

  private trimBlockAndCreateFragment(placed: StackBlock, previous: StackBlock, delta: number): FallingPiece | null {
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
      return fragment;
    }
    return null;
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
      this.world3D.pulsePerfect(placed);
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
    this.updateWorldComposition();
    this.pauseButton.active = false;
    this.pauseGroup.active = false;
    this.resultDelay = this.reducedMotion
      ? REDUCED_MOTION_GAME_OVER_REVEAL_SECONDS
      : GAME_OVER_REVEAL_SECONDS;
    this.restartLock = this.resultDelay + 0.25;
    this.resetPerfectChain();
    this.perfectFrames = [];
    this.resetPerfectFeedback();
    this.addTrauma(0.72);
    this.flashAlpha = this.reducedMotion ? 0 : 0.28;
    this.playSound('end', 0.82);
  }

  private showResultScreen(): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.recordLeaderboardResult();
    this.updateWorldComposition();
    this.resultSelection = 0;
    this.updateResultFocus();
    this.pauseButton.active = false;
    this.gameplayHudGroup.active = false;
    this.testModeBadgeLabel.node.active = false;
    this.homeBestLabel.node.active = false;
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
      ? `测试成绩 · ${COPY.best} ${this.bestScore}`
      : `${COPY.best}  ${this.bestScore}`;
    this.resultCoinLabel.string = this.testModeEnabled
      ? COPY.noTestCoins
      : `${COPY.perfectReward} ${this.roundPerfectCount} 次  ·  ${COPY.coins} +${this.lastEarnedCoins}`;
    this.resultBestLabel.lineHeight = Math.round(this.resultBestLabel.fontSize * 1.2);
    this.resultGroup.active = true;
    this.resultGroup.setScale(this.reducedMotion ? 1 : 0.86, this.reducedMotion ? 1 : 0.86, 1);
    tween(this.resultGroup)
      .to(this.reducedMotion ? 0.01 : 0.24, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private setScore(value: number, animate: boolean): void {
    this.score = value;
    this.scoreLabel.string = `${this.score}`;
    this.updateRecordGap();
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

  private updateRecordGap(): void {
    this.recordGapNode.active = !(this.roundWasTest || this.testModeEnabled);
    if (!this.recordGapNode.active) return;

    const remaining = this.roundBestScore - this.score;
    this.recordGapLabel.string = this.roundBestScore === 0
      ? (this.score === 0 ? '创造你的首个纪录' : `首个纪录：${this.score} 层`)
      : remaining > 0
        ? `距最高还差 ${remaining} 层`
        : remaining === 0
          ? '已追平 · 再叠 1 层破纪录'
          : `已超过最高 ${-remaining} 层`;
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
    const streak = Math.max(1, intensity);
    const energy = this.perfectFeedbackEnergy(streak);
    const amount = perfect ? Math.min(88, Math.round(17 + streak * 4 + energy * 4)) : 8;
    const accentColor = new Color(255, 238, 166, 255);
    const contactCenter = perfect ? this.project(block.x, block.z, block.level) : null;
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
      // The fixed camera faces +X/+Z. Rear seams are hidden by the upper block;
      // UI particles have no depth test, so emit only along the two visible edges.
      const edgePosition = -1 + 2 * (index + 0.5) / amount;
      const worldX = block.x + (perfect ? (index % 2 === 0 ? 1 : edgePosition) * block.width * 0.5 : 0);
      const worldZ = block.z + (perfect ? (index % 2 === 0 ? edgePosition : 1) * block.depth * 0.5 : 0);
      const projectedEdge = perfect ? this.project(worldX, worldZ, block.level) : null;
      const dx = projectedEdge && contactCenter ? projectedEdge.x - contactCenter.x : Math.cos(angle);
      const dy = projectedEdge && contactCenter ? projectedEdge.y - contactCenter.y : Math.sin(angle);
      const directionLength = perfect ? Math.max(1, Math.hypot(dx, dy)) : 1;
      this.sparks.push({
        x: 0,
        y: 0,
        worldX,
        worldZ,
        level: perfect ? block.level : block.level + 1,
        vx: dx / directionLength * speed,
        vy: dy / directionLength * speed + 30,
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
        // UI effects have no depth test: a filled contact plane would paint over the block.
        fillAlpha: 0,
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
    this.drawOverlay();
    if (!this.homeTransition) this.drawScreenDimmer(this.screenDimmerAlpha());
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
      const center = this.project(frame.block.x, frame.block.z, frame.block.level);
      const basePoints = this.blockPlanePoints(frame.block, frame.block.level);
      const baseHalfWidth = Math.max(...basePoints.map(point => Math.abs(point.x - center.x)));
      const horizontalRoom = Math.max(0, this.visibleWidth * 0.5 - 32 - Math.abs(center.x) - baseHalfWidth);
      const maxExpansion = Math.min(frame.maxExpansion, horizontalRoom);
      const startExpansion = Math.min(frame.startExpansion, maxExpansion);
      const expansionPixels = startExpansion + (maxExpansion - startExpansion) * eased;
      const projectedScale = Math.max(1, baseHalfWidth * 2 / (frame.block.width + frame.block.depth));
      const expansion = expansionPixels / projectedScale;
      const outline: StackBlock = {
        ...frame.block,
        width: frame.block.width + expansion,
        depth: frame.block.depth + expansion,
      };
      const points = this.blockPlanePoints(outline, frame.block.level);
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
      // Only the front contact edges are visible; don't draw rear edges through
      // the upper block's top face (these effects live on a depthless UI layer).
      g.moveTo(points[1].x, points[1].y);
      g.lineTo(points[2].x, points[2].y);
      g.lineTo(points[3].x, points[3].y);
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
      const anchor = this.project(spark.worldX, spark.worldZ, spark.level);
      const x = anchor.x + spark.x;
      const y = anchor.y + spark.y;
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

  private drawOverlay(): void {
    this.homePanelGraphics.clear();
    this.pausePanelGraphics.clear();
    this.resultPanelGraphics.clear();
    const g = this.phase === 'ready' ? this.homePanelGraphics
      : this.phase === 'paused' ? this.pausePanelGraphics : this.resultPanelGraphics;
    const skin = this.currentSkin();
    // Overlay screens own their backdrop; the home panel must not show through.
    if (this.phase === 'ready' && this.homeOverlay !== 'none') {
      return;
    }
    if (this.phase === 'ready') {
      const layout = this.homeLayout();
      const { panelWidth, panelHeight } = layout;
      const homeX = layout.panelX;
      g.fillColor = new Color(0, 0, 0, 28);
      g.roundRect(homeX - panelWidth * 0.5 + 8, -panelHeight * 0.5 - 10, panelWidth, panelHeight, 44);
      g.fill();
      g.fillColor = this.rgb(skin.panelColor);
      g.roundRect(homeX - panelWidth * 0.5, -panelHeight * 0.5, panelWidth, panelHeight, 44);
      g.fill();
      g.strokeColor = this.rgb(skin.accentColor, 96);
      g.lineWidth = 2;
      g.roundRect(homeX - panelWidth * 0.5, -panelHeight * 0.5, panelWidth, panelHeight, 44);
      g.stroke();
      g.fillColor = this.rgb(skin.accentColor);
      g.roundRect(homeX - 28, panelHeight * 0.5 - 44, 56, 5, 2.5);
      g.fill();
    } else if (this.phase === 'paused') {
      this.drawProjectorPanel(g, this.panelLayout('pause'));
    } else if (this.phase === 'gameover') {
      this.drawProjectorPanel(g, this.panelLayout('result'));
    }
  }

  private topPoints(block: StackBlock): Point2[] {
    return this.blockPlanePoints(block, block.level + 1);
  }

  private blockPlanePoints(block: StackBlock, level: number): Point2[] {
    const halfW = block.width * 0.5;
    const halfD = block.depth * 0.5;
    return [
      this.project(block.x - halfW, block.z - halfD, level),
      this.project(block.x + halfW, block.z - halfD, level),
      this.project(block.x + halfW, block.z + halfD, level),
      this.project(block.x - halfW, block.z + halfD, level),
    ];
  }

  private project(x: number, z: number, level: number): Point2 {
    return this.world3D.projectToUI(x, z, level, this.effectsGraphics.node);
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
      this.startPromptLabel.string = this.audioReady
        ? (this.wideLayout ? COPY.startRemote : COPY.start)
        : COPY.loadingAudio;
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
    if (this.homeOverlay !== 'none' || this.phase === 'ready') {
      return;
    }
    this.tryPrimaryAction();
  }

  private onTestModeToggle(): void {
    this.settingsSelection = 2;
    this.toggleTestMode();
  }

  private onSettingsButton(): void {
    this.homeSelection = 2;
    this.openHomeOverlay('settings');
  }

  private onLeaderboardButton(): void {
    this.homeSelection = 1;
    this.openHomeOverlay('leaderboard');
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
    // Retain purchased themes and rendering assets without a public shop entry.
    if (overlay === 'skins') return;
    if (this.homeTransition || this.phase !== 'ready' || this.homeOverlay !== 'none') {
      return;
    }
    this.beginScreenTransition(() => this.openHomeOverlayImmediately(overlay),
      overlay === 'leaderboard' ? 'leaderboard-open' : 'menu-open');
  }

  private openHomeOverlayImmediately(overlay: Exclude<HomeOverlay, 'none' | 'skins'>): void {
    this.homeLeaderboardPreviewRequest += 1;
    this.homeOverlay = overlay;
    this.lastActionAt = Date.now();
    this.startGroup.active = false;
    this.settingsGroup.active = overlay === 'settings';
    this.skinsGroup.active = false;
    this.leaderboardGroup.active = overlay === 'leaderboard';

    const group = overlay === 'settings' ? this.settingsGroup : this.leaderboardGroup;
    if (overlay === 'settings') {
      this.settingsSelection = 0;
      this.updateSettingsUI();
    } else {
      this.leaderboardScroll?.stopAutoScroll();
      this.leaderboardScroll?.scrollToTop(0);
      this.leaderboardScrollTarget = 0;
      void this.loadLeaderboard();
    }
    Tween.stopAllByTarget(group);
    group.setScale(1, 1, 1);
  }

  private closeHomeOverlay(): void {
    if (this.homeTransition || this.phase !== 'ready' || this.homeOverlay === 'none') {
      return;
    }
    this.beginScreenTransition(() => this.closeHomeOverlayImmediately(),
      this.homeOverlay === 'leaderboard' ? 'leaderboard-close' : 'menu-close');
  }

  private closeHomeOverlayImmediately(): void {
    Tween.stopAllByTarget(this.settingsGroup);
    Tween.stopAllByTarget(this.skinsGroup);
    Tween.stopAllByTarget(this.leaderboardGroup);
    this.leaderboardRequest += 1;
    this.leaderboardScroll?.stopAutoScroll();
    this.leaderboardGroup.active = false;
    this.leaderboardGroup.setScale(1, 1, 1);
    this.settingsGroup.active = false;
    this.skinsGroup.active = false;
    this.settingsGroup.setScale(1, 1, 1);
    this.skinsGroup.setScale(1, 1, 1);
    this.homeOverlay = 'none';
    this.startGroup.active = true;
    this.lastActionAt = Date.now();
    this.updateHomeMenuFocus();
    this.updateSettingsUI();
    this.updateSkinShopUI();
    void this.loadHomeLeaderboardPreview();
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

  private moveHomeSelection(direction: number): void {
    this.homeSelection = (this.homeSelection + (direction > 0 ? 1 : -1) + 3) % 3;
    this.updateHomeMenuFocus();
    this.drawFrame();
  }

  private activateHomeSelection(): void {
    if (this.homeSelection === 1) {
      this.openHomeOverlay('leaderboard');
    } else if (this.homeSelection === 2) {
      this.openHomeOverlay('settings');
    } else {
      this.tryPrimaryAction();
    }
  }

  private moveSettingsSelection(direction: number): void {
    this.settingsSelection = (this.settingsSelection + (direction > 0 ? 1 : -1) + 5) % 5;
    this.updateSettingsUI();
  }

  private activateSettingsSelection(): void {
    if (this.settingsSelection === 0) {
      this.toggleSoundSetting();
    } else if (this.settingsSelection === 1) {
      this.toggleMotionSetting();
    } else if (this.settingsSelection === 2) {
      this.toggleTestMode();
    } else if (this.settingsSelection === 3) {
      this.openNicknameEditor();
    } else {
      this.closeHomeOverlay();
    }
  }

  private moveSkinSelection(horizontal: number, vertical: number): void {
    const itemCount = SKIN_IDS.length + 1;
    const direction = Math.abs(vertical) >= Math.abs(horizontal)
      ? (vertical < 0 ? 1 : -1)
      : (horizontal > 0 ? 1 : -1);
    this.skinSelection = (this.skinSelection + direction + itemCount) % itemCount;
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
    this.updateWorldComposition();
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
    this.gameplayHudGroup.active = false;
    this.testModeBadgeLabel.node.active = false;
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
    this.updateWorldComposition();
    this.world3D.setPaused(false);
    this.pauseButton.active = true;
    this.gameplayHudGroup.active = true;
    this.testModeBadgeLabel.node.active = this.testModeEnabled;
    this.resumeInputLock = 0.14;
    this.lastActionAt = Date.now();
  }

  private returnToHome(): void {
    if (this.homeTransition || (this.phase !== 'paused' && this.phase !== 'gameover')) {
      return;
    }
    if (this.phase === 'gameover' && this.restartLock > 0) return;
    this.beginScreenTransition(() => this.showReadyScreen(), 'home-return');
  }

  private beginScreenTransition(swap: () => void, kind: ScreenTransitionKind = 'game-start'): void {
    if (this.homeTransition) return;
    if (this.reducedMotion) {
      swap();
      this.drawFrame();
      return;
    }
    this.world3D.setPaused(true);
    const fromDim = this.screenDimmerAlpha();
    const toDim = kind === 'game-start' ? 0
      : kind === 'menu-open' || kind === 'leaderboard-open' ? MENU_DIMMER_MAX_ALPHA : this.homeDimmerAlpha();
    this.homeTransition = {
      kind,
      elapsed: 0, swapped: false, swap,
      outSeconds: kind === 'leaderboard-close' ? 0.28 : HOME_FADE_OUT_SECONDS,
      inSeconds: kind === 'leaderboard-open' ? 0.28 : HOME_FADE_IN_SECONDS, pauseOnComplete: false,
      direction: kind === 'menu-close' || kind === 'leaderboard-close' || kind === 'home-return' ? -1 : 1,
      fadeWorld: kind === 'game-start' || kind === 'home-return', fromDim, toDim,
    };
    this.captureTransitionViews();
    this.transitionBlocker.active = true;
    // Keep residual impact flashes out of navigation, without touching physics.
    this.effectsGraphics.clear();
    this.effectsGraphics.node.active = false;
    this.drawScreenDimmer(fromDim);
  }

  private captureTransitionViews(): void {
    this.restoreTransitionViews();
    const panels = [this.startGroup, this.settingsGroup, this.leaderboardGroup, this.pauseGroup, this.resultGroup];
    const nodes = [...panels, this.gameplayHudGroup, this.pauseButton, this.testModeBadgeLabel.node, this.perfectLabel.node];
    for (const node of nodes) {
      if (!node?.isValid || !node.active) continue;
      const slide = panels.indexOf(node) >= 0;
      if (slide) {
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
      }
      const widget = node.getComponent(Widget);
      widget?.updateAlignment();
      const position = new Vec3(node.position.x, node.position.y, node.position.z);
      const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
      this.transitionViews.push({ node, widget, position, widgetEnabled: widget?.enabled ?? false, opacity, baseOpacity: opacity.opacity, slide });
      if (widget) widget.enabled = false;
    }
  }

  private presentTransitionViews(visibility: number, offset: number): void {
    for (const item of this.transitionViews) {
      if (!item.node.isValid) continue;
      item.opacity.opacity = Math.round(item.baseOpacity * visibility);
      const drawer = item.node === this.leaderboardGroup
        && (this.homeTransition?.kind === 'leaderboard-open' || this.homeTransition?.kind === 'leaderboard-close');
      // The full ranking grows into view from the home preview's right-hand position.
      const distance = drawer ? projectorLeaderboardPreviewLayout(this.visibleWidth, this.visibleHeight).panelX : MENU_SLIDE_DISTANCE;
      item.node.setPosition(item.position.x + (item.slide ? offset * distance / MENU_SLIDE_DISTANCE : 0), item.position.y, item.position.z);
    }
  }

  private restoreTransitionViews(): void {
    for (const item of this.transitionViews) {
      if (!item.node.isValid) continue;
      item.node.setPosition(item.position);
      item.opacity.opacity = item.baseOpacity;
      if (item.widget?.isValid) {
        item.widget.enabled = item.widgetEnabled;
        if (item.widgetEnabled) item.widget.updateAlignment();
      }
    }
    this.transitionViews = [];
  }

  private homeDimmerAlpha(): number {
    const style = this.currentSkin().visualStyle;
    return style === 'pastel' || style === 'nature' ? 8 : 18;
  }

  private screenDimmerAlpha(): number {
    if (this.phase === 'ready') return this.homeOverlay === 'none' ? this.homeDimmerAlpha() : MENU_DIMMER_MAX_ALPHA;
    return this.phase === 'paused' || this.phase === 'gameover' ? MENU_DIMMER_MAX_ALPHA : 0;
  }

  private drawScreenDimmer(alpha: number): void {
    const g = this.screenDimmer;
    g.clear();
    g.fillColor = new Color(2, 8, 18, Math.round(Math.max(0, Math.min(MENU_DIMMER_MAX_ALPHA, alpha))));
    g.rect(-this.visibleWidth / 2, -this.visibleHeight / 2, this.visibleWidth, this.visibleHeight);
    g.fill();
  }

  private updateHomeTransition(dt: number): void {
    const transition = this.homeTransition;
    if (!transition) return;
    transition.elapsed += dt;
    if (!transition.swapped && transition.elapsed >= transition.outSeconds) {
      // Hide only the tower before a reset can change its geometry or framing.
      if (transition.fadeWorld) this.world3D.setPresentationOpacity(0);
      this.restoreTransitionViews();
      transition.swapped = true;
      transition.swap();
      // reset() can re-enable the solver. No gameplay runs during the reveal.
      this.world3D.setPaused(true);
      this.drawFrame();
      this.captureTransitionViews();
    }
    const progress = transition.swapped
      ? Math.min(1, (transition.elapsed - transition.outSeconds) / transition.inSeconds)
      : Math.min(1, transition.elapsed / transition.outSeconds);
    const visibility = transition.swapped ? 1 - Math.pow(1 - progress, 3) : 1 - progress * progress * progress;
    const offset = transition.direction * MENU_SLIDE_DISTANCE * (1 - visibility) * (transition.swapped ? 1 : -1);
    this.presentTransitionViews(visibility, offset);
    if (transition.fadeWorld) this.world3D.setPresentationOpacity(visibility);
    const total = Math.min(1, transition.elapsed / (transition.outSeconds + transition.inSeconds));
    const eased = total * total * (3 - 2 * total);
    this.drawScreenDimmer(transition.fromDim + (transition.toDim - transition.fromDim) * eased);
    if (transition.elapsed >= transition.outSeconds + transition.inSeconds) {
      this.finishScreenTransition();
    }
  }

  private finishScreenTransition(): void {
    const transition = this.homeTransition;
    this.restoreTransitionViews();
    this.homeTransition = null;
    this.transitionBlocker.active = false;
    this.effectsGraphics.node.active = true;
    this.world3D.setPresentationOpacity(1);
    this.world3D.setPaused(this.phase === 'paused');
    if (transition?.pauseOnComplete && (this.phase === 'playing' || this.phase === 'dropping')) this.pauseGame();
    this.lastActionAt = Date.now();
    this.drawScreenDimmer(this.screenDimmerAlpha());
  }

  private updateResultFocus(): void {
    const layout = this.panelLayout('result');
    this.drawOverlayButton(this.resultRestartButton, layout.buttonWidth, layout.buttonHeight, this.resultSelection === 0);
    this.drawOverlayButton(this.resultHomeButton, layout.buttonWidth, layout.buttonHeight, this.resultSelection === 1);
  }

  private activateResultSelection(): void {
    if (this.resultSelection === 1) this.returnToHome();
    else this.tryRestartAction();
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
    this.heldKeys.clear();
    if (this.homeTransition) {
      this.homeTransition.pauseOnComplete = true;
      this.updateHomeTransition(this.homeTransition.outSeconds + this.homeTransition.inSeconds);
      return;
    }
    this.pauseGame();
  }

  private onKeyDown(event: EventKeyboard): void {
    if (sys.isBrowser) return;
    this.handleKeyDownCode(event.keyCode as number);
  }

  private handleKeyDownCode(keyCode: number): void {
    if (this.nicknameEditing) {
      if (this.heldKeys.has(keyCode)) return;
      this.heldKeys.add(keyCode);
      if (keyCode === KeyCode.ESCAPE || REMOTE_BACK_KEY_CODES.has(keyCode)) this.closeNicknameEditor();
      else if (!this.nicknameInputActive) {
        if (keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.ARROW_LEFT) this.moveNicknameSelection(-1);
        else if (keyCode === KeyCode.ARROW_DOWN || keyCode === KeyCode.ARROW_RIGHT) this.moveNicknameSelection(1);
        else if (keyCode === KeyCode.ENTER || keyCode === KeyCode.SPACE || REMOTE_CONFIRM_KEY_CODES.has(keyCode)) this.activateNicknameSelection();
      }
      return;
    }
    const isBackKey = keyCode === KeyCode.ESCAPE
      || keyCode === 8
      || REMOTE_BACK_KEY_CODES.has(keyCode);
    const isPauseToggle = isBackKey || keyCode === KeyCode.KEY_P;
    const isMenuNavigation = keyCode === KeyCode.ARROW_UP
      || keyCode === KeyCode.ARROW_DOWN
      || keyCode === KeyCode.ARROW_LEFT
      || keyCode === KeyCode.ARROW_RIGHT
      || keyCode === KeyCode.KEY_A
      || keyCode === KeyCode.KEY_D
      || keyCode === KeyCode.KEY_W
      || keyCode === KeyCode.KEY_S;
    const isConfirmKey = keyCode === KeyCode.SPACE
      || keyCode === KeyCode.ENTER
      || REMOTE_CONFIRM_KEY_CODES.has(keyCode);
    const isActionKey = isConfirmKey
      || keyCode === KeyCode.KEY_R
      || keyCode === KeyCode.KEY_T
      || keyCode === KeyCode.KEY_K
      || isPauseToggle
      || isMenuNavigation;
    if (!isActionKey || this.heldKeys.has(keyCode)) {
      return;
    }
    this.heldKeys.add(keyCode);
    // Remember keys pressed during a transition until keyup, so a held remote
    // confirm cannot fall through to the freshly revealed round.
    if (this.homeTransition) return;

    if (this.phase === 'gameover') {
      if (isBackKey) this.returnToHome();
      else if (isMenuNavigation) {
        this.resultSelection = 1 - this.resultSelection;
        this.updateResultFocus();
      } else if (isConfirmKey) this.activateResultSelection();
      else if (keyCode === KeyCode.KEY_R) this.tryRestartAction();
      return;
    }

    if (this.homeOverlay !== 'none') {
      if (isBackKey) {
        this.closeHomeOverlay();
      } else if (this.homeOverlay === 'leaderboard') {
        if (keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.KEY_W) this.moveLeaderboardSelection(-1);
        else if (keyCode === KeyCode.ARROW_DOWN || keyCode === KeyCode.KEY_S) this.moveLeaderboardSelection(1);
        else if (keyCode === KeyCode.ARROW_LEFT || keyCode === KeyCode.KEY_A) this.changeLeaderboardPage(-1);
        else if (keyCode === KeyCode.ARROW_RIGHT || keyCode === KeyCode.KEY_D) this.changeLeaderboardPage(1);
        else if (isConfirmKey) this.activateLeaderboardSelection();
      } else if (this.homeOverlay === 'settings') {
        if (keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.KEY_W) {
          this.moveSettingsSelection(-1);
        } else if (keyCode === KeyCode.ARROW_DOWN || keyCode === KeyCode.KEY_S) {
          this.moveSettingsSelection(1);
        } else if (keyCode === KeyCode.ARROW_LEFT
          || keyCode === KeyCode.ARROW_RIGHT
          || keyCode === KeyCode.KEY_A
          || keyCode === KeyCode.KEY_D
          || isConfirmKey) {
          this.activateSettingsSelection();
        }
      } else {
        if (keyCode === KeyCode.ARROW_LEFT || keyCode === KeyCode.KEY_A) {
          this.moveSkinSelection(-1, 0);
        } else if (keyCode === KeyCode.ARROW_RIGHT || keyCode === KeyCode.KEY_D) {
          this.moveSkinSelection(1, 0);
        } else if (keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.KEY_W) {
          this.moveSkinSelection(0, 1);
        } else if (keyCode === KeyCode.ARROW_DOWN || keyCode === KeyCode.KEY_S) {
          this.moveSkinSelection(0, -1);
        } else if (isConfirmKey) {
          this.activateSkinSelection();
        }
      }
      return;
    }

    if (this.phase === 'ready') {
      if (keyCode === KeyCode.KEY_K || keyCode === KeyCode.ARROW_RIGHT || keyCode === KeyCode.KEY_D) {
        this.onLeaderboardButton();
      } else if (keyCode === KeyCode.KEY_T) {
        this.toggleTestMode();
      } else if (isMenuNavigation) {
        const forward = keyCode === KeyCode.ARROW_DOWN
          || keyCode === KeyCode.ARROW_RIGHT
          || keyCode === KeyCode.KEY_S
          || keyCode === KeyCode.KEY_D;
        this.moveHomeSelection(forward ? 1 : -1);
      } else if (isConfirmKey) {
        this.activateHomeSelection();
      }
      return;
    }

    if (isPauseToggle) {
      this.togglePause();
      return;
    }

    if (this.phase === 'paused') {
      if (keyCode === KeyCode.KEY_R) {
        this.restartPausedGame();
      } else if (keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.KEY_W) {
        this.selectPauseOption(-1);
      } else if (keyCode === KeyCode.ARROW_DOWN || keyCode === KeyCode.KEY_S) {
        this.selectPauseOption(1);
      } else if (isConfirmKey) {
        this.activatePauseSelection();
      }
      return;
    }

    if (keyCode === KeyCode.KEY_T) {
      this.toggleTestMode();
    } else if (isConfirmKey) {
      this.tryPrimaryAction();
    } else if (keyCode === KeyCode.KEY_R) {
      this.tryRestartAction();
    }
  }

  private onKeyUp(event: EventKeyboard): void {
    if (sys.isBrowser) return;
    this.heldKeys.delete(event.keyCode as number);
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

    if (this.nicknameEditing) {
      if (eastJustPressed || optionsJustPressed) this.closeNicknameEditor();
      else if (menuAxisJustPressed) this.moveNicknameSelection(Math.abs(menuAxisY) >= Math.abs(menuAxisX)
        ? (menuAxisY < 0 ? 1 : -1) : (menuAxisX > 0 ? 1 : -1));
      else if (southJustPressed) this.activateNicknameSelection();
      return;
    }
    if (this.homeTransition) return;
    if (this.phase === 'gameover') {
      if (eastJustPressed) this.returnToHome();
      else if (menuAxisJustPressed) {
        this.resultSelection = 1 - this.resultSelection;
        this.updateResultFocus();
      } else if (southJustPressed) this.activateResultSelection();
      return;
    }

    if (this.homeOverlay !== 'none') {
      if (eastJustPressed || optionsJustPressed) {
        this.closeHomeOverlay();
        return;
      }
      if (menuAxisJustPressed) {
        if (this.homeOverlay === 'leaderboard') {
          if (Math.abs(menuAxisY) > 0.55) this.moveLeaderboardSelection(menuAxisY > 0 ? -1 : 1);
          else if (Math.abs(menuAxisX) > 0.55) this.changeLeaderboardPage(menuAxisX > 0 ? 1 : -1);
        } else if (this.homeOverlay === 'settings' && Math.abs(menuAxisY) > 0.55) {
          this.moveSettingsSelection(menuAxisY > 0 ? -1 : 1);
        } else if (this.homeOverlay === 'skins') {
          this.moveSkinSelection(menuAxisX, menuAxisY);
        }
      }
      if (southJustPressed) {
        if (this.homeOverlay === 'leaderboard') {
          this.activateLeaderboardSelection();
        } else if (this.homeOverlay === 'settings') {
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

    if (this.phase === 'ready') {
      if (menuAxisJustPressed && menuAxisX > 0.55 && Math.abs(menuAxisX) > Math.abs(menuAxisY)) {
        this.onLeaderboardButton();
      } else if (menuAxisJustPressed) {
        const forward = Math.abs(menuAxisY) >= Math.abs(menuAxisX)
          ? menuAxisY < 0
          : menuAxisX > 0;
        this.moveHomeSelection(forward ? 1 : -1);
      } else if (northJustPressed) {
        this.toggleTestMode();
      } else if (southJustPressed || optionsJustPressed) {
        this.activateHomeSelection();
      }
      return;
    }

    if (southJustPressed) {
      this.tryPrimaryAction();
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

    this.updateSettingsUI();
  }

  private consumeActionDebounce(): boolean {
    if (this.homeTransition) return false;
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
    if (this.homeTransition) this.updateHomeTransition(this.homeTransition.outSeconds + this.homeTransition.inSeconds);
    this.resizeStage();
  }

  private resizeStage(): void {
    const visible = view.getVisibleSize();
    const frame = screen.windowSize;
    this.visibleWidth = visible.width;
    this.visibleHeight = visible.height;
    // Keep Canvas and its child UI camera at the visible center, including on
    // fixed-height wide screens, so native EditBox text aligns with canvas UI.
    this.node.setPosition(visible.width / 2, visible.height / 2, this.node.position.z);
    const frameAspect = frame.width / Math.max(1, frame.height);
    this.wideLayout = frameAspect >= WIDE_LAYOUT_MIN_ASPECT
      && frame.width >= WIDE_LAYOUT_MIN_FRAME_WIDTH;
    this.tvLayout = frameAspect >= TV_LAYOUT_MIN_ASPECT
      && frame.width >= TV_LAYOUT_MIN_FRAME_WIDTH;
    this.compactPortrait = !this.wideLayout
      && frame.width < COMPACT_PORTRAIT_MAX_FRAME_WIDTH
      && frame.width < frame.height;
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
    this.homeTowerPreviewNode?.setPosition(
      this.wideLayout ? -WIDE_PANEL_CENTER_X * 0.86 : 0,
      -this.visibleHeight * 0.215,
      0,
    );
    this.hudSafeRoot?.getComponent(UITransform)?.setContentSize(visible);
    this.hudSafeRoot?.getComponent(SafeArea)?.updateArea();
    this.applyResponsiveLayout();
    this.updateWorldComposition();

    this.controlsLabel.node.active = true;
    this.precisionTipLabel.node.active = false;
    this.skinsCloseButton.label.fontSize = this.tvLayout ? 32 : 30;
    this.skinsCloseButton.label.lineHeight = Math.round(this.skinsCloseButton.label.fontSize * 1.2);
    this.updateAudioPrompt();
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
    this.playerNickname = loadNickname(sys.localStorage);
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

      this.ownedSkins = new Set<SkinId>(FREE_SKIN_IDS);
      const ownedRaw = sys.localStorage.getItem(OWNED_SKINS_STORAGE_KEY);
      if (ownedRaw) {
        const owned = JSON.parse(ownedRaw) as unknown;
        if (Array.isArray(owned)) {
          for (const skinId of owned) {
            if (skinId === 'sunset') {
              this.ownedSkins.add('cyber-neon');
            } else if (typeof skinId === 'string' && (SKIN_IDS as readonly string[]).indexOf(skinId) >= 0) {
              this.ownedSkins.add(skinId as SkinId);
            }
          }
        }
      }
      const selected = sys.localStorage.getItem(SELECTED_SKIN_STORAGE_KEY);
      const migratedSelected = selected === 'sunset' ? 'cyber-neon' : selected;
      this.selectedSkinId = typeof migratedSelected === 'string'
        && (SKIN_IDS as readonly string[]).indexOf(migratedSelected) >= 0
        && this.ownedSkins.has(migratedSelected as SkinId)
        ? migratedSelected as SkinId
        : DEFAULT_SKIN_ID;
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
      this.ownedSkins = new Set<SkinId>(FREE_SKIN_IDS);
      this.selectedSkinId = DEFAULT_SKIN_ID;
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
    this.bestLabel.string = `${this.bestScore}`;
    if (this.homeBestLabel?.isValid) {
      this.homeBestLabel.string = `${this.bestScore}`;
    }
  }

  private updateCoinLabels(): void {
    if (this.homeCoinLabel?.isValid) {
      this.homeCoinLabel.string = `${this.coins}`;
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
      resources.load(`skins/${SKINS[skinId].backgroundResource ?? skinId}/spriteFrame`, SpriteFrame, (error, frame) => {
        if (error || !frame) {
          if (this.selectedSkinId === skinId) {
            this.notifyBrowserReady();
          }
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
          this.notifyBrowserReady();
        }
      });
    }
  }

  private notifyBrowserReady(): void {
    if (this.browserReadyNotified || !sys.isBrowser || typeof window === 'undefined') {
      return;
    }
    this.browserReadyNotified = true;
    // Resource callbacks precede rendering. Keep the cover through a complete
    // themed frame, including first-use material preparation.
    director.once(Director.EVENT_AFTER_DRAW, () => {
      director.once(Director.EVENT_AFTER_DRAW, () => {
        if (this.isValid) window.dispatchEvent(new Event('stack-game-ready'));
      });
    });
  }

  private loadBlockVisualAssets(): void {
    for (const skinId of SKIN_IDS) {
      const name = SKINS[skinId].blockAtlasResource;
      resources.load(`skins/${name}/spriteFrame`, SpriteFrame, (error, frame) => {
        if (error || !frame || !this.isValid) return;
        this.blockAtlases.set(skinId, frame);
        if (this.selectedSkinId === skinId) {
          this.applyWorld3DTheme();
          this.drawFrame();
        }
      });
    }
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
    this.backgroundSprite.spriteFrame = this.selectedSkinId === 'minimal-stack'
      ? null : this.skinBackgrounds.get(this.selectedSkinId) ?? null;
    this.applyWorld3DTheme();
  }

  private applyWorld3DTheme(): void {
    if (!this.world3D) {
      return;
    }
    const skin = this.currentSkin();
    const softToy = skin.id === 'minimal-stack';
    const blockColors = Array.from({ length: softToy ? 8 : 12 }, (_, level) => (
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
      background: softToy ? null : this.skinBackgrounds.get(this.selectedSkinId) ?? null,
      backgroundColor: softToy ? new Color(210, 188, 181) : undefined,
      softToy,
      blockColors,
      materialTextures,
      blockAtlas: softToy ? null : this.blockAtlases.get(this.selectedSkinId) ?? null,
      blockAtlasOrder: skin.blockAtlasOrder,
      tintAtlas: skin.visualStyle === 'minimal',
      sharpEdges: false,
      outlineColor: skin.visualStyle === 'cyber' ? new Color(166, 245, 255, 255) : undefined,
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

  private minimalLayerColor(level: number): RGB {
    // A discrete pastel rainbow makes each successful layer easy to count.
    const stops: readonly RGB[] = [
      [153, 199, 199], [179, 211, 178], [222, 217, 153], [236, 200, 161],
      [225, 175, 180], [197, 177, 208], [175, 185, 214], [161, 203, 214],
    ];
    return stops[Math.floor(Math.abs(level)) % stops.length];
  }

  private blockColorsForSkin(
    skin: SkinDefinition,
    level: number,
    opacity: number,
    hueOverride?: number,
  ): { top: Color; left: Color; right: Color; outline: Color } {
    const paletteColor = skin.visualStyle === 'minimal'
      ? this.minimalLayerColor(level)
      : skin.blockPalette?.[Math.abs(level) % skin.blockPalette.length];
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
    if (skin.visualStyle === 'pastel' || skin.visualStyle === 'minimal') {
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
    const panelText = skin.id === 'minimal-stack' ? text : this.textOnButton(skin.panelColor);

    this.setNamedLabelColor(this.startGroup, 'Title', panelText);
    this.setNamedLabelColor(this.startGroup, 'Eyebrow', panelText);
    this.setNamedLabelColor(this.startGroup, 'Subtitle', panelText);
    this.startPromptLabel.color = this.textOnButton(skin.buttonColor);
    this.controlsLabel.color = panelText;
    this.precisionTipLabel.color = panelText;
    this.homeCoinLabel.color = panelText;
    this.homeBestLabel.color = panelText;
    this.homeBestCaption.color = new Color(panelText.r, panelText.g, panelText.b, 215);
    this.homeCoinCaption.color = new Color(panelText.r, panelText.g, panelText.b, 215);
    const badge = this.homeBestBadge.getComponent(Graphics);
    badge.clear();
    const home = this.homeLayout();
    for (const x of [-home.statOffset, home.statOffset]) {
      badge.fillColor = new Color(panelText.r, panelText.g, panelText.b, 16);
      badge.roundRect(x - home.statWidth / 2, -home.statsHeight / 2, home.statWidth, home.statsHeight, 22);
      badge.fill();
      badge.strokeColor = this.rgb(skin.accentColor, 80);
      badge.lineWidth = 1.5;
      badge.roundRect(x - home.statWidth / 2, -home.statsHeight / 2, home.statWidth, home.statsHeight, 22);
      badge.stroke();
    }
    this.testModeBadgeLabel.color = text;
    this.perfectLabel.color = skin.id === 'minimal-stack' ? new Color(114, 66, 84) : this.rgb(skin.accentColor);

    this.resultTitleLabel.color = panelText;
    this.resultScoreLabel.color = panelText;
    this.resultBestLabel.color = new Color(panelText.r, panelText.g, panelText.b, 220);
    this.resultCoinLabel.color = panelText;
    this.setNamedLabelColor(this.resultGroup, 'Restart', new Color(panelText.r, panelText.g, panelText.b, 235));

    this.pauseButtonLabel.color = this.textOnButton(skin.buttonColor);
    this.setNamedLabelColor(this.pauseGroup, 'PauseTitle', panelText);
    this.setNamedLabelColor(this.pauseGroup, 'PauseHint', new Color(panelText.r, panelText.g, panelText.b, 225));
    this.setNamedLabelColor(this.pauseGroup, 'PauseControls', new Color(panelText.r, panelText.g, panelText.b, 225));

    this.setNamedLabelColor(this.settingsGroup, 'SettingsTitle', panelText);
    this.setNamedLabelColor(this.settingsGroup, 'SettingsHint', new Color(panelText.r, panelText.g, panelText.b, 225));
    this.setNamedLabelColor(this.skinsGroup, 'SkinsTitle', panelText);
    this.skinsCoinLabel.color = this.rgb(skin.accentColor);
    this.skinsHintLabel.color = new Color(panelText.r, panelText.g, panelText.b, 176);

    this.updateHomeMenuFocus();
    this.drawGameplayHudCards();
    this.updateTestModeUI();
    this.updatePauseMenuFocus();
    this.updateSettingsUI();
    this.updateSkinShopUI();
    this.updateResultFocus();
    this.updateLeaderboardUI();
    this.updateHomeLeaderboardPreviewUI();
  }

  private setNamedLabelColor(parent: Node, childName: string, color: Color): void {
    const label = parent.getChildByName(childName)?.getComponent(Label);
    if (label) {
      label.color = color;
    }
  }

  private setNamedLabelText(parent: Node, childName: string, text: string): void {
    const label = parent.getChildByName(childName)?.getComponent(Label);
    if (label) label.string = text;
  }

  private rgb(value: RGB, alpha = 255): Color {
    return new Color(value[0], value[1], value[2], Math.round(alpha));
  }

  private textOnButton(background: RGB): Color {
    const linear = background.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    return luminance > 0.179 ? new Color(0, 0, 0, 255) : new Color(255, 255, 255, 255);
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

  private panelCenterX(panelWidth = HOME_PANEL_WIDTH): number {
    if (!this.wideLayout) {
      return 0;
    }
    const safeInset = this.tvLayout ? TV_OVERSCAN_INSET : 24;
    const effectiveWidth = Math.min(panelWidth, Math.max(0, this.visibleWidth - safeInset * 2));
    const leftmostSafeCenter = -this.visibleWidth * 0.5 + safeInset + effectiveWidth * 0.5;
    return Math.max(WIDE_PANEL_CENTER_X, leftmostSafeCenter);
  }

  private homeLayout() {
    // Keep a single readable composition in reference units. A 4:3 projector
    // needs the split layout too; do not inherit the gameplay's 16:9 breakpoint.
    const width = this.visibleWidth;
    const height = this.visibleHeight;
    const split = width / height >= 1.2;
    const focusWidth = Math.min(width, 2400);
    const safe = split ? Math.max(64, focusWidth * 0.04) : 28;
    const panelWidth = split ? Math.min(820, (focusWidth - safe * 2) * 0.42) : Math.min(640, width - safe * 2);
    const panelHeight = Math.min(1100, height - 128);
    const verticalScale = Math.min(1, panelHeight / 1100);
    const panelX = split ? -focusWidth / 2 + safe + panelWidth / 2 : 0;
    const contentWidth = panelWidth - (split ? 128 : 80);
    const buttonWidth = Math.min(640, contentWidth);
    const statWidth = (buttonWidth - 24) / 2;
    return {
      split, panelX, panelWidth, panelHeight, contentWidth,
      titleY: 354 * verticalScale, titleSize: Math.min(split ? 140 : 112, contentWidth / 4.5) * verticalScale,
      subtitleY: 230 * verticalScale, statsY: 90 * verticalScale,
      statsHeight: 140 * verticalScale, statWidth, statOffset: (statWidth + 24) / 2,
      buttonWidth, buttonHeight: 116 * verticalScale,
      startY: -90 * verticalScale, rankY: -242 * verticalScale, settingsY: -394 * verticalScale,
      footerY: -505 * verticalScale,
    };
  }

  private applyHomeLayout(): void {
    const layout = this.homeLayout();
    const place = (label: Label, x: number, y: number, width: number, height: number, size: number) => {
      this.setCenteredNodeLayout(label.node, x, y);
      label.node.getComponent(UITransform)?.setContentSize(width, height);
      label.fontSize = size;
      label.lineHeight = Math.round(size * 1.2);
      label.enableWrapText = false;
    };
    const { panelX: x, contentWidth: width } = layout;
    const title = this.startGroup.getChildByName('Title')?.getComponent(Label);
    const subtitle = this.startGroup.getChildByName('Subtitle')?.getComponent(Label);
    const eyebrow = this.startGroup.getChildByName('Eyebrow')?.getComponent(Label);
    if (title) {
      place(title, x, layout.titleY, width, layout.titleSize * 1.3, layout.titleSize);
      title.isBold = true;
    }
    if (subtitle) place(subtitle, x, layout.subtitleY, width, 56, layout.split ? 36 : 28);
    if (eyebrow) place(eyebrow, x, layout.panelHeight / 2 - 76, width, 42, layout.split ? 30 : 25);
    this.setCenteredNodeLayout(this.homeBestBadge, x, layout.statsY);
    this.homeBestBadge.getComponent(UITransform)?.setContentSize(layout.buttonWidth, layout.statsHeight);
    const valueSize = layout.split ? 64 : 56;
    for (const [caption, value, offset] of [
      [this.homeBestCaption, this.homeBestLabel, -layout.statOffset],
      [this.homeCoinCaption, this.homeCoinLabel, layout.statOffset],
    ] as [Label, Label, number][]) {
      place(caption, x + offset, layout.statsY + 38, layout.statWidth - 24, 40, layout.split ? 30 : 26);
      place(value, x + offset, layout.statsY - 22, layout.statWidth - 24, 80, valueSize);
    }
    for (const [node, label, y] of [
      [this.startButton, this.startPromptLabel, layout.startY],
      [this.leaderboardButton, this.leaderboardButtonLabel, layout.rankY],
      [this.settingsButton, this.settingsButtonLabel, layout.settingsY],
    ] as [Node, Label, number][]) {
      this.setCenteredNodeLayout(node, x, y);
      node.getComponent(UITransform)?.setContentSize(layout.buttonWidth, layout.buttonHeight);
      label.node.getComponent(UITransform)?.setContentSize(layout.buttonWidth - 112, layout.buttonHeight - 12);
      label.fontSize = layout.split ? 48 : 40;
      label.lineHeight = Math.round(label.fontSize * 1.2);
      label.isBold = true;
      label.enableWrapText = false;
    }
    this.controlsLabel.string = layout.split ? '↑ ↓ 选择 · → 排行 · 确认进入' : '轻点按钮，即刻开叠';
    place(this.controlsLabel, x, layout.footerY, width, 48, layout.split ? 30 : 24);
    this.precisionTipLabel.node.active = false;
    this.updateHomeLeaderboardPreviewUI();
  }

  private panelLayout(kind: 'settings' | 'leaderboard' | 'pause' | 'result') {
    return projectorPanelLayout(this.visibleWidth, this.visibleHeight, kind);
  }

  private hudLayout() {
    return projectorHudLayout(this.visibleWidth, this.visibleHeight);
  }

  private drawProjectorPanel(g: Graphics, layout: ReturnType<typeof projectorPanelLayout>): void {
    const { panelX: x, panelWidth: width, panelHeight: height } = layout;
    const skin = this.currentSkin();
    g.clear();
    g.fillColor = new Color(0, 0, 0, 28);
    g.roundRect(x - width / 2 + 8, -height / 2 - 10, width, height, 44);
    g.fill();
    g.fillColor = this.rgb(skin.panelColor);
    g.roundRect(x - width / 2, -height / 2, width, height, 44);
    g.fill();
    g.strokeColor = this.rgb(skin.accentColor, 96);
    g.lineWidth = 2;
    g.roundRect(x - width / 2, -height / 2, width, height, 44);
    g.stroke();
    g.fillColor = this.rgb(skin.accentColor);
    g.roundRect(x - 28, height / 2 - 44, 56, 5, 2.5);
    g.fill();
  }

  private layoutPanelLabel(parent: Node, name: string, x: number, y: number, width: number, height: number, fontSize: number, bold = false): void {
    const label = parent.getChildByName(name)?.getComponent(Label);
    if (!label) return;
    this.setCenteredNodeLayout(label.node, x, y);
    label.node.getComponent(UITransform)?.setContentSize(width, height);
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.2);
    label.isBold = bold;
    label.enableWrapText = false;
  }

  private layoutPanelButton(ui: ButtonUI, x: number, y: number, width: number, height: number, fontSize: number): void {
    this.setCenteredNodeLayout(ui.node, x, y);
    ui.node.getComponent(UITransform)?.setContentSize(width, height);
    ui.label.node.getComponent(UITransform)?.setContentSize(width - 112, height - 12);
    ui.label.fontSize = fontSize;
    ui.label.lineHeight = Math.round(fontSize * 1.2);
    ui.label.isBold = true;
    ui.label.enableWrapText = false;
  }

  private applyProjectorLayout(): void {
    const hud = this.hudLayout();
    for (const [index, card, caption, value] of [
      [0, this.scoreHudCard, this.scoreCaptionLabel, this.scoreLabel],
      [1, this.bestHudCard, this.bestCaptionLabel, this.bestLabel],
    ] as [number, Node, Label, Label][]) {
      card.getComponent(UITransform)?.setContentSize(hud.cardWidth, hud.cardHeight);
      this.setTopLeftLayout(card, hud.top, hud.edgeInset + index * (hud.cardWidth + hud.gap));
      caption.node.setPosition(0, hud.cardHeight / 2 - 32, 0);
      caption.node.getComponent(UITransform)?.setContentSize(hud.cardWidth - 24, 42);
      caption.fontSize = hud.captionSize;
      caption.lineHeight = Math.round(hud.captionSize * 1.2);
      value.node.setPosition(0, -20, 0);
      value.node.getComponent(UITransform)?.setContentSize(hud.cardWidth - 24, hud.valueSize * 1.2);
      value.fontSize = hud.valueSize;
      value.lineHeight = Math.round(hud.valueSize * 1.2);
      value.isBold = true;
    }
    this.pauseButton.getComponent(UITransform)?.setContentSize(hud.pauseWidth, hud.pauseHeight);
    this.setTopRightLayout(this.pauseButton, hud.top, hud.edgeInset);
    this.pauseButtonLabel.node.getComponent(UITransform)?.setContentSize(hud.pauseWidth - 24, hud.pauseHeight - 12);
    this.pauseButtonLabel.fontSize = hud.captionSize + 4;
    this.pauseButtonLabel.lineHeight = Math.round(this.pauseButtonLabel.fontSize * 1.2);
    this.pauseButtonLabel.isBold = true;
    this.recordGapNode.getComponent(UITransform)?.setContentSize(hud.recordGapWidth, hud.recordGapHeight);
    this.setTopLeftLayout(this.recordGapNode, hud.recordGapTop, hud.edgeInset);
    this.recordGapLabel.node.getComponent(UITransform)?.setContentSize(hud.recordGapWidth - 24, hud.recordGapHeight - 8);
    this.recordGapLabel.fontSize = hud.captionSize;
    this.recordGapLabel.lineHeight = Math.round(hud.captionSize * 1.2);
    this.setTopLeftLayout(this.testModeBadgeLabel.node, hud.recordGapTop, hud.edgeInset);

    for (const [kind, group, title, hint, buttons] of [
      ['settings', this.settingsGroup, 'SettingsTitle', 'SettingsHint', [this.soundToggle, this.motionToggle,
        { node: this.testModeToggle, graphics: this.testModeToggleGraphics, label: this.testModeToggleLabel }, this.nicknameButton, this.settingsCloseButton]],
      ['pause', this.pauseGroup, 'PauseTitle', 'PauseHint', [
        { node: this.resumeButton, graphics: this.resumeButtonGraphics, label: this.resumeButtonLabel },
        { node: this.restartButton, graphics: this.restartButtonGraphics, label: this.restartButtonLabel },
        { node: this.homeButton, graphics: this.homeButtonGraphics, label: this.homeButtonLabel }]],
      ['result', this.resultGroup, 'ResultTitle', '', [this.resultRestartButton, this.resultHomeButton]],
      ['leaderboard', this.leaderboardGroup, 'LeaderboardTitle', 'LeaderboardStatus', []],
    ] as ['settings' | 'pause' | 'result' | 'leaderboard', Node, string, string, ButtonUI[]][]) {
      const layout = this.panelLayout(kind);
      this.layoutPanelLabel(group, title, layout.panelX, layout.titleY, layout.contentWidth, layout.titleSize * 1.3, layout.titleSize, true);
      if (hint) this.layoutPanelLabel(group, hint, layout.panelX, layout.subtitleY, layout.contentWidth, 52, layout.captionFont + 4);
      buttons.forEach((button, index) => this.layoutPanelButton(button, layout.panelX, layout.buttonYs[index],
        layout.buttonWidth, layout.buttonHeight, kind === 'leaderboard' ? layout.bodyFont - 6 : layout.bodyFont));
    }
    const pause = this.panelLayout('pause');
    const controls = this.pauseGroup.getChildByName('PauseControls')?.getComponent(Label);
    if (controls) controls.string = '↑ ↓ 选择　·　确认键进入';
    this.layoutPanelLabel(this.pauseGroup, 'PauseControls', pause.panelX, pause.footerY, pause.contentWidth, 44, pause.captionFont);

    const result = this.panelLayout('result');
    this.layoutPanelLabel(this.resultGroup, 'ResultScore', result.panelX, result.scoreY, result.contentWidth, result.scoreSize * 1.25, result.scoreSize, true);
    this.layoutPanelLabel(this.resultGroup, 'ResultBest', result.panelX, result.bestY, result.contentWidth, 54, result.bodyFont - 6);
    this.layoutPanelLabel(this.resultGroup, 'ResultCoins', result.panelX, result.rewardY, result.contentWidth, 52, result.captionFont + 4);
    const restartHint = this.resultGroup.getChildByName('Restart')?.getComponent(Label);
    if (restartHint) restartHint.string = '↑ ↓ 选择　·　确认键进入';
    this.layoutPanelLabel(this.resultGroup, 'Restart', result.panelX, result.footerY, result.contentWidth, 44, result.captionFont);

    const rank = this.panelLayout('leaderboard');
    const titleWidth = rank.contentWidth - 100;
    this.layoutPanelLabel(this.leaderboardGroup, 'LeaderboardTitle', -50, rank.titleY, titleWidth, rank.titleSize * 1.3, rank.titleSize, true);
    const title = this.leaderboardGroup.getChildByName('LeaderboardTitle')?.getComponent(Label);
    if (title) title.horizontalAlign = Label.HorizontalAlign.LEFT;
    const status = this.leaderboardGroup.getChildByName('LeaderboardStatus')?.getComponent(Label);
    if (status) status.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.layoutPanelLabel(this.leaderboardGroup, 'LeaderboardStatus', 45, rank.subtitleY,
      rank.contentWidth - 90, 52, rank.captionFont + 4);
    this.leaderboardButtons.forEach(button => {
      this.layoutPanelButton(button, rank.contentWidth / 2 - 38, rank.titleY, 76, 76, 48);
      button.label.node.getComponent(UITransform).setContentSize(60, 64);
    });
    this.layoutPanelLabel(this.leaderboardGroup, 'LeaderboardRankHeading', rank.rankX - 10, rank.headerY, rank.rankWidth, 40, rank.captionFont);
    this.layoutPanelLabel(this.leaderboardGroup, 'LeaderboardColumns', rank.detailX - 10, rank.headerY, rank.detailWidth, 40, rank.captionFont);
    this.layoutPanelLabel(this.leaderboardGroup, 'LeaderboardScoreHeading', rank.scoreX - 10, rank.headerY, rank.scoreWidth, 40, rank.captionFont);
    this.layoutPanelLabel(this.leaderboardGroup, 'LeaderboardEmpty', rank.panelX, 40, rank.contentWidth, 180, rank.bodyFont - 4);
    // Error/loading messages may need two lines, unlike the compact table labels.
    this.leaderboardEmpty.enableWrapText = true;
    this.layoutPanelLabel(this.leaderboardGroup, 'LeaderboardScrollHint', rank.panelX, rank.footerY, rank.contentWidth, 44, rank.captionFont);
    this.layoutLeaderboardList();
    this.updateNicknameEditorUI();
  }

  private applyResponsiveLayout(): void {
    const panelX = this.panelCenterX();
    this.applyHomeLayout();
    this.applyProjectorLayout();

    this.setCenteredLayout(this.skinsGroup, 'SkinsTitle', panelX, 545);
    this.setCenteredLayout(this.skinsGroup, 'SkinsCoins', panelX, 450);
    SKIN_IDS.forEach((skinId, index) => {
      const card = this.skinCards.get(skinId);
      if (card) {
        this.setCenteredNodeLayout(card.node, panelX, 305 - index * 136);
      }
    });
    this.setCenteredLayout(this.skinsGroup, 'SkinsHint', panelX, -475);
    this.setCenteredNodeLayout(this.skinsCloseButton.node, panelX, -510);

  }

  private updateWorldComposition(): void {
    if (!this.world3D) {
      return;
    }
    const contextualScreen = this.phase === 'ready'
      || this.phase === 'paused'
      || this.phase === 'falling'
      || this.phase === 'gameover';
    const home = this.phase === 'ready';
    this.world3D.setHomePresentation(home);
    this.world3D.setCompositionOffset(this.homeLayout().split && contextualScreen ? -4.3 : 0);
    const showOverview = this.phase === 'falling' || this.phase === 'gameover' || this.phase === 'paused';
    const topLevel = this.stack[this.stack.length - 1]?.level ?? 0;
    this.world3D.setOverview(showOverview ? topLevel : null);
  }

  private setCenteredLayout(parent: Node, childName: string, x: number, y: number): void {
    const child = parent.getChildByName(childName);
    if (child) {
      this.setCenteredNodeLayout(child, x, y);
    }
  }

  private setCenteredNodeLayout(node: Node, x: number, y: number): void {
    const widget = node.getComponent(Widget);
    if (!widget) {
      return;
    }
    widget.horizontalCenter = x;
    widget.verticalCenter = y;
    widget.updateAlignment();
  }

  private setTopCenterLayout(node: Node, top: number, horizontalCenter: number): void {
    const widget = node.getComponent(Widget);
    if (!widget) {
      return;
    }
    widget.top = top;
    widget.horizontalCenter = horizontalCenter;
    widget.updateAlignment();
  }

  private setTopLeftLayout(node: Node, top: number, left: number): void {
    const widget = node.getComponent(Widget);
    if (!widget) {
      return;
    }
    widget.top = top;
    widget.left = left;
    widget.updateAlignment();
  }

  private setTopRightLayout(node: Node, top: number, right: number): void {
    const widget = node.getComponent(Widget);
    if (!widget) {
      return;
    }
    widget.top = top;
    widget.right = right;
    widget.updateAlignment();
  }
}
