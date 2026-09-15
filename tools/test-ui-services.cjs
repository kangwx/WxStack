const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const scripts = path.join(__dirname, '../assets/scripts/ui');
function load(name) {
  const runtime = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(scripts, `${name}.ts`), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, runtime);
  return runtime.exports[name];
}
const UIRouter = load('UIRouter');
const UIInputRouter = load('UIInputRouter');
const StackGameUIAdapter = load('StackGameUIAdapter');
const StackUIPresenter = load('StackUIPresenter');
const UILayoutService = load('UILayoutService');
const UITransitionController = load('UITransitionController');

test('route stack restores the launching focus, rejects repeated overlays, and blocks navigation during transitions', () => {
  const router = new UIRouter();
  assert.equal(router.top, 'home');
  assert.equal(router.push('settings', 2), true);
  assert.equal(router.push('nickname', 3), true);
  assert.equal(router.top, 'nickname');
  assert.equal(router.push('settings', 0), false);
  assert.equal(router.depth, 2);
  router.transitionLocked = true;
  assert.equal(router.pop(), undefined);
  assert.equal(router.push('leaderboard'), false);
  router.transitionLocked = false;
  assert.equal(router.pop().returnFocus, 3);
  assert.equal(router.top, 'settings');
  assert.equal(router.pop().returnFocus, 2);
  router.reset('gameplay');
  assert.equal(router.top, 'gameplay');
  router.push('pause', 0); router.reset('result');
  assert.equal(router.depth, 0);
  assert.equal(router.top, 'result');
});

test('input deduplicates held keys and mixed-source actions without consuming a blocked action', () => {
  let now = 1000;
  const input = new UIInputRouter(() => now);
  assert.equal(input.keyDown(13), true);
  assert.equal(input.keyDown(13), false);
  input.keyUp(13);
  assert.equal(input.keyDown(13, true), false);
  assert.equal(input.keyDown(13), true);
  assert.equal(input.acceptAction(true, 100), false);
  assert.equal(input.acceptAction(false, 100), true);
  assert.equal(input.acceptAction(false, 100), false);
  now += 99; assert.equal(input.acceptAction(false, 100), false);
  now += 1; assert.equal(input.acceptAction(false, 100), true);
  now = 200; assert.equal(input.acceptAction(false, 100), true, 'clock rollback cannot lock the UI');
  input.clear();
  assert.equal(input.keyDown(13), true);
  assert.equal(input.acceptAction(false, 100), true, 'foreground reset clears the action debounce');
});

test('accepted overlay navigation commits at the transition midpoint without unlocking user input', () => {
  const router = new UIRouter();
  router.transitionLocked = true;
  assert.equal(router.push('settings', 1), false);
  assert.equal(router.commitPush('settings', 1), true);
  assert.equal(router.top, 'settings');
  assert.equal(router.depth, 1);
  assert.equal(router.transitionLocked, true);
  assert.equal(router.commitPush('settings', 2), false, 'repeated transition callbacks cannot duplicate a route');
  assert.equal(router.push('leaderboard'), false);
  assert.equal(router.pop(), undefined);
  const closed = router.commitPop();
  assert.equal(closed.screen, 'settings');
  assert.equal(closed.returnFocus, 1);
  assert.equal(router.top, 'home');
  assert.equal(router.transitionLocked, true);
  assert.equal(router.commitPop(), undefined);
  router.transitionLocked = false;
  assert.equal(router.push('leaderboard', 2), true);
});

test('adapter publishes changed immutable snapshots, keeps game commands intact, and disposes subscribers', () => {
  const state = { phase: 'ready', score: 0, bestScore: 20, coins: 100, testMode: false,
    reducedMotion: false, soundEnabled: true, nickname: '玩家', stamina: 5, staminaNextAt: null };
  let commands = 0;
  const commandPort = { startRound() { commands++; } };
  const adapter = new StackGameUIAdapter(() => state, commandPort);
  const seen = [];
  const subscription = adapter.subscribe(snapshot => seen.push(snapshot));
  assert.equal(seen.length, 1);
  assert.equal(Object.isFrozen(seen[0]), true);
  assert.notEqual(seen[0], state);
  adapter.publish(); assert.equal(seen.length, 1);
  state.score = 1; adapter.publish();
  assert.equal(seen.length, 2);
  assert.equal(seen[0].score, 0);
  state.stamina = 4; state.staminaNextAt = 1800000; adapter.publish();
  assert.equal(seen.length, 3);
  adapter.commands.startRound(); assert.equal(commands, 1);
  subscription.dispose(); state.coins = 101; adapter.publish();
  assert.equal(seen.length, 3);
  adapter.dispose(); adapter.publish();
  assert.throws(() => adapter.subscribe(() => {}), /disposed/);
});

test('a newly subscribed page receives fresh state without suppressing the next update of earlier subscribers', () => {
  const state = { phase: 'ready', score: 0, bestScore: 0, coins: 100, testMode: false,
    reducedMotion: false, soundEnabled: true, nickname: '玩家', stamina: 5, staminaNextAt: null };
  const adapter = new StackGameUIAdapter(() => state, {});
  const first = []; const second = [];
  adapter.subscribe(snapshot => first.push(snapshot.score));
  state.score = 8;
  adapter.subscribe(snapshot => second.push(snapshot.score));
  assert.deepEqual(second, [8]);
  adapter.publish();
  assert.deepEqual(first, [0, 8]);
  assert.deepEqual(second, [8], 'the fresh subscriber must not receive the same snapshot twice');
});

test('presenter coalesces invalidations and never reads or renders a hidden page', () => {
  let reads = 0; let score = 0; const rendered = [];
  const presenter = new StackUIPresenter(() => { reads++; return { score }; }, snapshot => rendered.push(snapshot.score));
  presenter.invalidate(); presenter.invalidate();
  assert.equal(presenter.flush(), false); assert.equal(reads, 0);
  presenter.setVisible(true);
  assert.equal(presenter.flush(), true); assert.deepEqual(rendered, [0]);
  assert.equal(presenter.flush(), false);
  score = 3; presenter.invalidate(); score = 4; presenter.invalidate();
  assert.equal(presenter.flush(), true); assert.deepEqual(rendered, [0, 4]);
  presenter.setVisible(false); score = 8; presenter.invalidate();
  assert.equal(presenter.flush(), false); assert.equal(reads, 2);
  presenter.setVisible(true); presenter.flush();
  assert.deepEqual(rendered, [0, 4, 8]);
  presenter.dispose(); presenter.invalidate(); presenter.setVisible(true);
  assert.equal(presenter.flush(), false); assert.equal(presenter.pending, false);
});

test('presenter keeps reentrant invalidation and retries a failed render without recursive work', () => {
  let calls = 0;
  const presenter = new StackUIPresenter(() => 1, () => {
    calls++;
    if (calls === 1) presenter.invalidate();
    if (calls === 3) throw Error('temporary render failure');
  });
  presenter.setVisible(true); presenter.flush();
  assert.equal(calls, 1); assert.equal(presenter.pending, true);
  presenter.flush(); assert.equal(calls, 2); assert.equal(presenter.pending, false);
  presenter.invalidate(); assert.throws(() => presenter.flush(), /temporary render failure/);
  assert.equal(presenter.pending, true);
  presenter.flush(); assert.equal(calls, 4); assert.equal(presenter.pending, false);
});

test('layout applies only viewport, frame, safe-area or pixel-ratio changes and ignores minimized invalid frames', () => {
  const layouts = [];
  const service = new UILayoutService(metrics => layouts.push(metrics));
  assert.equal(service.update({ width: 750, height: 1334 }), true);
  assert.equal(service.update({ width: 750, height: 1334, safeTop: 0, pixelRatio: 1 }), false);
  assert.equal(service.update({ width: 750, height: 1334, safeTop: 40 }), true);
  assert.equal(service.update({ width: 750, height: 1334, safeTop: 40, frameWidth: 390, frameHeight: 844 }), true);
  assert.equal(service.update({ width: 750, height: 1334, safeTop: 40, frameWidth: 390, frameHeight: 844, pixelRatio: 2 }), true);
  assert.equal(layouts.length, 4);
  assert.equal(Object.isFrozen(service.current), true);
  const prior = service.current;
  for (const viewport of [{ width: 0, height: 0 }, { width: NaN, height: 1334 },
    { width: 750, height: 1334, safeLeft: -1 }, { width: 750, height: 1334, pixelRatio: Infinity }]) {
    assert.equal(service.update(viewport), false);
  }
  assert.equal(service.current, prior);
  service.dispose(); assert.equal(service.update({ width: 1920, height: 1080 }), false);
});

test('layout retries identical metrics after an application failure instead of caching a partial layout', () => {
  let attempts = 0;
  const service = new UILayoutService(() => { if (++attempts === 1) throw Error('view not ready'); });
  assert.throws(() => service.update({ width: 750, height: 1334 }), /view not ready/);
  assert.equal(service.current, null);
  assert.equal(service.update({ width: 750, height: 1334 }), true);
  assert.equal(attempts, 2);
});

test('transition releases the router input lock exactly once after normal completion and rejects duplicate starts', () => {
  const router = new UIRouter(); const progress = []; let completions = 0;
  const transition = new UITransitionController(locked => { router.transitionLocked = locked; });
  assert.equal(transition.begin({ duration: 0.26, onProgress: value => progress.push(value), onComplete() { completions++; } }), true);
  assert.equal(router.transitionLocked, true);
  assert.equal(router.push('settings'), false);
  assert.equal(transition.begin({ duration: 1, onProgress() {} }), false);
  transition.step(0.13); assert.equal(progress.at(-1), 0.5);
  transition.step(10); transition.step(10); transition.finish();
  assert.equal(progress.at(-1), 1); assert.equal(completions, 1);
  assert.equal(transition.running, false); assert.equal(router.transitionLocked, false);
  assert.equal(router.push('settings'), true);
});

test('reduced motion and resize settlement complete immediately while cancel and dispose release locks', () => {
  let locked = false; let completed = 0; let cancelled = 0;
  const transition = new UITransitionController(value => { locked = value; });
  transition.begin({ duration: 1, reducedMotion: true, onProgress() {}, onComplete() { completed++; } });
  assert.equal(completed, 1); assert.equal(locked, false);
  transition.begin({ duration: 1, onProgress() {}, onComplete() { completed++; } });
  transition.finish(); transition.finish();
  assert.equal(completed, 2); assert.equal(locked, false);
  transition.begin({ duration: 1, onProgress() {}, onCancel() { cancelled++; } });
  transition.cancel(); transition.cancel();
  assert.equal(cancelled, 1); assert.equal(locked, false);
  transition.begin({ duration: 1, onProgress() {}, onCancel() { cancelled++; } });
  transition.dispose(); transition.step(10);
  assert.equal(cancelled, 2); assert.equal(completed, 2); assert.equal(locked, false);
  assert.equal(transition.begin({ duration: 1, onProgress() {} }), false);
});

test('transition callback failures release locks and a completion callback may start the next transition safely', () => {
  let locked = false;
  const transition = new UITransitionController(value => { locked = value; });
  assert.throws(() => transition.begin({ duration: 1, onProgress() { throw Error('initial'); } }), /initial/);
  assert.equal(locked, false); assert.equal(transition.running, false);
  transition.begin({ duration: 1, onProgress(p) { if (p > 0) throw Error('frame'); } });
  assert.throws(() => transition.step(0.1), /frame/);
  assert.equal(locked, false);
  transition.begin({ duration: 1, onProgress() {}, onCancel() { throw Error('cancel'); } });
  assert.throws(() => transition.cancel(), /cancel/); assert.equal(locked, false);
  transition.begin({ duration: 0, onProgress() {}, onComplete() {
    transition.begin({ duration: 1, onProgress() {} });
  } });
  assert.equal(locked, true); assert.equal(transition.running, true);
  transition.finish(); assert.equal(locked, false);
});

test('all public UI infrastructure modules include Creator TypeScript metadata', () => {
  const modules = ['UIRouter', 'UIInputRouter', 'StackGameUIAdapter', 'StackUIPresenter', 'UILayoutService', 'UITransitionController'];
  const ids = new Set();
  for (const name of modules) {
    const meta = JSON.parse(fs.readFileSync(path.join(scripts, `${name}.ts.meta`), 'utf8'));
    assert.equal(meta.importer, 'typescript'); assert.match(meta.uuid, /^[a-f0-9-]{36}$/);
    ids.add(meta.uuid);
  }
  assert.equal(ids.size, modules.length);
});
