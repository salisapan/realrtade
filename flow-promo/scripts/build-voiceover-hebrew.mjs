/**
 * Renders the Hebrew narration with espeak-ng (the only fully-offline
 * Hebrew TTS available in this environment — no Higgsfield credits, no
 * cloud TTS keys), normalizes each line, and places it at its scripted
 * frame in public/voiceover-hebrew.wav.
 *
 * Mirrors the VO_LINES in src/timelineHebrew.ts as literals (this script
 * has no TS build step) — keep the two in sync by hand.
 *
 * Requires: espeak-ng (apt), and Remotion's bundled ffmpeg (npx remotion
 * ffmpeg) for loudness normalization + resample to 48kHz stereo.
 *
 * Run: node scripts/build-voiceover-hebrew.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SR = 48000;
const FPS = 60;
const TOTAL_FRAMES = 5280; // matches timelineHebrew.ts TOTAL

const VO_LINES = [
  {
    frame: 20,
    text: 'כל יום, אנשי מקצוע בתעשיות המפוקחות עושים את אותה עבודה. פותחים מייל, מעתיקים נתון, עוברים למערכת, מדביקים, בודקים שוב ושוב.',
  },
  {
    frame: 700,
    text: 'פלואו הוא לא עוד עוזר שכותב תשובה. הוא תשתית ביצוע שמבינה כוונה ופועלת בתוך המערכות שלכם, באופן דטרמיניסטי ומתועד.',
  },
  {
    frame: 1280,
    text: 'עורך דין. עסקת נדלן. פלואו ממלא, מאמת, ומדווח, ישירות לרשות המסים.',
  },
  {
    frame: 2110,
    text: 'סוכנת ביטוח. פוליסת מנהלים. פלואו תופס פער של ארבע מאות וחמישים שקלים שאף אחד לא היה שם לב אליו, לפני שהוא הופך לבעיה.',
  },
  {
    frame: 2940,
    text: 'רכזת פרויקט התחדשות עירונית. פלואו לא רק מעדכן תיק. הוא מראה לך ברגע שהחתימה הזו חוצה את הסף החוקי.',
  },
  {
    frame: 3820,
    text: 'עורך דין. סוכנת ביטוח. רכזת נדלן. תעשיות שונות. אותה שיטת עבודה. פלואו צופה, תופס את מה שהעין מפספסת, ופועל רק אחרי שאתם אומרים בצע.',
  },
  {
    frame: 4570,
    text: 'פלואו. לא עוד כלי. תשתית ביצוע.',
  },
];

const tmp = join(tmpdir(), `flow-promo-voiceover-${Date.now()}`);
mkdirSync(tmp, { recursive: true });

const readWav = (path) => {
  const buf = readFileSync(path);
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  // find the 'data' chunk (skip any extra chunks like LIST/fact)
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset < buf.length - 8) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataOffset === -1) throw new Error(`no data chunk in ${path}`);
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = dataSize / (bytesPerSample * numChannels);
  return { buf, dataOffset, numChannels, sampleRate, bytesPerSample, frameCount };
};

const N = Math.ceil((TOTAL_FRAMES / FPS) * SR);
const L = new Float64Array(N);
const R = new Float64Array(N);

console.log(`Synthesizing ${VO_LINES.length} Hebrew VO lines with espeak-ng...`);

VO_LINES.forEach((line, i) => {
  const raw = join(tmp, `line${i}-raw.wav`);
  const processed = join(tmp, `line${i}-processed.wav`);

  execFileSync('espeak-ng', ['-v', 'he', '-s', '142', '-p', '42', '-w', raw, line.text]);

  execFileSync('npx', [
    'remotion',
    'ffmpeg',
    '-y',
    '-i',
    raw,
    '-af',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar',
    String(SR),
    '-ac',
    '2',
    processed,
  ]);

  const wav = readWav(processed);
  const startSample = Math.round((line.frame / FPS) * SR);
  const durationSeconds = wav.frameCount / wav.sampleRate;

  for (let s = 0; s < wav.frameCount; s++) {
    const j = startSample + s;
    if (j >= N) break;
    const base = wav.dataOffset + s * wav.bytesPerSample * wav.numChannels;
    const l = wav.buf.readInt16LE(base) / 32768;
    const r = wav.numChannels > 1 ? wav.buf.readInt16LE(base + wav.bytesPerSample) / 32768 : l;
    L[j] += l;
    R[j] += r;
  }

  console.log(`  line ${i}: frame ${line.frame} (${(line.frame / FPS).toFixed(2)}s), duration ${durationSeconds.toFixed(2)}s`);
});

rmSync(tmp, { recursive: true, force: true });

// ---- mix: soft-clip, then fade the very edges to avoid pops ---------------
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = peak > 0 ? Math.min(1, 0.9 / peak) : 1;

const fade = Math.round(0.05 * SR);
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);

const clip = (v) => Math.tanh(v) * 32767;
for (let i = 0; i < N; i++) {
  let g = norm;
  if (i < fade) g *= i / fade;
  if (i > N - fade) g *= (N - i) / fade;
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clip(L[i] * g)))), 44 + i * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clip(R[i] * g)))), 44 + i * 4 + 2);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/voiceover-hebrew.wav', buf);
console.log(
  `wrote public/voiceover-hebrew.wav — ${(N / SR).toFixed(2)}s, ${(buf.length / 1e6).toFixed(1)} MB, peak ${peak.toFixed(2)}`,
);
