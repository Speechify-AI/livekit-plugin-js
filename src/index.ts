// SPDX-FileCopyrightText: 2025 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import { Plugin } from '@livekit/agents';

// export * from './tts.js';
// export * from './models.js';

class SpeechifyPlugin extends Plugin {
  constructor() {
    super({
      title: 'speechify',
      version: __PACKAGE_VERSION__,
      package: __PACKAGE_NAME__,
    });
  }
}

Plugin.registerPlugin(new SpeechifyPlugin());
