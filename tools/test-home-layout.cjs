// Geometry and construction contracts for the projector-friendly home screen.
// These tests do not substitute for rendering/focus QA on a physical projector.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));

class Node {
  components = new Map();
  events = new Map();
  children = [];
  active = true;
  isValid = true;
  position = { x: 0, y: 0, z: 0 };
  static EventType = { TOUCH_END: 'touch-end' };
  constructor(name) { this.name = name; }
  set parent(value) { this._parent = value; value.children.push(this); }
  get parent() { return this._parent; }
  get worldPosition() {
    const parent = this.parent?.worldPosition ?? { x: 0, y: 0, z: 0 };
    return { x: parent.x + this.position.x, y: parent.y + this.position.y, z: parent.z + this.position.z };
  }
  addComponent(Type) {
    const component = new Type(); component.node = this; this.components.set(Type, component);
    if (Type === EditBox) component.activeHierarchyWhenAdded = visibleInHierarchy(this);
    component.initializeDefaultLabels?.();
    return component;
  }
  getComponent(Type) { return this.components.get(Type); }
  getChildByName(name) { return this.children.find(child => child.name === name); }
  setPosition(x, y, z) { this.position = { x, y, z }; }
  setScale(x, y, z) { this.scale = { x, y, z }; }
  on(name, callback, target) { this.events.set(name, { callback, target }); }
  off(name, callback, target) {
    const binding = this.events.get(name);
    if (binding?.callback === callback && binding.target === target) this.events.delete(name);
  }
  emit(name) { const binding = this.events.get(name); binding?.callback.call(binding.target); }
}
class UITransform {
  setContentSize(width, height) {
    this.width = typeof width === 'object' ? width.width : width;
    this.height = typeof width === 'object' ? width.height : height;
  }
  setAnchorPoint(x, y) { this.anchorPoint = { x, y }; }
}
class Button { static Transition = { NONE: 0 }; static EventType = { CLICK: 'click' }; }
class ScrollView {
  static EventType = { SCROLLING: 'scrolling' };
  getScrollOffset() { return { x: 0, y: (this.content?.position.y ?? 0) - (this.node.getComponent(UITransform).height ?? 0) / 2 }; }
  getMaxScrollOffset() { return { x: 0, y: Math.max(0, this.content.getComponent(UITransform).height - this.node.getComponent(UITransform).height) }; }
  stopAutoScroll() {}
  scrollToOffset(offset, time) { this.lastTime = time; this.content.setPosition(0, this.node.getComponent(UITransform).height / 2 + offset.y, 0); }
  scrollToTop() { this.scrollToOffset({ y: 0 }, 0); }
}
class EditBox {
  static provideDefaultLabels = false;
  static InputMode = { SINGLE_LINE: 6 };
  static InputFlag = { DEFAULT: 5 };
  static KeyboardReturnType = { DONE: 1 };
  static EventType = { EDITING_DID_BEGAN: 'editing-did-began', EDITING_DID_ENDED: 'editing-did-ended',
    EDITING_RETURN: 'editing-return', TEXT_CHANGED: 'text-changed' };
  string = '';
  focused = false;
  focus() { this.focused = true; this.node?.emit(EditBox.EventType.EDITING_DID_BEGAN); }
  blur() { const wasFocused = this.focused; this.focused = false; if (wasFocused) this.node?.emit(EditBox.EventType.EDITING_DID_ENDED); }
  isFocused() { return this.focused; }
  initializeDefaultLabels() {
    if (!EditBox.provideDefaultLabels) return;
    for (const [field, name] of [['textLabel', 'TEXT_LABEL'], ['placeholderLabel', 'PLACEHOLDER_LABEL']]) {
      const node = new Node(name);
      node.parent = this.node;
      node.addComponent(UITransform).setContentSize(480, 80);
      this[field] = node.addComponent(Label);
    }
    this.defaultTextLabel = this.textLabel;
    this.defaultPlaceholderLabel = this.placeholderLabel;
  }
}
class Label {
  static HorizontalAlign = { CENTER: 0, LEFT: 1 };
  static VerticalAlign = { CENTER: 0 };
  static Overflow = { SHRINK: 0 };
}
class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) { Object.assign(this, { r, g, b, a }); }
  static WHITE = new Color();
}
const cc = {
  _decorator: { ccclass: () => Type => Type }, Component: class {},
  Node, UITransform, Button, EditBox, Label, Color, ScrollView,
  MaskComponent: class { static Type = { GRAPHICS_RECT: 0 }; },
  Vec2: class { constructor(x, y) { Object.assign(this, { x, y }); } },
  BlockInputEvents: class {}, Graphics: class {
    constructor() { Object.assign(this, recordingGraphics()); }
  }, Widget: class {},
  UIOpacity: class { opacity = 255; },
  Vec3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
  Tween: { stopAllByTarget() {} },
  tween: () => ({ to() { return this; }, start() {} }),
  KeyCode: {}, sys: { isBrowser: false, localStorage: null },
  Input: { EventType: { KEY_DOWN: 'down', KEY_UP: 'up', GAMEPAD_INPUT: 'gamepad' } },
  input: { on() {}, off() {} }, game: { on() {}, off() {} }, Game: { EVENT_HIDE: 'hide' },
  view: { on() {}, off() {}, getVisibleSize: () => ({ width: 750, height: 1334 }) },
  screen: { windowSize: { width: 750, height: 1334 } },
};
const sourcePath = path.join(__dirname, '../assets/scripts/StackGame.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const syntax = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
} }).outputText;
function loadPlainModule(name) {
  const runtime = { exports: {} };
  const moduleSource = fs.readFileSync(path.join(__dirname, `../assets/scripts/${name}.ts`), 'utf8');
  vm.runInNewContext(ts.transpileModule(moduleSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  } }).outputText, runtime);
  return runtime.exports;
}
const loadLayoutModule = () => loadPlainModule('ProjectorLayout');
const leaderboardData = loadPlainModule('Leaderboard');
const sandbox = { exports: {}, require: id => id === 'cc' ? cc
  : id === './ProjectorLayout' ? loadLayoutModule()
  : id === './Leaderboard' ? leaderboardData : {} };
vm.runInNewContext(compiled, sandbox);
const GamePrototype = sandbox.exports.StackGame.prototype;

function gameFor(width, height) {
  const game = Object.create(GamePrototype);
  game.visibleHeight = 1334;
  game.visibleWidth = width / height * game.visibleHeight;
  return game;
}

function descendants(node, predicate) {
  const found = [];
  const visit = value => { if (predicate(value)) found.push(value); ts.forEachChild(value, visit); };
  visit(node);
  return found;
}

const frames = [
  [1920, 1080, true], [1280, 720, true], [1024, 768, true],
  [390, 844, false], [3840, 2160, true], [2560, 1080, true],
];

for (const [width, height] of [...frames, [320, 568], [360, 800]]) {
  test(`canvas resize ${width}x${height}: root and its UI camera share the visible center without moving the scene world`, t => {
    const previousVisibleSize = cc.view.getVisibleSize;
    const previousFrame = cc.screen.windowSize;
    t.after(() => { cc.view.getVisibleSize = previousVisibleSize; cc.screen.windowSize = previousFrame; });
    const sceneData = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/scenes/Stack.scene'), 'utf8'));
    const canvasId = sceneData.findIndex(item => item.__type__ === 'cc.Node' && item._name === 'Canvas');
    const canvasAsset = sceneData[canvasId];
    const cameraAsset = canvasAsset._children.map(child => sceneData[child.__id__]).find(child => child._name === 'Camera');
    assert.equal(cameraAsset._parent.__id__, canvasId, 'the live scene keeps the UI camera under Canvas');
    assert.equal(cameraAsset._lpos.x, 0);
    assert.equal(cameraAsset._lpos.y, 0);
    const scene = new Node('Scene');
    const canvas = new Node('Canvas');
    canvas.parent = scene;
    canvas.setPosition(canvasAsset._lpos.x, canvasAsset._lpos.y, canvasAsset._lpos.z);
    canvas.addComponent(UITransform);
    const camera = new Node('Camera');
    camera.parent = canvas;
    camera.setPosition(cameraAsset._lpos.x, cameraAsset._lpos.y, cameraAsset._lpos.z);
    const input = new Node('NicknameInput');
    input.parent = canvas;
    input.setPosition(0, 28, 0);
    const world = new Node('StackWorld3D');
    world.parent = scene;
    world.setPosition(4, 5, 6);
    const worldPosition = { ...world.worldPosition };
    const cameraLocalPosition = { ...camera.position };
    const inputLocalPosition = { ...input.position };
    const initialZ = canvas.position.z;
    const game = gameFor(width, height);
    const visible = { width: width / height * 1334, height: 1334 };
    cc.view.getVisibleSize = () => visible;
    cc.screen.windowSize = { width, height };
    let layouts = 0;
    Object.assign(game, {
      node: canvas, phase: 'ready', natureTextureBlocks: [],
      controlsLabel: { node: new Node('Controls') }, precisionTipLabel: { node: new Node('Precision') },
      skinsCloseButton: { label: new Label() },
      applyResponsiveLayout() {
        layouts += 1;
        assert.equal(canvas.position.x, visible.width / 2, 'root centering happens before descendant layout');
        assert.equal(canvas.position.y, visible.height / 2);
      },
      updateWorldComposition() {}, updateAudioPrompt() {}, applyThemeToUI() {},
    });
    game.resizeStage();
    assert.equal(layouts, 1);
    assert.equal(canvas.position.z, initialZ);
    assert.equal(canvas.getComponent(UITransform).width, visible.width);
    assert.equal(canvas.getComponent(UITransform).height, visible.height);
    assert.equal(game.visibleWidth, visible.width);
    assert.equal(game.visibleHeight, visible.height);
    assert.equal(camera.worldPosition.x, visible.width / 2);
    assert.equal(camera.worldPosition.y, visible.height / 2);
    assert.deepEqual(camera.position, cameraLocalPosition, 'UI camera follows its parent, without an additional local shift');
    assert.deepEqual(input.position, inputLocalPosition);
    assert.equal(input.worldPosition.x - camera.worldPosition.x, 0, 'input stays centered relative to the UI camera');
    assert.equal(input.worldPosition.y - camera.worldPosition.y, 28);
    assert.equal(visible.width / 2 - camera.worldPosition.x, 0, 'native EditBox translation has no horizontal visible-center offset');
    assert.deepEqual(world.worldPosition, worldPosition, 'scene-level 3D world is not translated with Canvas');
    game.resizeStage();
    assert.equal(camera.worldPosition.x, visible.width / 2, 'repeated resize does not accumulate offsets');
  });
}

for (const [width, height, split] of frames) {
  test(`home ${width}x${height}: readable content and expanded focus remain inside the safe panel`, () => {
    const game = gameFor(width, height);
    const layout = game.homeLayout();
    assert.equal(layout.split, split);
    for (const [key, value] of Object.entries(layout)) {
      if (key !== 'split') assert.ok(Number.isFinite(value), `${key} must be finite`);
    }
    const safe = split ? 40 : 24;
    const left = layout.panelX - layout.panelWidth / 2;
    const right = layout.panelX + layout.panelWidth / 2;
    const top = layout.panelHeight / 2;
    const bottom = -top;
    assert.ok(left >= -game.visibleWidth / 2 + safe, 'panel left clears screen overscan');
    assert.ok(right <= game.visibleWidth / 2 - safe, 'panel right clears screen overscan');
    assert.ok(top <= game.visibleHeight / 2 - safe, 'panel top clears screen overscan');
    assert.ok(layout.contentWidth > 0 && layout.contentWidth < layout.panelWidth, 'content has horizontal padding');
    assert.ok(layout.titleSize >= 72, 'hero title remains large');
    assert.ok(layout.titleSize * 4 <= layout.contentWidth, 'four-character title fits without shrinking');
    assert.ok(layout.buttonHeight >= 88, 'remote targets remain large');
    assert.ok(layout.buttonWidth <= layout.contentWidth, 'buttons fit the content column');
    assert.ok(layout.statWidth > 0 && layout.statsHeight > 0);
    assert.ok(layout.statOffset - layout.statWidth / 2 >= 8, 'stat cards have a central gap');
    assert.ok(layout.statOffset + layout.statWidth / 2 <= layout.contentWidth / 2, 'both stat cards fit the column');

    // Labels are sized to their content column; these conservative line boxes
    // catch overlapping layout regions without depending on glyph rasterization.
    const focusHalfHeight = layout.buttonHeight * 1.018 / 2 + 8;
    const bands = [
      ['title', layout.titleY, layout.titleSize * 1.2 / 2],
      ['subtitle', layout.subtitleY, 28],
      ['stats', layout.statsY, layout.statsHeight / 2],
      ['start', layout.startY, focusHalfHeight],
      ['rank', layout.rankY, focusHalfHeight],
      ['settings', layout.settingsY, focusHalfHeight],
      ['footer', layout.footerY, 24],
    ];
    for (const [name, y, halfHeight] of bands) {
      assert.ok(y + halfHeight <= top - 16, `${name} clears panel top`);
      assert.ok(y - halfHeight >= bottom + 16, `${name} clears panel bottom`);
    }
    for (let i = 1; i < bands.length; i += 1) {
      const previous = bands[i - 1];
      const current = bands[i];
      assert.ok(previous[1] - previous[2] >= current[1] + current[2] + 8,
        `${previous[0]} and ${current[0]} do not overlap, including focused buttons`);
    }
    const focusHalfWidth = layout.buttonWidth * 1.018 / 2 + 8;
    assert.ok(focusHalfWidth <= layout.panelWidth / 2 - 16, 'focus outline clears panel sides');
    assert.ok(layout.startY > layout.rankY && layout.rankY > layout.settingsY, 'single-column remote navigation is top-to-bottom');
    if (split) assert.ok(layout.panelX < 0, 'landscape leaves the tower on the right');
    else assert.equal(layout.panelX, 0, 'portrait column is centered');
  });
}

test('home layout uses the same design-space geometry across 720p, 1080p, and 4K', () => {
  const reference = JSON.stringify(gameFor(1920, 1080).homeLayout());
  assert.equal(JSON.stringify(gameFor(1280, 720).homeLayout()), reference);
  assert.equal(JSON.stringify(gameFor(3840, 2160).homeLayout()), reference);
});

test('the home start control uses the same real Button factory as the other menu controls', () => {
  const calls = descendants(syntax, node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === 'makeMenuButton'
    && ts.isStringLiteral(node.arguments[1])
    && node.arguments[1].text === 'StartButton');
  assert.equal(calls.length, 1, 'one real start button is constructed');
  const parent = calls[0].arguments[0];
  assert.ok(ts.isPropertyAccessExpression(parent) && parent.name.text === 'startGroup', 'start belongs to the animating home group');
  const game = gameFor(1920, 1080);
  const group = new Node('StartScreen');
  const result = game.makeMenuButton(group, 'StartButton', '开始游戏', 620, 116);
  assert.ok(result.node.getComponent(Button) instanceof Button);
  assert.equal(result.node.parent, group);
  assert.equal(result.label.node.parent, result.node, 'caption animates with its button');
  assert.ok(result.node.getComponent(UITransform).height >= 88);
});

test('the developer test toggle belongs to settings and is absent from the home hierarchy', () => {
  const game = gameFor(1920, 1080);
  game.startGroup = new Node('StartScreen');
  game.settingsGroup = new Node('SettingsScreen');
  game.updateTestModeUI = () => {};
  game.buildTestModeToggle();
  assert.equal(game.testModeToggle.parent, game.settingsGroup);
  assert.ok(game.testModeToggle.getComponent(Button) instanceof Button);
  assert.equal(game.startGroup.children.length, 0);
});

test('settings remote navigation visits sound, reduced motion, test mode, nickname, then return and wraps both ways', () => {
  const game = gameFor(1920, 1080);
  const activated = [];
  const focused = [];
  Object.assign(game, {
    settingsSelection: 0,
    toggleSoundSetting: () => activated.push('sound'),
    toggleMotionSetting: () => activated.push('motion'),
    toggleTestMode: () => activated.push('test'),
    openNicknameEditor: () => activated.push('nickname'),
    closeHomeOverlay: () => activated.push('return'),
    updateSettingsUI() { focused.push(this.settingsSelection); },
  });
  for (let index = 0; index < 5; index += 1) {
    game.activateSettingsSelection();
    game.moveSettingsSelection(1);
  }
  assert.deepEqual(activated, ['sound', 'motion', 'test', 'nickname', 'return']);
  assert.deepEqual(focused, [1, 2, 3, 4, 0]);
  activated.length = 0;
  focused.length = 0;
  for (let index = 0; index < 5; index += 1) {
    game.moveSettingsSelection(-1);
    game.activateSettingsSelection();
  }
  assert.deepEqual(activated, ['return', 'nickname', 'test', 'motion', 'sound']);
  assert.deepEqual(focused, [4, 3, 2, 1, 0]);
});

function makeHomeFixture(width, height) {
  const game = gameFor(width, height);
  game.startGroup = new Node('StartScreen');
  game.selectedSkinId = 'minimal-stack';
  game.homeOverlay = 'none';
  game.phase = 'ready';
  game.homeLeaderboardPreviewRows = [];
  game.homeLeaderboardPreviewDetails = [];
  game.homeLeaderboardPreviewEntries = [];
  game.homeLeaderboardPreviewRequest = 0;
  game.setCenteredNodeLayout = (node, x, y) => node.setPosition(x, y, 0);
  for (const name of ['Title', 'Subtitle', 'Eyebrow']) {
    game.makeLabel(name, game.startGroup, name, 30, new Color(), 100, 50);
  }
  const start = game.makeMenuButton(game.startGroup, 'StartButton', '开始游戏', 620, 116);
  game.startButton = start.node;
  game.startButtonGraphics = start.graphics;
  game.startPromptLabel = start.label;
  for (const key of ['leaderboard', 'settings']) {
    const button = game.makeMenuButton(game.startGroup, `${key}Button`, key, 620, 116);
    game[`${key}Button`] = button.node;
    game[`${key}ButtonGraphics`] = button.graphics;
    game[`${key}ButtonLabel`] = button.label;
  }
  game.homeBestBadge = game.makeNode('HomeBestBadge', game.startGroup);
  game.homeBestBadge.addComponent(UITransform);
  for (const key of ['homeBestCaption', 'homeBestLabel', 'homeCoinCaption', 'homeCoinLabel', 'controlsLabel', 'precisionTipLabel']) {
    game[key] = game.makeLabel(key, game.startGroup, key, 30, new Color(), 100, 50);
  }
  game.buildHomeLeaderboardPreview();
  return game;
}

test('responsive button hit regions, rendered backgrounds, and single-column focus use the same dimensions', () => {
  for (const [width, height] of frames) {
    const game = makeHomeFixture(width, height);
    game.applyHomeLayout();
    const layout = game.homeLayout();
    const nodes = [game.startButton, game.leaderboardButton, game.settingsButton];
    const positions = [layout.startY, layout.rankY, layout.settingsY];
    const rendered = [];
    game.drawHomeButton = (graphics, label, drawWidth, drawHeight, selected) => {
      rendered.push({ node: graphics.node, label, width: drawWidth, height: drawHeight, selected });
    };
    for (let selection = 0; selection < 3; selection += 1) {
      rendered.length = 0;
      game.homeSelection = selection;
      game.updateHomeMenuFocus();
      assert.equal(rendered.length, 3, `${width}x${height}: each menu button is drawn`);
      for (let index = 0; index < 3; index += 1) {
        const node = nodes[index];
        const hitRegion = node.getComponent(UITransform);
        assert.ok(node.getComponent(Button) instanceof Button);
        assert.equal(rendered[index].node, node);
        assert.equal(rendered[index].width, hitRegion.width);
        assert.equal(rendered[index].height, hitRegion.height);
        assert.equal(hitRegion.width, layout.buttonWidth);
        assert.equal(hitRegion.height, layout.buttonHeight);
        assert.equal(node.position.x, layout.panelX);
        assert.equal(node.position.y, positions[index]);
        assert.equal(rendered[index].selected, index === selection);
        assert.equal(rendered[index].label.node.parent, node);
      }
    }
    rendered.length = 0;
    game.homeOverlay = 'settings';
    game.updateHomeMenuFocus();
    assert.ok(rendered.every(button => !button.selected), 'hidden home buttons do not retain a visible focus ring');
  }
});

test('background and stat-area pointer input cannot start a round from the home screen', () => {
  const game = gameFor(1920, 1080);
  let primaryActions = 0;
  game.tryPrimaryAction = () => { primaryActions += 1; };
  for (const overlay of ['none', 'settings', 'leaderboard']) {
    game.phase = 'ready';
    game.homeOverlay = overlay;
    game.onPointerAction();
    assert.equal(primaryActions, 0, `home ${overlay} ignores non-button pointer input`);
  }
  game.phase = 'playing';
  game.homeOverlay = 'none';
  game.onPointerAction();
  assert.equal(primaryActions, 1, 'gameplay pointer release remains supported');
});

test('the right home preview is a real button whose click handler is attached and removed with the screen', () => {
  const game = makeHomeFixture(1920, 1080);
  assert.equal(game.homeLeaderboardPreview.parent, game.startGroup);
  assert.ok(game.homeLeaderboardPreview.getComponent(Button) instanceof Button);
  for (const name of ['testModeToggle', 'pauseButton', 'resumeButton', 'restartButton', 'homeButton']) {
    game[name] = new Node(name);
  }
  for (const name of ['resultHomeButton', 'resultRestartButton', 'soundToggle', 'motionToggle', 'settingsCloseButton', 'skinsCloseButton',
    'nicknameButton', 'nicknameSaveButton', 'nicknameCancelButton']) {
    game[name] = { node: new Node(name) };
  }
  game.nicknameEditor = new Node('NicknameInput').addComponent(EditBox);
  Object.assign(game, {
    graphics: { node: new Node('Graphics') }, skinCards: new Map(), skinCardHandlers: new Map(),
    leaderboardButtons: [], leaderboardHandlers: [], leaderboardRequest: 0,
    heldKeys: new Set(), homeTransition: null,
  });
  const opened = [];
  game.openHomeOverlay = overlay => opened.push(overlay);
  game.onEnable();
  const binding = game.homeLeaderboardPreview.events.get(Button.EventType.CLICK);
  assert.equal(binding.callback, GamePrototype.onLeaderboardButton);
  assert.equal(binding.target, game);
  for (const [node, type, method] of [
    [game.nicknameButton.node, Button.EventType.CLICK, 'openNicknameEditor'],
    [game.nicknameSaveButton.node, Button.EventType.CLICK, 'saveNicknameEditor'],
    [game.nicknameCancelButton.node, Button.EventType.CLICK, 'closeNicknameEditor'],
    [game.nicknameEditor.node, EditBox.EventType.EDITING_RETURN, 'onNicknameInputReturn'],
  ]) assert.equal(node.events.get(type).callback, GamePrototype[method]);
  game.homeLeaderboardPreview.emit(Button.EventType.CLICK);
  assert.deepEqual(opened, ['leaderboard']);
  assert.equal(game.homeSelection, 1);
  const request = game.homeLeaderboardPreviewRequest;
  game.onDisable();
  game.homeLeaderboardPreview.emit(Button.EventType.CLICK);
  assert.deepEqual(opened, ['leaderboard'], 'disabled screens must not retain clickable handlers');
  assert.ok(game.homeLeaderboardPreviewRequest > request, 'disable invalidates pending preview responses');
  assert.equal(game.nicknameEditor.node.events.size, 0);
  assert.equal(game.nicknameSaveButton.node.events.size, 0);
  assert.equal(game.nicknameCancelButton.node.events.size, 0);
});

test('home preview reflows its existing rows across portrait and projector sizes without fetching on resize', () => {
  const game = makeHomeFixture(1920, 1080);
  game.homeLeaderboardPreviewEntries = [120, 80, 40].map((score, index) => ({ id: `${index}`, score,
    ...(index === 0 ? { nickname: '这是一个完整的十二字昵称' } : {}) }));
  const nodes = [...game.homeLeaderboardPreviewRows];
  let requests = 0;
  game.leaderboard = { list() { requests += 1; } };
  for (const [width, height] of [...frames, [320, 568], [360, 800]]) {
    game.visibleWidth = width / height * game.visibleHeight;
    game.applyHomeLayout();
    const layout = loadLayoutModule().projectorLeaderboardPreviewLayout(game.visibleWidth, game.visibleHeight);
    const hit = game.homeLeaderboardPreview.getComponent(UITransform);
    assert.equal(hit.width, layout.panelWidth);
    assert.equal(hit.height, layout.panelHeight);
    assert.equal(game.homeLeaderboardPreview.position.x, layout.panelX);
    assert.equal(game.homeLeaderboardPreview.position.y, layout.panelY);
    assert.ok(game.homeLeaderboardPreview.position.x > 0, 'the shortcut is on the right');
    for (let index = 0; index < nodes.length; index += 1) {
      const row = nodes[index];
      assert.equal(game.homeLeaderboardPreviewRows[index], row, 'resize reuses labels');
      assert.equal(row.node.active, index < layout.rowYs.length);
      assert.equal(row.string, layout.rowYs.length === 1
        ? `${index + 1}  ·  ${game.homeLeaderboardPreviewEntries[index].score} 层`
        : `${game.homeLeaderboardPreviewEntries[index].score} 层`);
      assert.equal(row.enableWrapText, false);
      assert.equal(row.overflow, Label.Overflow.SHRINK);
      const detail = game.homeLeaderboardPreviewDetails[index];
      const entry = game.homeLeaderboardPreviewEntries[index];
      assert.equal(detail.node.active, layout.rowYs.length > 1);
      assert.equal(detail.string, entry.nickname || '本地玩家');
      assert.equal(game.homeLeaderboardPreviewTitles[index].string, leaderboardData.leaderboardTitle(entry.score));
      assert.equal(detail.enableWrapText, false);
      assert.equal(detail.overflow, Label.Overflow.SHRINK);
      if (detail.node.active) {
        assert.equal(row.node.position.y, layout.rowYs[index] - 19);
        assert.equal(detail.node.position.y, layout.rowYs[index] + 23);
        const rowBox = row.node.getComponent(UITransform);
        const detailBox = detail.node.getComponent(UITransform);
        assert.ok(detail.node.position.y - detailBox.height / 2 > row.node.position.y + rowBox.height / 2);
        assert.ok(detailBox.width <= hit.width - 48);
        const title = game.homeLeaderboardPreviewTitles[index];
        assert.ok(title.node.position.x + title.node.getComponent(UITransform).width / 2
          < row.node.position.x - rowBox.width / 2, 'rank title and score have separate columns');
        if (index) {
          const previous = game.homeLeaderboardPreviewDetails[index - 1];
          assert.ok(previous.node.position.y - previous.node.getComponent(UITransform).height / 2
            > row.node.position.y + rowBox.height / 2, 'secondary text clears the next primary score');
        }
      }
    }
    assert.equal(game.homeLeaderboardPreviewEmpty.node.active, false);
  }
  assert.equal(requests, 0, 'responsive layout must not poll the repository');
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function previewFixture() {
  const game = makeHomeFixture(1920, 1080);
  Object.assign(game, { isValid: true, leaderboardSubmission: null, leaderboardRequest: 7,
    leaderboardEntries: [{ id: 'full-panel', score: 999 }] });
  return game;
}

test('home preview uses separate medal, nickname, title and score fields with a clear open action', () => {
  const game = makeHomeFixture(1920, 1080);
  game.homeLeaderboardPreviewEntries = [123456, 600, 0].map((score, i) => ({ id: `card-${i}`, score,
    nickname: '这是一个完整的十二字昵称' }));
  game.updateHomeLeaderboardPreviewUI();
  assert.equal(game.homeLeaderboardPreviewTitle.string, '排行榜');
  assert.equal(game.homeLeaderboardPreviewHint.string, '查看完整榜单  →');
  assert.equal(game.homeLeaderboardPreviewRows[0].string, '123456 层');
  assert.equal(game.homeLeaderboardPreviewTitles[1].string, '王者 +1 星');
  assert.equal(game.homeLeaderboardPreviewRows[2].string, '0 层');
  for (let i = 0; i < 3; i++) {
    assert.equal(game.homeLeaderboardPreviewRanks[i].string, `${i + 1}`);
    assert.equal(game.homeLeaderboardPreviewDetails[i].string, '这是一个完整的十二字昵称');
    assert.equal(game.homeLeaderboardPreviewRows[i].overflow, Label.Overflow.SHRINK);
    assert.equal(game.homeLeaderboardPreviewDetails[i].overflow, Label.Overflow.SHRINK);
  }
  assert.ok(game.homeLeaderboardPreviewGraphics.rectangles.filter(shape => shape.circle).length > 6);
  game.homeLeaderboardPreviewEntries = [];
  game.updateHomeLeaderboardPreviewUI();
  assert.equal(game.homeLeaderboardPreviewEmpty.node.active, true);
  assert.ok(game.homeLeaderboardPreviewRanks.every(label => !label.node.active));
  assert.ok(game.homeLeaderboardPreviewTitles.every(label => !label.node.active));
});

test('home preview waits for result submission and caches only the top three without changing full-panel data', async () => {
  const game = previewFixture();
  const submission = deferred();
  game.leaderboardSubmission = submission.promise;
  let requests = 0;
  game.leaderboard = { async list() {
    requests += 1;
    return { entries: [60, 50, 40, 30].map((score, index) => ({ id: `${index}`, score })), persistent: true };
  } };
  game.homeLeaderboardPreviewEntries = [{ id: 'cached', score: 20 }];
  const loading = game.loadHomeLeaderboardPreview();
  assert.equal(requests, 0, 'list waits for a just-finished result to persist');
  assert.equal(game.homeLeaderboardPreviewRows[0].string, '20 层', 'cached score remains visible while loading');
  submission.resolve();
  await loading;
  assert.equal(requests, 1);
  assert.deepEqual(Array.from(game.homeLeaderboardPreviewEntries, entry => entry.score), [60, 50, 40]);
  assert.deepEqual(game.leaderboardEntries, [{ id: 'full-panel', score: 999 }]);
  assert.equal(game.leaderboardRequest, 7, 'preview uses its own request counter');
  assert.equal(game.homeLeaderboardPreviewEmpty.node.active, false);
});

test('home preview ignores superseded responses and responses after navigation or destruction', async () => {
  const game = previewFixture();
  const first = deferred();
  const second = deferred();
  let requests = 0;
  game.leaderboard = { list() { return (++requests === 1 ? first : second).promise; } };
  const older = game.loadHomeLeaderboardPreview();
  await Promise.resolve();
  const newer = game.loadHomeLeaderboardPreview();
  await Promise.resolve();
  second.resolve({ entries: [{ id: 'new', score: 80 }] });
  await newer;
  first.resolve({ entries: [{ id: 'old', score: 10 }] });
  await older;
  assert.equal(game.homeLeaderboardPreviewEntries[0].score, 80);

  for (const departure of [{ phase: 'playing' }, { homeOverlay: 'leaderboard' }, { isValid: false }]) {
    const gone = previewFixture();
    const response = deferred();
    gone.homeLeaderboardPreviewEntries = [{ id: 'cached', score: 30 }];
    gone.leaderboard = { list: () => response.promise };
    const loading = gone.loadHomeLeaderboardPreview();
    await Promise.resolve();
    Object.assign(gone, departure);
    response.resolve({ entries: [{ id: 'late', score: 100 }] });
    await loading;
    assert.equal(gone.homeLeaderboardPreviewEntries[0].score, 30);
    assert.equal(gone.homeLeaderboardPreviewRows[0].string, '30 层');
  }
});

test('empty, unavailable and recovered home previews display a usable state', async () => {
  const game = previewFixture();
  game.leaderboard = { async list() { return { entries: [] }; } };
  await game.loadHomeLeaderboardPreview();
  assert.equal(game.homeLeaderboardPreviewEmpty.node.active, true);
  assert.equal(game.homeLeaderboardPreviewEmpty.string, '暂无成绩，等你上榜');
  assert.ok(game.homeLeaderboardPreviewRows.every(row => !row.node.active));
  game.homeLeaderboardPreviewEntries = [{ id: 'cached', score: 30 }];
  game.leaderboard.list = async () => { throw new Error('unavailable'); };
  await game.loadHomeLeaderboardPreview();
  assert.equal(game.homeLeaderboardPreviewEntries.length, 0);
  assert.equal(game.homeLeaderboardPreviewEmpty.string, '暂不可用，点击重试');
  game.leaderboard.list = async () => ({ entries: [{ id: 'recovered', score: 0 }] });
  await game.loadHomeLeaderboardPreview();
  assert.equal(game.homeLeaderboardPreviewEmpty.node.active, false);
  assert.equal(game.homeLeaderboardPreviewRows[0].string, '0 层', 'zero-score rounds remain valid entries');
});

function contrast(foreground, background) {
  const luminance = rgb => {
    const linear = rgb.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const first = luminance([foreground.r, foreground.g, foreground.b]);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function recordingGraphics() {
  return {
    node: new Node('Button'), fills: [], strokes: [], rectangles: [],
    clear() { this.fills = []; this.strokes = []; this.rectangles = []; },
    roundRect(x, y, width, height, radius) { this.rectangles.push({ x, y, width, height, radius }); },
    rect(x, y, width, height) { this.rectangles.push({ x, y, width, height }); },
    circle(x, y, radius) { this.rectangles.push({ x, y, radius, circle: true }); },
    moveTo() {}, lineTo() {}, close() {},
    fill() { this.fills.push(this.fillColor); },
    stroke() { this.strokes.push({ color: this.strokeColor, width: this.lineWidth }); },
  };
}

test('six avatar silhouettes stay distinct, bounded, and independent of ranking position', () => {
  const game = gameFor(1920, 1080);
  const signatures = new Set();
  for (const score of [0, 50, 100, 200, 350, 500]) {
    const g = recordingGraphics();
    const points = [];
    g.moveTo = (x, y) => points.push(['move', x, y]);
    g.lineTo = (x, y) => points.push(['line', x, y]);
    game.drawRankAvatar(g, 0, 0, 40, score);
    signatures.add(JSON.stringify([g.rectangles, points]));
    assert.ok(points.every(([, x, y]) => Math.abs(x) <= 40 && Math.abs(y) <= 40));
    for (const shape of g.rectangles) {
      const left = shape.circle ? shape.x - shape.radius : shape.x;
      const right = shape.circle ? shape.x + shape.radius : shape.x + shape.width;
      const bottom = shape.circle ? shape.y - shape.radius : shape.y;
      const top = shape.circle ? shape.y + shape.radius : shape.y + shape.height;
      assert.ok(left >= -40 && right <= 40 && bottom >= -40 && top <= 40);
    }
  }
  assert.equal(signatures.size, 6, 'each tier differs by geometry, not just tint');
  const king = recordingGraphics(); const starred = recordingGraphics();
  game.drawRankAvatar(king, 0, 0, 21, 500);
  game.drawRankAvatar(starred, 0, 0, 21, 1700);
  assert.deepEqual(king.rectangles, starred.rectangles);
  const home = makeHomeFixture(1920, 1080);
  const seen = [];
  home.drawRankAvatar = (...args) => seen.push(args[4]);
  home.homeLeaderboardPreviewEntries = [{ score: 14 }, { score: 350 }, { score: 500 }];
  home.updateHomeLeaderboardPreviewUI();
  assert.deepEqual(seen, [14, 350, 500], 'preview maps score, not list index');
  const { game: full } = projectorFixture(1920, 1080);
  const fullSeen = [];
  full.drawRankAvatar = (...args) => fullSeen.push(args[4]);
  full.leaderboardEntries = home.homeLeaderboardPreviewEntries;
  full.updateLeaderboardUI();
  assert.deepEqual(fullSeen, seen);
});

function recordingButton(game, group, name) {
  const ui = game.makeMenuButton(group, name, name, 1, 1);
  ui.graphics = recordingGraphics();
  ui.graphics.node = ui.node;
  return ui;
}

function projectorFixture(width, height) {
  const game = gameFor(width, height);
  game.selectedSkinId = 'minimal-stack';
  game.reducedMotion = false;
  game.setCenteredNodeLayout = (node, x, y) => node.setPosition(x, y, 0);
  game.setTopLeftLayout = (node, top, left) => { node.edge = { top, left }; };
  game.setTopRightLayout = (node, top, right) => { node.edge = { top, right }; };
  const groups = {
    settings: ['SettingsTitle', 'SettingsHint'],
    pause: ['PauseTitle', 'PauseHint', 'PauseControls'],
    result: ['ResultTitle', 'ResultScore', 'ResultBest', 'ResultCoins', 'Restart'],
    leaderboard: ['LeaderboardTitle', 'LeaderboardStatus', 'LeaderboardRankHeading', 'LeaderboardColumns',
      'LeaderboardEmpty', 'LeaderboardScrollHint', 'LeaderboardScoreHeading'],
  };
  for (const [kind, names] of Object.entries(groups)) {
    const group = new Node(kind);
    game[`${kind}Group`] = group;
    for (const name of names) game.makeLabel(name, group, name, 1, new Color(), 1, 1);
  }
  game.leaderboardEmpty = game.leaderboardGroup.getChildByName('LeaderboardEmpty').getComponent(Label);
  game.leaderboardGraphics = recordingGraphics();
  game.leaderboardPageLabel = game.leaderboardGroup.getChildByName('LeaderboardScrollHint').getComponent(Label);
  Object.assign(game, { leaderboardEntries: [], leaderboardScrollTarget: 0, leaderboardLoading: false });
  game.leaderboardViewport = game.makeNode('Viewport', game.leaderboardGroup);
  game.leaderboardViewport.addComponent(UITransform).setContentSize(520, 768);
  game.leaderboardContent = game.makeNode('Content', game.leaderboardViewport);
  game.leaderboardContent.addComponent(UITransform).setContentSize(520, 768);
  game.leaderboardContent.setPosition(0, 384, 0);
  game.leaderboardScroll = game.leaderboardViewport.addComponent(ScrollView);
  game.leaderboardScroll.content = game.leaderboardContent;
  const buttons = {};
  buttons.settings = ['soundToggle', 'motionToggle', 'testToggle', 'nicknameButton', 'settingsCloseButton'].map(key => {
    const ui = recordingButton(game, game.settingsGroup, key);
    if (key === 'testToggle') Object.assign(game, { testModeToggle: ui.node, testModeToggleGraphics: ui.graphics, testModeToggleLabel: ui.label });
    else game[key] = ui;
    return ui;
  });
  game.nicknameLabel = game.makeLabel('CurrentNickname', game.nicknameButton.node, '', 1, new Color(), 1, 1);
  buttons.pause = ['resume', 'restart', 'home'].map(key => {
    const ui = recordingButton(game, game.pauseGroup, key);
    Object.assign(game, { [`${key}Button`]: ui.node, [`${key}ButtonGraphics`]: ui.graphics, [`${key}ButtonLabel`]: ui.label });
    return ui;
  });
  buttons.result = ['resultRestartButton', 'resultHomeButton'].map(key => {
    const ui = recordingButton(game, game.resultGroup, key);
    game[key] = ui;
    return ui;
  });
  buttons.leaderboard = game.leaderboardButtons = ['close'].map(name => recordingButton(game, game.leaderboardGroup, name));
  game.leaderboardRows = Array.from({ length: 10 }, (_, index) => {
    const node = game.makeNode(`Row-${index}`, game.leaderboardContent);
    node.addComponent(UITransform);
    return { node, graphics: recordingGraphics(),
      rank: game.makeLabel('Rank', node, '', 1, new Color(), 1, 1),
      player: game.makeLabel('Player', node, '', 1, new Color(), 1, 1),
      score: game.makeLabel('Score', node, '', 1, new Color(), 1, 1),
      title: game.makeLabel('Title', node, '', 1, new Color(), 1, 1),
      detail: game.makeLabel('Detail', node, '', 1, new Color(), 1, 1) };
  });
  const hud = game.gameplayHudGroup = new Node('GameplayHud');
  Object.assign(game, { phase: 'playing', score: 0, roundBestScore: 20, testModeEnabled: false, roundWasTest: false });
  for (const key of ['score', 'best']) {
    const node = game.makeNode(`${key}Card`, hud);
    node.addComponent(UITransform);
    game[`${key}HudCard`] = node;
    game[`${key}HudGraphics`] = node.addComponent(cc.Graphics);
    game[`${key}CaptionLabel`] = game.makeLabel('Caption', node, '', 1, new Color(), 1, 1);
    game[`${key}Label`] = game.makeLabel('Value', node, '', 1, new Color(), 1, 1);
  }
  const pause = recordingButton(game, hud, 'PauseButton');
  game.pauseButton = pause.node;
  game.pauseButtonLabel = pause.label;
  game.testModeBadgeLabel = game.makeLabel('TestModeBadge', hud, '', 1, new Color(), 1, 1);
  game.buildRecordGapHud();
  return { game, buttons };
}

function nicknameFixture(width = 1920, height = 1080) {
  const { game } = projectorFixture(width, height);
  Object.assign(game, {
    phase: 'ready', homeOverlay: 'settings', homeTransition: null,
    playerNickname: '原来的昵称', nicknameEditing: false, nicknameInputActive: false,
    nicknameSelection: 0, settingsSelection: 3,
    hudSafeRoot: new Node('HudSafeRoot'), settingsGraphics: recordingGraphics(),
  });
  game.buildNicknameEditor();
  for (const [type, method] of [
    [EditBox.EventType.EDITING_DID_BEGAN, 'onNicknameInputBegan'],
    [EditBox.EventType.EDITING_DID_ENDED, 'onNicknameInputEnded'],
    [EditBox.EventType.EDITING_RETURN, 'onNicknameInputReturn'],
  ]) game.nicknameEditor.node.on(type, game[method], game);
  return game;
}

test('nickname EditBox is configured under an inactive group before its native input can be created', () => {
  const game = nicknameFixture();
  assert.equal(game.nicknameEditor.activeHierarchyWhenAdded, false,
    'adding an active EditBox would create the default multiline textarea before SINGLE_LINE is configured');
  assert.equal(game.nicknameGroup.active, false);
  assert.equal(game.nicknameEditor.inputMode, EditBox.InputMode.SINGLE_LINE);
  assert.equal(game.nicknameEditor.inputFlag, EditBox.InputFlag.DEFAULT);
  assert.equal(game.nicknameEditor.returnType, EditBox.KeyboardReturnType.DONE);
  assert.ok(game.nicknameEditor.textLabel && game.nicknameEditor.placeholderLabel);
  game.openNicknameEditor();
  assert.equal(game.nicknameGroup.active, true);
  assert.equal(game.nicknameEditor.inputMode, EditBox.InputMode.SINGLE_LINE);
  assert.equal(game.nicknameEditor.isFocused(), true);
});

test('nickname input reuses Cocos-generated labels rather than leaving duplicate text underneath', t => {
  EditBox.provideDefaultLabels = true;
  t.after(() => { EditBox.provideDefaultLabels = false; });
  const game = nicknameFixture();
  assert.equal(game.nicknameEditor.textLabel, game.nicknameEditor.defaultTextLabel);
  assert.equal(game.nicknameEditor.placeholderLabel, game.nicknameEditor.defaultPlaceholderLabel);
  assert.equal(game.nicknameEditor.node.children.filter(node => node.getComponent(Label)).length, 2);
  assert.equal(game.nicknameEditor.node.getChildByName('NicknameText'), undefined);
  assert.equal(game.nicknameEditor.placeholderLabel.string, '输入你的昵称');
  assert.equal(game.nicknameEditor.textLabel.verticalAlign, Label.VerticalAlign.CENTER);
});

test('nickname editor opens only from settings, returns focus on cancel and keeps existing player/round names intact', () => {
  const game = nicknameFixture();
  game.roundNickname = '本局名字';
  game.homeOverlay = 'none';
  game.openNicknameEditor();
  assert.equal(game.nicknameEditing, false);
  game.homeOverlay = 'settings';
  game.homeTransition = {};
  game.openNicknameEditor();
  assert.equal(game.nicknameEditing, false);
  game.homeTransition = null;
  game.openNicknameEditor();
  assert.equal(game.nicknameEditing, true);
  assert.equal(game.nicknameInputActive, true);
  assert.equal(game.nicknameEditor.string, '原来的昵称');
  assert.equal(game.nicknameEditor.isFocused(), true);
  assert.equal(game.settingsGroup.active, false);
  assert.equal(game.nicknameGroup.active, true);
  assert.equal(game.nicknameSelection, 0);
  game.nicknameEditor.string = '尚未保存';
  game.openNicknameEditor();
  assert.equal(game.nicknameEditor.string, '尚未保存', 'repeated opening does not discard the draft');
  game.closeNicknameEditor();
  assert.equal(game.playerNickname, '原来的昵称');
  assert.equal(game.roundNickname, '本局名字');
  assert.equal(game.nicknameEditing, false);
  assert.equal(game.nicknameInputActive, false);
  assert.equal(game.nicknameGroup.active, false);
  assert.equal(game.settingsGroup.active, true);
  assert.equal(game.settingsSelection, 3);
  assert.equal(game.nicknameLabel.string, '原来的昵称');
  game.openNicknameEditor();
  assert.equal(game.nicknameEditor.string, '原来的昵称', 'reopening starts from the saved nickname');
});

test('finishing nickname text entry selects Save without saving, and three modal focus positions wrap', () => {
  const game = nicknameFixture();
  game.openNicknameEditor();
  game.nicknameEditor.string = '等待确认';
  game.nicknameEditor.node.emit(EditBox.EventType.EDITING_RETURN);
  assert.equal(game.nicknameSelection, 1);
  assert.equal(game.nicknameInputActive, false);
  assert.equal(game.nicknameEditor.isFocused(), false);
  assert.equal(game.nicknameEditing, true);
  assert.equal(game.playerNickname, '原来的昵称');
  const selected = [];
  for (let index = 0; index < 3; index += 1) {
    game.moveNicknameSelection(1);
    selected.push(game.nicknameSelection);
  }
  assert.deepEqual(selected, [2, 0, 1]);
  game.moveNicknameSelection(-1);
  assert.equal(game.nicknameSelection, 0);
  game.activateNicknameSelection();
  assert.equal(game.nicknameEditor.isFocused(), true);
  assert.equal(game.nicknameInputActive, true);
  game.moveNicknameSelection(-1);
  assert.equal(game.nicknameSelection, 2);
  game.activateNicknameSelection();
  assert.equal(game.nicknameEditing, false);
  assert.equal(game.playerNickname, '原来的昵称');
});

test('nickname validation rejects empty/overlong drafts, preserves Unicode characters and saves only on confirmation', t => {
  const previousStorage = cc.sys.localStorage;
  t.after(() => { cc.sys.localStorage = previousStorage; });
  const stored = new Map();
  cc.sys.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  const game = nicknameFixture();
  game.openNicknameEditor();
  for (const [draft, error] of [[' \u200B\n ', /不能为空/], ['山'.repeat(13), /最多 12/], ['🚀'.repeat(13), /最多 12/]]) {
    game.nicknameEditor.string = draft;
    game.saveNicknameEditor();
    assert.match(game.nicknameHint.string, error);
    assert.equal(game.nicknameEditing, true);
    assert.equal(game.playerNickname, '原来的昵称');
    assert.equal(stored.size, 0);
  }
  assert.equal(game.nicknameEditor.maxLength, -1, 'validation counts Unicode code points without truncating a surrogate pair');
  game.nicknameEditor.string = '🚀'.repeat(12);
  game.saveNicknameEditor();
  assert.equal(game.playerNickname, '🚀'.repeat(12));
  assert.equal(stored.get(leaderboardData.NICKNAME_STORAGE_KEY), '🚀'.repeat(12));
  assert.equal(game.nicknameEditing, false);
  assert.equal(game.settingsSelection, 3);
  game.openNicknameEditor();
  game.nicknameEditor.string = '\t叠叠  \n 玩家\t';
  game.saveNicknameEditor();
  assert.equal(game.playerNickname, '叠叠 玩家');
  assert.equal(game.nicknameLabel.string, '叠叠 玩家');
  assert.match(game.nicknameStatus, /昵称已保存/);
  assert.equal(game.settingsGroup.getChildByName('SettingsHint').getComponent(Label).string, game.nicknameStatus);
});

test('a nickname remains usable for the current session when local storage is unavailable', t => {
  const previousStorage = cc.sys.localStorage;
  t.after(() => { cc.sys.localStorage = previousStorage; });
  for (const storage of [null, { setItem() { throw new Error('storage denied'); } }]) {
    cc.sys.localStorage = storage;
    const game = nicknameFixture();
    game.openNicknameEditor();
    game.nicknameEditor.string = '离线玩家';
    game.saveNicknameEditor();
    assert.equal(game.playerNickname, '离线玩家');
    assert.equal(game.nicknameLabel.string, '离线玩家');
    assert.equal(game.nicknameEditing, false);
    assert.match(game.nicknameStatus, /本次生效.*存储不可用/);
    assert.equal(game.settingsGroup.getChildByName('SettingsHint').getComponent(Label).string, game.nicknameStatus);
  }
});

test('nickname modal input, labels and focused Save/Cancel targets fit narrow and projector screens across themes', () => {
  for (const [width, height] of [...frames, [320, 568], [360, 800]]) {
    const game = nicknameFixture(width, height);
    game.openNicknameEditor();
    for (const skin of ['minimal-stack', 'classic', 'cyber-neon', 'porcelain-moon', 'pastel-toy', 'nature-zen']) {
      game.selectedSkinId = skin;
      for (const selection of [0, 1, 2]) {
        game.nicknameSelection = selection;
        game.updateNicknameEditorUI();
        const panel = game.nicknameGraphics.rectangles[0];
        assert.equal(panel.x + panel.width / 2, 0, 'dialog is centered');
        assert.ok(panel.x >= -game.visibleWidth / 2 + 28);
        assert.ok(panel.x + panel.width <= game.visibleWidth / 2 - 28);
        const input = game.nicknameEditor.node.getComponent(UITransform);
        assert.ok(input.width <= panel.width - 64);
        assert.equal(game.nicknameEditor.node.position.x, 0);
        for (const button of [game.nicknameSaveButton, game.nicknameCancelButton]) {
          const box = button.node.getComponent(UITransform);
          const focusHalf = box.width * 1.018 / 2 + 10;
          assert.ok(button.node.position.x - focusHalf >= panel.x + 16);
          assert.ok(button.node.position.x + focusHalf <= panel.x + panel.width - 16);
          assert.ok(button.node.position.y - box.height * 1.018 / 2 - 10 >= panel.y + 16);
        }
        for (const label of [game.nicknameEditor.textLabel, game.nicknameHint]) {
          assert.ok(contrast(label.color, game.currentSkin().panelColor) >= 4.5);
        }
        assert.equal(game.nicknameEditor.textLabel.horizontalAlign, Label.HorizontalAlign.LEFT);
        assert.deepEqual(game.nicknameEditor.textLabel.node.getComponent(UITransform).anchorPoint, { x: 0, y: 1 });
      }
    }
  }
});

test('the controller applies shared geometry to all panels, rows, hit targets and HUD labels', () => {
  for (const [width, height] of frames) {
    const { game, buttons } = projectorFixture(width, height);
    game.applyProjectorLayout();
    for (const kind of ['settings', 'pause', 'result', 'leaderboard']) {
      const layout = game.panelLayout(kind);
      assert.equal(layout.panelX, kind === 'leaderboard' ? 0 : game.homeLayout().panelX,
        'leaderboard is centered; other menus retain the home composition');
      const titleName = `${kind[0].toUpperCase()}${kind.slice(1)}Title`;
      const title = game[`${kind}Group`].getChildByName(titleName).getComponent(Label);
      assert.equal(title.node.position.x, kind === 'leaderboard' ? -50 : layout.panelX);
      assert.equal(title.node.position.y, layout.titleY);
      assert.equal(title.fontSize, layout.titleSize);
      assert.equal(title.isBold, true);
      buttons[kind].forEach((ui, index) => {
        if (kind === 'leaderboard') {
          assert.equal(ui.node.position.x, layout.contentWidth / 2 - 38);
          assert.equal(ui.node.position.y, layout.titleY);
          assert.equal(ui.node.getComponent(UITransform).width, 76);
          assert.equal(ui.label.node.getComponent(UITransform).width, 60);
          return;
        }
        assert.equal(ui.node.position.x, layout.panelX);
        assert.equal(ui.node.position.y, layout.buttonYs[index]);
        assert.equal(ui.node.getComponent(UITransform).width, layout.buttonWidth);
        assert.equal(ui.node.getComponent(UITransform).height, layout.buttonHeight);
        assert.equal(ui.label.node.getComponent(UITransform).width, layout.buttonWidth - 112);
        assert.equal(ui.label.fontSize, kind === 'leaderboard' ? layout.bodyFont - 6 : layout.bodyFont);
      });
    }
    const rank = game.panelLayout('leaderboard');
    game.leaderboardRows.forEach((row, index) => {
      assert.equal(row.node.position.y, rank.rowYs[index]);
      assert.equal(row.node.getComponent(UITransform).width, rank.rowWidth);
      assert.equal(row.node.getComponent(UITransform).height, rank.rowHeight);
      assert.equal(row.rank.node.position.x, rank.rankX + 26);
      if (rank.split) assert.equal(row.player.node.position.x, rank.detailX);
      else assert.equal(row.player.node.position.x - row.player.node.getComponent(UITransform).width / 2,
        rank.detailX - rank.detailWidth / 2, 'phone nickname spans the row above its score');
      assert.equal(row.score.node.position.x, rank.scoreX);
      assert.equal(row.title.node.position.x, rank.detailX);
      for (const [label, y, size] of [[row.player, 40, rank.split ? 32 : 28], [row.title, 0, 26], [row.detail, -40, 22]]) {
        assert.equal(label.node.position.y, y);
        assert.equal(label.fontSize, size);
        assert.ok(label.node.getComponent(UITransform).width > 0);
        assert.equal(label.enableWrapText, false);
        assert.equal(label.overflow, Label.Overflow.SHRINK);
        assert.ok(Math.abs(y) + label.lineHeight / 2 <= rank.rowHeight / 2, 'each line remains within its row');
      }
      const rankRight = row.rank.node.position.x + row.rank.node.getComponent(UITransform).width / 2;
      const textLeft = row.score.node.position.x - row.score.node.getComponent(UITransform).width / 2;
      assert.ok(textLeft - rankRight >= 16, 'rank and description remain separate columns');
    });
    const hud = game.hudLayout();
    assert.deepEqual(game.scoreHudCard.edge, { top: hud.top, left: hud.edgeInset });
    assert.deepEqual(game.bestHudCard.edge, { top: hud.top, left: hud.edgeInset + hud.cardWidth + hud.gap });
    assert.deepEqual(game.pauseButton.edge, { top: hud.top, right: hud.edgeInset });
    for (const key of ['score', 'best']) {
      assert.equal(game[`${key}HudCard`].getComponent(UITransform).width, hud.cardWidth);
      assert.equal(game[`${key}HudCard`].getComponent(UITransform).height, hud.cardHeight);
      assert.equal(game[`${key}CaptionLabel`].fontSize, hud.captionSize);
      assert.equal(game[`${key}Label`].fontSize, hud.valueSize);
    }
    assert.equal(game.pauseButton.getComponent(UITransform).width, hud.pauseWidth);
    assert.equal(game.pauseButton.getComponent(UITransform).height, hud.pauseHeight);
    assert.deepEqual(game.recordGapNode.edge, { top: hud.recordGapTop, left: hud.edgeInset });
    assert.equal(game.recordGapNode.getComponent(UITransform).width, hud.recordGapWidth);
    assert.equal(game.recordGapNode.getComponent(UITransform).height, hud.recordGapHeight);
    assert.equal(game.recordGapLabel.node.getComponent(UITransform).width, hud.recordGapWidth - 24);
    assert.equal(game.recordGapLabel.node.getComponent(UITransform).height, hud.recordGapHeight - 8);
    assert.equal(game.recordGapLabel.fontSize, hud.captionSize);
    assert.equal(game.recordGapLabel.enableWrapText, false);
    assert.equal(game.recordGapLabel.overflow, Label.Overflow.SHRINK);
    assert.equal(game.recordGapLabel.horizontalAlign, Label.HorizontalAlign.LEFT);
  }
});

test('narrow portrait record hints use a single shrinking line inside the two-card width', () => {
  for (const [width, height] of [[320, 568], [360, 800]]) {
    const { game } = projectorFixture(width, height);
    game.applyProjectorLayout();
    game.setScore(20, false);
    const hud = game.hudLayout();
    assert.equal(game.recordGapLabel.string, '已追平 · 再叠 1 层破纪录');
    assert.equal(game.recordGapNode.getComponent(UITransform).width, hud.recordGapWidth);
    assert.equal(game.recordGapLabel.node.getComponent(UITransform).width, hud.recordGapWidth - 24);
    assert.equal(game.recordGapLabel.enableWrapText, false);
    assert.equal(game.recordGapLabel.overflow, Label.Overflow.SHRINK);
  }
});

function visibleInHierarchy(node) {
  for (let current = node; current; current = current.parent) {
    if (current.active === false) return false;
  }
  return true;
}

function roundFixture(bestScore, playerNickname = leaderboardData.DEFAULT_NICKNAME) {
  const { game } = projectorFixture(390, 844);
  Object.assign(game, {
    bestScore, coins: 0, homeOverlay: 'none', playerNickname,
    startGroup: new Node('StartScreen'), skinsGroup: new Node('SkinsScreen'),
    world3D: { reset() {} },
    resetPerfectFeedback() {}, updateWorldComposition() {}, playSound() {},
    recordLeaderboardResult() {}, saveBestScore() {}, saveEconomy() {},
  });
  game.homeBestLabel = game.makeLabel('HomeBest', game.startGroup, '', 1, new Color(), 1, 1);
  for (const [key, name] of Object.entries({
    resultTitleLabel: 'ResultTitle', resultScoreLabel: 'ResultScore',
    resultBestLabel: 'ResultBest', resultCoinLabel: 'ResultCoins',
  })) game[key] = game.resultGroup.getChildByName(name).getComponent(Label);
  game.startGameImmediately();
  return game;
}

test('a leaderboard submission uses the nickname frozen at round start and a later round uses the new name', async () => {
  const game = roundFixture(20, '本局玩家');
  const submissions = [];
  game.leaderboard = { async submit(result) { submissions.push(result); } };
  game.recordLeaderboardResult = GamePrototype.recordLeaderboardResult;
  assert.equal(game.roundNickname, '本局玩家');
  game.playerNickname = '下一局玩家';
  game.setScore(7, false);
  game.recordLeaderboardResult();
  game.recordLeaderboardResult();
  await game.leaderboardSubmission;
  assert.equal(submissions.length, 1, 'repeated result presentation cannot duplicate a record');
  assert.equal(submissions[0].nickname, '本局玩家');
  assert.equal(submissions[0].score, 7);
  game.startGameImmediately();
  assert.equal(game.roundNickname, '下一局玩家');
  game.recordLeaderboardResult();
  await game.leaderboardSubmission;
  assert.equal(submissions[1].nickname, '下一局玩家');
});

test('leaderboard rows show the saved nickname, score title and separate round details, with a stable legacy fallback', () => {
  const { game } = projectorFixture(1920, 1080);
  Object.assign(game, {
    homeOverlay: 'leaderboard', playerNickname: '当前昵称不改旧纪录', submittedRoundId: 'new',
    leaderboardEntries: [
      { id: 'new', kind: 'round', nickname: '小山', score: 500, perfectCount: 5, finishedAt: 1700000000000 },
      { id: 'legacy', kind: 'legacy', score: 1000, perfectCount: null, finishedAt: null },
      { id: 'old-round', kind: 'round', score: 0, perfectCount: 0, finishedAt: 1700000000000 },
    ],
  });
  game.applyProjectorLayout();
  game.updateLeaderboardUI();
  assert.match(game.leaderboardRows[0].player.string, /小山/);
  assert.equal(game.leaderboardRows[0].score.string, '500');
  assert.equal(game.leaderboardRows[0].title.string, '最强王者');
  assert.match(game.leaderboardRows[0].detail.string, /完美 5 次/);
  for (const index of [1, 2]) assert.match(game.leaderboardRows[index].player.string, /本地玩家/);
  assert.equal(game.leaderboardRows[1].score.string, '1000');
  assert.equal(game.leaderboardRows[1].title.string, '王者 +5 星');
  assert.equal(game.leaderboardRows[1].detail.string, '历史纪录 · 详情未记录');
  assert.equal(game.leaderboardRows[2].score.string, '0');
  assert.equal(game.leaderboardRows[2].title.string, '青铜');
  assert.equal(game.leaderboardRows[3].node.active, false);
  assert.equal(game.leaderboardRows[4].node.active, false);
});

test('continuous ranking scroll clamps both ends, preserves resize position and disables inertia for reduced motion', () => {
  const { game } = projectorFixture(1920, 1080);
  game.homeOverlay = 'leaderboard';
  game.leaderboardEntries = Array.from({ length: 10 }, (_, index) => ({ id: `${index}`, score: 1000 - index * 100,
    kind: 'round', nickname: '十二个字昵称也能完整显示呀', perfectCount: 0, finishedAt: 1700000000000 }));
  game.updateLeaderboardUI();
  assert.equal(game.leaderboardRows.filter(row => row.node.active).length, 10);
  assert.equal(game.leaderboardRows[9].rank.string, '10');
  assert.equal(game.leaderboardScroll.getScrollOffset().y, 0);
  game.moveLeaderboardSelection(-1);
  assert.equal(game.leaderboardScroll.getScrollOffset().y, 0);
  game.moveLeaderboardSelection(1);
  assert.equal(game.leaderboardScroll.getScrollOffset().y, 160);
  assert.equal(game.leaderboardScroll.lastTime, 0.16);
  // A touch/wheel position, not the prior keyboard target, is the next input's starting point.
  game.leaderboardScroll.scrollToOffset({ y: 333 }, 0);
  game.moveLeaderboardSelection(1);
  assert.equal(game.leaderboardScroll.getScrollOffset().y, 493);
  for (let i = 0; i < 20; i++) game.moveLeaderboardSelection(1);
  assert.equal(game.leaderboardScroll.getScrollOffset().y, game.leaderboardScroll.getMaxScrollOffset().y);
  game.applyProjectorLayout();
  assert.equal(game.leaderboardScroll.getScrollOffset().y, game.leaderboardScroll.getMaxScrollOffset().y);
  game.reducedMotion = true;
  game.layoutLeaderboardList();
  assert.equal(game.leaderboardScroll.inertia, false);
  game.moveLeaderboardSelection(-1);
  assert.equal(game.leaderboardScroll.lastTime, 0);
  const position = game.leaderboardScroll.getScrollOffset().y;
  game.leaderboardLoading = true;
  game.moveLeaderboardSelection(1);
  assert.equal(game.leaderboardScroll.getScrollOffset().y, position);
  game.leaderboardLoading = false;
  game.leaderboardEntries = [];
  game.updateLeaderboardUI();
  assert.equal(game.leaderboardScroll.getScrollOffset().y, 0);
  assert.equal(game.leaderboardScroll.getMaxScrollOffset().y, 0);
  assert.equal(game.leaderboardEmpty.node.active, true);
});

test('ranking construction uses a masked native scroll viewport, ten reusable rows and only a close control', () => {
  const { game } = projectorFixture(1920, 1080);
  game.hudSafeRoot = new Node('SafeRoot');
  game.leaderboardRows = [];
  game.leaderboardButtons = [];
  game.leaderboardHandlers = [];
  game.buildLeaderboardUI();
  assert.equal(game.leaderboardRows.length, 10);
  assert.equal(game.leaderboardButtons.length, 1);
  assert.equal(game.leaderboardButtons[0].label.string, '×');
  assert.equal(game.leaderboardViewport.getComponent(cc.MaskComponent).type, cc.MaskComponent.Type.GRAPHICS_RECT);
  assert.equal(game.leaderboardScroll.horizontal, false);
  assert.equal(game.leaderboardScroll.vertical, true);
  assert.equal(game.leaderboardScroll.elastic, false);
  assert.equal(game.leaderboardScroll.cancelInnerEvents, true);
  assert.equal(game.leaderboardScroll.content, game.leaderboardContent);
  assert.ok(game.leaderboardRows.every(row => row.node.parent === game.leaderboardContent));
  assert.deepEqual(game.leaderboardContent.getComponent(UITransform).anchorPoint, { x: 0.5, y: 1 });
  assert.equal(game.leaderboardViewport.events.get(ScrollView.EventType.SCROLLING).callback, GamePrototype.updateLeaderboardScrollTrack);
});

test('alternate-skin leaderboard keeps readable gold titles and layered medals on dark panels', () => {
  const { game } = projectorFixture(1920, 1080);
  game.selectedSkinId = 'classic';
  game.homeOverlay = 'leaderboard';
  game.leaderboardEntries = [700, 600, 500, 350].map((score, i) => ({ id: `design-${i}`, kind: 'round',
    nickname: '叠叠玩家', score, perfectCount: 3, finishedAt: 1700000000000 }));
  game.submittedRoundId = 'design-0';
  game.updateLeaderboardUI();
  for (const row of game.leaderboardRows.slice(0, 4)) {
    for (const background of [[39, 83, 87], [28, 65, 69], [48, 99, 101]]) {
      for (const label of [row.player, row.title, row.score, row.detail]) {
        assert.ok(contrast(label.color, background) >= 4.5, 'row text stays readable on all gradient stops');
      }
    }
    assert.equal(row.title.isBold, true);
  }
  assert.ok(game.leaderboardRows.slice(0, 3).every(row => row.graphics.rectangles.filter(shape => shape.circle).length >= 4));
  assert.equal(game.leaderboardRows[3].graphics.rectangles.some(shape => shape.circle), true, 'every rank has a tier avatar');
  assert.equal(game.leaderboardButtons[0].graphics.rectangles.length, 0, 'close is a mint cross, not a filled menu button');
  assert.equal(game.leaderboardRows[0].player.string, '叠叠玩家 · 本局');
});

test('cream leaderboard retains readable text on normal and highlighted pastel rows', () => {
  for (const [width, height] of [[750, 1334], [1440, 1080], [1920, 1080], [3440, 1440]]) {
    const { game } = projectorFixture(width, height);
    game.selectedSkinId = 'minimal-stack';
    game.homeOverlay = 'leaderboard';
    game.leaderboardEntries = [700, 500, 350, 0].map((score, i) => ({ id: `pastel-${i}`, kind: 'round',
      nickname: '十二个字昵称完整显示测试中', score, perfectCount: 3, finishedAt: 1700000000000 }));
    game.submittedRoundId = 'pastel-0';
    game.updateLeaderboardUI();
    for (const row of game.leaderboardRows.slice(0, 4)) {
      for (const background of [[255, 253, 243], [246, 234, 220], [227, 241, 226], [213, 233, 218]]) {
        for (const label of [row.player, row.title, row.score, row.detail]) {
          assert.ok(contrast(label.color, background) >= 4.5, 'pastel text meets 4.5:1 contrast');
        }
      }
    }
    assert.equal(game.leaderboardRows[0].title.string, '王者 +2 星');
  }
});

test('returning to the ready screen refreshes the leaderboard preview once after restoring the home state', () => {
  const game = roundFixture(20);
  let loads = 0;
  Object.assign(game, {
    updateCoinLabels() {}, updateAudioPrompt() {}, applyThemeToUI() {}, drawFrame() {},
    loadHomeLeaderboardPreview() {
      loads += 1;
      assert.equal(this.phase, 'ready');
      assert.equal(this.homeOverlay, 'none');
      assert.equal(this.startGroup.active, true);
    },
  });
  game.showReadyScreen();
  assert.equal(loads, 1);
  assert.equal(game.homeSelection, 0);
  const frameUpdate = descendants(syntax, node => ts.isMethodDeclaration(node)
    && node.name?.getText(syntax) === 'update')[0];
  assert.doesNotMatch(frameUpdate.getText(syntax), /loadHomeLeaderboardPreview/,
    'preview refresh is a screen-entry event, not a per-frame poll');
});

test('record hints track the fixed opening record through approach, equality and a new best', () => {
  const game = roundFixture(20);
  assert.equal(game.recordGapNode.parent, game.gameplayHudGroup, 'hint follows the gameplay HUD lifecycle');
  assert.equal(game.recordGapLabel.node.parent, game.recordGapNode);
  assert.equal(game.recordGapLabel.string, '距最高还差 20 层');
  game.bestScore = 100;
  for (const [score, expected] of [
    [19, '距最高还差 1 层'],
    [20, '已追平 · 再叠 1 层破纪录'],
    [21, '已超过最高 1 层'],
  ]) {
    game.setScore(score, true);
    assert.equal(game.recordGapLabel.string, expected, 'mid-round best-score changes cannot move the target');
    assert.equal(visibleInHierarchy(game.recordGapNode), true);
  }
});

test('first and improved records become the next round target only after settlement', () => {
  for (const [bestScore, score, expected] of [[0, 5, '首个纪录：5 层'], [20, 21, '已超过最高 1 层']]) {
    const game = roundFixture(bestScore);
    if (bestScore === 0) assert.equal(game.recordGapLabel.string, '创造你的首个纪录');
    game.setScore(score, true);
    assert.equal(game.recordGapLabel.string, expected);
    assert.equal(game.bestScore, bestScore, 'live scoring does not persist a replacement record');
    game.showResultScreen();
    assert.equal(game.bestScore, score);
    assert.equal(visibleInHierarchy(game.recordGapNode), false, 'result screen hides the in-game hint');
    game.startGameImmediately();
    assert.equal(game.recordGapLabel.string, `距最高还差 ${score} 层`);
    assert.equal(visibleInHierarchy(game.recordGapNode), true);
  }
});

test('zero-score rounds hide the hint on results and restore the right opening message on restart', () => {
  for (const [bestScore, expected] of [[0, '创造你的首个纪录'], [20, '距最高还差 20 层']]) {
    const game = roundFixture(bestScore);
    game.showResultScreen();
    assert.equal(game.bestScore, bestScore);
    assert.equal(visibleInHierarchy(game.recordGapNode), false);
    game.startGameImmediately();
    assert.equal(game.recordGapLabel.string, expected);
    assert.equal(visibleInHierarchy(game.recordGapNode), true);
  }
});

test('test rounds never show a record hint, including a remembered test-round flag', () => {
  const game = roundFixture(20);
  for (const [testModeEnabled, roundWasTest] of [[true, false], [false, true], [true, true], [false, false]]) {
    Object.assign(game, { testModeEnabled, roundWasTest });
    game.updateTestModeUI();
    game.setScore(19, false);
    assert.equal(game.recordGapNode.active, !(testModeEnabled || roundWasTest));
    assert.equal(game.testModeBadgeLabel.node.active, testModeEnabled, 'the existing developer badge is preserved');
    assert.ok(!(game.recordGapNode.active && game.testModeBadgeLabel.node.active), 'the shared row cannot display both messages');
  }
  game.testModeEnabled = true;
  game.startGameImmediately();
  assert.equal(game.recordGapNode.active, false);
  game.testModeEnabled = false;
  game.startGameImmediately();
  assert.equal(game.recordGapNode.active, true, 'a fresh normal round does not inherit test-round suppression');
  assert.equal(game.recordGapLabel.string, '距最高还差 20 层');
});

test('all projector screen buttons share homepage focus drawing and their real hit rectangle', () => {
  for (const [width, height] of frames) {
    const game = gameFor(width, height);
    game.selectedSkinId = 'minimal-stack';
    game.reducedMotion = false;
    // A legacy TV flag must no longer introduce another multiplier.
    game.tvLayout = true;
    const group = new Node('Panel');
    for (const kind of ['settings', 'leaderboard', 'pause', 'result']) {
      const layout = game.panelLayout(kind);
      for (const selected of [false, true]) {
        const ui = recordingButton(game, group, `${kind}-${selected}`);
        game.drawOverlayButton(ui, layout.buttonWidth, layout.buttonHeight, selected);
        const hit = ui.node.getComponent(UITransform);
        assert.equal(hit.width, layout.buttonWidth, `${width}x${height} ${kind}: hit width`);
        assert.equal(hit.height, layout.buttonHeight, `${width}x${height} ${kind}: hit height`);
        const fill = ui.graphics.rectangles[0];
        assert.equal(fill.width, hit.width);
        assert.equal(fill.height, hit.height);
        assert.equal(ui.node.scale.x, selected ? 1.018 : 1, 'no compounded TV scale');
        if (selected) {
          const ring = ui.graphics.rectangles.at(-1);
          assert.equal(ring.width, hit.width + 16, 'focus ring uses homepage expansion');
          assert.equal(ring.height, hit.height + 16);
          assert.equal(ui.graphics.strokes.at(-1).width, 4);
        }
      }
    }
  }
});

test('pause and result focus route the shared layout dimensions to the selected control only', () => {
  for (const [width, height] of frames) {
    const game = gameFor(width, height);
    const group = new Node('Panel');
    const pauseButtons = ['resume', 'restart', 'home'].map(name => {
      const ui = recordingButton(game, group, name);
      game[`${name}Button`] = ui.node;
      game[`${name}ButtonGraphics`] = ui.graphics;
      game[`${name}ButtonLabel`] = ui.label;
      return ui;
    });
    game.resultRestartButton = recordingButton(game, group, 'result-restart');
    game.resultHomeButton = recordingButton(game, group, 'result-home');
    const draws = [];
    game.drawOverlayButton = (ui, drawWidth, drawHeight, selected) => draws.push({ ui, drawWidth, drawHeight, selected });
    for (const kind of ['pause', 'result']) {
      const layout = game.panelLayout(kind);
      const buttons = kind === 'pause' ? pauseButtons : [game.resultRestartButton, game.resultHomeButton];
      for (let selected = 0; selected < buttons.length; selected += 1) {
        draws.length = 0;
        game[`${kind}Selection`] = selected;
        if (kind === 'pause') game.updatePauseMenuFocus();
        else game.updateResultFocus();
        assert.equal(draws.length, buttons.length);
        draws.forEach((draw, index) => {
          assert.equal(draw.ui.node, buttons[index].node);
          assert.equal(draw.drawWidth, layout.buttonWidth);
          assert.equal(draw.drawHeight, layout.buttonHeight);
          assert.equal(draw.selected, index === selected);
        });
      }
    }
  }
});

test('settings state pills remain distinct from their caption and share button focus contrast', () => {
  for (const [width, height] of frames) {
    const game = gameFor(width, height);
    game.selectedSkinId = 'minimal-stack';
    game.reducedMotion = false;
    const layout = game.panelLayout('settings');
    const ui = recordingButton(game, new Node('Settings'), 'Toggle');
    for (const enabled of [true, false]) {
      for (const selected of [true, false]) {
        game.drawSettingToggle(ui, '减少动态效果', enabled, selected);
        const state = ui.node.getChildByName('SettingState').getComponent(Label);
        const captionBounds = ui.label.node.getComponent(UITransform);
        const stateBounds = state.node.getComponent(UITransform);
        const captionRight = ui.label.node.position.x + captionBounds.width / 2;
        const stateLeft = state.node.position.x - stateBounds.width / 2;
        assert.ok(stateLeft - captionRight >= 16, 'caption and on/off state do not overlap');
        assert.ok(state.node.position.x + stateBounds.width / 2 <= layout.buttonWidth / 2 - 24,
          'state text clears the rounded button edge');
        assert.equal(ui.label.string, '减少动态效果');
        assert.equal(state.string, enabled ? '开' : '关');
        assert.deepEqual(state.color, ui.label.color);
      }
    }
    assert.equal(ui.node.children.filter(node => node.name === 'SettingState').length, 1, 'redrawing reuses the state label');
  }
});

test('pause hides the entire gameplay HUD and resume restores the prior phase with an input lock', () => {
  for (const previousPhase of ['playing', 'dropping']) {
    for (const testModeEnabled of [false, true]) {
      for (const reducedMotion of [false, true]) {
        const { game } = projectorFixture(1920, 1080);
        const paused = [];
        const compositions = [];
        let placed = 0;
        let feedbackResets = 0;
        Object.assign(game, {
          phase: previousPhase, homeOverlay: 'none', testModeEnabled, reducedMotion,
          pauseSelection: 2, resumeInputLock: 1,
          world3D: { setPaused(value) { paused.push(value); } },
          updateWorldComposition() { compositions.push(this.phase); },
          resetPerfectFeedback() { feedbackResets += 1; },
          // Theme/UI redraws while paused must not re-enable the test badge.
          drawFrame() { this.updateTestModeUI(); },
          consumeActionDebounce: () => true,
          placeCurrentBlock() { placed += 1; },
        });
        game.gameplayHudGroup.active = game.pauseButton.active = true;
        game.testModeBadgeLabel.node.active = testModeEnabled;
        game.setScore(19, false);
        const hintBeforePause = game.recordGapLabel.string;
        game.pauseGroup.active = false;
        const before = Date.now();
        game.pauseGame();
        assert.equal(game.phase, 'paused');
        assert.equal(game.phaseBeforePause, previousPhase);
        assert.equal(game.gameplayHudGroup.active, false);
        assert.equal(game.pauseButton.active, false);
        assert.equal(game.testModeBadgeLabel.node.active, false);
        assert.equal(visibleInHierarchy(game.recordGapNode), false, 'pause hides the record hint with its parent HUD');
        assert.equal(game.pauseGroup.active, true);
        assert.equal(game.pauseSelection, 0, 'resume receives initial focus');
        assert.equal(game.resumeInputLock, 0);
        assert.ok(game.lastActionAt >= before);
        assert.equal(feedbackResets, 1);
        assert.deepEqual(paused, [true]);
        game.pauseGame();
        assert.deepEqual(paused, [true], 'repeated pause is a no-op');
        game.resumeGame();
        assert.equal(game.phase, previousPhase);
        assert.equal(game.gameplayHudGroup.active, true);
        assert.equal(game.pauseButton.active, true);
        assert.equal(game.testModeBadgeLabel.node.active, testModeEnabled);
        assert.equal(visibleInHierarchy(game.recordGapNode), !testModeEnabled, 'resume restores only the normal-round hint');
        assert.equal(game.recordGapLabel.string, hintBeforePause, 'resume preserves the score and opening target');
        assert.equal(game.pauseGroup.active, false);
        assert.deepEqual(game.pauseGroup.scale, { x: 1, y: 1, z: 1 });
        assert.deepEqual(paused, [true, false]);
        assert.deepEqual(compositions, ['paused', previousPhase]);
        assert.equal(game.resumeInputLock, 0.14);
        game.tryPrimaryAction();
        assert.equal(placed, 0, 'resume confirmation cannot immediately drop a block');
        game.resumeInputLock = 0;
        game.tryPrimaryAction();
        assert.equal(placed, previousPhase === 'playing' ? 1 : 0, 'dropping resumes without creating a second placement');
        game.resumeGame();
        assert.deepEqual(paused, [true, false], 'repeated resume is a no-op');
        for (const phase of ['ready', 'paused', 'falling', 'gameover', 'playing', 'dropping']) {
          game.phase = phase;
          game.updateTestModeUI();
          assert.equal(game.testModeBadgeLabel.node.active,
            testModeEnabled && (phase === 'playing' || phase === 'dropping'),
            `${phase}: badge visibility is derived only from active gameplay`);
        }
      }
    }
  }
});

test('every current theme supplies high-contrast home, preview and record-hint text with a visible focus ring and pointer', () => {
  const skins = descendants(syntax, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'SKINS')[0];
  assert.ok(skins && ts.isObjectLiteralExpression(skins.initializer));
  const skinIds = skins.initializer.properties.map(property => property.name.text);
  assert.ok(skinIds.length >= 6, 'all current themes are checked');
  const { game } = projectorFixture(1920, 1080);
  const home = makeHomeFixture(1920, 1080);
  game.reducedMotion = false;
  game.drawPauseHudButton = () => {};
  for (const id of skinIds) {
    game.selectedSkinId = id;
    const skin = game.currentSkin();
    home.selectedSkinId = id;
    home.updateHomeLeaderboardPreviewUI();
    const previewBackground = home.homeLeaderboardPreviewGraphics.fills[0];
    assert.deepEqual([previewBackground.r, previewBackground.g, previewBackground.b], Array.from(skin.panelColor));
    assert.equal(previewBackground.a, 255, `${id}: preview has its own opaque backdrop`);
    for (const label of [home.homeLeaderboardPreviewTitle, home.homeLeaderboardPreviewSubtitle,
      home.homeLeaderboardPreviewEmpty, ...home.homeLeaderboardPreviewRows, ...home.homeLeaderboardPreviewDetails,
      ...home.homeLeaderboardPreviewTitles]) {
      assert.ok(contrast(label.color, skin.panelColor) >= 4.5, `${id}: preview text remains readable`);
      assert.equal(label.color.a, 255);
    }
    assert.ok(contrast(home.homeLeaderboardPreviewHint.color,
      id === 'minimal-stack' ? [220, 235, 222] : skin.buttonColor) >= 4.5, `${id}: preview action is readable on its own fill`);
    game.drawGameplayHudCards();
    const hintBackground = game.recordGapGraphics.fills[0];
    assert.deepEqual([hintBackground.r, hintBackground.g, hintBackground.b], Array.from(skin.panelColor));
    assert.equal(hintBackground.a, 255, 'record hint uses its own opaque backdrop');
    assert.ok(contrast(game.recordGapLabel.color, skin.panelColor) >= 4.5, `${id}: record hint remains readable`);
    assert.equal(game.recordGapLabel.color.a, 255);
    const hintRect = game.recordGapGraphics.rectangles[0];
    assert.equal(hintRect.width, game.hudLayout().recordGapWidth);
    assert.equal(hintRect.height, game.hudLayout().recordGapHeight);
    for (const background of [skin.panelColor, skin.buttonColor, skin.accentColor]) {
      const text = game.textOnButton(background);
      assert.ok(text.r === 0 || text.r === 255, `${id}: text uses a clear black/white contrast choice`);
      assert.equal(text.g, text.r);
      assert.equal(text.b, text.r);
      assert.equal(text.a, 255);
      assert.ok(contrast(text, background) >= 4.5, `${id}: text contrast is at least 4.5:1`);
    }
    for (const selected of [false, true]) {
      const graphics = recordingGraphics();
      const label = new Label();
      game.drawHomeButton(graphics, label, 620, 116, selected);
      assert.ok(contrast(label.color, selected ? skin.accentColor : skin.buttonColor) >= 4.5,
        `${id}: ${selected ? 'focused' : 'unfocused'} button caption retains contrast`);
      if (selected) {
        const outerRing = graphics.strokes.at(-1);
        assert.ok(outerRing.width >= 4);
        assert.ok(contrast(outerRing.color, skin.panelColor) >= 4.5, `${id}: outer focus ring is visible against panel`);
        assert.ok(contrast(graphics.fills.at(-1), skin.accentColor) >= 4.5, `${id}: focus pointer is visible against button`);
        assert.equal(graphics.node.scale.x, 1.018);
      }
    }
  }
});
