import { Color, Label, Sprite, UITransform } from 'cc';
import { CREAM_STYLE, RGB } from '../CreamStyle';
import type { projectorHudLayout, projectorPanelLayout } from '../ProjectorLayout';
import type { StackUIButtonBinding, StackUIViewBindings } from '../StackUIViewBindings';
import type { StackUIVisual } from './StackUIVisual';

export interface StackUIRenderContext {
  readonly reducedMotion: boolean;
  readonly visibleWidth: number;
  readonly visibleHeight: number;
  readonly tvLayout: boolean;
}
export interface UIPanelGeometry {
  readonly panelX: number;
  readonly panelWidth: number;
  readonly panelHeight: number;
}
export interface StackUIGeometry {
  home(): Readonly<UIPanelGeometry>;
  panel(kind: 'settings' | 'leaderboard' | 'pause' | 'result'): Readonly<ReturnType<typeof projectorPanelLayout>>;
  hud(): Readonly<ReturnType<typeof projectorHudLayout>>;
  panelCenterX(width: number): number;
}
export interface UIScrollbarState {
  readonly maxOffset: number;
  readonly offset: number;
  readonly loading: boolean;
}
export interface UILeaderboardRowStyle {
  readonly width: number;
  readonly height: number;
  readonly currentRound: boolean;
  readonly rank: number;
  readonly avatarTier: number;
  readonly avatarX: number;
}

/** Pure presentation over existing Inspector bindings; no gameplay or service access. */
export class StackUIRenderer {
  constructor(
    private readonly ui: StackUIViewBindings,
    private readonly geometry: StackUIGeometry,
    private readonly context: () => Readonly<StackUIRenderContext>,
  ) {}

  renderButton(visual: StackUIVisual, label: Label, width: number, height: number, selected = false): void {
    const style = CREAM_STYLE;
    visual.reset();
    visual.box(width, height, 28, this.rgb(selected ? style.accentColor : style.buttonColor),
      this.rgb(style.accentColor, selected ? 255 : 126), selected ? 4 : 2);
    visual.setFocus(width, height, selected, this.textOnButton(style.panelColor), this.textOnButton(style.accentColor));
    label.color = this.textOnButton(selected ? style.accentColor : style.buttonColor);
    const scale = selected && !this.context().reducedMotion ? 1.018 : 1;
    if (visual.node.scale.x !== scale) visual.node.setScale(scale, scale, 1);
  }

  renderOverlayButton(button: StackUIButtonBinding, width: number, height: number, selected: boolean): void {
    button.node.getComponent(UITransform)!.setContentSize(width, height);
    this.renderButton(button.graphics, button.label, width, height, selected);
  }

  renderSettingToggle(button: StackUIButtonBinding, stateLabel: Label, caption: string,
    enabled: boolean, selected: boolean): void {
    const layout = this.geometry.panel('settings');
    this.renderOverlayButton(button, layout.buttonWidth, layout.buttonHeight, selected);
    button.label.string = caption;
    button.label.horizontalAlign = Label.HorizontalAlign.LEFT;
    button.label.node.setPosition(-36, 0, 0);
    button.label.node.getComponent(UITransform)!.setContentSize(layout.buttonWidth - 200, layout.buttonHeight - 12);
    stateLabel.string = enabled ? '开' : '关';
    stateLabel.fontSize = layout.split ? 32 : 28;
    stateLabel.lineHeight = Math.round(stateLabel.fontSize * 1.2);
    stateLabel.isBold = true;
    stateLabel.node.setPosition(layout.buttonWidth / 2 - 68, 0, 0);
    stateLabel.color = button.label.color;
    const color = button.label.color;
    const visual = button.graphics;
    visual.detail.type = visual.innerBorder.type = Sprite.Type.SLICED;
    visual.detail.spriteFrame = visual.fillFrames[2];
    visual.innerBorder.spriteFrame = visual.borderFrames[2];
    visual.setLayer(visual.detail, 72, 56, layout.buttonWidth / 2 - 68, 0,
      new Color(color.r, color.g, color.b, enabled ? 26 : 12));
    visual.setLayer(visual.innerBorder, 74, 58, layout.buttonWidth / 2 - 68, 0,
      new Color(color.r, color.g, color.b, 110));
  }

  renderPanel(visual: StackUIVisual, layout: Readonly<UIPanelGeometry>): void {
    const { panelX: x, panelWidth: width, panelHeight: height } = layout;
    visual.reset();
    visual.setShadow(width, height, 44, x + 8, -10, this.rgb(CREAM_STYLE.shadow, 24));
    visual.box(width, height, 44, this.rgb(CREAM_STYLE.panelColor), this.rgb(CREAM_STYLE.accentColor, 96), 2, x);
    visual.setLayer(visual.accent, 56, 5, x, height / 2 - 41.5, this.rgb(CREAM_STYLE.accentColor));
  }

  renderBackdrop(visual: StackUIVisual, panelWidth: number, panelHeight: number): void {
    const context = this.context();
    const width = Math.min(panelWidth, context.visibleWidth - (context.tvLayout ? 128 : 48));
    visual.reset();
    visual.box(width, panelHeight, 42, this.rgb(CREAM_STYLE.panelColor),
      this.rgb(CREAM_STYLE.accentColor, 130), 2, this.geometry.panelCenterX(panelWidth));
  }

  renderRevivePanel(width: number, height: number): void {
    const context = this.context();
    const visual = this.ui.reviveVisual;
    visual.reset();
    visual.setShadow(context.visibleWidth, context.visibleHeight, 12, 0, 0, new Color(83, 67, 78, 64));
    visual.box(width, height, 40, this.rgb(CREAM_STYLE.panelColor));
  }

  renderOverlay(phase: string, homeOverlay: string): void {
    const ui = this.ui;
    ui.homePanelGraphics.reset();
    ui.pausePanelGraphics.reset();
    ui.resultPanelGraphics.reset();
    if (phase === 'ready' && homeOverlay === 'none') this.renderPanel(ui.homePanelGraphics, this.geometry.home());
    else if (phase === 'paused') this.renderPanel(ui.pausePanelGraphics, this.geometry.panel('pause'));
    else if (phase === 'gameover') this.renderPanel(ui.resultPanelGraphics, this.geometry.panel('result'));
  }

  renderHudCards(): void {
    const layout = this.geometry.hud();
    const ui = this.ui;
    const text = this.rgb(CREAM_STYLE.textColor);
    for (const visual of [ui.scoreHudGraphics, ui.bestHudGraphics]) {
      visual.reset();
      visual.box(layout.cardWidth, layout.cardHeight, 24, this.rgb(CREAM_STYLE.panelColor), this.rgb(CREAM_STYLE.accentColor, 112));
    }
    ui.scoreCaptionLabel.color = ui.bestCaptionLabel.color = new Color(text.r, text.g, text.b, 225);
    ui.scoreLabel.color = ui.bestLabel.color = text;
    ui.recordGapGraphics.reset();
    ui.recordGapGraphics.box(layout.recordGapWidth, layout.recordGapHeight, 12, this.rgb(CREAM_STYLE.panelColor));
    ui.recordGapLabel.color = text;
    this.renderPauseButton();
  }

  renderPauseButton(): void {
    const layout = this.geometry.hud();
    const visual = this.ui.pauseButtonGraphics;
    visual.reset();
    visual.box(layout.pauseWidth, layout.pauseHeight, 28, this.rgb(CREAM_STYLE.buttonColor), this.rgb(CREAM_STYLE.accentColor, 118));
  }

  renderPauseMenuButton(button: StackUIButtonBinding, selected: boolean): void {
    const layout = this.geometry.panel('pause');
    this.renderOverlayButton(button, layout.buttonWidth, layout.buttonHeight, selected);
  }

  renderLeaderboardPanel(): void {
    const layout = this.geometry.panel('leaderboard');
    const visual = this.ui.leaderboardGraphics;
    const width = layout.panelWidth;
    const height = layout.panelHeight;
    visual.reset();
    visual.setLayeredShadow(width, height);
    visual.box(width, height, 44, this.rgb(CREAM_STYLE.panelColor), new Color(255, 255, 245, 220));
    visual.detail.type = visual.innerBorder.type = Sprite.Type.SLICED;
    visual.innerBorder.spriteFrame = visual.borderFrames[8];
    visual.setLayer(visual.innerBorder, width - 10, height - 10, 0, 0, new Color(174, 234, 220, 30));
    visual.detail.spriteFrame = visual.fillFrames[5];
    visual.setLayer(visual.detail, layout.contentWidth + 12, layout.listHeight + 80,
      0, layout.listTop - layout.listHeight / 2 + 36, new Color(221, 198, 170, 18));
  }

  renderLeaderboardRow(visual: StackUIVisual, state: Readonly<UILeaderboardRowStyle>): void {
    visual.reset();
    visual.gradientBox(state.width, state.height, state.currentRound,
      state.currentRound ? new Color(87, 126, 113) : new Color(169, 139, 133, 75), state.currentRound ? 3 : 1);
    this.renderRankAvatar(visual, state.avatarX, 5, 40, state.avatarTier);
    this.renderRankBadge(visual, state.avatarX + 26, -28, 18, state.rank);
  }

  renderRankAvatar(visual: StackUIVisual, x: number, y: number, radius: number, tier: number): void {
    visual.setAvatar(tier, x, y, radius);
  }

  renderRankBadge(visual: StackUIVisual, x: number, y: number, radius: number, rank: number): void {
    const color = [[245, 201, 105], [203, 221, 230], [220, 165, 126]][rank] ?? [241, 231, 215];
    visual.setBadge(x, y, radius, new Color(color[0], color[1], color[2]));
  }

  renderScrollbar(state: Readonly<UIScrollbarState>): void {
    const layout = this.geometry.panel('leaderboard');
    const visual = this.ui.leaderboardScrollTrack;
    visual.reset();
    if (state.maxOffset <= 0 || state.loading) return;
    const height = Math.max(48, layout.listHeight * layout.listHeight / (state.maxOffset + layout.listHeight));
    const progress = Math.max(0, Math.min(1, state.offset / state.maxOffset));
    const x = layout.contentWidth / 2 - 2.5;
    visual.setLayer(visual.fill, 5, layout.listHeight, x, layout.listTop - layout.listHeight / 2, new Color(130, 189, 190, 90));
    visual.setLayer(visual.detail, 5, height, x, layout.listTop - height / 2 - progress * (layout.listHeight - height), new Color(87, 126, 113));
  }

  renderCloseIcon(visual: StackUIVisual): void {
    visual.reset();
    visual.accent.type = visual.detail.type = Sprite.Type.SIMPLE;
    const color = new Color(87, 126, 113);
    visual.setLayer(visual.accent, 48, 4, 0, 0, color);
    visual.accent.node.angle = 45;
    visual.setLayer(visual.detail, 48, 4, 0, 0, color);
    visual.detail.node.angle = -45;
  }

  renderDimmer(alpha: number): void {
    const value = Math.round(Math.max(0, Math.min(32, alpha)));
    if (this.ui.screenDimmer.color.a !== value) this.ui.screenDimmer.color = new Color(83, 67, 78, value);
    this.ui.screenDimmer.node.active = value > 0;
  }

  rgb(value: RGB, alpha = 255): Color { return new Color(value[0], value[1], value[2], Math.round(alpha)); }

  textOnButton(background: RGB): Color {
    const linear = background.map(value => {
      const channel = value / 255;
      return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    return luminance > 0.179 ? new Color(0, 0, 0, 255) : new Color(255, 255, 255, 255);
  }
}
