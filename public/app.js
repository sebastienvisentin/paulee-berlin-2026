/* La Paulée de Berlin 2026 – digitale Weinliste & Bestellung
   Ohne Framework, ohne Build. Läuft nach dem ersten Öffnen offline (Service Worker).
   Zweisprachig (Deutsch / English). Texte im Wörterbuch TXT; Bestelldaten für das Team immer auf Deutsch. */
(() => {
'use strict';

const APP_VERSION = '2026.10.18b';
const C = window.PAULEE_CONFIG || {};
const LS = { mode: 'pb.mode', code: 'pb.code', cart: 'pb.cart', rate: 'pb.rate', form: 'pb.form',
             orders: 'pb.orders', seen: 'pb.seen', deliv: 'pb.deliv', lang: 'pb.lang' };

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
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const flDe = n => n === 1 ? '1 Flasche' : n + ' Flaschen';
const WEB = 'https://www.weine-visentin.de/';
const link = (path, label) => `<a href="${WEB}${path}" target="_blank" rel="noopener">${label}</a>`;

/* ---------- Sprache ---------- */
const detectLang = () => ((navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'de'])
  .some(l => /^de/i.test(l)) ? 'de' : 'en');
let LANG = store.get(LS.lang, null) || detectLang();

const TXT = {
  de: {
    fl: n => n === 1 ? '1 Flasche' : n + ' Flaschen',
    flShort: 'Fl.', add: '+ Fl.', net: 'netto', perL: '/l',
    sans: 'alkoholfrei', onRequest: 'auf Anfrage', allocation: 'auf Zuteilung', notAvail: 'nicht verfügbar',
    askDesk: 'am Infotisch erfragen',
    rateAria: 'Ihre Bewertung', of5: i => `${i} von 5`, less: 'Eine Flasche weniger', more: 'Eine Flasche mehr', qtyAria: 'Anzahl Flaschen',
    modeC: 'Privatkunden', modeB: 'Gastronomie',
    order: 'Bestellung', yourOrder: 'Ihre Bestellung',
    sentBtn: n => n === 1 ? 'Bestellt' : n + ' Bestellungen', tabSel: n => 'Auswahl' + (n ? ' · ' + n + ' Fl.' : ''), tabSent: n => `Bestellt (${n})`,
    searchPh: 'Tischnummer (z. B. 128), Wein oder Domaine', searchAria: 'Suche', tbl: 'Tisch-Nr.',
    all: 'Alle', rated: 'Bewertet', inCart: 'In der Bestellung',
    emptyCart: 'Noch keine Weine in Ihrer Bestellung.', emptyFilter: 'Keine Weine zu dieser Auswahl.',
    dropped: list => `${list} in dieser Preisansicht nicht bestellbar – entfernt`,
    deliv: {
      lieferung: ['Lieferung innerhalb Deutschlands', 'an die Rechnungs- bzw. Lieferanschrift'],
      'abholung-berlin': ['Abholung Berlin', 'Köpenicker Straße 18–20 · kostenfrei'],
      'abholung-hamburg': ['Abholung Hamburg', 'Große Elbstraße 131 · kostenfrei']
    },
    delivShort: { lieferung: 'Lieferung', 'abholung-berlin': 'Abholung Berlin', 'abholung-hamburg': 'Abholung Hamburg' },
    delivLegend: d => `Lieferung oder Abholung · bis ${d}`,
    hours: 'Abholung Di.–Fr. 10.30–19.00 Uhr · Sa. 11.00–18.00 Uhr',
    abroad: 'Lieferung ins Ausland: bitte am Infotisch in der Entrée bestellen.',
    sub: 'Zwischensumme', priv: p => `Privilège Paulée –${p} %`, ship: 'Versand', pickup: 'Abholung', free: 'kostenfrei',
    total: 'Summe', vatIn: p => `darin enthalten ${p} % MwSt.`, totalNet: 'Summe netto', vatPlus: p => `zzgl. ${p} % MwSt.`, gross: 'Gesamtbetrag brutto',
    allIncl: 'Alle Preise inkl. MwSt.', allNet: 'Alle Preise netto zzgl. MwSt.',
    shipNoteC: (f, p, n) => `Versandkostenfrei ab ${f}, sonst ${p} je Paket (bis ${n} Fl.).`,
    shipNoteB: (f, p, m) => `Frei Haus ab ${f} netto, sonst ${p} je Flasche, mind. ${m}.`,
    inclVat: 'inkl. MwSt.', netGross: (n, g) => `${n} netto · ${g} brutto`,
    pending: n => `<b>${n === 1 ? '1 Bestellung' : n + ' Bestellungen'} noch nicht übertragen.</b> Wird automatisch gesendet, sobald Sie Empfang haben. Ansehen ›`,
    privSub: 'ab der ersten Flasche · nur am 2. November 2026 bis 23:59 Uhr',
    date: 'Lundi 2 novembre 2026 · Ambassade de France',
    lead: 'Die Weinliste ist jetzt auf Ihrem Gerät gespeichert und funktioniert auch ohne Empfang.',
    steps: [
      ['Wein finden', 'Tischnummer ins Suchfeld tippen, z. B. 128.'],
      ['Vormerken', 'Bei jedem Wein „+ Fl.“ – Ihre Auswahl bleibt gespeichert.'],
      ['Bestellen', 'Bis 23:59 Uhr, auch ohne Empfang. Nach Prüfung von Verfügbarkeit und Mengen erhalten Sie unsere Auftragsbestätigung.']
    ],
    pickC: 'Privatkunde', pickCSub: 'Preise inkl. MwSt.', pickB: 'Gastronomie & Fachhandel', pickBSub: 'Nettopreise mit B2B-Code',
    howTitle: 'So funktioniert’s',
    modeTitle: 'Preisansicht', modeCSub: 'Preise je Flasche inkl. MwSt.',
    modeBTitle: 'Gastronomie & Fachhandel', modeBSub: 'Nettopreise zzgl. MwSt. – nur für Gastronomie und Weinfachhandel, mit B2B-Code',
    codeHint: 'Die Nettopreise gelten <b>ausschließlich für die Gastronomie (Restaurants, Bars, Hotels) und den Weinfachhandel</b>. Andere Unternehmen bestellen bitte zu den Preisen für Privatkunden. Maßgeblich sind die Preise Ihrer Kundengruppe bei VISENTIN. Ihren B2B-Code finden Sie auf dem B2B-Bestellformular und in unserer E-Mail an Sie.',
    codePh: 'B2B-Code', unlock: 'Freischalten', codeBad: 'Dieser Code ist nicht gültig. Bitte prüfen Sie die Schreibweise.',
    unlocked: 'Nettopreise freigeschaltet', toPrivate: 'Preisansicht: Privatkunden',
    noWines: 'Noch keine Weine vorgemerkt.', tapAdd: 'Tippen Sie bei einem Wein auf <b>+ Fl.</b>', toList: 'Zur Weinliste',
    next: 'Weiter zu Ihren Angaben',
    reviewCart: '<b>Wunschmengen.</b> Einige Weine sind nur begrenzt verfügbar. Wir prüfen Ihre Bestellung und bestätigen Mengen und Preise mit unserer Auftragsbestätigung.',
    nextH: 'So geht es weiter',
    nextSteps: [
      ['Eingangsbestätigung', 'Sie erhalten sofort eine E-Mail, dass Ihre Bestellung eingegangen ist. Sie ist noch keine Annahme.'],
      ['Prüfung', 'Wir prüfen Verfügbarkeit, Mengen und Ihre Kundengruppe bei VISENTIN.'],
      ['Auftragsbestätigung', 'Erst mit unserer Auftragsbestätigung kommt der Kaufvertrag zustande.']
    ],
    nextNote: 'Bei begrenzt verfügbaren Weinen bestätigen wir gegebenenfalls eine geringere Menge. Maßgeblich sind die Preise Ihrer Kundengruppe bei VISENTIN. Läge ein Preis über dem hier angezeigten, erhalten Sie vorab ein neues Angebot – es gilt nur, wenn Sie es ausdrücklich bestätigen.',
    rev: 'Mir ist bekannt, dass VISENTIN meine Bestellung erst mit der Auftragsbestätigung annimmt und bei begrenzt verfügbaren Weinen eine geringere Menge bestätigen kann.',
    summaryNote: 'Wunschmengen und Preise laut Paulée-Weinliste. Verbindlich ist unsere Auftragsbestätigung.',
    footReviewH: 'Bestellung & Auftragsbestätigung',
    footReview: 'Ihre Bestellung prüfen wir auf Verfügbarkeit, Mengen und Kundengruppe. Einige Weine sind nur begrenzt verfügbar. Der Kaufvertrag kommt mit unserer Auftragsbestätigung zustande.',
    before: 'Bestellen können Sie am <b>2. November 2026 von 0:00 bis 23:59 Uhr</b>. Ihre Auswahl bleibt bis dahin auf diesem Gerät gespeichert.',
    after: ph => `Die Bestellung ist seit dem 2. November, 23:59 Uhr, geschlossen. Für Fragen erreichen Sie uns unter ${ph}.`,
    formTitle: 'Ihre Angaben',
    f: {
      first: 'Vorname', last: 'Nachname', firstB: 'Vorname Ansprechpartner', lastB: 'Nachname Ansprechpartner', kdnrC: 'Kundennummer (falls bekannt)', str: 'Straße / Hausnr.', plz: 'PLZ', ort: 'Ort', tel: 'Telefon', mail: 'E-Mail',
      firma: 'Firma / Restaurant', mailB: 'E-Mail (für die Bestätigung)', kdnr: 'Kundennummer', ustid: 'USt-IdNr.',
      laToggle: 'Lieferanschrift weicht ab', laName: 'Name / Firma',
      wish: deliv => `Wunschtermin ${deliv ? 'für die Lieferung' : 'für die Abholung'} (optional)`,
      wishHint: d => `Lieferung bzw. Abholung bis ${d}. Abweichende Wünsche gern unter Bemerkung.`, note: 'Bemerkung'
    },
    summary: 'Zusammenfassung', ordered: 'Ihre Bestellung', wishShort: 'Wunschtermin', addrShort: 'Lieferanschrift', noteShort: 'Bemerkung',
    nl: 'Ja, ich möchte den Newsletter von VISENTIN erhalten.',
    adult: 'Ich bin volljährig.',
    agb: `Ich akzeptiere die ${link('AGB', 'AGB')} und habe die ${link('Widerrufsrecht', 'Widerrufsbelehrung')} zur Kenntnis genommen.`,
    legalC: `Abweichend von § 3 unserer AGB ist die Weinliste kein verbindliches Angebot: Mit dem Absenden geben Sie Ihre Bestellung ab, der Kaufvertrag kommt erst mit unserer Auftragsbestätigung zustande. Abgabe alkoholischer Getränke nur an Volljährige. Verbraucher können ihre Bestellung binnen 14 Tagen ab Erhalt der Ware ohne Angabe von Gründen widerrufen. Ihre Angaben verwenden wir zur Abwicklung Ihrer Bestellung, für den Newsletter nur mit Ihrer Zustimmung – ${link('Datenschutz', 'Datenschutz')}.`,
    pro: 'Ich bestelle für einen Betrieb der Gastronomie oder des Weinfachhandels. Mir ist bekannt, dass die Nettopreise nur für diese Betriebe gelten.',
    legalB: `Abweichend von § 3 unserer AGB ist die Weinliste kein verbindliches Angebot: Mit dem Absenden geben Sie Ihre Bestellung ab, der Kaufvertrag kommt erst mit unserer Auftragsbestätigung zustande. Alle Preise netto zzgl. gesetzlicher MwSt. Es gelten unsere ${link('AGB', 'AGB für Geschäftskunden')}. Ihre Angaben verwenden wir zur Abwicklung Ihrer Bestellung – ${link('Datenschutz', 'Datenschutz')}.`,
    buyC: 'Zahlungspflichtig bestellen', buyB: 'Verbindlich bestellen',
    formErr: 'Bitte ergänzen Sie die markierten Angaben.',
    doneTitle: 'Vielen Dank', notFound: 'Nicht gefunden.', yourNo: 'Ihre Bestellnummer',
    sentMsg: (mail, deliv) => `Ihre Bestellung ist bei uns eingegangen. Die Eingangsbestätigung geht an <b>${mail}</b>. Nach Prüfung von Verfügbarkeit, Mengen und Kundengruppe erhalten Sie unsere Auftragsbestätigung; wegen ${deliv ? 'der Lieferung' : 'der Abholung'} melden wir uns bei Ihnen.`,
    testMsg: '<b>Testbetrieb.</b> Die Bestellung ist auf diesem Gerät gespeichert, wird aber noch nicht übertragen.',
    waitMsg: '<b>Noch nicht übertragen – kein Empfang.</b><br>Ihre Bestellung ist auf diesem Gerät gespeichert. Sie wird automatisch gesendet, sobald Sie diese Seite mit Empfang wieder öffnen.',
    sendNow: 'Jetzt senden', byMail: 'Per E-Mail senden',
    mailHint: 'Falls Sie diese Seite heute nicht mehr öffnen, senden Sie die Bestellung bitte per E-Mail. Sie wartet im Postausgang und geht automatisch raus, sobald Sie Empfang haben. Geht eine Bestellung doppelt ein, erkennen wir das an der Bestellnummer.',
    backToList: 'Zurück zur Weinliste', sending: 'Wird gesendet …',
    ordersTitle: 'Meine Bestellungen', noOrders: 'Noch keine Bestellungen auf diesem Gerät.',
    pillSent: 'übertragen', pillTest: 'Test', pillWait: 'wartet',
    offlineOk: 'Weinliste offline gespeichert', offlineWait: 'Weinliste wird gespeichert …',
    footPriv: p => `–${p} % ab der ersten Flasche auf alle Bestellungen am 2. November 2026 bis 23:59 Uhr. Weine auf Anfrage (a.A.) oder auf Zuteilung (a.Z.) sind digital nicht bestellbar – bitte am Infotisch erfragen.`,
    deskH: 'Infotisch · Entrée',
    desk: 'Bestellannahme, Beratung, Fragen zu Weinen, Konditionen und Lieferung. Dort können Sie auch mit Katalog oder Papierformular bestellen – bitte nur einen Weg nutzen.',
    shipH: d => `Lieferung & Abholung bis ${d}`,
    footShipC: (f, p, n) => `Innerhalb Deutschlands ab ${f} versandkostenfrei, sonst ${p} je Paket (bis ${n} Fl.). Preise inkl. MwSt.`,
    footShipB: (f, p, m) => `Innerhalb Deutschlands frei Haus ab ${f} netto, darunter ${p} je Flasche, mindestens ${m}. Preise netto zzgl. MwSt.`,
    footPickup: 'Abholung kostenfrei bei VISENTIN – Passion Vin: Berlin, Köpenicker Straße 18–20 · Hamburg, Große Elbstraße 131 · Di.–Fr. 10.30–19.00 Uhr, Sa. 11.00–18.00 Uhr.',
    switchMode: 'Preisansicht wechseln', other: 'English',
    links: [['Impressum', 'Impressum'], ['Datenschutz', 'Datenschutz'], ['AGB', 'AGB']], withdrawal: ['Widerrufsrecht', 'Widerrufsrecht'],
    version: (a, d, n) => `Version ${a} · Liste ${d} · ${n} Positionen`,
    bPreview: 'Vorschau · Bestellungen werden noch nicht übertragen', bPreviewTest: 'Vorschau · Testbestellungen',
    bBefore: 'Bestellung am 2. November 2026 bis 23:59 Uhr – bis dahin können Sie Weine vormerken.',
    bAfter: 'Die Bestellung ist geschlossen. Merci pour votre visite.',
    loadErr: 'Die Weinliste konnte nicht geladen werden. Bitte mit Empfang erneut öffnen – oder am Infotisch in der Entrée mit dem Papierformular bestellen.',
    region: r => r
  },
  en: {
    fl: n => n === 1 ? '1 bottle' : n + ' bottles',
    flShort: 'btl.', add: '+ Add', net: 'net', perL: '/l',
    sans: 'non-alcoholic', onRequest: 'on request', allocation: 'allocation only', notAvail: 'not available',
    askDesk: 'please ask at the info desk',
    rateAria: 'Your rating', of5: i => `${i} of 5`, less: 'One bottle less', more: 'One bottle more', qtyAria: 'Number of bottles',
    modeC: 'Private', modeB: 'Trade',
    order: 'Order', yourOrder: 'Your order',
    sentBtn: n => n === 1 ? 'Ordered' : n + ' orders', tabSel: n => 'Selection' + (n ? ' · ' + n + ' btl.' : ''), tabSent: n => `Ordered (${n})`,
    searchPh: 'Table number (e.g. 128), wine or domaine', searchAria: 'Search', tbl: 'Table no.',
    all: 'All', rated: 'Rated', inCart: 'In my order',
    emptyCart: 'No wines in your order yet.', emptyFilter: 'No wines match this selection.',
    dropped: list => `${list} cannot be ordered with these prices – removed`,
    deliv: {
      lieferung: ['Delivery within Germany', 'to your billing or delivery address'],
      'abholung-berlin': ['Pick-up in Berlin', 'Köpenicker Straße 18–20 · free of charge'],
      'abholung-hamburg': ['Pick-up in Hamburg', 'Große Elbstraße 131 · free of charge']
    },
    delivShort: { lieferung: 'Delivery', 'abholung-berlin': 'Pick-up Berlin', 'abholung-hamburg': 'Pick-up Hamburg' },
    delivLegend: () => 'Delivery or pick-up · by 30 November 2026',
    hours: 'Pick-up Tue–Fri 10:30 am–7 pm · Sat 11 am–6 pm',
    abroad: 'Delivery outside Germany: please order at the info desk in the Entrée.',
    sub: 'Subtotal', priv: p => `Privilège Paulée –${p} %`, ship: 'Shipping', pickup: 'Pick-up', free: 'free',
    total: 'Total', vatIn: p => `incl. ${p} % VAT`, totalNet: 'Total net', vatPlus: p => `plus ${p} % VAT`, gross: 'Total incl. VAT',
    allIncl: 'All prices incl. VAT.', allNet: 'All prices net, plus VAT.',
    shipNoteC: (f, p, n) => `Free shipping from ${f}, otherwise ${p} per parcel (up to ${n} btl.).`,
    shipNoteB: (f, p, m) => `Free delivery from ${f} net, otherwise ${p} per bottle, min. ${m}.`,
    inclVat: 'incl. VAT', netGross: (n, g) => `${n} net · ${g} incl. VAT`,
    pending: n => `<b>${n === 1 ? '1 order' : n + ' orders'} not yet sent.</b> It will be sent automatically as soon as you have a signal. View ›`,
    privSub: 'from the first bottle · only on 2 November 2026 until 11:59 pm',
    date: 'Lundi 2 novembre 2026 · Ambassade de France',
    lead: 'The wine list is now saved on your device and works without a signal.',
    steps: [
      ['Find a wine', 'Type the table number into the search field, e.g. 128.'],
      ['Add', 'Tap “+ Add” on any wine – your selection is saved.'],
      ['Order', 'Until 11:59 pm, even without a signal. Once we have checked availability and quantities, you receive our order confirmation.']
    ],
    pickC: 'Private customer', pickCSub: 'Prices incl. VAT', pickB: 'Restaurants & wine trade', pickBSub: 'Net prices with B2B code',
    howTitle: 'How it works',
    modeTitle: 'Prices', modeCSub: 'Prices per bottle incl. VAT',
    modeBTitle: 'Restaurants & wine trade', modeBSub: 'Net prices plus VAT – only for restaurants, bars, hotels and wine retailers, with B2B code',
    codeHint: 'Net prices apply <b>exclusively to the hospitality trade (restaurants, bars, hotels) and wine retailers</b>. Other businesses please order at private-customer prices. The prices of your customer group at VISENTIN apply. Your B2B code is printed on the B2B order form and in our email to you.',
    codePh: 'B2B code', unlock: 'Unlock', codeBad: 'This code is not valid. Please check the spelling.',
    unlocked: 'Net prices unlocked', toPrivate: 'Prices: private customers',
    noWines: 'No wines added yet.', tapAdd: 'Tap <b>+ Add</b> on any wine.', toList: 'Back to the wine list',
    next: 'Continue to your details',
    reviewCart: '<b>Requested quantities.</b> Some wines are available in limited quantities only. We check your order and confirm quantities and prices in our order confirmation.',
    nextH: 'What happens next',
    nextSteps: [
      ['Acknowledgement of receipt', 'You immediately receive an email that your order has arrived. It is not yet an acceptance.'],
      ['Review', 'We check availability, quantities and your customer group at VISENTIN.'],
      ['Order confirmation', 'The purchase contract is concluded only with our order confirmation.']
    ],
    nextNote: 'For wines in limited supply we may confirm a smaller quantity. The prices of your customer group at VISENTIN apply. Should a price be higher than shown here, you will first receive a new offer – it applies only if you expressly accept it.',
    rev: 'I understand that VISENTIN accepts my order only with its order confirmation and may confirm a smaller quantity for wines in limited supply.',
    summaryNote: 'Requested quantities and prices as per the Paulée wine list. Our order confirmation is binding.',
    footReviewH: 'Order & confirmation',
    footReview: 'We check your order for availability, quantities and customer group. Some wines are available in limited quantities only. The contract is concluded with our order confirmation.',
    before: 'You can order on <b>2 November 2026 from midnight until 11:59 pm</b>. Your selection stays saved on this device until then.',
    after: ph => `Ordering closed on 2 November at 11:59 pm. For questions please call ${ph}.`,
    formTitle: 'Your details',
    f: {
      first: 'First name', last: 'Last name', firstB: 'Contact first name', lastB: 'Contact last name', kdnrC: 'Customer number (if known)', str: 'Street and number', plz: 'Postcode', ort: 'City', tel: 'Phone', mail: 'Email',
      firma: 'Company / restaurant', mailB: 'Email (for the confirmation)', kdnr: 'Customer number', ustid: 'VAT ID',
      laToggle: 'Different delivery address', laName: 'Name / company',
      wish: deliv => `Preferred date for ${deliv ? 'delivery' : 'pick-up'} (optional)`,
      wishHint: () => 'Delivery or pick-up by 30 November 2026. Other requests welcome under comments.', note: 'Comments'
    },
    summary: 'Summary', ordered: 'Your order', wishShort: 'Preferred date', addrShort: 'Delivery address', noteShort: 'Comments',
    nl: 'Yes, I would like to receive the VISENTIN newsletter.',
    adult: 'I am of legal drinking age (18+).',
    agb: `I accept the ${link('AGB', 'terms and conditions')} and have read the ${link('Widerrufsrecht', 'cancellation policy')} (in German).`,
    legalC: `Notwithstanding § 3 of our terms, the wine list is not a binding offer: by sending, you place your order, and the contract is concluded only with our order confirmation. Alcoholic beverages are sold to adults only. Consumers may cancel their order within 14 days of receiving the goods without giving reasons. We use your details to process your order and, only with your consent, for our newsletter – ${link('Datenschutz', 'privacy policy')} (in German).`,
    pro: 'I am ordering for a restaurant, bar, hotel or wine retailer. I understand that net prices apply only to these businesses.',
    legalB: `Notwithstanding § 3 of our terms, the wine list is not a binding offer: by sending, you place your order, and the contract is concluded only with our order confirmation. All prices net, plus statutory VAT. Our ${link('AGB', 'terms for business customers')} apply (in German). We use your details to process your order – ${link('Datenschutz', 'privacy policy')}.`,
    buyC: 'Order with obligation to pay', buyB: 'Place binding order',
    formErr: 'Please complete the highlighted fields.',
    doneTitle: 'Thank you', notFound: 'Not found.', yourNo: 'Your order number',
    sentMsg: (mail, deliv) => `We have received your order. An acknowledgement of receipt is on its way to <b>${mail}</b>. Once we have checked availability, quantities and customer group, you receive our order confirmation; we will contact you about the ${deliv ? 'delivery' : 'pick-up'}.`,
    testMsg: '<b>Test mode.</b> The order is saved on this device but not yet transmitted.',
    waitMsg: '<b>Not sent yet – no signal.</b><br>Your order is saved on this device. It will be sent automatically when you reopen this page with a signal.',
    sendNow: 'Send now', byMail: 'Send by email',
    mailHint: 'If you will not reopen this page today, please send your order by email. It waits in your outbox and goes out automatically once you have a signal. Should an order arrive twice, we recognise it by its order number.',
    backToList: 'Back to the wine list', sending: 'Sending …',
    ordersTitle: 'My orders', noOrders: 'No orders on this device yet.',
    pillSent: 'sent', pillTest: 'test', pillWait: 'waiting',
    offlineOk: 'Wine list saved for offline use', offlineWait: 'Saving wine list …',
    footPriv: p => `–${p} % from the first bottle on all orders placed on 2 November 2026 until 11:59 pm. Wines on request (a.A.) or allocation only (a.Z.) cannot be ordered here – please ask at the info desk.`,
    deskH: 'Info desk · Entrée',
    desk: 'Orders, advice, questions about wines, terms and delivery. You can also order there with the catalogue or the paper form – please use only one way.',
    shipH: () => 'Delivery & pick-up by 30 November 2026',
    footShipC: (f, p, n) => `Within Germany free shipping from ${f}, otherwise ${p} per parcel (up to ${n} btl.). Prices incl. VAT.`,
    footShipB: (f, p, m) => `Within Germany free delivery from ${f} net, otherwise ${p} per bottle, minimum ${m}. Prices net, plus VAT.`,
    footPickup: 'Free pick-up at VISENTIN – Passion Vin: Berlin, Köpenicker Straße 18–20 · Hamburg, Große Elbstraße 131 · Tue–Fri 10:30 am–7 pm, Sat 11 am–6 pm.',
    switchMode: 'Change prices', other: 'Deutsch',
    links: [['Impressum', 'Legal notice'], ['Datenschutz', 'Privacy'], ['AGB', 'Terms']], withdrawal: ['Widerrufsrecht', 'Cancellation'],
    version: (a, d, n) => `Version ${a} · list ${d} · ${n} items`,
    bPreview: 'Preview · orders are not transmitted yet', bPreviewTest: 'Preview · test orders',
    bBefore: 'Ordering on 2 November 2026 until 11:59 pm – until then you can save your selection.',
    bAfter: 'Ordering is closed. Merci pour votre visite.',
    loadErr: 'The wine list could not be loaded. Please open it again with a signal – or order at the info desk in the Entrée with the paper form.',
    region: r => ({ Burgund: 'Burgundy', Elsass: 'Alsace', Normandie: 'Normandy', Spirituosen: 'Spirits', Alkoholfrei: 'Non-alcoholic' }[r] || r)
  }
};
const T = () => TXT[LANG];

const KIND = { rouge: 'rouge', blanc: 'blanc', rose: 'rosé', mousseux: 'effervescent', doux: 'doux', spiritueux: 'spiritueux' };
const kindLabel = k => k === 'sans' ? T().sans : KIND[k];
const ROOM = { S: 'Salon Pariser Platz', M: 'Salle à Manger', E: 'Entrée' };
const NA = { 'a.A.': 'onRequest', 'a.Z.': 'allocation' };
// Für die Bestelldaten (Team, JTL) immer Deutsch
const DELIV_DE = { lieferung: 'Lieferung', 'abholung-berlin': 'Abholung Berlin', 'abholung-hamburg': 'Abholung Hamburg' };

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
  if (dropped.length) toast(T().dropped(dropped.join(', ')));
}

function applyMode() {
  document.body.classList.toggle('b2b', S.mode === 'b');
  $('#modeLabel').textContent = S.mode === 'b' ? T().modeB : T().modeC;
  $('meta[name=theme-color]').content = S.mode === 'b' ? '#003B54' : '#75232A';
}

function applyLang() {
  document.documentElement.lang = LANG;
  const t = T(), q = $('#q');
  q.placeholder = t.searchPh; q.setAttribute('aria-label', t.searchAria);
  $('#tblBtn').textContent = t.tbl;
  $('#roomAll').textContent = t.all;
  $('#chipRated').textContent = t.rated;
  $('#chipCart').textContent = t.inCart;
  $('#chips [data-k=sans]').lastChild.textContent = '0 %';
  applyMode();
}

function setLang(l) {
  LANG = l; store.set(LS.lang, l);
  applyLang(); renderBanner(); renderList(); updateCart(); updatePending(); renderFoot();
  if (S.view) openView(S.view, S.viewArg, true);
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
  const r = S.rate[n] || 0, t = T();
  let h = `<div class="rate" role="group" aria-label="${t.rateAria}">`;
  for (let i = 1; i <= 5; i++) h += `<button data-rate="${i}" class="${i <= r ? 'on' : ''}" aria-label="${t.of5(i)}"></button>`;
  return h + '</div>';
}

function qtyHtml(n) {
  const q = S.cart[n] || 0, t = T();
  return `<div class="qty${q ? '' : ' zero'}"><button class="minus" data-q="-1" aria-label="${t.less}">−</button>` +
         `<input class="qn" type="number" inputmode="numeric" min="0" max="999" value="${q}" aria-label="${t.qtyAria}">` +
         `<button class="plus" data-q="1" aria-label="${t.more}">${q ? '+' : t.add}</button></div>`;
}

function wineHtml(w) {
  const p = priceOf(w), t = T();
  let price;
  if (typeof p === 'number') {
    const perL = S.mode === 'c' ? `<small>${money(Math.round(cents(p) / w.l))}${t.perL}</small>` : `<small>${t.net}</small>`;
    price = `<b>${money(cents(p))}</b>${perL}`;
  } else {
    price = `<em>${esc(p || '–')}</em>`;
  }
  const action = typeof p === 'number'
    ? qtyHtml(w.n)
    : `<div class="ask">${NA[p] ? t[NA[p]] : t.notAvail} –<br>${t.askDesk}</div>`;
  const sub = [w.v, w.l !== 0.75 ? w.u : ''].filter(Boolean).join(' · ');
  return `<article class="wine${S.cart[w.n] ? ' in' : ''}" id="w-${w.n}" data-n="${w.n}">` +
    `<div class="wine-no">${w.n}</div>` +
    `<div class="wine-main"><div class="wine-t"><i class="sym ${w.k}" title="${kindLabel(w.k)}"></i>` +
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
           `<div class="table-name"><h3>${esc(t.doms.join(' · '))}</h3><p>${esc(t.regs.map(T().region).join(' · '))}</p></div></div>`;
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
  // Suche in beiden Sprachen (z. B. „Burgund“ und „Burgundy“)
  const hay = w._hay ||= fold([w.n, w.w, w.d, w.r, TXT.en.region(w.r), w.v, KIND[w.k] || 'alkoholfrei non-alcoholic', ROOM[w.m], w.o ? 'bio' : ''].join(' '));
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
  $('#empty').textContent = S.flags.has('cart') && !Object.keys(S.cart).length ? T().emptyCart : T().emptyFilter;
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
  const sent = orders().length, showSent = !t.bottles && sent > 0;
  $('#cartCount').textContent = showSent ? '✓' : t.bottles;
  $('#cartTotal').textContent = t.bottles ? money(t.goods) : showSent ? T().sentBtn(sent) : T().order;
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
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(6));
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
  el.innerHTML = T().pending(n);
}

/* Bestelltext für den E-Mail-Notweg – immer Deutsch, weil er beim Team ankommt */
const FIELD_LABEL = { firma: 'Firma / Restaurant', vorname: 'Vorname', nachname: 'Nachname', kdnr: 'Kundennummer', ustid: 'USt-IdNr.',
  str: 'Straße / Hausnr.', plz: 'PLZ', ort: 'Ort', tel: 'Telefon', mail: 'E-Mail' };
function orderText(p) {
  const L = [`Bestellung ${p.code} – La Paulée de Berlin 2026`,
    `${p.mode === 'B2B' ? 'Gastronomie & Fachhandel (netto)' : 'Privatkunden (inkl. MwSt.)'} · ${new Date(p.createdAt).toLocaleString('de-DE')} · Sprache ${p.lang || 'de'}`, ''];
  for (const i of p.items) L.push(`${i.qty} × ${i.n}  ${i.wine} – ${i.domaine}  à ${money(i.priceCents)}`);
  const t = p.totals;
  L.push('', `Zwischensumme: ${money(t.subCents)}`, `Privilège Paulée –${t.privilegePct} %: –${money(t.discCents)}`,
    `${DELIV_DE[p.delivery.type]}: ${t.shipCents ? money(t.shipCents) : 'kostenfrei'}`,
    ...(p.mode === 'B2B'
      ? [`Summe netto: ${money(t.totalCents)}`, `zzgl. ${t.vatPct} % MwSt.: ${money(t.vatCents)}`, `Gesamtbetrag brutto: ${money(t.grossCents)}`]
      : [`Summe: ${money(t.totalCents)} (darin ${t.vatPct} % MwSt.: ${money(t.vatCents)})`]), '');
  if (p.mode === 'B2B') L.push('Bestellung zu Konditionen für Gastronomie & Fachhandel (Betrieb der Gastronomie/des Weinfachhandels bestätigt).', '');
  for (const [k, v] of Object.entries(p.customer)) if (v && k !== 'name') L.push(`${FIELD_LABEL[k] || k}: ${v}`);
  if (p.delivery.address) L.push(`Lieferanschrift: ${p.delivery.address}`);
  if (p.delivery.wish) L.push(`Wunschtermin: ${fmtDate(p.delivery.wish, 'de')}`);
  if (p.note) L.push(`Bemerkung: ${p.note}`);
  L.push('', 'Bestellung über die Paulée-Weinliste: Annahme erst mit Auftragsbestätigung von VISENTIN – Verfügbarkeit, Mengen und Preise der Kundengruppe vorbehalten.');
  L.push('', `Referenz: ${p.id}`);
  return L.join('\n');
}
function mailHref(p) {
  return `mailto:${C.contactMail}?subject=${encodeURIComponent('Paulée-Bestellung ' + p.code)}&body=${encodeURIComponent(orderText(p))}`;
}

/* Datum aus dem Datumsfeld (JJJJ-MM-TT) lesbar machen; Freitext bleibt unverändert */
function fmtDate(v, lang = LANG) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return v || '';
  return new Date(+m[1], m[2] - 1, +m[3]).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* Übersicht einer abgesendeten Bestellung – aus den gespeicherten Daten, funktioniert offline */
function orderSummaryHtml(p) {
  const t = T(), tt = p.totals, b2b = p.mode === 'B2B', d = p.delivery || {};
  const row = (a, b, cls = '') => `<div class="${cls}"><span>${a}</span><span>${b}</span></div>`;
  let h = `<fieldset style="text-align:left"><legend>${t.ordered}</legend><div class="lines">`;
  for (const i of p.items) {
    h += `<div class="line"><div><div class="line-t">${esc(i.wine)}</div>` +
         `<div class="line-s">${esc(i.n)} · ${esc(i.domaine)} · ${i.qty} × ${money(i.priceCents)}</div></div>` +
         `<div class="line-r">${money(i.lineCents || i.priceCents * i.qty)}</div></div>`;
  }
  h += `</div><div class="sum">` +
    row(t.sub, money(tt.subCents)) +
    row(t.priv(tt.privilegePct), '–' + money(tt.discCents), 'p') +
    row(d.type === 'lieferung' ? t.ship : t.pickup, tt.shipCents ? money(tt.shipCents) : t.free) +
    (b2b
      ? row(t.totalNet, money(tt.totalCents), 'tn') + row(t.vatPlus(tt.vatPct), money(tt.vatCents), 'v') + row(t.gross, money(tt.grossCents), 't')
      : row(t.total, money(tt.totalCents), 't') + row(t.vatIn(tt.vatPct), money(tt.vatCents), 'v')) +
    `</div><div class="box" style="margin:10px 0 0">` +
    `<b>${esc((t.deliv[d.type] || [d.type])[0])}</b>` +
    (d.wish ? `<br>${t.wishShort}: ${esc(fmtDate(d.wish))}` : '') +
    (d.address ? `<br>${t.addrShort}: ${esc(d.address)}` : '') +
    (p.note ? `<br>${t.noteShort}: ${esc(p.note)}` : '') +
    `</div><p class="hint" style="margin:8px 0 0">${t.summaryNote}</p></fieldset>`;
  return h;
}

/* ---------- Formular ---------- */
// [key, Label-Schlüssel, Pflicht, Breite (w = ganze Zeile, s = halbe), autocomplete, type]
const FIELDS = {
  c: [['vorname', 'first', 1, 's', 'given-name'], ['nachname', 'last', 1, 's', 'family-name'], ['kdnr', 'kdnrC', 0, 'w', 'off'],
      ['str', 'str', 1, 'w', 'street-address'], ['plz', 'plz', 1, 's', 'postal-code'], ['ort', 'ort', 1, 's', 'address-level2'],
      ['tel', 'tel', 1, 's', 'tel', 'tel'], ['mail', 'mail', 1, 's', 'email', 'email']],
  b: [['firma', 'firma', 1, 'w', 'organization'], ['vorname', 'firstB', 1, 's', 'given-name'], ['nachname', 'lastB', 1, 's', 'family-name'],
      ['mail', 'mailB', 1, 'w', 'email', 'email'],
      ['kdnr', 'kdnr', 0, 's', 'off'], ['ustid', 'ustid', 0, 's', 'off'],
      ['str', 'str', 0, 'w', 'street-address'], ['plz', 'plz', 0, 's', 'postal-code'], ['ort', 'ort', 0, 's', 'address-level2'],
      ['tel', 'tel', 0, 'w', 'tel', 'tel']]
};

function fieldHtml([k, lk, req, wd, ac, type, extra], val, labelText) {
  const label = labelText || T().f[lk];
  return `<div class="fld ${wd}"><label for="f-${k}">${esc(label)}${req ? ' <i>*</i>' : ''}</label>` +
    `<input id="f-${k}" name="${k}" type="${type || 'text'}" autocomplete="${ac}" value="${esc(val || '')}"${req ? ' required' : ''}` +
    `${k === 'plz' || k === 'la_plz' ? ' inputmode="numeric"' : ''}${type === 'email' ? ' autocapitalize="off" spellcheck="false"' : ''}${extra || ''}></div>`;
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

const privHtml = () => `<div class="priv"><b>Privilège Paulée</b><strong>–${C.privilegePct} %</strong><span>${T().privSub}</span></div>`;
const langHtml = () => `<div class="lang" role="group" aria-label="Sprache / Language">` +
  `<button data-lang="de" class="${LANG === 'de' ? 'on' : ''}">Deutsch</button><button data-lang="en" class="${LANG === 'en' ? 'on' : ''}">English</button></div>`;
const stepsHtml = () => `<ol class="steps">${T().steps.map(([a, b], i) => `<li><span class="n">${i + 1}</span><span><b>${a}</b>${b}</span></li>`).join('')}</ol>`;

// Umschalter Auswahl ↔ abgeschickte Bestellungen (nur wenn es abgeschickte gibt)
function segHtml(active) {
  const n = orders().length;
  if (!n) return '';
  const b = totals().bottles, t = T();
  return `<div class="seg" role="tablist"><button data-action="cartview" class="${active === 'cart' ? 'on' : ''}" role="tab">${t.tabSel(b)}</button>` +
         `<button data-action="orders" class="${active === 'orders' ? 'on' : ''}" role="tab">${t.tabSent(n)}</button></div>`;
}

const VIEWS = {
  welcome() {
    const t = T();
    return ['', `<div class="welcome">
      ${langHtml()}
      <img src="/img/logo-gold.png" alt="La Paulée de Berlin" width="500" height="155">
      <p class="date">${t.date}</p>
      <p class="lead">${t.lead}</p>
      ${stepsHtml()}
      ${privHtml()}
      <div class="choice">
        <button class="btn c stack" data-action="pick-c">${t.pickC}<small>${t.pickCSub}</small></button>
        <button class="btn b stack" data-action="pick-b">${t.pickB}<small>${t.pickBSub}</small></button>
      </div>
      <div id="codeBox" hidden>${codeFormHtml()}</div>
    </div>`];
  },
  help() {
    return [T().howTitle, `${langHtml()}${stepsHtml()}${privHtml()}
      <button class="btn ghost" data-action="close" style="margin-top:14px">${T().backToList}</button>`];
  },
  mode() {
    const t = T();
    return [t.modeTitle, `
      <div class="opts">
        <label class="opt"><input type="radio" name="m" value="c"${S.mode === 'c' ? ' checked' : ''}><span><b>${t.pickC}</b><small>${t.modeCSub}</small></span></label>
        <label class="opt"><input type="radio" name="m" value="b"${S.mode === 'b' ? ' checked' : ''}><span><b>${t.modeBTitle}</b><small>${t.modeBSub}</small></span></label>
      </div>
      <div id="codeBox" hidden>${codeFormHtml()}</div>`];
  },
  cart() {
    const t = T(), tot = totals();
    if (!tot.lines.length) {
      return [t.yourOrder, `${segHtml('cart')}<p class="empty" style="margin:20px 0">${t.noWines}</p>
        <p class="hint" style="text-align:center">${t.tapAdd}</p>
        <button class="btn ghost" data-action="close" style="margin-top:20px">${t.toList}</button>`];
    }
    const ws = windowState();
    let h = segHtml('cart') + '<div class="lines">';
    for (const l of tot.lines) {
      h += `<div class="line" data-n="${l.w.n}"><div><div class="line-t">${esc(l.w.w)}</div>` +
           `<div class="line-s">${l.w.n} · ${esc(l.w.d)} · ${money(l.pc)}</div></div>` +
           `<div class="line-r">${money(l.lc)}</div>${qtyHtml(l.w.n)}</div>`;
    }
    h += '</div>';
    h += `<p class="box" style="margin:12px 0 0;font-size:13px">${t.reviewCart}</p>`;
    h += `<fieldset><legend>${t.delivLegend(C.deliveryUntil)}</legend><div class="opts">`;
    for (const [k, [a, b]] of Object.entries(t.deliv)) {
      h += `<label class="opt"><input type="radio" name="deliv" value="${k}"${S.deliv === k ? ' checked' : ''}><span><b>${a}</b><small>${b}</small></span></label>`;
    }
    h += `</div><p class="hint">${t.hours}</p><p class="abroad">${t.abroad}</p></fieldset>`;
    h += sumHtml(tot);
    if (ws === 'open') {
      h += `<div class="submit"><button class="btn" data-action="form">${t.next}</button></div>`;
    } else {
      h += `<div class="box warn">${ws === 'before' ? t.before : t.after(esc(C.contactPhone))}</div>`;
    }
    return [t.yourOrder, h];
  },
  form() {
    const t = T(), tot = totals();
    const saved = store.get(LS.form, {});
    const v = saved[S.mode] || {};
    if (v.name && !v.vorname && !v.nachname) {           // frühere Fassung: ein Namensfeld
      const parts = v.name.trim().split(/\s+/); v.nachname = parts.pop() || ''; v.vorname = parts.join(' ');
    }
    const deliv = S.deliv === 'lieferung';
    let h = `<div class="f">${FIELDS[S.mode].map(f => fieldHtml(f, v[f[0]])).join('')}</div>`;
    if (deliv) {
      h += `<label class="check"><input type="checkbox" id="f-la"${v.la ? ' checked' : ''}><span>${t.f.laToggle}</span></label>
        <div class="f" id="laBox" style="margin-top:10px"${v.la ? '' : ' hidden'}>
          ${fieldHtml(['la_name', 'laName', 0, 'w', 'off'], v.la_name)}
          ${fieldHtml(['la_str', 'str', 0, 'w', 'off'], v.la_str)}
          ${fieldHtml(['la_plz', 'plz', 0, 's', 'off'], v.la_plz)}
          ${fieldHtml(['la_ort', 'ort', 0, 's', 'off'], v.la_ort)}
        </div>`;
    }
    h += `<div class="f" style="margin-top:12px">
        ${fieldHtml(['wish', '', 0, 'w', 'off', 'date', ` min="${C.deliveryFrom || '2026-11-03'}"`], /^\d{4}-\d{2}-\d{2}$/.test(v.wish || '') ? v.wish : '', t.f.wish(deliv))}
        <p class="hint w" style="margin:-4px 0 0">${t.f.wishHint(C.deliveryUntil)}</p>
        <div class="fld w"><label for="f-note">${t.f.note}</label><textarea id="f-note" name="note">${esc(v.note || '')}</textarea></div>
      </div>`;
    h += `<fieldset><legend>${t.summary}</legend>
      <div class="box" style="margin:0">${t.fl(tot.bottles)} · ${esc(t.delivShort[S.deliv])}${sumHtml(tot, true)}</div></fieldset>`;
    h += `<fieldset><legend>${t.nextH}</legend>
      <ol class="steps">${t.nextSteps.map(([a, b], i) => `<li><span class="n">${i + 1}</span><span><b>${a}</b>${b}</span></li>`).join('')}</ol>
      <p class="hint" style="margin:8px 0 0">${t.nextNote}</p></fieldset>
      <label class="check" id="c-rev"><input type="checkbox" id="f-rev"><span>${t.rev} <i class="req">*</i></span></label>`;
    if (S.mode === 'c') {
      h += `<label class="check"><input type="checkbox" id="f-nl"${v.nl ? ' checked' : ''}><span>${t.nl}</span></label>
        <label class="check" id="c-adult"><input type="checkbox" id="f-adult"><span>${t.adult} <i class="req">*</i></span></label>
        <label class="check" id="c-agb"><input type="checkbox" id="f-agb"><span>${t.agb} <i class="req">*</i></span></label>
        <p class="legal">${t.legalC}</p>`;
    } else {
      h += `<label class="check" id="c-pro"><input type="checkbox" id="f-pro"><span>${t.pro} <i class="req">*</i></span></label>
        <p class="legal">${t.legalB}</p>`;
    }
    h += `<p class="err" id="formErr" hidden></p>
      <div class="submit"><button class="btn stack" data-action="submit">${S.mode === 'c' ? t.buyC : t.buyB}<small>${S.mode === 'c' ? money(tot.total) + ' ' + t.inclVat : t.netGross(money(tot.total), money(tot.gross))}</small></button></div>`;
    return [t.formTitle, h, 'cart'];
  },
  done(id) {
    const t = T();
    const o = orders().find(x => x.id === id);
    if (!o) return [t.doneTitle, `<p class="empty">${t.notFound}</p>`];
    const p = o.payload, sent = o.status === 'sent', test = !C.endpoint;
    const bottles = p.items.reduce((a, i) => a + i.qty, 0);
    let h = `<div class="done"><div class="mark${sent ? '' : ' wait'}">${sent ? '✓' : '…'}</div>
      <h3>Merci${(p.customer.vorname || p.customer.name) ? ', ' + esc(p.customer.vorname || p.customer.name.split(' ')[0]) : ''}.</h3>
      <p>${t.yourNo}</p><div class="no">${p.code}</div>
      <p style="color:var(--muted);font-size:13px">${t.fl(bottles)} · ${p.mode === 'B2B' ? t.netGross(money(p.totals.totalCents), money(p.totals.grossCents)) : money(p.totals.totalCents) + ' ' + t.inclVat}</p>`;
    if (sent) {
      h += `<p>${t.sentMsg(esc(p.customer.mail), p.delivery.type === 'lieferung')}</p>`;
    } else if (test) {
      h += `<div class="box warn">${t.testMsg}</div>`;
    } else {
      h += `<div class="box warn">${t.waitMsg}</div>
        <button class="btn" data-action="retry">${t.sendNow}</button>
        <p class="hint">${t.mailHint}</p>
        <a class="btn ghost" style="margin-top:8px" href="${esc(mailHref(p))}">${t.byMail}</a>`;
    }
    h += orderSummaryHtml(p);
    h += `<button class="btn ghost" data-action="close" style="margin-top:14px">${t.backToList}</button></div>`;
    return [t.doneTitle, h];
  },
  orders() {
    const t = T(), list = orders().slice().reverse();
    if (!list.length) return [t.ordersTitle, `<p class="empty">${t.noOrders}</p>`];
    let h = segHtml('orders') + '<div class="orders">';
    for (const o of list) {
      const p = o.payload;
      const pill = o.status === 'sent' ? `<span class="pill">${t.pillSent}</span>`
        : !C.endpoint ? `<span class="pill test">${t.pillTest}</span>` : `<span class="pill wait">${t.pillWait}</span>`;
      h += `<div class="o" data-action="show-order" data-id="${o.id}" role="button" tabindex="0"><div><b>${p.code}</b>` +
           `<small>${new Date(p.createdAt).toLocaleString(LANG === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })} · ${p.items.reduce((a, i) => a + i.qty, 0)} ${t.flShort} · ${money(p.totals.totalCents)}</small></div>${pill}</div>`;
    }
    h += '</div>';
    if (list.some(o => o.status === 'pending') && C.endpoint) h += `<button class="btn" data-action="retry" style="margin-top:16px">${t.sendNow}</button>`;
    return [t.ordersTitle, h];
  }
};

function codeFormHtml() {
  const t = T();
  return `<p class="hint" style="text-align:left;margin-top:16px">${t.codeHint}</p>
    <form class="code" data-form="code"><input id="codeIn" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${t.codePh}" aria-label="${t.codePh}">
    <button class="btn b small" style="width:auto">${t.unlock}</button></form><p class="err" id="codeErr" hidden></p>`;
}

function sumHtml(tot, compact) {
  const t = T();
  const vatNote = S.mode === 'c' ? t.allIncl : t.allNet;
  let shipNote = '';
  if (S.deliv === 'lieferung') {
    shipNote = S.mode === 'c'
      ? t.shipNoteC(money(cents(C.b2cFreeFrom)), money(cents(C.b2cParcel)), C.b2cParcelSize)
      : t.shipNoteB(money(cents(C.b2bFreeFrom)), money(cents(C.b2bPerBottle)), money(cents(C.b2bMin)));
  }
  return `<div class="sum">
    <div><span>${t.sub}</span><span>${money(tot.sub)}</span></div>
    <div class="p"><span>${t.priv(C.privilegePct)}</span><span>–${money(tot.disc)}</span></div>
    <div><span>${S.deliv === 'lieferung' ? t.ship : t.pickup}</span><span>${tot.ship ? money(tot.ship) : t.free}</span></div>
    ${S.mode === 'c'
      ? `<div class="t"><span>${t.total}</span><span>${money(tot.total)}</span></div>
         <div class="v"><span>${t.vatIn(C.vatPct)}</span><span>${money(tot.vat)}</span></div>`
      : `<div class="tn"><span>${t.totalNet}</span><span>${money(tot.total)}</span></div>
         <div class="v"><span>${t.vatPlus(C.vatPct)}</span><span>${money(tot.vat)}</span></div>
         <div class="t"><span>${t.gross}</span><span>${money(tot.gross)}</span></div>`}
    <div class="n"><span>${vatNote}${compact ? '' : ' ' + shipNote}</span></div></div>`;
}

/* Nachbereitung je Ansicht */
const AFTER = {
  mode() {
    $$('input[name=m]', sheet()).forEach(r => r.addEventListener('change', () => {
      if (r.value === 'c') { setMode('c').then(() => { closeView(); toast(T().toPrivate); }); }
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
  const checks = S.mode === 'c' ? ['rev', 'adult', 'agb'] : ['rev', 'pro'];
  for (const c of checks) {
    const ok = $('#f-' + c).checked;
    $('#c-' + c).classList.toggle('bad', !ok);
    if (!ok && !bad) bad = $('#f-' + c);
  }
  const err = $('#formErr');
  if (bad) {
    err.hidden = false;
    err.textContent = T().formErr;
    bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
    bad.focus({ preventScroll: true });
    return;
  }
  if (windowState() !== 'open') { openView('cart'); return; }
  const tot = totals();
  if (!tot.lines.length) { openView('cart'); return; }

  lastSubmit = Date.now();
  const customer = {};
  for (const [k] of FIELDS[S.mode]) customer[k] = v[k] || '';
  customer.name = [customer.vorname, customer.nachname].filter(Boolean).join(' ');
  const address = S.deliv === 'lieferung' && v.la
    ? [v.la_name, v.la_str, [v.la_plz, v.la_ort].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const id = uuid();
  const payload = {
    id, code: shortCode(), createdAt: new Date().toISOString(),
    mode: S.mode === 'b' ? 'B2B' : 'B2C', lang: LANG, preview: !!C.preview,
    app: APP_VERSION, data: DATA.version,
    customer,
    delivery: { type: S.deliv, address, wish: v.wish || '' },
    newsletter: S.mode === 'c' ? !!v.nl : false,
    note: v.note || '',
    items: tot.lines.map(l => ({ n: l.w.n, art: l.w.a, wine: l.w.w, domaine: l.w.d, unit: l.w.u, qty: l.q, priceCents: l.pc, lineCents: l.lc })),
    totals: { subCents: tot.sub, discCents: tot.disc, shipCents: tot.ship, totalCents: tot.total, vatCents: tot.vat, grossCents: tot.gross, vatPct: C.vatPct,
              bottles: tot.bottles, basis: S.mode === 'b' ? 'netto' : 'brutto', privilegePct: C.privilegePct },
    businessConfirmed: S.mode === 'b',
    reviewAccepted: true                    // Kunde hat bestätigt: Annahme erst mit Auftragsbestätigung, ggf. geringere Menge
  };
  saveOrder({ id, status: 'pending', payload });
  S.cart = {}; store.set(LS.cart, S.cart);
  renderList(); updateCart(); updatePending();
  openView('done', id);
  flush();
}

/* ---------- Footer ---------- */
function renderFoot(ready) {
  const t = T();
  const cached = ready === undefined ? $('#foot')?.dataset.ready === '1' : ready;
  $('#foot').dataset.ready = cached ? '1' : '';
  const ship = S.mode === 'c'
    ? t.footShipC(money(cents(C.b2cFreeFrom)), money(cents(C.b2cParcel)), C.b2cParcelSize)
    : t.footShipB(money(cents(C.b2bFreeFrom)), money(cents(C.b2bPerBottle)), money(cents(C.b2bMin)));
  const links = [...t.links, ...(S.mode === 'c' ? [t.withdrawal] : [])].map(([p, l]) => link(p, l)).join('\n      ');
  $('#foot').innerHTML = `
    <p><span class="status${cached ? '' : ' wait'}">${cached ? t.offlineOk : t.offlineWait}</span></p>
    <h4>Privilège Paulée</h4>
    <p>${t.footPriv(C.privilegePct)}</p>
    <h4>${t.footReviewH}</h4>
    <p>${t.footReview}</p>
    <h4>${t.deskH}</h4>
    <p>${t.desk}</p>
    <h4>${t.shipH(C.deliveryUntil)}</h4>
    <p>${ship} ${t.abroad}</p>
    <p>${t.footPickup}</p>
    <div class="links">
      <button data-action="help">${t.howTitle}</button>
      <button data-action="orders">${t.ordersTitle}</button>
      <button data-action="mode">${t.switchMode}</button>
      <button data-lang="${LANG === 'de' ? 'en' : 'de'}">${t.other}</button>
      ${links}
    </div>
    <p style="margin-top:18px">VISENTIN – Vins Français d'Exception · Köpenicker Straße 18–20 · 10997 Berlin<br>
    <a href="tel:${C.contactPhone.replace(/\s/g, '')}">${esc(C.contactPhone)}</a> · <a href="mailto:${C.contactMail}">${C.contactMail}</a></p>
    <p style="opacity:.6;font-size:11px">${t.version(APP_VERSION, DATA.version, DATA.count)}</p>`;
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
    toast(T().unlocked);
  } catch {
    err.hidden = false;
    err.textContent = T().codeBad;
    input.select();
  } finally { btn.disabled = false; }
}

function bind() {
  document.addEventListener('click', e => {
    // Sprache
    const lb = e.target.closest('[data-lang]');
    if (lb) { e.preventDefault(); setLang(lb.dataset.lang); return; }
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
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    e.preventDefault();
    switch (act) {
      case 'home': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'tbl': {
        const q = $('#q');
        q.setAttribute('inputmode', 'numeric'); q.value = ''; S.q = ''; applyFilter(); q.focus();
        break;
      }
      case 'cart': openView(!totals().bottles && orders().length ? 'orders' : 'cart'); break;
      case 'cartview': openView('cart'); break;
      case 'mode': openView('mode'); break;
      case 'help': openView('help'); break;
      case 'orders': openView('orders'); break;
      case 'form': openView('form'); break;
      case 'submit': submitOrder(); break;
      case 'close': closeView(); break;
      case 'back': openView(a.dataset.to); break;
      case 'retry': toast(T().sending); flush(); break;
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
  const q = $('#q');
  q.addEventListener('input', e => {
    clearTimeout(qt);
    qt = setTimeout(() => {
      S.q = e.target.value; applyFilter();
      // Ziffernblock (Taste „Tisch-Nr.“) hat keine Eingabetaste: nach einer vollständigen Tischnummer Tastatur schließen
      if (q.getAttribute('inputmode') === 'numeric' && /^\d{3}$/.test(q.value.trim())) q.blur();
    }, 110);
  });
  // Eingabetaste („Suchen“, „Weiter“, „Enter“) schließt die Tastatur und zeigt die Treffer
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(qt); S.q = q.value; applyFilter(); q.blur(); }
  });
  // Zifferntastatur nur für die Tischnummer, danach wieder normale Tastatur
  q.addEventListener('blur', () => q.setAttribute('inputmode', 'search'));
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
  const b = $('#banner'), ws = windowState(), t = T();
  let msg = '';
  if (C.preview) msg = C.endpoint ? t.bPreviewTest : t.bPreview;
  else if (ws === 'before') msg = t.bBefore;
  else if (ws === 'after') msg = t.bAfter;
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
  applyLang();
  try {
    const r = await fetch('/data.json');
    DATA = await r.json();
  } catch {
    $('#list').innerHTML = `<p class="empty">${T().loadErr}</p>`;
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
