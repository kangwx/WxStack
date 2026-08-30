import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 24000;
const OUTPUT_DIR = path.resolve(process.cwd(), 'assets/resources/audio');
const TWO_PI = Math.PI * 2;
const NATURAL_MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MAJOR_NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const C5_MIDI = 72;

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

const PERFECT_NOTES = NATURAL_MAJOR_INTERVALS.map((semitoneOffset, index) => [
  `perfect-major-${NATURAL_MAJOR_NOTE_NAMES[index]}5`,
  midiToFrequency(C5_MIDI + semitoneOffset),
]);

const PERFECT_RISE_NOTES = NATURAL_MAJOR_INTERVALS.map((semitoneOffset, index) => [
  `perfect-rise-${NATURAL_MAJOR_NOTE_NAMES[index]}`,
  semitoneOffset,
]);

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function smooth(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function pluckEnvelope(time, duration, attack, decay, release = 0.045) {
  if (time < 0 || time >= duration) return 0;
  const attackGain = smooth(time / attack);
  const releaseGain = smooth((duration - time) / release);
  return attackGain * Math.exp(-time / decay) * releaseGain;
}

function makeRng(seedText) {
  let seed = 2166136261;
  for (const char of seedText) {
    seed ^= char.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function addBell(samples, start, duration, frequency, gain = 1) {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const endIndex = Math.min(samples.length, Math.ceil((start + duration) * SAMPLE_RATE));
  let phase = 0;
  for (let index = startIndex; index < endIndex; index += 1) {
    const localTime = index / SAMPLE_RATE - start;
    const envelope = pluckEnvelope(localTime, duration, 0.0035, 0.075, 0.06);
    phase += (TWO_PI * frequency) / SAMPLE_RATE;
    const body = 0.7 * Math.sin(phase)
      + 0.22 * triangle(phase)
      + 0.08 * Math.sin(phase * 2.01);
    samples[index] += gain * envelope * body;
  }
}

function addShepardBell(samples, start, duration, semitoneOffset, gain = 1) {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const endIndex = Math.min(samples.length, Math.ceil((start + duration) * SAMPLE_RATE));
  const spectralCenter = midiToFrequency(84); // C6: clear on phones without becoming piercing.
  const widthInOctaves = 1.12;
  const voices = [];

  for (let octave = 2; octave <= 8; octave += 1) {
    const midi = 24 + octave * 12 + semitoneOffset;
    const frequency = midiToFrequency(midi);
    if (frequency >= SAMPLE_RATE * 0.42) continue;
    const octaveDistance = Math.log2(frequency / spectralCenter);
    const weight = Math.exp(-0.5 * (octaveDistance / widthInOctaves) ** 2);
    if (weight > 0.006) voices.push({ frequency, weight, phase: 0 });
  }

  const weightSum = voices.reduce((sum, voice) => sum + voice.weight, 0);
  for (let index = startIndex; index < endIndex; index += 1) {
    const localTime = index / SAMPLE_RATE - start;
    const envelope = pluckEnvelope(localTime, duration, 0.0045, 0.064, 0.055);
    let body = 0;
    for (const voice of voices) {
      voice.phase += (TWO_PI * voice.frequency) / SAMPLE_RATE;
      body += (voice.weight / weightSum) * Math.sin(voice.phase);
    }
    samples[index] += gain * envelope * body;
  }
}

function addPianoNote(samples, seedText, start, duration, frequency, gain = 1) {
  const startIndex = Math.floor(start * SAMPLE_RATE);
  const endIndex = Math.min(samples.length, Math.ceil((start + duration) * SAMPLE_RATE));
  const rng = makeRng(seedText);
  const partialGains = [1, 0.62, 0.38, 0.24, 0.15, 0.095, 0.06, 0.038];
  const lowerPhases = partialGains.map(() => 0);
  const mainPhases = partialGains.map(() => 0);
  const upperPhases = partialGains.map(() => 0);
  const lowerStringRatio = 2 ** (-1.7 / 1200);
  const upperStringRatio = 2 ** (1.4 / 1200);
  const baseDecay = 0.56 * Math.sqrt(440 / frequency);
  let lowNoise = 0;
  let brightNoise = 0;
  let hammerPhase = 0;

  for (let index = startIndex; index < endIndex; index += 1) {
    const time = index / SAMPLE_RATE - start;
    const attack = 1 - Math.exp(-time / 0.0018);
    const release = smooth((duration - time) / 0.36);
    let tone = 0;

    for (let partialIndex = 0; partialIndex < partialGains.length; partialIndex += 1) {
      const harmonic = partialIndex + 1;
      const inharmonicity = Math.sqrt(1 + 0.00018 * harmonic * harmonic);
      const partialFrequency = frequency * harmonic * inharmonicity;
      lowerPhases[partialIndex] += (TWO_PI * partialFrequency * lowerStringRatio) / SAMPLE_RATE;
      mainPhases[partialIndex] += (TWO_PI * partialFrequency) / SAMPLE_RATE;
      upperPhases[partialIndex] += (TWO_PI * partialFrequency * upperStringRatio) / SAMPLE_RATE;

      const decayTime = baseDecay / (1 + partialIndex * 0.34);
      const slowMix = 0.18 / (1 + partialIndex * 0.25);
      const partialEnvelope = attack * release * (
        (1 - slowMix) * Math.exp(-time / decayTime)
        + slowMix * Math.exp(-time / (decayTime * 2.3))
      );
      const strings = 0.24 * Math.sin(lowerPhases[partialIndex])
        + 0.52 * Math.sin(mainPhases[partialIndex])
        + 0.24 * Math.sin(upperPhases[partialIndex]);
      tone += partialGains[partialIndex] * partialEnvelope * strings;
    }

    const noise = rng() * 2 - 1;
    lowNoise += 0.13 * (noise - lowNoise);
    brightNoise += 0.55 * ((noise - lowNoise) - brightNoise);
    hammerPhase += (TWO_PI * 2400) / SAMPLE_RATE;
    const hammerEnvelope = Math.exp(-time / 0.006) * release;
    const hammer = brightNoise * 0.026 + Math.sin(hammerPhase) * 0.01;
    samples[index] += gain * (tone + hammer * hammerEnvelope);
  }
}

function addRoomTaps(samples) {
  const dry = samples.slice();
  const taps = [[0.037, 0.075], [0.068, 0.04]];
  for (const [delay, gain] of taps) {
    const delaySamples = Math.round(delay * SAMPLE_RATE);
    let softened = 0;
    for (let index = delaySamples; index < samples.length; index += 1) {
      softened += 0.34 * (dry[index - delaySamples] - softened);
      samples[index] += softened * gain;
    }
  }
}

function addWoodTick(samples, seedText, cents = 0, gain = 1) {
  const rng = makeRng(seedText);
  const duration = Math.min(0.09, samples.length / SAMPLE_RATE);
  const baseFrequency = 360 * 2 ** (cents / 1200);
  let phase = 0;
  let filteredNoise = 0;
  for (let index = 0; index < Math.floor(duration * SAMPLE_RATE); index += 1) {
    const time = index / SAMPLE_RATE;
    const frequency = baseFrequency - 90 * (time / duration);
    phase += (TWO_PI * frequency) / SAMPLE_RATE;
    const noise = rng() * 2 - 1;
    filteredNoise += 0.22 * (noise - filteredNoise);
    const bodyEnvelope = pluckEnvelope(time, duration, 0.0015, 0.026, 0.028);
    const noiseEnvelope = Math.exp(-time / 0.009) * smooth((duration - time) / 0.025);
    samples[index] += gain * (
      triangle(phase) * bodyEnvelope * 0.78
      + filteredNoise * noiseEnvelope * 0.22
    );
  }
}

function addBlockCut(samples, seedText, cents = 0) {
  const rng = makeRng(`${seedText}-block-cut`);
  const duration = Math.min(0.21, samples.length / SAMPLE_RATE);
  const pitchRatio = 2 ** (cents / 1200);
  const modeFrequencies = [92, 385, 645, 1135, 1490, 2630]
    .map((frequency) => frequency * pitchRatio * (0.99 + rng() * 0.02));
  const modeGains = [0.13, 0.17, 0.12, 1, 0.16, 0.22];
  const modeDecays = [0.036, 0.035, 0.027, 0.026, 0.019, 0.012];
  const modeSweeps = [0.025, 0.04, 0.045, 0.095, 0.055, 0.035];
  const events = [
    {
      start: 0.004 + (rng() - 0.5) * 0.002,
      gain: 1,
      attack: 0.008,
      modeShape: [1, 1, 1, 1, 1, 1],
      phases: modeFrequencies.map(() => 0),
    },
    {
      start: 0.092 + (rng() - 0.5) * 0.006,
      gain: 0.58 + rng() * 0.06,
      attack: 0.005,
      modeShape: [1.2, 2.4, 1.2, 0.35, 0.3, 0.12],
      phases: modeFrequencies.map(() => 0),
    },
  ];
  let lowNoise = 0;
  let cutBand = 0;

  for (let index = 0; index < Math.floor(duration * SAMPLE_RATE); index += 1) {
    const time = index / SAMPLE_RATE;
    const release = smooth((duration - time) / 0.022);
    const noise = rng() * 2 - 1;
    lowNoise += 0.09 * (noise - lowNoise);
    cutBand += 0.48 * ((noise - lowNoise) - cutBand);

    let cut = 0;
    for (const event of events) {
      const eventTime = time - event.start;
      if (eventTime < 0 || eventTime >= 0.09) continue;

      const eventAttack = smooth(eventTime / event.attack);
      for (let modeIndex = 0; modeIndex < modeFrequencies.length; modeIndex += 1) {
        const modeFrequency = modeFrequencies[modeIndex]
          * (1 + modeSweeps[modeIndex] * Math.exp(-eventTime / 0.012));
        event.phases[modeIndex] += (TWO_PI * modeFrequency) / SAMPLE_RATE;
        const modeEnvelope = eventAttack
          * Math.exp(-eventTime / modeDecays[modeIndex])
          * smooth((0.09 - eventTime) / 0.022);
        cut += event.gain * modeGains[modeIndex] * event.modeShape[modeIndex]
          * Math.sin(event.phases[modeIndex])
          * modeEnvelope;
      }

      const crackEnvelope = eventAttack
        * Math.exp(-eventTime / 0.011)
        * smooth((0.055 - eventTime) / 0.016);
      cut += cutBand * crackEnvelope * event.gain * 0.14;
    }

    samples[index] += cut;
  }
}

function render(duration, draw, targetPeak) {
  const samples = new Float64Array(Math.ceil(duration * SAMPLE_RATE));
  draw(samples);
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? targetPeak / peak : 1;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = clamp(samples[index] * gain);
  }
  return samples;
}

function makeStart() {
  return render(1.32, (samples) => {
    addPianoNote(samples, 'start-a3', 0.018, 1.18, 220, 0.62);
    addPianoNote(samples, 'start-cs4', 0.024, 1.16, 277.18, 0.88);
    addPianoNote(samples, 'start-e4', 0.031, 1.14, 329.63, 0.86);
    addPianoNote(samples, 'start-a4', 0.038, 1.1, 440, 0.58);
    addPianoNote(samples, 'start-e5', 0.05, 1.03, 659.25, 0.2);
    addRoomTaps(samples);
  }, 0.52);
}

function makeCut(name, cents) {
  return render(0.21, (samples) => addBlockCut(samples, name, cents), 0.53);
}

function makePerfect(name, frequency) {
  return render(0.22, (samples) => {
    addWoodTick(samples, name, -8, 0.34);
    addBell(samples, 0.008, 0.21, frequency, 1);
  }, 0.52);
}

function makeRisingPerfect(name, semitoneOffset) {
  return render(0.2, (samples) => {
    addWoodTick(samples, name, -8, 0.3);
    addShepardBell(samples, 0.008, 0.19, semitoneOffset, 1);
  }, 0.42);
}

function makeEnd() {
  return render(0.43, (samples) => {
    addBell(samples, 0, 0.15, 554.37, 0.72);
    addBell(samples, 0.09, 0.16, 493.88, 0.76);
    addBell(samples, 0.18, 0.2, 440, 0.82);

    let phase = 0;
    const start = Math.floor(0.16 * SAMPLE_RATE);
    for (let index = start; index < samples.length; index += 1) {
      const time = index / SAMPLE_RATE - 0.16;
      const duration = 0.27;
      const frequency = 260 - 50 * (time / duration);
      phase += (TWO_PI * frequency) / SAMPLE_RATE;
      const envelope = pluckEnvelope(time, duration, 0.004, 0.085, 0.08);
      samples[index] += Math.sin(phase) * envelope * 0.55;
    }
  }, 0.48);
}

function writeWav(filename, samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(Math.round(samples[index] * 32767), 44 + index * 2);
  }
  fs.writeFileSync(path.join(OUTPUT_DIR, `${filename}.wav`), buffer);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const perfectOnly = process.argv.includes('--perfect-only');
let generatedCount = 0;

if (!perfectOnly) {
  writeWav('start', makeStart());
  writeWav('end', makeEnd());
  writeWav('cut-1', makeCut('cut-1', -12));
  writeWav('cut-2', makeCut('cut-2', 0));
  writeWav('cut-3', makeCut('cut-3', 10));
  generatedCount += 5;
}
for (const [name, frequency] of PERFECT_NOTES) {
  writeWav(name, makePerfect(name, frequency));
  generatedCount += 1;
}
for (const [name, semitoneOffset] of PERFECT_RISE_NOTES) {
  writeWav(name, makeRisingPerfect(name, semitoneOffset));
  generatedCount += 1;
}

console.log(`Generated ${generatedCount} original WAV files in ${OUTPUT_DIR}`);
