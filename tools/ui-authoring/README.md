# UI editor asset authoring

`generate.cjs` converts the frozen pre-migration UI construction fixture into actual Cocos Creator 3.8.8 assets. It creates eight page prefabs, a preallocated effects prefab, the configured overflow `ImpactRing` prefab and the complete `GameUIRoot` prefab, with typed Inspector references. The game does not import or execute this fixture.

```sh
node tools/ui-authoring/generate.cjs
node --test tools/ui-authoring/test-authored-ui.cjs
node --test tools/ui-authoring/test-ui-visual.cjs
node --test tools/ui-authoring/test-guard-generated.cjs
```

Set `UI_SHARP_MODULE` to an installed `sharp` module directory if the default Codex bundled dependency path is unavailable. Set `COCOS_CREATOR_APP` when Creator 3.8.8 is installed elsewhere. The generator does not use Creator's Electron-only sharp binary.

Generated outputs are the explicitly named PNGs and prefabs in `assets/ui/primitives` and `assets/prefabs/ui`, their metadata, the four parent-folder metadata files, `ui-controls.pac`, `assets/scripts/StackUIViewBindings.ts` and its metadata, plus `bindings-contract.json`. UUIDs and component/file IDs are deterministic. Runtime scripts and the scene are maintained separately. Other files in those directories are not automatically adopted or overwritten.

`guard-generated.cjs` protects generated files with SHA256 hashes in `generated-files.json`. Preflight must finish before **any** output or directory write. Unchanged outputs regenerate normally, without confirmation. Changed or deleted tracked files, and existing files newly claimed by an output plan, stop generation with the affected paths before the first write. This includes editor changes to prefabs and metadata. The previous manifest remains intact after an incomplete generation; investigate and preserve partial changes before restoring known generated versions. Do not reset the manifest to bypass a conflict.

The generator integration is:

```js
const { uiOutputFiles, verify, assertWritable, record } = require('./guard-generated.cjs');
// Calculate all planned names from authoring inputs, including newly added art/pages.
const outputs = uiOutputFiles({ artworkNames, prefabNames });
const ticket = verify({ root: ROOT, outputs }); // Before folders(), mkdir or any write.
// Each JSON, PNG and TypeScript writer checks its target before writing:
assertWritable(ticket, filename);
// ...generate the complete planned output set...
record(ticket); // Only after successful completion, never in finally.
```

First-time adoption of existing assets is an explicit maintenance operation: `initialize({ root, outputs })` records only the reviewed, enumerated files and refuses if a manifest already exists. This migration initialized the 197 known outputs from the current contract (83 artwork files, 11 prefabs, associated metadata and structural files); it did not scan folders to claim unrelated work. Commit the manifest alongside subsequent generated changes. Deleting the manifest does not make an existing output set safe to overwrite: normal preflight still rejects it.

To keep an editor adjustment, preserve it and incorporate the change into the authoring source before restoring the affected generated file to its recorded version and rerunning the generator. To move a page permanently to manual ownership, deliberately remove its writes from the generator and its entry from the manifest in the same reviewed change. Merely omitting a previously generated file from a later plan keeps its old hash protected. There is no default overwrite or force-reset mode.

`bindings-contract.json` is the authoritative binding and art manifest. The binding component uses typed fields and typed value structs, not runtime node-path lookup. All legacy node names are preserved. The root contains expanded linked page subtrees whose `PrefabInfo.root` and asset UUID match the corresponding standalone prefab. `mount-prefab.cjs` exports a pure scene composition helper for an initial scene attachment; it does not write or modify files by itself.

Rounded rectangles and borders use white tintable nine-slice textures. Six rank avatars are rasterized from the actual legacy drawing commands. Every Image/SpriteFrame has explicit metadata. `ui-controls.pac` requests a build-time atlas for ordinary controls; the ring shader's white texture is explicitly excluded because it requires unmodified 0–1 UV coordinates.

The FX prefab prewarms 128 spark/trail pairs, 12 two-edge frames and eight rings. Only ring exhaustion instantiates an already configured `ImpactRing` prefab under the bound `RingsRoot`; live rings are never overwritten. Idle simulation skips its pools, an expiry requests one final hide pass, and each active render caches repeated world-space projections. Static title/caption/description labels use BITMAP caching; scores, input, status and leaderboard row text remain NONE. No label uses CHAR caching.

The eight pages have a `LayoutRoot → VisualRoot` structure. The layout parent owns its Widget; the visual child owns UIOpacity and animation transforms. Original page fields in `StackUIViewBindings` point to the visual child. `pageLayoutRoots` and `pageVisualRoots` are ordered Home, HUD, Settings, Nickname, Leaderboard, Pause, Result, Revive. During resize, update each parent Widget before copying its UITransform size into its paired visual child, then apply page-specific layout. Standalone page prefabs have an active visual root for editor preview; nested pages in the game root preserve their initial hidden state.

The offline fixture is an authoring source, not a rendering oracle: the tests check asset references, types, pool sizes, metadata and binding completeness. Creator import, scene preview, screenshot comparison, build-time atlas packing and physical Android projection/WebView performance must be validated in the real engine before release.

## Actual engine evidence

The initial Creator 3.8.8 Web Mobile debug build successfully imported the SpriteFrame metadata. Inspection of `library/0a/0a917c48-3b01-521e-a528-c2f918a146e2@f9941.json` confirmed a 64 × 64 `cc.SpriteFrame`, capInsets `[28,28,28,28]`, and a separate Texture2D backing resource. The built `023b1e8d4` pack contained 79 ordinary UI frames with a single generated atlas texture dependency `123b1e8d4@6c48a`; the ring white texture remained independent. The original image retention warnings did not mean the sprites were sampling separate textures. Image metadata redirect was then corrected to the SpriteFrame subasset, matching Creator's shipped Taxi UI templates, and needs a subsequent build to assess warning removal.

After a real build, run `node tools/ui-authoring/audit-engine-import.cjs` to inspect Creator's imported SpriteFrames and built atlas dependencies independently of the offline mock. This verifies the imported dimensions, insets, texture chain and shared build texture. It does not establish visual equivalence or device frame-rate acceptance.
