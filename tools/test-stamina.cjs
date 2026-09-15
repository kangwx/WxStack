const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/Stamina.ts'), 'utf8');
const runtime = { exports: {}, Date };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020 } }).outputText, runtime);
const { Stamina, STAMINA_INTERVAL_MS: interval, STAMINA_STORAGE_KEY: key } = runtime.exports;
const morning = new Date(2026, 8, 14, 9).getTime();
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('five initial points, no negative balance, and an exact thirty-minute refill boundary', () => {
  const stamina = new Stamina(storage(), morning);
  assert.equal(stamina.snapshot(morning).amount, 5);
  for (let i = 0; i < 5; i++) assert.equal(stamina.spend(morning), true);
  assert.equal(stamina.spend(morning), false);
  assert.equal(stamina.snapshot(morning + interval - 1).amount, 0);
  assert.equal(stamina.snapshot(morning + interval).amount, 1);
  assert.equal(stamina.spend(morning + interval), true);
  assert.equal(stamina.snapshot(morning + interval).nextAt, morning + interval * 2);
});

test('spending while partially full preserves progress, including after reloading offline', () => {
  const store = storage();
  const stamina = new Stamina(store, morning);
  stamina.spend(morning);
  stamina.spend(morning + interval / 2);
  const reloaded = new Stamina(store, morning + interval);
  assert.equal(reloaded.snapshot(morning + interval).amount, 4);
  assert.equal(reloaded.snapshot(morning + interval).nextAt, morning + interval * 2);
  const later = new Stamina(store, morning + interval * 10);
  assert.equal(later.snapshot(morning + interval * 10).amount, 5);
  assert.equal(later.snapshot(morning + interval * 10).nextAt, null);
  later.spend(morning + interval * 10);
  assert.equal(later.snapshot(morning + interval * 10).nextAt, morning + interval * 11);
});

test('midnight keeps the fixed interval and legacy saves preserve their balance', () => {
  const night = new Date(2026, 8, 14, 23, 50).getTime();
  const midnight = new Date(2026, 8, 15).getTime();
  const store = storage();
  store.values.set(key, JSON.stringify({ amount: 0, day: '2026-09-14', nextAt: night + interval }));
  const stamina = new Stamina(store, midnight);
  assert.equal(stamina.snapshot(midnight).amount, 0);
  assert.equal(stamina.snapshot(midnight).nextAt, night + interval);
  assert.equal(stamina.snapshot(night + interval).amount, 1);
  stamina.grantAdReward(night + interval);
  assert.equal(stamina.snapshot(night + interval).amount, 6);
  stamina.spend(night + interval);
  assert.equal(stamina.snapshot(night + interval).amount, 5);
  assert.equal(stamina.snapshot(night + interval).nextAt, null);
  stamina.spend(night + interval);
  assert.equal(stamina.snapshot(night + interval).nextAt, night + interval * 2);
  assert.equal(new Stamina(store, night + interval).snapshot(night + interval).amount, 4);
});

test('corrupt or unavailable storage does not stop playing or touch other saves', () => {
  for (const raw of ['broken', 'null', '{}', '{"amount":-1}', '{"amount":99,"nextAt":1}']) {
    const store = storage();
    store.values.set(key, raw);
    store.values.set('wxstack-coins', '123');
    const stamina = new Stamina(store, morning);
    assert.equal(stamina.snapshot(morning).amount, 5);
    assert.equal(store.values.get('wxstack-coins'), '123');
  }
  for (const store of [null, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }]) {
    const stamina = new Stamina(store, morning);
    for (let i = 0; i < 5; i++) assert.equal(stamina.spend(morning), true);
    assert.equal(stamina.spend(morning), false);
    assert.equal(stamina.snapshot(morning + interval).amount, 1);
  }
});

test('only accepted new rounds spend stamina; repeated input and rejected starts do not', () => {
  const gameSource = fs.readFileSync(path.join(__dirname, '../assets/scripts/StackGame.ts'), 'utf8');
  const method = gameSource.slice(gameSource.indexOf('  private startGame():'), gameSource.indexOf('  private startGameImmediately():'));
  const context = { Stamina, sys: { localStorage: storage() } };
  vm.runInNewContext(ts.transpileModule(method.replace('private startGame', 'function startGame'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const stamina = new Stamina(storage());
  let starts = 0;
  const game = { stamina, phase: 'ready', audioReady: true, homeOverlay: 'none', testModeEnabled: false,
    updateAudioPrompt() {}, updateStaminaUI() {}, openStaminaReward() {},
    beginScreenTransition() { starts++; this.homeTransition = {}; } };
  const start = () => context.startGame.call(game);
  game.audioReady = false; start();
  game.audioReady = true; game.homeOverlay = 'settings'; start();
  assert.equal(stamina.snapshot().amount, 5);
  game.homeOverlay = 'none'; start(); start();
  assert.equal(starts, 1);
  assert.equal(stamina.snapshot().amount, 4);
  game.homeTransition = null; game.phase = 'playing'; start();
  assert.equal(stamina.snapshot().amount, 4);
  for (let i = 0; i < 4; i++) { game.homeTransition = null; game.phase = 'paused'; start(); }
  game.homeTransition = null; start();
  assert.equal(starts, 5);
  assert.equal(game.phase, 'paused', 'empty restart must preserve the current round');
  assert.equal(game.homeTransition, null);
  game.testModeEnabled = true; start();
  assert.equal(starts, 6);
  assert.equal(stamina.snapshot().amount, 0);
});

test('settings recovery opens an ad without granting stamina before completion', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/StackGame.ts'), 'utf8');
  const method = source.slice(source.indexOf('  private onRestoreStamina():'), source.indexOf('  private onAppearanceToggle'));
  const context = {};
  vm.runInNewContext(ts.transpileModule(method.replace('private onRestoreStamina', 'function onRestoreStamina'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  const stamina = new Stamina(storage()); stamina.spend();
  let opened = 0;
  const game = { stamina, homeOverlay: 'none', openStaminaReward() { opened++; } };
  context.onRestoreStamina.call(game);assert.equal(opened,0);
  game.homeOverlay='settings';context.onRestoreStamina.call(game);
  assert.equal(opened,1);assert.equal(stamina.snapshot().amount,4);
});


test('ads add five points without a cap and bonus balances survive reload and offline time', () => {
  for (const initial of [0, 1, 4, 5, 8, 10, 15, 100, 10000]) {
    const store = storage();
    store.values.set(key, JSON.stringify({amount: initial, nextAt: initial < 5 ? morning + interval : null}));
    const stamina = new Stamina(store, morning);
    stamina.grantAdReward(morning);
    const expected = initial + 5;
    assert.equal(stamina.snapshot(morning).amount, expected);
    const reloaded = new Stamina(store, morning + interval * 100);
    assert.equal(reloaded.snapshot(morning + interval * 100).amount, expected);
    assert.equal(reloaded.snapshot(morning + interval * 100).nextAt, null);
  }
});

test('bonus spending starts the natural timer only when crossing from five to four', () => {
  const stamina = new Stamina(storage(), morning);
  stamina.grantAdReward(morning);
  for (let i = 0; i < 5; i++) {
    stamina.spend(morning);
    assert.equal(stamina.snapshot(morning).nextAt, null);
  }
  stamina.spend(morning + interval);
  assert.equal(stamina.snapshot(morning + interval).amount, 4);
  assert.equal(stamina.snapshot(morning + interval).nextAt, morning + interval * 2);
  assert.equal(stamina.snapshot(morning + interval * 20).amount, 5);
});

test('ad completion reconciles elapsed natural recovery before adding its reward', () => {
  const stamina = new Stamina(storage(), morning);
  stamina.spend(morning); stamina.spend(morning);
  stamina.grantAdReward(morning + interval);
  assert.equal(stamina.snapshot(morning + interval).amount, 9);
  assert.equal(stamina.snapshot(morning + interval).nextAt, null);
});
