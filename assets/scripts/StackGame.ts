import {
  _decorator,
  AudioClip,
  AudioSource,
  Button,
  Color,
  Component,
  EventGamepad,
  EventKeyboard,
  Graphics,
  input,
  Input,
  KeyCode,
  Label,
  Node,
  profiler,
  ResolutionPolicy,
  resources,
  SafeArea,
  screen,
  sys,
  tween,
  Tween,
  UITransform,
  UIOpacity,
  Vec3,
  view,
  Widget,
} from 'cc';

const { ccclass } = _decorator;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const BASE_SIZE = 5;
const BLOCK_HEIGHT = 44;
const MOVE_RANGE = 6.1;
const PERFECT_THRESHOLD = 0.14;
const STORAGE_KEY = 'wxstack-best-score';
const NATURAL_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MAJOR_NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'] as const;

const COPY = {
  title: '叠叠塔',
  subtitle: '让每一次落点都恰到好处',
  start: '点击屏幕开始',
  loadingAudio: '正在准备音效…',
  controls: '触屏 · 鼠标 · 空格键 · T 键测试 · 手柄确认键',
  precision: '连续精准落点可触发完美连击',
  best: '最高分',
  perfect: '完美',
  perfectTest: '完美测试',
  testOn: '开',
  testOff: '关',
  testing: '测试中',
  testScore: '测试成绩 · 不计最高分',
  gameOver: '塔止于此',
  restart: '点击任意处重新开始',
  newBest: '新纪录',
};

type GamePhase = 'ready' | 'playing' | 'falling' | 'gameover';
type MoveAxis = 'x' | 'z';

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

@ccclass('StackGame')
export class StackGame extends Component {
  private graphics!: Graphics;
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
  private testModeEnabled = false;
  private moveAxis: MoveAxis = 'x';
  private moveDirection = 1;
  private moveSpeed = 6.4;
  private spawnDelay = 0;
  private resultDelay = 0;
  private restartLock = 0;

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
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.on(Input.EventType.GAMEPAD_INPUT, this.onGamepadInput, this);
    view.on('canvas-resize', this.onCanvasResize, this);
    view.on('design-resolution-changed', this.onCanvasResize, this);
  }

  onDisable(): void {
    this.graphics.node.off(Node.EventType.TOUCH_END, this.onPointerAction, this);
    this.testModeToggle.off(Button.EventType.CLICK, this.onTestModeToggle, this);
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
    input.off(Input.EventType.GAMEPAD_INPUT, this.onGamepadInput, this);
    view.off('canvas-resize', this.onCanvasResize, this);
    view.off('design-resolution-changed', this.onCanvasResize, this);
    this.heldKeys.clear();
    this.gamepadSouthHeld = false;
    this.gamepadOptionsHeld = false;
    this.gamepadNorthHeld = false;
  }

  update(dt: number): void {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.promptTime += elapsed;
    this.restartLock = Math.max(0, this.restartLock - elapsed);

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

    this.flashAlpha = Math.max(0, this.flashAlpha - elapsed * 3.8);
    this.drawFrame();
    this.animatePrompt();
  }

  private buildStage(): void {
    const canvasTransform = this.node.getComponent(UITransform);
    if (!canvasTransform) {
      this.node.addComponent(UITransform);
    }

    const graphicsNode = this.makeNode('StackRenderer', this.node);
    graphicsNode.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    this.graphics = graphicsNode.addComponent(Graphics);

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
    this.anchorTopLeft(this.testModeBadgeLabel.node, 34, 32);
    this.testModeBadgeLabel.node.active = false;

    this.perfectLabel = this.makeLabel('Perfect', this.hudSafeRoot, COPY.perfect, 42, new Color(255, 255, 255, 255), 420, 72);
    this.anchorCenter(this.perfectLabel.node, 0, 248);
    this.perfectOpacity = this.perfectLabel.node.addComponent(UIOpacity);
    this.perfectOpacity.opacity = 0;

    this.startGroup = this.makeFullNode('StartScreen', this.hudSafeRoot);
    this.buildTestModeToggle();
    this.makeCenteredLabel('Title', this.startGroup, COPY.title, 104, 214, 500, 130, new Color(255, 255, 255, 255));
    this.makeCenteredLabel('Subtitle', this.startGroup, COPY.subtitle, 30, 120, 620, 66, new Color(255, 255, 255, 225));
    this.startPromptLabel = this.makeCenteredLabel('StartPrompt', this.startGroup, this.audioReady ? COPY.start : COPY.loadingAudio, 38, -48, 560, 84, new Color(255, 255, 255, 255));
    this.controlsLabel = this.makeCenteredLabel('Controls', this.startGroup, COPY.controls, 24, -124, 650, 56, new Color(255, 255, 255, 185));
    this.precisionTipLabel = this.makeCenteredLabel('PrecisionTip', this.startGroup, COPY.precision, 22, -475, 660, 56, new Color(255, 255, 255, 155));

    this.resultGroup = this.makeFullNode('ResultScreen', this.hudSafeRoot);
    this.resultTitleLabel = this.makeCenteredLabel('ResultTitle', this.resultGroup, COPY.gameOver, 54, 172, 560, 86, new Color(255, 255, 255, 255));
    this.resultScoreLabel = this.makeCenteredLabel('ResultScore', this.resultGroup, '0', 116, 50, 400, 140, new Color(255, 255, 255, 255));
    this.resultBestLabel = this.makeCenteredLabel('ResultBest', this.resultGroup, '', 28, -56, 560, 68, new Color(255, 255, 255, 220));
    this.makeCenteredLabel('Restart', this.resultGroup, COPY.restart, 30, -180, 620, 76, new Color(255, 255, 255, 235));
    this.resultGroup.active = false;
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
    const g = this.testModeToggleGraphics;
    g.clear();
    g.fillColor = this.testModeEnabled
      ? new Color(7, 45, 54, 164)
      : new Color(7, 31, 43, 108);
    g.roundRect(-138, -36, 276, 72, 36);
    g.fill();
    g.strokeColor = new Color(255, 255, 255, this.testModeEnabled ? 112 : 76);
    g.lineWidth = 2;
    g.roundRect(-138, -36, 276, 72, 36);
    g.stroke();

    g.fillColor = this.testModeEnabled
      ? new Color(255, 255, 255, 218)
      : new Color(255, 255, 255, 46);
    g.roundRect(40, -24, 92, 48, 24);
    g.fill();

    const knobX = this.testModeEnabled ? 108 : 64;
    g.fillColor = this.testModeEnabled
      ? new Color(24, 82, 92, 255)
      : new Color(255, 255, 255, 220);
    g.circle(knobX, 0, 18);
    g.fill();

    this.testModeToggleLabel.color = new Color(255, 255, 255, this.testModeEnabled ? 255 : 185);
    this.testModeStatusLabel.string = this.testModeEnabled ? COPY.testOn : COPY.testOff;
    this.testModeStatusLabel.color = this.testModeEnabled
      ? new Color(18, 66, 76, 255)
      : new Color(255, 255, 255, 205);
    this.testModeStatusLabel.node.setPosition(this.testModeEnabled ? 64 : 108, 0, 0);
    this.testModeBadgeLabel.node.active = this.testModeEnabled && this.phase !== 'ready';
  }

  private showReadyScreen(): void {
    this.phase = 'ready';
    this.updateTestModeUI();
    this.resetPerfectFeedback();
    this.score = 0;
    this.resetPerfectChain();
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
    this.scoreLabel.node.active = false;
    this.bestLabel.node.active = true;
    this.updateBestLabel();
    this.updateAudioPrompt();
  }

  private startGame(): void {
    if (!this.audioReady) {
      this.updateAudioPrompt();
      return;
    }
    Tween.stopAllByTarget(this.resultGroup);
    this.resetPerfectFeedback();
    this.phase = 'playing';
    this.updateTestModeUI();
    this.score = 0;
    this.resetPerfectChain();
    this.moveSpeed = 6.4;
    this.cameraY = 0;
    this.targetCameraY = 0;
    this.trauma = 0;
    this.flashAlpha = 0;
    this.spawnDelay = 0;
    this.resultDelay = 0;
    this.fallingPieces = [];
    this.sparks = [];
    this.rings = [];
    this.perfectFrames = [];
    this.stack = [{ x: 0, z: 0, width: BASE_SIZE, depth: BASE_SIZE, level: 0, hue: this.hueForLevel(0) }];
    this.current = null;

    this.startGroup.active = false;
    this.resultGroup.active = false;
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
    if (!this.current || this.spawnDelay > 0) {
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

    this.stack.push(placed);
    this.current = null;
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
    }
  }

  private handlePerfectPlacement(placed: StackBlock): void {
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
    this.current = null;
    this.phase = 'falling';
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
    let newBest = false;
    if (!this.testModeEnabled && this.score > this.bestScore) {
      this.bestScore = this.score;
      newBest = true;
      this.saveBestScore();
    }

    this.updateBestLabel();
    this.resultTitleLabel.string = newBest ? COPY.newBest : COPY.gameOver;
    this.resultScoreLabel.string = `${this.score}`;
    this.resultBestLabel.string = this.testModeEnabled
      ? `${COPY.testScore}\n${COPY.best}  ${this.bestScore}`
      : `${COPY.best}  ${this.bestScore}`;
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
    g.clear();
    this.drawBackground(g);
    this.drawTowerShadow(g);
    this.drawGuidePlatform(g);

    for (const block of this.stack) {
      this.drawBlock(g, block, 0, 0, 255);
    }
    if (this.current) {
      this.drawBlock(g, this.current, 0, 0, 255);
    }
    for (const piece of this.fallingPieces) {
      this.drawBlock(g, piece, piece.offsetY, piece.rotation, Math.max(0, piece.opacity), piece.offsetX);
    }

    this.drawEffects(g);
    this.drawOverlay(g);
    if (this.flashAlpha > 0) {
      g.fillColor = new Color(255, 255, 255, Math.round(this.flashAlpha * 255));
      g.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
      g.fill();
    }
  }

  private drawBackground(g: Graphics): void {
    const hue = 187 + Math.min(72, this.score * 2.15);
    const bands = 28;
    const bandHeight = this.visibleHeight / bands + 1;
    for (let band = 0; band < bands; band += 1) {
      const t = band / Math.max(1, bands - 1);
      g.fillColor = this.hslToColor(hue + t * 13, 56 + t * 5, 53 - t * 9);
      g.rect(
        -this.visibleWidth * 0.5,
        -this.visibleHeight * 0.5 + band * bandHeight,
        this.visibleWidth,
        bandHeight,
      );
      g.fill();
    }

    g.fillColor = new Color(255, 255, 255, 13);
    for (let index = 0; index < 14; index += 1) {
      const seed = index * 97.13;
      const x = ((Math.sin(seed) + 1) * 0.5 - 0.5) * this.visibleWidth * 0.92;
      const y = ((Math.sin(seed * 2.17 + 1.2) + 1) * 0.5 - 0.5) * this.visibleHeight * 0.82;
      const size = 1.5 + (index % 4) * 0.8;
      g.circle(x, y, size);
      g.fill();
    }
  }

  private drawTowerShadow(g: Graphics): void {
    const base = this.project(0, 0, 0);
    for (let index = 4; index >= 1; index -= 1) {
      const scale = index / 4;
      g.fillColor = new Color(12, 42, 58, Math.round(9 + scale * 9));
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
    g.strokeColor = new Color(255, 255, 255, 28);
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

    const rawTop = this.topPoints(block).map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }));
    const center = rawTop.reduce((acc, point) => ({ x: acc.x + point.x / 4, y: acc.y + point.y / 4 }), { x: 0, y: 0 });
    const top = rotation === 0 ? rawTop : rawTop.map((point) => this.rotatePoint(point, center, rotation));
    const down = (point: Point2): Point2 => {
      const lowered = { x: point.x, y: point.y - BLOCK_HEIGHT };
      return rotation === 0 ? lowered : this.rotatePoint(lowered, center, rotation);
    };
    const bottom = top.map((_, index) => down(rawTop[index]));

    const topColor = this.hslToColor(block.hue, 72, 65, opacity);
    const leftColor = this.shade(topColor, 0.74, opacity);
    const rightColor = this.shade(topColor, 0.58, opacity);

    this.fillPolygon(g, [top[3], top[0], bottom[0], bottom[3]], leftColor);
    this.fillPolygon(g, [top[0], top[1], bottom[1], bottom[0]], rightColor);
    this.fillPolygon(g, top, topColor);

    g.strokeColor = new Color(255, 255, 255, Math.round(opacity * 0.28));
    g.lineWidth = 1.15;
    g.moveTo(top[3].x, top[3].y);
    g.lineTo(top[2].x, top[2].y);
    g.lineTo(top[1].x, top[1].y);
    g.stroke();
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
    if (this.phase === 'ready') {
      g.fillColor = new Color(7, 31, 43, 22);
      g.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
      g.fill();

      const pulse = 0.5 + 0.5 * Math.sin(this.promptTime * 2.8);
      g.fillColor = new Color(255, 255, 255, 24 + Math.round(pulse * 14));
      g.roundRect(-178, -104, 356, 94, 47);
      g.fill();
      g.strokeColor = new Color(255, 255, 255, 76 + Math.round(pulse * 64));
      g.lineWidth = 2;
      g.roundRect(-178, -104, 356, 94, 47);
      g.stroke();
    } else if (this.phase === 'gameover') {
      g.fillColor = new Color(6, 22, 34, 98);
      g.rect(-this.visibleWidth * 0.5, -this.visibleHeight * 0.5, this.visibleWidth, this.visibleHeight);
      g.fill();
      g.fillColor = new Color(255, 255, 255, 25);
      g.roundRect(-245, -285, 490, 520, 34);
      g.fill();
      g.strokeColor = new Color(255, 255, 255, 48);
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
    this.tryPrimaryAction();
  }

  private onTestModeToggle(): void {
    this.toggleTestMode();
  }

  private onKeyDown(event: EventKeyboard): void {
    const isActionKey = event.keyCode === KeyCode.SPACE
      || event.keyCode === KeyCode.ENTER
      || event.keyCode === KeyCode.KEY_R
      || event.keyCode === KeyCode.KEY_T;
    if (!isActionKey || this.heldKeys.has(event.keyCode)) {
      return;
    }
    this.heldKeys.add(event.keyCode);

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
    const northJustPressed = northPressed && !this.gamepadNorthHeld;
    const southJustPressed = southPressed && !this.gamepadSouthHeld;
    const optionsJustPressed = optionsPressed && !this.gamepadOptionsHeld;
    this.gamepadSouthHeld = southPressed;
    this.gamepadOptionsHeld = optionsPressed;
    this.gamepadNorthHeld = northPressed;

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
    } else if (this.phase === 'playing') {
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
    if (this.consumeActionDebounce()) {
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
    this.graphics?.node.getComponent(UITransform)?.setContentSize(visible);
    this.hudSafeRoot?.getComponent(UITransform)?.setContentSize(visible);
    this.hudSafeRoot?.getComponent(SafeArea)?.updateArea();

    const isShortPortrait = frame.width <= frame.height && this.visibleWidth / this.visibleHeight >= 0.54;
    this.controlsLabel.node.active = !isShortPortrait;
    this.precisionTipLabel.fontSize = isShortPortrait ? 28 : 22;
    this.precisionTipLabel.lineHeight = isShortPortrait ? 34 : 26;
    this.precisionTipLabel.color = isShortPortrait
      ? new Color(255, 255, 255, 225)
      : new Color(255, 255, 255, 155);
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
      const stored = Number.parseInt(sys.localStorage.getItem(STORAGE_KEY) || '0', 10);
      this.bestScore = Number.isFinite(stored) ? Math.max(0, stored) : 0;
      const prefersReducedMotion = sys.isBrowser
        && typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.reducedMotion = sys.localStorage.getItem('wxstack-reduced-motion') === '1' || prefersReducedMotion;
    } catch {
      this.bestScore = 0;
      this.reducedMotion = false;
    }
  }

  private saveBestScore(): void {
    try {
      sys.localStorage.setItem(STORAGE_KEY, `${this.bestScore}`);
    } catch {
      // Private browsing and some mini-game runtimes can reject storage writes.
    }
  }

  private updateBestLabel(): void {
    this.bestLabel.string = `${COPY.best}\n${this.bestScore}`;
  }

  private hueForLevel(level: number): number {
    return (86 + level * 16.5) % 360;
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
