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
  Sprite,
  input,
  instantiate,
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
import { DEBUG } from 'cc/env';
import { UIRouter } from './ui/UIRouter';
import { UIInputRouter } from './ui/UIInputRouter';
import { UILayoutService } from './ui/UILayoutService';
import { UITransitionController } from './ui/UITransitionController';
import { StackUIPresenter } from './ui/StackUIPresenter';
import { StackGameUIAdapter } from './ui/StackGameUIAdapter';
import { PerformanceProbe } from './ui/PerformanceProbe';
import { StackUIRenderer } from './ui/StackUIRenderer';
import { HomeScreenView, HomeScreenModel, GameplayHudView, GameplayHudModel, SettingsScreenView, SettingsScreenModel, NicknameDialogView, NicknameDialogModel, LeaderboardScreenView, LeaderboardScreenModel, PauseScreenView, PauseScreenModel, ResultScreenView, ResultScreenModel, ReviveDialogView, ReviveDialogModel, LeaderboardRowModel } from './ui/ScreenViews';
import { StackUIViewBindings } from './StackUIViewBindings';
import { StackUIVisual } from './ui/StackUIVisual';
import { StackWorld3D } from './StackWorld3D';
import { CREAM_STYLE, RGB, CreamVariant } from './CreamStyle';
import { loadCreamAppearance, saveCreamAppearance } from './CreamAppearance';
import { androidGameKey, browserGameKey } from './RemoteInput';
import {
  DEFAULT_NICKNAME, LeaderboardEntry, LeaderboardRepository, LocalLeaderboardRepository,
  NICKNAME_MAX_LENGTH, leaderboardTitle, leaderboardTier, loadNickname, normalizeNickname, saveNickname,
} from './Leaderboard';
import { projectorHudLayout, projectorLeaderboardPreviewLayout, projectorPanelLayout } from './ProjectorLayout';
import { Stamina, STAMINA_CAP } from './Stamina';
import { RewardAdController } from './ui/RewardAdController';
import { RewardAdClient } from './RewardAdClient';
import { encodeRewardQr } from './RewardQrEncoder';

const { ccclass, property } = _decorator;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const BASE_SIZE = 5;
const REVIVE_BLOCK_SCALE = 0.5;
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
const MENU_DIMMER_MAX_ALPHA = 32;
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
const INITIAL_COINS = 100;
const BEST_SCORE_STORAGE_KEY = 'wxstack-best-score';
const COIN_STORAGE_KEY = 'wxstack-coins';
const INITIAL_COIN_GRANT_STORAGE_KEY = 'wxstack-initial-coins-v1';
const SOUND_STORAGE_KEY = 'wxstack-sound-enabled';
const REDUCED_MOTION_STORAGE_KEY = 'wxstack-reduced-motion';
const NATURAL_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MAJOR_NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'] as const;
const REMOTE_CONFIRM_KEY_CODES = new Set([23]);
const REMOTE_BACK_KEY_CODES = new Set([4, 461, 10009]);

const COPY = {
  eyebrow: '轻松堆叠 · 挑战新高',
  title: '叠高高',
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
  close: '返回首页',
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
type HomeOverlay = 'none' | 'settings' | 'leaderboard';
interface PageModels {home:HomeScreenModel;hud:GameplayHudModel;settings:SettingsScreenModel;nickname:NicknameDialogModel;leaderboard:LeaderboardScreenModel;pause:PauseScreenModel;result:ResultScreenModel;revive:ReviveDialogModel}
type PagePresenters = {[K in keyof PageModels]:StackUIPresenter<PageModels[K]>};

interface ButtonUI {
  node: Node;
  graphics: StackUIVisual;
  label: Label;
}

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

@ccclass('StackGame')
export class StackGame extends Component {
  @property(StackUIViewBindings) ui: StackUIViewBindings = null!;
  private renderedPhase = '';
  private renderedOverlay = '';
  private layoutDirty = true;
  private uiReady = false;
  private uiSuspended = false;
  private frameProjectionCalls = 0;
  private frameProjectionCacheHits = 0;
  private renderer!: StackUIRenderer;
  private pageModels!: PageModels;
  private pagePresenters!: PagePresenters;
  private pageOrder: Array<keyof PageModels> = ['home','hud','settings','nickname','leaderboard','pause','result','revive'];
  private pageRoots!: Record<keyof PageModels,Node>;
  private readonly inputRouter = new UIInputRouter(() => Date.now());
  private readonly router = new UIRouter();
  private readonly layoutService = new UILayoutService(() => this.applyViewportLayout());
  private readonly transitionController = new UITransitionController(locked => { this.router.transitionLocked=locked; if(this.transitionBlocker)this.transitionBlocker.active=locked; });
  private readonly presenter = new StackUIPresenter(() => ({phase:this.phase,overlay:this.homeOverlay}), () => {
    this.drawOverlay(); if(!this.homeTransition)this.drawScreenDimmer(this.screenDimmerAlpha());
  });
  private readonly uiAdapter = new StackGameUIAdapter(() => {
    const stamina=this.stamina.snapshot();
    return {phase:this.phase,score:this.score,bestScore:this.bestScore,coins:this.coins,testMode:this.testModeEnabled,reducedMotion:this.reducedMotion,soundEnabled:this.soundEnabled,nickname:this.playerNickname,stamina:stamina.amount,staminaNextAt:stamina.nextAt};
  }, {startRound:()=>this.startGame(),pauseRound:()=>this.pauseGame(),resumeRound:()=>this.resumeGame(),restartRound:()=>this.startGame(),returnHome:()=>this.returnToHome()});
  private readonly performanceProbe = new PerformanceProbe({enabled:DEBUG && typeof location!=='undefined' && new URLSearchParams(location.search).has('profile'),counterNames:['towerLayers','drawCalls','triangles','activeFx','ringCapacity','ringGrowth','projectionCalls','projectionCacheHits','activeBlocks','looseBlocks','fragmentCapacity','fragmentAvailable','fragmentGrowth','instancing']});

  private world3D!: StackWorld3D;
  private graphics!: Node;
  private audioSource!: AudioSource;
  private audioClips = new Map<string, AudioClip>();
  private hudSafeRoot!: Node;
  private gameplayHudGroup!: Node;
  private scoreHudCard!: Node;
  private scoreHudGraphics!: StackUIVisual;
  private bestHudCard!: Node;
  private bestHudGraphics!: StackUIVisual;
  private scoreCaptionLabel!: Label;
  private bestCaptionLabel!: Label;
  private scoreLabel!: Label;
  private bestLabel!: Label;
  private recordGapNode!: Node;
  private recordGapGraphics!: StackUIVisual;
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
  private testModeToggleGraphics!: StackUIVisual;
  private testModeToggleLabel!: Label;
  private resultGroup!: Node;
  private resultRestartButton!: ButtonUI;
  private resultHomeButton!: ButtonUI;
  private resultReviveButton!: ButtonUI;
  private reviveGroup?: Node;
  private reviveStatusLabel?: Label;
  private reviveQr?: Sprite;
  private reviveCloseButton?: ButtonUI;
  private rewardAdController!: RewardAdController;
  private rewardQrUrl = '';
  private rewardRoundId = '';
  private adNotice = '';
  private reviveUsed = false;
  private roundRewardedPerfectCount = 0;
  private resultSelection = 0;
  private homeSelection = 0;
  private startButton!: Node;
  private startButtonGraphics!: StackUIVisual;
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
  private screenDimmer!: Sprite;
  private homePanelGraphics!: StackUIVisual;
  private pausePanelGraphics!: StackUIVisual;
  private resultPanelGraphics!: StackUIVisual;
  private resultTitleLabel!: Label;
  private resultScoreLabel!: Label;
  private resultBestLabel!: Label;
  private pauseButton!: Node;
  private pauseButtonGraphics!: StackUIVisual;
  private pauseButtonLabel!: Label;
  private pauseGroup!: Node;
  private resumeButton!: Node;
  private resumeButtonGraphics!: StackUIVisual;
  private resumeButtonLabel!: Label;
  private restartButton!: Node;
  private restartButtonGraphics!: StackUIVisual;
  private restartButtonLabel!: Label;
  private homeButton!: Node;
  private homeButtonGraphics!: StackUIVisual;
  private homeButtonLabel!: Label;
  private homeCoinLabel!: Label;
  private homeBestBadge!: Node;
  private settingsButton!: Node;
  private settingsButtonGraphics!: StackUIVisual;
  private settingsButtonLabel!: Label;
  private leaderboardButton!: Node;
  private leaderboardButtonGraphics!: StackUIVisual;
  private leaderboardButtonLabel!: Label;
  private homeLeaderboardPreview!: Node;
  private homeLeaderboardPreviewGraphics!: StackUIVisual;
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
  private settingsGraphics!: StackUIVisual;
  private soundToggle!: ButtonUI;
  private motionToggle!: ButtonUI;
  private settingsCloseButton!: ButtonUI;
  private appearanceToggle!: ButtonUI;
  private creamAppearance: CreamVariant = 'standard';
  private restoreStaminaButton!: ButtonUI;
  private nicknameButton!: ButtonUI;
  private nicknameLabel!: Label;
  private nicknameGroup!: Node;
  private nicknameGraphics!: StackUIVisual;
  private nicknameEditor!: EditBox;
  private nicknameInputGraphics!: StackUIVisual;
  private nicknameHint!: Label;
  private nicknameSaveButton!: ButtonUI;
  private nicknameCancelButton!: ButtonUI;
  private nicknameEditing = false;
  private nicknameInputActive = false;
  private nicknameSelection = 0;
  private playerNickname = DEFAULT_NICKNAME;
  private roundNickname = DEFAULT_NICKNAME;
  private nicknameStatus = '';
  private resultCoinLabel!: Label;
  private leaderboard!: LeaderboardRepository;
  private leaderboardGroup!: Node;
  private leaderboardGraphics!: StackUIVisual;
  private leaderboardStatus!: Label;
  private leaderboardEmpty!: Label;
  private leaderboardPageLabel!: Label;
  private leaderboardRows: { node: Node; graphics: StackUIVisual; rank: Label; player: Label; score: Label; title: Label; detail: Label }[] = [];
  private leaderboardScroll!: ScrollView;
  private leaderboardViewport!: Node;
  private leaderboardContent!: Node;
  private leaderboardScrollTrack!: StackUIVisual;
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

  private score = 0;
  private bestScore = 0;
  private roundBestScore = 0;
  private perfectStreak = 0;
  private perfectToneStep = 0;
  private roundPerfectCount = 0;
  private lastEarnedCoins = 0;
  private coins = INITIAL_COINS;
  private stamina?: Stamina;
  private homeStaminaLabel?: Label;
  private homeStaminaIcons: Sprite[] = [];
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

  private visibleWidth = DESIGN_WIDTH;
  private visibleHeight = DESIGN_HEIGHT;
  private wideLayout = false;
  private tvLayout = false;
  private compactPortrait = false;

  private trauma = 0;
  private shakeTime = 0;
  private shakeX = 0;
  private shakeY = 0;
  private flashAlpha = 0;
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
  private readonly clearBrowserKeys = (): void => { this.inputRouter.clear(); };
  private readonly onAndroidRemoteKey = (code: number, action = 0, repeat = 0): boolean => {
    const normalized = androidGameKey(code);
    if (!normalized || (action !== 0 && action !== 1)) return false;
    if (action === 1) this.inputRouter.keyUp(normalized);
    else if (!repeat) {
      this.inputRouter.keyUp(normalized);
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
    this.inputRouter.keyUp(keyCode);
    this.handleKeyDownCode(keyCode);
  };
  private readonly onBrowserRemoteKeyUp = (event: KeyboardEvent): void => {
    const keyCode = browserGameKey(event, /Android/i.test(navigator.userAgent));
    if (this.nicknameEditing) {
      if (keyCode) this.inputRouter.keyUp(keyCode);
      return;
    }
    if (keyCode) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.inputRouter.keyUp(keyCode);
    }
  };

  onLoad(): void {
    profiler.hideStats();
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_HEIGHT);
    this.initializeAudio();
    this.loadSettings();
    this.stamina = new Stamina(sys.localStorage);
    this.leaderboard = new LocalLeaderboardRepository(sys.localStorage, this.bestScore);
    this.buildStage();
    this.presenter.setVisible(true);
    this.resizeStage();
    this.showReadyScreen();
    this.uiReady = true;
    if(DEBUG && typeof window!=='undefined') (window as any).WxStackDiagnostics={owner:this,start:(label:string)=>this.performanceProbe.start(label),stop:()=>this.performanceProbe.stop(),exportJSON:()=>this.performanceProbe.exportJSON(),adapter:this.uiAdapter};
    this.notifyBrowserReady();
  }

  onEnable(): void {
    if(!this.uiReady)return;
    const resumed=this.uiSuspended;this.uiSuspended=false;
    this.world3D.setPaused(this.phase==='paused'||!!this.homeTransition);
    if(resumed){this.resumeInputLock=0.35;this.inputRouter.clear();this.inputRouter.resetActionClock();this.updateStaminaUI();if(this.phase==='ready')void this.loadHomeLeaderboardPreview();}
    this.leaderboardScroll.node.on(ScrollView.EventType.SCROLLING, this.updateLeaderboardScrollTrack, this);
    this.schedule(this.updateStaminaUI, 1);
    this.graphics.on(Node.EventType.TOUCH_END, this.onPointerAction, this);
    this.startButton.on(Button.EventType.CLICK, this.tryPrimaryAction, this);
    this.testModeToggle.on(Button.EventType.CLICK, this.onTestModeToggle, this);
    this.pauseButton.on(Button.EventType.CLICK, this.onPauseButton, this);
    this.resumeButton.on(Button.EventType.CLICK, this.onResumeButton, this);
    this.restartButton.on(Button.EventType.CLICK, this.onRestartButton, this);
    this.homeButton.on(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultHomeButton.node.on(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultRestartButton.node.on(Button.EventType.CLICK, this.tryRestartAction, this);
    this.resultReviveButton.node.on(Button.EventType.CLICK, this.openRevive, this);
    this.reviveCloseButton.node.on(Button.EventType.CLICK, this.onRewardDialogAction, this);
    this.settingsButton.on(Button.EventType.CLICK, this.onSettingsButton, this);
    this.leaderboardButton.on(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.homeLeaderboardPreview.on(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.soundToggle.node.on(Button.EventType.CLICK, this.onSoundToggle, this);
    this.motionToggle.node.on(Button.EventType.CLICK, this.onMotionToggle, this);
    this.restoreStaminaButton.node.on(Button.EventType.CLICK, this.onRestoreStamina, this);
    this.settingsCloseButton.node.on(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    this.appearanceToggle.node.on(Button.EventType.CLICK, this.onAppearanceToggle, this);
    this.nicknameButton.node.on(Button.EventType.CLICK, this.openNicknameEditor, this);
    this.nicknameSaveButton.node.on(Button.EventType.CLICK, this.saveNicknameEditor, this);
    this.nicknameCancelButton.node.on(Button.EventType.CLICK, this.closeNicknameEditor, this);
    this.nicknameEditor.node.on(EditBox.EventType.EDITING_DID_BEGAN, this.onNicknameInputBegan, this);
    this.nicknameEditor.node.on(EditBox.EventType.EDITING_DID_ENDED, this.onNicknameInputEnded, this);
    this.nicknameEditor.node.on(EditBox.EventType.EDITING_RETURN, this.onNicknameInputReturn, this);
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
    if(!this.uiReady)return;
    this.uiSuspended=true;
    this.leaderboardScroll.stopAutoScroll();
    this.leaderboardScroll.node.off(ScrollView.EventType.SCROLLING, this.updateLeaderboardScrollTrack, this);
    this.closeRevive();
    this.unschedule(this.updateStaminaUI);
    this.graphics.off(Node.EventType.TOUCH_END, this.onPointerAction, this);
    this.startButton.off(Button.EventType.CLICK, this.tryPrimaryAction, this);
    this.testModeToggle.off(Button.EventType.CLICK, this.onTestModeToggle, this);
    this.pauseButton.off(Button.EventType.CLICK, this.onPauseButton, this);
    this.resumeButton.off(Button.EventType.CLICK, this.onResumeButton, this);
    this.restartButton.off(Button.EventType.CLICK, this.onRestartButton, this);
    this.homeButton.off(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultHomeButton.node.off(Button.EventType.CLICK, this.onHomeButton, this);
    this.resultRestartButton.node.off(Button.EventType.CLICK, this.tryRestartAction, this);
    this.resultReviveButton.node.off(Button.EventType.CLICK, this.openRevive, this);
    this.reviveCloseButton.node.off(Button.EventType.CLICK, this.onRewardDialogAction, this);
    this.settingsButton.off(Button.EventType.CLICK, this.onSettingsButton, this);
    this.leaderboardButton.off(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.homeLeaderboardPreview.off(Button.EventType.CLICK, this.onLeaderboardButton, this);
    this.homeLeaderboardPreviewRequest += 1;
    this.soundToggle.node.off(Button.EventType.CLICK, this.onSoundToggle, this);
    this.motionToggle.node.off(Button.EventType.CLICK, this.onMotionToggle, this);
    this.restoreStaminaButton.node.off(Button.EventType.CLICK, this.onRestoreStamina, this);
    this.settingsCloseButton.node.off(Button.EventType.CLICK, this.onCloseHomeOverlay, this);
    this.appearanceToggle.node.off(Button.EventType.CLICK, this.onAppearanceToggle, this);
    this.nicknameButton.node.off(Button.EventType.CLICK, this.openNicknameEditor, this);
    this.nicknameSaveButton.node.off(Button.EventType.CLICK, this.saveNicknameEditor, this);
    this.nicknameCancelButton.node.off(Button.EventType.CLICK, this.closeNicknameEditor, this);
    this.nicknameEditor.node.off(EditBox.EventType.EDITING_DID_BEGAN, this.onNicknameInputBegan, this);
    this.nicknameEditor.node.off(EditBox.EventType.EDITING_DID_ENDED, this.onNicknameInputEnded, this);
    this.nicknameEditor.node.off(EditBox.EventType.EDITING_RETURN, this.onNicknameInputReturn, this);
    this.nicknameEditor.blur();
    this.nicknameInputActive = false;
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
    this.inputRouter.clear();
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
    this.world3D.setPaused(true);
  }

  onDestroy(): void {
    for(const key of this.pageOrder)this.pagePresenters?.[key].dispose();
    this.rewardAdController?.dispose();this.presenter.dispose(); this.uiAdapter.dispose(); this.layoutService.dispose(); this.transitionController.dispose();this.performanceProbe.stop();
    if(DEBUG && typeof window!=='undefined' && (window as any).WxStackDiagnostics?.owner===this) delete (window as any).WxStackDiagnostics;
    this.world3D?.destroy();
  }

  update(dt: number): void {
    this.frameProjectionCalls=0;this.frameProjectionCacheHits=0;
    this.performanceProbe.beginSection('update');
    try {
    if(!this.uiReady)return;
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (this.homeTransition) {
      this.updateHomeTransition(elapsed);
      this.transitionController.step(elapsed);
      return;
    }
    if (this.phase === 'paused') {
      this.flushPageViews();
      return;
    }
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
      this.updateParticles(step);
      if (movementRemaining > 0.000001) {
        const movementStep = Math.min(step, movementRemaining);
        this.updateMovingBlock(movementStep);
        movementRemaining -= movementStep;
      }
      simulationRemaining -= step;
    }

    const topBlock = this.current ?? this.stack[this.stack.length - 1];
    this.performanceProbe.beginSection('world');
    this.world3D.tick(elapsed, topBlock?.level ?? 0, this.shakeX, this.shakeY);
    this.performanceProbe.endSection('world');
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

    } finally { this.performanceProbe.endSection('update'); }
  }

  lateUpdate(dt: number): void {
    if(!this.uiReady || !this.performanceProbe.isRunning)return;
    this.performanceProbe.recordCounter('towerLayers',this.stack.length);
    const fx=this.ui.gameplayFx;
    this.performanceProbe.recordCounter('activeBlocks',this.world3D.activeBlocks);
    this.performanceProbe.recordCounter('looseBlocks',this.world3D.looseCount);
    this.performanceProbe.recordCounter('fragmentCapacity',this.world3D.fragmentPoolCapacity);
    this.performanceProbe.recordCounter('fragmentAvailable',this.world3D.fragmentPoolAvailable);
    this.performanceProbe.recordCounter('fragmentGrowth',this.world3D.growthCount);
    this.performanceProbe.recordCounter('instancing',this.world3D.isInstancingEnabled?1:0);
    this.performanceProbe.recordCounter('activeFx',fx.activeCount);
    this.performanceProbe.recordCounter('ringCapacity',fx.ringPoolCapacity);
    this.performanceProbe.recordCounter('ringGrowth',fx.ringExpansionCount);
    this.performanceProbe.recordCounter('projectionCalls',this.frameProjectionCalls);
    this.performanceProbe.recordCounter('projectionCacheHits',this.frameProjectionCacheHits);
    const device=director.root?.device;
    if(device) {this.performanceProbe.recordCounter('drawCalls',device.numDrawCalls);this.performanceProbe.recordCounter('triangles',device.numTris);}
    this.performanceProbe.recordFrame(dt);
  }

  private initializePageViews(): void {
    const ui=this.ui;
    this.pageModels={
      home:{coins:this.coins,bestScore:this.bestScore,staminaText:ui.homeStaminaLabel.string,startText:ui.startPromptLabel.string},
      hud:{score:this.score,bestScore:this.bestScore,recordGapText:ui.recordGapLabel.string,recordGapVisible:false,perfectText:COPY.perfect},
      settings:{nickname:this.playerNickname,soundText:COPY.sound,motionText:COPY.reducedMotion,testModeText:COPY.perfectTest,restoreText:'看视频 · 恢复体力'},
      nickname:{hintText:ui.nicknameHint.string},
      leaderboard:{statusText:ui.leaderboardStatus.string,emptyText:ui.leaderboardEmpty.string,pageText:ui.leaderboardPageLabel.string,rows:[]},
      pause:{resumeText:COPY.resume,restartText:COPY.restartRound,homeText:COPY.home},
      result:{title:COPY.gameOver,score:0,bestText:'',coinText:'',reviveText:'看视频 · 复活',reviveEnabled:true,restartText:COPY.restartRound},
      revive:{statusText:''}
    };
    this.pageRoots={home:this.startGroup,hud:this.gameplayHudGroup,settings:this.settingsGroup,nickname:this.nicknameGroup,leaderboard:this.leaderboardGroup,pause:this.pauseGroup,result:this.resultGroup,revive:this.reviveGroup};
    const home=new HomeScreenView(ui),hud=new GameplayHudView(ui),settings=new SettingsScreenView(ui),nickname=new NicknameDialogView(ui),leaderboard=new LeaderboardScreenView(ui),pause=new PauseScreenView(ui),result=new ResultScreenView(ui),revive=new ReviveDialogView(ui);
    this.pagePresenters={
      home:new StackUIPresenter(()=>this.pageModels.home,model=>home.render(model)),
      hud:new StackUIPresenter(()=>this.pageModels.hud,model=>hud.render(model)),
      settings:new StackUIPresenter(()=>this.pageModels.settings,model=>settings.render(model)),
      nickname:new StackUIPresenter(()=>this.pageModels.nickname,model=>{nickname.render(model);delete this.pageModels.nickname.draftText;}),
      leaderboard:new StackUIPresenter(()=>this.pageModels.leaderboard,model=>leaderboard.render(model)),
      pause:new StackUIPresenter(()=>this.pageModels.pause,model=>pause.render(model)),
      result:new StackUIPresenter(()=>this.pageModels.result,model=>result.render(model)),
      revive:new StackUIPresenter(()=>this.pageModels.revive,model=>revive.render(model))
    };
  }

  private patchPage<K extends keyof PageModels>(page:K,patch:Partial<PageModels[K]>):void {
    const model=this.pageModels[page];
    let changed=false;
    for(const key in patch)if(model[key]!==patch[key]){changed=true;break;}
    if(!changed)return;
    Object.assign(model,patch);
    this.pagePresenters[page].invalidate();
  }

  private flushPageViews():void {
    if(!this.pagePresenters)return;
    for(const key of this.pageOrder){
      const presenter=this.pagePresenters[key];
      presenter.setVisible(!this.uiSuspended && this.pageRoots[key].activeInHierarchy);
      if(presenter.isVisible && presenter.pending){this.performanceProbe.beginSection('ui');presenter.flush();this.performanceProbe.endSection('ui');}
    }
  }

  private buildStage(): void {
    if (!this.ui?.node || !this.node.getComponent(UITransform)) throw new Error('StackGame: GameUIRoot prefab and Canvas UITransform must be bound');
    if (!this.ui.homeLeaderboardPreviewRows) throw new Error('Missing prefab binding: homeLeaderboardPreviewRows');
    this.homeLeaderboardPreviewRows = this.ui.homeLeaderboardPreviewRows;
    if (!this.ui.homeLeaderboardPreviewDetails) throw new Error('Missing prefab binding: homeLeaderboardPreviewDetails');
    this.homeLeaderboardPreviewDetails = this.ui.homeLeaderboardPreviewDetails;
    if (!this.ui.homeLeaderboardPreviewRanks) throw new Error('Missing prefab binding: homeLeaderboardPreviewRanks');
    this.homeLeaderboardPreviewRanks = this.ui.homeLeaderboardPreviewRanks;
    if (!this.ui.homeLeaderboardPreviewTitles) throw new Error('Missing prefab binding: homeLeaderboardPreviewTitles');
    this.homeLeaderboardPreviewTitles = this.ui.homeLeaderboardPreviewTitles;
    if (!this.ui.leaderboardRows) throw new Error('Missing prefab binding: leaderboardRows');
    this.leaderboardRows = this.ui.leaderboardRows;
    if (!this.ui.leaderboardButtons) throw new Error('Missing prefab binding: leaderboardButtons');
    this.leaderboardButtons = this.ui.leaderboardButtons;
    if (!this.ui.screenDimmer) throw new Error('Missing prefab binding: screenDimmer');
    this.screenDimmer = this.ui.screenDimmer;
    if (!this.ui.hudSafeRoot) throw new Error('Missing prefab binding: hudSafeRoot');
    this.hudSafeRoot = this.ui.hudSafeRoot;
    if (!this.ui.gameplayHudGroup) throw new Error('Missing prefab binding: gameplayHudGroup');
    this.gameplayHudGroup = this.ui.gameplayHudGroup;
    if (!this.ui.scoreHudCard) throw new Error('Missing prefab binding: scoreHudCard');
    this.scoreHudCard = this.ui.scoreHudCard;
    if (!this.ui.scoreHudGraphics) throw new Error('Missing prefab binding: scoreHudGraphics');
    this.scoreHudGraphics = this.ui.scoreHudGraphics;
    if (!this.ui.scoreCaptionLabel) throw new Error('Missing prefab binding: scoreCaptionLabel');
    this.scoreCaptionLabel = this.ui.scoreCaptionLabel;
    if (!this.ui.scoreLabel) throw new Error('Missing prefab binding: scoreLabel');
    this.scoreLabel = this.ui.scoreLabel;
    if (!this.ui.bestHudCard) throw new Error('Missing prefab binding: bestHudCard');
    this.bestHudCard = this.ui.bestHudCard;
    if (!this.ui.bestHudGraphics) throw new Error('Missing prefab binding: bestHudGraphics');
    this.bestHudGraphics = this.ui.bestHudGraphics;
    if (!this.ui.bestCaptionLabel) throw new Error('Missing prefab binding: bestCaptionLabel');
    this.bestCaptionLabel = this.ui.bestCaptionLabel;
    if (!this.ui.bestLabel) throw new Error('Missing prefab binding: bestLabel');
    this.bestLabel = this.ui.bestLabel;
    if (!this.ui.recordGapNode) throw new Error('Missing prefab binding: recordGapNode');
    this.recordGapNode = this.ui.recordGapNode;
    if (!this.ui.recordGapGraphics) throw new Error('Missing prefab binding: recordGapGraphics');
    this.recordGapGraphics = this.ui.recordGapGraphics;
    if (!this.ui.recordGapLabel) throw new Error('Missing prefab binding: recordGapLabel');
    this.recordGapLabel = this.ui.recordGapLabel;
    if (!this.ui.testModeBadgeLabel) throw new Error('Missing prefab binding: testModeBadgeLabel');
    this.testModeBadgeLabel = this.ui.testModeBadgeLabel;
    if (!this.ui.perfectLabel) throw new Error('Missing prefab binding: perfectLabel');
    this.perfectLabel = this.ui.perfectLabel;
    if (!this.ui.perfectOpacity) throw new Error('Missing prefab binding: perfectOpacity');
    this.perfectOpacity = this.ui.perfectOpacity;
    if (!this.ui.startGroup) throw new Error('Missing prefab binding: startGroup');
    this.startGroup = this.ui.startGroup;
    if (!this.ui.homePanelGraphics) throw new Error('Missing prefab binding: homePanelGraphics');
    this.homePanelGraphics = this.ui.homePanelGraphics;
    if (!this.ui.settingsButton) throw new Error('Missing prefab binding: settingsButton');
    this.settingsButton = this.ui.settingsButton;
    if (!this.ui.settingsButtonGraphics) throw new Error('Missing prefab binding: settingsButtonGraphics');
    this.settingsButtonGraphics = this.ui.settingsButtonGraphics;
    if (!this.ui.settingsButtonLabel) throw new Error('Missing prefab binding: settingsButtonLabel');
    this.settingsButtonLabel = this.ui.settingsButtonLabel;
    if (!this.ui.leaderboardButton) throw new Error('Missing prefab binding: leaderboardButton');
    this.leaderboardButton = this.ui.leaderboardButton;
    if (!this.ui.leaderboardButtonGraphics) throw new Error('Missing prefab binding: leaderboardButtonGraphics');
    this.leaderboardButtonGraphics = this.ui.leaderboardButtonGraphics;
    if (!this.ui.leaderboardButtonLabel) throw new Error('Missing prefab binding: leaderboardButtonLabel');
    this.leaderboardButtonLabel = this.ui.leaderboardButtonLabel;
    if (!this.ui.homeCoinLabel) throw new Error('Missing prefab binding: homeCoinLabel');
    this.homeCoinLabel = this.ui.homeCoinLabel;
    if (!this.ui.homeCoinCaption) throw new Error('Missing prefab binding: homeCoinCaption');
    this.homeCoinCaption = this.ui.homeCoinCaption;
    if (!this.ui.homeBestCaption) throw new Error('Missing prefab binding: homeBestCaption');
    this.homeBestCaption = this.ui.homeBestCaption;
    if (!this.ui.homeStaminaLabel) throw new Error('Missing prefab binding: homeStaminaLabel');
    this.homeStaminaLabel = this.ui.homeStaminaLabel;
    this.homeStaminaLabel.node.active = true;
    const energyIcon = this.ui.homeStaminaIcon;
    if (energyIcon) {
      this.homeStaminaIcons = [energyIcon];
      for (let index = 1; index < STAMINA_CAP; index++) {
        const node = instantiate(energyIcon.node);
        node.name = `HomeEnergy${index + 1}`;
        node.parent = energyIcon.node.parent;
        this.homeStaminaIcons.push(node.getComponent(Sprite)!);
      }
    }
    if (!this.ui.homeBestBadge) throw new Error('Missing prefab binding: homeBestBadge');
    this.homeBestBadge = this.ui.homeBestBadge;
    if (!this.ui.homeBestLabel) throw new Error('Missing prefab binding: homeBestLabel');
    this.homeBestLabel = this.ui.homeBestLabel;
    if (!this.ui.startButton) throw new Error('Missing prefab binding: startButton');
    this.startButton = this.ui.startButton;
    if (!this.ui.startButtonGraphics) throw new Error('Missing prefab binding: startButtonGraphics');
    this.startButtonGraphics = this.ui.startButtonGraphics;
    if (!this.ui.startPromptLabel) throw new Error('Missing prefab binding: startPromptLabel');
    this.startPromptLabel = this.ui.startPromptLabel;
    if (!this.ui.controlsLabel) throw new Error('Missing prefab binding: controlsLabel');
    this.controlsLabel = this.ui.controlsLabel;
    if (!this.ui.precisionTipLabel) throw new Error('Missing prefab binding: precisionTipLabel');
    this.precisionTipLabel = this.ui.precisionTipLabel;
    if (!this.ui.homeLeaderboardPreview) throw new Error('Missing prefab binding: homeLeaderboardPreview');
    this.homeLeaderboardPreview = this.ui.homeLeaderboardPreview;
    if (!this.ui.homeLeaderboardPreviewGraphics) throw new Error('Missing prefab binding: homeLeaderboardPreviewGraphics');
    this.homeLeaderboardPreviewGraphics = this.ui.homeLeaderboardPreviewGraphics;
    if (!this.ui.homeLeaderboardPreviewTitle) throw new Error('Missing prefab binding: homeLeaderboardPreviewTitle');
    this.homeLeaderboardPreviewTitle = this.ui.homeLeaderboardPreviewTitle;
    if (!this.ui.homeLeaderboardPreviewSubtitle) throw new Error('Missing prefab binding: homeLeaderboardPreviewSubtitle');
    this.homeLeaderboardPreviewSubtitle = this.ui.homeLeaderboardPreviewSubtitle;
    if (!this.ui.homeLeaderboardPreviewEmpty) throw new Error('Missing prefab binding: homeLeaderboardPreviewEmpty');
    this.homeLeaderboardPreviewEmpty = this.ui.homeLeaderboardPreviewEmpty;
    if (!this.ui.homeLeaderboardPreviewHint) throw new Error('Missing prefab binding: homeLeaderboardPreviewHint');
    this.homeLeaderboardPreviewHint = this.ui.homeLeaderboardPreviewHint;
    if (!this.ui.resultGroup) throw new Error('Missing prefab binding: resultGroup');
    this.resultGroup = this.ui.resultGroup;
    if (!this.ui.resultPanelGraphics) throw new Error('Missing prefab binding: resultPanelGraphics');
    this.resultPanelGraphics = this.ui.resultPanelGraphics;
    if (!this.ui.resultTitleLabel) throw new Error('Missing prefab binding: resultTitleLabel');
    this.resultTitleLabel = this.ui.resultTitleLabel;
    if (!this.ui.resultScoreLabel) throw new Error('Missing prefab binding: resultScoreLabel');
    this.resultScoreLabel = this.ui.resultScoreLabel;
    if (!this.ui.resultBestLabel) throw new Error('Missing prefab binding: resultBestLabel');
    this.resultBestLabel = this.ui.resultBestLabel;
    if (!this.ui.resultCoinLabel) throw new Error('Missing prefab binding: resultCoinLabel');
    this.resultCoinLabel = this.ui.resultCoinLabel;
    if (!this.ui.resultReviveButton) throw new Error('Missing prefab binding: resultReviveButton');
    this.resultReviveButton = this.ui.resultReviveButton;
    if (!this.ui.resultRestartButton) throw new Error('Missing prefab binding: resultRestartButton');
    this.resultRestartButton = this.ui.resultRestartButton;
    if (!this.ui.resultHomeButton) throw new Error('Missing prefab binding: resultHomeButton');
    this.resultHomeButton = this.ui.resultHomeButton;
    if (!this.ui.pauseButton) throw new Error('Missing prefab binding: pauseButton');
    this.pauseButton = this.ui.pauseButton;
    if (!this.ui.pauseButtonGraphics) throw new Error('Missing prefab binding: pauseButtonGraphics');
    this.pauseButtonGraphics = this.ui.pauseButtonGraphics;
    if (!this.ui.pauseButtonLabel) throw new Error('Missing prefab binding: pauseButtonLabel');
    this.pauseButtonLabel = this.ui.pauseButtonLabel;
    if (!this.ui.pauseGroup) throw new Error('Missing prefab binding: pauseGroup');
    this.pauseGroup = this.ui.pauseGroup;
    if (!this.ui.pausePanelGraphics) throw new Error('Missing prefab binding: pausePanelGraphics');
    this.pausePanelGraphics = this.ui.pausePanelGraphics;
    if (!this.ui.resumeButton) throw new Error('Missing prefab binding: resumeButton');
    this.resumeButton = this.ui.resumeButton;
    if (!this.ui.resumeButtonGraphics) throw new Error('Missing prefab binding: resumeButtonGraphics');
    this.resumeButtonGraphics = this.ui.resumeButtonGraphics;
    if (!this.ui.resumeButtonLabel) throw new Error('Missing prefab binding: resumeButtonLabel');
    this.resumeButtonLabel = this.ui.resumeButtonLabel;
    if (!this.ui.restartButton) throw new Error('Missing prefab binding: restartButton');
    this.restartButton = this.ui.restartButton;
    if (!this.ui.restartButtonGraphics) throw new Error('Missing prefab binding: restartButtonGraphics');
    this.restartButtonGraphics = this.ui.restartButtonGraphics;
    if (!this.ui.restartButtonLabel) throw new Error('Missing prefab binding: restartButtonLabel');
    this.restartButtonLabel = this.ui.restartButtonLabel;
    if (!this.ui.homeButton) throw new Error('Missing prefab binding: homeButton');
    this.homeButton = this.ui.homeButton;
    if (!this.ui.homeButtonGraphics) throw new Error('Missing prefab binding: homeButtonGraphics');
    this.homeButtonGraphics = this.ui.homeButtonGraphics;
    if (!this.ui.homeButtonLabel) throw new Error('Missing prefab binding: homeButtonLabel');
    this.homeButtonLabel = this.ui.homeButtonLabel;
    if (!this.ui.settingsGroup) throw new Error('Missing prefab binding: settingsGroup');
    this.settingsGroup = this.ui.settingsGroup;
    if (!this.ui.settingsGraphics) throw new Error('Missing prefab binding: settingsGraphics');
    this.settingsGraphics = this.ui.settingsGraphics;
    if (!this.ui.soundToggle) throw new Error('Missing prefab binding: soundToggle');
    this.soundToggle = this.ui.soundToggle;
    if (!this.ui.motionToggle) throw new Error('Missing prefab binding: motionToggle');
    this.motionToggle = this.ui.motionToggle;
    if (!this.ui.testModeToggle) throw new Error('Missing prefab binding: testModeToggle');
    this.testModeToggle = this.ui.testModeToggle;
    if (!this.ui.testModeToggleGraphics) throw new Error('Missing prefab binding: testModeToggleGraphics');
    this.testModeToggleGraphics = this.ui.testModeToggleGraphics;
    if (!this.ui.testModeToggleLabel) throw new Error('Missing prefab binding: testModeToggleLabel');
    this.testModeToggleLabel = this.ui.testModeToggleLabel;
    if (!this.ui.nicknameButton) throw new Error('Missing prefab binding: nicknameButton');
    this.nicknameButton = this.ui.nicknameButton;
    if (!this.ui.nicknameLabel) throw new Error('Missing prefab binding: nicknameLabel');
    this.nicknameLabel = this.ui.nicknameLabel;
    if (!this.ui.restoreStaminaButton) throw new Error('Missing prefab binding: restoreStaminaButton');
    this.restoreStaminaButton = this.ui.restoreStaminaButton;
    if (!this.ui.settingsCloseButton) throw new Error('Missing prefab binding: settingsCloseButton');
    this.settingsCloseButton = this.ui.settingsCloseButton;
    if (!this.ui.appearanceToggle) throw new Error('Missing prefab binding: appearanceToggle');
    this.appearanceToggle = this.ui.appearanceToggle;
    if (!this.ui.nicknameGroup) throw new Error('Missing prefab binding: nicknameGroup');
    this.nicknameGroup = this.ui.nicknameGroup;
    if (!this.ui.nicknameGraphics) throw new Error('Missing prefab binding: nicknameGraphics');
    this.nicknameGraphics = this.ui.nicknameGraphics;
    if (!this.ui.nicknameInputGraphics) throw new Error('Missing prefab binding: nicknameInputGraphics');
    this.nicknameInputGraphics = this.ui.nicknameInputGraphics;
    if (!this.ui.nicknameEditor) throw new Error('Missing prefab binding: nicknameEditor');
    this.nicknameEditor = this.ui.nicknameEditor;
    if (!this.ui.nicknameHint) throw new Error('Missing prefab binding: nicknameHint');
    this.nicknameHint = this.ui.nicknameHint;
    if (!this.ui.nicknameSaveButton) throw new Error('Missing prefab binding: nicknameSaveButton');
    this.nicknameSaveButton = this.ui.nicknameSaveButton;
    if (!this.ui.nicknameCancelButton) throw new Error('Missing prefab binding: nicknameCancelButton');
    this.nicknameCancelButton = this.ui.nicknameCancelButton;
    if (!this.ui.leaderboardGroup) throw new Error('Missing prefab binding: leaderboardGroup');
    this.leaderboardGroup = this.ui.leaderboardGroup;
    if (!this.ui.leaderboardGraphics) throw new Error('Missing prefab binding: leaderboardGraphics');
    this.leaderboardGraphics = this.ui.leaderboardGraphics;
    if (!this.ui.leaderboardStatus) throw new Error('Missing prefab binding: leaderboardStatus');
    this.leaderboardStatus = this.ui.leaderboardStatus;
    if (!this.ui.leaderboardViewport) throw new Error('Missing prefab binding: leaderboardViewport');
    this.leaderboardViewport = this.ui.leaderboardViewport;
    if (!this.ui.leaderboardContent) throw new Error('Missing prefab binding: leaderboardContent');
    this.leaderboardContent = this.ui.leaderboardContent;
    if (!this.ui.leaderboardScroll) throw new Error('Missing prefab binding: leaderboardScroll');
    this.leaderboardScroll = this.ui.leaderboardScroll;
    if (!this.ui.leaderboardScrollTrack) throw new Error('Missing prefab binding: leaderboardScrollTrack');
    this.leaderboardScrollTrack = this.ui.leaderboardScrollTrack;
    if (!this.ui.leaderboardEmpty) throw new Error('Missing prefab binding: leaderboardEmpty');
    this.leaderboardEmpty = this.ui.leaderboardEmpty;
    if (!this.ui.leaderboardPageLabel) throw new Error('Missing prefab binding: leaderboardPageLabel');
    this.leaderboardPageLabel = this.ui.leaderboardPageLabel;
    if (!this.ui.transitionBlocker) throw new Error('Missing prefab binding: transitionBlocker');
    this.transitionBlocker = this.ui.transitionBlocker;
    if (!this.ui.reviveGroup) throw new Error('Missing prefab binding: reviveGroup');
    this.reviveGroup = this.ui.reviveGroup;
    if (!this.ui.reviveQr) throw new Error('Missing prefab binding: reviveQr');
    this.reviveQr = this.ui.reviveQr;
    if (!this.ui.reviveStatusLabel) throw new Error('Missing prefab binding: reviveStatusLabel');
    this.reviveStatusLabel = this.ui.reviveStatusLabel;
    if (!this.ui.reviveCloseButton) throw new Error('Missing prefab binding: reviveCloseButton');
    this.reviveCloseButton = this.ui.reviveCloseButton;
    if (!this.ui.graphics) throw new Error('Missing prefab binding: graphics');
    this.graphics = this.ui.graphics;
    this.initializePageViews();
    this.renderer=new StackUIRenderer(this.ui,{home:()=>this.homeLayout(),panel:kind=>this.panelLayout(kind),hud:()=>this.hudLayout(),panelCenterX:width=>this.panelCenterX(width)},()=>({reducedMotion:this.reducedMotion,visibleWidth:this.visibleWidth,visibleHeight:this.visibleHeight,tvLayout:this.tvLayout}));
    this.world3D = new StackWorld3D(this.node, BLOCK_3D_HEIGHT);
    this.world3D.setAppearance(this.creamAppearance);
    this.ui.gameplayFx.initialize((x,z,level,out) => this.world3D.projectToUI(x,z,level,this.ui.gameplayFx.node,out));
    this.leaderboardHandlers = [() => this.closeHomeOverlay()];
    for(const visual of this.ui.node.getComponentsInChildren(StackUIVisual))visual.validateBindings();
    this.rewardAdController = new RewardAdController({
      client: new RewardAdClient(sys.localStorage),
      render: state => {
        const wasVisible = this.reviveGroup.active;
        this.reviveGroup.active = state.open;
        if (!wasVisible && state.open) this.router.push('revive', this.resultSelection);
        if (wasVisible && !state.open) {
          const route = this.router.pop();
          if (route && this.phase === 'gameover') this.resultSelection = route.returnFocus;
        }
        if (state.open) {
          const revive = state.pendingAction === 'REVIVE';
          this.setNamedLabelText(this.reviveGroup, 'ReviveTitle', revive ? '看视频复活' : '看视频恢复体力');
          this.setNamedLabelText(this.reviveGroup, 'ReviveHint', revive ? '观看完成自动复活 · 宽长至少恢复至 50%' : '完整观看视频后 +5 体力 · 可持续累积');
          const seconds = Math.max(0, Math.ceil((state.countdownEndsAt - Date.now()) / 1000));
          const statusText = state.loading ? '正在获取广告…' : `${state.errorMessage || '请用手机扫码，完整观看视频'}\n剩余 ${seconds} 秒`;
          this.patchPage('revive', { statusText, closeText: '关闭' });
          this.layoutReviveUI();
        } else {
          this.ui.qrCodeView.clear(); this.rewardQrUrl = '';
          if (state.errorMessage) {
            this.adNotice = state.errorMessage;
            this.updateStaminaUI();
            if (this.homeOverlay === 'settings') { this.nicknameStatus = state.errorMessage; this.updateSettingsUI(); }
          }
        }
      },
      grant: action => {
        if (!this.isValid || this.uiSuspended || this.roundId !== this.rewardRoundId) return;
        if (action === 'REVIVE' && this.phase === 'gameover' && !this.reviveUsed) {
          this.reviveUsed = true;
          this.beginScreenTransition(() => this.resumeRevivedRound(), 'game-start');
        } else if (action === 'ITEM_REWARD') {
          this.stamina.grantAdReward(); this.adNotice = '';
          this.nicknameStatus = `视频已完成 · 当前体力 ${this.stamina.snapshot().amount} 点`;
          this.updateStaminaUI();
          if (this.homeOverlay === 'settings') this.updateSettingsUI();
        }
      },
    });

  }

  private layoutReviveUI(): void {
    if (!this.reviveGroup) return;
    const width = Math.min(640, this.visibleWidth - 56);
    const height = Math.min(1040, this.visibleHeight - 128);
    const scale = height / 1040;
    this.renderer.renderRevivePanel(width,height);
    this.layoutPanelLabel(this.reviveGroup, 'ReviveTitle', 0, 406 * scale, width - 64, 76 * scale, 48 * scale, true);
    this.layoutPanelLabel(this.reviveGroup, 'ReviveHint', 0, 318 * scale, width - 64, 60 * scale, 24 * scale);
    this.layoutPanelLabel(this.reviveGroup, 'ReviveStatus', 0, -248 * scale, width - 64, 108 * scale, 26 * scale);
    this.reviveStatusLabel.enableWrapText = true;
    this.layoutPanelButton(this.reviveCloseButton, 0, -408 * scale, width - 80, 100 * scale, 36 * scale);
    this.drawOverlayButton(this.reviveCloseButton, width - 80, 100 * scale, true);
    const size = Math.min(392 * scale, width - 96);
    this.setCenteredNodeLayout(this.reviveQr.node, 0, 40 * scale);
    this.reviveQr.node.getComponent(UITransform).setContentSize(size, size);
    this.drawReviveQR();
  }

  private drawReviveQR(): void {
    const url = this.rewardAdController?.rewardAdState.adUrl;
    if (!url) { this.ui.qrCodeView.clear(); this.rewardQrUrl = ''; return; }
    if (url === this.rewardQrUrl) return;
    const qr = encodeRewardQr(url);
    this.ui.qrCodeView.show(url, qr.size, qr.modules);
    this.rewardQrUrl = url;
  }

  private async openRevive(): Promise<void> {
    if (this.homeTransition || this.phase !== 'gameover' || this.reviveUsed) return;
    this.rewardRoundId = this.roundId; this.adNotice = '';
    await this.rewardAdController.openRewardAdDialog('REVIVE', 'REVIVE');
  }

  private openStaminaReward(): void {
    if (this.homeTransition || this.uiSuspended || this.reviveGroup?.active) return;
    this.rewardRoundId = this.roundId; this.adNotice = '';
    void this.rewardAdController.openRewardAdDialog(this.phase === 'gameover' ? 'SETTLEMENT' : 'MAIN_MENU', 'ITEM_REWARD');
  }

  private onRewardDialogAction(): void {
    this.closeRevive();
  }

  private closeRevive(): void { this.rewardAdController?.closeRewardAdDialog(); }

  private resumeRevivedRound(): void {
    // Keep lower layers and the round; restore each supporting dimension to at least half the initial footprint.
    this.world3D.reset();
    this.ui.gameplayFx.clear();
    const top = this.stack[this.stack.length - 1];
    top.width = Math.max(top.width, BASE_SIZE * REVIVE_BLOCK_SCALE);
    top.depth = Math.max(top.depth, BASE_SIZE * REVIVE_BLOCK_SCALE);
    this.phase = 'playing';
    this.phaseBeforePause = 'playing';
    this.resultGroup.active = false;
    this.pauseGroup.active = false;
    this.gameplayHudGroup.active = true;
    this.pauseButton.active = true;
    this.submittedRoundId = '';
    this.current = null;

  this.ui.gameplayFx.clearPerfectFrames();
    this.trauma = this.shakeTime = this.shakeX = this.shakeY = this.flashAlpha = 0;
    this.spawnDelay = this.resultDelay = this.restartLock = 0;
    this.resumeInputLock = 0.35;
    this.resetPerfectChain(); this.resetPerfectFeedback();
    this.updateWorldComposition(); this.updateTestModeUI();
    this.world3D.restoreStack(this.stack);
    this.spawnMovingBlock();
    this.setScore(this.score, false);
    this.drawFrame();
  }

  private updateHomeLeaderboardPreviewUI(): void {
    if (!this.homeLeaderboardPreview) return;
    const layout = projectorLeaderboardPreviewLayout(this.visibleWidth, this.visibleHeight);
    const compact = layout.rowYs.length === 1;
    const style = CREAM_STYLE;
    const text = this.rgb(style.textColor);
    const g = this.homeLeaderboardPreviewGraphics;
    g.reset();g.box(layout.panelWidth,layout.panelHeight,compact?16:28,this.rgb(style.panelColor),new Color(255,255,249));
    this.ui.homePreviewRowVisuals.forEach(row=>row.reset());
    this.ui.homePreviewPodium.forEach(sprite=>sprite.node.active=false);
    this.ui.previewHintBackground.node.active=!compact;
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
      g.setLayer(g.accent,48,4,0,layout.titleY+35,this.rgb(style.accentColor));
      const hint=this.ui.previewHintBackground;hint.node.setPosition(0,layout.hintY,0);hint.node.getComponent(UITransform).setContentSize(layout.panelWidth-48,48);hint.color=new Color(220,235,222);
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
        const rowVisual=this.ui.homePreviewRowVisuals[index];
        rowVisual.box(layout.panelWidth-36,92,20,index===0?new Color(248,232,196):new Color(246,237,224),undefined,0,0,y);
        this.drawRankAvatar(rowVisual,-166,y+4,31,entry.score);this.drawRankNumberBadge(rowVisual,-144,y-22,12,index);
      }
    });
    this.homeLeaderboardPreviewEmpty.node.active = this.homeLeaderboardPreviewEntries.length === 0;
    place(this.homeLeaderboardPreviewEmpty, compact ? layout.rowYs[0] : -48, layout.captionSize, compact ? 30 : 70);
    if (!compact && this.homeLeaderboardPreviewEmpty.node.active) {
      // A small podium gives loading, empty and retry states the same visual identity.
      const podium=[[-58,42,206,216,220],[0,70,235,194,112],[58,30,221,179,152]];
      podium.forEach(([x,h,r,b,c],i)=>{const sprite=this.ui.homePreviewPodium[i];sprite.node.active=true;sprite.node.setPosition(x,12+h/2,0);sprite.node.getComponent(UITransform).setContentSize(48,h);sprite.color=new Color(r,b,c);});
    }
    this.homeLeaderboardPreviewHint.node.active = !compact;
    place(this.homeLeaderboardPreviewHint, layout.hintY, layout.captionSize, 34);

  }

  private async loadHomeLeaderboardPreview(): Promise<void> {
    if (!this.homeLeaderboardPreview || this.uiSuspended) return;
    const request = ++this.homeLeaderboardPreviewRequest;
    this.homeLeaderboardPreviewEmpty.string = '正在加载…';
    this.updateHomeLeaderboardPreviewUI();
    const stillHome = () => this.isValid && !this.uiSuspended && request === this.homeLeaderboardPreviewRequest
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

  private updateLeaderboardUI(): void {
    if (!this.leaderboardGraphics) return;
    const layout = this.panelLayout('leaderboard');
    this.drawLeaderboardPanel();
    const text = this.rgb(CREAM_STYLE.textColor);
    const secondary = new Color(105, 86, 94);
    const accent = new Color(87, 126, 113);
    for (const name of ['LeaderboardTitle', 'LeaderboardStatus', 'LeaderboardRankHeading', 'LeaderboardColumns', 'LeaderboardScoreHeading', 'LeaderboardEmpty', 'LeaderboardScrollHint']) {
      this.setNamedLabelColor(this.leaderboardGroup, name, name === 'LeaderboardTitle' || name === 'LeaderboardEmpty'
        ? text : secondary);
    }
    // Decorative divider and accent underline keep the header distinct from the moving list.
    const panel = this.leaderboardGraphics;
    panel.setLayer(panel.accent,68,10,-layout.contentWidth/2+34,layout.subtitleY,accent);
    panel.setLayer(panel.arrow,layout.contentWidth,1,0,layout.listTop+9.5,new Color(text.r,text.g,text.b,28));
    const rowModels:LeaderboardRowModel[]=this.leaderboardRows.map(()=>({visible:false,rankText:'',playerText:'',scoreText:'',titleText:'',detailText:''}));
    this.leaderboardRows.forEach((row, index) => {
      const model=rowModels[index];
      const rank = index;
      const entry = this.leaderboardEntries[rank];
      model.visible = !!entry && !this.leaderboardLoading;
      if (!entry) return;
      const currentRound = entry.id === this.submittedRoundId;
      row.graphics.reset();
      row.graphics.gradientBox(layout.rowWidth,layout.rowHeight,currentRound,currentRound?accent:new Color(169,139,133,75),currentRound?3:1);
      // Avatar follows the score tier; the small numbered badge follows list position.
      this.drawRankAvatar(row.graphics, layout.rankX, 5, 40, entry.score);
      this.drawRankNumberBadge(row.graphics, layout.rankX + 26, -28, 18, rank);
      model.rankText = rank < 9 ? `0${rank + 1}` : `${rank + 1}`;
      model.playerText = `${entry.nickname || '本地玩家'}${currentRound ? ' · 本局' : ''}`;
      model.scoreText = `${entry.score}`;
      model.titleText = leaderboardTitle(entry.score);
      if (entry.kind === 'legacy') model.detailText = '历史纪录 · 详情未记录';
      else {
        const date = new Date(entry.finishedAt!);
        const pad = (value: number) => value < 10 ? `0${value}` : `${value}`;
        model.detailText = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}  · 完美 ${entry.perfectCount} 次`;
      }
      row.rank.color = new Color(56, 46, 31, 255);
      row.score.color = text;
      row.player.color = text;
      row.title.color = new Color(120, 81, 42);
      row.title.isBold = true;
      row.detail.color = secondary;
    });
    this.patchPage('leaderboard',{rows:rowModels,emptyVisible:this.leaderboardLoading||this.leaderboardEntries.length===0});
    this.patchPage('leaderboard',{pageText:this.leaderboardLoading ? '' : this.leaderboardEntries.length > 4
      ? '↑ ↓ 滚动  ·  滑动 / 滚轮  ·  返回键关闭' : '本机成绩  ·  返回键关闭'});
    this.leaderboardButtons.forEach(button => {
      const g=button.graphics;g.reset();button.label.string='';
      g.setLayer(g.accent,48,4,0,0,accent);g.accent.node.angle=45;
      g.setLayer(g.detail,48,4,0,0,accent);g.detail.node.angle=-45;
    });
    this.layoutLeaderboardList();
  }

  /** Opaque rounded gradient: short horizontal bands avoid bitmap assets and scale cleanly on TVs. */


  private drawLeaderboardPanel():void { this.renderer.renderLeaderboardPanel(); }

  private drawRankNumberBadge(g: StackUIVisual,x:number,y:number,radius:number,rank:number):void { this.renderer.renderRankBadge(g,x,y,radius,rank); }

  /** Six code-drawn toy portraits: distinct silhouettes remain legible at HUD size. */
  private drawRankAvatar(g: StackUIVisual,x:number,y:number,radius:number,score:number):void { this.renderer.renderRankAvatar(g,x,y,radius,leaderboardTier(score)); }

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

  private updateLeaderboardScrollTrack():void { this.renderer.renderScrollbar({maxOffset:this.leaderboardScroll.getMaxScrollOffset().y,offset:this.leaderboardScroll.getScrollOffset().y,loading:this.leaderboardLoading}); }

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
    this.patchPage('leaderboard',{emptyText:'正在加载成绩…'});
    this.patchPage('leaderboard',{statusText:'本机 Top 10 · 每局成绩'});
    this.updateLeaderboardUI();
    try {
      await this.leaderboardSubmission;
      const snapshot = await this.leaderboard.list();
      if (!this.isValid || this.uiSuspended || request !== this.leaderboardRequest || this.homeOverlay !== 'leaderboard') return;
      this.leaderboardEntries = snapshot.entries.slice(0, 10);
      this.patchPage('leaderboard',{statusText:this.leaderboardSaveFailed ? '本局成绩暂未保存'
        : snapshot.persistent ? '本机 Top 10 · 每局成绩' : '本次会话排行 · 关闭后不保留'});
      this.patchPage('leaderboard',{emptyText:'还没有成绩\n完成一局即可上榜'});
    } catch {
      if (!this.isValid || this.uiSuspended || request !== this.leaderboardRequest || this.homeOverlay !== 'leaderboard') return;
      this.patchPage('leaderboard',{emptyText:'成绩暂时无法加载\n请返回后重试'});
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
      revived: this.reviveUsed,
    }).catch(() => { this.leaderboardSaveFailed = true; });
  }

  private drawHomeButton(g: StackUIVisual, label: Label, width: number, height: number, selected: boolean): void { this.renderer.renderButton(g,label,width,height,selected); }

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
      ? this.textOnButton(CREAM_STYLE.accentColor)
      : this.textOnButton(CREAM_STYLE.buttonColor);
  }

  private drawOverlayBackdrop(g: StackUIVisual, panelWidth: number, panelHeight: number): void { this.renderer.renderBackdrop(g,panelWidth,panelHeight); }

  private drawOverlayButton(ui: ButtonUI, width: number, height: number, selected: boolean, prominent = false): void { this.renderer.renderOverlayButton(ui,width,height,selected); }

  private drawSettingToggle(ui: ButtonUI, caption: string, enabled: boolean, selected: boolean): void { this.renderer.renderSettingToggle(ui,this.ui.settingStateLabels[ui===this.soundToggle?0:ui===this.motionToggle?1:2],caption,enabled,selected); }

  private updateNicknameEditorUI(): void {
    if (!this.nicknameGroup) return;
    const layout = this.panelLayout('settings');
    const width = Math.min(640, this.visibleWidth - 56);
    const content = width - 64;
    const style = CREAM_STYLE;
    const text = this.textOnButton(style.panelColor);
    const g = this.nicknameGraphics;
    g.reset();g.box(width,500,36,this.rgb(style.panelColor));
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
    input.reset();input.box(content,80,16,new Color(text.r,text.g,text.b,18),text,this.nicknameSelection===0?4:2);
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
    this.router.push('nickname',this.settingsSelection);
    this.nicknameSelection = 0;
    this.patchPage('nickname',{draftText:this.playerNickname});
    this.patchPage('nickname',{hintText:'保存后用于新成绩，已有成绩昵称不变'});
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
      this.patchPage('nickname',{hintText:value ? '昵称最多 12 个字符，请缩短后保存' : '昵称不能为空'});
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
    if(this.router.top==='nickname'){const route=this.router.pop();if(route)this.settingsSelection=route.returnFocus;}
    this.nicknameGroup.active = false;
    this.settingsGroup.active = true;
    this.settingsSelection = 3;
    this.updateSettingsUI();
    if (sys.isBrowser) this.focusGameCanvas();
    this.inputRouter.resetActionClock();
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
    this.nicknameButton.label.node.setPosition(0, 16, 0);
    this.nicknameButton.label.node.getComponent(UITransform)?.setContentSize(layout.buttonWidth - 100, 32);
    this.nicknameButton.label.fontSize = layout.bodyFont - 6;
    this.nicknameLabel.node.setPosition(0, -18, 0);
    this.nicknameLabel.node.getComponent(UITransform)?.setContentSize(layout.buttonWidth - 80, 26);
    this.patchPage('settings',{nickname:this.playerNickname});
    this.nicknameLabel.color = this.nicknameButton.label.color;
    this.nicknameLabel.enableWrapText = false;
    this.setNamedLabelText(this.settingsGroup, 'SettingsHint', this.nicknameStatus || COPY.settingsHint);
    this.drawOverlayButton(this.restoreStaminaButton, layout.buttonWidth, layout.buttonHeight, this.homeOverlay === 'settings' && this.settingsSelection === 4);
    this.drawOverlayButton(this.appearanceToggle, layout.buttonWidth, layout.buttonHeight, this.homeOverlay === 'settings' && this.settingsSelection === 5);
    this.patchPage('settings', { appearanceText: `画面风格 · ${this.creamAppearance === 'bright' ? '明亮' : '标准'}` });
    this.drawOverlayButton(this.settingsCloseButton, layout.buttonWidth, layout.buttonHeight, this.homeOverlay === 'settings' && this.settingsSelection === 6, true);
  }

  private drawGameplayHudCards(): void { this.renderer.renderHudCards(); }

  private drawPauseHudButton(): void { this.renderer.renderPauseButton(); }

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

  private drawPauseMenuButton(graphics: StackUIVisual, label: Label, node: Node, selected: boolean): void {
    const layout = this.panelLayout('pause');
    this.drawOverlayButton({ node, graphics, label }, layout.buttonWidth, layout.buttonHeight, selected);
  }

  private updateTestModeUI(): void {
    if (!this.testModeToggleGraphics) return;
    this.drawSettingToggle({ node: this.testModeToggle, graphics: this.testModeToggleGraphics, label: this.testModeToggleLabel },
      COPY.perfectTest, this.testModeEnabled, this.homeOverlay === 'settings' && this.settingsSelection === 2);
    this.testModeBadgeLabel.node.active = this.testModeEnabled && (this.phase === 'playing' || this.phase === 'dropping');
    this.updateRecordGap();
  }

  private showReadyScreen(): void {
    this.closeRevive();
    this.phase = 'ready';
    this.router.reset('home');
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
    this.inputRouter.resetActionClock();
    this.current = null;

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

    this.world3D.restoreStack(this.stack);
    this.startGroup.active = true;
    this.resultGroup.active = false;
    this.pauseGroup.active = false;
    this.settingsGroup.active = false;
    this.pauseButton.active = false;
    this.leaderboardGroup.active = false;
    this.gameplayHudGroup.active = false;
    this.homeBestLabel.node.active = true;
    this.updateBestLabel();
    this.updateCoinLabels();
    this.updateAudioPrompt();
    this.updateStaminaUI();
    this.applyCreamStyleToUI();
    void this.loadHomeLeaderboardPreview();
    this.drawFrame();
  }

  private startGame(): void {
    if (this.reviveGroup?.active || this.homeTransition || !this.audioReady || this.homeOverlay !== 'none'
      || ['ready', 'paused', 'gameover'].indexOf(this.phase) < 0) {
      this.updateAudioPrompt();
      return;
    }
    this.stamina ??= new Stamina(sys.localStorage);
    if (!this.testModeEnabled && !this.stamina.spend()) {
      this.updateStaminaUI();
      this.openStaminaReward();
      return;
    }
    this.updateStaminaUI();
    this.beginScreenTransition(() => this.startGameImmediately(), 'game-start');
  }

  private startGameImmediately(): void {
    this.closeRevive();
    this.reviveUsed = false;
    this.roundRewardedPerfectCount = 0;
    Tween.stopAllByTarget(this.resultGroup);
    Tween.stopAllByTarget(this.pauseGroup);
    Tween.stopAllByTarget(this.scoreLabel.node);
    this.scoreLabel.node.setScale(1, 1, 1);
    this.resetPerfectFeedback();
    this.world3D.reset();
    this.phase = 'playing';
    this.router.reset('gameplay');
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
    this.trauma = 0;
    this.shakeTime = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.flashAlpha = 0;
    this.spawnDelay = 0;
    this.resultDelay = 0;
    this.resumeInputLock = 0;

    this.stack = [{ x: 0, z: 0, width: BASE_SIZE, depth: BASE_SIZE, level: 0, hue: this.hueForLevel(0) }];
    this.current = null;

    this.startGroup.active = false;
    this.resultGroup.active = false;
    this.pauseGroup.active = false;
    this.settingsGroup.active = false;
    this.pauseGroup.setScale(1, 1, 1);
    this.leaderboardGroup.active = false;
    this.pauseButton.active = true;
    this.gameplayHudGroup.active = true;
    this.homeBestLabel.node.active = false;
    this.setScore(0, false);
    this.world3D.restoreStack(this.stack);
    this.spawnMovingBlock();
    this.playSound('start', 0.8);
  }

  private spawnMovingBlock(): void {
    const previous = this.stack[this.stack.length - 1];
    const level = previous.level + 1;
    this.moveAxis = level % 2 === 1 ? 'x' : 'z';
    // With the fixed camera, -X enters from upper left and -Z from upper right.
    this.moveDirection = 1;
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
    this.world3D.spawnMovingBlock(this.current);
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
    this.world3D.updateMovingBlock(this.current);

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

    this.resetPerfectFeedback();
    this.addTrauma(0.72);
    this.flashAlpha = this.reducedMotion ? 0 : 0.28;
    this.playSound('end', 0.82);
  }

  private showResultScreen(): void {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.router.reset('result');
    this.recordLeaderboardResult();
    this.updateWorldComposition();
    this.resultSelection = this.reviveUsed ? 1 : 0;
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

    this.lastEarnedCoins = this.testModeEnabled ? 0 : Math.max(0, this.roundPerfectCount - (this.roundRewardedPerfectCount || 0));
    this.roundRewardedPerfectCount = this.roundPerfectCount;
    if (this.lastEarnedCoins > 0) {
      this.coins += this.lastEarnedCoins;
      this.saveEconomy();
    }

    this.updateBestLabel();
    this.updateCoinLabels();
    this.patchPage('result',{title:newBest?COPY.newBest:COPY.gameOver,score:this.score,
      bestText:this.testModeEnabled?`测试成绩 · ${COPY.best} ${this.bestScore}`:`${COPY.best}  ${this.bestScore}`,
      coinText:this.testModeEnabled?COPY.noTestCoins:`${COPY.perfectReward} ${this.roundPerfectCount} 次  ·  ${COPY.coins} +${this.lastEarnedCoins}`});
    this.resultBestLabel.lineHeight = Math.round(this.resultBestLabel.fontSize * 1.2);
    this.resultGroup.active = true;
    this.resultGroup.setScale(this.reducedMotion ? 1 : 0.86, this.reducedMotion ? 1 : 0.86, 1);
    tween(this.resultGroup)
      .to(this.reducedMotion ? 0.01 : 0.24, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private setScore(value: number, animate: boolean): void {
    this.score = value;
    this.patchPage('hud',{score:this.score});
    if(this.stamina)this.uiAdapter.publish();
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
    const visible=!(this.roundWasTest||this.testModeEnabled);
    this.patchPage('hud',{recordGapVisible:visible});
    if(!visible)return;

    const remaining = this.roundBestScore - this.score;
    this.patchPage('hud',{recordGapText:this.roundBestScore === 0
      ? (this.score === 0 ? '创造你的首个纪录' : `首个纪录：${this.score} 层`)
      : remaining > 0
        ? `距最高还差 ${remaining} 层`
        : remaining === 0
          ? '已追平 · 再叠 1 层破纪录'
          : `已超过最高 ${-remaining} 层`});
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
    this.patchPage('hud',{perfectText:this.perfectStreak > 1 ? `${COPY.perfect}  ×${this.perfectStreak}` : COPY.perfect});
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

  private spawnImpactFx(block: StackBlock, perfect: boolean, intensity = 1): void { if(perfect)this.world3D.prepareProjection(this.ui.gameplayFx.node);this.ui.gameplayFx.emitImpact(block,perfect,intensity); }

  private spawnPerfectFrames(block: StackBlock, intensity: number): void { this.ui.gameplayFx.emitPerfectFrames(block,intensity,this.reducedMotion); }

  private perfectFeedbackEnergy(streak: number): number {
    return 1 + Math.log2(Math.max(1, streak));
  }

  private updateParticles(dt: number): void { if(!this.ui.gameplayFx.needsSimulation)return;this.performanceProbe.beginSection('fx');this.ui.gameplayFx.step(dt);this.performanceProbe.endSection('fx'); }

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
    this.flushPageViews();
    const fx=this.ui.gameplayFx;
    fx.setFlash(this.flashAlpha);
    if(fx.needsRender){
      this.performanceProbe.beginSection('fx');
      if(fx.needsProjection)this.world3D.prepareProjection(fx.node);
      fx.render(this.visibleWidth,this.visibleHeight);
      this.frameProjectionCalls+=fx.projectionCallsLastRender;this.frameProjectionCacheHits+=fx.projectionCacheHitsLastRender;
      this.performanceProbe.endSection('fx');
    }
    if(this.renderedPhase !== this.phase || this.renderedOverlay !== this.homeOverlay || this.layoutDirty) {
      this.presenter.invalidate();
      this.uiAdapter.publish();
      this.renderedPhase=this.phase; this.renderedOverlay=this.homeOverlay; this.layoutDirty=false;
    }
    if(this.presenter.pending){this.performanceProbe.beginSection('ui');this.presenter.flush();this.performanceProbe.endSection('ui');}
  }

  private drawOverlay(): void { this.renderer.renderOverlay(this.phase,this.homeOverlay); }

  private initializeAudio(): void {
    this.audioSource = this.node.getComponent(AudioSource)!;
    if (!this.audioSource) throw new Error('StackGame: Canvas AudioSource must be serialized');
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
      const text = this.adNotice || (this.audioReady
        ? (!this.testModeEnabled && this.stamina?.snapshot().amount === 0 ? '体力不足，看视频可恢复'
          : (this.wideLayout ? COPY.startRemote : COPY.start))
        : COPY.loadingAudio);
      this.patchPage('home',{startText:text});
    }
  }

  private updateStaminaUI(): void {
    if (!this.stamina || ![this.startGroup,this.pauseGroup,this.resultGroup,this.settingsGroup].some(node=>node?.activeInHierarchy)) return;
    const now = Date.now();
    const { amount } = this.stamina.snapshot(now);
    if (this.startGroup.active) this.patchPage('home', { staminaText: amount <= STAMINA_CAP ? `${amount}/${STAMINA_CAP}` : amount <= 10 ? `${amount}/10` : `${amount}` });
    // Clamp only the icons: advertising rewards keep their full stored balance.
    this.homeStaminaIcons?.forEach((icon, index) => {
      const available = index < amount;
      icon.grayscale = !available;
      icon.color = available ? new Color(255, 255, 255, 255) : new Color(175, 175, 175, 255);
    });
    const restartText = this.adNotice || (!this.testModeEnabled && amount === 0 ? '体力不足，看视频可恢复' : COPY.restartRound);
    if(this.pauseGroup.active)this.patchPage('pause',{restartText});
    if(this.resultGroup.active)this.patchPage('result',{restartText});
    this.updateAudioPrompt();
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
    if (this.reviveGroup?.active || this.homeOverlay !== 'none' || this.phase === 'ready') {
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
    if (this.homeTransition || this.phase !== 'ready' || this.homeOverlay !== 'none') {
      return;
    }
    this.beginScreenTransition(() => this.openHomeOverlayImmediately(overlay),
      overlay === 'leaderboard' ? 'leaderboard-open' : 'menu-open');
  }

  private openHomeOverlayImmediately(overlay: Exclude<HomeOverlay, 'none'>): void {
    this.homeLeaderboardPreviewRequest += 1;
    this.homeOverlay = overlay;
    this.router.commitPush(overlay,this.homeSelection);
    this.inputRouter.resetActionClock();
    this.startGroup.active = false;
    this.settingsGroup.active = overlay === 'settings';
    this.leaderboardGroup.active = overlay === 'leaderboard';

    const group = overlay === 'settings' ? this.settingsGroup : this.leaderboardGroup;
    if (overlay === 'settings') {
      this.settingsSelection = 0;
      this.updateSettingsUI();
    } else {
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
    this.leaderboardScroll.stopAutoScroll();
    Tween.stopAllByTarget(this.settingsGroup);
    Tween.stopAllByTarget(this.leaderboardGroup);
    this.leaderboardRequest += 1;
    this.leaderboardScroll?.stopAutoScroll();
    this.leaderboardGroup.active = false;
    this.leaderboardGroup.setScale(1, 1, 1);
    this.settingsGroup.active = false;
    this.settingsGroup.setScale(1, 1, 1);
    const previousRoute=this.router.commitPop();
    if(previousRoute)this.homeSelection=previousRoute.returnFocus;
    this.homeOverlay = 'none';
    this.startGroup.active = true;
    this.inputRouter.resetActionClock();
    this.updateHomeMenuFocus();
    this.updateSettingsUI();
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

  private onRestoreStamina(): void {
    if (this.homeOverlay !== 'settings') return;
    this.settingsSelection = 4;
    this.openStaminaReward();
  }

  private onAppearanceToggle(): void {
    if (this.homeOverlay !== 'settings') return;
    this.settingsSelection = 5;
    this.creamAppearance = this.creamAppearance === 'standard' ? 'bright' : 'standard';
    this.world3D.setAppearance(this.creamAppearance);
    const saved = saveCreamAppearance(sys.localStorage, this.creamAppearance);
    this.nicknameStatus = saved ? '画面风格已保存 · 立即生效' : '画面本次生效 · 本机存储不可用';
    this.updateSettingsUI();
  }

  private moveSettingsSelection(direction: number): void {
    this.settingsSelection = (this.settingsSelection + (direction > 0 ? 1 : -1) + 7) % 7;
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
    } else if (this.settingsSelection === 4) {
      this.onRestoreStamina();
    } else if (this.settingsSelection === 5) {
      this.onAppearanceToggle();
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
    this.router.push('pause',this.pauseSelection);
    this.updateWorldComposition();
    this.world3D.setPaused(true);
    this.pauseSelection = 0;
    this.resumeInputLock = 0;
    this.inputRouter.resetActionClock();
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
    this.router.pop();
    this.updateWorldComposition();
    this.world3D.setPaused(false);
    this.pauseButton.active = true;
    this.gameplayHudGroup.active = true;
    this.testModeBadgeLabel.node.active = this.testModeEnabled;
    this.resumeInputLock = 0.14;
    this.inputRouter.resetActionClock();
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
    if (this.reviveGroup?.active) this.closeRevive();
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
    this.transitionController.begin({duration:this.homeTransition.outSeconds+this.homeTransition.inSeconds,
      onProgress:()=>{},onComplete:()=>this.finishScreenTransition(),onCancel:()=>{this.restoreTransitionViews();this.homeTransition=null;}});
    // Keep residual impact flashes out of navigation, without touching physics.
    this.ui.gameplayFx.clear();
    this.ui.gameplayFx.node.active = false;
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
      const opacity = node.getComponent(UIOpacity);
      if(!opacity) throw new Error('Missing prefab UIOpacity: '+node.name);
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
    return 6;
  }

  private screenDimmerAlpha(): number {
    if (this.phase === 'ready') return this.homeOverlay === 'none' ? this.homeDimmerAlpha() : MENU_DIMMER_MAX_ALPHA;
    return this.phase === 'paused' || this.phase === 'gameover' ? MENU_DIMMER_MAX_ALPHA : 0;
  }

  private drawScreenDimmer(alpha: number): void { this.renderer.renderDimmer(alpha); }

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
    this.transitionController.cancel();
    this.transitionBlocker.active = false;
    this.ui.gameplayFx.node.active = true;
    this.world3D.setPresentationOpacity(1);
    this.world3D.setPaused(this.phase === 'paused');
    if (transition?.pauseOnComplete && (this.phase === 'playing' || this.phase === 'dropping')) this.pauseGame();
    this.inputRouter.resetActionClock();
    this.drawScreenDimmer(this.screenDimmerAlpha());
  }

  private updateResultFocus(): void {
    const layout = this.panelLayout('result');
    if (this.reviveUsed && this.resultSelection === 0) this.resultSelection = 1;
    const visibleButtons = (this.reviveUsed ? [this.resultRestartButton, this.resultHomeButton]
      : [this.resultReviveButton, this.resultRestartButton, this.resultHomeButton]).filter(Boolean);
    visibleButtons.forEach((button, index) => this.layoutPanelButton(button, layout.panelX, layout.buttonYs[index],
      layout.buttonWidth, layout.buttonHeight, layout.bodyFont));
    if (this.resultReviveButton) {
      this.patchPage('result',{reviveEnabled:!this.reviveUsed,reviveText:'看视频 · 复活'});
      this.drawOverlayButton(this.resultReviveButton, layout.buttonWidth, layout.buttonHeight, this.resultSelection === 0);
    }
    this.drawOverlayButton(this.resultRestartButton, layout.buttonWidth, layout.buttonHeight, this.resultSelection === 1);
    this.drawOverlayButton(this.resultHomeButton, layout.buttonWidth, layout.buttonHeight, this.resultSelection === 2);
  }

  private activateResultSelection(): void {
    if (this.resultSelection === 0) void this.openRevive();
    else if (this.resultSelection === 1) this.tryRestartAction();
    else this.returnToHome();
  }

  private moveResultSelection(direction: number): void {
    const first = this.reviveUsed ? 1 : 0;
    const count = 3 - first;
    this.resultSelection = first + (this.resultSelection - first + direction + count) % count;
    this.updateResultFocus();
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
    this.inputRouter.clear();
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
      if (!this.inputRouter.keyDown(keyCode)) return;
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
    if (!isActionKey || !this.inputRouter.keyDown(keyCode)) {
      return;
    }
    // Remember keys pressed during a transition until keyup, so a held remote
    // confirm cannot fall through to the freshly revealed round.
    if (this.homeTransition) return;

    if (this.reviveGroup?.active) {
      if (isBackKey) this.closeRevive();
      else if (isConfirmKey) this.onRewardDialogAction();
      return;
    }

    if (this.phase === 'gameover') {
      if (isBackKey) this.returnToHome();
      else if (isMenuNavigation) {
        this.moveResultSelection(keyCode === KeyCode.ARROW_UP || keyCode === KeyCode.ARROW_LEFT
          || keyCode === KeyCode.KEY_W || keyCode === KeyCode.KEY_A ? -1 : 1);
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
    this.inputRouter.keyUp(event.keyCode as number);
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
    if (this.reviveGroup?.active) {
      if (eastJustPressed || optionsJustPressed) this.closeRevive();
      else if (southJustPressed) this.onRewardDialogAction();
      return;
    }
    if (this.phase === 'gameover') {
      if (eastJustPressed) this.returnToHome();
      else if (menuAxisJustPressed) {
        this.moveResultSelection(Math.abs(menuAxisY) >= Math.abs(menuAxisX)
          ? (menuAxisY < 0 ? 1 : -1) : (menuAxisX > 0 ? 1 : -1));
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
        }
      }
      if (southJustPressed) {
        if (this.homeOverlay === 'leaderboard') {
          this.activateLeaderboardSelection();
        } else if (this.homeOverlay === 'settings') {
          this.activateSettingsSelection();
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
    this.updateStaminaUI();

    this.updateSettingsUI();
  }

  private consumeActionDebounce(): boolean {
    return this.inputRouter.acceptAction(!!this.homeTransition || this.router.transitionLocked,90);
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
    const visible=view.getVisibleSize(), frame=screen.windowSize;
    const safe=sys.getSafeAreaRect();
    this.layoutService.update({width:visible.width,height:visible.height,frameWidth:frame.width,frameHeight:frame.height,
      safeLeft:Math.max(0,safe.x),safeBottom:Math.max(0,safe.y),safeRight:Math.max(0,frame.width-safe.x-safe.width),safeTop:Math.max(0,frame.height-safe.y-safe.height),pixelRatio:sys.isBrowser?window.devicePixelRatio:1});
  }

  private applyViewportLayout(): void {
    this.layoutDirty = true;
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

    this.node.getComponent(UITransform)?.setContentSize(visible);
    this.graphics?.getComponent(UITransform)?.setContentSize(visible);
    this.ui.gameplayFx.node.getComponent(UITransform).setContentSize(visible);
    this.ui.node.getComponent(UITransform)?.setContentSize(visible);
    this.screenDimmer.node.getComponent(UITransform).setContentSize(visible);
    this.hudSafeRoot?.getComponent(UITransform)?.setContentSize(visible);
    this.hudSafeRoot?.getComponent(SafeArea)?.updateArea();
    this.ui.node.getComponent(Widget)?.updateAlignment();
    this.ui.pageLayoutRoots.forEach((layout,index)=>{
      layout.getComponent(Widget)?.updateAlignment();
      this.ui.pageVisualRoots[index].getComponent(UITransform).setContentSize(layout.getComponent(UITransform).contentSize);
    });
    this.applyResponsiveLayout();
    this.updateWorldComposition();

    this.controlsLabel.node.active = true;
    this.precisionTipLabel.node.active = false;
    this.updateAudioPrompt();
    this.applyCreamStyleToUI();
    if (this.phase === 'paused') {
      this.drawFrame();
    }
  }


  private loadSettings(): void {
    this.creamAppearance = loadCreamAppearance(sys.localStorage);
    // Retired appearance choices must never affect the fixed cream style.
    // Clean each key independently so unavailable storage cannot reset progress.
    for (const key of ['wxstack-selected-skin', 'wxstack-owned-skins']) {
      try {
        sys.localStorage.removeItem(key);
      } catch {
        // The old value is ignored even when it cannot be removed.
      }
    }
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

  private updateBestLabel(): void { this.patchPage('hud',{bestScore:this.bestScore});this.patchPage('home',{bestScore:this.bestScore});if(this.stamina)this.uiAdapter.publish(); }

  private updateCoinLabels(): void { this.patchPage('home',{coins:this.coins});if(this.stamina)this.uiAdapter.publish(); }

  private notifyBrowserReady(): void {
    if (this.browserReadyNotified || !sys.isBrowser || typeof window === 'undefined') {
      return;
    }
    this.browserReadyNotified = true;
    // All cream visuals are created synchronously. Keep the cover through two
    // rendered frames, including first-use material preparation.
    director.once(Director.EVENT_AFTER_DRAW, () => {
      director.once(Director.EVENT_AFTER_DRAW, () => {
        if (this.isValid && this.uiReady && !this.uiSuspended) window.dispatchEvent(new Event('stack-game-ready'));
      });
    });
  }

  private hueForLevel(level: number): number {
    return (166 + level * 5) % 360;
  }

  private applyCreamStyleToUI(): void {
    if (!this.startGroup?.isValid) {
      return;
    }
    const style = CREAM_STYLE;
    const text = this.rgb(style.textColor);
    const panelText = text;

    this.setNamedLabelColor(this.startGroup, 'Title', panelText);
    this.setNamedLabelColor(this.startGroup, 'Eyebrow', panelText);
    this.setNamedLabelColor(this.startGroup, 'Subtitle', panelText);
    this.startPromptLabel.color = this.textOnButton(style.buttonColor);
    this.controlsLabel.color = panelText;
    this.precisionTipLabel.color = panelText;
    this.homeCoinLabel.color = panelText;
    this.homeBestLabel.color = panelText;
    this.homeBestCaption.color = new Color(panelText.r, panelText.g, panelText.b, 215);
    this.homeCoinCaption.color = new Color(panelText.r, panelText.g, panelText.b, 215);
    const home=this.homeLayout();
    this.ui.homeStatVisuals.forEach((badge,i)=>{badge.reset();badge.box(home.statWidth,home.statsHeight,22,new Color(panelText.r,panelText.g,panelText.b,16),this.rgb(style.accentColor,80),1.5,i===0?-home.statOffset:home.statOffset);});
    this.testModeBadgeLabel.color = text;
    this.perfectLabel.color = new Color(114, 66, 84);

    this.resultTitleLabel.color = panelText;
    this.resultScoreLabel.color = panelText;
    this.resultBestLabel.color = new Color(panelText.r, panelText.g, panelText.b, 220);
    this.resultCoinLabel.color = panelText;
    this.setNamedLabelColor(this.resultGroup, 'Restart', new Color(panelText.r, panelText.g, panelText.b, 235));

    this.pauseButtonLabel.color = this.textOnButton(style.buttonColor);
    this.setNamedLabelColor(this.pauseGroup, 'PauseTitle', panelText);
    this.setNamedLabelColor(this.pauseGroup, 'PauseHint', new Color(panelText.r, panelText.g, panelText.b, 225));
    this.setNamedLabelColor(this.pauseGroup, 'PauseControls', new Color(panelText.r, panelText.g, panelText.b, 225));

    this.setNamedLabelColor(this.settingsGroup, 'SettingsTitle', panelText);
    this.setNamedLabelColor(this.settingsGroup, 'SettingsHint', new Color(panelText.r, panelText.g, panelText.b, 225));

    this.updateHomeMenuFocus();
    this.drawGameplayHudCards();
    this.updateTestModeUI();
    this.updatePauseMenuFocus();
    this.updateSettingsUI();
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
      subtitleY: 230 * verticalScale, statsY: 122 * verticalScale,
      statsHeight: 140 * verticalScale, statWidth, statOffset: (statWidth + 24) / 2,
      buttonWidth, buttonHeight: 116 * verticalScale,
      startY: -112 * verticalScale, rankY: -264 * verticalScale, settingsY: -416 * verticalScale,
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
    if (this.homeStaminaLabel) {
      const gapTop = layout.statsY - layout.statsHeight / 2;
      const gapBottom = layout.startY + layout.buttonHeight / 2;
      const iconSize = Math.min(52, (gapTop - gapBottom) * 0.68);
      const spacing = iconSize * 0.32;
      const step = iconSize + spacing;
      const y = (gapTop + gapBottom) / 2;
      this.homeStaminaLabel.node.active = true;
      const numberWidth = 100;
      const numberGap = 18;
      const iconsWidth = (STAMINA_CAP - 1) * step + iconSize;
      const rowLeft = x - (iconsWidth + numberGap + numberWidth) / 2;
      place(this.homeStaminaLabel, rowLeft + iconsWidth + numberGap + numberWidth / 2, y, numberWidth, 44, layout.split ? 30 : 28);
      this.homeStaminaLabel.isBold = true;
      this.homeStaminaLabel.overflow = Label.Overflow.SHRINK;
      this.homeStaminaIcons.forEach((icon, index) => {
        icon.node.setPosition(rowLeft + iconSize / 2 + index * step, y, 0);
        icon.node.getComponent(UITransform)!.setContentSize(iconSize, iconSize);
      });
    }

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

  private drawProjectorPanel(g: StackUIVisual, layout: {panelX:number;panelWidth:number;panelHeight:number}): void { this.renderer.renderPanel(g,layout); }

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
        { node: this.testModeToggle, graphics: this.testModeToggleGraphics, label: this.testModeToggleLabel }, this.nicknameButton, this.restoreStaminaButton, this.appearanceToggle, this.settingsCloseButton]],
      ['pause', this.pauseGroup, 'PauseTitle', 'PauseHint', [
        { node: this.resumeButton, graphics: this.resumeButtonGraphics, label: this.resumeButtonLabel },
        { node: this.restartButton, graphics: this.restartButtonGraphics, label: this.restartButtonLabel },
        { node: this.homeButton, graphics: this.homeButtonGraphics, label: this.homeButtonLabel }]],
      ['result', this.resultGroup, 'ResultTitle', '', (this.reviveUsed ? [this.resultRestartButton, this.resultHomeButton] : [this.resultReviveButton, this.resultRestartButton, this.resultHomeButton]).filter(Boolean)],
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
    this.applyHomeLayout();
    this.applyProjectorLayout();
    this.layoutReviveUI();
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
