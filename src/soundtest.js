// Dev-only sound test (soundtest.html): play every effect and music track, and note which ones need work.
// Run `npm run dev`, then open /soundtest.html on the same network from a phone as well as a computer.
import { Audio, MUSIC_TRACKS, SOUND_GROUPS } from './core/audio.js';

const KEY = 'pumpkinparty.soundtest';
const audio = new Audio();
let marks = {};
try { marks = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { marks = {}; }
const root = document.getElementById('root');
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function play(name) {
  audio.ensure();
  audio.ctx?.resume?.();
  // Resuming takes a moment the first time; the short wait keeps that first press from going silent.
  setTimeout(() => { audio.lastPlayed.clear(); audio.sfx(name); }, audio.ctx?.state === 'running' ? 0 : 120);
}

function row(id, onPlay) {
  const n = h(`<div class="sound"><button class="play" data-play>${id}</button><button class="mark good" data-v="good" aria-label="${id} sounds good">Good</button><button class="mark bad" data-v="bad" aria-label="${id} needs work">Bad</button></div>`);
  const paint = () => n.querySelectorAll('.mark').forEach((b) => b.classList.toggle('on', marks[id] === b.dataset.v));
  n.querySelector('[data-play]').onclick = onPlay;
  n.querySelectorAll('.mark').forEach((b) => {
    b.onclick = () => {
      marks[id] = marks[id] === b.dataset.v ? undefined : b.dataset.v;
      try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch { /* private mode: notes last for this visit */ }
      paint();
    };
  });
  paint();
  return n;
}

const all = Object.values(SOUND_GROUPS).flat();
const controls = h(`<div class="row">
  <button data-all>Play all effects in order</button>
  <button data-stop>Stop music</button>
  <label>Music <input type="range" min="0" max="1" step="0.05" value="0.7" data-m></label>
  <label>Effects <input type="range" min="0" max="1" step="0.05" value="0.9" data-s></label>
</div>`);
root.append(controls);
let runId = 0;
controls.querySelector('[data-all]').onclick = async () => {
  const run = ++runId;
  for (const n of all) {
    if (run !== runId) return;
    play(n);
    await new Promise((r) => setTimeout(r, 1100));
  }
};
controls.querySelector('[data-stop]').onclick = () => { runId++; audio.music(null); };
const volume = () => audio.setVolumes(+controls.querySelector('[data-m]').value, +controls.querySelector('[data-s]').value);
controls.querySelectorAll('input').forEach((i) => { i.oninput = volume; });

root.append(h('<h2>Music</h2>'));
const tracks = h('<div class="grid"></div>');
for (const t of MUSIC_TRACKS) {
  tracks.append(row(`music: ${t}`, () => {
    audio.ensure();
    audio.ctx?.resume?.();
    audio.music(null);
    audio.music(t);
  }));
}
root.append(tracks);

for (const [group, names] of Object.entries(SOUND_GROUPS)) {
  root.append(h(`<h2>${group}</h2>`));
  const grid = h('<div class="grid"></div>');
  for (const name of names) grid.append(row(name, () => play(name)));
  root.append(grid);
}

root.append(h('<h2>Notes to send back</h2>'));
const out = h('<textarea readonly aria-label="Sound notes"></textarea>');
const copy = h('<button>Show my notes</button>');
copy.onclick = () => {
  const lines = Object.entries(marks).filter(([, v]) => v).map(([k, v]) => `${v === 'good' ? 'GOOD' : 'BAD '}  ${k}`);
  const left = [...all, ...MUSIC_TRACKS.map((t) => `music: ${t}`)].filter((k) => !marks[k]);
  out.value = `${lines.join('\n')}${left.length ? `\nNot marked yet: ${left.join(', ')}` : ''}`;
  out.select();
  navigator.clipboard?.writeText(out.value).catch(() => {});
};
root.append(copy, out);
