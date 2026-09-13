const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const sandbox = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/Leaderboard.ts'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, sandbox);
const {
  LocalLeaderboardRepository, LEADERBOARD_STORAGE_KEY, LEADERBOARD_PREVIEW_BACKUP_KEY, leaderboardTitle, leaderboardTier,
  NICKNAME_STORAGE_KEY, DEFAULT_NICKNAME, NICKNAME_MAX_LENGTH,
  normalizeNickname, loadNickname, saveNickname,
} = sandbox.exports;
const plain = value => JSON.parse(JSON.stringify(value));
function storage(initial = null) {
  const values = new Map(initial === null ? [] : [[LEADERBOARD_STORAGE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function round(id, score, perfectCount = 0, finishedAt = 100) {
  return { id, score, perfectCount, finishedAt, testMode: false };
}

test('each rank tier selects a distinct avatar and king stars retain the king avatar', () => {
  for (const [score, tier] of [[0, 0], [49, 0], [50, 1], [99, 1], [100, 2], [199, 2],
    [200, 3], [349, 3], [350, 4], [499, 4], [500, 5], [599, 5], [600, 5], [1700, 5]]) {
    assert.equal(leaderboardTier(score), tier);
  }
  for (const score of [-1, NaN, Infinity, '500']) assert.equal(leaderboardTier(score), 0);
  assert.equal(leaderboardTitle(600), '王者 +1 星');
});

function previewRecord(index = 0) {
  const scores = [1720, 1000, 700, 600, 500, 350, 200, 100, 50, 0];
  const names = ['云端建筑师小山', '今天也要叠个正着', '对齐大师', '叠叠玩家', '星空旅人'];
  return { id: `design-${index}`, kind: 'round', score: scores[index], perfectCount: Math.min(17, scores[index]),
    finishedAt: 1700000000000, nickname: names[index % names.length] };
}

test('preview cleanup backs up the original store and keeps real local rounds across reloads', async () => {
  const real = { ...round('round-real', 14, 7, 1789295575294), kind: 'round', nickname: '叠叠玩家' };
  const original = JSON.stringify({ version: 1, entries: [...Array.from({ length: 10 }, (_, i) => previewRecord(i)), real] });
  const store = storage(original);
  const repo = new LocalLeaderboardRepository(store, 14);
  assert.deepEqual(plain((await repo.list()).entries).map(e => e.id), ['round-real']);
  assert.equal(store.getItem(LEADERBOARD_PREVIEW_BACKUP_KEY), original);
  assert.deepEqual(JSON.parse(store.getItem(LEADERBOARD_STORAGE_KEY)).entries.map(e => e.id), ['round-real']);
  await repo.submit(round('round-next', 20, 8));
  const reloaded = await new LocalLeaderboardRepository(store, 20).list();
  assert.deepEqual(plain(reloaded.entries).map(e => e.score), [20, 14]);
  assert.equal(store.getItem(LEADERBOARD_PREVIEW_BACKUP_KEY), original, 'backup remains recoverable');
});

test('cleanup matches full fixture fingerprints, never genuine high scores or matching nicknames', async () => {
  const entries = [
    { ...previewRecord(), id: 'round-real-high' },
    { ...previewRecord(1), finishedAt: 1789295575294 },
    { ...previewRecord(2), score: 701 },
    { ...previewRecord(3), nickname: '真实玩家' },
    { ...previewRecord(4), perfectCount: 18 },
  ];
  const store = storage(JSON.stringify({ version: 1, entries }));
  assert.equal((await new LocalLeaderboardRepository(store).list()).entries.length, entries.length);
  assert.equal(store.getItem(LEADERBOARD_PREVIEW_BACKUP_KEY), null);
});

test('a preview-only store restores a real legacy best, but no record is fabricated for a new player', async () => {
  const original = JSON.stringify({ version: 1, entries: [previewRecord()] });
  const restored = (await new LocalLeaderboardRepository(storage(original), 14).list()).entries;
  assert.deepEqual(plain(restored), [{ id: 'legacy-best', kind: 'legacy', score: 14, perfectCount: null, finishedAt: null }]);
  assert.equal((await new LocalLeaderboardRepository(storage(original), 0).list()).entries.length, 0);
});

test('failed preview backup does not overwrite the original store and retries before later writes', async () => {
  const original = JSON.stringify({ version: 1, entries: [previewRecord()] });
  const store = storage(original);
  const write = store.setItem;
  let blocked = true;
  store.setItem = (key, value) => {
    if (key === LEADERBOARD_PREVIEW_BACKUP_KEY && blocked) throw Error('quota');
    write(key, value);
  };
  const repo = new LocalLeaderboardRepository(store);
  assert.equal((await repo.list()).persistent, false);
  assert.equal((await repo.list()).entries.length, 0);
  await repo.submit(round('round-new', 3));
  assert.equal(store.getItem(LEADERBOARD_STORAGE_KEY), original);
  blocked = false;
  await repo.submit(round('round-next', 4));
  assert.equal(store.getItem(LEADERBOARD_PREVIEW_BACKUP_KEY), original);
  assert.deepEqual(JSON.parse(store.getItem(LEADERBOARD_STORAGE_KEY)).entries.map(e => e.score), [4, 3]);
});

test('round titles change at each layer threshold, independently of personal bests', () => {
  for (const [score, title] of [
    [0, '青铜'], [49, '青铜'], [50, '白银'], [99, '白银'],
    [100, '黄金'], [199, '黄金'], [200, '铂金'], [349, '铂金'],
    [350, '钻石'], [499, '钻石'], [500, '最强王者'], [599, '最强王者'],
    [600, '王者 +1 星'], [699, '王者 +1 星'], [700, '王者 +2 星'],
    [799, '王者 +2 星'], [1000, '王者 +5 星'], [10000, '王者 +95 星'],
  ]) assert.equal(leaderboardTitle(score), title, `${score} layers`);
});

test('nickname normalization preserves visible Unicode, removes invisible formatting, and never truncates', () => {
  assert.equal(normalizeNickname('  e\u0301\t\n玩家  '), 'é 玩家');
  assert.equal(normalizeNickname(' \t叠\n叠\u00A0  玩家\r '), '叠 叠 玩家');
  assert.equal(normalizeNickname('\u0000\u0008玩\u007F\u009F家\u001F'), '玩家');
  assert.equal(normalizeNickname('\u061C\u202E玩\u200B\u200C\u200D\u200E\u200F家\u202C\u2060\u2066\u2069\uFEFF'), '玩家');
  assert.equal(normalizeNickname('e\u034F\u200B\u0301'), 'é', 'NFC is restored after invisible separators are removed');
  assert.equal(normalizeNickname('叠😀é'), '叠😀é');
  const long = '叠'.repeat(NICKNAME_MAX_LENGTH + 1);
  assert.equal(normalizeNickname(long), long, 'length validation belongs to the save/UI boundary');
  for (const invalid of [null, undefined, 123, {}, ['玩家']]) assert.equal(normalizeNickname(invalid), '');
});

test('nickname storage uses its own key, normalizes names and counts Unicode code points', () => {
  const store = storage();
  assert.equal(NICKNAME_STORAGE_KEY, 'wxstack-nickname');
  assert.equal(DEFAULT_NICKNAME, '叠叠玩家');
  assert.equal(NICKNAME_MAX_LENGTH, 12);
  assert.equal(loadNickname(store), DEFAULT_NICKNAME);
  assert.equal(saveNickname(store, '  玩家\t e\u0301  '), true);
  assert.equal(store.getItem(NICKNAME_STORAGE_KEY), '玩家 é');
  assert.equal(store.getItem(LEADERBOARD_STORAGE_KEY), null, 'renaming does not touch leaderboard records');
  assert.equal(loadNickname(store), '玩家 é');
  const twelveEmoji = '😀'.repeat(12);
  assert.equal(saveNickname(store, twelveEmoji), true);
  assert.equal(loadNickname(store), twelveEmoji);
  for (const invalid of ['', ' \t\n', '\u200B\u2066\u0000', '叠'.repeat(13), `${twelveEmoji}😀`]) {
    assert.equal(saveNickname(store, invalid), false);
    assert.equal(loadNickname(store), twelveEmoji, 'invalid edits cannot replace a saved nickname');
  }
});

test('missing, corrupt or blocked nickname storage falls back without pretending to save', () => {
  assert.equal(loadNickname(null), DEFAULT_NICKNAME);
  assert.equal(saveNickname(null, '玩家'), false);
  for (const value of ['', '   ', '\u200B\u202E', '叠'.repeat(13), 42, {}]) {
    let writes = 0;
    const store = { getItem: () => value, setItem() { writes += 1; } };
    assert.equal(loadNickname(store), DEFAULT_NICKNAME);
    assert.equal(writes, 0, 'loading an invalid nickname does not modify existing storage');
  }
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(loadNickname(blocked), DEFAULT_NICKNAME);
  assert.equal(saveNickname(blocked, '玩家'), false);
});

test('local ranking keeps Top 10, breaks ties by perfects then time, and survives reload', async () => {
  const store = storage();
  const repo = new LocalLeaderboardRepository(store);
  for (let i = 0; i < 12; i++) await repo.submit(round(`round-${i}`, i));
  await repo.submit(round('tie-later', 11, 2, 300));
  await repo.submit(round('tie-earlier', 11, 2, 200));
  const snapshot = plain(await new LocalLeaderboardRepository(store).list());
  assert.equal(snapshot.entries.length, 10);
  assert.deepEqual(snapshot.entries.slice(0, 3).map(e => e.id), ['tie-earlier', 'tie-later', 'round-11']);
  assert.equal(snapshot.persistent, true);
});

test('duplicate submissions and test rounds do not create additional entries', async () => {
  const repo = new LocalLeaderboardRepository(storage());
  await repo.submit(round('same', 10, 3));
  await repo.submit(round('same', 99, 3));
  await repo.submit({ ...round('test', 100), testMode: true });
  assert.deepEqual(plain((await repo.list()).entries).map(e => e.score), [10]);
  await repo.submit(round('zero', 0));
  assert.equal((await repo.list()).entries.length, 2);
});

test('old best is imported once and clearly lacks invented time or perfect count', async () => {
  const store = storage();
  const first = plain(await new LocalLeaderboardRepository(store, 27).list());
  assert.deepEqual(first.entries[0], { id:'legacy-best', kind:'legacy', score:27, perfectCount:null, finishedAt:null });
  const second = await new LocalLeaderboardRepository(store, 100).list();
  assert.equal(second.entries.length, 1);
  assert.equal(second.entries[0].score, 27);
});

test('damaged storage and invalid entries do not crash, accepted records are isolated', async () => {
  const broken = new LocalLeaderboardRepository(storage('{oops'), 12);
  assert.equal((await broken.list()).entries[0].score, 12);
  const store = storage(JSON.stringify({ version:1, entries:[null, { id:'bad', score:-2 }, { ...round('ok', 8), kind:'round' }] }));
  const repo = new LocalLeaderboardRepository(store);
  const snapshot = await repo.list();
  assert.equal(snapshot.entries.length, 1);
  snapshot.entries[0].score = 999;
  assert.equal((await repo.list()).entries[0].score, 8);
  await assert.rejects(repo.submit(round('bad-count', 2, 3)));
  await assert.rejects(repo.submit(round('negative', -1)));
});

test('blocked storage falls back to usable in-memory ranking with explicit status', async () => {
  const repo = new LocalLeaderboardRepository({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  await repo.submit(round('session', 9));
  const snapshot = await repo.list();
  assert.equal(snapshot.persistent, false);
  assert.equal(snapshot.entries[0].score, 9);
  assert.equal((await new LocalLeaderboardRepository(null).list()).persistent, false);
});

test('v1 scores survive malformed nicknames and older unnamed entries remain unattributed', async () => {
  const entries = [
    { ...round('old', 25), kind: 'round' },
    { ...round('normalized', 24), kind: 'round', nickname: ' e\u0301\t 玩家\u200B ' },
    ...[{}, 12, '', ' \u200B ', '叠'.repeat(13)].map((nickname, index) => ({
      ...round(`invalid-name-${index}`, 20 - index), kind: 'round', nickname,
    })),
  ];
  const store = storage(JSON.stringify({ version: 1, entries }));
  const repo = new LocalLeaderboardRepository(store);
  const saved = plain(await repo.list()).entries;
  assert.equal(saved.length, entries.length, 'bad nickname metadata never deletes a valid score');
  assert.equal(saved.find(entry => entry.id === 'normalized').nickname, 'é 玩家');
  for (const entry of saved.filter(entry => entry.id !== 'normalized')) {
    assert.equal(Object.hasOwn(entry, 'nickname'), false, 'missing or invalid attribution stays absent');
  }
  const persisted = JSON.parse(store.getItem(LEADERBOARD_STORAGE_KEY));
  assert.equal(persisted.version, 1);
  assert.deepEqual(persisted.entries, saved);
  assert.deepEqual(plain((await new LocalLeaderboardRepository(store).list()).entries), saved);
});

test('renaming affects later rounds only and stored snapshots cannot be edited through returned data', async () => {
  const store = storage();
  const repo = new LocalLeaderboardRepository(store);
  saveNickname(store, '第一位玩家');
  const first = { ...round('first', 20), nickname: loadNickname(store) };
  await repo.submit(first);
  first.nickname = '改动请求对象';
  saveNickname(store, '第二位玩家');
  await repo.submit({ ...round('second', 20), nickname: loadNickname(store) });
  await repo.submit({ ...round('first', 999), nickname: loadNickname(store) });
  await repo.submit(round('compatible-no-name', 1));
  const snapshot = plain(await repo.list());
  assert.equal(snapshot.entries.find(entry => entry.id === 'first').nickname, '第一位玩家');
  assert.equal(snapshot.entries.find(entry => entry.id === 'first').score, 20, 'duplicate submissions do not rewrite the old round');
  assert.equal(snapshot.entries.find(entry => entry.id === 'second').nickname, '第二位玩家');
  assert.equal(Object.hasOwn(snapshot.entries.find(entry => entry.id === 'compatible-no-name'), 'nickname'), false);
  const mutable = await repo.list();
  mutable.entries[0].nickname = '改动返回对象';
  assert.deepEqual(plain(await repo.list()), snapshot);
  assert.deepEqual(plain(await new LocalLeaderboardRepository(store).list()), snapshot);
});

test('submitted names are normalized without changing ranking ties or test-round exclusion', async () => {
  const repo = new LocalLeaderboardRepository(storage());
  await repo.submit({ ...round('a', 20), nickname: '  Z\u200B  ' });
  await repo.submit({ ...round('b', 20), nickname: 'A' });
  await repo.submit({ ...round('invalid-name', 3), nickname: '叠'.repeat(13) });
  await repo.submit({ ...round('test', 1000), nickname: '测试玩家', testMode: true });
  const entries = plain((await repo.list()).entries);
  assert.deepEqual(entries.map(entry => entry.id), ['a', 'b', 'invalid-name'], 'names do not break ties or allow test scores to enter');
  assert.equal(entries[0].nickname, 'Z');
  assert.equal(entries[1].nickname, 'A');
  assert.equal(Object.hasOwn(entries[2], 'nickname'), false);
});

const gameSource = fs.readFileSync(path.join(__dirname, '../assets/scripts/StackGame.ts'), 'utf8');
const getMethod = name => {
  const start = gameSource.indexOf(`  private ${name}(`);
  assert.notEqual(start, -1);
  const end = gameSource.indexOf('\n  private ', start + 1);
  const method = gameSource.slice(start, end).replace(`private ${name}`, `function ${name}`);
  const runtime = {};
  vm.runInNewContext(ts.transpileModule(method, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, runtime);
  return runtime[name];
};

test('ranking directions scroll the list directly and confirm returns home without action buttons', () => {
  const directions = [];
  const state = { homeOverlay:'leaderboard', scrollLeaderboard(direction) { directions.push(direction); },
    closeHomeOverlay() { this.homeOverlay='none'; } };
  for (const name of ['moveLeaderboardSelection','activateLeaderboardSelection','changeLeaderboardPage']) state[name]=getMethod(name);
  state.moveLeaderboardSelection(1);
  state.moveLeaderboardSelection(-1);
  state.changeLeaderboardPage(1);
  assert.deepEqual(directions, [1, -1, 1]);
  state.activateLeaderboardSelection();
  assert.equal(state.homeOverlay, 'none');
});

test('round settlement sends one result with the opening nickname snapshot and test-session marker', async () => {
  const sent = [];
  const state = { roundId:'a', submittedRoundId:'', score:12, roundPerfectCount:3, roundWasTest:true,
    roundNickname:'本局玩家', playerNickname:'后来修改的昵称',
    testModeEnabled:false, leaderboard:{ submit: async result => { sent.push(result); } } };
  const record = getMethod('recordLeaderboardResult');
  record.call(state); record.call(state);
  await state.leaderboardSubmission;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].testMode, true);
  assert.equal(sent[0].nickname, '本局玩家', 'settlement must not replace attribution with the current profile name');
  state.roundId='b'; state.roundWasTest=false; state.roundNickname=state.playerNickname;
  record.call(state);
  await state.leaderboardSubmission;
  assert.equal(sent.length, 2);
  assert.equal(sent[1].testMode, false);
  assert.equal(sent[1].nickname, '后来修改的昵称', 'the following round uses its own opening snapshot');
  assert.equal(sent[0].nickname, '本局玩家', 'later rounds cannot mutate a submitted nickname');
});
