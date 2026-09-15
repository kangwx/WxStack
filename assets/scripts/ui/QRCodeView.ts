import { _decorator, Component, Sprite, SpriteFrame, Texture2D } from 'cc';

const { ccclass, property } = _decorator;

/** Owns only the texture created for a revive session; no scene construction. */
@ccclass('QRCodeView')
export class QRCodeView extends Component {
  @property(Sprite) image: Sprite = null!;
  private ownedTexture: Texture2D | null = null;
  private ownedFrame: SpriteFrame | null = null;
  private sessionId = '';

  show(id: string, size: number, modules: readonly number[]): void {
    if (!this.image) throw new Error('QRCodeView.image is not bound');
    if (typeof id !== 'string' || !id || !Number.isInteger(size) || size < 21 || size > 177
      || !modules || modules.length !== size * size) {
      throw new Error('Invalid QR module data');
    }
    if (id === this.sessionId && this.ownedTexture) return;
    for (let i = 0; i < modules.length; i++) {
      if (modules[i] !== 0 && modules[i] !== 1) throw new Error('Invalid QR module data');
    }
    const extent = size + 8;
    const pixels = new Uint8Array(extent * extent * 4);
    pixels.fill(255);
    for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
      if (modules[row * size + col]) {
        const offset = ((row + 4) * extent + col + 4) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
    const texture = new Texture2D();
    let frame: SpriteFrame | null = null;
    try {
      texture.reset({ width: extent, height: extent, format: Texture2D.PixelFormat.RGBA8888, mipmapLevel: 1 });
      texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
      texture.setMipFilter(Texture2D.Filter.NONE);
      texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
      texture.uploadData(pixels);
      frame = new SpriteFrame();
      frame.texture = texture;
      frame.packable = false;
      // Upload first, so failure leaves the currently displayed session and its resources intact.
      this.clear();
      this.image.spriteFrame = frame;
      this.image.node.active = true;
      this.ownedTexture = texture;
      this.ownedFrame = frame;
      this.sessionId = id;
    } catch (error) {
      frame?.destroy();
      texture.destroy();
      throw error;
    }
  }

  clear(): void {
    if (this.image) { this.image.spriteFrame = null; this.image.node.active = false; }
    this.ownedFrame?.destroy();
    this.ownedTexture?.destroy();
    this.ownedFrame = null;
    this.ownedTexture = null;
    this.sessionId = '';
  }

  onDestroy(): void { this.clear(); }
}
