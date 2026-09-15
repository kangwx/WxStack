import { DEBUG } from 'cc/env';

export interface PerformanceEnvironment {
  capturedAt: string;
  userAgent: string | null;
  platform: string | null;
  hardwareConcurrency: number | null;
  deviceMemoryGB: number | null;
  devicePixelRatio: number | null;
  viewport: { width: number; height: number } | null;
  framebuffer: { width: number; height: number; source: 'webgl' | 'canvas' } | null;
  webgl: { version: string | null; renderer: string | null; vendor: string | null; unmasked: boolean } | null;
  heap: { usedBytes: number; totalBytes: number; limitBytes: number } | null;
}

export interface PerformanceProbeOptions {
  /** Explicit opt-in is also required in a DEBUG build. Release builds cannot enable this probe. */
  enabled?: boolean;
  durationSeconds?: number;
  sampleCapacity?: number;
  sectionNames?: readonly string[];
  counterNames?: readonly string[];
  /** Injected clocks/environment are useful for deterministic tests and native hosts. */
  now?: () => number;
  environmentProvider?: () => PerformanceEnvironment;
}

export interface TimingSummary {
  count: number;
  storedCount: number;
  overflowCount: number;
  invalidCount: number;
  averageMs: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  over50MsCount: number;
  over50MsPercent: number | null;
}

export interface PerformanceRun {
  label: string;
  status: 'running' | 'completed' | 'stopped';
  reason: 'duration' | 'manual' | null;
  requestedDurationSeconds: number;
  elapsedSeconds: number;
  frameTiming: TimingSummary;
  averageFps: number | null;
  sections: Record<string, TimingSummary & { workUnits: number }>;
  counters: Record<string, { count: number; latest: number | null; average: number | null; min: number | null; max: number | null }>;
  environmentStart: PerformanceEnvironment;
  environmentEnd: PerformanceEnvironment | null;
}

interface TimingBuffer {
  values: Float64Array;
  count: number;
  stored: number;
  invalid: number;
  sum: number;
  max: number;
  over50: number;
}

interface SectionBuffer extends TimingBuffer { startedAt: number; workUnits: number }
interface CounterBuffer { count: number; sum: number; latest: number; min: number; max: number }

/** Read only existing browser state; unavailable or privacy-restricted fields stay null. */
export function capturePerformanceEnvironment(): PerformanceEnvironment {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const win = typeof window === 'undefined' ? null : window;
  const candidate = typeof document === 'undefined' ? null : document.getElementById('GameCanvas');
  const canvas = candidate?.tagName?.toLowerCase() === 'canvas' ? candidate as HTMLCanvasElement : null;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  // This is called after the game has started: getContext returns its existing context.
  if (canvas) {
    try { gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl'); } catch { /* Native/lost context. */ }
  }
  let webgl: PerformanceEnvironment['webgl'] = null;
  if (gl) {
    try {
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      const parameter = (key: number): string | null => {
        const value = gl!.getParameter(key);
        return typeof value === 'string' ? value : null;
      };
      webgl = {
        version: parameter(gl.VERSION),
        renderer: parameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vendor: parameter(extension ? extension.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        unmasked: Boolean(extension),
      };
    } catch { /* Keep unsupported WebGL metadata unavailable. */ }
  }
  const memory = typeof performance === 'undefined' ? null : (performance as any).memory;
  const numeric = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const heapValues = memory ? [memory.usedJSHeapSize, memory.totalJSHeapSize, memory.jsHeapSizeLimit] : null;
  return {
    capturedAt: new Date().toISOString(),
    userAgent: nav?.userAgent ?? null,
    platform: nav?.platform ?? null,
    hardwareConcurrency: numeric(nav?.hardwareConcurrency),
    deviceMemoryGB: numeric((nav as any)?.deviceMemory),
    devicePixelRatio: numeric(win?.devicePixelRatio),
    viewport: win ? { width: win.innerWidth, height: win.innerHeight } : null,
    framebuffer: gl ? { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, source: 'webgl' }
      : canvas ? { width: canvas.width, height: canvas.height, source: 'canvas' } : null,
    webgl,
    heap: heapValues?.every(value => numeric(value) !== null)
      ? { usedBytes: heapValues[0], totalBytes: heapValues[1], limitBytes: heapValues[2] } : null,
  };
}

/** No per-frame allocations; sorting and JSON serialization happen only on snapshot/stop/export. */
export class PerformanceProbe {
  readonly enabled: boolean;
  readonly durationSeconds: number;
  private readonly capacity: number;
  private readonly sectionNames: readonly string[];
  private readonly counterNames: readonly string[];
  private readonly now: () => number;
  private readonly environmentProvider: () => PerformanceEnvironment;
  private frames: TimingBuffer | null = null;
  private readonly sections = new Map<string, SectionBuffer>();
  private readonly counters = new Map<string, CounterBuffer>();
  private readonly runs: PerformanceRun[] = [];
  private running = false;
  private runSequence = 0;
  private label = '';
  private startedAt = 0;
  private environmentStart: PerformanceEnvironment | null = null;

  constructor(options: PerformanceProbeOptions = {}) {
    this.enabled = DEBUG && options.enabled === true;
    this.durationSeconds = Number.isFinite(options.durationSeconds) && options.durationSeconds! > 0
      ? options.durationSeconds! : 60;
    this.capacity = Number.isFinite(options.sampleCapacity) && options.sampleCapacity! > 0
      ? Math.min(100000, Math.max(1, Math.floor(options.sampleCapacity!))) : 18000;
    this.sectionNames = Array.from(new Set(options.sectionNames ?? ['update', 'world', 'ui', 'fx']));
    this.counterNames = Array.from(new Set(options.counterNames ?? []));
    this.now = options.now ?? (() => typeof performance === 'undefined' ? Date.now() : performance.now());
    this.environmentProvider = options.environmentProvider ?? capturePerformanceEnvironment;
  }

  get isRunning(): boolean { return this.running; }

  start(label?: string): boolean {
    if (!this.enabled || this.running) return false;
    this.frames ??= this.createBuffer();
    this.resetBuffer(this.frames);
    for (const name of this.sectionNames) {
      let section = this.sections.get(name);
      if (!section) {
        section = { ...this.createBuffer(), startedAt: NaN, workUnits: 0 };
        this.sections.set(name, section);
      }
      this.resetBuffer(section);
      section.startedAt = NaN;
      section.workUnits = 0;
    }
    for (const name of this.counterNames) {
      let counter = this.counters.get(name);
      if (!counter) {
        counter = { count: 0, sum: 0, latest: 0, min: Infinity, max: -Infinity };
        this.counters.set(name, counter);
      }
      counter.count = counter.sum = counter.latest = 0;
      counter.min = Infinity;
      counter.max = -Infinity;
    }
    this.runSequence++;
    this.label = label ?? `run-${this.runSequence}`;
    this.environmentStart = this.environmentProvider();
    this.startedAt = this.now();
    this.running = true;
    return true;
  }

  /** Pass the raw render-frame dt in seconds, not physics substeps or a clamped simulation dt. */
  recordFrame(dtSeconds: number): void {
    if (!this.running || !this.frames) return;
    this.recordTiming(this.frames, dtSeconds * 1000);
    if (this.now() - this.startedAt >= this.durationSeconds * 1000) this.finish('duration');
  }

  beginSection(name: string): void {
    if (!this.running) return;
    const section = this.sections.get(name);
    if (section && !Number.isFinite(section.startedAt)) section.startedAt = this.now();
  }

  endSection(name: string, workUnits = 1): void {
    if (!this.running) return;
    const section = this.sections.get(name);
    if (!section || !Number.isFinite(section.startedAt)) return;
    const duration = this.now() - section.startedAt;
    section.startedAt = NaN;
    this.recordTiming(section, duration);
    if (Number.isFinite(workUnits) && workUnits >= 0) section.workUnits += workUnits;
  }

  recordCounter(name: string, value: number): void {
    if (!this.running || !Number.isFinite(value)) return;
    const counter = this.counters.get(name);
    if (!counter) return;
    counter.count++;
    counter.sum += value;
    counter.latest = value;
    counter.min = Math.min(counter.min, value);
    counter.max = Math.max(counter.max, value);
  }

  snapshot(): PerformanceRun | null {
    if (!this.running || !this.frames || !this.environmentStart) return this.runs[this.runs.length - 1] ?? null;
    return this.buildRun('running', null);
  }

  stop(): PerformanceRun | null {
    return this.running ? this.finish('manual') : this.runs[this.runs.length - 1] ?? null;
  }

  exportJSON(): string {
    return JSON.stringify({
      schemaVersion: 1,
      debugBuild: DEBUG,
      enabled: this.enabled,
      targetAcceptance: { target: 'Android projector 1920x1080 at 60 fps', status: 'not-verified' },
      percentileMethod: 'nearest-rank; stored samples only if overflowCount is nonzero',
      runs: this.runs,
      activeRun: this.running ? this.snapshot() : null,
    }, null, 2);
  }

  private createBuffer(): TimingBuffer {
    return { values: new Float64Array(this.capacity), count: 0, stored: 0, invalid: 0, sum: 0, max: 0, over50: 0 };
  }

  private resetBuffer(buffer: TimingBuffer): void {
    buffer.count = buffer.stored = buffer.invalid = buffer.sum = buffer.max = buffer.over50 = 0;
  }

  private recordTiming(buffer: TimingBuffer, milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) { buffer.invalid++; return; }
    buffer.count++;
    buffer.sum += milliseconds;
    buffer.max = Math.max(buffer.max, milliseconds);
    if (milliseconds > 50) buffer.over50++;
    if (buffer.stored < buffer.values.length) buffer.values[buffer.stored++] = milliseconds;
  }

  private summarize(buffer: TimingBuffer): TimingSummary {
    const ordered = buffer.values.slice(0, buffer.stored).sort();
    const percentile = (p: number): number | null => ordered.length ? ordered[Math.ceil(ordered.length * p) - 1] : null;
    return {
      count: buffer.count, storedCount: buffer.stored, overflowCount: buffer.count - buffer.stored,
      invalidCount: buffer.invalid,
      averageMs: buffer.count ? buffer.sum / buffer.count : null,
      p95Ms: percentile(0.95), p99Ms: percentile(0.99), maxMs: buffer.count ? buffer.max : null,
      over50MsCount: buffer.over50, over50MsPercent: buffer.count ? buffer.over50 / buffer.count * 100 : null,
    };
  }

  private buildRun(status: PerformanceRun['status'], reason: PerformanceRun['reason']): PerformanceRun {
    const sections: PerformanceRun['sections'] = Object.create(null);
    const counters: PerformanceRun['counters'] = Object.create(null);
    for (const [name, section] of this.sections) sections[name] = { ...this.summarize(section), workUnits: section.workUnits };
    for (const [name, counter] of this.counters) counters[name] = {
      count: counter.count, latest: counter.count ? counter.latest : null,
      average: counter.count ? counter.sum / counter.count : null,
      min: counter.count ? counter.min : null, max: counter.count ? counter.max : null,
    };
    const frameTiming = this.summarize(this.frames!);
    return {
      label: this.label, status, reason,
      requestedDurationSeconds: this.durationSeconds,
      elapsedSeconds: Math.max(0, (this.now() - this.startedAt) / 1000),
      frameTiming, averageFps: frameTiming.averageMs ? 1000 / frameTiming.averageMs : null,
      sections, counters, environmentStart: this.environmentStart!,
      environmentEnd: status === 'running' ? null : this.environmentProvider(),
    };
  }

  private finish(reason: 'duration' | 'manual'): PerformanceRun {
    const run = this.buildRun(reason === 'duration' ? 'completed' : 'stopped', reason);
    this.running = false;
    this.runs.push(run);
    if (this.runs.length > 3) this.runs.shift();
    return run;
  }
}
