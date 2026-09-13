/** Pure, centered design-space geometry shared by overlays, previews and HUD.
 * The caller passes the engine's visible size (reference height: 1334), not
 * physical display pixels. UI nodes, drawing, hit targets and focus use it alike.
 */
export type ProjectorPanelKind = 'settings' | 'leaderboard' | 'pause' | 'result';

export interface ProjectorPanelGeometry {
  split: boolean;
  panelX: number;
  panelWidth: number;
  panelHeight: number;
  contentWidth: number;
  buttonWidth: number;
  buttonHeight: number;
  titleY: number;
  titleSize: number;
  subtitleY: number;
  bodyFont: number;
  captionFont: number;
  footerY: number;
  buttonYs: number[];
  rowYs: number[];
  rowHeight: number;
  rowWidth: number;
  listTop: number;
  listHeight: number;
  rowGap: number;
  scoreX: number;
  scoreWidth: number;
  rankX: number;
  rankWidth: number;
  detailX: number;
  detailWidth: number;
  headerY: number;
  pageY: number;
  scoreY: number;
  scoreSize: number;
  bestY: number;
  rewardY: number;
}

function frame(width: number, height: number) {
  const split = width / height >= 1.2;
  const focusWidth = Math.min(width, 2400);
  const safe = split ? Math.max(64, focusWidth * 0.04) : 28;
  return { split, focusWidth, safe };
}

export function projectorPanelLayout(
  width: number,
  height: number,
  kind: ProjectorPanelKind,
): ProjectorPanelGeometry {
  const { split, focusWidth, safe } = frame(width, height);
  const leaderboard = kind === 'leaderboard';
  const panelWidth = split
    ? (leaderboard ? width * 0.5 : Math.min(820, (focusWidth - safe * 2) * 0.42))
    : Math.min(640, width - safe * 2);
  const referenceHeight = leaderboard ? 1200 : 1100;
  const panelHeight = Math.min(referenceHeight, height - 128);
  const scale = panelHeight / referenceHeight;
  const contentWidth = panelWidth - (leaderboard ? (split ? 96 : 56) : (split ? 128 : 80));
  const buttonWidth = Math.min(640, contentWidth);
  const buttonYs = leaderboard ? []
    : kind === 'settings' ? [120, -14, -148, -282, -416]
    : kind === 'pause' ? [60, -116, -292]
    : [-224, -386];
  const rowWidth = leaderboard ? contentWidth - 20 : buttonWidth;
  const rowPadding = 20;
  const rankWidth = split ? 80 : 72;
  const columnGap = 24;
  const scoreWidth = split ? 180 : 112;
  const detailWidth = rowWidth - rowPadding * 2 - rankWidth - columnGap - (leaderboard ? scoreWidth + 16 : 0);
  const detailLeft = -rowWidth / 2 + rowPadding + rankWidth + columnGap;

  return {
    split,
    panelX: split && !leaderboard ? -focusWidth / 2 + safe + panelWidth / 2 : 0,
    panelWidth,
    panelHeight,
    contentWidth,
    buttonWidth,
    buttonHeight: (leaderboard ? 68 : kind === 'settings' ? 104 : 116) * scale,
    titleY: (leaderboard ? 476 : 350) * scale,
    titleSize: Math.min(split ? 88 : 64, contentWidth / 5) * scale,
    subtitleY: (leaderboard ? 384 : 250) * scale,
    bodyFont: (split ? 42 : 36) * scale,
    captionFont: (split ? 26 : 24) * scale,
    footerY: (leaderboard ? -538 : kind === 'pause' ? -475 : kind === 'result' ? -506 : -512) * scale,
    buttonYs: buttonYs.map(y => y * scale),
    rowYs: leaderboard ? Array.from({ length: 10 }, (_, i) => -(72 + i * 160) * scale) : [],
    rowHeight: leaderboard ? 144 * scale : 0,
    rowWidth,
    listTop: 284 * scale,
    listHeight: 768 * scale,
    rowGap: 16 * scale,
    scoreX: rowWidth / 2 - rowPadding - scoreWidth / 2,
    scoreWidth,
    rankX: -rowWidth / 2 + rowPadding + rankWidth / 2,
    rankWidth,
    detailX: detailLeft + detailWidth / 2,
    detailWidth,
    headerY: (leaderboard ? 320 : 288) * scale,
    pageY: -289 * scale,
    scoreY: 144 * scale,
    scoreSize: 144 * scale,
    bestY: 8 * scale,
    rewardY: -92 * scale,
  };
}

export interface ProjectorLeaderboardPreviewGeometry {
  panelX: number;
  panelY: number;
  panelWidth: number;
  panelHeight: number;
  titleY: number;
  titleSize: number;
  scoreSize: number;
  captionSize: number;
  rowYs: number[];
  hintY: number;
}

/** Home leaderboard teaser: Top 3 on wide screens, one compact score on phones.
 * Label offsets are relative to the preview center. Portrait omits the hint.
 */
export function projectorLeaderboardPreviewLayout(
  width: number,
  height: number,
): ProjectorLeaderboardPreviewGeometry {
  const { split, focusWidth, safe } = frame(width, height);
  const panelWidth = split ? 360 : Math.min(320, width * 0.46);
  const panelHeight = split ? 400 : 80;
  return {
    panelX: focusWidth / 2 - safe - panelWidth / 2,
    panelY: height / 2 - safe - panelHeight / 2,
    panelWidth,
    panelHeight,
    titleY: split ? 144 : 18,
    titleSize: split ? 34 : 24,
    scoreSize: split ? 36 : 24,
    captionSize: split ? 24 : 22,
    rowYs: split ? [72, 0, -72] : [-16],
    hintY: split ? -155 : -28,
  };
}

export interface ProjectorHudGeometry {
  edgeInset: number;
  top: number;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  pauseWidth: number;
  pauseHeight: number;
  captionSize: number;
  valueSize: number;
  recordGapTop: number;
  recordGapWidth: number;
  recordGapHeight: number;
}

export function projectorHudLayout(width: number, height: number): ProjectorHudGeometry {
  const { split, focusWidth, safe } = frame(width, height);
  const top = 64;
  const cardWidth = split ? 260 : Math.min(220, (width - 56 - 136 - 32) / 2);
  const cardHeight = split ? 144 : 124;
  const gap = split ? 24 : 16;
  return {
    // On ultrawide displays keep the HUD within the same centered attention
    // area as the menus, while still expressing the result as an edge inset.
    edgeInset: split ? (width - focusWidth) / 2 + safe : safe,
    top,
    cardWidth,
    cardHeight,
    gap,
    pauseWidth: split ? 200 : 136,
    pauseHeight: split ? 96 : 92,
    captionSize: split ? 30 : 25,
    valueSize: split ? 68 : 54,
    recordGapTop: top + cardHeight + 20,
    recordGapWidth: cardWidth * 2 + gap,
    recordGapHeight: 44,
  };
}
