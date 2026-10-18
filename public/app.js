/* La Paulée de Berlin 2026 – digitale Weinliste & Bestellung
   Ohne Framework, ohne Build. Läuft nach dem ersten Öffnen offline (Service Worker). */
(() => {
'use strict';

const APP_VERSION = '2026.10.18';
const C = window.PAULEE_CONFIG || {};
const LS = { mode: 'pb.mode', code: 'pb.code', cart: 'pb.cart', rate: 'pb.rate', form: 'pb.form',
             orders: 'pb.orders', seen: 'pb.seen', deliv: 'pb.deliv' };

/* ---------- Hilfen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const money = c => eur.format(c / 100);           // Beträge intern in Cent
const cents = x => Math.round(x * 100);
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normCode = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fl = n => n === 1 ? '1 Flasche' : n + ' Flaschen';
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const KIND = { rouge: 'rouge', blanc: 'blanc', rose: 'rosé', mousseux: 'effervescent', doux: 'doux', spiritueux: 'spiritueux', sans: 'alkoholfrei' };
const ROOM = { S: 'Salon Pariser Platz', M: 'Salle à Manger', E: 'Entrée' };
const NA = { 'a.A.': ['auf Anfrage', 'a.A.'], 'a.Z.': ['auf Zuteilung', 'a.Z.'] };
const DELIV = {
  lieferung: ['Lieferung', 'an die Rechnungs- bzw. Lieferanschrift'],
  'abholung-berlin': ['Abholung Berlin', 'Köpenicker Straße 18–20 · kostenfrei'],
  'abholung-hamburg': ['Abholung Hamburg', 'Große Elbstraße 131 · kostenfrei']
};

/* ---------- Zustand ---------- */
let DATA = null, WINES = [], BY = {}, ORDER_IDX = {}, B2B = null;
const S = {
  mode: store.get(LS.mode, 'c'),                 // 'c' Privatkunden · 'b' Gastronomie & Fachhandel
  cart: store.get(LS.cart, {}),
  rate: store.get(LS.rate, {}),
  deliv: store.get(LS.deliv, 'lieferung'),
  room: '', kinds: new Set(), flags: new Set(), q: '',
  view: null, viewArg: null, reloadPending: false
};

const priceOf = w => S.mode === 'b' ? (B2B ? B2B[w.n] : undefined) : w.c;
const orderable = w => typeof priceOf(w) === 'number';

function windowState() {
  if (C.preview) return 'open';
  const now = Date.now();
  if (now < Date.parse(C.orderStart)) return 'before';
  if (now > Date.parse(C.orderEnd)) return 'after';
  return 'open';
}

/* ---------- B2B-Preise entschlüsseln ---------- */
async function unlock(code) {
  const b = DATA.b2b, enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(normCode(code)), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(b.salt), iterations: b.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(b.iv) }, key, b64(b.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

async function setMode(m, code) {
  if (m === 'b') {
    B2B = await unlock(code);           // wirft bei falschem Code
    store.set(LS.code, code);
  } else {
    B2B = null;
    store.del(LS.code);
  }
  S.mode = m;
  store.set(LS.mode, m);
  // Positionen entfernen, die in dieser Preisansicht nicht bestellbar sind (z. B. 128-4 privat a.A.)
  const dropped = [];
  for (const n of Object.keys(S.cart)) if (!BY[n] || !orderable(BY[n])) { dropped.push(n); delete S.cart[n]; }
  store.set(LS.cart, S.cart);
  applyMode();
  renderList();
  updateCart();
  renderFoot();
  if (dropped.length) toast(`${dropped.join(', ')} in dieser Preisansicht nicht bestellbar – entfernt`);
}

function applyMode() {
  document.body.classList.toggle('b2b', S.mode === 'b');
  $('#modeLabel').textContent = S.mode === 'b' ? 'Gastronomie' : 'Privatkunden';
  $('meta[name=theme-color]').content = S.mode === 'b' ? '#003B54' : '#75232A';
}

/* ---------- Summen ---------- */
function totals(deliv = S.deliv) {
  const lines = [];
  let sub = 0, bottles = 0;
  for (const [n, q] of Object.entries(S.cart)) {
    const w = BY[n];
    if (!w || !q) continue;
    const p = priceOf(w);
    if (typeof p !== 'number') continue;
    const pc = cents(p);
    lines.push({ w, q, pc, lc: pc * q });
    sub += pc * q; bottles += q;
  }
  lines.sort((a, b) => ORDER_IDX[a.w.n] - ORDER_IDX[b.w.n]);
  const disc = Math.round(sub * (C.privilegePct || 0) / 100);
  const goods = sub - disc;
  let ship = 0;
  if (deliv === 'lieferung' && bottles) {
    if (S.mode === 'c') ship = sub >= cents(C.b2cFreeFrom) ? 0 : Math.ceil(bottles / C.b2cParcelSize) * cents(C.b2cParcel);
    else ship = sub >= cents(C.b2bFreeFrom) ? 0 : Math.max(cents(C.b2bMin), bottles * cents(C.b2bPerBottle));
  }
  const total = goods + ship, rate = C.vatPct || 19;
  // B2C: enthaltene MwSt. · B2B: MwSt. auf die Nettosumme
  const vat = S.mode === 'c' ? total - Math.round(total / (1 + rate / 100)) : Math.round(total * rate / 100);
  const gross = S.mode === 'c' ? total : total + vat;
  return { lines, sub, disc, goods, ship, total, vat, gross, bottles };
}

/* ---------- Weinliste ---------- */
function rateHtml(n) {
  const r = S.rate[n] || 0;
  let h = '<div class="rate" role="group" aria-label="Ihre Bewertung">';
  for (let i = 1; i <= 5; i++) h += `<button data-rate="${i}" class="${i <= r ? 'on' : ''}" aria-label="${i} von 5"></button>`;
  return h + '</div>';
}

function qtyHtml(n) {
  const q = S.cart[n] || 0;
  return `<div class="qty${q ? '' : ' zero'}"><button class="minus" data-q="-1" aria-label="Eine Flasche weniger">−</button>` +
         `<input class="qn" type="number" inputmode="numeric" min="0" max="999" value="${q}" aria-label="Anzahl Flaschen"><button class="plus" data-q="1" aria-label="Eine Flasche mehr">${q ? '+' : '+ Fl.'}</button></div>`;
}

function wineHtml(w) {
  const p = priceOf(w);
  let price;
  if (typeof p === 'number') {
    const perL = S.mode === 'c' ? `<small>${money(Math.round(cents(p) / w.l))}/l</small>` : '<small>netto</small>';
    price = `<b>${money(cents(p))}</b>${perL}`;
  } else {
    price = `<em>${esc(p || '–')}</em>`;
  }
  const action = typeof p === 'number'
    ? qtyHtml(w.n)
    : `<div class="ask">${NA[p] ? NA[p][0] : 'nicht verfügbar'} –<br>am Infotisch erfragen</div>`;
  const sub = [w.v, w.l !== 0.75 ? w.u : ''].filter(Boolean).join(' · ');
  return `<article class="wine${S.cart[w.n] ? ' in' : ''}" id="w-${w.n}" data-n="${w.n}">` +
    `<div class="wine-no">${w.n}</div>` +
    `<div class="wine-main"><div class="wine-t"><i class="sym ${w.k}" title="${KIND[w.k]}"></i>` +
    `<span class="wine-n">${esc(w.w)}${w.o ? '<span class="bio">BIO</span>' : ''}${w.k === 'sans' ? '<span class="zero">0 %</span>' : ''}</span></div>` +
    (sub ? `<div class="wine-v">${esc(sub)}</div>` : '') + `</div>` +
    `<div class="wine-p">${price}</div>` +
    `<div class="wine-a">${rateHtml(w.n)}${action}</div></article>`;
}

function renderList() {
  const rooms = {};
  for (const w of WINES) {
    const r = rooms[w.m] ||= { tables: new Map(), min: 1e9, max: 0 };
    r.min = Math.min(r.min, w.t); r.max = Math.max(r.max, w.t);
    let t = r.tables.get(w.t);
    if (!t) r.tables.set(w.t, t = { doms: [], regs: [], wines: [] });
    if (!t.doms.includes(w.d)) t.doms.push(w.d);
    if (!t.regs.includes(w.r)) t.regs.push(w.r);
    t.wines.push(w);
  }
  let h = '';
  for (const m of ['S', 'M', 'E']) {
    const r = rooms[m];
    if (!r) continue;
    h += `<section class="room" data-m="${m}" data-room="${m}"><div class="room-h"><h2>${ROOM[m]}</h2><span>Tables ${r.min}–${r.max}</span></div>`;
    for (const [tn, t] of r.tables) {
      h += `<div class="table" id="t-${tn}" data-t="${tn}"><div class="table-h"><div class="table-no"><small>TABLE</small><b>${tn}</b></div>` +
           `<div class="table-name"><h3>${esc(t.doms.join(' · '))}</h3><p>${esc(t.regs.join(' · '))}</p></div></div>`;
      for (const w of t.wines) h += wineHtml(w);
      h += '</div>';
    }
    h += '</section>';
  }
  $('#list').innerHTML = h;
  applyFilter();
}

function matches(w, tokens, numeric) {
  if (S.room && w.m !== S.room) return false;
  if (S.kinds.size && !S.kinds.has(w.k)) return false;
  if (S.flags.has('bio') && !w.o) return false;
  if (S.flags.has('rated') && !S.rate[w.n]) return false;
  if (S.flags.has('cart') && !S.cart[w.n]) return false;
  if (numeric) return w.n.startsWith(numeric) || w.a.replace(/\s/g, '').includes(numeric.replace('-', ''));
  if (!tokens.length) return true;
  const hay = w._hay ||= fold([w.n, w.w, w.d, w.r, w.v, KIND[w.k], ROOM[w.m], w.o ? 'bio' : ''].join(' '));
  return tokens.every(t => hay.includes(t));
}

function applyFilter() {
  const q = fold(S.q.trim());
  const numeric = /^\d{1,3}(-\d{0,2})?$/.test(q) ? q : '';
  const tokens = numeric ? [] : q.split(/\s+/).filter(Boolean);
  let any = false;
  for (const sec of $$('#list .room')) {
    let secAny = false;
    for (const tb of $$('.table', sec)) {
      let tAny = false;
      for (const el of $$('.wine', tb)) {
        const ok = matches(BY[el.dataset.n], tokens, numeric);
        el.hidden = !ok;
        tAny ||= ok;
      }
      tb.hidden = !tAny;
      secAny ||= tAny;
    }
    sec.hidden = !secAny;
    any ||= secAny;
  }
  $('#empty').hidden = any;
  $('#empty').textContent = S.flags.has('cart') && !Object.keys(S.cart).length
    ? 'Noch keine Weine in Ihrer Bestellung.' : 'Keine Weine zu dieser Auswahl.';
}

/* ---------- Warenkorb ---------- */
function setQty(n, q) {
  q = Math.max(0, Math.min(999, q | 0));
  if (q) S.cart[n] = q; else delete S.cart[n];
  store.set(LS.cart, S.cart);
  const el = document.getElementById('w-' + n);
  if (el && BY[n] && orderable(BY[n])) {
    el.classList.toggle('in', !!q);
    const old = $('.qty', el);
    old.outerHTML = qtyHtml(n);
  }
  updateCart(true);
}

function updateCart(bump) {
  const t = totals();
  $('#cartCount').textContent = t.bottles;
  $('#cartTotal').textContent = t.bottles ? money(t.goods) : 'Bestellung';
  if (bump) { const b = $('.cartbtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}

/* ---------- Bestellungen & Übertragung ---------- */
const orders = () => store.get(LS.orders, []);
function saveOrder(o) {
  const list = orders();
  const i = list.findIndex(x => x.id === o.id);
  if (i >= 0) list[i] = o; else list.push(o);
  store.set(LS.orders, list);
}

function shortCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(5));
  return 'P-' + [...r].map(x => A[x % A.length]).join('');
}
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let flushing = false;
async function flush() {
  if (flushing || !C.endpoint) return;
  const pending = orders().filter(o => o.status === 'pending');
  if (!pending.length) return;
  flushing = true;
  try {
    for (const o of pending) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      try {
        const r = await fetch(C.endpoint, {
          method: 'POST', body: JSON.stringify(o.payload), signal: ctl.signal,
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', cache: 'no-store'
        });
        const j = await r.json();
        if (j && j.ok) {
          o.status = 'sent'; o.sentAt = new Date().toISOString();
          saveOrder(o);
        } else break;
      } catch { break; } finally { clearTimeout(timer); }
    }
  } finally {
    flushing = false;
    updatePending();
    if (S.view === 'done' || S.view === 'orders') openView(S.view, S.viewArg, true);
  }
}

function updatePending() {
  const n = orders().filter(o => o.status === 'pending').length;
  const el = $('#pending');
  if (!n || !C.endpoint) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>${n === 1 ? '1 Bestellung' : n + ' Bestellungen'} noch nicht übertragen.</b> ` +
    `Wird automatisch gesendet, sobald Sie Empfang haben. Ansehen ›`;
}

function orderText(p) {
  const L = [`Bestellung ${p.code} – La Paulée de Berlin 2026`,
    `${p.mode === 'B2B' ? 'Gastronomie & Fachhandel (netto)' : 'Privatkunden (inkl. MwSt.)'} · ${new Date(p.createdAt).toLocaleString('de-DE')}`, ''];
  for (const i of p.items) L.push(`${i.qty} × ${i.n}  ${i.wine} – ${i.domaine}  à ${money(i.priceCents)}`);
  const t = p.totals;
  L.push('', `Zwischensumme: ${money(t.subCents)}`, `Privilège Paulée –${C.privilegePct} %: –${money(t.discCents)}`,
    `${DELIV[p.delivery.type][0]}: ${t.shipCents ? money(t.shipCents) : 'kostenfrei'}`,
    ...(p.mode === 'B2B'
      ? [`Summe netto: ${money(t.totalCents)}`, `zzgl. ${t.vatPct} % MwSt.: ${money(t.vatCents)}`, `Gesamtbetrag brutto: ${money(t.grossCents)}`]
      : [`Summe: ${money(t.totalCents)} (darin ${t.vatPct} % MwSt.: ${money(t.vatCents)})`]), '');
  if (p.mode === 'B2B') L.push('Bestellung zu Konditionen für Gastronomie & Fachhandel (gewerblicher Kunde bestätigt).', '');
  const c = p.customer;
  for (const [k, v] of Object.entries(c)) if (v) L.push(`${FIELD_LABEL[k] || k}: ${v}`);
  if (p.delivery.address) L.push(`Lieferanschrift: ${p.delivery.address}`);
  if (p.delivery.wish) L.push(`Wunschtermin: ${p.delivery.wish}`);
  if (p.note) L.push(`Bemerkung: ${p.note}`);
  L.push('', `Referenz: ${p.id}`);
  return L.join('\n');
}
function mailHref(p) {
  return `mailto:${C.contactMail}?subject=${encodeURIComponent('Paulée-Bestellung ' + p.code)}&body=${encodeURIComponent(orderText(p))}`;
}

/* ---------- Formular ---------- */
const FIELD_LABEL = { firma: 'Firma / Restaurant', name: 'Vor- und Nachname', kdnr: 'Kundennummer', ustid: 'USt-IdNr.',
  str: 'Straße / Hausnr.', plz: 'PLZ', ort: 'Ort', tel: 'Telefon', mail: 'E-Mail' };
// [key, Label, Pflicht, Breite (w = ganze Zeile, s = halbe), autocomplete, type]
const FIELDS = {
  c: [['name', 'Vor- und Nachname', 1, 'w', 'name'], ['kdnr', 'Kundennummer (falls bekannt)', 0, 'w', 'off'],
      ['str', 'Straße / Hausnr.', 1, 'w', 'street-address'], ['plz', 'PLZ', 1, 's', 'postal-code'], ['ort', 'Ort', 1, 's', 'address-level2'],
      ['tel', 'Telefon', 1, 's', 'tel', 'tel'], ['mail', 'E-Mail', 1, 's', 'email', 'email']],
  b: [['firma', 'Firma / Restaurant', 1, 'w', 'organization'], ['name', 'Ansprechpartner', 1, 'w', 'name'],
      ['mail', 'E-Mail (für die Bestätigung)', 1, 'w', 'email', 'email'],
      ['kdnr', 'Kundennummer', 0, 's', 'off'], ['ustid', 'USt-IdNr.', 0, 's', 'off'],
      ['str', 'Straße / Hausnr.', 0, 'w', 'street-address'], ['plz', 'PLZ', 0, 's', 'postal-code'], ['ort', 'Ort', 0, 's', 'address-level2'],
      ['tel', 'Telefon', 0, 'w', 'tel', 'tel']]
};

function fieldHtml([k, label, req, wd, ac, type], val) {
  return `<div class="fld ${wd}"><label for="f-${k}">${esc(label)}${req ? ' <i>*</i>' : ''}</label>` +
    `<input id="f-${k}" name="${k}" type="${type || 'text'}" autocomplete="${ac}" value="${esc(val || '')}"${req ? ' required' : ''}` +
    `${k === 'plz' ? ' inputmode="numeric"' : ''}${type === 'email' ? ' autocapitalize="off" spellcheck="false"' : ''}></div>`;
}

/* ---------- Ansichten im Overlay ---------- */
const sheet = () => $('#sheet');
function openView(view, arg, keepScroll) {
  S.view = view; S.viewArg = arg;
  const body = $('#sheetBody'), top = body.scrollTop;
  const [title, html, back] = VIEWS[view](arg);
  $('#sheetTitle').textContent = title;
  body.innerHTML = html;
  $('.back', sheet()).hidden = !back;
  $('.back', sheet()).dataset.to = back || '';
  if (sheet().hidden) {
    sheet().hidden = false; document.body.style.overflow = 'hidden';
    try { history.pushState({ pbSheet: 1 }, ''); } catch {}
  }
  body.scrollTop = keepScroll ? top : 0;
  AFTER[view]?.(arg);
}
let popGuard = false;
function closeView(fromPop) {
  if (sheet().hidden) return;
  if (S.view === 'welcome') store.set(LS.seen, 1);
  sheet().hidden = true; S.view = null;
  if (!fromPop && history.state && history.state.pbSheet) { popGuard = true; history.back(); }
  document.body.style.overflow = '';
  if (S.reloadPending) location.reload();
}

function privHtml() {
  return `<div class="priv"><b>Privilège Paulée</b><strong>–${C.privilegePct} %</strong>` +
    `<span>ab der ersten Flasche · nur am 2. November 2026 bis 23:59 Uhr</span></div>`;
}

const VIEWS = {
  welcome() {
    return ['', `<div class="welcome">
      <img src="/img/logo-gold.png" alt="La Paulée de Berlin" width="500" height="155">
      <p class="date">Lundi 2 novembre 2026 · Ambassade de France</p>
      <p class="lead">Die Weinliste ist jetzt auf Ihrem Gerät gespeichert und funktioniert auch ohne Empfang. Merken Sie Ihre Favoriten vor und bestellen Sie bis 23:59 Uhr.</p>
      ${privHtml()}
      <div class="choice">
        <button class="btn c stack" data-action="pick-c">Privatkunde<small>Preise inkl. MwSt.</small></button>
        <button class="btn b stack" data-action="pick-b">Gastronomie & Fachhandel<small>Nettopreise mit B2B-Code</small></button>
      </div>
      <div id="codeBox" hidden>${codeFormHtml()}</div>
    </div>`];
  },
  mode() {
    return ['Preisansicht', `
      <div class="opts">
        <label class="opt"><input type="radio" name="m" value="c"${S.mode === 'c' ? ' checked' : ''}><span><b>Privatkunden</b><small>Preise je Flasche inkl. MwSt.</small></span></label>
        <label class="opt"><input type="radio" name="m" value="b"${S.mode === 'b' ? ' checked' : ''}><span><b>Gastronomie & Fachhandel</b><small>Nettopreise zzgl. MwSt. – nur für gewerbliche Kunden, mit B2B-Code</small></span></label>
      </div>
      <div id="codeBox"${S.mode === 'b' ? ' hidden' : ' hidden'}>${codeFormHtml()}</div>`];
  },
  cart() {
    const t = totals();
    if (!t.lines.length) {
      return ['Ihre Bestellung', `<p class="empty" style="margin:20px 0">Noch keine Weine vorgemerkt.</p>
        <p class="hint" style="text-align:center">Tippen Sie bei einem Wein auf <b>+ Fl.</b></p>
        <button class="btn ghost" data-action="close" style="margin-top:20px">Zur Weinliste</button>`];
    }
    const ws = windowState();
    let h = '<div class="lines">';
    for (const l of t.lines) {
      h += `<div class="line" data-n="${l.w.n}"><div><div class="line-t">${esc(l.w.w)}</div>` +
           `<div class="line-s">${l.w.n} · ${esc(l.w.d)} · ${money(l.pc)}</div></div>` +
           `<div class="line-r">${money(l.lc)}</div>${qtyHtml(l.w.n)}</div>`;
    }
    h += '</div>';
    h += `<fieldset><legend>Lieferung oder Abholung · bis ${C.deliveryUntil}</legend><div class="opts">`;
    for (const [k, [a, b]] of Object.entries(DELIV)) {
      h += `<label class="opt"><input type="radio" name="deliv" value="${k}"${S.deliv === k ? ' checked' : ''}><span><b>${a}</b><small>${b}</small></span></label>`;
    }
    h += `</div><p class="hint">Abholung Di.–Fr. 10.30–19.00 Uhr · Sa. 11.00–18.00 Uhr</p></fieldset>`;
    h += sumHtml(t);
    if (ws === 'open') {
      h += `<div class="submit"><button class="btn" data-action="form">Weiter zu Ihren Angaben</button></div>`;
    } else {
      h += `<div class="box warn">${ws === 'before'
        ? 'Bestellen können Sie am <b>2. November 2026 von 0:00 bis 23:59 Uhr</b>. Ihre Auswahl bleibt bis dahin auf diesem Gerät gespeichert.'
        : 'Die Bestellung ist seit dem 2. November, 23:59 Uhr, geschlossen. Für Fragen erreichen Sie uns unter ' + esc(C.contactPhone) + '.'}</div>`;
    }
    return ['Ihre Bestellung', h];
  },
  form() {
    const t = totals();
    const saved = store.get(LS.form, {});
    const v = saved[S.mode] || {};
    let h = `<div class="f">${FIELDS[S.mode].map(f => fieldHtml(f, v[f[0]])).join('')}</div>`;
    if (S.deliv === 'lieferung') {
      h += `<label class="check"><input type="checkbox" id="f-la"${v.la ? ' checked' : ''}><span>Lieferanschrift weicht ab</span></label>
        <div class="f" id="laBox" style="margin-top:10px"${v.la ? '' : ' hidden'}>
          ${fieldHtml(['la_name', 'Name / Firma', 0, 'w', 'off'], v.la_name)}
          ${fieldHtml(['la_str', 'Straße / Hausnr.', 0, 'w', 'off'], v.la_str)}
          ${fieldHtml(['la_plz', 'PLZ', 0, 's', 'off'], v.la_plz)}
          ${fieldHtml(['la_ort', 'Ort', 0, 's', 'off'], v.la_ort)}
        </div>`;
    }
    h += `<div class="f" style="margin-top:12px">
        ${fieldHtml(['wish', `Wunschtermin ${S.deliv === 'lieferung' ? 'für die Lieferung' : 'für die Abholung'} (bis ${C.deliveryUntil})`, 0, 'w', 'off'], v.wish)}
        <div class="fld w"><label for="f-note">Bemerkung</label><textarea id="f-note" name="note">${esc(v.note || '')}</textarea></div>
      </div>`;
    h += `<fieldset><legend>Zusammenfassung</legend>
      <div class="box" style="margin:0">${fl(t.bottles)} · ${esc(DELIV[S.deliv][0])}${sumHtml(t, true)}</div></fieldset>`;
    if (S.mode === 'c') {
      h += `<label class="check"><input type="checkbox" id="f-nl"${v.nl ? ' checked' : ''}><span>Ja, ich möchte den Newsletter von VISENTIN erhalten.</span></label>
        <label class="check" id="c-adult"><input type="checkbox" id="f-adult"><span>Ich bin volljährig. <i class="req">*</i></span></label>
        <label class="check" id="c-agb"><input type="checkbox" id="f-agb"><span>Ich akzeptiere die <a href="https://www.weine-visentin.de/AGB" target="_blank" rel="noopener">AGB</a> und habe die <a href="https://www.weine-visentin.de/Widerrufsrecht" target="_blank" rel="noopener">Widerrufsbelehrung</a> zur Kenntnis genommen. <i class="req">*</i></span></label>
        <p class="legal">Abgabe alkoholischer Getränke nur an Volljährige. Verbraucher können ihre Bestellung binnen 14 Tagen ab Erhalt der Ware ohne Angabe von Gründen widerrufen. Ihre Angaben verwenden wir zur Abwicklung Ihrer Bestellung, für den Newsletter nur mit Ihrer Zustimmung – <a href="https://www.weine-visentin.de/Datenschutz" target="_blank" rel="noopener">Datenschutz</a>.</p>`;
    } else {
      h += `<label class="check" id="c-pro"><input type="checkbox" id="f-pro"><span>Ich bestelle als Unternehmer für Gastronomie oder Fachhandel. Die Nettopreise gelten ausschließlich für gewerbliche Kunden. <i class="req">*</i></span></label>
        <p class="legal">Alle Preise netto zzgl. gesetzlicher MwSt. Es gelten unsere <a href="https://www.weine-visentin.de/AGB" target="_blank" rel="noopener">AGB für Geschäftskunden</a>. Ihre Angaben verwenden wir zur Abwicklung Ihrer Bestellung – <a href="https://www.weine-visentin.de/Datenschutz" target="_blank" rel="noopener">Datenschutz</a>.</p>`;
    }
    h += `<p class="err" id="formErr" hidden></p>
      <div class="submit"><button class="btn stack" data-action="submit">${S.mode === 'c' ? 'Zahlungspflichtig bestellen' : 'Verbindlich bestellen'}<small>${S.mode === 'c' ? money(t.total) + ' inkl. MwSt.' : money(t.total) + ' netto · ' + money(t.gross) + ' brutto'}</small></button></div>`;
    return ['Ihre Angaben', h, 'cart'];
  },
  done(id) {
    const o = orders().find(x => x.id === id);
    if (!o) return ['Bestellung', '<p class="empty">Nicht gefunden.</p>'];
    const p = o.payload, sent = o.status === 'sent', test = !C.endpoint;
    let h = `<div class="done"><div class="mark${sent ? '' : ' wait'}">${sent ? '✓' : '…'}</div>
      <h3>Merci${p.customer.name ? ', ' + esc(p.customer.name.split(' ')[0]) : ''}.</h3>
      <p>Ihre Bestellnummer</p><div class="no">${p.code}</div>
      <p style="color:var(--muted);font-size:13px">${fl(p.items.reduce((a, i) => a + i.qty, 0))} · ${p.mode === 'B2B' ? money(p.totals.totalCents) + ' netto · ' + money(p.totals.grossCents) + ' brutto' : money(p.totals.totalCents) + ' inkl. MwSt.'}</p>`;
    if (sent) {
      h += `<p>Ihre Bestellung ist bei uns eingegangen. Sie erhalten eine Bestätigung an <b>${esc(p.customer.mail)}</b>; wegen ${p.delivery.type === 'lieferung' ? 'der Lieferung' : 'der Abholung'} melden wir uns bei Ihnen.</p>`;
    } else if (test) {
      h += `<div class="box warn"><b>Testbetrieb.</b> Die Bestellung ist auf diesem Gerät gespeichert, wird aber noch nicht übertragen.</div>`;
    } else {
      h += `<div class="box warn"><b>Noch nicht übertragen – kein Empfang.</b><br>
        Ihre Bestellung ist auf diesem Gerät sicher gespeichert und wird automatisch gesendet, sobald Sie Empfang haben – spätestens, wenn Sie diese Seite nach dem Verlassen der Botschaft noch einmal öffnen.</div>
        <button class="btn" data-action="retry">Jetzt senden</button>
        <a class="btn ghost" style="margin-top:8px" href="${esc(mailHref(p))}">Stattdessen per E-Mail senden</a>
        <p class="hint">Die E-Mail wartet im Postausgang und geht automatisch raus, sobald Sie Empfang haben. Bitte nur eine der beiden Möglichkeiten nutzen.</p>`;
    }
    h += `<button class="btn ghost" data-action="close" style="margin-top:14px">Zurück zur Weinliste</button></div>`;
    return ['Vielen Dank', h];
  },
  orders() {
    const list = orders().slice().reverse();
    if (!list.length) return ['Meine Bestellungen', '<p class="empty">Noch keine Bestellungen auf diesem Gerät.</p>'];
    let h = '<div class="orders">';
    for (const o of list) {
      const p = o.payload;
      const pill = o.status === 'sent' ? '<span class="pill">übertragen</span>'
        : !C.endpoint ? '<span class="pill test">Test</span>' : '<span class="pill wait">wartet</span>';
      h += `<div class="o" data-action="show-order" data-id="${o.id}" role="button" tabindex="0"><div><b>${p.code}</b>` +
           `<small>${new Date(p.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · ${p.items.reduce((a, i) => a + i.qty, 0)} Fl. · ${money(p.totals.totalCents)}</small></div>${pill}</div>`;
    }
    h += '</div>';
    if (list.some(o => o.status === 'pending') && C.endpoint) h += '<button class="btn" data-action="retry" style="margin-top:16px">Jetzt senden</button>';
    return ['Meine Bestellungen', h];
  }
};

function codeFormHtml() {
  return `<p class="hint" style="text-align:left;margin-top:16px">Die Nettopreise gelten <b>ausschließlich für Kunden aus Gastronomie und Fachhandel</b>. Ihren B2B-Code finden Sie auf dem B2B-Bestellformular und in unserer E-Mail an Sie.</p>
    <form class="code" data-form="code"><input id="codeIn" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="B2B-Code" aria-label="B2B-Code">
    <button class="btn b small" style="width:auto">Freischalten</button></form><p class="err" id="codeErr" hidden></p>`;
}

function sumHtml(t, compact) {
  const vat = S.mode === 'c' ? 'Alle Preise inkl. MwSt.' : 'Alle Preise netto zzgl. MwSt.';
  let shipNote = '';
  if (S.deliv === 'lieferung') {
    shipNote = S.mode === 'c'
      ? `Versandkostenfrei ab ${money(cents(C.b2cFreeFrom))}, sonst ${money(cents(C.b2cParcel))} je Paket (bis ${C.b2cParcelSize} Fl.).`
      : `Frei Haus ab ${money(cents(C.b2bFreeFrom))} netto, sonst ${money(cents(C.b2bPerBottle))} je Flasche, mind. ${money(cents(C.b2bMin))}.`;
  }
  return `<div class="sum">
    <div><span>Zwischensumme</span><span>${money(t.sub)}</span></div>
    <div class="p"><span>Privilège Paulée –${C.privilegePct} %</span><span>–${money(t.disc)}</span></div>
    <div><span>${S.deliv === 'lieferung' ? 'Versand' : 'Abholung'}</span><span>${t.ship ? money(t.ship) : 'kostenfrei'}</span></div>
    ${S.mode === 'c'
      ? `<div class="t"><span>Summe</span><span>${money(t.total)}</span></div>
         <div class="v"><span>darin enthalten ${C.vatPct} % MwSt.</span><span>${money(t.vat)}</span></div>`
      : `<div class="tn"><span>Summe netto</span><span>${money(t.total)}</span></div>
         <div class="v"><span>zzgl. ${C.vatPct} % MwSt.</span><span>${money(t.vat)}</span></div>
         <div class="t"><span>Gesamtbetrag brutto</span><span>${money(t.gross)}</span></div>`}
    <div class="n"><span>${vat}${compact ? '' : ' ' + shipNote}</span></div></div>`;
}

/* Nachbereitung je Ansicht */
const AFTER = {
  welcome() {}, mode() {
    $$('input[name=m]', sheet()).forEach(r => r.addEventListener('change', () => {
      if (r.value === 'c') { setMode('c').then(() => { closeView(); toast('Preisansicht: Privatkunden'); }); }
      else { $('#codeBox').hidden = false; $('#codeIn').focus(); }
    }));
  },
  cart() {
    $$('input[name=deliv]', sheet()).forEach(r => r.addEventListener('change', () => {
      S.deliv = r.value; store.set(LS.deliv, S.deliv); openView('cart', null, true);
    }));
  },
  form() {
    // Eingabe-Listener für das Formular sind in bind() einmalig registriert
    const la = $('#f-la');
    la?.addEventListener('change', () => { $('#laBox').hidden = !la.checked; });
  }
};

function readForm() {
  const v = {};
  for (const el of $$('#sheetBody input[name], #sheetBody textarea[name]')) v[el.name] = el.value.trim();
  v.la = !!$('#f-la')?.checked;
  v.nl = !!$('#f-nl')?.checked;
  return v;
}
function saveForm() {
  if (S.view !== 'form') return;
  const all = store.get(LS.form, {});
  all[S.mode] = readForm();
  store.set(LS.form, all);
}

let lastSubmit = 0;
function submitOrder() {
  if (Date.now() - lastSubmit < 2000) return;
  const v = readForm();
  let bad = null;
  for (const [k, , req, , , type] of FIELDS[S.mode]) {
    const el = $('#f-' + k), wrap = el.closest('.fld');
    const ok = (!req || v[k]) && (type !== 'email' || !v[k] || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v[k]));
    wrap.classList.toggle('bad', !ok);
    if (!ok && !bad) bad = el;
  }
  const checks = S.mode === 'c' ? ['adult', 'agb'] : ['pro'];
  for (const c of checks) {
    const ok = $('#f-' + c).checked;
    $('#c-' + c).classList.toggle('bad', !ok);
    if (!ok && !bad) bad = $('#f-' + c);
  }
  const err = $('#formErr');
  if (bad) {
    err.hidden = false;
    err.textContent = 'Bitte ergänzen Sie die markierten Angaben.';
    bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
    bad.focus({ preventScroll: true });
    return;
  }
  if (windowState() !== 'open') { openView('cart'); return; }
  const t = totals();
  if (!t.lines.length) { openView('cart'); return; }

  lastSubmit = Date.now();
  const customer = {};
  for (const [k] of FIELDS[S.mode]) customer[k] = v[k] || '';
  const address = S.deliv === 'lieferung' && v.la
    ? [v.la_name, v.la_str, [v.la_plz, v.la_ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const id = uuid();
  const payload = {
    id, code: shortCode(), createdAt: new Date().toISOString(),
    mode: S.mode === 'b' ? 'B2B' : 'B2C', preview: !!C.preview,
    app: APP_VERSION, data: DATA.version,
    customer,
    delivery: { type: S.deliv, address, wish: v.wish || '' },
    newsletter: S.mode === 'c' ? !!v.nl : false,
    note: v.note || '',
    items: t.lines.map(l => ({ n: l.w.n, art: l.w.a, wine: l.w.w, domaine: l.w.d, unit: l.w.u, qty: l.q, priceCents: l.pc, lineCents: l.lc })),
    totals: { subCents: t.sub, discCents: t.disc, shipCents: t.ship, totalCents: t.total, vatCents: t.vat, grossCents: t.gross, vatPct: C.vatPct,
              bottles: t.bottles, basis: S.mode === 'b' ? 'netto' : 'brutto', privilegePct: C.privilegePct },
    businessConfirmed: S.mode === 'b'
  };
  saveOrder({ id, status: 'pending', payload });
  S.cart = {}; store.set(LS.cart, S.cart);
  renderList(); updateCart(); updatePending();
  openView('done', id);
  flush();
}

/* ---------- Footer ---------- */
function renderFoot(ready) {
  const cached = ready === undefined ? $('#foot')?.dataset.ready === '1' : ready;
  $('#foot').dataset.ready = cached ? '1' : '';
  const ship = S.mode === 'c'
    ? `Innerhalb Deutschlands ab ${money(cents(C.b2cFreeFrom))} versandkostenfrei, sonst ${money(cents(C.b2cParcel))} je Paket (bis ${C.b2cParcelSize} Fl.). Preise inkl. MwSt.`
    : `Innerhalb Deutschlands frei Haus ab ${money(cents(C.b2bFreeFrom))} netto, darunter ${money(cents(C.b2bPerBottle))} je Flasche, mindestens ${money(cents(C.b2bMin))}. Preise netto zzgl. MwSt.`;
  $('#foot').innerHTML = `
    <p><span class="status${cached ? '' : ' wait'}">${cached ? 'Weinliste offline gespeichert' : 'Weinliste wird gespeichert …'}</span></p>
    <h4>Privilège Paulée</h4>
    <p>–${C.privilegePct} % ab der ersten Flasche auf alle Bestellungen am 2. November 2026 bis 23:59 Uhr. Weine auf Anfrage (a.A.) oder auf Zuteilung (a.Z.) sind digital nicht bestellbar – bitte am Infotisch erfragen.</p>
    <h4>Infotisch · Entrée</h4>
    <p>Bestellannahme, Beratung, Fragen zu Weinen, Konditionen und Lieferung. Dort können Sie auch mit Katalog oder Papierformular bestellen – bitte nur einen Weg nutzen.</p>
    <h4>Lieferung & Abholung bis ${C.deliveryUntil}</h4>
    <p>${ship}</p>
    <p>Abholung kostenfrei bei VISENTIN – Passion Vin: Berlin, Köpenicker Straße 18–20 · Hamburg, Große Elbstraße 131 · Di.–Fr. 10.30–19.00 Uhr, Sa. 11.00–18.00 Uhr.</p>
    <div class="links">
      <button data-action="orders">Meine Bestellungen</button>
      <button data-action="mode">Preisansicht wechseln</button>
      <a href="https://www.weine-visentin.de/Impressum" target="_blank" rel="noopener">Impressum</a>
      <a href="https://www.weine-visentin.de/Datenschutz" target="_blank" rel="noopener">Datenschutz</a>
      <a href="https://www.weine-visentin.de/AGB" target="_blank" rel="noopener">AGB</a>
      ${S.mode === 'c' ? '<a href="https://www.weine-visentin.de/Widerrufsrecht" target="_blank" rel="noopener">Widerrufsrecht</a>' : ''}
    </div>
    <p style="margin-top:18px">VISENTIN – Vins Français d'Exception · Köpenicker Straße 18–20 · 10997 Berlin<br>
    <a href="tel:${C.contactPhone.replace(/\s/g, '')}">${esc(C.contactPhone)}</a> · <a href="mailto:${C.contactMail}">${C.contactMail}</a></p>
    <p style="opacity:.6;font-size:11px">Version ${APP_VERSION} · Liste ${DATA.version} · ${DATA.count} Positionen</p>`;
}

/* ---------- Ereignisse ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

async function tryCode(form) {
  const input = $('#codeIn', form.parentNode), err = $('#codeErr');
  const btn = $('button', form);
  btn.disabled = true;
  try {
    await setMode('b', input.value);
    store.set(LS.seen, 1);
    closeView();
    toast('Nettopreise freigeschaltet');
  } catch {
    err.hidden = false;
    err.textContent = 'Dieser Code ist nicht gültig. Bitte prüfen Sie die Schreibweise.';
    input.select();
  } finally { btn.disabled = false; }
}

function bind() {
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-action]');
    // Mengen & Bewertung in der Liste und im Warenkorb
    const qb = e.target.closest('[data-q]');
    if (qb) {
      const n = qb.closest('[data-n]').dataset.n;
      setQty(n, (S.cart[n] || 0) + +qb.dataset.q);
      if (S.view === 'cart') openView('cart', null, true);
      return;
    }
    const rb = e.target.closest('[data-rate]');
    if (rb) {
      const n = rb.closest('[data-n]').dataset.n, v = +rb.dataset.rate;
      S.rate[n] = S.rate[n] === v ? 0 : v;
      if (!S.rate[n]) delete S.rate[n];
      store.set(LS.rate, S.rate);
      $$('button', rb.parentNode).forEach((b, i) => b.classList.toggle('on', i < (S.rate[n] || 0)));
      return;
    }
    if (!a) return;
    const act = a.dataset.action;
    if (act !== 'home') e.preventDefault();
    switch (act) {
      case 'home': e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'cart': openView('cart'); break;
      case 'mode': openView('mode'); break;
      case 'orders': openView('orders'); break;
      case 'form': openView('form'); break;
      case 'submit': submitOrder(); break;
      case 'close': closeView(); break;
      case 'back': openView(a.dataset.to); break;
      case 'retry': toast('Wird gesendet …'); flush(); break;
      case 'show-order': openView('done', a.dataset.id); break;
      case 'pick-c': store.set(LS.seen, 1); setMode('c').then(closeView); break;
      case 'pick-b': $('#codeBox').hidden = false; $('#codeIn').focus(); break;
    }
  });
  document.addEventListener('submit', e => {
    if (e.target.dataset.form === 'code') { e.preventDefault(); tryCode(e.target); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !sheet().hidden) closeView();
    if (e.key === 'Enter' && e.target.dataset?.action === 'show-order') e.target.click();
  });

  let qt;
  $('#q').addEventListener('input', e => {
    clearTimeout(qt);
    qt = setTimeout(() => { S.q = e.target.value; applyFilter(); }, 110);
  });
  $('#rooms').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S.room = b.dataset.room;
    $$('#rooms button').forEach(x => x.classList.toggle('on', x === b));
    applyFilter(); window.scrollTo({ top: 0 });
  });
  $('#chips').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const set = b.dataset.k ? S.kinds : S.flags, key = b.dataset.k || b.dataset.f;
    set.has(key) ? set.delete(key) : set.add(key);
    b.classList.toggle('on', set.has(key));
    applyFilter(); window.scrollTo({ top: 0 });
  });

  // Formular: speichern und Markierungen entfernen (nur in der Formularansicht)
  const body = $('#sheetBody');
  const onForm = e => {
    if (S.view !== 'form') return;
    saveForm();
    const w = e.target.closest('.fld, .check');
    if (w && w.classList.contains('bad') && (e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim())) w.classList.remove('bad');
    const err = $('#formErr');
    if (err && !$('#sheetBody .bad')) err.hidden = true;
  };
  body.addEventListener('input', onForm);
  body.addEventListener('change', onForm);
  window.addEventListener('popstate', () => {
    if (popGuard) { popGuard = false; return; }
    if (!sheet().hidden) closeView(true);
  });
  document.addEventListener('change', e => {
    if (!e.target.classList?.contains('qn')) return;
    const n = e.target.closest('[data-n]').dataset.n;
    setQty(n, parseInt(e.target.value, 10) || 0);
    if (S.view === 'cart') openView('cart', null, true);
  });
  window.addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
  setInterval(() => { if (!document.hidden) flush(); }, 30000);
}

/* ---------- Banner & Offline ---------- */
function renderBanner() {
  const b = $('#banner'), ws = windowState();
  let msg = '';
  if (C.preview) msg = C.endpoint ? 'Vorschau · Testbestellungen' : 'Vorschau · Bestellungen werden noch nicht übertragen';
  else if (ws === 'before') msg = 'Bestellung am 2. November 2026 bis 23:59 Uhr – bis dahin können Sie Weine vormerken.';
  else if (ws === 'after') msg = 'Die Bestellung ist geschlossen. Merci pour votre visite.';
  b.hidden = !msg; b.textContent = msg;
}

async function checkOffline() {
  if (!('caches' in window)) return renderFoot(false);
  try {
    const hit = await caches.match('/data.json');
    renderFoot(!!hit);
  } catch { renderFoot(false); }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').then(reg => {
    navigator.serviceWorker.ready.then(() => checkOffline());
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'activated') checkOffline(); });
    });
  }).catch(() => {});
  let had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had) { had = true; checkOffline(); return; }  // erste Installation: nichts neu laden
    if (S.view) S.reloadPending = true; else location.reload();
  });
  navigator.storage?.persist?.().catch(() => {});
}

/* ---------- Start ---------- */
async function start() {
  bind();
  try {
    const r = await fetch('/data.json');
    DATA = await r.json();
  } catch {
    $('#list').innerHTML = '<p class="empty">Die Weinliste konnte nicht geladen werden. Bitte mit Empfang erneut öffnen – oder am Infotisch in der Entrée mit dem Papierformular bestellen.</p>';
    return;
  }
  WINES = DATA.wines;
  WINES.forEach((w, i) => { BY[w.n] = w; ORDER_IDX[w.n] = i; });
  // Warenkorb bereinigen (Liste kann sich geändert haben)
  for (const n of Object.keys(S.cart)) if (!BY[n]) delete S.cart[n];

  if (S.mode === 'b') {
    const code = store.get(LS.code, '');
    try { B2B = await unlock(code); } catch { S.mode = 'c'; store.set(LS.mode, 'c'); store.del(LS.code); }
  }
  for (const n of Object.keys(S.cart)) if (!orderable(BY[n])) delete S.cart[n];
  store.set(LS.cart, S.cart);

  applyMode();
  renderBanner();
  renderList();
  updateCart();
  updatePending();
  renderFoot(false);
  registerSW();
  checkOffline();
  if (!store.get(LS.seen, 0)) openView('welcome');
  flush();
}

start();
})();
