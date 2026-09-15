const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/ui/ReviveController.ts'), 'utf8');
const runtime = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText, runtime);
const { ReviveController } = runtime.exports;
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture() {
  let now = 1000000; let sequence = 0;
  const states = []; const confirmed = []; const calls = [];
  const timers = new Map();
  const context = { roundId: 'round-one', isValid: true, canRevive: true };
  const session = () => ({ id: String(++sequence).padStart(32, 's'), owner: 'o'.repeat(32),
    expiresAt: now + 300000, scanURL: 'http://192.168.1.8:7461/revive', size: 21, modules: new Array(441).fill(0) });
  const client = {
    async create() { calls.push(['create']); return session(); },
    async status(s) { calls.push(['status', s.id]); return { state: 'pending' }; },
    async consume(s) { calls.push(['consume', s.id]); return { state: 'consumed' }; },
    async cancel(s) { calls.push(['cancel', s.id]); },
  };
  const controller = new ReviveController({ client, getContext: () => context,
    scheduler: { schedule(callback, seconds) { assert.equal(seconds, 1); timers.set(callback, seconds); },
      unschedule(callback) { timers.delete(callback); } },
    onState(state) { states.push(state); }, onConfirmed(roundId) { confirmed.push(roundId); }, now: () => now });
  return { controller, client, context, states, confirmed, calls, timers, session, advance(ms) { now += ms; } };
}

test('opening is guarded, emits creation/waiting state, and starts exactly one one-second poll timer', async () => {
  const f = fixture();
  f.context.canRevive = false;
  assert.equal(await f.controller.open(), false); assert.equal(f.calls.length, 0);
  f.context.canRevive = true;
  const pending = deferred(); f.client.create = () => { f.calls.push(['create']); return pending.promise; };
  const opening = f.controller.open();
  assert.equal(f.controller.state.status, 'creating'); assert.equal(f.controller.visible, true);
  assert.equal(await f.controller.open(), false);
  const session = f.session(); pending.resolve(session);
  assert.equal(await opening, true);
  assert.equal(f.controller.state.status, 'waiting');
  assert.equal(f.controller.state.session, session);
  assert.equal(f.controller.state.secondsRemaining, 300);
  assert.equal(f.timers.size, 1);
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal(Object.isFrozen(f.controller.state), true);
});

test('phone confirmation requires owner consumption and confirms the current round exactly once after hiding the modal', async () => {
  const f = fixture(); await f.controller.open();
  f.client.status = async s => { f.calls.push(['status', s.id]); return { state: 'confirmed' }; };
  await Promise.all([f.controller.poll(), f.controller.poll()]);
  assert.deepEqual(f.confirmed, ['round-one']);
  assert.equal(f.calls.filter(call => call[0] === 'consume').length, 1);
  assert.equal(f.controller.state.status, 'closed'); assert.equal(f.controller.state.session, null);
  assert.equal(f.timers.size, 0);
  await f.controller.poll(); assert.equal(f.confirmed.length, 1);
  assert.equal(await f.controller.open(), false, 'same round cannot reopen even before the game updates its used flag');
  f.context.roundId = 'round-two'; assert.equal(await f.controller.open(), true);
});

test('a lost successful consume response is reconciled by consumed status without consuming twice', async () => {
  const f = fixture(); await f.controller.open();
  let consumed = false;
  f.client.status = async () => ({ state: consumed ? 'consumed' : 'confirmed' });
  f.client.consume = async s => { f.calls.push(['consume', s.id]); consumed = true; throw Error('response lost'); };
  await f.controller.poll();
  assert.equal(f.controller.state.status, 'retrying'); assert.equal(f.confirmed.length, 0);
  await f.controller.poll();
  assert.deepEqual(f.confirmed, ['round-one']);
  assert.equal(f.calls.filter(call => call[0] === 'consume').length, 1);
});

test('close during creation cancels the late session and never reopens the view or schedules polling', async () => {
  const f = fixture(); const pending = deferred();
  f.client.create = () => pending.promise;
  const opening = f.controller.open(); f.controller.close();
  const count = f.states.length; const session = f.session(); pending.resolve(session);
  assert.equal(await opening, false);
  assert.equal(f.states.length, count); assert.equal(f.controller.visible, false); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.calls, [['cancel', session.id]]);
});

test('old polling completion cannot consume or clear the in-flight guard of a newly opened session', async () => {
  const f = fixture(); await f.controller.open();
  const old = deferred(); const fresh = deferred(); let statusCalls = 0;
  f.client.status = () => (++statusCalls === 1 ? old.promise : fresh.promise);
  const oldPoll = f.controller.poll();
  f.controller.close(); await f.controller.open();
  const freshPoll = f.controller.poll();
  old.resolve({ state: 'confirmed' }); await oldPoll;
  await f.controller.poll();
  assert.equal(statusCalls, 2, 'old finally must leave the new pending request locked');
  assert.equal(f.calls.filter(call => call[0] === 'consume').length, 0);
  fresh.resolve({ state: 'pending' }); await freshPoll;
  assert.equal(f.controller.state.status, 'waiting'); assert.equal(f.confirmed.length, 0);
});

test('round changes and invalid components reject late status/consume responses and release timers on the next poll', async () => {
  const f = fixture(); await f.controller.open();
  const status = deferred(); f.client.status = () => status.promise;
  const polling = f.controller.poll(); f.context.roundId = 'later-round';
  status.resolve({ state: 'confirmed' }); await polling;
  assert.equal(f.calls.filter(call => call[0] === 'consume').length, 0); assert.equal(f.confirmed.length, 0);
  await f.controller.poll(); assert.equal(f.timers.size, 0);
  const g = fixture(); await g.controller.open();
  g.client.status = async () => ({ state: 'confirmed' });
  const consume = deferred(); g.client.consume = () => consume.promise;
  const consuming = g.controller.poll(); await Promise.resolve();
  g.context.isValid = false; consume.resolve({ state: 'consumed' }); await consuming;
  assert.equal(g.confirmed.length, 0);
  await g.controller.poll(); assert.equal(g.timers.size, 0);
});

test('closing while consumption is in flight prevents a late success from reviving the game', async () => {
  const f = fixture(); await f.controller.open();
  f.client.status = async () => ({ state: 'confirmed' });
  const consume = deferred(); f.client.consume = () => consume.promise;
  const polling = f.controller.poll(); await Promise.resolve();
  f.controller.close(); consume.resolve({ state: 'consumed' }); await polling;
  assert.equal(f.confirmed.length, 0); assert.equal(f.controller.state.status, 'closed');
});

test('expiration clears the QR state and timer without issuing another request; close still cancels the server session', async () => {
  const f = fixture(); await f.controller.open();
  const id = f.controller.state.session.id;
  f.advance(300000); await f.controller.poll();
  assert.equal(f.controller.state.status, 'expired'); assert.equal(f.controller.state.session, null);
  assert.equal(f.controller.state.secondsRemaining, 0); assert.equal(f.timers.size, 0);
  assert.equal(f.calls.filter(call => call[0] === 'status').length, 0);
  f.controller.close(); assert.ok(f.calls.some(call => call[0] === 'cancel' && call[1] === id));
});

test('network failures retain a usable close action and retry the same session without recreating its QR', async () => {
  const f = fixture(); f.client.create = async () => { throw Error('service offline'); };
  assert.equal(await f.controller.open(), true);
  assert.equal(f.controller.state.status, 'error'); assert.equal(f.timers.size, 0);
  assert.match(f.controller.state.message, /service offline/); f.controller.close();
  f.client.create = async () => f.session(); await f.controller.open();
  const session = f.controller.state.session;
  f.client.status = async () => { throw Error('temporary network error'); };
  await f.controller.poll();
  assert.equal(f.controller.state.status, 'retrying'); assert.equal(f.controller.state.session, session);
  assert.equal(f.timers.size, 1);
  f.client.status = async () => ({ state: 'pending' }); f.advance(1250); await f.controller.poll();
  assert.equal(f.controller.state.status, 'waiting'); assert.equal(f.controller.state.secondsRemaining, 299);
  assert.equal(f.controller.state.session, session);
});

test('dispose cancels requests and timers without writing to a destroyed view', async () => {
  const f = fixture(); const pending = deferred(); f.client.create = () => pending.promise;
  const opening = f.controller.open(); const count = f.states.length;
  f.controller.dispose(); f.controller.dispose(); pending.resolve(f.session()); await opening;
  assert.equal(f.states.length, count); assert.equal(f.controller.state.status, 'closed');
  assert.equal(f.confirmed.length, 0); assert.equal(f.timers.size, 0);
  assert.equal(await f.controller.open(), false);
  assert.equal(f.calls.filter(call => call[0] === 'cancel').length, 1);
});
