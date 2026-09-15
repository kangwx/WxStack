const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/ui/PerformanceProbe.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
} }).outputText;

function load(debug = true, globals = {}) {
  const sandbox = { exports: {}, require(id) { assert.equal(id, 'cc/env'); return { DEBUG: debug }; }, ...globals };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports;
}
function environment() {
  return {
    capturedAt: 'test-fixture', userAgent: null, platform: null, hardwareConcurrency: null,
    deviceMemoryGB: null, devicePixelRatio: null, viewport: null, framebuffer: null,
    webgl: null, heap: null,
  };
}
function setup(options = {}) {
  const { PerformanceProbe } = load();
  let now = 0;
  const probe = new PerformanceProbe({ enabled: true, now: () => now, environmentProvider: environment, ...options });
  return { probe, setTime: value => { now = value; } };
}

test('both DEBUG and explicit opt-in are required; disabled probes allocate no sample buffers or capture device data', () => {
  for (const [debug, enabled] of [[false, true], [true, false], [false, false]]) {
    const { PerformanceProbe } = load(debug);
    const probe = new PerformanceProbe({ enabled, environmentProvider() { throw new Error('must not capture'); } });
    assert.equal(probe.start(), false);
    probe.recordFrame(1);
    probe.beginSection('update'); probe.endSection('update'); probe.recordCounter('nodes', 5);
    assert.equal(probe.frames, null);
    assert.equal(probe.snapshot(), null);
    assert.equal(probe.stop(), null);
    const exported = JSON.parse(probe.exportJSON());
    assert.equal(exported.enabled, false);
    assert.equal(exported.runs.length, 0);
  }
  const { PerformanceProbe } = load(true);
  assert.equal(new PerformanceProbe().enabled, false);
});

test('frame summaries preserve exact >50ms counts and nearest-rank percentiles with no fabricated empty values', () => {
  const { probe } = setup();
  probe.start('distribution');
  const empty = probe.snapshot();
  assert.equal(empty.frameTiming.averageMs, null);
  assert.equal(empty.frameTiming.p95Ms, null);
  assert.equal(empty.averageFps, null);
  for (let milliseconds = 1; milliseconds <= 100; milliseconds++) probe.recordFrame(milliseconds / 1000);
  const result = probe.stop();
  assert.equal(result.frameTiming.count, 100);
  assert.equal(result.frameTiming.averageMs, 50.5);
  assert.equal(result.frameTiming.p95Ms, 95);
  assert.equal(result.frameTiming.p99Ms, 99);
  assert.equal(result.frameTiming.over50MsCount, 50);
  assert.equal(result.frameTiming.over50MsPercent, 50);
  assert.equal(result.averageFps, 1000 / 50.5);
});

test('automatic completion uses wall time and retains three independent 60-second runs with reusable buffers', () => {
  const { probe, setTime } = setup();
  let buffer = null;
  for (let run = 0; run < 4; run++) {
    setTime(run * 61000);
    assert.equal(probe.start(`run-${run + 1}`), true);
    assert.equal(probe.start('duplicate'), false);
    if (buffer) assert.equal(probe.frames.values, buffer);
    buffer = probe.frames.values;
    setTime(run * 61000 + 59999);
    probe.recordFrame(0.01);
    assert.equal(probe.isRunning, true);
    setTime(run * 61000 + 60000);
    probe.recordFrame(0.02);
    assert.equal(probe.isRunning, false);
    const result = probe.snapshot();
    assert.equal(result.status, 'completed');
    assert.equal(result.reason, 'duration');
    assert.equal(result.elapsedSeconds, 60);
    assert.equal(result.frameTiming.count, 2, 'does not pretend a test supplied 3600 frames');
  }
  const exported = JSON.parse(probe.exportJSON());
  assert.deepEqual(exported.runs.map(run => run.label), ['run-2', 'run-3', 'run-4']);
  assert.equal(exported.activeRun, null);
  assert.equal(exported.targetAcceptance.status, 'not-verified');
});

test('buffer overflow and invalid samples are explicit while averages retain all valid frame observations', () => {
  const { probe } = setup({ sampleCapacity: 2 });
  probe.start();
  for (const seconds of [0.01, 0.02, 0.06, NaN, -1, Infinity]) probe.recordFrame(seconds);
  const result = probe.stop().frameTiming;
  assert.equal(result.count, 3);
  assert.equal(result.storedCount, 2);
  assert.equal(result.overflowCount, 1);
  assert.equal(result.invalidCount, 3);
  assert.equal(result.averageMs, 30);
  assert.equal(result.p95Ms, 20);
  assert.equal(result.over50MsCount, 1);
});

test('section and counter recording preserve buffers, work counts and no-op unknown or unmatched calls', () => {
  const { probe, setTime } = setup({ sectionNames: ['world'], counterNames: ['rigidBodies'] });
  probe.start();
  const sectionBuffer = probe.sections.get('world').values;
  probe.endSection('world');
  probe.beginSection('unknown');
  probe.recordCounter('unknown', 1);
  probe.beginSection('world');
  setTime(1);
  probe.beginSection('world'); // Re-entry must not reset the initial start timestamp.
  setTime(4);
  probe.endSection('world', 128);
  probe.recordCounter('rigidBodies', 5);
  probe.recordCounter('rigidBodies', 15);
  probe.recordCounter('rigidBodies', NaN);
  const first = probe.stop();
  assert.equal(first.sections.world.count, 1);
  assert.equal(first.sections.world.averageMs, 4);
  assert.equal(first.sections.world.workUnits, 128);
  assert.deepEqual(JSON.parse(JSON.stringify(first.counters.rigidBodies)), { count: 2, latest: 15, average: 10, min: 5, max: 15 });
  probe.start();
  assert.equal(probe.sections.get('world').values, sectionBuffer);
  const reset = probe.stop();
  assert.equal(reset.sections.world.count, 0);
  assert.equal(reset.sections.world.workUnits, 0);
  assert.equal(reset.counters.rigidBodies.latest, null);
  assert.equal(first.sections.world.count, 1, 'completed run must not change during reuse');
});

test('environment uses the WebGL drawing buffer, preserves nullable fields, and reads optional heap/GPU metadata', () => {
  const parameters = new Map([[1, 'WebGL 2.0'], [7, 'Fixture GPU'], [8, 'Fixture vendor']]);
  const gl = {
    drawingBufferWidth: 3840, drawingBufferHeight: 2160, VERSION: 1, RENDERER: 2, VENDOR: 3,
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 7, UNMASKED_VENDOR_WEBGL: 8 }),
    getParameter: key => parameters.get(key),
  };
  const canvas = { tagName: 'CANVAS', width: 1920, height: 1080, getContext: () => gl };
  const { capturePerformanceEnvironment } = load(true, {
    document: { getElementById: () => canvas },
    window: { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 2 },
    navigator: { userAgent: 'Fixture Android', platform: 'Fixture', hardwareConcurrency: 8 },
    performance: { memory: { usedJSHeapSize: 10, totalJSHeapSize: 20, jsHeapSizeLimit: 30 } },
  });
  const result = capturePerformanceEnvironment();
  assert.deepEqual(JSON.parse(JSON.stringify(result.framebuffer)), { width: 3840, height: 2160, source: 'webgl' });
  assert.equal(result.webgl.renderer, 'Fixture GPU');
  assert.equal(result.webgl.unmasked, true);
  assert.equal(result.deviceMemoryGB, null);
  assert.equal(result.heap.usedBytes, 10);
});

test('unavailable DOM and privacy-restricted context metadata remain unavailable without storage or network access', () => {
  const result = load().capturePerformanceEnvironment();
  for (const key of ['userAgent', 'framebuffer', 'viewport', 'heap', 'webgl']) assert.equal(result[key], null);
  const canvas = { tagName: 'canvas', width: 1920, height: 1080, getContext() { throw new Error('unavailable'); } };
  const fallback = load(true, { document: { getElementById: () => canvas } }).capturePerformanceEnvironment();
  assert.equal(fallback.framebuffer.source, 'canvas');
  assert.equal(fallback.webgl, null);
  assert.doesNotMatch(source, /localStorage|sessionStorage|\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
});
