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
  children = [];
  constructor(name) { this.name = name; }
  set parent(value) { this._parent = value; value.children.push(this); }
  get parent() { return this._parent; }
  addComponent(Type) { const component = new Type(); component.node = this; this.components.set(Type, component); return component; }
  getComponent(Type) { return this.components.get(Type); }
  getChildByName(name) { return this.children.find(child => child.name === name); }
  setPosition(x, y, z) { this.position = { x, y, z }; }
  setScale(x, y, z) { this.scale = { x, y, z }; }
}
class UITransform {
  setContentSize(width, height) { this.width = width; this.height = height; }
}
class Button { static Transition = { NONE: 0 }; }
class Label {
  static HorizontalAlign = { CENTER: 0, LEFT: 1 };
  static VerticalAlign = { CENTER: 0 };
  static Overflow = { SHRINK: 0 };
}
class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) { Object.assign(this, { r, g, b, a }); }
}
const cc = {
  _decorator: { ccclass: () => Type => Type }, Component: class {},
  Node, UITransform, Button, Label, Color, Graphics: class {}, Widget: class {},
  UIOpacity: class { opacity = 255; },
  Vec3: class { constructor(x, y, z) { Object.assign(this, { x, y, z }); } },
  Tween: { stopAllByTarget() {} },
  tween: () => ({ to() { return this; }, start() {} }),
  KeyCode: {}, sys: { isBrowser: false, localStorage: null },
};
const sourcePath = path.join(__dirname, '../assets/scripts/StackGame.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const syntax = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true);
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
} }).outputText;
function loadLayoutModule() {
  const runtime = { exports: {} };
  const layoutSource = fs.readFileSync(path.join(__dirname, '../assets/scripts/ProjectorLayout.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(layoutSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
  } }).outputText, runtime);
  return runtime.exports;
}
const sandbox = { exports: {}, require: id => id === 'cc' ? cc : id === './ProjectorLayout' ? loadLayoutModule() : {} };
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

test('settings remote navigation visits sound, reduced motion, test mode, then return and wraps both ways', () => {
  const game = gameFor(1920, 1080);
  const activated = [];
  const focused = [];
  Object.assign(game, {
    settingsSelection: 0,
    toggleSoundSetting: () => activated.push('sound'),
    toggleMotionSetting: () => activated.push('motion'),
    toggleTestMode: () => activated.push('test'),
    closeHomeOverlay: () => activated.push('return'),
    updateSettingsUI() { focused.push(this.settingsSelection); },
  });
  for (let index = 0; index < 4; index += 1) {
    game.activateSettingsSelection();
    game.moveSettingsSelection(1);
  }
  assert.deepEqual(activated, ['sound', 'motion', 'test', 'return']);
  assert.deepEqual(focused, [1, 2, 3, 0]);
  activated.length = 0;
  focused.length = 0;
  for (let index = 0; index < 4; index += 1) {
    game.moveSettingsSelection(-1);
    game.activateSettingsSelection();
  }
  assert.deepEqual(activated, ['return', 'test', 'motion', 'sound']);
  assert.deepEqual(focused, [3, 2, 1, 0]);
});

function makeHomeFixture(width, height) {
  const game = gameFor(width, height);
  game.startGroup = new Node('StartScreen');
  game.selectedSkinId = 'minimal-stack';
  game.homeOverlay = 'none';
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
    moveTo() {}, lineTo() {}, close() {},
    fill() { this.fills.push(this.fillColor); },
    stroke() { this.strokes.push({ color: this.strokeColor, width: this.lineWidth }); },
  };
}

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
      'LeaderboardEmpty', 'LeaderboardPage'],
  };
  for (const [kind, names] of Object.entries(groups)) {
    const group = new Node(kind);
    game[`${kind}Group`] = group;
    for (const name of names) game.makeLabel(name, group, name, 1, new Color(), 1, 1);
  }
  game.leaderboardEmpty = game.leaderboardGroup.getChildByName('LeaderboardEmpty').getComponent(Label);
  const buttons = {};
  buttons.settings = ['soundToggle', 'motionToggle', 'testToggle', 'settingsCloseButton'].map(key => {
    const ui = recordingButton(game, game.settingsGroup, key);
    if (key === 'testToggle') Object.assign(game, { testModeToggle: ui.node, testModeToggleGraphics: ui.graphics, testModeToggleLabel: ui.label });
    else game[key] = ui;
    return ui;
  });
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
  buttons.leaderboard = game.leaderboardButtons = ['previous', 'next', 'return'].map(name => recordingButton(game, game.leaderboardGroup, name));
  game.leaderboardRows = Array.from({ length: 5 }, (_, index) => {
    const node = game.makeNode(`Row-${index}`, game.leaderboardGroup);
    node.addComponent(UITransform);
    return { node, graphics: recordingGraphics(),
      rank: game.makeLabel('Rank', node, '', 1, new Color(), 1, 1),
      score: game.makeLabel('Score', node, '', 1, new Color(), 1, 1),
      detail: game.makeLabel('Detail', node, '', 1, new Color(), 1, 1) };
  });
  const hud = new Node('HUD');
  for (const key of ['score', 'best']) {
    const node = game.makeNode(`${key}Card`, hud);
    node.addComponent(UITransform);
    game[`${key}HudCard`] = node;
    game[`${key}CaptionLabel`] = game.makeLabel('Caption', node, '', 1, new Color(), 1, 1);
    game[`${key}Label`] = game.makeLabel('Value', node, '', 1, new Color(), 1, 1);
  }
  const pause = recordingButton(game, hud, 'PauseButton');
  game.pauseButton = pause.node;
  game.pauseButtonLabel = pause.label;
  game.testModeBadgeLabel = game.makeLabel('TestModeBadge', hud, '', 1, new Color(), 1, 1);
  return { game, buttons };
}

test('the controller applies shared geometry to all panels, rows, hit targets and HUD labels', () => {
  for (const [width, height] of frames) {
    const { game, buttons } = projectorFixture(width, height);
    game.applyProjectorLayout();
    for (const kind of ['settings', 'pause', 'result', 'leaderboard']) {
      const layout = game.panelLayout(kind);
      assert.equal(layout.panelX, game.homeLayout().panelX, 'all menus retain the home composition');
      const titleName = `${kind[0].toUpperCase()}${kind.slice(1)}Title`;
      const title = game[`${kind}Group`].getChildByName(titleName).getComponent(Label);
      assert.equal(title.node.position.x, layout.panelX);
      assert.equal(title.node.position.y, layout.titleY);
      assert.equal(title.fontSize, layout.titleSize);
      assert.equal(title.isBold, true);
      buttons[kind].forEach((ui, index) => {
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
      assert.equal(row.rank.node.position.x, rank.rankX);
      assert.equal(row.score.node.position.x, rank.detailX);
      assert.equal(row.detail.node.position.x, rank.detailX);
      assert.equal(row.detail.node.getComponent(UITransform).width, rank.detailWidth);
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
  }
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
          gameplayHudGroup: new Node('GameplayHud'),
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
        game.pauseGroup.active = false;
        const before = Date.now();
        game.pauseGame();
        assert.equal(game.phase, 'paused');
        assert.equal(game.phaseBeforePause, previousPhase);
        assert.equal(game.gameplayHudGroup.active, false);
        assert.equal(game.pauseButton.active, false);
        assert.equal(game.testModeBadgeLabel.node.active, false);
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

test('every current theme supplies opaque, high-contrast home text and a contrasting focus ring and pointer', () => {
  const skins = descendants(syntax, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'SKINS')[0];
  assert.ok(skins && ts.isObjectLiteralExpression(skins.initializer));
  const skinIds = skins.initializer.properties.map(property => property.name.text);
  assert.ok(skinIds.length >= 6, 'all current themes are checked');
  const game = gameFor(1920, 1080);
  game.reducedMotion = false;
  for (const id of skinIds) {
    game.selectedSkinId = id;
    const skin = game.currentSkin();
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
