const { test } = require('node:test');
const assert = require('node:assert/strict');
const { options, summarize, validateRun } = require('./browser-performance.cjs');

test('the default plan runs nine cases three times with independent five-second warmups', () => {
  const plan = options([]);
  assert.equal(plan.cases.length, 9); assert.equal(plan.runs, 3); assert.equal(plan.seconds, 60);
  assert.equal(plan.warmupSeconds, 5); assert.equal(plan.allowDebug, false); assert.equal(plan.headless, false);
});
test('stability-only is explicit and does not silently substitute setup fixtures for real cycles', () => {
  const plan = options(['--cases=none', '--stability-minutes', '15']);
  assert.deepEqual(plan.cases, []); assert.equal(plan.stabilityMinutes, 15);
  assert.throws(() => options(['--cases', 'invented']), /Unknown case/);
  assert.throws(() => options(['--runs', '1.5']), /integer/);
  assert.throws(() => options(['--cycle-placements', '0']), /positive/);
});
test('nearest-rank quantiles retain outliers and report callback cadence, not GPU duration', () => {
  const intervals = Array(98).fill(16); intervals.push(40, 100);
  const result = summarize(intervals);
  assert.equal(result.p95Ms, 16); assert.equal(result.p99Ms, 40); assert.equal(result.maxMs, 100);
  assert.equal(result.over33_34Ms, 2); assert.equal(result.over50Ms, 1);
  assert.equal(result.elapsedMs, 1708); assert.match(result.metric, /not CPU or GPU/);
});
function run(phase = 'playing') {
  const state = { phase, visibility: 'visible', testMode: false, roundPerfectCount: 2 };
  return { start: { ...state }, counters: [{ ...state }], end: { ...state }, cycleDelta: { completed: 0 }, rawIntervalsMs: [16.7], error: null };
}
test('a home screenshot posing as moving or a perfect run without real landings is invalid', () => {
  assert.equal(validateRun('moving', run('ready')).valid, false);
  assert.equal(validateRun('perfect', run()).valid, false);
  const sample = run(); sample.end.roundPerfectCount = 4;
  assert.equal(validateRun('perfect', sample).valid, true);
});
test('hidden pages, perfect test mode and simulation failures cannot produce accepted measurements', () => {
  const hidden = run(); hidden.counters[0].visibility = 'hidden';
  assert.equal(validateRun('moving', hidden).valid, false);
  const testMode = run(); testMode.start.testMode = true;
  assert.equal(validateRun('moving', testMode).valid, false);
  const failed = run(); failed.error = 'buffer exhausted';
  assert.equal(validateRun('moving', failed).valid, false);
});
test('stability completion requires observed real round completion rather than elapsed minutes', () => {
  const sample = run();
  assert.equal(validateRun('stability', sample).valid, false);
  sample.cycleDelta.completed = 1;
  assert.equal(validateRun('stability', sample).valid, true);
});
