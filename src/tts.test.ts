// SPDX-FileCopyrightText: 2025 Speechify, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import { APIError, USERDATA_TIMED_TRANSCRIPT, initializeLogger } from '@livekit/agents';
import { Speechify, SpeechifyError } from '@speechify/api';
import { describe, expect, it, vi } from 'vitest';
import { TTS } from './tts.js';

initializeLogger({ pretty: false, level: 'silent' });

// The LiveKit TTS base surfaces synthesis errors via the `error` event, then its
// internal retry/trace task rejects asynchronously after the assertion resolves.
// That late rejection is an expected artifact, so ignore APIErrors for this file
// while still re-throwing anything genuinely unexpected.
process.on('unhandledRejection', (err: unknown) => {
  if (err instanceof APIError) return;
  throw err;
});

const SAMPLE_RATE = 24000;

const pcmBase64 = (seconds: number): string => {
  const samples = Math.round(seconds * SAMPLE_RATE);
  return Buffer.from(new Int16Array(samples).buffer).toString('base64');
};

const marks = (
  words: { value: string; start: number; end: number }[],
): Speechify.SpeechMarks => ({
  type: 'sentence',
  start: 0,
  end: 0,
  start_time: words[0]?.start ?? 0,
  end_time: words[words.length - 1]?.end ?? 0,
  chunks: words.map((w) => ({
    type: 'word',
    value: w.value,
    start: 0,
    end: 0,
    start_time: w.start,
    end_time: w.end,
  })),
});

const fakeClient = (speech: (req: Speechify.GetSpeechRequest) => Speechify.GetSpeechResponse) =>
  ({ audio: { speech: vi.fn(async (req: Speechify.GetSpeechRequest) => speech(req)) } }) as never;

const collect = async (stream: AsyncIterableIterator<unknown>) => {
  let bytes = 0;
  let frames = 0;
  const words: { text: string; startTime: number }[] = [];
  for await (const ev of stream) {
    if (typeof ev === 'symbol') break;
    const audio = ev as { frame: { data: { byteLength: number }; userdata: Record<string, unknown> } };
    frames++;
    bytes += audio.frame.data.byteLength;
    const timed = audio.frame.userdata[USERDATA_TIMED_TRANSCRIPT] as
      | { text: string; startTime: number }[]
      | undefined;
    if (timed) words.push(...timed.map((t) => ({ text: t.text, startTime: t.startTime })));
  }
  return { bytes, frames, words };
};

describe('Speechify TTS', () => {
  it('throws without an API key', () => {
    const prev = process.env.SPEECHIFY_API_KEY;
    delete process.env.SPEECHIFY_API_KEY;
    expect(() => new TTS({})).toThrow(/API key is required/);
    if (prev !== undefined) process.env.SPEECHIFY_API_KEY = prev;
  });

  it('reports streaming + aligned transcript capabilities', () => {
    const tts = new TTS({ apiKey: 'sk_test', client: fakeClient(() => ({}) as never) });
    expect(tts.capabilities.streaming).toBe(true);
    expect(tts.capabilities.alignedTranscript).toBe(true);
    expect(tts.sampleRate).toBe(SAMPLE_RATE);
    expect(tts.numChannels).toBe(1);
    expect(tts.provider).toBe('Speechify');
  });

  it('synthesize() emits PCM frames and word marks from one /audio/speech call', async () => {
    const tts = new TTS({
      apiKey: 'sk_test',
      client: fakeClient(() => ({
        audio_data: pcmBase64(1),
        audio_format: 'pcm',
        billable_characters_count: 5,
        speech_marks: marks([
          { value: 'Hello', start: 0, end: 500 },
          { value: 'world.', start: 500, end: 1000 },
        ]),
      })),
    });

    const { bytes, frames, words } = await collect(tts.synthesize('Hello world.'));
    expect(frames).toBeGreaterThan(0);
    expect(bytes).toBe(SAMPLE_RATE * 2);
    expect(words.map((w) => w.text)).toEqual(['Hello', 'world.']);
    expect(words[0]!.startTime).toBeCloseTo(0);
    expect(words[1]!.startTime).toBeCloseTo(0.5);
  });

  it('stream() chunks by sentence and offsets marks monotonically across sentences', async () => {
    // Sentences must exceed the tokenizer's minSentenceLength (20) to split.
    const first = 'The quick brown fox jumps over the lazy dog.';
    const second = 'Pack my box with five dozen liquor jugs now.';
    const responses: Record<string, Speechify.GetSpeechResponse> = {
      [first]: {
        audio_data: pcmBase64(1),
        audio_format: 'pcm',
        billable_characters_count: 2,
        speech_marks: marks([
          { value: 'The', start: 0, end: 400 },
          { value: 'dog.', start: 400, end: 900 },
        ]),
      },
      [second]: {
        audio_data: pcmBase64(1),
        audio_format: 'pcm',
        billable_characters_count: 2,
        speech_marks: marks([
          { value: 'Pack', start: 0, end: 400 },
          { value: 'now.', start: 400, end: 800 },
        ]),
      },
    };

    const tts = new TTS({
      apiKey: 'sk_test',
      client: fakeClient((req) => responses[req.input.trim()]!),
    });

    const stream = tts.stream();
    stream.pushText(`${first} ${second}`);
    stream.flush();
    stream.endInput();

    const { words, bytes } = await collect(stream);
    expect(words.map((w) => w.text)).toEqual(['The', 'dog.', 'Pack', 'now.']);
    // second sentence marks are offset by the first sentence's 1s of audio
    expect(words[2]!.startTime).toBeCloseTo(1.0);
    expect(words[3]!.startTime).toBeCloseTo(1.4);
    const times = words.map((w) => w.startTime);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    expect(bytes).toBe(SAMPLE_RATE * 2 * 2);
  });

  it('surfaces SpeechifyError as an APIStatusError via the error event', async () => {
    const tts = new TTS({
      apiKey: 'sk_test',
      client: fakeClient(() => {
        throw new SpeechifyError({ message: 'boom', statusCode: 429 });
      }),
    });

    const errorEvent = new Promise<{ statusCode?: number }>((resolve) => {
      tts.on('error', (ev) => resolve(ev.error as { statusCode?: number }));
    });

    await collect(tts.synthesize('fails'));
    expect(await errorEvent).toMatchObject({ statusCode: 429 });
  });
});

describe.skipIf(!process.env.SPEECHIFY_API_KEY)('Speechify TTS (live)', () => {
  it('streams real audio with monotonic word marks across sentences', async () => {
    const tts = new TTS({ voiceId: 'jack', model: 'simba-3.0' });
    const stream = tts.stream();
    stream.pushText(
      'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs now.',
    );
    stream.flush();
    stream.endInput();

    const { bytes, frames, words } = await collect(stream);
    expect(frames).toBeGreaterThan(0);
    expect(bytes).toBeGreaterThan(0);
    expect(words.length).toBeGreaterThan(0);
    const times = words.map((w) => w.startTime);
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
  });
});
