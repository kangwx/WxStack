import { Button, Label, Node, UITransform, Widget } from 'cc';
import type { StackUIButtonBinding, StackUIViewBindings } from '../StackUIViewBindings';

/** Views own presentation only. Presenters decide when visible pages render. */
export interface UIView<TModel, TLayout> {
  render(model: Readonly<TModel>): void;
  applyLayout(layout: Readonly<TLayout>): void;
}

export interface NodeGeometry {
  width?: number;
  height?: number;
  /** For nodes without an enabled Widget. Never set a page animation root here. */
  position?: Readonly<{ x: number; y: number }>;
  /** Existing authored Widget alignment is retained; only its offsets change. */
  widget?: Readonly<{ horizontalCenter?: number; verticalCenter?: number; top?: number; bottom?: number; left?: number; right?: number }>;
}
export interface LabelGeometry extends NodeGeometry {
  fontSize?: number;
  lineHeight?: number;
  bold?: boolean;
  wrap?: boolean;
}
export interface ButtonGeometry extends NodeGeometry { label?: LabelGeometry; }

function text(label: Label, value: string | undefined): void {
  if (value !== undefined && label.string !== value) label.string = value;
}
function active(node: Node, value: boolean | undefined): void {
  if (value !== undefined && node.active !== value) node.active = value;
}

/** Caches authored components; never instantiates Nodes, components or effects. */
abstract class BoundView<TBindings> {
  private readonly buttons = new WeakMap<Node, Button>();
  private readonly transforms = new WeakMap<Node, UITransform>();
  private readonly widgets = new WeakMap<Node, Widget | null>();
  protected constructor(protected readonly bindings: TBindings) {}

  protected enabled(node: Node, value: boolean | undefined): void {
    if (value === undefined) return;
    let button = this.buttons.get(node);
    if (!button) {
      button = node.getComponent(Button)!;
      if (!button) throw new Error(`Missing authored Button: ${node.name}`);
      this.buttons.set(node, button);
    }
    if (button.interactable !== value) button.interactable = value;
  }

  protected geometry(node: Node, geometry: NodeGeometry | undefined): void {
    if (!geometry) return;
    let transform = this.transforms.get(node);
    if (!transform) {
      transform = node.getComponent(UITransform)!;
      if (!transform) throw new Error(`Missing authored UITransform: ${node.name}`);
      this.transforms.set(node, transform);
    }
    if (!this.widgets.has(node)) this.widgets.set(node, node.getComponent(Widget));
    const widget = this.widgets.get(node);
    if (geometry.position && widget?.enabled) {
      throw new Error(`Layout position conflicts with the authored Widget: ${node.name}; pass widget offsets instead.`);
    }
    if (geometry.position && geometry.widget) throw new Error(`Choose one position owner for ${node.name}.`);
    if (geometry.widget && !widget) throw new Error(`Missing authored Widget: ${node.name}`);
    const width = geometry.width ?? transform.width;
    const height = geometry.height ?? transform.height;
    const resized = width !== transform.width || height !== transform.height;
    if (resized) transform.setContentSize(width, height);
    if (geometry.position) {
      const { x, y } = geometry.position;
      if (node.position.x !== x || node.position.y !== y) node.setPosition(x, y, node.position.z);
    }
    if (geometry.widget && widget) {
      let changed = resized;
      for (const key of ['horizontalCenter', 'verticalCenter', 'top', 'bottom', 'left', 'right'] as const) {
        const value = geometry.widget[key];
        if (value !== undefined && widget[key] !== value) { widget[key] = value; changed = true; }
      }
      if (changed) widget.updateAlignment();
    } else if (resized && widget?.enabled) widget.updateAlignment();
  }

  protected label(label: Label, geometry: LabelGeometry | undefined): void {
    if (!geometry) return;
    this.geometry(label.node, geometry);
    if (geometry.fontSize !== undefined && label.fontSize !== geometry.fontSize) label.fontSize = geometry.fontSize;
    if (geometry.lineHeight !== undefined && label.lineHeight !== geometry.lineHeight) label.lineHeight = geometry.lineHeight;
    if (geometry.bold !== undefined && label.isBold !== geometry.bold) label.isBold = geometry.bold;
    if (geometry.wrap !== undefined && label.enableWrapText !== geometry.wrap) label.enableWrapText = geometry.wrap;
  }

  protected button(button: Pick<StackUIButtonBinding, 'node' | 'label'>, geometry: ButtonGeometry | undefined): void {
    if (!geometry) return;
    this.geometry(button.node, geometry);
    this.label(button.label, geometry.label);
  }
}

export interface HomePreviewRowModel {
  scoreText: string; nickname: string; rankText: string; titleText: string; visible: boolean;
  detailVisible?: boolean; rankVisible?: boolean; titleVisible?: boolean;
}
export interface HomePreviewModel {
  titleText: string; emptyText: string; emptyVisible: boolean;
  subtitleText?: string; hintText?: string;
  subtitleVisible?: boolean; hintVisible?: boolean;
  rows: ReadonlyArray<Readonly<HomePreviewRowModel>>;
}
export interface HomeScreenModel {
  coins: number; bestScore: number; staminaText: string; startText: string;
  startEnabled?: boolean; controlsText?: string; preview?: Readonly<HomePreviewModel>;
}
export interface HomeScreenLayout {
  coins?: LabelGeometry; best?: LabelGeometry; stamina?: LabelGeometry; controls?: LabelGeometry;
  start?: ButtonGeometry; previewTitle?: LabelGeometry; previewEmpty?: LabelGeometry;
  previewRows?: ReadonlyArray<LabelGeometry>; previewDetails?: ReadonlyArray<LabelGeometry>;
}
export type HomeScreenBindings = Pick<StackUIViewBindings,
  'homeCoinLabel' | 'homeBestLabel' | 'homeStaminaLabel' | 'startPromptLabel' | 'startButton' | 'controlsLabel'
  | 'homeLeaderboardPreviewTitle' | 'homeLeaderboardPreviewSubtitle' | 'homeLeaderboardPreviewHint' | 'homeLeaderboardPreviewEmpty'
  | 'homeLeaderboardPreviewRows' | 'homeLeaderboardPreviewDetails' | 'homeLeaderboardPreviewRanks' | 'homeLeaderboardPreviewTitles'>;

export class HomeScreenView extends BoundView<HomeScreenBindings> implements UIView<HomeScreenModel, HomeScreenLayout> {
  constructor(bindings: HomeScreenBindings) { super(bindings); }
  render(model: Readonly<HomeScreenModel>): void {
    const b = this.bindings;
    text(b.homeCoinLabel, `${model.coins}`); text(b.homeBestLabel, `${model.bestScore}`);
    text(b.homeStaminaLabel, model.staminaText); text(b.startPromptLabel, model.startText);
    text(b.controlsLabel, model.controlsText); this.enabled(b.startButton, model.startEnabled);
    const preview = model.preview;
    if (!preview) return;
    text(b.homeLeaderboardPreviewTitle, preview.titleText); text(b.homeLeaderboardPreviewEmpty, preview.emptyText);
    text(b.homeLeaderboardPreviewSubtitle, preview.subtitleText); text(b.homeLeaderboardPreviewHint, preview.hintText);
    active(b.homeLeaderboardPreviewSubtitle.node, preview.subtitleVisible); active(b.homeLeaderboardPreviewHint.node, preview.hintVisible);
    active(b.homeLeaderboardPreviewEmpty.node, preview.emptyVisible);
    for (let index = 0; index < b.homeLeaderboardPreviewRows.length; index++) {
      const row = preview.rows[index];
      const score = b.homeLeaderboardPreviewRows[index], detail = b.homeLeaderboardPreviewDetails[index];
      const rank = b.homeLeaderboardPreviewRanks[index], title = b.homeLeaderboardPreviewTitles[index];
      text(score, row?.scoreText ?? ''); text(detail, row?.nickname ?? '');
      text(rank, row?.rankText ?? ''); text(title, row?.titleText ?? '');
      const visible = row?.visible ?? false;
      active(score.node, visible); active(detail.node, visible && (row?.detailVisible ?? true));
      active(rank.node, visible && (row?.rankVisible ?? true)); active(title.node, visible && (row?.titleVisible ?? true));
    }
  }
  applyLayout(layout: Readonly<HomeScreenLayout>): void {
    const b = this.bindings;
    this.label(b.homeCoinLabel, layout.coins); this.label(b.homeBestLabel, layout.best);
    this.label(b.homeStaminaLabel, layout.stamina); this.label(b.controlsLabel, layout.controls);
    if (layout.start) { this.geometry(b.startButton, layout.start); this.label(b.startPromptLabel, layout.start.label); }
    this.label(b.homeLeaderboardPreviewTitle, layout.previewTitle); this.label(b.homeLeaderboardPreviewEmpty, layout.previewEmpty);
    layout.previewRows?.forEach((geometry, index) => { if (b.homeLeaderboardPreviewRows[index]) this.label(b.homeLeaderboardPreviewRows[index], geometry); });
    layout.previewDetails?.forEach((geometry, index) => { if (b.homeLeaderboardPreviewDetails[index]) this.label(b.homeLeaderboardPreviewDetails[index], geometry); });
  }
}

export interface GameplayHudModel {
  score: number; bestScore: number; recordGapText: string; recordGapVisible: boolean; perfectText: string;
  testModeText?: string; testModeVisible?: boolean;
}
export interface GameplayHudLayout { score?: LabelGeometry; best?: LabelGeometry; recordGap?: LabelGeometry; testMode?: LabelGeometry; }
export type GameplayHudBindings = Pick<StackUIViewBindings, 'scoreLabel' | 'bestLabel' | 'recordGapLabel' | 'recordGapNode' | 'perfectLabel' | 'testModeBadgeLabel'>;
export class GameplayHudView extends BoundView<GameplayHudBindings> implements UIView<GameplayHudModel, GameplayHudLayout> {
  constructor(bindings: GameplayHudBindings) { super(bindings); }
  render(model: Readonly<GameplayHudModel>): void {
    const b = this.bindings;
    text(b.scoreLabel, `${model.score}`); text(b.bestLabel, `${model.bestScore}`);
    text(b.recordGapLabel, model.recordGapText); active(b.recordGapNode, model.recordGapVisible);
    text(b.perfectLabel, model.perfectText); text(b.testModeBadgeLabel, model.testModeText);
    active(b.testModeBadgeLabel.node, model.testModeVisible);
  }
  applyLayout(layout: Readonly<GameplayHudLayout>): void {
    const b = this.bindings;
    this.label(b.scoreLabel, layout.score); this.label(b.bestLabel, layout.best);
    this.label(b.recordGapLabel, layout.recordGap); this.label(b.testModeBadgeLabel, layout.testMode);
    // Perfect feedback position/scale/opacity remain owned by the animation controller.
  }
}

export interface ResultScreenModel {
  title: string; score: number; bestText: string; coinText: string;
  reviveText: string; reviveEnabled: boolean; restartText: string;
  restartEnabled?: boolean; homeText?: string; homeEnabled?: boolean;
}
export interface ResultScreenLayout {
  title?: LabelGeometry; score?: LabelGeometry; best?: LabelGeometry; coins?: LabelGeometry;
  revive?: ButtonGeometry; restart?: ButtonGeometry; home?: ButtonGeometry;
}
export type ResultScreenBindings = Pick<StackUIViewBindings,
  'resultTitleLabel' | 'resultScoreLabel' | 'resultBestLabel' | 'resultCoinLabel' | 'resultReviveButton' | 'resultRestartButton' | 'resultHomeButton'>;
export class ResultScreenView extends BoundView<ResultScreenBindings> implements UIView<ResultScreenModel, ResultScreenLayout> {
  constructor(bindings: ResultScreenBindings) { super(bindings); }
  render(model: Readonly<ResultScreenModel>): void {
    const b = this.bindings;
    text(b.resultTitleLabel, model.title); text(b.resultScoreLabel, `${model.score}`);
    text(b.resultBestLabel, model.bestText); text(b.resultCoinLabel, model.coinText);
    text(b.resultReviveButton.label, model.reviveText); this.enabled(b.resultReviveButton.node, model.reviveEnabled);
    active(b.resultReviveButton.node, model.reviveEnabled);
    text(b.resultRestartButton.label, model.restartText); this.enabled(b.resultRestartButton.node, model.restartEnabled);
    text(b.resultHomeButton.label, model.homeText); this.enabled(b.resultHomeButton.node, model.homeEnabled);
  }
  applyLayout(layout: Readonly<ResultScreenLayout>): void {
    const b = this.bindings;
    this.label(b.resultTitleLabel, layout.title); this.label(b.resultScoreLabel, layout.score);
    this.label(b.resultBestLabel, layout.best); this.label(b.resultCoinLabel, layout.coins);
    this.button(b.resultReviveButton, layout.revive); this.button(b.resultRestartButton, layout.restart); this.button(b.resultHomeButton, layout.home);
  }
}

export interface ReviveDialogModel { statusText: string; closeText?: string; closeEnabled?: boolean; qrVisible?: boolean; }
export interface ReviveDialogLayout { status?: LabelGeometry; close?: ButtonGeometry; qr?: NodeGeometry; }
export type ReviveDialogBindings = Pick<StackUIViewBindings, 'reviveStatusLabel' | 'reviveCloseButton' | 'reviveQr'>;
export class ReviveDialogView extends BoundView<ReviveDialogBindings> implements UIView<ReviveDialogModel, ReviveDialogLayout> {
  constructor(bindings: ReviveDialogBindings) { super(bindings); }
  render(model: Readonly<ReviveDialogModel>): void {
    const b = this.bindings;
    text(b.reviveStatusLabel, model.statusText); text(b.reviveCloseButton.label, model.closeText);
    this.enabled(b.reviveCloseButton.node, model.closeEnabled); active(b.reviveQr.node, model.qrVisible);
  }
  applyLayout(layout: Readonly<ReviveDialogLayout>): void {
    this.label(this.bindings.reviveStatusLabel, layout.status); this.button(this.bindings.reviveCloseButton, layout.close);
    // Changing geometry never regenerates the QR texture or changes its session.
    this.geometry(this.bindings.reviveQr.node, layout.qr);
  }
}

export interface SettingsScreenModel {
  nickname: string; soundText: string; motionText: string; testModeText: string;
  soundStateText?: string; motionStateText?: string; testModeStateText?: string;
  restoreText?: string; restoreEnabled?: boolean; appearanceText?: string;
}
export interface SettingsScreenLayout {
  nickname?: LabelGeometry; sound?: ButtonGeometry; motion?: ButtonGeometry;
  testMode?: ButtonGeometry; restore?: ButtonGeometry;
}
export type SettingsScreenBindings = Pick<StackUIViewBindings,
  'nicknameLabel' | 'soundToggle' | 'motionToggle' | 'testModeToggle' | 'testModeToggleLabel' | 'settingStateLabels' | 'restoreStaminaButton' | 'appearanceToggle'>;
export class SettingsScreenView extends BoundView<SettingsScreenBindings> implements UIView<SettingsScreenModel, SettingsScreenLayout> {
  constructor(bindings: SettingsScreenBindings) { super(bindings); }
  render(model: Readonly<SettingsScreenModel>): void {
    const b = this.bindings;
    text(b.nicknameLabel, model.nickname); text(b.soundToggle.label, model.soundText);
    text(b.motionToggle.label, model.motionText); text(b.testModeToggleLabel, model.testModeText);
    text(b.settingStateLabels[0], model.soundStateText); text(b.settingStateLabels[1], model.motionStateText);
    text(b.settingStateLabels[2], model.testModeStateText);
    text(b.restoreStaminaButton.label, model.restoreText); this.enabled(b.restoreStaminaButton.node, model.restoreEnabled);
    if (model.appearanceText !== undefined) text(b.appearanceToggle.label, model.appearanceText);
  }
  applyLayout(layout: Readonly<SettingsScreenLayout>): void {
    const b = this.bindings;
    this.label(b.nicknameLabel, layout.nickname); this.button(b.soundToggle, layout.sound);
    this.button(b.motionToggle, layout.motion); this.button(b.restoreStaminaButton, layout.restore);
    if (layout.testMode) { this.geometry(b.testModeToggle, layout.testMode); this.label(b.testModeToggleLabel, layout.testMode.label); }
  }
}

export interface NicknameDialogModel {
  /** Supply on open/reset or draft state changes, not a stale saved nickname during typing. */
  draftText?: string;
  hintText: string; saveText?: string; cancelText?: string; saveEnabled?: boolean; cancelEnabled?: boolean;
}
export interface NicknameDialogLayout { editor?: NodeGeometry; hint?: LabelGeometry; save?: ButtonGeometry; cancel?: ButtonGeometry; }
export type NicknameDialogBindings = Pick<StackUIViewBindings, 'nicknameEditor' | 'nicknameHint' | 'nicknameSaveButton' | 'nicknameCancelButton'>;
export class NicknameDialogView extends BoundView<NicknameDialogBindings> implements UIView<NicknameDialogModel, NicknameDialogLayout> {
  constructor(bindings: NicknameDialogBindings) { super(bindings); }
  render(model: Readonly<NicknameDialogModel>): void {
    const b = this.bindings;
    if (model.draftText !== undefined && b.nicknameEditor.string !== model.draftText) b.nicknameEditor.string = model.draftText;
    text(b.nicknameHint, model.hintText); text(b.nicknameSaveButton.label, model.saveText); text(b.nicknameCancelButton.label, model.cancelText);
    this.enabled(b.nicknameSaveButton.node, model.saveEnabled); this.enabled(b.nicknameCancelButton.node, model.cancelEnabled);
  }
  applyLayout(layout: Readonly<NicknameDialogLayout>): void {
    const b = this.bindings;
    this.geometry(b.nicknameEditor.node, layout.editor); this.label(b.nicknameHint, layout.hint);
    this.button(b.nicknameSaveButton, layout.save); this.button(b.nicknameCancelButton, layout.cancel);
  }
}

export interface LeaderboardRowModel {
  visible: boolean; rankText: string; playerText: string; scoreText: string; titleText: string; detailText: string;
}
export interface LeaderboardScreenModel {
  statusText: string; emptyText: string; pageText: string; emptyVisible?: boolean;
  rows: ReadonlyArray<Readonly<LeaderboardRowModel>>;
}
export interface LeaderboardRowLayout extends NodeGeometry {
  rank?: LabelGeometry; player?: LabelGeometry; score?: LabelGeometry; title?: LabelGeometry; detail?: LabelGeometry;
}
export interface LeaderboardScreenLayout {
  status?: LabelGeometry; empty?: LabelGeometry; page?: LabelGeometry; rows?: ReadonlyArray<LeaderboardRowLayout>;
}
export type LeaderboardScreenBindings = Pick<StackUIViewBindings, 'leaderboardStatus' | 'leaderboardEmpty' | 'leaderboardPageLabel' | 'leaderboardRows'>;
export class LeaderboardScreenView extends BoundView<LeaderboardScreenBindings> implements UIView<LeaderboardScreenModel, LeaderboardScreenLayout> {
  constructor(bindings: LeaderboardScreenBindings) { super(bindings); }
  render(model: Readonly<LeaderboardScreenModel>): void {
    const b = this.bindings;
    text(b.leaderboardStatus, model.statusText); text(b.leaderboardEmpty, model.emptyText);
    text(b.leaderboardPageLabel, model.pageText); active(b.leaderboardEmpty.node, model.emptyVisible);
    for (let index = 0; index < b.leaderboardRows.length; index++) {
      const target = b.leaderboardRows[index], row = model.rows[index];
      active(target.node, row?.visible ?? false);
      text(target.rank, row?.rankText ?? ''); text(target.player, row?.playerText ?? '');
      text(target.score, row?.scoreText ?? ''); text(target.title, row?.titleText ?? ''); text(target.detail, row?.detailText ?? '');
    }
  }
  applyLayout(layout: Readonly<LeaderboardScreenLayout>): void {
    const b = this.bindings;
    this.label(b.leaderboardStatus, layout.status); this.label(b.leaderboardEmpty, layout.empty); this.label(b.leaderboardPageLabel, layout.page);
    layout.rows?.forEach((geometry, index) => {
      const row = b.leaderboardRows[index]; if (!row) return;
      this.geometry(row.node, geometry); this.label(row.rank, geometry.rank); this.label(row.player, geometry.player);
      this.label(row.score, geometry.score); this.label(row.title, geometry.title); this.label(row.detail, geometry.detail);
    });
  }
}

export interface PauseScreenModel {
  resumeText: string; restartText: string; homeText: string; resumeEnabled?: boolean; restartEnabled?: boolean; homeEnabled?: boolean;
}
export interface PauseScreenLayout { resume?: ButtonGeometry; restart?: ButtonGeometry; home?: ButtonGeometry; }
export type PauseScreenBindings = Pick<StackUIViewBindings, 'resumeButton' | 'resumeButtonLabel' | 'restartButton' | 'restartButtonLabel' | 'homeButton' | 'homeButtonLabel'>;
export class PauseScreenView extends BoundView<PauseScreenBindings> implements UIView<PauseScreenModel, PauseScreenLayout> {
  constructor(bindings: PauseScreenBindings) { super(bindings); }
  render(model: Readonly<PauseScreenModel>): void {
    const b = this.bindings;
    text(b.resumeButtonLabel, model.resumeText); text(b.restartButtonLabel, model.restartText); text(b.homeButtonLabel, model.homeText);
    this.enabled(b.resumeButton, model.resumeEnabled); this.enabled(b.restartButton, model.restartEnabled); this.enabled(b.homeButton, model.homeEnabled);
  }
  applyLayout(layout: Readonly<PauseScreenLayout>): void {
    const b = this.bindings;
    if (layout.resume) { this.geometry(b.resumeButton, layout.resume); this.label(b.resumeButtonLabel, layout.resume.label); }
    if (layout.restart) { this.geometry(b.restartButton, layout.restart); this.label(b.restartButtonLabel, layout.restart.label); }
    if (layout.home) { this.geometry(b.homeButton, layout.home); this.label(b.homeButtonLabel, layout.home.label); }
  }
}
