/**
 * La Paulée de Berlin 2026 – Bestellannahme
 * Google Apps Script, gebunden an die Tabelle „Paulée 2026 – Bestellungen“.
 *
 * Nimmt Bestellungen der App entgegen, schreibt sie in die Tabelle (Bestellungen + Positionen),
 * verhindert Doppelbestellungen (gleiche ID) und versendet die Bestätigung über Brevo.
 * Menü „Paulée → JTL-Importdatei erstellen“ erzeugt die CSV für JTL-Ameise (Aufträge):
 * nur Bestellungen mit eingetragener JTL-Kundennummer, jede Bestellung nur einmal.
 * Brevo-Schlüssel: Projekteinstellungen → Skripteigenschaften → BREVO_API_KEY
 */

const CFG = {
  senderEmail: 'info@weine-visentin.de',
  senderName: "VISENTIN – Vins Français d'Exception",
  replyTo: 'info@weine-visentin.de',
  bcc: '',                                     // optional: Kopie jeder Bestätigung an diese Adresse
  notifyTo: 'info@weine-visentin.de',          // Mitteilung, wenn eine Bestellung nach einem JTL-Export eingeht
  notifyCc: 'sebastien@weine-visentin.de',     // Kopie dieser Mitteilung
  testTo: 'sebastien@weine-visentin.de',       // Empfänger der Test-Mails (Menü „Test-Mail an mich senden“)
  logoUrl: 'https://paulee-berlin-2026.pages.dev/img/logo-gold.png',
  deadline: new Date('2026-11-02T23:59:59+01:00'),
  phone: '+49 30 695 199 20',
  web: 'https://www.weine-visentin.de/',
  csvCharset: 'UTF-8'                           // falls Umlaute in der Ameise falsch erscheinen: 'windows-1252'
};

const SHEETS = {
  orders: 'Bestellungen', items: 'Positionen',
  testOrders: 'Test – Bestellungen', testItems: 'Test – Positionen'
};

const ORDER_COLS = ['Eingang', 'Bestellnr.', 'JTL-Kundennr.', 'JTL-Export', 'In JTL erfasst', 'Typ', 'Sprache',
  'Firma', 'Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Kundennr. (Angabe Kunde)', 'USt-IdNr.', 'Straße', 'PLZ', 'Ort',
  'Lieferart', 'Lieferanschrift (abweichend)', 'Wunschtermin', 'Bemerkung', 'Flaschen', 'Zwischensumme', 'Privilège',
  'Versand', 'Gesamt netto', 'MwSt.', 'Gesamt brutto', 'Newsletter', 'Gastro/Fachhandel bestätigt',
  'Bestellt am (Gerät)', 'Hinweis', 'Bestätigungsmail', 'ID', 'Daten'];
// Spalten der Importdatei für JTL-Ameise (Verkauf → Aufträge), eine Zeile je Position
const JTL_COLS = ['Kundennummer', 'Anmerkung', 'Kundenkommentar', 'Voraus. Lieferdatum', 'Artikelnummer', 'Menge',
  'Positionsart', 'Rabatt (%)', 'Hinweis (Position)', 'Artikelname', 'Auftragsnummer'];
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
    // Die Bestellnummer wird JTL-Auftragsnummer und muss eindeutig sein (Zufallscode – sehr selten doppelt)
    const same = countCode(sh, p.code);
    if (same) p.jtlNo = p.code + '-' + (same + 1);
    row = appendOrder(sh, shI, p, test);
  } finally {
    lock.releaseLock();
  }
  const status = sendConfirmation(p);
  setMailStatus(ss, test, p.id, status);
  if (!test) notifyLate(ss, p);
  return json({ ok: true });
}

function doGet() {
  return json({ ok: true, service: 'La Paulée de Berlin 2026 – Bestellannahme' });
}

/* ---------------- Prüfung ---------------- */

function validate(p) {
  if (!p || typeof p !== 'object') return 'no payload';
  if (!/^[0-9a-f-]{36}$/i.test(p.id || '')) return 'bad id';
  if (!/^P-[A-Z0-9]{5,6}$/.test(p.code || '')) return 'bad code';
  if (p.mode !== 'B2C' && p.mode !== 'B2B') return 'bad mode';
  if (!Array.isArray(p.items) || !p.items.length || p.items.length > 300) return 'bad items';
  for (const i of p.items) if (!(i.qty >= 1 && i.qty <= 999)) return 'bad qty';
  if (!p.customer || !fullName(p.customer) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.customer.mail || '')) return 'bad customer';
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
  if (p.jtlNo) n.push('Bestellnr. doppelt vergeben – JTL-Auftragsnummer ' + p.jtlNo);
  return n.join(' · ');
}

/* ---------------- Tabelle ---------------- */

function sheet(ss, name, cols) {
  let sh = ss.getSheetByName(name), old = null;
  if (sh) {
    const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].filter(String);
    if (head.join('|') === cols.join('|')) return sh;
    if (cols === ORDER_COLS && head.map(h => RENAMED[h] || h).join('|') === cols.join('|')) {
      renameInPlace(sh, head);                    // nur Spalten umbenannt: Blatt behalten, Werte neu berechnen
      return sh;
    }
    if (sh.getLastRow() > 1) {                    // ältere Spaltenfolge mit Daten: aufheben, neu anlegen, Daten übernehmen
      old = sh;
      old.setName(name + ' (alt ' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM. HH:mm') + ')');
      sh = null;
    } else {
      sh.clear();
    }
  }
  if (!sh) sh = ss.insertSheet(name, old ? old.getIndex() - 1 : ss.getNumSheets());
  sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold').setBackground('#EBE7E0');
  sh.setFrozenRows(1);
  const k = cols.indexOf('JTL-Kundennr.');
  if (k >= 0) {                                   // vom Team auszufüllen: hervorheben
    sh.getRange(1, k + 1).setBackground('#F3D9A4').setNote('Vom Team auszufüllen: Kundennummer aus JTL-Wawi. Erst dann wird die Bestellung in die JTL-Importdatei übernommen.');
    sh.getRange(2, k + 1, sh.getMaxRows() - 1, 1).setBackground('#FBF3E2');
  }
  if (old && cols === ORDER_COLS) migrateOrders(old, sh, name.indexOf('Test') === 0);
  return sh;
}

/** Umbenannte Spalten: Kopf ersetzen, Werte aus „Daten“ neu berechnen – alle übrigen Einträge bleiben. */
const RENAMED = { 'Summe (B2B netto / B2C brutto)': 'Gesamt netto' };
function renameInPlace(sh, head) {
  const last = sh.getLastRow(), dCol = head.indexOf('Daten') + 1;
  const data = last > 1 ? sh.getRange(2, dCol, last - 1, 1).getValues() : [];
  head.forEach((h, i) => {
    if (!RENAMED[h]) return;
    const name = RENAMED[h];
    sh.getRange(1, i + 1).setValue(name);
    if (!data.length) return;
    const vals = data.map(r => { try { return [r[0] ? orderValues(JSON.parse(r[0]), false)[name] : '']; } catch (e) { return ['']; } });
    sh.getRange(2, i + 1, vals.length, 1).setValues(vals).setNumberFormat('#,##0.00 €');
  });
}

/** Bestellungen aus einem Blatt mit älterer Spaltenfolge übernehmen (Grundlage: Spalte „Daten“). */
function migrateOrders(old, sh, test) {
  const H = headers(old), data = old.getDataRange().getValues();
  const keep = ['Eingang', 'JTL-Kundennr.', 'JTL-Export', 'In JTL erfasst', 'Hinweis', 'Bestätigungsmail'];
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const raw = H['Daten'] ? data[r][H['Daten'] - 1] : '';
    if (!raw) continue;
    const v = orderValues(JSON.parse(raw), test);
    keep.forEach(k => { if (H[k]) v[k] = data[r][H[k] - 1]; });
    rows.push(ORDER_COLS.map(k => v[k]));
  }
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, ORDER_COLS.length).setValues(rows);
  formatOrderRows(sh, 2, rows.length);
}

function countCode(sh, code) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  return sh.getRange(2, COL('Bestellnr.'), last - 1, 1).getValues().filter(r => r[0] === code).length;
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

const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const dateOf = v => new Date(v + 'T12:00:00');
const fullName = c => c.name || [c.vorname, c.nachname].filter(Boolean).join(' ');
const splitName = c => {                          // ältere App-Fassung schickte nur „name“
  if (c.vorname || c.nachname) return [c.vorname || '', c.nachname || ''];
  const parts = String(c.name || '').trim().split(/\s+/); const last = parts.pop() || '';
  return [parts.join(' '), last];
};

function orderValues(p, test) {
  const c = p.customer, t = p.totals, d = p.delivery || {};
  const [vor, nach] = splitName(c);
  return {
    'Eingang': new Date(), 'Bestellnr.': p.code, 'JTL-Kundennr.': '', 'JTL-Export': '', 'In JTL erfasst': false,
    'Typ': p.mode, 'Sprache': (p.lang || 'de').toUpperCase(), 'Firma': txt(c.firma), 'Vorname': txt(vor), 'Nachname': txt(nach),
    'E-Mail': txt(c.mail), 'Telefon': txt(c.tel), 'Kundennr. (Angabe Kunde)': txt(c.kdnr), 'USt-IdNr.': txt(c.ustid),
    'Straße': txt(c.str), 'PLZ': txt(c.plz), 'Ort': txt(c.ort), 'Lieferart': DELIV[d.type] || d.type,
    'Lieferanschrift (abweichend)': txt(d.address), 'Wunschtermin': isoDate(d.wish) ? dateOf(d.wish) : txt(d.wish),
    'Bemerkung': txt(p.note), 'Flaschen': t.bottles, 'Zwischensumme': eur(t.subCents), 'Privilège': -eur(t.discCents),
    'Versand': eur(t.shipCents), 'Gesamt netto': eur(t.grossCents - t.vatCents), 'MwSt.': eur(t.vatCents),
    'Gesamt brutto': eur(t.grossCents), 'Newsletter': p.newsletter ? 'ja' : '', 'Gastro/Fachhandel bestätigt': p.businessConfirmed ? 'ja' : '',
    'Bestellt am (Gerät)': new Date(p.createdAt), 'Hinweis': notes(p, test), 'Bestätigungsmail': 'wird gesendet …',
    'ID': p.id, 'Daten': JSON.stringify(p)
  };
}

function formatOrderRows(sh, row, n) {
  sh.getRange(row, COL('In JTL erfasst'), n, 1).insertCheckboxes();
  sh.getRange(row, COL('Zwischensumme'), n, 6).setNumberFormat('#,##0.00 €');
  sh.getRange(row, COL('Eingang'), n, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  sh.getRange(row, COL('Bestellt am (Gerät)'), n, 1).setNumberFormat('dd.MM.yyyy HH:mm');
  sh.getRange(row, COL('Wunschtermin'), n, 1).setNumberFormat('dd.MM.yyyy');
}

function appendOrder(sh, shI, p, test) {
  sh.appendRow(ORDER_COLS.map(k => orderValues(p, test)[k]));
  const row = sh.getLastRow();
  formatOrderRows(sh, row, 1);

  const c = p.customer;
  const name = fullName(c);
  const kunde = c.firma ? c.firma + ' – ' + name : name;
  const rows = p.items.map(i => [p.jtlNo || p.code, p.mode, txt(kunde), i.n, i.art, i.wine, i.domaine, i.unit, i.qty,
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

/* ---------------- Nachzügler: Bestellung nach einem JTL-Export ---------------- */

/** Geht eine Bestellung nach dem letzten JTL-Export ein, steht sie in keiner Importdatei: Mitteilung an das Team. */
function notifyLate(ss, p) {
  const last = PropertiesService.getScriptProperties().getProperty('LAST_JTL_EXPORT');
  if (!last) return;                                        // vor dem ersten Export: kommt mit dem ersten Import
  const status = sendLateNotice(ss, p, new Date(last));
  addNote(ss, p.id, 'Nach dem JTL-Import eingegangen – Mitteilung an ' + CFG.notifyTo + ': ' + status);
}

function sendLateNotice(ss, p, last) {
  const key = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
  if (!key) return 'nicht gesendet: BREVO_API_KEY fehlt';
  const c = p.customer, t = p.totals, d = p.delivery || {}, no = p.jtlNo || p.code;
  const who = [c.firma, fullName(c)].filter(Boolean).join(' · ');
  const fmt = x => Utilities.formatDate(x, 'Europe/Berlin', 'dd.MM.yyyy HH:mm');
  const row = (k, v) => '<tr><td style="padding:3px 14px 3px 0;color:#777">' + k + '</td><td style="padding:3px 0">' + v + '</td></tr>';
  const html = '<div style="font:14px/1.5 Arial,sans-serif;color:#2A2526">' +
    '<p>Diese Bestellung ist <b>nach dem letzten JTL-Export</b> (' + fmt(last) + ') eingegangen und daher in keiner Importdatei enthalten. Sie steht in der Tabelle.</p>' +
    '<table style="border-collapse:collapse">' +
    row('Bestellnr.', '<b>' + esc(no) + '</b>') + row('Kunde', esc(who)) + row('Typ', esc(p.mode)) +
    row('Lieferart', esc(DELIV[d.type] || d.type || '')) + row('Flaschen', t.bottles) + row('Gesamt brutto', money(t.grossCents)) +
    row('Bestellt am', fmt(new Date(p.createdAt))) + row('Eingegangen', fmt(new Date())) + '</table>' +
    '<p><b>Zu tun:</b><br>1. Kunden in JTL zuordnen bzw. neu anlegen, JTL-Kundennr. in der Tabelle eintragen.<br>' +
    '2. In der Tabelle: Paulée → JTL-Importdatei erstellen, dann wie gewohnt importieren.</p>' +
    '<p><a href="' + ss.getUrl() + '">Tabelle öffnen</a></p></div>';
  try {
    const r = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'api-key': key, accept: 'application/json' },
      payload: JSON.stringify({
        sender: { name: 'Paulée 2026 – Bestellungen', email: CFG.senderEmail },
        to: [{ email: CFG.notifyTo }], ...(CFG.notifyCc ? { cc: [{ email: CFG.notifyCc }] } : {}),
        subject: 'Paulée: Bestellung nach dem Import – ' + no + ' · ' + who,
        htmlContent: html, tags: ['paulee-2026-intern']
      })
    });
    const code = r.getResponseCode();
    return code < 300 ? 'gesendet ' + Utilities.formatDate(new Date(), 'Europe/Berlin', 'dd.MM. HH:mm') : 'Fehler ' + code;
  } catch (err) {
    return 'Fehler: ' + String(err).slice(0, 120);
  }
}

function addNote(ss, id, text) {
  const sh = ss.getSheetByName(SHEETS.orders), row = findRow(sh, id);
  if (!row) return;
  const cell = sh.getRange(row, COL('Hinweis')), cur = String(cell.getValue() || '');
  cell.setValue(cur ? cur + ' · ' + text : text);
}

/* ---------------- Bestätigungsmail (Brevo) ---------------- */

function sendConfirmation(p) {
  const key = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
  if (!key) return 'nicht gesendet: BREVO_API_KEY fehlt';
  const m = buildMail(p);
  const body = {
    sender: { name: CFG.senderName, email: CFG.senderEmail },
    to: [{ email: p.customer.mail, name: fullName(p.customer) }],
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
    subject: `Acknowledgement of receipt – your order ${p.code} – La Paulée de Berlin 2026`,
    hello: `Dear ${esc(fullName(p.customer))},`,
    intro: 'thank you for your order at La Paulée de Berlin. This email acknowledges receipt of your order. It is not yet an acceptance of your order.',
    items: 'Your order',
    nextH: 'What happens next',
    next: [
      'We check availability, quantities and your customer group at VISENTIN.',
      `You then receive our order confirmation – the purchase contract is concluded only with it. We will contact you about the ${d.type === 'lieferung' ? 'delivery' : 'pick-up'}.`
    ],
    nextNote: 'For wines in limited supply we may confirm a smaller quantity. The prices of your customer group at VISENTIN apply; should a price be higher than stated in the Paulée wine list, it applies only with your express consent.',
    formation: 'Notwithstanding § 3 of our terms, for orders via the Paulée wine list the contract is concluded only with our order confirmation.',
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
    subject: `Eingangsbestätigung Ihrer Bestellung ${p.code} – La Paulée de Berlin 2026`,
    hello: `Guten Tag ${esc(fullName(p.customer))},`,
    intro: 'vielen Dank für Ihre Bestellung bei La Paulée de Berlin. Mit dieser E-Mail bestätigen wir den Eingang Ihrer Bestellung. Sie ist noch keine Annahme Ihrer Bestellung.',
    items: 'Ihre Bestellung',
    nextH: 'So geht es weiter',
    next: [
      'Wir prüfen Verfügbarkeit, Mengen und Ihre Kundengruppe bei VISENTIN.',
      `Danach erhalten Sie unsere Auftragsbestätigung – erst mit ihr kommt der Kaufvertrag zustande. Wegen ${d.type === 'lieferung' ? 'der Lieferung' : 'der Abholung'} melden wir uns bei Ihnen.`
    ],
    nextNote: 'Bei begrenzt verfügbaren Weinen bestätigen wir gegebenenfalls eine geringere Menge. Maßgeblich sind die Preise Ihrer Kundengruppe bei VISENTIN; ein höherer Preis als in der Paulée-Weinliste gilt nur mit Ihrer ausdrücklichen Zustimmung.',
    formation: 'Abweichend von § 3 unserer AGB kommt der Vertrag bei Bestellungen über die Paulée-Weinliste erst mit unserer Auftragsbestätigung zustande.',
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
    d.wish ? `<b>${L.wish}:</b> ${esc(isoDate(d.wish) ? Utilities.formatDate(dateOf(d.wish), 'Europe/Berlin', en ? 'd MMMM yyyy' : 'dd.MM.yyyy') : d.wish)}` : '',
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
<tr><td style="padding:14px 28px 0;font:600 11px ${sans};letter-spacing:.12em;text-transform:uppercase;color:#857E78">${L.items}</td></tr>
<tr><td style="padding:4px 28px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>
<tr><td style="padding:6px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${totals}</table></td></tr>
<tr><td style="padding:16px 28px 0;font:14px/1.55 ${sans};color:#2A2526"><b>${L.deliv[d.type] || ''}</b> · ${L.until}<br>
${d.type === 'lieferung' ? '' : `<span style="color:#857E78">${L.hours}</span><br>`}${extra ? extra + '<br>' : ''}
${b2b ? `<span style="color:#857E78">${L.b2bNote}</span>` : ''}</td></tr>
<tr><td style="padding:18px 28px 0"><div style="border-left:3px solid ${accent};background:#EFEAE2;padding:12px 14px;font:14px/1.55 ${sans};color:#2A2526">
<b style="font:16px ${serif}">${L.nextH}</b><br>1. ${L.next[0]}<br>2. ${L.next[1]}</div></td></tr>
<tr><td style="padding:22px 28px 0;font:15px/1.55 ${sans};color:#2A2526">${L.bye}<br><span style="font:16px ${serif}">${L.team}</span></td></tr>
<tr><td style="padding:22px 28px 26px;font:12px/1.6 ${sans};color:#857E78;border-top:1px solid #E6E0D7">
${L.nextNote} ${L.formation} ${b2b ? L.legalB : L.legal}<br><br>
VISENTIN – Vins Français d'Exception · Köpenicker Straße 18–20 · 10997 Berlin<br>
${CFG.phone} · <a href="mailto:${CFG.replyTo}" style="color:#857E78">${CFG.replyTo}</a> · <a href="${CFG.web}" style="color:#857E78">weine-visentin.de</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: L.subject, html };
}

/* ---------------- Einrichtung & Werkzeuge ---------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Paulée')
    .addItem('JTL-Importdatei erstellen', 'jtlExport')
    .addItem('JTL-Export zurücksetzen (markierte Zeilen)', 'jtlExportZuruecksetzen')
    .addSeparator()
    .addItem('Bestätigung erneut senden (markierte Zeile)', 'erneutSenden')
    .addSeparator()
    .addItem('Tabelle prüfen', 'tabellePruefen')
    .addItem('Einrichtung prüfen', 'einrichten')
    .addItem('Test-Mail an mich senden', 'testMail')
    .addToUi();
}

/**
 * Menü „Tabelle prüfen“: prüft alle Bestellungen und Positionen gegen die gespeicherten Bestelldaten (Spalte „Daten“).
 * Korrigiert automatisch nur Sicheres: fehlende Kästchen „In JTL erfasst“, Zahlenformate, fehlende Positionszeilen.
 * Beträge werden nie überschrieben – Abweichungen (z. B. vom Team geänderter Versand) werden nur gemeldet.
 */
function tabellePruefen() {
  const ss = SpreadsheetApp.getActive(), out = [];
  [[SHEETS.orders, SHEETS.items, false], [SHEETS.testOrders, SHEETS.testItems, true]].forEach(([on, inn, test]) => {
    const sh = ss.getSheetByName(on), shI = ss.getSheetByName(inn);
    if (!sh || !shI) { if (!test) out.push('„' + on + '“ oder „' + inn + '“ fehlt → Menü „Einrichtung prüfen“.'); return; }
    out.push(checkSheets(sh, shI, test));
  });
  const msg = out.join('\n\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Tabelle prüfen', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return msg;
}

function checkSheets(sh, shI, test) {
  const name = sh.getName(), fixed = [], issues = [];
  const headO = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].filter(String);
  const headI = shI.getRange(1, 1, 1, Math.max(shI.getLastColumn(), 1)).getValues()[0].filter(String);
  if (headO.join('|') !== ORDER_COLS.join('|')) issues.push('Spaltenköpfe „' + name + '“ weichen ab → Menü „Einrichtung prüfen“.');
  if (headI.join('|') !== ITEM_COLS.join('|')) issues.push('Spaltenköpfe „' + shI.getName() + '“ weichen ab → Menü „Einrichtung prüfen“.');
  if (issues.length) return '■ ' + name + '\n' + issues.join('\n');

  const data = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, ORDER_COLS.length).getValues() : [];
  const itemData = shI.getLastRow() > 1 ? shI.getRange(2, 1, shI.getLastRow() - 1, ITEM_COLS.length).getValues() : [];
  const ix = n => ORDER_COLS.indexOf(n), iy = n => ITEM_COLS.indexOf(n);
  const byId = {};
  itemData.forEach(r => { const id = r[iy('ID')]; if (id) (byId[id] = byId[id] || []).push(r); });

  const dv = data.length ? sh.getRange(2, COL('In JTL erfasst'), data.length, 1).getDataValidations() : [];
  const isBox = d => d && d.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX;
  const seenId = {}, seenNo = {}, near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.006;
  let n = 0;
  data.forEach((r, k) => {
    const row = k + 2, id = r[ix('ID')], no = r[ix('Bestellnr.')];
    if (!id) { if (r.some(String)) issues.push('Zeile ' + row + ': ohne ID – nicht von der App angelegt?'); return; }
    n++;
    const tag = 'Zeile ' + row + ' (' + no + ')';
    if (seenId[id]) issues.push(tag + ': doppelt (gleiche ID wie Zeile ' + seenId[id] + ').'); else seenId[id] = row;
    if (seenNo[no] && !String(r[ix('Hinweis')]).includes('doppelt')) issues.push(tag + ': Bestellnr. auch in Zeile ' + seenNo[no] + '.');
    seenNo[no] = seenNo[no] || row;
    let p;
    try { p = JSON.parse(r[ix('Daten')]); } catch (e) { issues.push(tag + ': Spalte „Daten“ beschädigt – Bestellung kann nicht exportiert werden.'); return; }
    if (p.id !== id) issues.push(tag + ': ID passt nicht zu „Daten“.');
    if (p.code !== no) issues.push(tag + ': Bestellnr. passt nicht zu „Daten“ (' + p.code + ').');

    // Kästchen und Formate
    if (!isBox(dv[k][0])) {
      const cb = sh.getRange(row, COL('In JTL erfasst')), v = r[ix('In JTL erfasst')];
      cb.insertCheckboxes(); cb.setValue(v === true || /^(true|wahr|ja|x)$/i.test(String(v)));
      fixed.push(tag + ': Kästchen „In JTL erfasst“ ergänzt.');
    }

    // Beträge gegen die Bestelldaten (nur melden)
    const v = orderValues(p, test);
    ['Typ', 'Flaschen', 'Zwischensumme', 'Privilège', 'Gesamt netto', 'MwSt.', 'Gesamt brutto'].forEach(c => {
      const a = r[ix(c)], b = v[c];
      if (typeof b === 'number' ? !near(a, b) : String(a) !== String(b)) issues.push(tag + ': „' + c + '“ = ' + a + ', laut Bestellung ' + b + '.');
    });
    if (!near(r[ix('Versand')], v['Versand'])) issues.push(tag + ': Versand in der Tabelle geändert (' + r[ix('Versand')] + ' statt ' + v['Versand'] + ' laut Bestellung). Der Export übernimmt den geänderten Wert in die Anmerkung, die Summen bleiben auf dem Stand der Bestellung.');
    const t = p.totals, items = p.items || [];
    const sub = items.reduce((a, i) => a + i.priceCents * i.qty, 0);
    if (sub !== t.subCents) issues.push(tag + ': Positionen ergeben ' + money(sub) + ', Zwischensumme ' + money(t.subCents) + '.');
    if (t.subCents - t.discCents + t.shipCents !== t.totalCents) issues.push(tag + ': Summe rechnerisch abweichend.');
    if (t.grossCents !== (p.mode === 'B2B' ? t.totalCents + t.vatCents : t.totalCents)) issues.push(tag + ': Brutto/MwSt. rechnerisch abweichend.');
    if (!p.items.every(i => i.art)) issues.push(tag + ': Position ohne Artikelnummer – in JTL von Hand prüfen.');

    // Positionen
    const pos = byId[id] || [];
    if (!pos.length) {
      const c = p.customer, kunde = c.firma ? c.firma + ' – ' + fullName(c) : fullName(c);
      const rows = items.map(i => [p.jtlNo || p.code, p.mode, txt(kunde), i.n, i.art, i.wine, i.domaine, i.unit, i.qty,
        eur(i.priceCents), eur(i.lineCents || i.priceCents * i.qty), p.id]);
      if (rows.length) {
        const start = shI.getLastRow() + 1;
        shI.getRange(start, 1, rows.length, ITEM_COLS.length).setValues(rows);
        shI.getRange(start, 10, rows.length, 2).setNumberFormat('#,##0.00 €');
        fixed.push(tag + ': ' + rows.length + ' fehlende Positionen ergänzt.');
      }
    } else {
      if (pos.length !== items.length) issues.push(tag + ': ' + pos.length + ' Positionszeilen, Bestellung hat ' + items.length + '.');
      const qty = pos.reduce((a, x) => a + (Number(x[iy('Menge')]) || 0), 0);
      if (qty !== t.bottles) issues.push(tag + ': Positionen ' + qty + ' Fl., Bestellung ' + t.bottles + ' Fl.');
      const sum = pos.reduce((a, x) => a + (Number(x[iy('Summe')]) || 0), 0);
      if (!near(sum, eur(t.subCents))) issues.push(tag + ': Positionen ergeben ' + sum.toFixed(2) + ' €, Zwischensumme ' + eur(t.subCents).toFixed(2) + ' €.');
    }
    delete byId[id];
  });
  if (data.length) formatOrderRows(sh, 2, data.length);
  Object.keys(byId).forEach(id => issues.push('Positionen ohne Bestellung (ID ' + id.slice(0, 8) + '…, Bestellnr. ' + byId[id][0][iy('Bestellnr.')] + ').'));

  return '■ ' + name + ': ' + n + ' Bestellungen, ' + itemData.length + ' Positionen geprüft.' +
    (fixed.length ? '\nKorrigiert:\n– ' + fixed.join('\n– ') : '') +
    (issues.length ? '\nBitte prüfen:\n– ' + issues.join('\n– ') : '\nKeine Auffälligkeiten.');
}

/** Einmal ausführen: legt die Blätter an und prüft den Brevo-Schlüssel. */
function einrichten() {
  const ss = SpreadsheetApp.getActive();
  sheet(ss, SHEETS.orders, ORDER_COLS);
  sheet(ss, SHEETS.items, ITEM_COLS);
  sheet(ss, SHEETS.testOrders, ORDER_COLS);
  sheet(ss, SHEETS.testItems, ITEM_COLS);
  const first = ss.getSheetByName('Tabellenblatt1') || ss.getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0) ss.deleteSheet(first);
  const key = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
  let msg = 'Blätter „Bestellungen“, „Positionen“ und die Test-Blätter sind eingerichtet.\n';
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
  const me = CFG.testTo || Session.getEffectiveUser().getEmail();
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
  const H = headers(sh);
  if (!H['Daten']) return SpreadsheetApp.getUi().alert('Bitte im Blatt „Bestellungen“ eine Zeile markieren.');
  const data = sh.getRange(row, H['Daten']).getValue();
  if (!data) return SpreadsheetApp.getUi().alert('In dieser Zeile fehlen die Bestelldaten.');
  const p = JSON.parse(data);
  p.customer.mail = String(sh.getRange(row, H['E-Mail']).getValue()).replace(/^'/, '');   // korrigierte Adresse übernehmen
  const status = sendConfirmation(p);
  sh.getRange(row, H['Bestätigungsmail']).setValue(status);
  SpreadsheetApp.getUi().alert(p.code + ': ' + status);
}

/* ---------------- JTL-Ameise: Importdatei ---------------- */

function headers(sh) {
  const h = {};
  sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].forEach((name, i) => { if (name) h[name] = i + 1; });
  return h;
}

const csvCell = v => {
  v = v == null ? '' : String(v).replace(/[\r\n]+/g, ' ').trim();
  return /[;"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
};
const pad2 = n => String(n).padStart(2, '0');

/** Wunschtermin → TT.MM.JJJJ. Akzeptiert Datum aus der Tabelle, JJJJ-MM-TT, TT.MM.JJJJ, TT.MM.JJ, TT.MM. – sonst ''. */
function wishDate(v) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, 'Europe/Berlin', 'dd.MM.yyyy');
  v = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return m[3] + '.' + m[2] + '.' + m[1];
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/.exec(v);
  if (m) {
    const y = !m[3] ? '2026' : m[3].length === 2 ? '20' + m[3] : m[3];
    return pad2(m[1]) + '.' + pad2(m[2]) + '.' + y;
  }
  return '';
}

/**
 * Zeilen der Importdatei für eine Bestellung: je Wein eine Artikelposition.
 * Versand und Versandart trägt das Team nach dem Import in JTL ein.
 * cur = aktuelle Werte aus der Tabelle (vom Team ggf. korrigiert): wish, note, address
 */
function jtlRows(p, kdnr, cur) {
  const d = p.delivery || {}, t = p.totals;
  cur = cur || {};
  const wishRaw = cur.wish !== undefined && cur.wish !== '' ? cur.wish : d.wish;
  const lief = wishDate(wishRaw);
  // Anmerkung erscheint auf dem Auftrag beim Kunden: kurz, ohne Bestellnummer (die ist die Auftragsnummer)
  // Lieferung: Versandkosten aus der Tabelle (vom Team korrigierbar), sonst aus der Bestellung
  let anm = 'Paulée 2026 · ' + (DELIV[d.type] || d.type);
  if (d.type === 'lieferung') {
    const ship = typeof cur.ship === 'number' ? Math.round(cur.ship * 100) : (t.shipCents || 0);
    anm += ship > 0
      ? ' · Versandkosten ' + money(ship) + (p.mode === 'B2B' ? ' zzgl. MwSt.' : '')
      : ' · versandkostenfrei';
  }
  // Kundenkommentar: Bemerkung des Kunden, abweichende Lieferanschrift, nicht lesbarer Wunschtermin
  const note = cur.note !== undefined ? cur.note : p.note;
  const address = cur.address !== undefined ? cur.address : d.address;
  const komm = [note, address ? 'Lieferanschrift: ' + address : '',
    wishRaw && !lief ? 'Wunschtermin: ' + wishRaw : ''].filter(String).join(' · ');
  const ordNo = p.jtlNo || p.code;                // Auftragsnummer in JTL = Bestellnummer aus der Bestätigung
  return p.items.map(i => [kdnr, anm, komm, lief, i.art, i.qty, 'Artikel', t.privilegePct || 0,
    'Paulée 2026 · ' + i.n, i.wine, ordNo]);
}

/** Menü: Importdatei für alle Bestellungen mit JTL-Kundennummer, die noch nicht exportiert wurden. */
function jtlExport() {
  const ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActive();
  const test = ss.getActiveSheet().getName().indexOf('Test') === 0;   // im Test-Blatt aufgerufen: Testbestellungen
  const sh = ss.getSheetByName(test ? SHEETS.testOrders : SHEETS.orders);
  if (!sh) return ui.alert('Blatt „' + (test ? SHEETS.testOrders : SHEETS.orders) + '“ fehlt.');
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const data = sh.getDataRange().getValues(), H = headers(sh);
    const ix = n => H[n] - 1;
    const take = [], missing = [];
    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      if (!row[ix('ID')] || row[ix('JTL-Export')]) continue;            // leer oder schon exportiert
      const kd = String(row[ix('JTL-Kundennr.')]).trim();
      if (!kd) { missing.push(row[ix('Bestellnr.')]); continue; }
      take.push({ r: r + 1, kd, p: JSON.parse(row[ix('Daten')]),
        cur: { ship: row[ix('Versand')], wish: row[ix('Wunschtermin')], note: String(row[ix('Bemerkung')] || ''), address: String(row[ix('Lieferanschrift (abweichend)')] || '') } });
    }
    if (!take.length) {
      return ui.alert('Keine neuen Bestellungen für den Export.' +
        (missing.length ? '\n\nOhne JTL-Kundennr. (' + missing.length + '): ' + missing.join(', ') : ''));
    }
    const lines = [JTL_COLS.map(csvCell).join(';')];
    take.forEach(x => jtlRows(x.p, x.kd, x.cur).forEach(r => lines.push(r.map(csvCell).join(';'))));
    const csv = lines.join('\r\n') + '\r\n';

    const now = new Date();
    const fname = 'JTL-Import Paulée 2026 ' + (test ? 'TEST ' : '') + Utilities.formatDate(now, 'Europe/Berlin', 'yyyy-MM-dd HH-mm') + '.csv';
    const blob = CFG.csvCharset === 'UTF-8'
      ? Utilities.newBlob('\uFEFF' + csv, 'text/csv', fname)
      : Utilities.newBlob('', 'text/csv', fname).setDataFromString(csv, CFG.csvCharset);
    const parents = DriveApp.getFileById(ss.getId()).getParents();
    const file = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFile(blob);

    const stamp = Utilities.formatDate(now, 'Europe/Berlin', 'dd.MM.yyyy HH:mm') + ' · ' + fname;
    take.forEach(x => sh.getRange(x.r, H['JTL-Export']).setValue(stamp));
    if (!test) PropertiesService.getScriptProperties().setProperty('LAST_JTL_EXPORT', now.toISOString());
    SpreadsheetApp.flush();

    const positions = lines.length - 1;
    const html = HtmlService.createHtmlOutput(
      '<div style="font:14px/1.5 Arial,sans-serif">' +
      '<p><b>' + take.length + ' Bestellungen</b> mit ' + positions + ' Zeilen exportiert.</p>' +
      '<p><a href="https://drive.google.com/uc?export=download&id=' + file.getId() + '" target="_blank">Importdatei herunterladen</a><br>' +
      '<span style="color:#777">' + fname + '</span></p>' +
      (missing.length ? '<p style="color:#9C7A3C">Noch ohne JTL-Kundennr. und daher nicht enthalten (' + missing.length + '):<br>' + missing.join(', ') + '</p>' : '') +
      '<p style="color:#777">Jede Bestellung wird nur einmal exportiert (Spalte „JTL-Export“). ' +
      'Diese Datei bitte nur einmal in die Ameise importieren.</p></div>').setWidth(460).setHeight(300);
    ui.showModalDialog(html, 'JTL-Importdatei');
  } finally {
    lock.releaseLock();
  }
}

/** Menü: Export-Markierung der markierten Zeilen löschen – nur wenn der Import in JTL nicht erfolgt ist. */
function jtlExportZuruecksetzen() {
  const ui = SpreadsheetApp.getUi(), sh = SpreadsheetApp.getActiveSheet(), H = headers(sh);
  if (!H['JTL-Export']) return ui.alert('Bitte im Blatt „Bestellungen“ die betreffenden Zeilen markieren.');
  const range = sh.getActiveRange();
  const first = Math.max(range.getRow(), 2), last = range.getLastRow();
  if (last < first) return ui.alert('Bitte Bestellzeilen markieren.');
  const codes = sh.getRange(first, H['Bestellnr.'], last - first + 1, 1).getValues().map(r => r[0]).filter(String);
  const ok = ui.alert('JTL-Export zurücksetzen', 'Nur tun, wenn diese Bestellungen NICHT in JTL angelegt wurden – sonst entstehen doppelte Aufträge.\n\n' +
    codes.join(', '), ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  sh.getRange(first, H['JTL-Export'], last - first + 1, 1).clearContent();
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
