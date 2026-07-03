# Speechify plugin for LiveKit Agents for Node.js

Speechify text-to-speech for [LiveKit Agents](https://docs.livekit.io/agents/) on Node.js. Built on the official [`@speechify/api`](https://www.npmjs.com/package/@speechify/api) SDK.

## Installation

```bash
npm install @speechify/livekit-plugin
# or
pnpm add @speechify/livekit-plugin
# or
yarn add @speechify/livekit-plugin
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
import * as speechify from '@speechify/livekit-plugin';

const session = new AgentSession({
  tts: new speechify.TTS({
    voiceId: 'jack',
    model: 'simba-english',
  }),
});
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `voiceId` | `'jack'` | Voice to synthesize with (see the Speechify `/v1/voices` endpoint). |
| `encoding` | `'ogg_24000'` | `<format>_<rate>`. One of `mp3_24000`, `ogg_24000`, `aac_24000`, `pcm_24000`. |
| `model` | provider default | `simba-english`, `simba-multilingual`, or `simba-3.0`. |
| `language` | provider default | BCP-47 code of the input, e.g. `en-US`. |
| `loudnessNormalization` | provider default | Normalize output loudness. |
| `textNormalization` | provider default | Expand numbers/dates into words before synthesis. |
| `apiKey` | `$SPEECHIFY_API_KEY` | Speechify API key. |
| `baseUrl` | SDK default | Override the API base URL. |
| `client` | — | Pass a preconfigured `SpeechifyClient` from `@speechify/api`. |

`pcm_24000` returns raw 16-bit little-endian PCM (24 kHz mono) for the lowest-latency path with no decoding.

