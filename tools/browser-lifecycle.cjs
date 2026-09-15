// Real Chrome/Cocos lifecycle regression. No phase, score or physics coordinates are patched.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/Users/wxkang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { createReviveServer } = require('./revive-server.cjs');
const out = path.resolve(__dirname, '../docs/qa/lifecycle');
const launchArgs = ['--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const report = { startedAt: new Date().toISOString(), url: process.env.WXSTACK_TEST_URL || 'http://127.0.0.1:7458/?profile',
  kind: 'real-browser-lifecycle', build: 'Cocos 3.8.8 web-mobile debug', androidVerified: false,
  launchArgs, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
  errors: [], warnings: [], failedRequests: [], httpErrors: [], checks: [], samples: [], qrSessions: [] };
let browser, server, page, cdp;
function check(name, actual, expected) { assert.deepEqual(actual, expected, name); report.checks.push({ name, pass: true }); }
async function command(name) { await page.evaluate(name => window.WxStackDiagnostics.owner[name](), name); }
async function settled(phase, overlay = 'none') {
  await page.waitForFunction(({ phase, overlay }) => {
    const g = window.WxStackDiagnostics.owner;
    return g.phase === phase && g.homeOverlay === overlay && !g.homeTransition && !g.router.transitionLocked && !g.transitionBlocker.active;
  }, { phase, overlay }, { timeout: 10000 });
}
async function state() {
  return page.evaluate(() => {
    const g = window.WxStackDiagnostics.owner, cc = window.__lifecycleCC;
    const count = target => {
      const table = target?._callbackTable;
      if (!table) return null;
      return Object.fromEntries(Object.entries(table).map(([key, list]) => [key, list.callbackInfos.filter(info => info?.target === g).length]).filter(([, n]) => n));
    };
    let nodes = 0, components = 0, activeNodes = 0;
    const visit = n => { nodes++; components += n.components.length; if (n.activeInHierarchy) activeNodes++; n.children.forEach(visit); };
    visit(cc.director.getScene());
    const scheduled = cc.director.getScheduler()._arrayForTimers.filter(entry => entry.target === g);
    const qr = g.ui.qrCodeView;
    const id = asset => {
      if (!asset) return null;
      let value = window.__lifecycleAssetIds.get(asset);
      if (!value) { value = ++window.__lifecycleAssetSequence; window.__lifecycleAssetIds.set(asset, value); }
      return value;
    };
    return { phase: g.phase, overlay: g.homeOverlay, routerTop: g.router.top, routerDepth: g.router.depth,
      homeFocus: g.homeSelection, settingsFocus: g.settingsSelection, resultFocus: g.resultSelection,
      transition: !!g.homeTransition, transitionLocked: g.router.transitionLocked, blocker: g.transitionBlocker.active,
      enabled: g.enabled, uiSuspended: g.uiSuspended, physicsEnabled: cc.PhysicsSystem.instance.enable,
      sceneNodes: nodes, sceneComponents: components, activeSceneNodes: activeNodes,
      world: g.world3D.getDiagnostics(), blockPoolAvailable: g.world3D.blockPool.length,
      activeInputListeners: count(cc.input._eventTarget), activeGameListeners: count(cc.game), activeViewListeners: count(cc.view),
      scheduler: { entries: scheduled.length, timers: scheduled.reduce((sum, entry) => sum + entry.timers.length, 0) },
      revive: { visible: g.reviveGroup.active, state: g.reviveController.state.status, scheduled: g.reviveController.scheduled,
        polling: g.reviveController.pollingVersion !== null, frameId: id(qr.ownedFrame),
        textureId: id(qr.ownedTexture), imageFrameId: id(qr.image.spriteFrame),
        frameUUID: qr.ownedFrame?.uuid ?? null, textureUUID: qr.ownedTexture?.uuid ?? null },
      fx: { active: g.ui.gameplayFx.activeCount, rings: g.ui.gameplayFx.ringPoolCapacity, growth: g.ui.gameplayFx.ringExpansionCount },
      stamina: g.stamina.snapshot().amount, testMode: g.testModeEnabled };
  });
}
async function sample(label) {
  await page.waitForTimeout(600);
  const gc = [];
  for (let i = 0; i < 2; i++) {
    try { await cdp.send('HeapProfiler.collectGarbage'); gc.push('completed'); }
    catch (error) { gc.push(String(error)); }
  }
  const heap = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  const value = { label, capturedAt: new Date().toISOString(), gc, heap, dom, state: await state() };
  report.samples.push(value); return value;
}
async function pageCycle(index) {
  await command('onSettingsButton'); await settled('ready', 'settings');
  let s = await state(); check(`settings route ${index}`, [s.routerTop, s.routerDepth], ['settings', 1]);
  await command('openNicknameEditor');
  s = await state(); check(`nickname route ${index}`, [s.routerTop, s.routerDepth], ['nickname', 2]);
  await command('closeNicknameEditor');
  s = await state(); check(`nickname return focus ${index}`, [s.routerTop, s.settingsFocus], ['settings', 3]);
  await command('closeHomeOverlay'); await settled('ready');
  s = await state(); check(`settings return focus ${index}`, [s.routerTop, s.routerDepth, s.homeFocus], ['home', 0, 2]);
  await command('onLeaderboardButton'); await settled('ready', 'leaderboard');
  s = await state(); check(`leaderboard route ${index}`, [s.routerTop, s.routerDepth], ['leaderboard', 1]);
  await command('closeHomeOverlay'); await settled('ready');
  s = await state(); check(`leaderboard return focus ${index}`, [s.routerTop, s.routerDepth, s.homeFocus], ['home', 0, 1]);
}
async function restartCycle(index) {
  await command('startGame'); await settled('playing');
  await command('pauseGame'); await settled('paused');
  await command('restartPausedGame'); await settled('playing');
  await command('pauseGame'); await command('returnToHome'); await settled('ready');
  const s = await state();
  check(`restart returns home ${index}`, [s.routerTop, s.routerDepth, s.world.looseCount, s.fx.active], ['home', 0, 0, 0]);
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  // A private real backend keeps the test independent of another developer's sessions.
  let serviceURL;
  server = createReviveServer({ publicURL: { toString: () => serviceURL } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  serviceURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: launchArgs });
  report.browser = await browser.version();
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
  await context.addInitScript(url => { window.WXSTACK_REVIVE_SERVICE = url; }, serviceURL);
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ kind: 'pageerror', message: String(error.stack || error) }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ kind: 'console', message: message.text(), location: message.location() });
    if (message.type() === 'warning') report.warnings.push(message.text());
  });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url().replace(/\/api\/revive\/.*/, '/api/revive/[session]'), failure: request.failure() }));
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ url: response.url().replace(/\/api\/revive\/.*/, '/api/revive/[session]'), status: response.status() }); });
  cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await page.goto(report.url);
  await page.waitForFunction(() => window.WxStackDiagnostics?.owner?.world3D?.getDiagnostics && window.WxStackRemote, null, { timeout: 20000 });
  await page.evaluate(async () => { window.__lifecycleCC = await window.System.import('cc'); window.__lifecycleAssetIds = new WeakMap(); window.__lifecycleAssetSequence = 0; });
  await settled('ready');
  report.environment = await page.evaluate(() => {
    const canvas = document.getElementById('GameCanvas'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { userAgent: navigator.userAgent, dpr: devicePixelRatio, framebuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) };
  });
  // Warm the exact paths before both equal-condition retained-heap samples.
  await pageCycle('warmup');
  await command('toggleTestMode');
  await restartCycle('warmup');
  const before = await sample('before-50-navigation-and-50-restarts');
  for (let i = 1; i <= 50; i++) { await pageCycle(i); if (i % 10 === 0) console.log(`navigation ${i}/50`); }
  const afterPages = await sample('after-50-navigation-cycles');
  for (let i = 1; i <= 50; i++) { await restartCycle(i); if (i % 10 === 0) console.log(`restarts ${i}/50`); }
  const after = await sample('after-50-navigation-and-50-restarts');
  for (const key of ['sceneNodes', 'sceneComponents', 'activeInputListeners', 'activeGameListeners', 'activeViewListeners', 'scheduler']) {
    check(`navigation retains ${key}`, afterPages.state[key], before.state[key]);
    check(`restart retains ${key}`, after.state[key], before.state[key]);
  }
  check('test restarts preserve stamina', after.state.stamina, before.state.stamina);
  report.heapDeltaBytes = after.heap.usedSize - before.heap.usedSize;
  report.heapDeltaPercent = report.heapDeltaBytes / before.heap.usedSize * 100;
  // Resize during the accepted transition must still commit its destination route.
  await command('onSettingsButton'); await page.setViewportSize({ width: 1280, height: 720 });
  await settled('ready', 'settings'); await command('closeHomeOverlay');
  await page.setViewportSize(report.viewport); await settled('ready');
  const resize = await state(); check('resize transition unlocks', [resize.routerTop, resize.routerDepth, resize.transitionLocked, resize.blocker], ['home', 0, false, false]);
  report.resize = resize;
  // Freeze and resume the actual moving block through Cocos enabled lifecycle callbacks.
  await command('startGame'); await settled('playing'); await page.waitForTimeout(150);
  const disabledStart = await page.evaluate(() => { const g = window.WxStackDiagnostics.owner; g.enabled = false; return { x: g.current.x, z: g.current.z }; });
  await page.waitForTimeout(400);
  const disabledEnd = await page.evaluate(() => { const g = window.WxStackDiagnostics.owner; return { x: g.current.x, z: g.current.z }; });
  const disabled = await state(); check('disabled stops moving block', disabledEnd, disabledStart);
  check('disabled stops physics and owned input', [disabled.physicsEnabled, disabled.activeInputListeners, disabled.scheduler.timers], [false, {}, 0]);
  await page.evaluate(() => { window.WxStackDiagnostics.owner.enabled = true; });
  await page.waitForTimeout(400);
  const enabled = await state();
  const resumedPosition = await page.evaluate(() => { const g = window.WxStackDiagnostics.owner; return { x: g.current.x, z: g.current.z }; });
  check('re-enable restores physics and listener count', [enabled.physicsEnabled, enabled.activeInputListeners, enabled.scheduler], [true, before.state.activeInputListeners, before.state.scheduler]);
  assert.notDeepEqual(resumedPosition, disabledEnd, 'moving block resumes after enabling');
  report.checks.push({ name: 'moving block resumes after enabling', pass: true });
  report.disableEnable = { disabledStart, disabledEnd, resumedPosition, disabled, enabled };
  await command('pauseGame'); await command('returnToHome'); await settled('ready');
  await command('toggleTestMode');
  // Natural miss: wait until the opening block has entered then moved beyond support.
  await command('startGame'); await settled('playing');
  await page.waitForFunction(() => {
    const g = window.WxStackDiagnostics.owner, block = g.current, top = g.stack[g.stack.length - 1];
    return block && !g.openingBlockEntering && Math.abs(block[g.moveAxis] - top[g.moveAxis]) > (block[g.moveAxis === 'x' ? 'width' : 'depth'] + top[g.moveAxis === 'x' ? 'width' : 'depth']) / 2 + 0.15;
  }, null, { timeout: 20000 });
  await command('placeCurrentBlock'); await settled('gameover');
  for (let i = 1; i <= 3; i++) {
    await command('openRevive');
    await page.waitForFunction(() => window.WxStackDiagnostics.owner.reviveController.state.status === 'waiting');
    const open = await state();
    check(`QR ${i} has owned frame`, Boolean(open.revive.frameId && open.revive.textureId), true);
    await page.waitForTimeout(1150);
    const polled = await state(); check(`QR ${i} polling reuses texture`, polled.revive.frameId, open.revive.frameId);
    await command('closeRevive'); await page.waitForTimeout(120);
    const closed = await state();
    check(`QR ${i} close releases ownership`, [closed.revive.frameId, closed.revive.textureId, closed.revive.imageFrameId, closed.revive.scheduled, closed.revive.polling, closed.routerTop], [null, null, null, false, false, 'result']);
    report.qrSessions.push({ open: open.revive, polled: polled.revive, closed: closed.revive });
  }
  // Closing during the asynchronous create request exercises generation cancellation.
  await page.evaluate(() => { const g = window.WxStackDiagnostics.owner; void g.openRevive(); g.closeRevive(); });
  await page.waitForTimeout(400);
  const cancelled = await state();
  check('late QR create cannot reopen closed modal', [cancelled.revive.visible, cancelled.revive.scheduled, cancelled.revive.frameId, cancelled.routerTop], [false, false, null, 'result']);
  await command('returnToHome'); await settled('ready');
  report.final = await sample('final-after-resize-disable-and-qr');
  report.completed = report.errors.length === 0 && report.failedRequests.length === 0;
  assert.equal(report.errors.length, 0, 'browser exceptions and console errors');
  assert.equal(report.failedRequests.length, 0, 'failed browser requests');
}
(async () => {
  try { await main(); }
  catch (error) { report.completed = false; report.failure = String(error.stack || error); console.error(error); process.exitCode = 1; }
  finally {
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'browser-lifecycle.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    console.log(JSON.stringify({ completed: report.completed, checks: report.checks.length, errors: report.errors.length, heapDeltaBytes: report.heapDeltaBytes }));
  }
})();
