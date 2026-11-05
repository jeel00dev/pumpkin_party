// In-round overlay: logo, round info, spared counter, timer, messages, onboarding tips and touch controls.
import { el, fmtClock } from './screens.js';
import { ICON, prizeIcon } from './icons.js';
import { SAY, TERMS } from '../content/terms.js';

export class HUD {
  constructor(app) {
    this.app = app;
    this.node = null;
    this.stickId = null;
    this._lastQ = -1;
    this._lastT = '';
    this._lastRank = -1;
    this._timers = [];
  }

  mount({ round, total, objective, mode, levelName, totalPlayers, practice, curse }) {
    this.unmount();
    const n = el(`<div class="hud">
      <div class="hud-l">
        <img class="hud-logo" src="art/logo.webp" alt="Pumpkin Party" draggable="false">
        <div class="hud-round"><div class="cr">${prizeIcon()}</div><div>
          <div class="a">${practice ? `${TERMS.practice}: ${levelName}` : `Round <b>${round}</b> / ${total}`}</div>
          <div class="b" data-obj>${objective}</div>
        </div></div>
        ${curse ? `<div class="hud-curse" data-curse>${TERMS.trick}: ${curse.name}</div>` : ''}
      </div>
      <div class="hud-r">
        <div class="hud-q" data-qbox><div class="a" data-qlab>${mode === 'race' ? TERMS.spared : 'Still In'}</div><div class="b" data-q>${mode === 'race' ? 0 : totalPlayers} / ${totalPlayers}</div></div>
        <div class="hud-t" data-tbox>${ICON.clock}<span data-t>00:00</span></div>
        <div class="hud-rank" data-rank></div>
      </div>
      <button class="btn violet round hud-pause" data-pause aria-label="Pause">${ICON.pause}</button>
      <div class="center-msg" data-center></div>
    </div>`);
    document.getElementById('ui').appendChild(n);
    this.node = n;
    this.q = n.querySelector('[data-q]');
    this.qbox = n.querySelector('[data-qbox]');
    this.t = n.querySelector('[data-t]');
    this.tbox = n.querySelector('[data-tbox]');
    this.rank = n.querySelector('[data-rank]');
    this.center = n.querySelector('[data-center]');
    this.total = totalPlayers;
    n.querySelector('[data-pause]').addEventListener('click', () => this.app.pauseRound());
    if (this.app.isTouch) this.addTouchControls();
    this._lastQ = -1; this._lastT = ''; this._lastRank = -1;
  }

  /** The lobby's overlay. Rivals are named as AI, because nobody here is a real player. */
  mountLobby({ total, onReady }) {
    this.unmount();
    const app = this.app;
    const emotes = app.emoteList();
    const n = el(`<div class="hud lobby-hud">
      <div class="lobby-top"><div class="t">Rivals arriving</div><div class="c" data-count>${SAY.rivalsArriving(0, total)}</div></div>
      <div class="lobby-side">
        <button class="btn gold md lobby-ready" data-ready>Ready!</button>
        <div class="lobby-emotes">${emotes.map((e, i) => `<button class="btn violet sm" data-emote="${i}">${app.isTouch ? '' : `<kbd>${i + 1}</kbd>`}${e[0].toUpperCase()}${e.slice(1)}</button>`).join('')}</div>
      </div>
      <div class="lobby-help">Run around, bump the pumpkins and show off while everyone arrives</div>
    </div>`);
    document.getElementById('ui').appendChild(n);
    this.node = n;
    this.count = n.querySelector('[data-count]');
    this.lobbyTotal = total;
    this._lastCount = -1;
    n.querySelector('[data-ready]').addEventListener('click', onReady);
    n.querySelectorAll('[data-emote]').forEach((b) => b.addEventListener('click', () => app.input.onEmote?.(+b.dataset.emote)));
    if (app.isTouch) this.addTouchControls();
  }

  setLobbyCount(n) {
    if (n === this._lastCount || !this.count) return;
    this._lastCount = n;
    this.count.textContent = SAY.rivalsArriving(n, this.lobbyTotal);
  }

  unmount() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this.node?.remove();
    this.node = null;
    this.app.input.setStick(0, 0);
  }

  setHidden(v) { if (this.node) this.node.style.display = v ? 'none' : ''; }

  /** On-screen stick and buttons. Also added mid-round if the first touch comes late. */
  addTouchControls() {
    if (!this.node || this.node.querySelector('[data-touch]')) return;
    this.node.appendChild(el(`<div class="touch" data-touch>
      <div class="stick" data-stick><span class="ar u"></span><span class="ar d"></span><span class="ar l"></span><span class="ar r"></span><div class="nub" data-nub></div></div>
      <button class="tbtn dive" data-dive aria-label="Dive">${ICON.run}</button>
      <button class="tbtn jump" data-jump aria-label="Jump">${ICON.up}</button>
    </div>`));
    this.bindTouch(this.node);
    this.app.input.pointerLockWanted = false;
  }

  bindTouch(n) {
    const input = this.app.input;
    const stick = n.querySelector('[data-stick]'), nub = n.querySelector('[data-nub]');
    const update = (t) => {
      const r = stick.getBoundingClientRect();
      const R = r.width / 2;
      let dx = t.clientX - (r.left + R), dy = t.clientY - (r.top + R);
      const l = Math.hypot(dx, dy), max = R * 0.62;
      if (l > max) { dx *= max / l; dy *= max / l; }
      nub.style.transform = `translate(${dx}px,${dy}px)`;
      const nx = dx / max, ny = dy / max;
      // Small dead zone in the middle, full speed before the rim.
      const m = Math.hypot(nx, ny);
      if (m < 0.12) input.setStick(0, 0);
      else input.setStick(nx, -ny);
    };
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const t = e.changedTouches[0];
      this.stickId = t.identifier;
      update(t);
    }, { passive: false });
    stick.addEventListener('touchmove', (e) => {
      e.preventDefault(); e.stopPropagation();
      for (const t of e.changedTouches) if (t.identifier === this.stickId) update(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickId) { this.stickId = null; nub.style.transform = ''; input.setStick(0, 0); }
      }
    };
    stick.addEventListener('touchend', end);
    stick.addEventListener('touchcancel', end);
    const btn = (b, down, up) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); down(); }, { passive: false });
      const off = (e) => { e.preventDefault(); e.stopPropagation(); b.classList.remove('on'); up?.(); };
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
    };
    btn(n.querySelector('[data-jump]'), () => input.pressJump(true), () => input.pressJump(false));
    btn(n.querySelector('[data-dive]'), () => input.pressDive());
  }

  setSpared(n, label) {
    if (n === this._lastQ) return;
    this._lastQ = n;
    this.q.textContent = `${n} / ${this.total}`;
    if (label) this.node.querySelector('[data-qlab]').textContent = label;
    this.qbox.classList.remove('flash');
    void this.qbox.offsetWidth;
    this.qbox.classList.add('flash');
  }

  setClock(seconds, urgent) {
    const s = fmtClock(seconds);
    if (s !== this._lastT) { this._lastT = s; this.t.textContent = s; }
    this.tbox.classList.toggle('urgent', !!urgent);
  }

  setRank(n) {
    if (n === this._lastRank) return;
    this._lastRank = n;
    this.rank.textContent = n ? `#${n}` : '';
    this.rank.classList.toggle('hidden', !n);
  }

  setWarn(text) {
    let w = this.node?.querySelector('[data-warn]');
    if (!text) { w?.remove(); return; }
    if (!w && this.node) {
      w = el('<div class="hud-warn" data-warn></div>');
      this.node.appendChild(w);
    }
    if (w && w.textContent !== text) w.textContent = text;
  }

  /** Big centred message that removes itself. */
  message(text, cls = '', ms = 1500) {
    if (!this.center) return null;
    this.center.innerHTML = `<div class="big-msg stroke ${cls}">${text}</div>`;
    if (ms) {
      const id = setTimeout(() => { if (this.center) this.center.innerHTML = ''; }, ms);
      this._timers.push(id);
    }
    return this.center.firstChild;
  }

  clearMessage() { if (this.center) this.center.innerHTML = ''; }

  introCard({ round, total, name, objective, hint, practice }) {
    if (!this.center) return;
    this.center.innerHTML = `<div class="intro-card">
      ${practice ? '' : `<div class="r">Round ${round} of ${total}</div>`}
      <h1 class="stroke">${name}</h1><p>${objective}</p></div>
      <div class="skip-hint">${hint}</div>`;
  }

  /** Visual control overlay for the first round. Clears itself as each action is done. */
  showTips() {
    if (!this.node) return;
    const touch = this.app.isTouch;
    const tips = el(`<div class="tips" data-tips>
      <div class="tip" data-tip="move"><div class="k">${touch ? `<kbd style="min-width:3.2rem">Stick</kbd>` : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>'}</div>Run</div>
      <div class="tip" data-tip="jump"><div class="k">${touch ? `<kbd>${ICON.up}</kbd>` : '<kbd style="min-width:4.6rem">Space</kbd>'}</div>Jump</div>
      <div class="tip" data-tip="dive"><div class="k">${touch ? `<kbd>${ICON.run}</kbd>` : '<kbd style="min-width:3.4rem">Shift</kbd>'}</div>Dive</div>
      ${touch ? '' : `<div class="tip" data-tip="look"><div class="k"><kbd style="min-width:3.4rem">Mouse</kbd></div>Look</div>`}
    </div>`);
    this.node.appendChild(tips);
    this.tips = tips;
    this.tipsLeft = new Set(touch ? ['move', 'jump', 'dive'] : ['move', 'jump', 'dive', 'look']);
    const id = setTimeout(() => this.hideTips(), 26000);
    this._timers.push(id);
  }

  tipDone(name) {
    if (!this.tips || !this.tipsLeft?.has(name)) return;
    this.tipsLeft.delete(name);
    this.tips.querySelector(`[data-tip=${name}]`)?.classList.add('done');
    if (!this.tipsLeft.size) { const id = setTimeout(() => this.hideTips(), 700); this._timers.push(id); }
  }

  hideTips() { this.tips?.remove(); this.tips = null; }
}
