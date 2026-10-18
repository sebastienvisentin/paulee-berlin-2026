/**
 * La Paulée de Berlin 2026 – Bestellannahme
 * Google Apps Script, gebunden an die Tabelle „Paulée 2026 – Bestellungen“.
 *
 * Nimmt Bestellungen der App entgegen, schreibt sie in die Tabelle (Bestellungen + Positionen),
 * verhindert Doppelbestellungen (gleiche ID) und versendet die Bestätigung über Brevo.
 * Brevo-Schlüssel: Projekteinstellungen → Skripteigenschaften → BREVO_API_KEY
 */

const CFG = {
  senderEmail: 'info@weine-visentin.de',
  senderName: "VISENTIN – Vins Français d'Exception",
  replyTo: 'info@weine-visentin.de',
  bcc: '',                                     // optional: Kopie jeder Bestätigung an diese Adresse
  logoUrl: 'https://paulee-berlin-2026.pages.dev/img/logo-gold.png',
  deadline: new Date('2026-11-02T23:59:59+01:00'),
  phone: '+49 30 695 199 20',
  web: 'https://www.weine-visentin.de/'
};

const SHEETS = {
  orders: 'Bestellungen', items: 'Positionen',
  testOrders: 'Test – Bestellungen', testItems: 'Test – Positionen'
};

const ORDER_COLS = ['Eingang', 'Bestellnr.', 'In JTL erfasst', 'Typ', 'Sprache', 'Firma', 'Name / Ansprechpartner',
  'E-Mail', 'Telefon', 'Kundennr.', 'USt-IdNr.', 'Straße', 'PLZ', 'Ort', 'Lieferart', 'Lieferanschrift (abweichend)',
  'Wunschtermin', 'Bemerkung', 'Flaschen', 'Zwischensumme', 'Privilège', 'Versand', 'Summe (B2B netto / B2C brutto)',
  'MwSt.', 'Gesamt brutto', 'Newsletter', 'Gastro/Fachhandel bestätigt', 'Bestellt am (Gerät)', 'Hinweis',
  'Bestätigungsmail', 'ID', 'Daten'];
const ITEM_COLS = ['Bestellnr.', 'Typ', 'Kunde', 'Wein-Nr.', 'ART. NR.', 'Wein', 'Domaine', 'Einheit', 'Menge',
  'Einzelpreis', 'Summe', 'ID'];
const COL = name => ORDER_COLS.indexOf(name) + 1;
const DELIV = { lieferung: 'Lieferung', 'abholung-berlin': 'Abholung Berlin', 'abholung-hamburg': 'Abholung Hamburg' };

/* ---------------- Web-App ---------------- */

function doPost(e) {
  let p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'invalid json' }); }
  const problem = validate(p);
  if (problem) return json({ ok: false, error: problem });

  const ss = SpreadsheetApp.getActive();
  const test = !!p.preview;
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let row;
  try {
    const sh = sheet(ss, test ? SHEETS.testOrders : SHEETS.orders, ORDER_COLS);
    const shI = sheet(ss, test ? SHEETS.testItems : SHEETS.items, ITEM_COLS);
    if (findRow(sh, p.id)) return json({ ok: true, duplicate: true });   // schon da: nichts doppelt anlegen
    row = appendOrder(sh, shI, p, test);
  } finally {
    lock.releaseLock();
  }
  const status = sendConfirmation(p);
  setMailStatus(ss, test, p.id, status);
  return json({ ok: true });
}

function doGet() {
  return json({ ok: true, service: 'La Paulée de Berlin 2026 – Bestellannahme' });
}

/* ---------------- Prüfung ---------------- */

function validate(p) {
  if (!p || typeof p !== 'object') return 'no payload';
  if (!/^[0-9a-f-]{36}$/i.test(p.id || '')) return 'bad id';
  if (!/^P-[A-Z0-9]{5}$/.test(p.code || '')) return 'bad code';
  if (p.mode !== 'B2C' && p.mode !== 'B2B') return 'bad mode';
  if (!Array.isArray(p.items) || !p.items.length || p.items.length > 300) return 'bad items';
  for (const i of p.items) if (!(i.qty >= 1 && i.qty <= 999)) return 'bad qty';
  if (!p.customer || !p.customer.name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.customer.mail || '')) return 'bad customer';
  if (!p.totals || typeof p.totals.totalCents !== 'number') return 'bad totals';
  return '';
}

function notes(p, test) {
  const n = [];
  if (test) n.push('TEST');
  const created = new Date(p.createdAt);
  if (created > CFG.deadline) n.push('Bestellzeit nach 23:59 Uhr');
  const sub = p.items.reduce((a, i) => a + i.priceCents * i.qty, 0);
  if (sub !== p.totals.subCents) n.push('Summenprüfung abweichend');
  return n.join(' · ');
}

/* ---------------- Tabelle ---------------- */

function sheet(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#EBE7E0');
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRow(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const idCol = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('ID') + 1;
  const hit = sh.getRange(2, idCol, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : 0;
}

// Schutz gegen Formeln aus Eingaben (=, +, -, @) und Telefonnummern als Text
const txt = v => { v = v == null ? '' : String(v); return /^[=+\-@]/.test(v) || /^\d[\d\s/]*$/.test(v) ? "'" + v : v; };
const eur = c => Math.round(c) / 100;

function appendOrder(sh, shI, p, test) {
  const c = p.customer, t = p.totals, d = p.delivery || {};
  const values = [
    new Date(), p.code, false, p.mode, (p.lang || 'de').toUpperCase(), txt(c.firma), txt(c.name), txt(c.mail), txt(c.tel),
    txt(c.kdnr), txt(c.ustid), txt(c.str), txt(c.plz), txt(c.ort), DELIV[d.type] || d.type, txt(d.address), txt(d.wish),
    txt(p.note), t.bottles, eur(t.subCents), -eur(t.discCents), eur(t.shipCents), eur(t.totalCents), eur(t.vatCents),
    eur(t.grossCents), p.newsletter ? 'ja' : '', p.businessConfirmed ? 'ja' : '', new Date(p.createdAt), notes(p, test),
    'wird gesendet …', p.id, JSON.stringify(p)
  ];
  sh.appendRow(values);
  const row = sh.getLastRow();
  sh.getRange(row, COL('In JTL erfasst')).insertCheckboxes();
  sh.getRange(row, COL('Zwischensumme'), 1, 6).setNumberFormat('#,##0.00 €');
  sh.getRange(row, COL('Eingang')).setNumberFormat('dd.MM.yyyy HH:mm');
  sh.getRange(row, COL('Bestellt am (Gerät)')).setNumberFormat('dd.MM.yyyy HH:mm');

  const kunde = c.firma ? c.firma + ' – ' + c.name : c.name;
  const rows = p.items.map(i => [p.code, p.mode, txt(kunde), i.n, i.art, i.wine, i.domaine, i.unit, i.qty,
    eur(i.priceCents), eur(i.lineCents || i.priceCents * i.qty), p.id]);
  const start = shI.getLastRow() + 1;
  shI.getRange(start, 1, rows.length, ITEM_COLS.length).setValues(rows);
  shI.getRange(start, 10, rows.length, 2).setNumberFormat('#,##0.00 €');
  return row;
}

function setMailStatus(ss, test, id, status) {
  const sh = ss.getSheetByName(test ? SHEETS.testOrders : SHEETS.orders);
  const row = findRow(sh, id);
  if (row) sh.getRange(row, COL('Bestätigungsmail')).setValue(status);
}

/* ---------------- Bestätigungsmail (Brevo) ---------------- */

function sendConfirmation(p) {
  const key = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
  if (!key) return 'nicht gesendet: BREVO_API_KEY fehlt';
  const m = buildMail(p);
  const body = {
    sender: { name: CFG.senderName, email: CFG.senderEmail },
    to: [{ email: p.customer.mail, name: p.customer.name }],
    replyTo: { email: CFG.replyTo },
    subject: (p.preview ? '[TEST] ' : '') + m.subject,
    htmlContent: m.html,
    tags: ['paulee-2026', p.mode]
  };
  if (CFG.bcc) body.bcc = [{ email: CFG.bcc }];
  try {
    const r = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'api-key': key, accept: 'application/json' }, payload: JSON.stringify(body)
    });
    const code = r.getResponseCode();
    const when = Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM. HH:mm');
    return code < 300 ? 'gesendet ' + when : 'Fehler ' + code + ': ' + r.getContentText().slice(0, 180);
  } catch (err) {
    return 'Fehler: ' + String(err).slice(0, 180);
  }
}

const money = c => (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function buildMail(p) {
  const en = p.lang === 'en', b2b = p.mode === 'B2B', t = p.totals, d = p.delivery || {};
  const accent = b2b ? '#003B54' : '#75232A';
  const L = en ? {
    subject: `Your order ${p.code} – La Paulée de Berlin 2026`,
    hello: `Dear ${esc(p.customer.name)},`,
    intro: `thank you for your order at La Paulée de Berlin. We have received it and will be in touch regarding the ${d.type === 'lieferung' ? 'delivery' : 'pick-up'}.`,
    no: 'Order number', wine: 'Wine', qty: 'Qty', price: 'Price', sum: 'Amount',
    sub: 'Subtotal', priv: `Privilège Paulée –${t.privilegePct} %`, ship: d.type === 'lieferung' ? 'Shipping' : 'Pick-up', free: 'free',
    total: 'Total', vatIn: `incl. ${t.vatPct} % VAT`, totalNet: 'Total net', vatPlus: `plus ${t.vatPct} % VAT`, gross: 'Total incl. VAT',
    deliv: { lieferung: 'Delivery within Germany', 'abholung-berlin': 'Pick-up in Berlin · Köpenicker Straße 18–20', 'abholung-hamburg': 'Pick-up in Hamburg · Große Elbstraße 131' },
    until: 'by 30 November 2026', hours: 'Opening hours: Tue–Fri 10:30 am–7 pm · Sat 11 am–6 pm',
    address: 'Delivery address', wish: 'Preferred date', note: 'Your comment',
    b2bNote: 'Order at trade terms for restaurants and wine retailers. All prices net, plus VAT.',
    legal: `Consumers may cancel their order within 14 days of receiving the goods – see our <a href="${CFG.web}Widerrufsrecht" style="color:#857E78">cancellation policy</a>. Our <a href="${CFG.web}AGB" style="color:#857E78">terms and conditions</a> apply.`,
    legalB: `Our <a href="${CFG.web}AGB" style="color:#857E78">terms for business customers</a> apply.`,
    bye: 'With warm regards,', team: 'Sébastien Visentin and the VISENTIN team'
  } : {
    subject: `Ihre Bestellung ${p.code} – La Paulée de Berlin 2026`,
    hello: `Guten Tag ${esc(p.customer.name)},`,
    intro: `vielen Dank für Ihre Bestellung bei La Paulée de Berlin. Wir haben sie erhalten und melden uns wegen ${d.type === 'lieferung' ? 'der Lieferung' : 'der Abholung'} bei Ihnen.`,
    no: 'Bestellnummer', wine: 'Wein', qty: 'Fl.', price: 'Preis', sum: 'Betrag',
    sub: 'Zwischensumme', priv: `Privilège Paulée –${t.privilegePct} %`, ship: d.type === 'lieferung' ? 'Versand' : 'Abholung', free: 'kostenfrei',
    total: 'Summe', vatIn: `darin enthalten ${t.vatPct} % MwSt.`, totalNet: 'Summe netto', vatPlus: `zzgl. ${t.vatPct} % MwSt.`, gross: 'Gesamtbetrag brutto',
    deliv: { lieferung: 'Lieferung innerhalb Deutschlands', 'abholung-berlin': 'Abholung in Berlin · Köpenicker Straße 18–20', 'abholung-hamburg': 'Abholung in Hamburg · Große Elbstraße 131' },
    until: 'bis 30. November 2026', hours: 'Öffnungszeiten: Di.–Fr. 10.30–19.00 Uhr · Sa. 11.00–18.00 Uhr',
    address: 'Lieferanschrift', wish: 'Wunschtermin', note: 'Ihre Bemerkung',
    b2bNote: 'Bestellung zu Konditionen für Gastronomie und Fachhandel. Alle Preise netto zzgl. MwSt.',
    legal: `Verbraucher können ihre Bestellung binnen 14 Tagen ab Erhalt der Ware widerrufen – <a href="${CFG.web}Widerrufsrecht" style="color:#857E78">Widerrufsbelehrung</a>. Es gelten unsere <a href="${CFG.web}AGB" style="color:#857E78">AGB</a>.`,
    legalB: `Es gelten unsere <a href="${CFG.web}AGB" style="color:#857E78">AGB für Geschäftskunden</a>.`,
    bye: 'Mit herzlichen Grüßen', team: 'Sébastien Visentin und das Team von VISENTIN'
  };

  const serif = "Georgia,'Times New Roman',serif", sans = "Helvetica,Arial,sans-serif";
  const td = 'padding:8px 0;border-bottom:1px solid #E6E0D7;vertical-align:top;';
  const items = p.items.map(i => `<tr>
      <td style="${td}font:13px ${sans};color:#857E78;white-space:nowrap;padding-right:10px">${esc(i.n)}</td>
      <td style="${td}font:15px ${serif};color:#2A2526">${esc(i.wine)}<br><span style="font:12px ${sans};color:#857E78">${esc(i.domaine)} · ${money(i.priceCents)}</span></td>
      <td style="${td}font:14px ${sans};text-align:center;padding:8px 10px">${i.qty}</td>
      <td style="${td}font:600 14px ${sans};text-align:right;white-space:nowrap">${money(i.lineCents || i.priceCents * i.qty)}</td></tr>`).join('');
  const line = (a, b, style) => `<tr><td style="padding:4px 0;font:14px ${sans};${style || ''}">${a}</td><td style="padding:4px 0;font:14px ${sans};text-align:right;white-space:nowrap;${style || ''}">${b}</td></tr>`;
  const totals = [
    line(L.sub, money(t.subCents)),
    line(L.priv, '–' + money(t.discCents), 'color:#9C7A3C'),
    line(L.ship, t.shipCents ? money(t.shipCents) : L.free),
    ...(b2b
      ? [line(L.totalNet, money(t.totalCents), 'font-weight:600;border-top:1px solid #D9D2C7;padding-top:8px'),
         line(L.vatPlus, money(t.vatCents), 'color:#857E78;font-size:13px'),
         line(L.gross, money(t.grossCents), 'font-weight:700;font-size:16px;border-top:1px solid #2A2526;padding-top:8px')]
      : [line(L.total, money(t.totalCents), 'font-weight:700;font-size:16px;border-top:1px solid #2A2526;padding-top:8px'),
         line(L.vatIn, money(t.vatCents), 'color:#857E78;font-size:13px')])
  ].join('');
  const extra = [
    d.address ? `<b>${L.address}:</b> ${esc(d.address)}` : '',
    d.wish ? `<b>${L.wish}:</b> ${esc(d.wish)}` : '',
    p.note ? `<b>${L.note}:</b> ${esc(p.note)}` : ''
  ].filter(Boolean).join('<br>');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#EBE7E0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7E0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#F7F4EF;border:1px solid #D9D2C7">
<tr><td style="padding:28px 28px 8px;text-align:center"><img src="${CFG.logoUrl}" width="220" alt="La Paulée de Berlin" style="display:inline-block;width:220px;height:auto">
<div style="font:italic 15px ${serif};color:#857E78;margin-top:6px">Lundi 2 novembre 2026 · Ambassade de France</div></td></tr>
<tr><td style="padding:16px 28px 0;font:15px/1.55 ${sans};color:#2A2526">${L.hello}<br><br>${L.intro}</td></tr>
<tr><td style="padding:18px 28px 6px"><div style="font:600 11px ${sans};letter-spacing:.18em;text-transform:uppercase;color:#857E78">${L.no}</div>
<div style="font:600 24px ${sans};letter-spacing:.06em;color:${accent};margin-top:4px">${p.code}</div></td></tr>
<tr><td style="padding:8px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>
<tr><td style="padding:6px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${totals}</table></td></tr>
<tr><td style="padding:16px 28px 0;font:14px/1.55 ${sans};color:#2A2526"><b>${L.deliv[d.type] || ''}</b> · ${L.until}<br>
${d.type === 'lieferung' ? '' : `<span style="color:#857E78">${L.hours}</span><br>`}${extra ? extra + '<br>' : ''}
${b2b ? `<span style="color:#857E78">${L.b2bNote}</span>` : ''}</td></tr>
<tr><td style="padding:22px 28px 0;font:15px/1.55 ${sans};color:#2A2526">${L.bye}<br><span style="font:16px ${serif}">${L.team}</span></td></tr>
<tr><td style="padding:22px 28px 26px;font:12px/1.6 ${sans};color:#857E78;border-top:1px solid #E6E0D7">
${b2b ? L.legalB : L.legal}<br><br>
VISENTIN – Vins Français d'Exception · Köpenicker Straße 18–20 · 10997 Berlin<br>
${CFG.phone} · <a href="mailto:${CFG.replyTo}" style="color:#857E78">${CFG.replyTo}</a> · <a href="${CFG.web}" style="color:#857E78">weine-visentin.de</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: L.subject, html };
}

/* ---------------- Einrichtung & Werkzeuge ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Paulée')
    .addItem('Bestätigung erneut senden (markierte Zeile)', 'erneutSenden')
    .addSeparator()
    .addItem('Einrichtung prüfen', 'einrichten')
    .addItem('Test-Mail an mich senden', 'testMail')
    .addToUi();
}

/** Einmal ausführen: legt die Blätter an und prüft den Brevo-Schlüssel. */
function einrichten() {
  const ss = SpreadsheetApp.getActive();
  sheet(ss, SHEETS.orders, ORDER_COLS);
  sheet(ss, SHEETS.items, ITEM_COLS);
  const first = ss.getSheetByName('Tabellenblatt1') || ss.getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0) ss.deleteSheet(first);
  const key = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
  let msg = 'Blätter „Bestellungen“ und „Positionen“ sind angelegt.\n';
  if (!key) {
    msg += 'ACHTUNG: BREVO_API_KEY fehlt (Projekteinstellungen → Skripteigenschaften).';
  } else {
    const r = UrlFetchApp.fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': key, accept: 'application/json' }, muteHttpExceptions: true });
    msg += r.getResponseCode() === 200 ? 'Brevo-Schlüssel funktioniert.' : 'Brevo-Schlüssel wird abgelehnt (' + r.getResponseCode() + ').';
  }
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Schickt eine Beispiel-Bestätigung (DE und EN) an das eigene Google-Konto. */
function testMail() {
  const me = Session.getEffectiveUser().getEmail();
  const base = {
    id: Utilities.getUuid(), code: 'P-TEST1', createdAt: new Date().toISOString(), mode: 'B2C', preview: true,
    customer: { name: 'Sébastien Visentin', mail: me },
    delivery: { type: 'abholung-berlin', address: '', wish: 'ab 10. November' }, note: '',
    items: [{ n: '101-1', art: '601 025 22', wine: '2022 Crémant de Loire "Blanc de Blancs"', domaine: 'Domaine Ogereau', unit: '0,75 l', qty: 6, priceCents: 2490, lineCents: 14940 },
            { n: '104-4', art: '518 265 23', wine: '2023 Hermitage', domaine: 'Domaine Yann Chave', unit: '0,75 l', qty: 1, priceCents: 13600, lineCents: 13600 }],
    totals: { subCents: 28540, discCents: 2854, shipCents: 0, totalCents: 25686, vatCents: 4101, grossCents: 25686, vatPct: 19, privilegePct: 10, bottles: 7 }
  };
  const r1 = sendConfirmation(Object.assign({}, base, { lang: 'de' }));
  const r2 = sendConfirmation(Object.assign({}, base, { lang: 'en', code: 'P-TEST2' }));
  const msg = 'Test-Mails an ' + me + ':\nDeutsch: ' + r1 + '\nEnglisch: ' + r2;
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

/** Bestätigung für die markierte Zeile im Blatt „Bestellungen“ erneut senden. */
function erneutSenden() {
  const sh = SpreadsheetApp.getActiveSheet();
  const row = sh.getActiveRange().getRow();
  if (row < 2) return SpreadsheetApp.getUi().alert('Bitte eine Bestellzeile markieren.');
  const data = sh.getRange(row, COL('Daten')).getValue();
  if (!data) return SpreadsheetApp.getUi().alert('In dieser Zeile fehlen die Bestelldaten.');
  const p = JSON.parse(data);
  p.customer.mail = String(sh.getRange(row, COL('E-Mail')).getValue()).replace(/^'/, '');   // korrigierte Adresse übernehmen
  const status = sendConfirmation(p);
  sh.getRange(row, COL('Bestätigungsmail')).setValue(status);
  SpreadsheetApp.getUi().alert(p.code + ': ' + status);
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
