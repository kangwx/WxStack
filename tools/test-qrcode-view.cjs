const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const creator = process.env.COCOS_CREATOR_APP || '/Applications/Cocos/Creator/3.8.8/CocosCreator.app';
const ts = require(path.join(creator, 'Contents/Resources/app.asar.unpacked/node_modules/typescript'));
const source = fs.readFileSync(path.join(__dirname, '../assets/scripts/ui/QRCodeView.ts'), 'utf8');
function fixture() {
  const textures = []; const frames = [];
  let uploadFailure = false;
  class Texture2D {
    static PixelFormat = { RGBA8888: 'rgba8888' };
    static Filter = { NEAREST: 'nearest', NONE: 'none' };
    static WrapMode = { CLAMP_TO_EDGE: 'clamp-to-edge' };
    constructor() { this.destroyCalls = 0; textures.push(this); }
    reset(options) { this.options = options; }
    setFilters(min, mag) { this.min = min; this.mag = mag; }
    setMipFilter(value) { this.mip = value; }
    setWrapMode(s, t) { this.wrapS = s; this.wrapT = t; }
    uploadData(pixels) { if (uploadFailure) throw Error('GPU upload failed'); this.pixels = pixels; }
    destroy() { this.destroyCalls++; }
  }
  class SpriteFrame {
    constructor() { this.destroyCalls = 0; frames.push(this); }
    destroy() { this.destroyCalls++; }
  }
  const cc = { Component: class {}, Sprite: class {}, SpriteFrame, Texture2D,
    _decorator: { ccclass: () => target => target, property: () => () => {} } };
  const runtime = { exports: {}, require(name) { assert.equal(name, 'cc'); return cc; } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
  } }).outputText, runtime);
  const view = new runtime.exports.QRCodeView();
  view.image = { spriteFrame: null, node: { active: false, width: 392, height: 392 } };
  return { view, textures, frames, failUpload(value) { uploadFailure = value; } };
}
const modules = () => Array.from({ length: 21 * 21 }, (_, index) => index % 2);

test('QR pixels have a four-module opaque white quiet zone with exact black/white module data', () => {
  const f = fixture(); const bits = modules(); f.view.show('session-one', 21, bits);
  const texture = f.textures[0]; const extent = 29;
  assert.equal(texture.options.width, extent); assert.equal(texture.options.height, extent);
  assert.equal(texture.options.mipmapLevel, 1);
  for (let row = 0; row < extent; row++) for (let col = 0; col < extent; col++) {
    const inside = row >= 4 && row < 25 && col >= 4 && col < 25;
    const value = inside && bits[(row - 4) * 21 + col - 4] ? 0 : 255;
    const offset = (row * extent + col) * 4;
    assert.deepEqual(Array.from(texture.pixels.subarray(offset, offset + 4)), [value, value, value, 255]);
  }
  assert.equal(f.view.image.node.active, true);
});

test('QR uses nearest sampling, no mip filtering, clamp wrapping and never enters the dynamic atlas', () => {
  const f = fixture(); f.view.show('session-one', 21, modules());
  const texture = f.textures[0];
  assert.equal(texture.min, 'nearest'); assert.equal(texture.mag, 'nearest'); assert.equal(texture.mip, 'none');
  assert.equal(texture.wrapS, 'clamp-to-edge'); assert.equal(texture.wrapT, 'clamp-to-edge');
  assert.equal(f.frames[0].packable, false); assert.equal(f.frames[0].texture, texture);
});

test('resizing or redisplaying the same session does not allocate, upload or replace QR resources', () => {
  const f = fixture(); const bits = modules(); f.view.show('session-one', 21, bits);
  const frame = f.view.image.spriteFrame;
  for (const size of [196, 392, 640, 1080]) {
    f.view.image.node.width = f.view.image.node.height = size;
    f.view.show('session-one', 21, bits);
    assert.equal(f.view.image.node.width, size);
    assert.equal(f.view.image.spriteFrame, frame);
  }
  assert.equal(f.textures.length, 1); assert.equal(f.frames.length, 1);
  assert.equal(frame.destroyCalls, 0);
});

test('replacement, clear and destruction detach and release owned frames/textures exactly once', () => {
  const f = fixture(); const bits = modules(); f.view.show('session-one', 21, bits);
  const firstTexture = f.textures[0]; const firstFrame = f.frames[0];
  f.view.show('session-two', 21, bits);
  assert.equal(firstTexture.destroyCalls, 1); assert.equal(firstFrame.destroyCalls, 1);
  assert.equal(f.textures[1].destroyCalls, 0); assert.equal(f.frames[1].destroyCalls, 0);
  f.view.clear(); f.view.clear(); f.view.onDestroy();
  assert.equal(f.view.image.spriteFrame, null); assert.equal(f.view.image.node.active, false);
  assert.equal(f.textures[1].destroyCalls, 1); assert.equal(f.frames[1].destroyCalls, 1);
  f.view.show('session-two', 21, bits);
  assert.equal(f.textures.length, 3, 'clear removes the old session cache');
});

test('invalid QR data is rejected without replacing a working session or creating resources', () => {
  const f = fixture(); f.view.show('session-one', 21, modules());
  const frame = f.view.image.spriteFrame;
  for (const [id, size, bits] of [['', 21, modules()], ['new', 20, new Array(400).fill(0)],
    ['new', 178, new Array(178 * 178).fill(0)], ['new', 21, []], ['new', 21, new Array(441).fill(2)],
    ['new', 21, new Array(441).fill(true)]]) {
    assert.throws(() => f.view.show(id, size, bits), /Invalid QR module data/);
  }
  assert.equal(f.view.image.spriteFrame, frame); assert.equal(f.textures.length, 1);
  f.view.image = null; assert.throws(() => f.view.show('new', 21, modules()), /not bound/);
});

test('GPU upload failure frees the partial texture and preserves the current session for retry', () => {
  const f = fixture(); const bits = modules(); f.view.show('session-one', 21, bits);
  const old = f.view.image.spriteFrame;
  f.failUpload(true);
  assert.throws(() => f.view.show('session-two', 21, bits), /GPU upload failed/);
  assert.equal(f.view.image.spriteFrame, old); assert.equal(old.destroyCalls, 0);
  assert.equal(f.textures[1].destroyCalls, 1); assert.equal(f.frames.length, 1);
  f.failUpload(false); f.view.show('session-two', 21, bits);
  assert.equal(old.destroyCalls, 1); assert.equal(f.textures.length, 3);
});
