const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const vm = require('node:vm');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('assets/scripts/RemoteInput.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { browserGameKey, androidGameKey } = context.exports;
test('WebView named keys work with absent or conflicting legacy codes', () => {
  for (const [key, expected] of [['ArrowUp', 38], ['ArrowDown', 40], ['ArrowLeft', 37], ['ArrowRight', 39], ['Select', 13], ['BrowserBack', 27]]) {
    assert.equal(browserGameKey({ key, keyCode: 0 }), expected);
  }
  assert.equal(browserGameKey({ key: 'Enter', keyCode: 66 }), 13);
  assert.equal(browserGameKey({ code: 'NumpadEnter' }), 13);
  assert.equal(browserGameKey({ keyCode: 10009 }), 27);
});
test('Android native codes are mapped separately from DOM codes', () => {
  for (const [native, dom] of [[19, 38], [20, 40], [21, 37], [22, 39], [23, 13], [66, 13], [4, 27], [96, 13], [97, 27]]) {
    assert.equal(androidGameKey(native), dom);
  }
  assert.equal(browserGameKey({ keyCode: 19 }), 0);
  assert.equal(androidGameKey(24), 0); // Volume stays with Android.
  assert.equal(browserGameKey({ key: 'Unidentified' }), 0);
});

test('remote aliases and native menu key preserve their namespaces', () => {
  for (const [key, expected] of [['DPAD_UP', 38], ['DPadDown', 40], ['OK', 13], ['Back', 27], ['Menu', 80]]) {
    assert.equal(browserGameKey({ key }), expected);
  }
  assert.equal(androidGameKey(82), 80);
  assert.equal(browserGameKey({ keyCode: 82 }), 82);
});

test('Android WebView raw DPAD directions match DOM arrows without remapping desktop keys', () => {
  for (const [raw, expected] of [[19,38],[20,40],[21,37],[22,39]]) {
    assert.equal(browserGameKey({ key:'Unidentified', keyCode:raw }, true), expected);
    assert.equal(browserGameKey({ which:raw }, true), expected);
    assert.equal(browserGameKey({ keyCode:raw }), 0);
  }
  assert.equal(browserGameKey({ key:'Pause', keyCode:19 }, true), 0);
  assert.equal(browserGameKey({ key:'CapsLock', keyCode:20 }, true), 0);
  assert.equal(browserGameKey({ key:'ArrowDown', keyCode:20 }, true), 40);
});

test('remote keys route through home, shop, settings, ranking, play, pause and results', () => {
  const source = fs.readFileSync('assets/scripts/StackGame.ts', 'utf8');
  const method = source.slice(source.indexOf('  private handleKeyDownCode('), source.indexOf('  private onKeyUp('));
  const runtime = {
    KeyCode: { ESCAPE:27, KEY_P:80, ARROW_UP:38, ARROW_DOWN:40, ARROW_LEFT:37, ARROW_RIGHT:39,
      KEY_A:65, KEY_D:68, KEY_W:87, KEY_S:83, SPACE:32, ENTER:13, KEY_R:82, KEY_T:84, KEY_K:75 },
    REMOTE_BACK_KEY_CODES: new Set([4,461,10009]), REMOTE_CONFIRM_KEY_CODES: new Set([23]),
  };
  vm.runInNewContext(ts.transpileModule(method.replace('private handleKeyDownCode', 'function handleKeyDownCode'), {}).outputText, runtime);
  const calls = [];
  const state = { heldKeys: new Set(), homeOverlay:'none', phase:'ready', resultSelection:0 };
  for (const name of ['moveHomeSelection','activateHomeSelection','moveSkinSelection','activateSkinSelection',
    'closeHomeOverlay','moveSettingsSelection','activateSettingsSelection','tryPrimaryAction','togglePause',
    'selectPauseOption','activatePauseSelection','updateResultFocus','activateResultSelection','returnToHome',
    'moveLeaderboardSelection','changeLeaderboardPage','activateLeaderboardSelection']) {
    state[name] = (...args) => calls.push([name, ...args]);
  }
  const press = key => { state.heldKeys.clear(); runtime.handleKeyDownCode.call(state, androidGameKey(key)); };
  press(20); press(23);
  state.homeOverlay='skins'; press(20); press(23); press(4);
  state.homeOverlay='settings'; press(19); press(23);
  state.homeOverlay='leaderboard'; press(19); press(20); press(21); press(22); press(23); press(4);
  state.homeOverlay='none'; state.phase='playing'; press(23); press(4); press(82);
  state.phase='paused'; press(20); press(23);
  state.phase='gameover'; press(20); press(23); press(4);
  assert.deepEqual(calls.map(c=>c[0]), ['moveHomeSelection','activateHomeSelection','moveSkinSelection',
    'activateSkinSelection','closeHomeOverlay','moveSettingsSelection','activateSettingsSelection',
    'moveLeaderboardSelection','moveLeaderboardSelection','changeLeaderboardPage','changeLeaderboardPage',
    'activateLeaderboardSelection','closeHomeOverlay',
    'tryPrimaryAction','togglePause','togglePause','selectPauseOption','activatePauseSelection',
    'updateResultFocus','activateResultSelection','returnToHome']);
  assert.deepEqual(calls.filter(c => c[0] === 'moveLeaderboardSelection').map(c => c[1]), [-1, 1]);
  assert.deepEqual(calls.filter(c => c[0] === 'changeLeaderboardPage').map(c => c[1]), [-1, 1]);
  const count = calls.length;
  runtime.handleKeyDownCode.call(state, 27);
  assert.equal(calls.length, count, 'held key does not trigger twice');
});
