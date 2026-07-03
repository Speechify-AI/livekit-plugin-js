// SPDX-FileCopyrightText: 2025 Speechify, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import {
  APIConnectionError,
  APIStatusError,
  type APIConnectOptions,
  AudioByteStream,
  shortuuid,
  tts,
} from '@livekit/agents';
import { Speechify, SpeechifyClient, SpeechifyError } from '@speechify/api';
import type { TTSEncoding, TTSModels } from './models.js';

const NUM_CHANNELS = 1;
const DEFAULT_VOICE_ID = 'jack';
const DEFAULT_ENCODING: TTSEncoding = 'ogg_24000';

const ACCEPT_BY_FORMAT: Record<string, Speechify.StreamAudioRequestAccept> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  pcm: 'audio/pcm',
};

export interface TTSOptions {
  voiceId: string;
  encoding: TTSEncoding;
  model?: TTSModels;
  language?: string;
  loudnessNormalization?: boolean;
  textNormalization?: boolean;
  apiKey?: string;
  baseUrl?: string;
  client?: SpeechifyClient;
}

const formatFromEncoding = (encoding: TTSEncoding): string => encoding.split('_', 1)[0]!;
const sampleRateFromEncoding = (encoding: TTSEncoding): number =>
  parseInt(encoding.split('_')[1]!, 10);

const defaultOptions = (): Omit<TTSOptions, 'client'> => ({
  voiceId: DEFAULT_VOICE_ID,
  encoding: DEFAULT_ENCODING,
});

export class TTS extends tts.TTS {
  label = 'speechify.TTS';
  #opts: TTSOptions;
  #client: SpeechifyClient;

  /**
   * Create a new instance of Speechify TTS.
   *
   * @remarks
   * `apiKey` must be set, either via the constructor or the `SPEECHIFY_API_KEY`
   * environment variable. Pass a preconfigured `client` to reuse an existing
   * `SpeechifyClient` (in which case `apiKey`/`baseUrl` are ignored).
   */
  constructor(opts: Partial<TTSOptions> = {}) {
    const merged = { ...defaultOptions(), ...opts };
    const sampleRate = sampleRateFromEncoding(merged.encoding);

    super(sampleRate, NUM_CHANNELS, { streaming: false });

    this.#opts = merged;

    if (merged.client) {
      this.#client = merged.client;
    } else {
      const apiKey = merged.apiKey ?? process.env.SPEECHIFY_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Speechify API key is required, whether as an argument or as $SPEECHIFY_API_KEY',
        );
      }
      this.#client = new SpeechifyClient({ apiKey, baseUrl: merged.baseUrl });
    }
  }

  get model(): string {
    return this.#opts.model ?? 'unknown';
  }

  get provider(): string {
    return 'Speechify';
  }

  get client(): SpeechifyClient {
    return this.#client;
  }

  get options(): TTSOptions {
    return this.#opts;
  }

  updateOptions(opts: Partial<Omit<TTSOptions, 'client' | 'apiKey' | 'baseUrl' | 'encoding'>>) {
    this.#opts = { ...this.#opts, ...opts };
  }

  synthesize(text: string, connOptions?: APIConnectOptions): tts.ChunkedStream {
    return new ChunkedStream(this, text, this.#opts, connOptions);
  }

  stream(): tts.SynthesizeStream {
    throw new Error('streaming is not supported by Speechify TTS, use synthesize() instead');
  }
}

export class ChunkedStream extends tts.ChunkedStream {
  label = 'speechify.ChunkedStream';
  #opts: TTSOptions;
  #tts: TTS;
  #timeoutInSeconds?: number;

  constructor(ttsInstance: TTS, text: string, opts: TTSOptions, connOptions?: APIConnectOptions) {
    super(text, ttsInstance, connOptions);
    this.#tts = ttsInstance;
    this.#opts = opts;
    this.#timeoutInSeconds =
      connOptions?.timeoutMs !== undefined ? connOptions.timeoutMs / 1000 : undefined;
  }

  protected async run() {
    const requestId = shortuuid();
    const opts = this.#opts;
    const sampleRate = sampleRateFromEncoding(opts.encoding);
    const bstream = new AudioByteStream(sampleRate, NUM_CHANNELS);

    const request: Speechify.GetStreamRequest = {
      Accept: ACCEPT_BY_FORMAT[formatFromEncoding(opts.encoding)]!,
      input: this.inputText,
      voice_id: opts.voiceId,
    };
    if (opts.model) request.model = opts.model;
    if (opts.language) request.language = opts.language;
    if (opts.loudnessNormalization !== undefined || opts.textNormalization !== undefined) {
      request.options = {
        loudness_normalization: opts.loudnessNormalization,
        text_normalization: opts.textNormalization,
      };
    }

    const pushFrames = (chunk: Uint8Array, final: boolean) => {
      const frames = final ? bstream.flush() : bstream.write(chunk);
      for (const frame of frames) {
        this.queue.put({ requestId, frame, final: false, segmentId: requestId });
      }
    };

    try {
      const response = await this.#tts.client.audio.stream(request, {
        abortSignal: this.abortSignal,
        timeoutInSeconds: this.#timeoutInSeconds,
      });

      const readable = response.stream();
      if (readable) {
        for await (const chunk of readable) {
          pushFrames(chunk as Uint8Array, false);
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        pushFrames(bytes, false);
      }
      pushFrames(new Uint8Array(0), true);
      this.queue.close();
    } catch (e) {
      if (this.abortSignal.aborted) {
        if (!this.queue.closed) this.queue.close();
        return;
      }
      if (!this.queue.closed) this.queue.close();
      if (e instanceof SpeechifyError) {
        throw new APIStatusError({
          message: e.message,
          options: { statusCode: e.statusCode ?? -1 },
        });
      }
      throw new APIConnectionError({ message: e instanceof Error ? e.message : String(e) });
    }
  }
}
