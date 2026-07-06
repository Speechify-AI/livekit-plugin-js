# Speechify plugin for LiveKit Agents (Node.js)

Speechify text-to-speech for [LiveKit Agents](https://docs.livekit.io/agents/) on Node.js, maintained by Speechify.

> **This repository is the maintenance source for the plugin. Distribution is handled by LiveKit.**
>
> The plugin ships inside the [`livekit/agents-js`](https://github.com/livekit/agents-js) monorepo and is published to npm by LiveKit as [`@livekit/agents-plugin-speechify`](https://www.npmjs.com/package/@livekit/agents-plugin-speechify). This repo mirrors that code so Speechify can maintain it, triage issues, and propose changes upstream. Bugs and contributions specific to the Speechify plugin are welcome here; releases are cut by LiveKit.

## Installation

```bash
npm install @livekit/agents-plugin-speechify
# or
pnpm add @livekit/agents-plugin-speechify
# or
yarn add @livekit/agents-plugin-speechify
```

## Authentication

Set your Speechify API key via the environment:

```bash
export SPEECHIFY_API_KEY="your-api-key"
```

Or pass it directly with `apiKey`.

## Usage

```typescript
import { AgentSession } from '@livekit/agents';
import * as speechify from '@livekit/agents-plugin-speechify';

const session = new AgentSession({
  tts: new speechify.TTS({
    voiceId: 'jack',
    model: 'simba-3.0',
  }),
});
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `voiceId` | `'jack'` | Voice to synthesize with (see the Speechify `/v1/voices` endpoint). |
| `model` | provider default | `simba-english`, `simba-multilingual`, or `simba-3.0`. |
| `language` | provider default | BCP-47 code of the input, e.g. `en-US`. |
| `loudnessNormalization` | provider default | Normalize output loudness. |
| `textNormalization` | provider default | Expand numbers/dates into words before synthesis. |
| `tokenizer` | basic sentence tokenizer | Sentence tokenizer used to chunk input in `stream()`. |
| `apiKey` | `$SPEECHIFY_API_KEY` | Speechify API key. |
| `baseUrl` | SDK default | Override the API base URL. |
| `client` | — | Pass a preconfigured `SpeechifyClient` from `@speechify/api`. |

## How it works

Built on the official [`@speechify/api`](https://www.npmjs.com/package/@speechify/api) SDK. `stream()` splits input into sentences and issues one `/audio/speech` request per sentence, emitting audio and aligned word-level timestamps as each sentence completes — near-streaming time-to-first-audio plus word marks (`streaming` and `alignedTranscript` capabilities). Audio is raw 16-bit little-endian PCM at 24 kHz mono; `simba-3.0` is recommended for the lowest time-to-first-audio.

## Maintainers

Maintained by Speechify. Published and distributed by LiveKit as part of [`livekit/agents-js`](https://github.com/livekit/agents-js).
