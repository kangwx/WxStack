/** Pure, centered design-space geometry shared by the non-home screens.
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
  const panelWidth = split
    ? Math.min(820, (focusWidth - safe * 2) * 0.42)
    : Math.min(640, width - safe * 2);
  const leaderboard = kind === 'leaderboard';
  const referenceHeight = leaderboard ? 1180 : 1100;
  const panelHeight = Math.min(referenceHeight, height - 128);
  const scale = panelHeight / referenceHeight;
  const contentWidth = panelWidth - (split ? 128 : 80);
  const buttonWidth = Math.min(640, contentWidth);
  const buttonYs = leaderboard ? [-332, -428, -524]
    : kind === 'settings' ? [100, -62, -224, -416]
    : kind === 'pause' ? [60, -116, -292]
    : [-224, -386];
  const rowWidth = buttonWidth;
  const rowPadding = 20;
  const rankWidth = split ? 80 : 72;
  const columnGap = 24;
  const detailWidth = rowWidth - rowPadding * 2 - rankWidth - columnGap;
  const detailLeft = -rowWidth / 2 + rowPadding + rankWidth + columnGap;

  return {
    split,
    panelX: split ? -focusWidth / 2 + safe + panelWidth / 2 : 0,
    panelWidth,
    panelHeight,
    contentWidth,
    buttonWidth,
    buttonHeight: (leaderboard ? 74 : 116) * scale,
    titleY: (leaderboard ? 446 : 350) * scale,
    titleSize: Math.min(split ? 88 : 64, contentWidth / 5) * scale,
    subtitleY: (leaderboard ? 359 : 250) * scale,
    bodyFont: (split ? 42 : 36) * scale,
    captionFont: (split ? 26 : 24) * scale,
    footerY: (leaderboard ? -260 : kind === 'pause' ? -475 : kind === 'result' ? -506 : -512) * scale,
    buttonYs: buttonYs.map(y => y * scale),
    rowYs: leaderboard ? [215, 115, 15, -85, -185].map(y => y * scale) : [],
    rowHeight: leaderboard ? 88 * scale : 0,
    rowWidth,
    rankX: -rowWidth / 2 + rowPadding + rankWidth / 2,
    rankWidth,
    detailX: detailLeft + detailWidth / 2,
    detailWidth,
    headerY: 288 * scale,
    pageY: -260 * scale,
    scoreY: 144 * scale,
    scoreSize: 144 * scale,
    bestY: 8 * scale,
    rewardY: -92 * scale,
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
}

export function projectorHudLayout(width: number, height: number): ProjectorHudGeometry {
  const { split, focusWidth, safe } = frame(width, height);
  return {
    // On ultrawide displays keep the HUD within the same centered attention
    // area as the menus, while still expressing the result as an edge inset.
    edgeInset: split ? (width - focusWidth) / 2 + safe : safe,
    top: 64,
    cardWidth: split ? 260 : Math.min(220, (width - 56 - 136 - 32) / 2),
    cardHeight: split ? 144 : 124,
    gap: split ? 24 : 16,
    pauseWidth: split ? 200 : 136,
    pauseHeight: split ? 96 : 92,
    captionSize: split ? 30 : 25,
    valueSize: split ? 68 : 54,
  };
}
