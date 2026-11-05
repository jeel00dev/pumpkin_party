// The Spirit Board: a planchette glides across the round tiles and settles on the next game. Short, and
// any key, click or tap jumps to the result. Some reveals then offer Trick or Treat, which never waits
// long: if the player doesn't choose, the round plays as normal.
import { el } from './screens.js';
import { TERMS } from '../content/terms.js';

const HOP = 0.24, HOPS = 5, HOLD = 0.55, CHOICE = 4;
const TILES = 5;

const PLANCHETTE = `<svg viewBox="0 0 100 92" aria-hidden="true"><defs><linearGradient id="plg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ee8f1e"/></linearGradient></defs>
  <path d="M50 4C62 22 92 38 95 60c2 16-10 27-24 27-10 0-17-5-21-12-4 7-11 12-21 12C15 87 3 76 5 60 8 38 38 22 50 4z" fill="url(#plg)" stroke="#6a2f06" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="50" cy="50" r="14" fill="#2c1590" stroke="#6a2f06" stroke-width="5"/>
  <circle cx="45" cy="45" r="4.500" fill="#fff" opacity=".6"/>
</svg>`;

const MOON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M20 3a13.500 13.500 0 1 0 9 22.500A11.500 11.500 0 1 1 20 3z" fill="#ffe25a"/><circle cx="26" cy="8" r="1.800" fill="#ffe25a"/></svg>';
const STAR = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2c1.300 8.700 5.300 12.700 14 14-8.700 1.300-12.700 5.300-14 14-1.300-8.700-5.300-12.700-14-14 8.700-1.300 12.700-5.300 14-14z" fill="#ffe25a"/></svg>';

function shuffled(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class Reveal {
  /** @param {object} o { round, total, def, others, rand, wildcard, isNew, isFinal, goal, curse, onDone(curseId|null) } */
  constructor(app, o) {
    this.app = app;
    this.o = o;
    this.t = 0;
    this.hop = -1;
    this.landed = false;
    this.done = false;
    this.choiceLeft = o.curse ? CHOICE : 0;
    this.chosen = null;
    const rand = o.rand;
    const extras = shuffled(o.others, rand).slice(0, TILES - 1);
    this.tiles = shuffled([o.def, ...extras], rand);
    const target = this.tiles.indexOf(o.def);
    // A path of hops that never pauses on the same tile twice in a row, ending on the chosen one.
    this.path = [];
    let at = -1;
    for (let i = 0; i < HOPS - 1; i++) {
      let next = Math.floor(rand() * this.tiles.length);
      if (next === at) next = (next + 1) % this.tiles.length;
      this.path.push(next);
      at = next;
    }
    if (at === target && this.tiles.length > 1) this.path[this.path.length - 1] = (target + 1) % this.tiles.length;
    this.path.push(target);

    const badge = o.isFinal ? 'The Final' : o.wildcard ? 'Wildcard!' : o.isNew ? 'New game!' : '';
    const keys = app.isTouch ? ['', ''] : ['<kbd>1</kbd>', '<kbd>2</kbd>'];
    const n = el(`<div class="screen pass reveal">
      <div class="sb-head"><div class="ribbon sb-round">Round ${o.round} of ${o.total}</div>${badge ? `<div class="sb-badge">${badge}</div>` : ''}</div>
      <div class="sb-board" data-board>
        <div class="sb-title">${MOON}<span data-title>The ${TERMS.board} chooses...</span>${STAR}</div>
        <div class="sb-tiles">${this.tiles.map((d, i) => `<div class="sb-tile" data-i="${i}"><i style="background-image:url(art/th_${d.id}.webp)"></i><span>${d.name}</span></div>`).join('')}</div>
        <div class="sb-rail"><div class="sb-plan" data-plan>${PLANCHETTE}</div></div>
      </div>
      <div class="sb-info" data-info>
        <h2 class="stroke">${o.def.name}</h2>
        <p>${o.goal}</p>
        <p class="sb-danger">Watch out: ${o.def.danger}</p>
      </div>
      ${o.curse ? `<div class="sb-choice" data-choice>
        <button class="btn violet md" data-pick="treat">${keys[0]}<span><b>${TERMS.treat}</b><small>Play it as normal</small></span></button>
        <button class="btn violet md" data-pick="trick">${keys[1]}<span><b>${TERMS.trick}: ${o.curse.name}</b><small>Double ${TERMS.candy}. ${o.curse.hint}</small></span></button>
        <div class="sb-timer"><i data-timer></i></div>
      </div>` : ''}
    </div>`);
    this.node = n;
    app.ui.show('reveal', n);
    this.plan = n.querySelector('[data-plan]');
    this.rail = n.querySelector('.sb-rail');
    this.timer = n.querySelector('[data-timer]');
    n.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.pick(b.dataset.pick === 'trick'); }));
    this.onKey = (e) => {
      if (e.repeat) return;
      if (this.landed && o.curse && this.chosen === null) {
        if (e.code === 'Digit1') this.pick(false);
        else if (e.code === 'Digit2') this.pick(true);
        return;
      }
      this.skip();
    };
    this.onPointer = () => this.skip();
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointerdown', this.onPointer);
    this.place(this.path[0], true);
  }

  /** Slides the planchette along the rail until it points at a tile. */
  place(i, instant = false) {
    const tile = this.node.querySelector(`[data-i="${i}"]`);
    const rail = this.rail.getBoundingClientRect(), r = tile.getBoundingClientRect();
    if (instant) this.plan.style.transition = 'none';
    this.plan.style.transform = `translateX(${r.left - rail.left + (r.width - this.plan.offsetWidth) / 2}px)`;
    if (instant) { void this.plan.offsetWidth; this.plan.style.transition = ''; }
    this.node.querySelectorAll('.sb-tile').forEach((t) => t.classList.toggle('on', t === tile));
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (!this.landed) {
      const hop = Math.min(this.path.length - 1, Math.floor(this.t / HOP));
      if (hop !== this.hop) {
        this.hop = hop;
        this.place(this.path[hop]);
        this.app.audio.sfx('planchette', 0.8, 0.9 + hop * 0.06);
      }
      if (this.t >= HOP * (this.path.length - 1) + HOP * 0.8) this.land();
      return;
    }
    if (this.o.curse && this.chosen === null) {
      this.choiceLeft -= dt;
      if (this.timer) this.timer.style.width = `${Math.max(0, (100 * this.choiceLeft) / CHOICE)}%`;
      if (this.choiceLeft <= 0) this.pick(false);
      return;
    }
    this.hold -= dt;
    if (this.hold <= 0) this.finish();
  }

  land() {
    if (this.landed) return;
    this.landed = true;
    this.hold = HOLD;
    this.hop = this.path.length - 1;
    this.place(this.path[this.hop]);
    this.node.classList.add('landed');
    this.node.querySelector('[data-title]').textContent = `The ${TERMS.board} has chosen`;
    this.app.audio.sfx('reveal');
  }

  /** Any key or tap jumps to the result, then moves on as soon as it's been seen. */
  skip() {
    if (!this.landed) { this.land(); return; }
    if (!this.o.curse || this.chosen !== null) this.hold = Math.min(this.hold, 0.12);
  }

  pick(trick) {
    if (this.chosen !== null || this.done) return;
    this.chosen = trick;
    this.hold = HOLD * 0.7;
    this.node.querySelector(`[data-pick=${trick ? 'trick' : 'treat'}]`)?.classList.add('picked');
    this.node.querySelector(`[data-pick=${trick ? 'treat' : 'trick'}]`)?.classList.add('unpicked');
    this.app.audio.sfx(trick ? 'curse' : 'coin');
  }

  finish() {
    if (this.done) return;
    this.done = true;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointerdown', this.onPointer);
    this.o.onDone(this.o.curse && this.chosen ? this.o.curse.id : null);
  }
}

