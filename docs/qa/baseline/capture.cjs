const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('/Users/wxkang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = '/Users/wxkang/workspace/WxStack/docs/qa/baseline';
const url = 'http://127.0.0.1:7467/';
const manifest = { kind: 'real-browser-before-refactor-screenshots', capturedAt: new Date().toISOString(),
  project: '/private/tmp/wxstack-ui-baseline-project', source: '/private/tmp/wxstack-ui-refactor-baseline',
  url, creator: '3.8.8', build: 'web-mobile debug=true', deviceScaleFactor: 1,
  profile: 'Separate Chrome process with a temporary Playwright profile and fresh browser context per viewport',
  launchArgs: ['--enable-webgl', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  captures: [], logs: [], errors: [], notes: ['Screenshots are rendered by Chrome, not an offline Cocos stub.',
    'No project source has been changed. Navigation invokes existing methods; zero-score failure uses real keyboard release beyond the support footprint.',
    'These screenshots do not constitute Android, projection-device or release-performance acceptance.'] };
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: manifest.launchArgs });
  manifest.browserVersion = browser.version();
  async function session(width, height) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', message => manifest.logs.push({ viewport: `${width}x${height}`, type: message.type(), text: message.text() }));
    page.on('pageerror', error => manifest.errors.push({ viewport: `${width}x${height}`, message: error.message, stack: error.stack }));
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => { const g = window.cc?.director?.getScene()?.getChildByName('Canvas')?.getComponent('StackGame');
      return document.body.classList.contains('game-ready') && g?.audioReady && g?.phase === 'ready'; }, { timeout: 30000 });
    await page.waitForTimeout(500);
    return { context, page, width, height };
  }
  async function command(page, name, ...args) {
    return page.evaluate(({ name, args }) => window.cc.director.getScene().getChildByName('Canvas').getComponent('StackGame')[name](...args), { name, args });
  }
  async function settled(page) {
    await page.waitForFunction(() => !window.cc.director.getScene().getChildByName('Canvas').getComponent('StackGame').homeTransition);
    await page.waitForTimeout(350);
  }
  async function capture(s, screen) {
    const name = `${s.width}x${s.height}-${screen}.png`;
    const state = await s.page.evaluate(() => {
      const g = window.cc.director.getScene().getChildByName('Canvas').getComponent('StackGame');
      const canvas = document.getElementById('GameCanvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { phase: g.phase, overlay: g.homeOverlay, score: g.score, coins: g.coins, bestScore: g.bestScore,
        nickname: g.playerNickname, stamina: g.stamina?.snapshot().amount, reducedMotion: g.reducedMotion,
        framebuffer: { width: canvas.width, height: canvas.height },
        renderer: gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null };
    });
    await s.page.screenshot({ path: path.join(output, name), animations: 'disabled' });
    manifest.captures.push({ file: name, viewport: { width: s.width, height: s.height }, state });
    fs.writeFileSync(path.join(output, 'browser-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log('Captured', name, JSON.stringify(state));
  }
  try {
    const wide = await session(1920, 1080);
    await capture(wide, 'home');
    await command(wide.page, 'openHomeOverlay', 'settings'); await settled(wide.page);
    await capture(wide, 'settings');
    await command(wide.page, 'openNicknameEditor'); await wide.page.waitForTimeout(350);
    await capture(wide, 'nickname');
    await command(wide.page, 'closeNicknameEditor');
    await command(wide.page, 'closeHomeOverlay'); await settled(wide.page);
    await command(wide.page, 'openHomeOverlay', 'leaderboard'); await settled(wide.page);
    await capture(wide, 'leaderboard-empty');
    await command(wide.page, 'closeHomeOverlay'); await settled(wide.page);
    await command(wide.page, 'startGame'); await settled(wide.page);
    await wide.page.waitForFunction(() => window.cc.director.getScene().getChildByName('Canvas').getComponent('StackGame').phase === 'playing');
    await capture(wide, 'gameplay');
    await command(wide.page, 'pauseGame'); await wide.page.waitForTimeout(350);
    await capture(wide, 'pause');
    await command(wide.page, 'resumeGame');
    await wide.page.waitForFunction(() => {
      const g = window.cc.director.getScene().getChildByName('Canvas').getComponent('StackGame');
      const b = g.current; const p = g.stack[g.stack.length - 1];
      if (g.phase !== 'playing' || g.openingBlockEntering || !b || !p) return false;
      const size = g.moveAxis === 'x' ? 'width' : 'depth';
      return Math.abs(b[g.moveAxis] - p[g.moveAxis]) > (b[size] + p[size]) / 2 + 0.2;
    }, { timeout: 20000 });
    await wide.page.keyboard.press('Space');
    await wide.page.waitForFunction(() => window.cc.director.getScene().getChildByName('Canvas').getComponent('StackGame').phase === 'gameover', { timeout: 15000 });
    await wide.page.waitForTimeout(500);
    await capture(wide, 'result-zero');
    await wide.context.close();
    const narrow = await session(390, 844);
    await capture(narrow, 'home');
    await command(narrow.page, 'openHomeOverlay', 'settings'); await settled(narrow.page);
    await capture(narrow, 'settings');
    await command(narrow.page, 'closeHomeOverlay'); await settled(narrow.page);
    await command(narrow.page, 'openHomeOverlay', 'leaderboard'); await settled(narrow.page);
    await capture(narrow, 'leaderboard-empty');
    await narrow.context.close();
  } finally {
    fs.writeFileSync(path.join(output, 'browser-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
