'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DEFAULT_MANIFEST, verify, assertWritable, record, initialize, uiOutputFiles } = require('./guard-generated.cjs');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wxstack-generated-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    write(file, value) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); },
    read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); },
    exists(file) { return fs.existsSync(path.join(root, file)); },
    manifest() { return JSON.parse(fs.readFileSync(path.join(root, DEFAULT_MANIFEST), 'utf8')); },
  };
}

test('fresh generation records SHA256; unchanged outputs regenerate without confirmation', t => {
  const w = workspace(t), outputs = ['ui/home.prefab', 'ui/home.prefab.meta'];
  const first = verify({ root: w.root, outputs });
  assert.equal(w.exists(DEFAULT_MANIFEST), false, 'preflight must be read-only');
  for (const file of outputs) { assertWritable(first, path.join(w.root, file)); w.write(file, 'first generation'); }
  assert.equal(record(first).fileCount, 2);
  assert.equal(w.manifest().files[outputs[0]], crypto.createHash('sha256').update('first generation').digest('hex'));
  const second = verify({ root: w.root, outputs });
  for (const file of outputs) w.write(file, 'second generation');
  record(second);
  assert.doesNotThrow(() => verify({ root: w.root, outputs }));
});

test('hand-edited pages and metadata stop the entire run before its first write', t => {
  const w = workspace(t), outputs = ['ui/home.prefab', 'ui/home.prefab.meta', 'ui/button.png'];
  for (const file of outputs) w.write(file, 'generated');
  initialize({ root: w.root, outputs });
  const manifestBefore = w.read(DEFAULT_MANIFEST);
  w.write(outputs[0], 'designer layout'); w.write(outputs[1], 'designer metadata');
  let writes = 0;
  assert.throws(() => {
    const ticket = verify({ root: w.root, outputs });
    for (const file of outputs) { writes++; w.write(file, 'regenerated'); }
    record(ticket);
  }, error => error.code === 'GENERATED_OUTPUT_CONFLICT'
    && error.conflicts.length === 2
    && error.message.includes(outputs[0]) && error.message.includes(outputs[1]));
  assert.equal(writes, 0);
  assert.equal(w.read(outputs[0]), 'designer layout');
  assert.equal(w.read(outputs[2]), 'generated');
  assert.equal(w.read(DEFAULT_MANIFEST), manifestBefore);
});

test('existing outputs require explicit adoption; initialization records only the declared files', t => {
  const w = workspace(t), outputs = ['ui/generated.prefab'];
  w.write(outputs[0], 'known output'); w.write('ui/hand-authored.prefab', 'custom page');
  assert.throws(() => verify({ root: w.root, outputs }), /explicit first-time initialization/);
  assert.equal(w.exists(DEFAULT_MANIFEST), false);
  initialize({ root: w.root, outputs });
  assert.deepEqual(Object.keys(w.manifest().files), outputs);
  assert.throws(() => initialize({ root: w.root, outputs }), error => error.code === 'GENERATED_MANIFEST_EXISTS');
  record(verify({ root: w.root, outputs }));
  assert.equal(w.read('ui/hand-authored.prefab'), 'custom page');
});

test('deleting a tracked output is a conflict, not permission to recreate it', t => {
  const w = workspace(t), outputs = ['ui/home.prefab'];
  w.write(outputs[0], 'generated'); initialize({ root: w.root, outputs });
  fs.unlinkSync(path.join(w.root, outputs[0]));
  assert.throws(() => verify({ root: w.root, outputs }), error => error.conflicts[0].path === outputs[0] && error.conflicts[0].reason === 'missing file');
});

test('new output plans cannot take over an existing manually maintained file', t => {
  const w = workspace(t), outputs = ['ui/home.prefab'];
  w.write(outputs[0], 'generated'); initialize({ root: w.root, outputs });
  w.write('ui/custom.prefab', 'manual');
  assert.throws(() => verify({ root: w.root, outputs: [...outputs, 'ui/custom.prefab'] }), /existing file is not owned/);
  const ticket = verify({ root: w.root, outputs: [...outputs, 'ui/new.prefab'] });
  assertWritable(ticket, 'ui/new.prefab'); w.write('ui/new.prefab', 'new'); record(ticket);
  assert.equal(Object.keys(w.manifest().files).length, 2);
});

test('failed generation keeps its previous manifest and reports partial outputs on the next run', t => {
  const w = workspace(t), outputs = ['ui/home.prefab'];
  w.write(outputs[0], 'old'); initialize({ root: w.root, outputs });
  const manifestBefore = w.read(DEFAULT_MANIFEST);
  const ticket = verify({ root: w.root, outputs: [...outputs, 'ui/new.prefab'] });
  w.write(outputs[0], 'partially updated');
  assert.throws(() => record(ticket), error => error.code === 'GENERATED_OUTPUT_INCOMPLETE');
  assert.equal(w.read(DEFAULT_MANIFEST), manifestBefore);
  assert.throws(() => verify({ root: w.root, outputs }), /changed since/);
});

test('writes must have a live preflight ticket and declared path', t => {
  const w = workspace(t), outputs = ['ui/home.prefab'];
  const ticket = verify({ root: w.root, outputs });
  assert.throws(() => assertWritable(ticket, 'ui/unplanned.prefab'), /not declared/);
  assert.throws(() => assertWritable({}, outputs[0]), /live verify ticket/);
  assert.throws(() => record({}), /live verify ticket/);
  w.write(outputs[0], 'generated'); record(ticket);
  assert.throws(() => record(ticket), /live verify ticket/);
  assert.throws(() => assertWritable(ticket, outputs[0]), /live verify ticket/);
});

test('retired outputs remain protected when a later plan omits them', t => {
  const w = workspace(t), outputs = ['ui/current.prefab', 'ui/retired.prefab'];
  for (const file of outputs) w.write(file, 'generated');
  initialize({ root: w.root, outputs });
  record(verify({ root: w.root, outputs: [outputs[0]] }));
  assert.deepEqual(Object.keys(w.manifest().files), outputs);
  w.write(outputs[1], 'manual change');
  assert.throws(() => verify({ root: w.root, outputs: [outputs[0]] }), /ui\/retired.prefab/);
});

test('missing or malformed manifest does not silently bypass checks', t => {
  const w = workspace(t), outputs = ['ui/home.prefab'];
  w.write(outputs[0], 'generated'); initialize({ root: w.root, outputs });
  fs.unlinkSync(path.join(w.root, DEFAULT_MANIFEST));
  assert.throws(() => verify({ root: w.root, outputs }), /explicit first-time initialization/);
  w.write(DEFAULT_MANIFEST, '{');
  assert.throws(() => verify({ root: w.root, outputs }), error => error.code === 'GENERATED_MANIFEST_INVALID');
});

test('parallel manifest change is not overwritten by an older generation ticket', t => {
  const w = workspace(t), outputs = ['ui/home.prefab'];
  w.write(outputs[0], 'generated'); initialize({ root: w.root, outputs });
  const ticket = verify({ root: w.root, outputs });
  const other = w.manifest(); other.files['ui/home.prefab'] = 'a'.repeat(64); w.write(DEFAULT_MANIFEST, JSON.stringify(other));
  assert.throws(() => record(ticket), error => error.code === 'GENERATED_MANIFEST_CHANGED');
  assert.equal(w.manifest().files['ui/home.prefab'], 'a'.repeat(64));
});

test('invalid paths, missing output plans and incomplete initialization fail without a manifest', t => {
  const w = workspace(t);
  assert.throws(() => verify({ root: w.root, outputs: [] }), /explicit, nonempty/);
  assert.throws(() => verify({ root: w.root, outputs: ['../outside'] }), /inside the project/);
  assert.throws(() => verify({ root: w.root, outputs: [DEFAULT_MANIFEST] }), /cannot be a generated output/);
  assert.throws(() => initialize({ root: w.root, outputs: ['absent'] }), /Cannot initialize/);
  assert.equal(w.exists(DEFAULT_MANIFEST), false);
});

test('UI output planning covers only named assets plus generator-owned structural files', () => {
  const files = uiOutputFiles({ artworkNames: ['white', 'fill-r18'], prefabNames: ['HomeScreen'] });
  for (const file of ['assets/ui/primitives/white.png', 'assets/ui/primitives/white.png.meta',
    'assets/prefabs/ui/HomeScreen.prefab', 'assets/prefabs/ui/HomeScreen.prefab.meta',
    'assets/ui/primitives/ui-controls.pac.meta', 'assets/scripts/StackUIViewBindings.ts.meta',
    'assets/prefabs.meta', 'assets/prefabs/ui.meta', 'assets/ui.meta', 'assets/ui/primitives.meta',
    'tools/ui-authoring/bindings-contract.json']) assert.ok(files.includes(file), file);
  assert.equal(files.length, 15);
  assert.ok(!files.includes('assets/scenes/Game.scene'));
  assert.throws(() => uiOutputFiles({ artworkNames: ['../../manual'], prefabNames: ['HomeScreen'] }), /simple file stems/);
});
