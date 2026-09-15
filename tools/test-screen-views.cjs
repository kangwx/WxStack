'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
class Button {}
class UITransform {}
class Widget {}
const cc = { Button, UITransform, Widget, Node: class { constructor() { throw new Error('Views cannot create nodes'); } }, Label: class {} };
function load(file) {
  const context = { exports: {}, require(name) { assert.equal(name, 'cc'); return cc; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../assets/scripts/ui', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const views = load('ScreenViews.ts');
const { StackUIPresenter } = load('StackUIPresenter.ts');

function tracked(object, key, initial, counters) {
  let value = initial;
  Object.defineProperty(object, key, { enumerable: true, get: () => value, set(next) { value = next; counters[key] = (counters[key] || 0) + 1; } });
}
function node(name = 'authored', withWidget = false) {
  const counts = {}, components = new Map();
  const transform = { width: 100, height: 40, setContentSize(w, h) { counts.resize = (counts.resize || 0) + 1; this.width = w; this.height = h; } };
  const button = {}; tracked(button, 'interactable', true, counts);
  const widget = { enabled: true, horizontalCenter: 0, verticalCenter: 0, top: 0, bottom: 0, left: 0, right: 0,
    updateAlignment() { counts.alignment = (counts.alignment || 0) + 1; } };
  components.set(UITransform, transform); components.set(Button, button);
  if (withWidget) components.set(Widget, widget);
  const n = { name, counts, transform, button, widget, position: { x: 0, y: 0, z: 7 }, scale: { x: 1.18, y: .88, z: 1 }, opacity: 123,
    getComponent(type) { counts.lookups = (counts.lookups || 0) + 1; return components.get(type) || null; },
    setPosition(x, y, z) { counts.position = (counts.position || 0) + 1; this.position = { x, y, z }; },
    addComponent() { throw new Error('Views cannot create components'); },
  };
  tracked(n, 'active', true, counts);
  return n;
}
function label(name, withWidget = false) {
  const counts = {}, l = { node: node(name, withWidget), counts, fontSize: 24, lineHeight: 30, isBold: false, enableWrapText: false };
  tracked(l, 'string', '', counts); return l;
}
function button(name) { return { node: node(name), label: label(`${name}-caption`) }; }
function homeBindings() {
  return { homeCoinLabel: label('coin'), homeBestLabel: label('best'), homeStaminaLabel: label('stamina'),
    startPromptLabel: label('start-caption'), startButton: node('start'), controlsLabel: label('controls'),
    homeLeaderboardPreviewTitle: label('preview-title'), homeLeaderboardPreviewSubtitle: label('preview-subtitle'),
    homeLeaderboardPreviewHint: label('preview-hint'), homeLeaderboardPreviewEmpty: label('preview-empty'),
    homeLeaderboardPreviewRows: [label('score0'), label('score1')], homeLeaderboardPreviewDetails: [label('nickname0'), label('nickname1')],
    homeLeaderboardPreviewRanks: [label('rank0'), label('rank1')], homeLeaderboardPreviewTitles: [label('title0'), label('title1')],
  };
}

test('home presents resource, loading/stamina and preview states; identical models cause no new writes', () => {
  const b = homeBindings(), view = new views.HomeScreenView(b);
  const model = { coins: 12, bestScore: 44, staminaText: '体力 0/5 · 00:01 后恢复', startText: '体力不足，等待恢复', startEnabled: false,
    controlsText: '轻点按钮，即刻开叠', preview: { titleText: '排行榜', emptyText: '暂无成绩，等你上榜', emptyVisible: false,
      rows: [{ scoreText: '44 层', nickname: '玩家甲', rankText: '01', titleText: '高手', visible: true }] } };
  view.render(Object.freeze(model));
  assert.equal(b.homeCoinLabel.string, '12'); assert.equal(b.homeBestLabel.string, '44');
  assert.equal(b.homeStaminaLabel.string, model.staminaText); assert.equal(b.startPromptLabel.string, model.startText);
  assert.equal(b.startButton.button.interactable, false); assert.equal(b.homeLeaderboardPreviewDetails[0].string, '玩家甲');
  assert.equal(b.homeLeaderboardPreviewEmpty.node.active, false); assert.equal(b.homeLeaderboardPreviewRows[1].node.active, false);
  const writes = b.homeCoinLabel.counts.string, stateWrites = b.startButton.counts.interactable, lookups = b.startButton.counts.lookups;
  view.render(model);
  assert.equal(b.homeCoinLabel.counts.string, writes); assert.equal(b.startButton.counts.interactable, stateWrites);
  assert.equal(b.startButton.counts.lookups, lookups, 'the authored Button is cached');
  assert.equal(b.homeCoinLabel.node.counts.resize, undefined, 'render does not perform layout');
  view.render({ ...model, preview: { ...model.preview, subtitleVisible: false, hintVisible: false,
    rows: [{ ...model.preview.rows[0], detailVisible: false, rankVisible: false, titleVisible: false }] } });
  assert.equal(b.homeLeaderboardPreviewRows[0].node.active, true, 'compact preview retains its score row');
  assert.equal(b.homeLeaderboardPreviewDetails[0].node.active, false);
  assert.equal(b.homeLeaderboardPreviewRanks[0].node.active, false);
  assert.equal(b.homeLeaderboardPreviewSubtitle.node.active, false);
});

test('HUD text changes preserve score/perfect animation transforms and opacity', () => {
  const b = { scoreLabel: label('score'), bestLabel: label('best'), recordGapLabel: label('gap'), recordGapNode: node('gap-card'),
    perfectLabel: label('perfect'), testModeBadgeLabel: label('test') };
  const view = new views.GameplayHudView(b);
  const before = JSON.stringify({ scale: b.scoreLabel.node.scale, position: b.perfectLabel.node.position, opacity: b.perfectLabel.node.opacity });
  view.render({ score: 30, bestScore: 40, recordGapText: '距最高还差 10 层', recordGapVisible: true, perfectText: '完美 ×3', testModeVisible: false });
  assert.equal(b.scoreLabel.string, '30'); assert.equal(b.recordGapLabel.string, '距最高还差 10 层');
  assert.equal(b.testModeBadgeLabel.node.active, false);
  assert.equal(JSON.stringify({ scale: b.scoreLabel.node.scale, position: b.perfectLabel.node.position, opacity: b.perfectLabel.node.opacity }), before);
  view.render({ score: 0, bestScore: 40, recordGapText: '', recordGapVisible: false, perfectText: '', testModeVisible: true });
  assert.equal(b.recordGapNode.active, false); assert.equal(b.perfectLabel.string, '');
});

test('result hides used revival, restores it for a new round, and retains reward wording', () => {
  const b = { resultTitleLabel: label('title'), resultScoreLabel: label('score'), resultBestLabel: label('best'), resultCoinLabel: label('reward'),
    resultReviveButton: button('revive'), resultRestartButton: button('restart'), resultHomeButton: button('home') };
  const view = new views.ResultScreenView(b);
  view.render({ title: '再接再厉', score: 9, bestText: '测试成绩 · 最高 12', coinText: '测试模式不获得金币', reviveText: '扫码复活 · 免费', reviveEnabled: false, restartText: '重新开始' });
  assert.equal(b.resultCoinLabel.string, '测试模式不获得金币'); assert.equal(b.resultBestLabel.string, '测试成绩 · 最高 12');
  assert.equal(b.resultReviveButton.node.button.interactable, false);
  assert.equal(b.resultReviveButton.node.active, false);
  assert.equal(b.resultRestartButton.node.button.interactable, true); assert.equal(b.resultHomeButton.node.button.interactable, true);
  const count = b.resultReviveButton.node.counts.interactable;
  view.render({ title: '再接再厉', score: 9, bestText: '最高 12', coinText: '完美奖励 2 次 · 金币 +2', reviveText: '扫码复活 · 免费', reviveEnabled: true, restartText: '体力不足 00:30', restartEnabled: false });
  assert.equal(b.resultReviveButton.node.active, true);
  assert.equal(b.resultReviveButton.node.counts.interactable, count + 1); assert.equal(b.resultRestartButton.node.button.interactable, false);
});

test('revive status and QR resize never create or regenerate a session texture', () => {
  const spriteFrame = Object.freeze({ session: 'existing' });
  const b = { reviveStatusLabel: label('status'), reviveCloseButton: button('close'), reviveQr: { node: node('qr'), spriteFrame } };
  const view = new views.ReviveDialogView(b);
  view.render({ statusText: '等待扫码确认', closeText: '关闭', closeEnabled: true, qrVisible: true });
  view.applyLayout({ qr: { width: 300, height: 300 }, status: { width: 380, height: 100, wrap: true } });
  view.applyLayout({ qr: { width: 300, height: 300 } });
  assert.equal(b.reviveQr.spriteFrame, spriteFrame); assert.equal(b.reviveQr.node.counts.resize, 1);
  assert.equal(b.reviveStatusLabel.enableWrapText, true); assert.equal(b.reviveStatusLabel.string, '等待扫码确认');
  view.render({ statusText: '二维码已过期', qrVisible: false });
  assert.equal(b.reviveQr.node.active, false); assert.equal(b.reviveCloseButton.label.string, '关闭');
});

test('settings updates all three supplied state captions and never changes the setting values itself', () => {
  const b = { nicknameLabel: label('nickname'), soundToggle: button('sound'), motionToggle: button('motion'), testModeToggle: node('test'),
    testModeToggleLabel: label('test-caption'), settingStateLabels: [label('sound-state'), label('motion-state'), label('test-state')], restoreStaminaButton: button('restore') };
  const model = Object.freeze({ nickname: '玩家乙', soundText: '音效', motionText: '减少动效', testModeText: '测试模式',
    soundStateText: '开', motionStateText: '关', testModeStateText: '关', restoreText: '恢复体力', restoreEnabled: false });
  new views.SettingsScreenView(b).render(model);
  assert.equal(b.nicknameLabel.string, '玩家乙'); assert.equal(b.settingStateLabels.map(l => l.string).join(','), '开,关,关');
  assert.equal(b.restoreStaminaButton.node.button.interactable, false); assert.equal(model.soundStateText, '开');
});

test('nickname hint-only updates preserve typed draft and optional button state', () => {
  const b = { nicknameEditor: { string: '正在输入', node: node('editor') }, nicknameHint: label('hint'), nicknameSaveButton: button('save'), nicknameCancelButton: button('cancel') };
  const view = new views.NicknameDialogView(b);
  view.render({ hintText: '昵称最多 12 个字符', saveEnabled: false });
  assert.equal(b.nicknameEditor.string, '正在输入'); assert.equal(b.nicknameSaveButton.node.button.interactable, false);
  view.render({ hintText: '保存后用于新成绩', draftText: '新昵称', saveEnabled: true });
  assert.equal(b.nicknameEditor.string, '新昵称'); assert.equal(b.nicknameSaveButton.node.button.interactable, true);
});

test('leaderboard fills only bound rows, clears stale text and hides unused rows', () => {
  const row = name => ({ node: node(name), rank: label('rank'), player: label('player'), score: label('score'), title: label('title'), detail: label('detail') });
  const b = { leaderboardStatus: label('status'), leaderboardEmpty: label('empty'), leaderboardPageLabel: label('page'), leaderboardRows: [row('0'), row('1')] };
  const view = new views.LeaderboardScreenView(b);
  view.render({ statusText: '本机 Top 10 · 每局成绩', emptyText: '暂无成绩', pageText: '1 / 2', emptyVisible: false,
    rows: [{ visible: true, rankText: '01', playerText: '玩家甲 · 本局', scoreText: '50', titleText: '高手', detailText: '09-14 · 完美 5 次' }] });
  assert.equal(b.leaderboardRows[0].player.string, '玩家甲 · 本局'); assert.equal(b.leaderboardRows[1].node.active, false);
  view.render({ statusText: '离线', emptyText: '请重试', pageText: '', emptyVisible: true, rows: [] });
  assert.equal(b.leaderboardRows[0].node.active, false); assert.equal(b.leaderboardRows[0].player.string, '');
  assert.equal(b.leaderboardEmpty.node.active, true);
});

test('pause restart stamina updates leave resume and home actions intact', () => {
  const b = { resumeButton: node('resume'), resumeButtonLabel: label('resume'), restartButton: node('restart'), restartButtonLabel: label('restart'), homeButton: node('home'), homeButtonLabel: label('home') };
  new views.PauseScreenView(b).render({ resumeText: '继续游戏', restartText: '体力不足 01:00', homeText: '返回首页', restartEnabled: false });
  assert.equal(b.restartButtonLabel.string, '体力不足 01:00'); assert.equal(b.restartButton.button.interactable, false);
  assert.equal(b.resumeButton.button.interactable, true); assert.equal(b.homeButton.button.interactable, true);
});

test('layout reuses components, skips repeated geometry and gives Widget exclusive position ownership', () => {
  const b = homeBindings(); b.homeCoinLabel = label('coin', true);
  const view = new views.HomeScreenView(b);
  const geometry = { coins: { width: 160, height: 50, widget: { horizontalCenter: 20, verticalCenter: -10 }, fontSize: 32, lineHeight: 38, bold: true } };
  view.applyLayout(geometry);
  const calls = { ...b.homeCoinLabel.node.counts };
  view.applyLayout(geometry);
  assert.deepEqual(b.homeCoinLabel.node.counts, calls);
  assert.equal(calls.alignment, 1); assert.equal(calls.position, undefined);
  assert.equal(b.homeCoinLabel.fontSize, 32); assert.equal(b.homeCoinLabel.node.widget.horizontalCenter, 20);
  assert.throws(() => view.applyLayout({ coins: { position: { x: 5, y: 2 } } }), /conflicts with the authored Widget/);
  view.applyLayout({ best: { position: { x: 5, y: 2 }, width: 180 } });
  assert.deepEqual(b.homeBestLabel.node.position, { x: 5, y: 2, z: 7 });
  assert.equal(b.homeBestLabel.node.scale.x, 1.18, 'layout never changes animation scale');
});

test('presenter coalesces page events and hidden views do not read or write UI', () => {
  const b = homeBindings(), view = new views.HomeScreenView(b);
  let reads = 0;
  const model = { coins: 5, bestScore: 10, staminaText: '体力 5/5 · 已满', startText: '开始游戏' };
  const presenter = new StackUIPresenter(() => { reads++; return model; }, value => view.render(value));
  presenter.invalidate(); presenter.flush(); assert.equal(reads, 0); assert.equal(b.homeCoinLabel.counts.string, undefined);
  presenter.setVisible(true); presenter.invalidate(); presenter.invalidate(); presenter.flush(); presenter.flush();
  assert.equal(reads, 1); assert.equal(b.homeCoinLabel.counts.string, 1);
  presenter.setVisible(false); model.coins = 8; presenter.invalidate(); presenter.flush();
  assert.equal(reads, 1); assert.equal(b.homeCoinLabel.string, '5');
  presenter.setVisible(true); presenter.flush(); assert.equal(b.homeCoinLabel.string, '8');
});
