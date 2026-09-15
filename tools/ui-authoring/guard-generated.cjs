'use strict';

// Offline authoring guard. This module never changes a generated output.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_MANIFEST = 'tools/ui-authoring/generated-files.json';
const tickets = new WeakMap();
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function fail(code, message, conflicts = []) {
  const error = new Error(`${message}${conflicts.length ? '\n' + conflicts.map(item => `  ${item.path}: ${item.reason}`).join('\n') : ''}`);
  error.code = code;
  error.conflicts = conflicts;
  throw error;
}

function relativeFile(root, filename) {
  if (typeof filename !== 'string' || !filename || filename.includes('\\')) {
    fail('GENERATED_OUTPUT_PATH', 'Expected a nonempty file path with forward slashes.');
  }
  const relative = path.relative(root, path.resolve(root, filename)).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../')) {
    fail('GENERATED_OUTPUT_PATH', `Generated output must be a file inside the project: ${filename}`);
  }
  return relative;
}

function options(config) {
  const root = path.resolve(config?.root || process.cwd());
  const manifest = relativeFile(root, config?.manifestPath || DEFAULT_MANIFEST);
  if (!Array.isArray(config?.outputs) || !config.outputs.length) {
    fail('GENERATED_OUTPUT_PLAN', 'Pass an explicit, nonempty outputs list before generating files.');
  }
  const outputs = [...new Set(config.outputs.map(file => relativeFile(root, file)))].sort();
  if (outputs.includes(manifest)) fail('GENERATED_OUTPUT_PLAN', 'The manifest cannot be a generated output.');
  return { root, manifest, outputs };
}

function readManifest(config) {
  const filename = path.join(config.root, config.manifest);
  if (!fs.existsSync(filename)) return { files: {}, bytes: null };
  const bytes = fs.readFileSync(filename);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { fail('GENERATED_MANIFEST_INVALID', `Invalid JSON in ${config.manifest}; restore its recorded version.`); }
  if (value?.version !== 1 || value.algorithm !== 'sha256' || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
    fail('GENERATED_MANIFEST_INVALID', `Invalid generated-file manifest: ${config.manifest}`);
  }
  for (const [file, hash] of Object.entries(value.files)) {
    if (relativeFile(config.root, file) !== file || file === config.manifest || !/^[a-f0-9]{64}$/.test(hash)) {
      fail('GENERATED_MANIFEST_INVALID', `Invalid generated-file entry: ${file}`);
    }
  }
  return { files: value.files, bytes };
}

function inspect(root, file) {
  const filename = path.join(root, file);
  let stat;
  try { stat = fs.lstatSync(filename); }
  catch (error) { if (error.code === 'ENOENT') return { reason: 'missing file' }; throw error; }
  if (!stat.isFile()) return { reason: 'not a regular file' };
  return { hash: sha256(fs.readFileSync(filename)) };
}

/** Read-only preflight; call before mkdir, metadata writes or image generation. */
function verify(config) {
  const normalized = options(config);
  const previous = readManifest(normalized);
  const conflicts = [];
  for (const [file, expected] of Object.entries(previous.files)) {
    const actual = inspect(normalized.root, file);
    if (actual.hash !== expected) conflicts.push({ path: file, reason: actual.reason || 'changed since the last successful generation' });
  }
  for (const file of normalized.outputs) {
    if (Object.hasOwn(previous.files, file)) continue;
    const actual = inspect(normalized.root, file);
    if (actual.hash || actual.reason !== 'missing file') {
      conflicts.push({ path: file, reason: previous.bytes ? 'existing file is not owned by the generator' : 'existing file requires explicit first-time initialization' });
    }
  }
  if (conflicts.length) {
    fail('GENERATED_OUTPUT_CONFLICT', 'Generation stopped before writing. Preserve these edits and update the authoring source, or keep the files under manual ownership.', conflicts);
  }
  const ticket = Object.freeze({ outputs: Object.freeze([...normalized.outputs]), manifestPath: normalized.manifest });
  tickets.set(ticket, { ...normalized, previous, consumed: false });
  return ticket;
}

/** Place at each writer to catch a new output omitted from the preflight plan. */
function assertWritable(ticket, filename) {
  const state = tickets.get(ticket);
  if (!state || state.consumed) fail('GENERATED_OUTPUT_TICKET', 'A live verify ticket is required before writing.');
  const file = relativeFile(state.root, filename);
  if (!state.outputs.includes(file)) fail('GENERATED_OUTPUT_UNDECLARED', `Output was not declared before generation: ${file}`);
}

function writeManifest(config, files) {
  const filename = path.join(config.root, config.manifest);
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'en')));
  const bytes = JSON.stringify({ version: 1, algorithm: 'sha256', files: sorted }, null, 2) + '\n';
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try { fs.writeFileSync(temporary, bytes, { flag: 'wx' }); fs.renameSync(temporary, filename); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return { manifestPath: config.manifest, fileCount: Object.keys(sorted).length };
}

/** Record only after the complete generation has succeeded. */
function record(ticket) {
  const state = tickets.get(ticket);
  if (!state || state.consumed) fail('GENERATED_OUTPUT_TICKET', 'A live verify ticket is required before recording.');
  const current = readManifest(state);
  if ((current.bytes?.toString('utf8') ?? null) !== (state.previous.bytes?.toString('utf8') ?? null)) {
    fail('GENERATED_MANIFEST_CHANGED', 'The manifest changed during generation; do not overwrite the other run.');
  }
  // Keep retired outputs protected until their ownership is deliberately migrated.
  const files = { ...state.previous.files };
  const conflicts = [];
  for (const file of state.outputs) {
    const actual = inspect(state.root, file);
    if (actual.reason) conflicts.push({ path: file, reason: actual.reason });
    else files[file] = actual.hash;
  }
  for (const [file, expected] of Object.entries(state.previous.files)) {
    if (state.outputs.includes(file)) continue;
    const actual = inspect(state.root, file);
    if (actual.hash !== expected) conflicts.push({ path: file, reason: actual.reason || 'retired output changed during generation' });
  }
  if (conflicts.length) fail('GENERATED_OUTPUT_INCOMPLETE', 'Generation is incomplete; the previous manifest was kept.', conflicts);
  const result = writeManifest(state, files);
  state.consumed = true;
  return result;
}

/** Explicit one-time takeover of a reviewed, enumerated set; never scans folders. */
function initialize(config) {
  const normalized = options(config);
  if (fs.existsSync(path.join(normalized.root, normalized.manifest))) {
    fail('GENERATED_MANIFEST_EXISTS', 'Initialization is only for first-time adoption; the manifest already exists.');
  }
  const files = {};
  const conflicts = [];
  for (const file of normalized.outputs) {
    const actual = inspect(normalized.root, file);
    if (actual.reason) conflicts.push({ path: file, reason: actual.reason });
    else files[file] = actual.hash;
  }
  if (conflicts.length) fail('GENERATED_OUTPUT_INCOMPLETE', 'Cannot initialize missing or non-file outputs.', conflicts);
  return writeManifest(normalized, files);
}

/** The generator supplies planned names, including newly added assets, before writes. */
function uiOutputFiles({ artworkNames, prefabNames }) {
  const names = values => {
    if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(value))) {
      fail('GENERATED_OUTPUT_PLAN', 'Artwork and prefab names must be explicit simple file stems.');
    }
    return values;
  };
  const files = [
    ...names(artworkNames).map(name => `assets/ui/primitives/${name}.png`),
    ...names(prefabNames).map(name => `assets/prefabs/ui/${name}.prefab`),
    'assets/ui/primitives/ui-controls.pac',
    'assets/scripts/StackUIViewBindings.ts',
  ];
  return [...new Set([
    ...files.flatMap(file => [file, `${file}.meta`]),
    'assets/prefabs.meta', 'assets/prefabs/ui.meta', 'assets/ui.meta', 'assets/ui/primitives.meta',
    'tools/ui-authoring/bindings-contract.json',
  ])].sort();
}

module.exports = { DEFAULT_MANIFEST, verify, assertWritable, record, initialize, uiOutputFiles };
