// Every menu screen, laid out from the UI key art. Screens are plain DOM over the WebGL canvas, which
// keeps text crisp at any resolution and makes the layout responsive without extra work.
import { ICON, coinIcon, gemIcon, prizeIcon } from './icons.js';
import { DAILY_REWARDS, EVENT_TRACK } from '../core/profile.js';
import { GLASSES, HATS, SKINS } from '../assets/characters.js';
import { BUNDLES, EMOTES, TRAILS } from '../assets/cosmetics.js';
import { LEVELS, LEVEL_ORDER } from '../levels/index.js';
import { particleAtlas } from '../render/textures.js';
import { SAY, TERMS } from '../content/terms.js';

const $ = (sel, el = document) => el.querySelector(sel);

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const fmtTime = (s) => {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
};
export const fmtClock = (s) => {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
function fmtEnds(ms) {
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor(ms / 60000) % 60}m`;
}

function rewardBits(r) {
  const out = [];
  if (r.coins) out.push(`${coinIcon()} ${r.coins}`);
  if (r.gems) out.push(`${gemIcon()} ${r.gems}`);
  return out.join(' ');
}

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.current = null;
    this.name = null;
    this.modal = null;
    this.timers = [];
    this.root.style.setProperty('--ghost-pattern', `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><g fill="#fff"><path d="M30 20c-9 0-15 6-15 15v24l5-4 5 4 5-4 5 4 5-4 5 4V35c0-9-6-15-15-15z"/><path d="M90 70c-7 0-12 5-12 12v19l4-3 4 3 4-3 4 3 4-3 4 3V82c0-7-5-12-12-12z"/></g></svg>')}")`);
    this.root.addEventListener('pointerover', (e) => {
      const b = e.target.closest?.('button');
      if (b && b !== this._hover && e.pointerType === 'mouse') { this._hover = b; app.audio.sfx('hover', 0.6); }
    });
    this.root.addEventListener('click', (e) => {
      if (e.target.closest?.('button') && !e.target.closest('[data-silent]')) app.audio.sfx('click');
    });
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    app.profile.on(() => this.refreshTop());
  }

  /** One rem scales with the iframe, with a floor that keeps text legible at the smallest size. */
  onResize() {
    const w = innerWidth, h = innerHeight;
    const s = Math.max(0.7, Math.min(1.7, Math.min(w / 1280, h / 720)));
    document.documentElement.style.fontSize = `${(16 * s).toFixed(2)}px`;
  }

  clear() {
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    this.closeModal();
    this.current?.remove();
    this.current = null;
    this.name = null;
    document.body.dataset.screen = 'none';
    this.app.sdk.clearBanners();
  }

  show(name, node) {
    this.clear();
    this.name = name;
    this.current = node;
    this.root.appendChild(node);
    document.body.dataset.screen = name;
    return node;
  }

  every(ms, fn) { this.timers.push(setInterval(fn, ms)); }

  toast(html) {
    const t = el(`<div class="toast">${html}</div>`);
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------------------------------------------------------------- shared bits
  topBar({ profile = true, wallet = true, gear = true, login = true } = {}) {
    const p = this.app.profile, d = p.d;
    const showLogin = login && this.app.sdk.accountsAvailable && !this.app.sdk.user;
    return `<div class="topbar">
      ${profile ? `<div class="profile" data-profile>
        <div class="avatar" data-avatar><span class="lv" data-lv>${d.level}</span></div>
        <div><div class="nm">${esc(p.displayName)}</div><div class="xpbar"><i data-xp style="width:${(100 * d.xp) / p.xpFor(d.level)}%"></i></div></div>
      </div>` : '<div></div>'}
      <div class="wallet">
        ${showLogin ? '<button class="btn violet login" data-act="login">Login with CrazyGames</button>' : ''}
        ${wallet ? this.walletHtml() : ''}
        ${gear ? `<button class="btn violet round" data-act="settings" aria-label="Settings">${ICON.gear}</button>` : ''}
      </div>
    </div>`;
  }

  walletHtml() {
    const d = this.app.profile.d;
    return `<div class="pill">${coinIcon()}<span class="amt" data-coins>${fmt(d.coins)}</span><button class="add" data-act="freecoins" aria-label="Get coins">${ICON.plus}</button></div>
      <div class="pill">${gemIcon()}<span class="amt" data-gems>${fmt(d.gems)}</span><button class="add" data-act="gems" aria-label="Get gems">${ICON.plus}</button></div>`;
  }

  fillAvatar(node) {
    const a = $('[data-avatar]', node);
    if (!a) return;
    const p = this.app.profile;
    if (p.avatarUrl) {
      const img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = p.avatarUrl;
      a.prepend(img);
    } else {
      const eq = p.d.equip;
      a.prepend(this.app.thumbs.character(eq.skin, { hat: eq.hat, glasses: eq.glasses, w: 128, h: 128, framing: 'head', mode: 'idle', yaw: 0 }));
    }
  }

  refreshTop() {
    if (!this.current) return;
    const d = this.app.profile.d;
    this.current.querySelectorAll('[data-coins]').forEach((n) => { n.textContent = fmt(d.coins); });
    this.current.querySelectorAll('[data-gems]').forEach((n) => { n.textContent = fmt(d.gems); });
    this.current.querySelectorAll('[data-lv]').forEach((n) => { n.textContent = d.level; });
    this.current.querySelectorAll('[data-xp]').forEach((n) => { n.style.width = `${(100 * d.xp) / this.app.profile.xpFor(d.level)}%`; });
  }

  wire(node, map) {
    node.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const f = map[b.dataset.act];
      if (f) f(b.dataset.id, b, e);
      else this.common(b.dataset.act, b);
    });
  }

  common(act) {
    if (act === 'settings') this.settings();
    if (act === 'freecoins') this.freeCoins();
    if (act === 'gems') this.gemsInfo();
    if (act === 'login') this.app.login();
  }

  // ---------------------------------------------------------------- main menu
  menu() {
    const p = this.app.profile, app = this.app;
    const missionsReady = p.missionsReady(), evReady = p.eventReadyCount();
    const n = el(`<div class="screen pass">
      ${this.topBar()}
      <div class="menu-col">
        <button class="btn gold lg" data-act="play" data-screen="play">Play ${ICON.next}</button>
        <button class="btn violet item" data-act="shop">${ICON.cart} Shop</button>
        <button class="btn violet item" data-act="customize">${ICON.shirt} Customize</button>
        <button class="btn violet item" data-act="missions">${ICON.clip} Missions ${missionsReady ? `<span class="badge">${missionsReady}</span>` : ''}</button>
        <button class="btn violet item" data-act="settings">${ICON.gear} Settings</button>
      </div>
      <button class="event-card" data-act="event">
        <span data-evpic></span>
        <span><div class="t">Halloween Event!</div><div class="e" data-evend>Ends in: ${fmtEnds(p.seasonEndsIn())}</div></span>
        ${evReady ? `<span class="badge" style="position:absolute;top:-.4rem;right:-.4rem;min-width:1.35rem;height:1.35rem;border-radius:1rem;background:#ff3a6a;display:flex;align-items:center;justify-content:center;font-size:.86rem">${evReady}</span>` : ''}
      </button>
      ${LEVEL_ORDER.some((id) => p.hasSeen(id)) ? `<button class="btn violet sm practice-link" data-act="practice">${ICON.retry} ${TERMS.practice}</button>` : ''}
      <div class="solo-note">${TERMS.soloNote}</div>
    </div>`);
    this.show('menu', n);
    this.fillAvatar(n);
    const eq = p.d.equip;
    $('[data-evpic]', n).append(app.thumbs.character('pumpkin', { hat: 'witch', w: 140, h: 140, framing: 'head', mode: 'idle', yaw: -0.1 }));
    this.every(30000, () => { const e = $('[data-evend]', n); if (e) e.textContent = `Ends in: ${fmtEnds(p.seasonEndsIn())}`; });
    this.wire(n, {
      play: () => app.startMatch(),
      practice: () => app.goto('practice'),
      shop: () => app.goto('shop'),
      customize: () => app.goto('customize'),
      missions: () => this.missions(),
      event: () => app.goto('event'),
    });
    void eq;
    if (p.dailyAvailable() && p.d.flags.firstMatch && !this._dailyShown) { this._dailyShown = true; this.daily(); }
    return n;
  }

  // ---------------------------------------------------------------- practice
  /** Rounds the player has met in a match. It sits off the main path, and pays nothing. */
  practice() {
    const p = this.app.profile, app = this.app;
    const seen = LEVEL_ORDER.filter((id) => p.hasSeen(id));
    const cards = seen.map((id) => `<button class="lvl-card" data-act="go" data-id="${id}">
      <div class="th" style="background-image:url(art/th_${id}.webp)"></div>
      <div class="nm">${LEVELS[id].name}</div>
    </button>`).join('');
    const n = el(`<div class="screen solid">
      <div class="lvl-top"><button class="btn violet round back" data-act="back" aria-label="Back">${ICON.back}</button><div class="ribbon">${TERMS.practice}</div></div>
      <p class="note practice-note">${seen.length ? 'Try any round you have met in a match. Practice earns no rewards.' : 'Rounds you meet in a match will appear here.'}</p>
      <div class="lvl-panel">${cards}</div>
    </div>`);
    this.show('practice', n);
    this.wire(n, { back: () => app.goto('menu'), go: (id) => app.startPractice(id) });
  }

  // ---------------------------------------------------------------- shop
  shop(tab = 'skins') {
    const app = this.app;
    const n = el(`<div class="screen solid">
      <div class="hdr">
        <button class="btn violet round" data-act="back" aria-label="Back">${ICON.back}</button>
        <div class="title chip">${ICON.cart} Shop</div>
        <div class="spacer"></div>
        <div class="wallet">${this.walletHtml()}</div>
      </div>
      <div class="shop-body">
        <div class="shop-tabs">
          <button class="stab" data-act="tab" data-id="skins">${ICON.skins} Skins</button>
          <button class="stab" data-act="tab" data-id="trails">${ICON.paw} Trails</button>
          <button class="stab" data-act="tab" data-id="emotes">${ICON.smile} Emotes</button>
          <button class="stab" data-act="tab" data-id="bundles">${ICON.gift} Bundles</button>
        </div>
        <div class="cards" data-cards></div>
      </div>
      <div class="banner-slot" id="shop-banner" ${app.sdk.adsAllowed ? '' : 'hidden'}></div>
    </div>`);
    this.show('shop', n);
    const fill = (t) => {
      n.querySelectorAll('.stab').forEach((b) => b.classList.toggle('on', b.dataset.id === t));
      this.shopCards($('[data-cards]', n), t);
    };
    this.wire(n, {
      back: () => app.goto('menu'),
      tab: (id) => { app.audio.sfx('tab'); this._shopTab = id; fill(id); },
      buy: (id, b) => this.buyItem(b.dataset.kind, id, () => fill(this._shopTab)),
      equip: (id, b) => { app.profile.equip(b.dataset.kind, id); app.onEquip(); app.audio.sfx('equip'); fill(this._shopTab); },
      bundle: (id) => {
        if (app.profile.buyBundle(id)) { app.audio.sfx('buy'); this.toast(`${ICON.gift} ${BUNDLES[id].name} unlocked!`); fill(this._shopTab); } else this.needCoins(BUNDLES[id].price);
      },
    });
    this._shopTab = tab;
    fill(tab);
    if (app.sdk.adsAllowed && innerHeight > 520) setTimeout(() => app.sdk.showBanner('shop-banner'), 600);
  }

  shopCards(c, tab) {
    const app = this.app, p = app.profile, eq = p.d.equip;
    c.innerHTML = '';
    c.className = 'cards';
    const add = (html, pic) => {
      const k = el(html);
      if (pic) $('.pic', k).append(pic);
      c.append(k);
    };
    const priceHtml = (kind, id, item, owned, on) => {
      if (on) return `<span class="price eq">${ICON.check} Equipped</span>`;
      if (owned) return '<span class="price own">Equip</span>';
      if (item.event) return `<span class="price lock">${ICON.sparkle} Event</span>`;
      return `<span class="price">${coinIcon()} ${item.price}</span>`;
    };
    if (tab === 'skins') {
      for (const [id, s] of Object.entries(SKINS)) {
        const owned = p.owns('skin', id), on = eq.skin === id;
        add(`<button class="card ${on ? 'sel' : ''}" data-act="${owned ? 'equip' : s.event ? 'evlock' : 'buy'}" data-id="${id}" data-kind="skin">
          ${on ? `<span class="tick">${ICON.check}</span>` : ''}<div class="pic"></div><div class="nm">${s.name}</div>${priceHtml('skin', id, s, owned, on)}</button>`,
        app.thumbs.character(id, { w: 240, h: 300 }));
      }
    } else if (tab === 'trails') {
      for (const [id, t] of Object.entries(TRAILS)) {
        if (id === 'none') continue;
        const owned = p.owns('trail', id), on = eq.trail === id;
        add(`<button class="card ${on ? 'sel' : ''}" data-act="${owned ? 'equip' : 'buy'}" data-id="${owned && on ? 'none' : id}" data-kind="trail">
          ${on ? `<span class="tick">${ICON.check}</span>` : ''}<div class="pic"></div><div class="nm">${t.name}</div>${priceHtml('trail', id, t, owned, on)}</button>`,
        trailPicture(t));
      }
    } else if (tab === 'emotes') {
      for (const [id, t] of Object.entries(EMOTES)) {
        const owned = p.owns('emote', id), on = eq.emote === id;
        add(`<button class="card ${on ? 'sel' : ''}" data-act="${owned ? 'equip' : 'buy'}" data-id="${id}" data-kind="emote">
          ${on ? `<span class="tick">${ICON.check}</span>` : ''}<div class="pic"></div><div class="nm">${t.name}</div>${priceHtml('emote', id, t, owned, on)}</button>`,
        app.thumbs.character(eq.skin, { w: 240, h: 300, emote: id, mode: 'emote', hat: eq.hat, glasses: eq.glasses }));
      }
    } else {
      for (const [id, b] of Object.entries(BUNDLES)) {
        const owned = p.bundleOwned(id);
        const k = el(`<button class="card" data-act="${owned ? 'noop' : 'bundle'}" data-id="${id}" style="width:15rem;background:linear-gradient(180deg,${b.tint},#4a27c0)">
          <div class="pic" style="position:relative"></div><div class="nm">${b.name}</div>
          ${owned ? `<span class="price eq">${ICON.check} Owned</span>` : `<span class="price">${coinIcon()} ${b.price}</span>`}</button>`);
        const pic = $('.pic', k);
        b.items.forEach(([kind, item], i) => {
          let cv;
          if (kind === 'skin') cv = app.thumbs.character(item, { w: 180, h: 225 });
          else if (kind === 'hat' || kind === 'glasses') cv = app.thumbs.accessory(kind, item, { w: 128, h: 128 });
          else if (kind === 'trail') cv = trailPicture(TRAILS[item]);
          else cv = app.thumbs.character('pumpkin', { w: 150, h: 188, emote: item, mode: 'emote' });
          cv.style.cssText = `position:absolute;left:${i * 30 - 3}%;top:${i % 2 ? 22 : 4}%;width:48%;height:auto`;
          pic.append(cv);
        });
        c.append(k);
      }
    }
    c.onclick = (e) => { if (e.target.closest('[data-act=evlock]')) this.toast(`${ICON.sparkle} Earn this one on the Halloween Event track`); };
  }

  buyItem(kind, id, after) {
    const app = this.app, p = app.profile;
    const item = { skin: SKINS, hat: HATS, glasses: GLASSES, trail: TRAILS, emote: EMOTES }[kind][id];
    if (p.buy(kind, id)) {
      app.audio.sfx('buy');
      p.equip(kind, id);
      app.onEquip();
      this.toast(`${ICON.check} ${item.name} unlocked!`);
      after?.();
    } else this.needCoins(item.price);
  }

  needCoins(price) {
    const app = this.app, p = app.profile;
    app.audio.sfx('error');
    const short = price - p.d.coins;
    if (app.sdk.canOfferRewarded && p.freeCoinsLeft() > 0) this.freeCoins(short);
    else this.toast(`${coinIcon()} You need ${short} more coins. Play a match to earn more!`);
  }

  // ---------------------------------------------------------------- customize
  customize(tab = 'glasses') {
    const app = this.app, p = app.profile;
    const n = el(`<div class="screen pass">
      <div class="hdr">
        <button class="btn violet round" data-act="back" aria-label="Back">${ICON.back}</button>
        <div class="title chip">Customize</div>
        <div class="spacer"></div>
        <div class="wallet"><div class="pill">${coinIcon()}<span class="amt" data-coins>${fmt(p.d.coins)}</span><button class="add" data-act="freecoins" aria-label="Get coins">${ICON.plus}</button></div></div>
      </div>
      <div class="cust-grid">
        <div class="cust-tabs">
          <button class="stab" data-act="tab" data-id="glasses">Glasses</button>
          <button class="stab" data-act="tab" data-id="hat">Hats</button>
          <button class="stab" data-act="tab" data-id="skin">Skins</button>
        </div>
        <div class="cust-panel" data-panel></div>
        <button class="btn gold md equip-btn" data-act="equipsel" data-equip>Equip</button>
      </div>
      <div class="cust-foot" data-foot></div>
    </div>`);
    this.show('customize', n);
    let selKind = tab, selId = p.d.equip[tab];
    const paint = () => {
      const panel = $('[data-panel]', n);
      panel.innerHTML = '';
      n.querySelectorAll('.stab').forEach((b) => b.classList.toggle('on', b.dataset.id === selKind));
      const defs = selKind === 'hat' ? HATS : selKind === 'glasses' ? GLASSES : SKINS;
      for (const [id, d] of Object.entries(defs)) {
        const owned = p.owns(selKind, id) || id === 'none';
        const t = el(`<button class="tile ${id === 'none' ? 'none' : ''} ${selId === id ? 'sel' : ''}" data-act="pick" data-id="${id}">${id === 'none' ? 'None' : ''}
          ${!owned ? (d.event ? `<span class="cost">${ICON.sparkle} Event</span>` : `<span class="cost">${coinIcon()} ${d.price}</span>`) : ''}</button>`);
        if (id !== 'none') {
          t.prepend(selKind === 'skin' ? app.thumbs.character(id, { w: 160, h: 160, framing: 'head', mode: 'idle', yaw: 0 }) : app.thumbs.accessory(selKind, id));
        }
        panel.append(t);
      }
      foot();
    };
    const foot = () => {
      const defs = selKind === 'hat' ? HATS : selKind === 'glasses' ? GLASSES : SKINS;
      const d = defs[selId];
      const owned = p.owns(selKind, selId) || selId === 'none';
      const worn = p.d.equip[selKind] === selId;
      const eb = $('[data-equip]', n);
      eb.disabled = worn && owned;
      eb.innerHTML = worn && owned ? `${ICON.check} Equipped` : owned ? 'Equip' : d.event ? `${ICON.sparkle} Event Reward` : `Buy ${coinIcon()} ${d.price}`;
      if (!owned && d.event) eb.disabled = true;
      $('[data-foot]', n).textContent = d.name;
      // Preview the selection on the hero, even before it's bought.
      const eq = { ...p.d.equip, [selKind]: selId };
      app.menu.setHero(eq);
    };
    this.wire(n, {
      back: () => { app.menu.setHero(p.d.equip); app.goto('menu'); },
      tab: (id) => { app.audio.sfx('tab'); selKind = id; selId = p.d.equip[id]; paint(); },
      pick: (id) => { selId = id; app.audio.sfx('tab'); n.querySelectorAll('.tile').forEach((b) => b.classList.toggle('sel', b.dataset.id === id)); foot(); },
      equipsel: () => {
        const owned = p.owns(selKind, selId) || selId === 'none';
        if (owned) { p.d.equip[selKind] = selId; p.changed(); app.audio.sfx('equip'); app.menu.playEmote('cheer', 1.4); foot(); } else this.buyItem(selKind, selId, () => paint());
      },
    });
    paint();
  }

  // ---------------------------------------------------------------- standings
  /** Between rounds: who's left, who just went out, and where the player stands. */
  standings({ round, spared, place, players, rewards, tricked, alive, entries, seconds, onNext, onMenu }) {
    const app = this.app;
    this.nextLabel = spared ? 'Next Round' : 'See Results';
    const rewardRow = rewards ? `<div class="st-rewards">
      <div class="rc-reward">${coinIcon()} +${rewards.coins}</div>
      <div class="rc-reward">${ICON.sparkle} +${rewards.xp} XP</div>
      <div class="rc-reward">${ICON.skull} +${rewards.candy} ${TERMS.candy}${tricked ? ' (doubled!)' : ''}</div>
    </div>` : '';
    const n = el(`<div class="screen pass standings">
      <div class="ribbon st-ribbon ${spared ? '' : 'out'}">${spared ? SAY.spokenSpared() : SAY.spokenSpooked()}</div>
      <div class="st-sub">Round ${round}: you placed <b>#${place}</b> of ${players}, and ${alive} ${alive === 1 ? 'is' : 'are'} still in</div>
      <div class="st-grid" data-grid></div>
      ${rewardRow}
      <div class="st-foot">
        <button class="btn gold md" data-act="next" data-next>${this.nextLabel} (${Math.ceil(seconds)}) ${ICON.next}</button>
        <button class="btn violet md" data-act="menu">${ICON.home} Main Menu</button>
      </div>
    </div>`);
    const grid = $('[data-grid]', n);
    for (const e of entries) {
      const k = el(`<div class="st-p ${e.state} ${e.isPlayer ? 'you' : ''}"><div class="pic"></div><div class="nm">${e.isPlayer ? 'You' : esc(e.name)}</div></div>`);
      $('.pic', k).append(app.thumbs.character(e.skin, { hat: e.hat, glasses: e.glasses, w: 96, h: 96, framing: 'head', mode: 'idle', yaw: 0 }));
      grid.append(k);
    }
    this.show('standings', n);
    this.nextBtn = $('[data-next]', n);
    this.wire(n, { next: onNext, menu: onMenu });
    return n;
  }

  standingsTick(left) {
    if (!this.nextBtn?.isConnected) return;
    const s = Math.max(0, Math.ceil(left));
    if (s === this._tick) return;
    this._tick = s;
    this.nextBtn.innerHTML = `${this.nextLabel} (${s}) ${ICON.next}`;
  }

  // ---------------------------------------------------------------- end of a practice run
  practiceDone({ name, finished, place, players, time, race, onAgain, onBack }) {
    const line = race ? (finished ? `Finished #${place} of ${players} in ${fmtTime(time)}` : `Out after ${fmtTime(time)}`) : `Placed #${place} of ${players}`;
    const n = el(`<div class="screen pass">
      <div style="text-align:center;margin-top:1.4rem">
        <div class="res-title stroke">${name}</div>
        <div class="res-sub">${line}</div>
      </div>
      <div class="res-mid">
        <p class="note">Practice earns no rewards</p>
        <div class="res-rows">
          <button class="btn gold md" data-act="again">${ICON.retry} Try Again</button>
          <button class="btn violet md" data-act="back">${ICON.back} Back</button>
        </div>
      </div>
    </div>`);
    this.show('practiceDone', n);
    this.wire(n, { again: onAgain, back: onBack });
  }

  // ---------------------------------------------------------------- match results
  results({ won, reached, totalRounds, place, rewards, levelUps, canDouble, onDouble, onAgain, onMenu }) {
    const title = won ? SAY.spokenChampion() : SAY.spokenSpooked();
    const sub = won ? SAY.youWon() : `You reached round ${reached} of ${totalRounds} · #${place}`;
    const n = el(`<div class="screen pass">
      ${won ? `<div class="res-prize">${prizeIcon()}</div>` : ''}
      <div style="text-align:center;margin-top:${won ? '0.2rem' : '1.4rem'}">
        <div class="res-title stroke ${won ? 'won' : ''}">${title}</div>
        <div class="res-sub">${sub}</div>
      </div>
      <div class="res-mid">
        <div class="res-rows">
          <div class="rc-reward" data-rw-coins>${coinIcon()} +${rewards.coins}</div>
          ${rewards.gems ? `<div class="rc-reward">${gemIcon()} +${rewards.gems}</div>` : ''}
          <div class="rc-reward">${ICON.sparkle} +${rewards.xp} XP</div>
          <div class="rc-reward">${ICON.skull} +${rewards.event} ${TERMS.candy}</div>
          ${levelUps ? `<div class="rc-reward" style="color:#ffe25a">Level up! ${levelUps > 1 ? `x${levelUps}` : ''}</div>` : ''}
        </div>
        ${canDouble ? `<button class="btn mint sm" data-act="double">${ICON.video} Double coins (+${rewards.coins})</button>` : ''}
        <div class="res-rows">
          <button class="btn gold md" data-act="again">${ICON.retry} Play Again</button>
          <button class="btn violet md" data-act="menu">${ICON.home} Main Menu</button>
        </div>
      </div>
    </div>`);
    this.show('results', n);
    this.wire(n, {
      again: onAgain, menu: onMenu,
      double: async (_, b) => {
        b.disabled = true;
        const ok = await onDouble();
        if (ok) {
          this.app.audio.sfx('coin');
          $('[data-rw-coins]', n).innerHTML = `${coinIcon()} +${rewards.coins * 2}`;
          this.toast(`${coinIcon()} Coins doubled!`);
          b.remove();
        } else {
          b.disabled = false;
          this.toast('No video is available right now. Try again later.');
        }
      },
    });
    return n;
  }

  // ---------------------------------------------------------------- event
  event() {
    const app = this.app, p = app.profile;
    const n = el(`<div class="screen solid">
      <div class="hdr">
        <button class="btn violet round" data-act="back" aria-label="Back">${ICON.back}</button>
        <div class="title chip">Halloween Event</div>
        <div class="spacer"></div>
        <div class="wallet">${this.walletHtml()}</div>
      </div>
      <div class="ev-banner">
        <div>
          <h1>Halloween<br>Event</h1>
          <p>Complete special challenges,<br>earn exclusive rewards!</p>
          <div class="ev-ends">Ends in: ${fmtEnds(p.seasonEndsIn())}</div>
        </div>
        <div class="ev-hero" data-hero></div>
      </div>
      <div class="ev-prog" data-prog></div>
      <div class="ev-track" data-track></div>
    </div>`);
    this.show('event', n);
    $('[data-hero]', n).append(app.thumbs.character('pumpkin', { hat: 'witch', w: 300, h: 340, mode: 'pose', yaw: -0.14 }));
    const paint = () => {
      const pts = p.d.event.points, last = EVENT_TRACK[EVENT_TRACK.length - 1].need;
      $('[data-prog]', n).innerHTML = `<i style="width:${Math.min(100, (100 * pts) / last)}%"></i><b>${pts} / ${last} Candy</b>`;
      const t = $('[data-track]', n);
      t.innerHTML = '';
      EVENT_TRACK.forEach((tier, i) => {
        const claimed = p.d.event.claimed.includes(i), ready = p.eventTierReady(i);
        const r = tier.reward;
        const k = el(`<button class="ev-tier ${claimed ? 'claimed' : ''} ${ready ? 'ready' : ''}" data-act="claim" data-id="${i}">
          <div class="pts">${tier.need}</div><div class="rw"></div>
          <div class="pts">${claimed ? 'Claimed' : ready ? 'Claim!' : `Tier ${i + 1}`}</div></button>`);
        const rw = $('.rw', k);
        if (r.item) {
          const [kind, id] = r.item;
          let name;
          if (kind === 'skin') { rw.append(app.thumbs.character(id, { w: 120, h: 150 })); name = SKINS[id].name; }
          else if (kind === 'hat' || kind === 'glasses') { rw.append(app.thumbs.accessory(kind, id, { w: 100, h: 100 })); name = (kind === 'hat' ? HATS : GLASSES)[id].name; }
          else if (kind === 'trail') { const c = trailPicture(TRAILS[id]); rw.append(c); name = TRAILS[id].name; }
          else { rw.append(app.thumbs.character('pumpkin', { w: 100, h: 125, emote: id, mode: 'emote' })); name = EMOTES[id].name; }
          rw.append(el(`<span>${name}</span>`));
        } else rw.innerHTML = r.coins ? `${coinIcon()}<span>${r.coins}</span>` : `${gemIcon()}<span>${r.gems}</span>`;
        t.append(k);
      });
    };
    this.wire(n, {
      back: () => app.goto('menu'),
      claim: (id) => {
        const r = p.claimEvent(+id);
        if (r) { app.audio.sfx('levelup'); this.toast(r.item ? `${ICON.sparkle} Reward unlocked!` : `Claimed ${rewardBits(r)}`); paint(); }
      },
    });
    paint();
  }

  // ---------------------------------------------------------------- modals
  openModal(html, map = {}) {
    this.closeModal();
    const s = el(`<div class="scrim"><div class="modal">${html}</div></div>`);
    this.root.appendChild(s);
    this.modal = s;
    s.addEventListener('click', (e) => {
      if (e.target === s) { this.closeModal(); map.onClose?.(); return; }
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const f = map[b.dataset.act];
      if (f) f(b.dataset.id, b);
      else if (b.dataset.act === 'close') { this.closeModal(); map.onClose?.(); }
    });
    return s;
  }

  closeModal() { this.modal?.remove(); this.modal = null; }

  settings(extra = {}) {
    const app = this.app, p = app.profile, st = p.d.settings;
    const q = st.quality;
    const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const s = this.openModal(`
      <button class="btn violet round x" data-act="close" aria-label="Close">${ICON.back}</button>
      <h2>Settings</h2>
      <div class="row">${ICON.music} Music <input type="range" min="0" max="1" step="0.05" value="${st.music}" data-r="music"></div>
      <div class="row">${ICON.sound} Sound Effects <input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-r="sfx"></div>
      <div class="row">Graphics ${seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], q)}</div>
      <div class="row">Camera Speed <input type="range" min="0.4" max="2" step="0.05" value="${st.sens}" data-r="sens"></div>
      <div class="row">Invert Camera <button class="toggle ${st.invertY ? 'on' : ''}" data-t="invertY" aria-label="Invert camera"></button></div>
      <div class="row">Reduce Camera Shake <button class="toggle ${st.reducedShake ? 'on' : ''}" data-t="reducedShake" aria-label="Reduce camera shake"></button></div>
      ${app.isTouch ? '' : `<div class="keys" style="margin-top:.5rem"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Move (or arrow keys)</span><span><kbd>Space</kbd></span><span>Jump</span><span><kbd>Shift</kbd></span><span>Dive</span><span><kbd>Mouse</kbd></span><span>Look around (Tab frees the mouse)</span><span><kbd>P</kbd></span><span>Pause</span><span><kbd>1</kbd>-<kbd>4</kbd></span><span>Emote</span></div>`}
      <p class="note" style="margin-top:.5rem">Saved automatically. Pumpkin Party v${app.version}</p>
    `, { onClose: extra.onClose });
    s.addEventListener('input', (e) => {
      const r = e.target.dataset?.r;
      if (!r) return;
      st[r] = +e.target.value;
      app.applySettings();
    });
    s.addEventListener('click', (e) => {
      const seg2 = e.target.closest('[data-seg] button');
      if (seg2) {
        const name = seg2.parentElement.dataset.seg;
        st[name] = seg2.dataset.v;
        seg2.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === seg2));
        app.applySettings(true);
        app.audio.sfx('tab');
      }
      const tog = e.target.closest('[data-t]');
      if (tog) {
        st[tog.dataset.t] = !st[tog.dataset.t];
        tog.classList.toggle('on');
        app.applySettings();
        app.audio.sfx('tab');
      }
    });
  }

  missions() {
    const app = this.app, p = app.profile;
    const paint = () => {
      const list = p.missions();
      const stats = p.d.stats;
      const html = `
        <button class="btn violet round x" data-act="close" aria-label="Close">${ICON.back}</button>
        <h2>Daily Missions</h2>
        ${list.map((m) => `<div class="mission">
          <div class="mt">${m.text}<div class="mbar"><i style="width:${(100 * m.progress) / m.need}%"></i></div></div>
          <div class="mrw">${m.coins ? `${coinIcon()} ${m.coins}` : ''} ${m.gems ? `${gemIcon()} ${m.gems}` : ''}</div>
          ${m.claimed ? `<span class="btn violet sm" style="opacity:.6">${ICON.check}</span>` : m.done ? `<button class="btn gold sm" data-act="claim" data-id="${m.id}">Claim</button>` : `<span class="btn violet sm" style="opacity:.7;cursor:default">${m.progress}/${m.need}</span>`}
        </div>`).join('')}
        <p class="note">New missions every day. Each one also earns ${TERMS.candy} for the Halloween Event.</p>
        <div class="row" style="justify-content:space-around;font-size:1.04rem;margin-top:.3rem"><span>${prizeIcon()} ${stats.wins} ${TERMS.prizes}</span><span>${stats.matches} matches</span><span>Best streak ${stats.bestStreak}</span></div>`;
      return html;
    };
    const s = this.openModal(paint(), {
      claim: (id) => {
        const d = p.claimMission(id);
        if (d) { app.audio.sfx('coin'); this.toast(`Claimed ${rewardBits(d)}`); s.querySelector('.modal').innerHTML = paint(); }
      },
    });
  }

  daily() {
    const app = this.app, p = app.profile;
    const step = p.dailyStep();
    const days = DAILY_REWARDS.map((r, i) => `<div class="day ${i === step ? 'today' : ''} ${i < step ? 'got' : ''}">Day ${i + 1}${r.item ? ICON.gift : r.gems ? gemIcon() : coinIcon()}<span>${r.coins ?? r.gems}</span></div>`).join('');
    this.openModal(`<h2>Daily Reward</h2><div class="days">${days}</div><p class="note" style="margin:.6rem 0 0">Come back every day for bigger prizes!</p>
      <div class="foot"><button class="btn gold md" data-act="claim">Claim ${rewardBits(DAILY_REWARDS[step])}</button></div>`, {
      claim: () => { const r = p.claimDaily(); this.closeModal(); if (r) { app.audio.sfx('levelup'); this.toast(`Claimed ${rewardBits(r)}`); } },
    });
  }

  freeCoins(short = 0) {
    const app = this.app, p = app.profile;
    const can = app.sdk.canOfferRewarded && p.freeCoinsLeft() > 0;
    const amt = [60, 40, 25][p.d.freeCoinsCount] ?? 25;
    this.openModal(`<button class="btn violet round x" data-act="close" aria-label="Close">${ICON.back}</button><h2>Get Coins</h2>
      ${short ? `<p class="note" style="font-size:1.1rem">You need ${short} more coins.</p>` : ''}
      <p class="note" style="font-size:1.1rem;margin:.4rem 0">You earn coins every round you're ${TERMS.spared.toLowerCase()}, from daily missions and the Halloween Event.</p>
      ${can ? `<div class="foot"><button class="btn gold md" data-act="watch">${ICON.video} Watch Video: +${amt} ${coinIcon()}</button><button class="btn gold md" data-act="close">No Thanks</button></div><p class="note">${p.freeCoinsLeft()} left today</p>` : '<div class="foot"><button class="btn gold md" data-act="close">Got It</button></div>'}`, {
      watch: async () => {
        this.closeModal();
        const ok = await app.rewardedAd();
        if (ok) { const a = p.claimFreeCoins(); app.audio.sfx('coin'); this.toast(`${coinIcon()} +${a} coins!`); } else this.toast('No video is available right now. Try again later.');
      },
    });
  }

  gemsInfo() {
    this.openModal(`<button class="btn violet round x" data-act="close" aria-label="Close">${ICON.back}</button><h2>Gems</h2>
      <p class="note" style="font-size:1.14rem">Gems are earned by levelling up, winning a ${TERMS.prize}, completing missions and climbing the Halloween Event track.</p>
      <div class="foot"><button class="btn gold md" data-act="close">Got It</button></div>`);
  }

  pause({ onResume, onQuit, canRestart = false, onRestart }) {
    const n = this.openModal(`<h2>Paused</h2>
      <div class="foot" style="flex-direction:column;align-items:stretch">
        <button class="btn gold md" data-act="resume">${ICON.play} Resume</button>
        ${canRestart ? `<button class="btn violet md" data-act="restart">${ICON.retry} Try Again</button>` : ''}
        <button class="btn violet md" data-act="opts">${ICON.gear} Settings</button>
        <button class="btn violet md" data-act="quit">${ICON.home} Main Menu</button>
      </div>`, {
      resume: onResume,
      restart: () => onRestart?.(),
      opts: () => { this.settings({ onClose: () => this.pause({ onResume, onQuit, canRestart, onRestart }) }); },
      quit: onQuit,
      onClose: onResume,
    });
    return n;
  }
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/** A small swirl of the trail's particles, for shop cards. */
function trailPicture(t) {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 240;
  const x = c.getContext('2d');
  const atlas = particleAtlas().image;
  const cs = atlas.width / 4;
  const cell = t.cell;
  const sx = (cell % 4) * cs, sy = Math.floor(cell / 4) * cs;
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = cs;
  const tc = tmp.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const px = 100 + Math.sin(k * 5.2) * 58 * (1 - k * 0.4);
    const py = 216 - k * 196;
    const size = 28 + (1 - k) * 34;
    const color = t.colors[i % t.colors.length];
    tc.globalCompositeOperation = 'source-over';
    tc.clearRect(0, 0, cs, cs);
    tc.drawImage(atlas, sx, sy, cs, cs, 0, 0, cs, cs);
    if (t.cell !== 5) {
      tc.globalCompositeOperation = 'source-atop';
      tc.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      tc.fillRect(0, 0, cs, cs);
    }
    x.globalAlpha = 0.45 + (1 - k) * 0.55;
    x.drawImage(tmp, px - size / 2, py - size / 2, size, size);
  }
  return c;
}
