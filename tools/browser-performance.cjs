#!/usr/bin/env node
'use strict';

// External Release benchmark. Never imported by the game or a Cocos scene.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const CASES = ['home', 'moving', 'perfect', 'stack100', 'stack300', 'stack500', 'result', 'leaderboard', 'revive'];
const BUNDLED_PLAYWRIGHT = '/Users/wxkang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function options(argv) {
  const out = { url: 'http://127.0.0.1:7458/', cases: CASES, runs: 3, seconds: 60, warmupSeconds: 5,
    stabilityMinutes: 0, cyclePlacements: 6, headless: false, allowDebug: false,
    output: path.resolve('docs/qa/performance', new Date().toISOString().replace(/[:.]/g, '-')),
    settingsPath: 'src/settings.json', reviveService: null, dryRun: false, help: false };
  const numberOptions = { '--runs': 'runs', '--seconds': 'seconds', '--warmup-seconds': 'warmupSeconds',
    '--stability-minutes': 'stabilityMinutes', '--cycle-placements': 'cyclePlacements' };
  const stringOptions = { '--url': 'url', '--output': 'output', '--settings-path': 'settingsPath', '--revive-service': 'reviveService' };
  for (let i = 0; i < argv.length; i++) {
    const [key, inline] = argv[i].split(/=(.*)/s);
    if (['--help', '-h'].includes(key)) { out.help = true; continue; }
    if (key === '--headless') { out.headless = true; continue; }
    if (key === '--allow-debug') { out.allowDebug = true; continue; }
    if (key === '--dry-run') { out.dryRun = true; continue; }
    if (!numberOptions[key] && !stringOptions[key] && key !== '--cases') throw new Error(`Unknown argument: ${key}`);
    const value = inline === undefined ? argv[++i] : inline;
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value: ${key}`);
    if (numberOptions[key]) out[numberOptions[key]] = Number(value);
    else if (stringOptions[key]) out[stringOptions[key]] = value;
    else out.cases = value === 'none' ? [] : value.split(',');
  }
  for (const key of ['runs', 'seconds', 'warmupSeconds', 'stabilityMinutes', 'cyclePlacements']) {
    if (!Number.isFinite(out[key]) || out[key] < 0) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isInteger(out.runs) || out.runs < 1 || out.seconds <= 0 || !Number.isInteger(out.cyclePlacements) || out.cyclePlacements < 1) throw new Error('runs/seconds/cycle-placements must be positive (integer counts).');
  for (const value of out.cases) if (!CASES.includes(value)) throw new Error(`Unknown case: ${value}`);
  if (new Set(out.cases).size !== out.cases.length) throw new Error('Duplicate cases are not allowed.');
  out.output = path.resolve(out.output);
  new URL(out.url);
  return out;
}

function summarize(intervals) {
  if (!intervals.length) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const quantile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  const elapsedMs = intervals.reduce((a, b) => a + b, 0);
  return { metric: 'external requestAnimationFrame callback interval; not CPU or GPU frame duration',
    frames: intervals.length, elapsedMs, meanMs: elapsedMs / intervals.length,
    fpsFromIntervals: intervals.length * 1000 / elapsedMs, p50Ms: quantile(.5), p95Ms: quantile(.95), p99Ms: quantile(.99),
    maxMs: sorted[sorted.length - 1], over20Ms: intervals.filter(v => v > 20).length,
    over33_34Ms: intervals.filter(v => v > 33.34).length, over50Ms: intervals.filter(v => v > 50).length };
}

function help() {
  return `Usage: node tools/browser-performance.cjs [options]
  --url URL                  Default http://127.0.0.1:7458/
  --cases LIST               ${CASES.join(',')} (default all); none for stability only
  --runs N --seconds N        Default 3 runs of 60 seconds per case
  --warmup-seconds N          Default 5; occurs after scenario setup before each run
  --stability-minutes N       Additional real-play/restart run; e.g. 15
  --cycle-placements N        Land this many blocks before a deliberate miss (default 6)
  --output DIR               New result directory (existing result is never overwritten)
  --settings-path PATH       Served build settings (default src/settings.json)
  --revive-service URL        Optional dedicated revive service; real service, no mock QR
  --headless                 Explicitly use headless Chrome; environment is recorded
  --allow-debug              Permit debug build; output is marked non-Release
  --dry-run                  Print the plan without launching a browser or measuring
  --help                     This help
Environment: PLAYWRIGHT_MODULE, CHROME_EXECUTABLE
See docs/performance-measurement.md for fixture, isolation and interpretation limits.`;
}

// This function is serialized into the benchmark's fresh browser context.
function installHarness() {
  const cc = window.cc;
  const game = cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('StackGame');
  if (!game?.world3D || !game.ui?.gameplayFx) throw new Error('StackGame/World/FX bindings unavailable in the served build.');
  if (game.testModeEnabled) throw new Error('Benchmark requires ordinary gameplay; perfect test mode must remain off.');
  const events = [];
  let mode = 'none', frames = 0, raf = 0, active = true, lastPhase = game.phase;
  let previousRound = '', roundStart = null, lastRestart = -Infinity, lastConfirm = -Infinity;
  let startedRounds = 0, completedRounds = 0, completedPlacements = 0, staminaRestores = 0;
  let cyclePlacements = 6, setupStartedAt = performance.now();
  const observedRounds = new Set(), completedIds = new Set();
  let sample = null, lastSample = null;
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  function counters(now) {
    const device = cc.director.root?.device, world = game.world3D, fx = game.ui.gameplayFx;
    const canvas = document.getElementById('GameCanvas') || document.querySelector('canvas');
    return { atMs: now, phase: game.phase, overlay: game.homeOverlay, homeTransition: !!game.homeTransition,
      score: game.score, perfectStreak: game.perfectStreak, roundPerfectCount: game.roundPerfectCount,
      roundId: game.roundId || null, settledTowerLayers: game.stack.length, movingBlock: !!game.current,
      actualFramebuffer: { width: canvas?.width ?? null, height: canvas?.height ?? null },
      drawCalls: finite(device?.numDrawCalls), triangles: finite(device?.numTris), instances: finite(device?.numInstances),
      world: { activeBlocks: world.activeBlocks, looseCount: world.looseCount, fragmentCapacity: world.fragmentPoolCapacity,
        fragmentAvailable: world.fragmentPoolAvailable, fragmentGrowth: world.growthCount, instancing: world.isInstancingEnabled },
      fx: { activeCount: fx.activeCount, sparks: fx.activeSparkCount, rings: fx.activeRingCount, frames: fx.activeFrameCount,
        ringCapacity: fx.ringPoolCapacity, ringGrowth: fx.ringExpansionCount, peakRings: fx.peakActiveRingCount,
        projectionCalls: finite(game.frameProjectionCalls), projectionCacheHits: finite(game.frameProjectionCacheHits) },
      memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null,
      visibility: document.visibilityState, testMode: game.testModeEnabled, reducedMotion: game.reducedMotion,
      cycles: { startedRounds, completedRounds, completedPlacements, staminaRestores } };
  }
  function event(type, detail = {}) { events.push({ atMs: performance.now(), type, ...detail }); }
  function startRound() {
    if (game.phase !== 'ready' && game.phase !== 'gameover') return;
    if (game.homeTransition || !game.audioReady) return;
    if (game.stamina?.snapshot().amount === 0) {
      game.stamina.restore(); staminaRestores++; event('isolated-test-stamina-restore');
    }
    const command = game.uiAdapter?.commands?.startRound;
    if (command) command(); else game.startGame();
    lastRestart = performance.now();
    event('start-command', { source: command ? 'uiAdapter.commands.startRound' : 'StackGame.startGame' });
  }
  function confirm(reason, delta) {
    const now = performance.now();
    if (now - lastConfirm < 120) return;
    const level = game.current?.level, before = game.phase;
    const init = { key: ' ', code: 'Space', keyCode: 32, which: 32, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    window.dispatchEvent(new KeyboardEvent('keyup', init));
    lastConfirm = now;
    event('synthetic-keyboard-confirm', { reason, delta, level, before, after: game.phase, score: game.score });
  }
  function drive(now) {
    if (!['perfect', 'fail', 'stability'].includes(mode)) return;
    if (game.testModeEnabled) throw new Error('Ordinary-play run unexpectedly entered perfect test mode.');
    if (mode === 'stability' && ['ready', 'gameover'].includes(game.phase) && !game.homeTransition) {
      const completed = events.findLast(e => e.type === 'real-round-completed');
      if (now - lastRestart > 1500 && (game.phase === 'ready' || !completed || now - completed.atMs >= 1000)) startRound();
      return;
    }
    if (game.phase !== 'playing' || game.homeTransition || game.openingBlockEntering || game.spawnDelay > 0 || game.resumeInputLock > 0 || !game.current) return;
    const block = game.current, previous = game.stack[game.stack.length - 1], axis = game.moveAxis;
    const size = axis === 'x' ? 'width' : 'depth', delta = block[axis] - previous[axis];
    const shouldMiss = mode === 'fail' || (mode === 'stability' && game.score >= cyclePlacements);
    if (shouldMiss && Math.abs(delta) > (block[size] + previous[size]) / 2 + .25) confirm('deliberate-real-miss', delta);
    // Conservative subset of the game's actual perfect threshold (0.14 / 4.5%).
    else if (!shouldMiss && Math.abs(delta) <= Math.min(.12, block[size] * .04)) confirm('near-center-real-placement', delta);
  }
  function tick(now) {
    if (!active) return;
    try {
      frames++;
      if (game.roundId && game.roundId !== previousRound && ['playing', 'dropping'].includes(game.phase)) {
        previousRound = game.roundId;
        if (mode === 'stability' && !observedRounds.has(previousRound)) {
          observedRounds.add(previousRound); startedRounds++; roundStart = now;
          event('real-round-started', { roundId: previousRound });
        }
      }
      if (game.phase !== lastPhase) {
        event('phase', { from: lastPhase, to: game.phase, score: game.score, roundId: game.roundId });
        if (mode === 'stability' && game.phase === 'gameover' && lastPhase === 'falling'
          && observedRounds.has(game.roundId) && !completedIds.has(game.roundId)) {
          completedIds.add(game.roundId); completedRounds++; completedPlacements += game.score;
          event('real-round-completed', { roundId: game.roundId, score: game.score,
            perfectCount: game.roundPerfectCount, startedAtMs: roundStart });
        }
        lastPhase = game.phase;
      }
      drive(now);
      if (sample) {
        if (sample.previous !== null) {
          if (sample.count >= sample.intervals.length) throw new Error('Raw rAF interval buffer exhausted; result is incomplete.');
          sample.intervals[sample.count++] = now - sample.previous;
        } else sample.firstFrameAt = now;
        sample.previous = now;
        if (now >= sample.nextCounterAt) { sample.counters.push(counters(now)); sample.nextCounterAt = now + 1000; }
        if (now - sample.firstFrameAt >= sample.durationMs) finishSample(now);
      }
    } catch (error) {
      event('harness-error', { message: String(error.stack || error) });
      if (sample) { sample.error = String(error); finishSample(now); }
      mode = 'none';
    }
    raf = requestAnimationFrame(tick);
  }
  function finishSample(now) {
    sample.finishedAt = now;
    sample.end = counters(now);
    sample.events = events.filter(e => e.atMs >= sample.requestedAt);
    sample.cycleDelta = { started: startedRounds - sample.start.cycles.startedRounds,
      completed: completedRounds - sample.start.cycles.completedRounds,
      completedEntirelyInsideWindow: sample.events.filter(e => e.type === 'real-round-completed' && e.startedAtMs >= sample.requestedAt).length,
      placements: completedPlacements - sample.start.cycles.completedPlacements,
      staminaRestores: staminaRestores - sample.start.cycles.staminaRestores };
    lastSample = sample; sample = null;
  }
  function startSample(seconds) {
    if (sample) throw new Error('A sample is already active.');
    // Allocate before baseline memory read; no growable per-frame interval array.
    const intervals = new Float64Array(Math.ceil(seconds * 1000) + 2000);
    const now = performance.now();
    sample = { intervals, count: 0, counters: [], requestedAt: now, firstFrameAt: null, previous: null,
      nextCounterAt: now, durationMs: seconds * 1000, start: counters(now), error: null };
    lastSample = null;
  }
  function takeSample() {
    if (sample || !lastSample) throw new Error('Sample not complete.');
    const { intervals, count, ...result } = lastSample;
    result.rawIntervalsMs = Array.from(intervals.subarray(0, count));
    return result;
  }
  window.__wxStackPerformance = { game, events, counters, startRound, startSample, takeSample,
    abortSample(reason) { if (sample) { sample.error = reason; finishSample(performance.now()); } },
    setMode(value, count = 6) { mode = value; cyclePlacements = count; event('driver-mode', { mode }); },
    getStatus() { return { done: !!lastSample && !sample, frames, phase: game.phase, score: game.score,
      perfectStreak: game.perfectStreak, startedRounds, completedRounds, setupElapsedMs: performance.now() - setupStartedAt }; },
    stop() { active = false; cancelAnimationFrame(raf); game.closeRevive?.(); } };
  raf = requestAnimationFrame(tick);
}

async function environment(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('GameCanvas') || document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = gl?.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? null;
    return { userAgent: navigator.userAgent, platform: navigator.platform, hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGB: navigator.deviceMemory ?? null, devicePixelRatio: devicePixelRatio,
      viewport: { width: innerWidth, height: innerHeight }, screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
      canvas: { width: canvas?.width, height: canvas?.height, clientWidth: canvas?.clientWidth, clientHeight: canvas?.clientHeight },
      actualFramebuffer: gl ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight } : null,
      webgl: gl ? { version: gl.getParameter(gl.VERSION), vendor: gl.getParameter(extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        renderer, softwareRendererDetected: /swiftshader|llvmpipe|software|swift shader/i.test(renderer || '') } : null,
      visibility: document.visibilityState, crossOriginIsolated,
      engineVersion: window.cc?.ENGINE_VERSION ?? window.cc?.VERSION ?? null };
  });
}

async function waitGame(page, predicate, timeout = 30000) {
  return page.waitForFunction(predicate, null, { timeout, polling: 100 });
}
async function setupCase(page, name, opts) {
  const description = { case: name, fixture: false, setup: [], driver: 'none' };
  if (name === 'home') return description;
  if (name === 'leaderboard') {
    await page.evaluate(() => window.__wxStackPerformance.game.openHomeOverlay('leaderboard'));
    await waitGame(page, () => { const g = window.__wxStackPerformance.game; return g.homeOverlay === 'leaderboard' && !g.homeTransition && !g.leaderboardLoading; });
    return { ...description, fixture: true, setup: ['Ten named local leaderboard records seeded before page initialization.'] };
  }
  if (name === 'stability') {
    await page.evaluate(count => window.__wxStackPerformance.setMode('stability', count), opts.cyclePlacements);
    await waitGame(page, () => window.__wxStackPerformance.game.phase === 'playing');
    return { ...description, driver: 'real near-center placements, deliberate miss, result, original start command', setup: ['No stack/score/phase/physics fixture. Isolated stamina restored only between rounds when empty.'] };
  }
  await page.evaluate(() => window.__wxStackPerformance.startRound());
  await waitGame(page, () => { const g = window.__wxStackPerformance.game; return g.phase === 'playing' && !g.homeTransition; });
  if (/^stack\d+$/.test(name)) {
    const layers = Number(name.slice(5));
    await page.evaluate(count => {
      const g = window.__wxStackPerformance.game;
      const base = { ...g.stack[0] };
      g.world3D.reset(); g.ui.gameplayFx.clear(); g.current = null;
      g.stack = Array.from({ length: count }, (_, level) => ({ ...base, level, hue: g.hueForLevel(level) }));
      g.setScore(count - 1, false); g.world3D.restoreStack(g.stack); g.spawnMovingBlock();
    }, layers);
    return { ...description, fixture: true, settledLayers: layers,
      setup: [`Setup-only ${layers} settled blocks + one normally spawned moving block. world.restoreStack used once; no physics timestep or movement speed override.`] };
  }
  if (name === 'perfect') {
    await page.evaluate(() => window.__wxStackPerformance.setMode('perfect'));
    await waitGame(page, () => window.__wxStackPerformance.game.roundPerfectCount >= 2, 45000);
    return { ...description, driver: 'Real normal-mode moving blocks; synthetic Space only within 0.12 world units / 4% footprint; at least two actual perfect landings before warmup.' };
  }
  if (name === 'result' || name === 'revive') {
    await page.evaluate(() => window.__wxStackPerformance.setMode('fail'));
    await waitGame(page, () => window.__wxStackPerformance.game.phase === 'gameover', 30000);
    await page.evaluate(() => window.__wxStackPerformance.setMode('none'));
    description.setup.push('Real moving block deliberately confirmed outside support; waited for falling → gameover.');
    if (name === 'revive') {
      await page.evaluate(() => window.__wxStackPerformance.game.openRevive());
      await waitGame(page, () => { const g = window.__wxStackPerformance.game; return !!g.reviveSession && g.reviveGroup.active; }, 20000);
      description.setup.push('Existing ReviveClient opened a real dedicated service session; QR modules/texture must be present. No mock QR or fake confirmation.');
    }
  }
  return description;
}

function validateRun(name, result) {
  const failures = [];
  if (result.error) failures.push(result.error);
  const snapshots = [result.start, ...result.counters, result.end];
  if (snapshots.some(s => s.visibility !== 'visible')) failures.push('Document was hidden during sampling.');
  if (snapshots.some(s => s.testMode)) failures.push('Perfect test mode was enabled.');
  const allowed = name === 'home' || name === 'leaderboard' ? ['ready']
    : name === 'result' || name === 'revive' ? ['gameover']
      : name === 'perfect' ? ['playing', 'dropping']
        : name === 'stability' ? ['ready', 'playing', 'dropping', 'falling', 'gameover'] : ['playing'];
  if (snapshots.some(s => !allowed.includes(s.phase))) failures.push(`Unexpected gameplay phase for ${name}.`);
  if (name === 'perfect' && result.end.roundPerfectCount <= result.start.roundPerfectCount) failures.push('No actual perfect landing occurred during measurement.');
  if (name === 'stability' && result.cycleDelta.completed === 0) failures.push('No real completed round during stability measurement.');
  if (result.rawIntervalsMs.length === 0) failures.push('No rAF intervals captured.');
  return { valid: failures.length === 0, failures };
}

async function main(argv = process.argv.slice(2)) {
  const opts = options(argv);
  if (opts.help) { console.log(help()); return; }
  if (opts.dryRun) { console.log(JSON.stringify({ ...opts, estimatedSamplingSeconds: opts.cases.length * opts.runs * (opts.seconds + opts.warmupSeconds) + (opts.stabilityMinutes ? opts.stabilityMinutes * 60 + opts.warmupSeconds : 0) }, null, 2)); return; }
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || BUNDLED_PLAYWRIGHT);
  const executablePath = process.env.CHROME_EXECUTABLE || DEFAULT_CHROME;
  if (fs.existsSync(path.join(opts.output, 'manifest.json'))) throw new Error('Output already contains a manifest. Choose a new --output directory.');
  fs.mkdirSync(opts.output, { recursive: true });
  const manifest = { schemaVersion: 1, kind: 'external-browser-raf-performance', startedAt: new Date().toISOString(), options: opts,
    node: process.version, host: { platform: os.platform(), release: os.release(), arch: os.arch(), cpus: os.cpus()[0]?.model, logicalCPUs: os.cpus().length, memoryBytes: os.totalmem() },
    executablePath, launchArgs: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'], runs: [], errors: [],
    limitations: ['rAF measures presentation callback cadence; it is not GPU timing, physics duration, or Cocos CPU section timing.',
      'A desktop Chrome run is not Android projector/WebView acceptance. Software GPU status and actual framebuffer are recorded.',
      'Read-only world/FX/device counters and memory are sampled once per second; the synthetic-input driver runs once per rAF.',
      'Stability counts only observed real start→falling→gameover rounds; manually populated towers never count as real cycles.',
      'No forced GC. Memory includes browser/game/harness retained data, including the preallocated raw interval buffer.'] };
  const save = () => fs.writeFileSync(path.join(opts.output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  save();
  let browser;
  try {
    browser = await chromium.launch({ executablePath, headless: opts.headless, args: manifest.launchArgs });
    manifest.browserVersion = browser.version();
    const verify = await browser.newContext();
    try {
      const response = await verify.request.get(new URL(opts.settingsPath, opts.url).href, { timeout: 15000 });
      if (!response.ok()) throw new Error(`Cannot verify served build settings: HTTP ${response.status()}`);
      const text = await response.text(), settings = JSON.parse(text);
      manifest.build = { settingsURL: response.url(), settingsSHA256: crypto.createHash('sha256').update(text).digest('hex'),
        creator: settings.CocosEngine, debug: settings.engine?.debug, platform: settings.engine?.platform };
      if (manifest.build.debug !== false && !opts.allowDebug) throw new Error('Served settings are not engine.debug=false. Freeze a Release build first, or explicitly use --allow-debug for non-acceptance diagnostics.');
    } finally { await verify.close(); }
    save();
    async function run(name, index, seconds) {
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const entry = { case: name, run: index, seconds, status: 'setting-up', logs: [] };
      manifest.runs.push(entry); save();
      page.on('pageerror', error => entry.logs.push({ type: 'pageerror', message: error.message }));
      page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') entry.logs.push({ type: message.type(), message: message.text() }); });
      try {
        await context.addInitScript(({ leaderboard, reviveService }) => {
          // Fresh context only; never attach a persistent profile or import user storage.
          localStorage.setItem('wxstack-sound-enabled', '1');
          localStorage.setItem('wxstack-reduced-motion', '0');
          localStorage.setItem('wxstack-nickname', '性能测试');
          if (reviveService) window.WXSTACK_REVIVE_SERVICE = reviveService;
          if (leaderboard) localStorage.setItem('wxstack-leaderboard-v1', JSON.stringify({ version: 1,
            entries: Array.from({ length: 10 }, (_, i) => ({ id: `benchmark-${i}`, kind: 'round', score: 500 - i * 41,
              perfectCount: 100 - i * 7, finishedAt: 1700000000000 + i, nickname: `测试玩家${i + 1}` })) }));
        }, { leaderboard: name === 'leaderboard', reviveService: opts.reviveService });
        await page.goto(opts.url, { waitUntil: 'load', timeout: 60000 });
        await waitGame(page, () => { const g = window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('StackGame'); return !!g?.uiReady && g.audioReady && g.phase === 'ready'; }, 45000);
        await page.evaluate(installHarness);
        entry.environment = await environment(page);
        entry.scenario = await setupCase(page, name, opts);
        console.log(`${name} run ${index}: warmup ${opts.warmupSeconds}s`);
        await page.waitForTimeout(opts.warmupSeconds * 1000);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        entry.cdpBefore = await cdp.send('Performance.getMetrics');
        entry.environmentBeforeSampling = await environment(page);
        await page.evaluate(duration => window.__wxStackPerformance.startSample(duration), seconds);
        entry.status = 'measuring'; save();
        const wallStart = Date.now(), hardDeadline = wallStart + (seconds + 90) * 1000;
        let nextProgress = Date.now() + 15000;
        while (true) {
          await page.waitForTimeout(1000);
          const status = await page.evaluate(() => window.__wxStackPerformance.getStatus());
          if (status.done) break;
          if (Date.now() >= hardDeadline) throw new Error('Sampling timed out (background throttling or stalled rAF).');
          if (Date.now() >= nextProgress) {
            console.log(`${name} run ${index}: ${Math.round((Date.now() - wallStart) / 1000)}s phase=${status.phase} score=${status.score} realCycles=${status.completedRounds}`);
            nextProgress = Date.now() + 15000;
          }
        }
        entry.cdpAfter = await cdp.send('Performance.getMetrics');
        const result = await page.evaluate(() => window.__wxStackPerformance.takeSample());
        entry.environmentAfterSampling = await environment(page);
        entry.summary = summarize(result.rawIntervalsMs);
        entry.validation = validateRun(name, result);
        entry.realCycleDelta = result.cycleDelta;
        entry.memory = { start: result.start.memory, end: result.end.memory };
        entry.rawFile = `${name}-${index}.json`;
        fs.writeFileSync(path.join(opts.output, entry.rawFile), JSON.stringify({ scenario: entry.scenario, environment: entry.environment,
          summary: entry.summary, validation: entry.validation, ...result }, null, 2) + '\n');
        entry.status = entry.validation.valid ? 'complete' : 'invalid';
        await page.screenshot({ path: path.join(opts.output, `${name}-${index}.png`) });
        console.log(`${name} run ${index}: ${entry.status}; p95=${entry.summary?.p95Ms.toFixed(2)}ms p99=${entry.summary?.p99Ms.toFixed(2)}ms`);
      } catch (error) {
        if (entry.status === 'measuring') {
          try {
            const partial = await page.evaluate(reason => {
              const harness = window.__wxStackPerformance;
              harness.abortSample(reason);
              return harness.takeSample();
            }, error.message);
            entry.summary = summarize(partial.rawIntervalsMs);
            entry.validation = validateRun(name, partial);
            entry.rawFile = `${name}-${index}.json`;
            fs.writeFileSync(path.join(opts.output, entry.rawFile), JSON.stringify({ incomplete: true,
              scenario: entry.scenario, environment: entry.environment, ...partial }, null, 2) + '\n');
          } catch (partialError) { entry.partialCaptureError = String(partialError); }
        }
        entry.status = 'failed'; entry.error = String(error.stack || error);
        manifest.errors.push({ case: name, run: index, error: entry.error });
        console.error(`${name} run ${index}: ${error.message}`);
      } finally {
        await page.evaluate(() => window.__wxStackPerformance?.stop()).catch(() => {});
        await context.close(); save();
      }
    }
    for (const name of opts.cases) for (let index = 1; index <= opts.runs; index++) await run(name, index, opts.seconds);
    if (opts.stabilityMinutes > 0) await run('stability', 1, opts.stabilityMinutes * 60);
  } catch (error) { manifest.errors.push({ error: String(error.stack || error) }); throw error; }
  finally { manifest.finishedAt = new Date().toISOString(); save(); await browser?.close(); }
  if (manifest.runs.some(r => r.status !== 'complete') || manifest.errors.length) process.exitCode = 1;
  console.log(`Results: ${path.join(opts.output, 'manifest.json')}`);
}

module.exports = { CASES, options, summarize, validateRun, installHarness };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
