// SPDX-FileCopyrightText: 2025 Speechify, Inc.
//
// SPDX-License-Identifier: Apache-2.0

// Local smoke runner for the Speechify TTS plugin.
//
// Synthesizes text against the live Speechify API (no LiveKit room required),
// writes a WAV file, and prints word-level timestamps and time-to-first-audio
// for both the one-shot synthesize() and the streamed stream() paths.
//
// Usage:
//   export SPEECHIFY_API_KEY=...
//   pnpm build && node dist/../scripts/synthesize.js "Hello from Speechify."
//   (or: pnpm example "Hello from Speechify.")

import { USERDATA_TIMED_TRANSCRIPT, initializeLogger } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import { writeFileSync } from 'node:fs';
import { TTS } from '../src/tts.js';

const SAMPLE_RATE = 24000;
const NUM_CHANNELS = 1;

const writeWav = (path: string, frames: AudioFrame[]): void => {
  const pcm = Buffer.concat(
    frames.map((f) => Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength)),
  );
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * 2, 28);
  header.writeUInt16LE(NUM_CHANNELS * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([header, pcm]));
};

const collect = async (
  stream: AsyncIterable<unknown>,
): Promise<{ ttfb: number; frames: AudioFrame[]; words: string[] }> => {
  const start = Date.now();
  let ttfb = -1;
  const frames: AudioFrame[] = [];
  const words: string[] = [];
  for await (const ev of stream) {
    if (typeof ev === 'symbol') break;
    const audio = ev as { frame: AudioFrame & { userdata: Record<string, unknown> } };
    if (ttfb < 0) ttfb = (Date.now() - start) / 1000;
    frames.push(audio.frame);
    const timed = audio.frame.userdata[USERDATA_TIMED_TRANSCRIPT] as
      | { text: string; startTime: number }[]
      | undefined;
    if (timed) words.push(...timed.map((t) => `${t.text}@${t.startTime.toFixed(2)}`));
  }
  return { ttfb, frames, words };
};

const durationSec = (frames: AudioFrame[]): number =>
  frames.reduce((s, f) => s + f.samplesPerChannel / f.sampleRate, 0);

async function main(): Promise<void> {
  initializeLogger({ pretty: false, level: 'silent' });
  const text = process.argv[2] ?? 'Hello from the Speechify LiveKit plugin.';
  const tts = new TTS();
  console.log(`provider=${tts.provider} model=${tts.model} sampleRate=${tts.sampleRate}`);

  console.log('\n== synthesize() ==');
  const s = await collect(tts.synthesize(text));
  writeWav('synthesize.wav', s.frames);
  console.log(
    `  ttfb=${s.ttfb.toFixed(2)}s audio=${durationSec(s.frames).toFixed(2)}s frames=${s.frames.length} -> synthesize.wav`,
  );
  console.log(`  words: ${s.words.join(' ')}`);

  console.log('\n== stream() ==');
  const stream = tts.stream();
  stream.pushText(text);
  stream.endInput();
  const st = await collect(stream);
  stream.close();
  writeWav('stream.wav', st.frames);
  console.log(
    `  ttfb=${st.ttfb.toFixed(2)}s audio=${durationSec(st.frames).toFixed(2)}s frames=${st.frames.length} -> stream.wav`,
  );
  console.log(`  words: ${st.words.join(' ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
