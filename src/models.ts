// SPDX-FileCopyrightText: 2025 Speechify, Inc.
//
// SPDX-License-Identifier: Apache-2.0

export type TTSModels = 'simba-english' | 'simba-multilingual' | 'simba-3.0';

// wav is omitted deliberately: the streaming endpoint negotiates the container
// via the HTTP Accept header, which only accepts mp3/ogg/aac/pcm.
export type TTSEncoding = 'mp3_24000' | 'ogg_24000' | 'aac_24000' | 'pcm_24000';
