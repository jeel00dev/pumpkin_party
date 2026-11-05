import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('document', { addEventListener() {}, visibilityState: 'visible' });
vi.stubGlobal('window', { addEventListener() {} });
const { MUSIC_TRACKS, SOUND_GROUPS } = await import('../src/core/audio.js');
const source = readFileSync('src/core/audio.js', 'utf8');

describe('sound test lists', () => {
  it('offers every effect the game can make, once', () => {
    const implemented = [...source.matchAll(/^\s+case '([a-zA-Z0-9]+)':/gm)].map((m) => m[1]);
    const listed = Object.values(SOUND_GROUPS).flat();
    expect([...listed].sort()).toEqual([...implemented].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('offers every music track', () => {
    const block = source.slice(source.indexOf('const SONGS = {'));
    const songs = [...block.matchAll(/^ {2}([a-z]+): \{/gm)].map((m) => m[1]);
    expect([...MUSIC_TRACKS].sort()).toEqual(songs.sort());
  });
});
