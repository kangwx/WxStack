import { _decorator, Color, Component, Sprite, SpriteFrame, UITransform } from 'cc';

const { ccclass, property } = _decorator;
const RADII = [12, 16, 18, 20, 22, 24, 28, 36, 40, 42, 44];

/** Serialized visual layers. This component never creates nodes or draws paths. */
@ccclass('StackUIVisual')
export class StackUIVisual extends Component {
  @property(Sprite) fill: Sprite = null!;
  @property(Sprite) border: Sprite = null!;
  @property(Sprite) shadow: Sprite = null!;
  @property(Sprite) shadowSoft: Sprite = null!;
  @property(Sprite) shadowMid: Sprite = null!;
  @property(Sprite) focus: Sprite = null!;
  @property(Sprite) arrow: Sprite = null!;
  @property(Sprite) avatar: Sprite = null!;
  @property(Sprite) badge: Sprite = null!;
  @property(Sprite) accent: Sprite = null!;
  @property(Sprite) detail: Sprite = null!;
  @property(Sprite) innerBorder: Sprite = null!;
  @property([SpriteFrame]) fillFrames: SpriteFrame[] = [];
  @property([SpriteFrame]) borderFrames: SpriteFrame[] = [];
  @property([SpriteFrame]) borderStrongFrames: SpriteFrame[] = [];
  @property([SpriteFrame]) borderThinFrames: SpriteFrame[] = [];
  @property([SpriteFrame]) borderFineFrames: SpriteFrame[] = [];
  @property([SpriteFrame]) borderMediumFrames: SpriteFrame[] = [];
  @property([SpriteFrame]) gradientFrames: SpriteFrame[] = [];
  @property([SpriteFrame]) avatarFrames: SpriteFrame[] = [];

  private layers: Sprite[] | null = null;
  private transforms = new Map<Sprite, UITransform>();
  private readonly shadowColors = [new Color(176, 142, 134, 8), new Color(176, 142, 134, 14), new Color(176, 142, 134, 22)];

  validateBindings(): void {
    const entries = ['shadowSoft', 'shadowMid', 'shadow', 'fill', 'border', 'focus', 'arrow', 'avatar', 'badge', 'accent', 'detail', 'innerBorder'] as const;
    for (const name of entries) {
      const sprite = this[name];
      if (!sprite?.node || !sprite.node.getComponent(UITransform)) {
        throw new Error(`UI binding missing: ${this.node.name}.${name}`);
      }
      this.transforms.set(sprite, sprite.node.getComponent(UITransform)!);
    }
    for (const frames of [this.fillFrames, this.borderFrames, this.borderStrongFrames,
      this.borderThinFrames, this.borderFineFrames, this.borderMediumFrames]) {
      if (frames.length !== RADII.length) throw new Error(`UI artwork missing: ${this.node.name}`);
    }
    if (this.avatarFrames.length !== 6 || this.gradientFrames.length !== 2) throw new Error(`UI artwork missing: ${this.node.name}`);
    this.layers = entries.map(name => this[name]);
  }

  reset(): void {
    if (!this.layers) this.validateBindings();
    for (const sprite of this.layers!) sprite.node.active = false;
  }

  setLayer(sprite: Sprite, width: number, height: number, x = 0, y = 0, color?: Color): void {
    if (!this.layers) this.validateBindings();
    const visible = width > 0 && height > 0 && (!color || color.a > 0);
    if (sprite.node.active !== visible) sprite.node.active = visible;
    if (!visible) return;
    const transform = this.transforms.get(sprite)!;
    if (transform.width !== width || transform.height !== height) transform.setContentSize(width, height);
    const pos = sprite.node.position;
    if (pos.x !== x || pos.y !== y) sprite.node.setPosition(x, y, 0);
    if (color && !Color.equals(sprite.color, color)) sprite.color = color;
  }

  box(width: number, height: number, radius: number, color: Color, stroke?: Color,
    strokeWidth = 2, x = 0, y = 0): void {
    const i = this.radiusIndex(radius);
    this.fill.type = Sprite.Type.SLICED;
    this.fill.spriteFrame = this.fillFrames[i];
    this.setLayer(this.fill, width, height, x, y, color);
    this.border.node.active = !!stroke && strokeWidth > 0;
    if (stroke && strokeWidth > 0) {
      this.border.type = Sprite.Type.SLICED;
      this.border.spriteFrame = this.borderSet(strokeWidth)[i];
      // Borders include their outer half-stroke in the serialized texture.
      this.setLayer(this.border, width + strokeWidth, height + strokeWidth, x, y, stroke);
    }
  }

  /** Legacy 40-band row colours, stored in two shared nine-slice frames. */
  gradientBox(width: number, height: number, currentRound: boolean, stroke?: Color,
    strokeWidth = 1, x = 0, y = 0): void {
    this.fill.type = Sprite.Type.SLICED;
    this.fill.spriteFrame = this.gradientFrames[currentRound ? 1 : 0];
    this.setLayer(this.fill, width, height, x, y, Color.WHITE);
    this.border.node.active = !!stroke && strokeWidth > 0;
    if (stroke && strokeWidth > 0) {
      this.border.type = Sprite.Type.SLICED;
      this.border.spriteFrame = this.borderSet(strokeWidth)[this.radiusIndex(18)];
      this.setLayer(this.border, width + strokeWidth, height + strokeWidth, x, y, stroke);
    }
  }

  /** Three authored layers reproduce the leaderboard's original soft shadow. */
  setLayeredShadow(width: number, height: number, x = 0, y = -8): void {
    this.setLayer(this.shadowSoft, width + 28, height + 28, x, y, this.shadowColors[0]);
    this.setLayer(this.shadowMid, width + 14, height + 14, x, y, this.shadowColors[1]);
    this.shadow.spriteFrame = this.fillFrames[this.radiusIndex(44)];
    this.setLayer(this.shadow, width, height, x, y, this.shadowColors[2]);
  }

  setShadow(width: number, height: number, radius: number, x: number, y: number, color: Color): void {
    this.shadow.type = Sprite.Type.SLICED;
    this.shadow.spriteFrame = this.fillFrames[this.radiusIndex(radius)];
    this.setLayer(this.shadow, width, height, x, y, color);
  }

  setFocus(width: number, height: number, focused: boolean, outline: Color, arrow: Color): void {
    this.focus.node.active = this.arrow.node.active = focused;
    if (!focused) return;
    this.setLayer(this.focus, width + 20, height + 20, 0, 0, outline);
    this.setLayer(this.arrow, 13, 20, -width / 2 + 32.5, 0, arrow);
  }

  setAvatar(tier: number, x: number, y: number, radius: number): void {
    this.avatar.spriteFrame = this.avatarFrames[Math.max(0, Math.min(5, tier))];
    this.setLayer(this.avatar, radius * 2, radius * 2, x, y, Color.WHITE);
  }

  setBadge(x: number, y: number, radius: number, color: Color): void {
    this.setLayer(this.badge, radius * 2, radius * 2, x, y, color);
  }

  private radiusIndex(radius: number): number {
    let best = 0;
    for (let i = 1; i < RADII.length; i++) if (Math.abs(RADII[i] - radius) < Math.abs(RADII[best] - radius)) best = i;
    return best;
  }

  private borderSet(width: number): SpriteFrame[] {
    if (width <= 1.25) return this.borderThinFrames;
    if (width <= 1.75) return this.borderFineFrames;
    if (width <= 2.5) return this.borderFrames;
    if (width <= 3.5) return this.borderMediumFrames;
    return this.borderStrongFrames;
  }
}
