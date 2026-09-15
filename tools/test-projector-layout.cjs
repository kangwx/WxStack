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
const { projectorPanelLayout, projectorHudLayout, projectorLeaderboardPreviewLayout } = sandbox.exports;
const displays = [[1920, 1080], [1280, 720], [1024, 768], [390, 844], [3840, 2160], [2560, 1080]];
const kinds = ['settings', 'leaderboard', 'pause', 'result'];
const viewSize = (width, height) => [width / height * 1334, 1334];
const focusHalf = size => size * 1.018 / 2 + 8 + 2;

function assertRecordGapGeometry(width, height) {
  const h = projectorHudLayout(width, height);
  assert.equal(h.recordGapTop, h.top + h.cardHeight + 20, 'record hint clears both stat cards');
  assert.equal(h.recordGapWidth, h.cardWidth * 2 + h.gap, 'record hint spans the two stat cards');
  assert.equal(h.recordGapHeight, 44);
  assert.ok(h.edgeInset + h.recordGapWidth <= width - h.edgeInset, 'record hint stays inside horizontal safe edges');
  assert.ok(h.recordGapTop + h.recordGapHeight < height / 3, 'record hint leaves the play area clear');
  assert.ok(h.recordGapWidth - 24 > 0, 'text retains padding inside its panel');
  assert.ok(h.captionSize * 1.2 <= h.recordGapHeight - 8, 'one line of caption text fits vertically');
}

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
      if (kind !== 'leaderboard') assert.ok(focusHalf(p.buttonWidth) <= p.panelWidth / 2 - 16);
      assert.equal(p.buttonYs.length, kind === 'leaderboard' ? 0 : kind === 'settings' ? 7 : 3);
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
      if (kind === 'leaderboard') {
        assert.equal(p.panelX, 0, 'expanded leaderboard is centered');
        if (split) assert.equal(p.panelWidth, width / 2, 'expanded leaderboard uses half the visible width, including ultrawide');
      } else if (split) assert.ok(p.panelX < 0, 'landscape leaves room for the tower');
      else assert.equal(p.panelX, 0, 'portrait column stays centered');
    });
  }

  test(`leaderboard ${pixelWidth}x${pixelHeight}: continuous list, fixed header and score columns do not collide`, () => {
    const p = projectorPanelLayout(width, height, 'leaderboard');
    assert.equal(p.rowYs.length, 10);
    assert.equal(p.rowHeight, 144);
    assert.ok(p.headerY - p.captionFont * 0.65 > p.listTop);
    assert.equal(p.rowYs[0] + p.rowHeight / 2, 0, 'content starts flush with the viewport top');
    p.rowYs.forEach((y, index) => {
      if (index) assert.equal(p.rowYs[index - 1] - y, 160);
      if (index) assert.ok(p.rowYs[index - 1] - p.rowHeight / 2 >= y + p.rowHeight / 2 + 8);
    });
    assert.ok(p.rankX - p.rankWidth / 2 >= -p.rowWidth / 2 + 16);
    assert.ok(p.rankX + p.rankWidth / 2 + 20 <= p.detailX - p.detailWidth / 2);
    assert.ok(p.detailX + p.detailWidth / 2 <= p.rowWidth / 2 - 16);
    assert.ok(p.detailWidth >= 180, 'name and rank keep a readable column on phones');
    assert.ok(p.detailX + p.detailWidth / 2 + 16 <= p.scoreX - p.scoreWidth / 2);
    assert.ok(p.listTop - p.listHeight > p.footerY + 22);
    assert.ok(p.footerY - 22 > -p.panelHeight / 2 + 16);
    assert.ok(p.listHeight > p.rowHeight * 4 && p.listHeight < p.rowHeight * 10, 'list reveals more than four rows and scrolls to the rest');
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
    assertRecordGapGeometry(width, height);
  });
}

for (const [pixelWidth, pixelHeight] of [...displays, [320, 568], [360, 800]]) {
  test(`leaderboard preview ${pixelWidth}x${pixelHeight}: safe, readable, and clear of the home panel`, () => {
    const [width, height] = viewSize(pixelWidth, pixelHeight);
    const p = projectorLeaderboardPreviewLayout(width, height);
    const split = width / height >= 1.2;
    // Settings and home share the same exterior geometry; controller tests
    // verify that contract without duplicating the home layout implementation.
    const home = projectorPanelLayout(width, height, 'settings');
    const left = p.panelX - p.panelWidth / 2;
    const right = p.panelX + p.panelWidth / 2;
    const top = p.panelY + p.panelHeight / 2;
    const bottom = p.panelY - p.panelHeight / 2;
    assert.ok(left >= -width / 2 + 28);
    assert.ok(right <= width / 2 - 28);
    assert.ok(top <= height / 2 - 28);
    assert.ok(bottom >= -height / 2 + 28);
    assert.ok(p.panelX > 0, 'preview stays on the right');
    assert.ok(p.titleSize * 6 <= p.panelWidth - 32, 'short preview title fits at the intended size');
    const titleHalf = p.titleSize * 1.2 / 2;
    const scoreHalf = p.scoreSize * 1.2 / 2;
    assert.ok(p.titleY + titleHalf <= p.panelHeight / 2 - 4);
    assert.ok(p.titleY - titleHalf > p.rowYs[0] + scoreHalf, 'title clears the first score');
    p.rowYs.forEach((y, index) => {
      assert.ok(y + scoreHalf <= p.panelHeight / 2 - 4);
      assert.ok(y - scoreHalf >= -p.panelHeight / 2 + 4);
      if (index) assert.ok(p.rowYs[index - 1] - scoreHalf > y + scoreHalf, 'preview scores remain separate');
    });
    if (split) {
      assert.equal(p.rowYs.length, 3, 'wide preview shows the local Top 3');
      assert.equal(p.panelWidth, 440);
      assert.equal(p.panelHeight, 500);
      assert.ok(left >= home.panelX + home.panelWidth / 2 + 24, 'preview clears the home panel even at 4:3');
      const hintHalf = p.captionSize * 1.2 / 2;
      assert.ok(p.rowYs.at(-1) - scoreHalf > p.hintY + hintHalf, 'hint clears the last score');
      assert.ok(p.hintY - hintHalf >= -p.panelHeight / 2 + 12);
    } else {
      assert.equal(p.rowYs.length, 1, 'phone preview shows only the highest score');
      assert.equal(p.panelHeight, 80);
      assert.ok(p.panelWidth <= 320);
      assert.ok(bottom >= home.panelHeight / 2 + 4, 'compact preview sits above, not over, the home panel');
    }
  });
}

for (const [pixelWidth, pixelHeight] of [[320, 568], [360, 800]]) {
  test(`HUD ${pixelWidth}x${pixelHeight}: record hint remains below the cards and clear of the play area`, () => {
    assertRecordGapGeometry(...viewSize(pixelWidth, pixelHeight));
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
  const preview = JSON.stringify(projectorLeaderboardPreviewLayout(...viewSize(1920, 1080)));
  assert.equal(JSON.stringify(projectorLeaderboardPreviewLayout(...viewSize(1280, 720))), preview);
  assert.equal(JSON.stringify(projectorLeaderboardPreviewLayout(...viewSize(3840, 2160))), preview);
});
