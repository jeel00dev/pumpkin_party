// Names that must not ship. They're matched across all source and the page itself, since a player can
// see any string in there. See docs/name-check.md.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const BANNED = [/ouija/i, /pumpkin king/i, /monster mash/i, /friday the 13/i, /fall guys/i, /stumble guys/i, /hex-a-gone/i];

function sources(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.(js|css|html)$/.test(f) ? [p] : [];
  });
}

describe('player-facing names', () => {
  it('uses the game\'s own words for getting through and going out', () => {
    const hits = [];
    for (const file of sources('src')) {
      if (file.endsWith('terms.js')) continue;
      const text = readFileSync(file, 'utf8');
      for (const re of [/\bQualified\b/, /\bEliminated\b/, /\bQualify\b/]) if (re.test(text)) hits.push(`${file}: ${re.source}`);
    }
    expect(hits).toEqual([]);
  });

  it('uses none of the banned names', () => {
    const hits = [];
    for (const file of [...sources('src'), 'index.html']) {
      const text = readFileSync(file, 'utf8');
      for (const re of BANNED) if (re.test(text)) hits.push(`${file}: ${re.source}`);
    }
    expect(hits).toEqual([]);
  });
});
