// Deterministic geometry contracts; physical projector/WebView QA is separate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/ProjectorLayout.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
} }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);
const { projectorPanelLayout, projectorHudLayout } = sandbox.exports;
const displays = [[1920, 1080], [1280, 720], [1024, 768], [390, 844], [3840, 2160], [2560, 1080]];
const kinds = ['settings', 'leaderboard', 'pause', 'result'];
const viewSize = (width, height) => [width / height * 1334, 1334];
const focusHalf = size => size * 1.018 / 2 + 8 + 2;

for (const [pixelWidth, pixelHeight] of displays) {
  const [width, height] = viewSize(pixelWidth, pixelHeight);
  for (const kind of kinds) {
    test(`${kind} ${pixelWidth}x${pixelHeight}: panel, typography and all focus targets fit safely`, () => {
      const p = projectorPanelLayout(width, height, kind);
      const split = width / height >= 1.2;
      assert.equal(p.split, split);
      assert.ok(p.panelX - p.panelWidth / 2 >= -width / 2 + 28);
      assert.ok(p.panelX + p.panelWidth / 2 <= width / 2 - 28);
      assert.ok(p.panelHeight <= height - 128);
      assert.ok(p.contentWidth > 0 && p.contentWidth < p.panelWidth);
      assert.ok(p.titleSize >= 64, 'large title stays readable at the reference scale');
      assert.ok(p.titleSize * 5 <= p.contentWidth, 'a five-character title fits its text column');
      assert.ok(p.titleY + p.titleSize * 0.65 <= p.panelHeight / 2 - 16);
      assert.ok(p.titleY - p.titleSize * 0.65 > p.subtitleY + p.captionFont * 0.65);
      assert.ok(focusHalf(p.buttonWidth) <= p.panelWidth / 2 - 16);
      assert.equal(p.buttonYs.length, kind === 'settings' ? 4 : kind === 'result' ? 2 : 3);
      const half = focusHalf(p.buttonHeight);
      p.buttonYs.forEach((y, index) => {
        assert.ok(y + half <= p.panelHeight / 2 - 16, `button ${index} top is safe`);
        assert.ok(y - half >= -p.panelHeight / 2 + 16, `button ${index} bottom is safe`);
        if (index) assert.ok(p.buttonYs[index - 1] - half > y + half, 'focused buttons cannot overlap');
      });
      if (kind !== 'leaderboard') {
        assert.ok(p.footerY - p.captionFont * 0.65 >= -p.panelHeight / 2 + 16);
        assert.ok(p.buttonYs[p.buttonYs.length - 1] - half > p.footerY + p.captionFont * 0.65,
          'footer does not touch the final focus outline');
      }
      if (kind === 'result') {
        const scoreHalf = p.scoreSize * 1.25 / 2;
        assert.ok(p.titleY - p.titleSize * 0.65 > p.scoreY + scoreHalf, 'result title clears the large score');
        assert.ok(p.scoreY - scoreHalf > p.bestY + 27, 'score clears the highest-score caption');
        assert.ok(p.bestY - 27 > p.rewardY + 26, 'record and rewards stay separate');
        assert.ok(p.rewardY - 26 > p.buttonYs[0] + half, 'rewards clear restart focus');
      }
      if (split) assert.ok(p.panelX < 0, 'landscape leaves room for the tower');
      else assert.equal(p.panelX, 0, 'portrait column stays centered');
    });
  }

  test(`leaderboard ${pixelWidth}x${pixelHeight}: five rows, columns and pagination do not collide`, () => {
    const p = projectorPanelLayout(width, height, 'leaderboard');
    assert.equal(p.rowYs.length, 5);
    assert.ok(p.headerY - p.captionFont * 0.65 > p.rowYs[0] + p.rowHeight / 2);
    p.rowYs.forEach((y, index) => {
      if (index) assert.ok(p.rowYs[index - 1] - p.rowHeight / 2 >= y + p.rowHeight / 2 + 8);
    });
    assert.ok(p.rankX - p.rankWidth / 2 >= -p.rowWidth / 2 + 16);
    assert.ok(p.rankX + p.rankWidth / 2 + 20 <= p.detailX - p.detailWidth / 2);
    assert.ok(p.detailX + p.detailWidth / 2 <= p.rowWidth / 2 - 16);
    assert.ok(p.detailWidth >= 320, 'detail column keeps enough width for one-row score and metadata');
    assert.ok(p.rowYs[4] - p.rowHeight / 2 > p.pageY + p.captionFont * 0.65);
    assert.ok(p.pageY - p.captionFont * 0.65 > p.buttonYs[0] + focusHalf(p.buttonHeight));
  });

  test(`HUD ${pixelWidth}x${pixelHeight}: two stat cards and pause fit inside overscan safe area`, () => {
    const h = projectorHudLayout(width, height);
    assert.ok(h.edgeInset >= 28);
    assert.ok(h.top >= 48);
    assert.ok(h.cardWidth > 160);
    assert.ok(h.cardHeight >= 124);
    assert.ok(h.cardWidth * 2 + h.gap * 2 + h.pauseWidth <= width - h.edgeInset * 2 + 0.001);
    assert.ok(h.captionSize >= 25 && h.valueSize >= 54);
    assert.ok(h.captionSize * 4 <= h.cardWidth - 24, 'four-character captions fit stat cards');
    assert.ok(h.pauseHeight >= 92);
    assert.ok(h.top + h.cardHeight < height / 3, 'HUD leaves the play area clear');
  });
}

test('720p, 1080p and 4K use the same reference-space menu and HUD geometry', () => {
  for (const kind of kinds) {
    const expected = JSON.stringify(projectorPanelLayout(...viewSize(1920, 1080), kind));
    assert.equal(JSON.stringify(projectorPanelLayout(...viewSize(1280, 720), kind)), expected);
    assert.equal(JSON.stringify(projectorPanelLayout(...viewSize(3840, 2160), kind)), expected);
  }
  const expected = JSON.stringify(projectorHudLayout(...viewSize(1920, 1080)));
  assert.equal(JSON.stringify(projectorHudLayout(...viewSize(1280, 720))), expected);
  assert.equal(JSON.stringify(projectorHudLayout(...viewSize(3840, 2160))), expected);
});
