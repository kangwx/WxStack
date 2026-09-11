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
const { LocalLeaderboardRepository, LEADERBOARD_STORAGE_KEY } = sandbox.exports;
const plain = value => JSON.parse(JSON.stringify(value));
function storage(initial = null) {
  const values = new Map(initial === null ? [] : [[LEADERBOARD_STORAGE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function round(id, score, perfectCount = 0, finishedAt = 100) {
  return { id, score, perfectCount, finishedAt, testMode: false };
}

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

test('ranking focus skips unavailable pages, page bounds hold, and confirm returns home', () => {
  const state = { homeOverlay:'leaderboard', leaderboardLoading:false, leaderboardPage:0, leaderboardSelection:2,
    leaderboardEntries:[], updateLeaderboardUI() {}, closeHomeOverlay() { this.homeOverlay='none'; } };
  for (const name of ['leaderboardActionEnabled','moveLeaderboardSelection','activateLeaderboardSelection','changeLeaderboardPage']) state[name]=getMethod(name);
  state.moveLeaderboardSelection(1);
  assert.equal(state.leaderboardSelection, 2);
  state.leaderboardEntries = Array.from({ length:10 }, (_, i) => ({ score:i }));
  state.moveLeaderboardSelection(1);
  assert.equal(state.leaderboardSelection, 1);
  state.activateLeaderboardSelection();
  assert.equal(state.leaderboardPage, 1);
  assert.equal(state.leaderboardSelection, 2);
  state.changeLeaderboardPage(1);
  assert.equal(state.leaderboardPage, 1);
  state.moveLeaderboardSelection(1);
  assert.equal(state.leaderboardSelection, 0);
  state.activateLeaderboardSelection();
  assert.equal(state.leaderboardPage, 0);
  state.activateLeaderboardSelection();
  assert.equal(state.homeOverlay, 'none');
});

test('round settlement sends one result and marks a test session in the provider request', async () => {
  const sent = [];
  const state = { roundId:'a', submittedRoundId:'', score:12, roundPerfectCount:3, roundWasTest:true,
    testModeEnabled:false, leaderboard:{ submit: async result => { sent.push(result); } } };
  const record = getMethod('recordLeaderboardResult');
  record.call(state); record.call(state);
  await state.leaderboardSubmission;
  assert.equal(sent.length, 1);
  assert.equal(sent[0].testMode, true);
  state.roundId='b'; state.roundWasTest=false;
  record.call(state);
  await state.leaderboardSubmission;
  assert.equal(sent.length, 2);
  assert.equal(sent[1].testMode, false);
});
