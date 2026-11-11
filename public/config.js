/* La Paulée de Berlin 2026 – Konfiguration
   Nur diese Datei muss für den Betrieb angepasst werden. */
window.PAULEE_CONFIG = {
  // Web-App-URL des Google Apps Script (Bestellannahme). Leer = Testbetrieb, nichts wird übertragen.
  endpoint: 'https://script.google.com/macros/s/AKfycbwrW0xqrlg8TxM88KwweflcqfzGZx-nq2QFKtUOEAE-H5ncyN5KddsgwqBWzgrYYbjp/exec',

  // Bestellfenster (Berliner Zeit). Außerhalb: Liste ansehen und vormerken, aber nicht absenden.
  // 2.11.2026: Paulée in der Botschaft (P-…) · 13.–15.11.2026: Merci Paulée (M-…)
  orderStart: '2026-11-13T00:00:00+01:00',
  orderEnd:   '2026-11-15T23:59:59+01:00',

  // Aktion: Name, Zeitraum in Worten, Präfix der Bestellnummer
  action: {
    id: 'merci', prefix: 'M', name: 'Merci Paulée',
    de: { when: 'vom 13. bis 15. November 2026', until: 'Sonntag, 15. November, 23:59 Uhr', date: 'Merci Paulée · 13 – 15 novembre 2026',
          lead: 'Als Dank für Ihren Besuch zum zehnjährigen Jubiläum gilt das Privilège Paulée noch einmal – nur für die Gäste der Botschaft.' },
    en: { when: 'from 13 to 15 November 2026', until: 'Sunday, 15 November, 11:59 pm', date: 'Merci Paulée · 13 – 15 novembre 2026',
          lead: 'As a thank-you for your visit to our tenth anniversary, the Privilège Paulée applies once more – for the guests of the embassy only.' }
  },

  // Vorschau: Bestellen jederzeit möglich, Hinweisband sichtbar; Bestellungen landen in den Test-Blättern,
  // Mails tragen [TEST]. Automatisch auf jeder Adresse außer paulee.weine-visentin.de (Testadressen).
  preview: location.hostname !== 'paulee.weine-visentin.de',

  privilegePct: 10,
  vatPct: 19,          // Wein, Spirituosen, alkoholfreie Getränke und Versand: 19 %
  // Versand Privatkunden: frei ab (Listenpreis vor Privilège), sonst je angefangene 12 Flaschen
  b2cFreeFrom: 180, b2cParcel: 8.90, b2cParcelSize: 12,
  // Versand Gastronomie & Fachhandel: frei ab (netto, vor Privilège), sonst je Flasche, mindestens
  b2bFreeFrom: 500, b2bPerBottle: 0.50, b2bMin: 9.50,

  deliveryUntil: '30. November 2026',
  deliveryFrom: '2026-11-16',      // frühester Wunschtermin im Datumsfeld
  contactMail: 'info@weine-visentin.de',
  contactPhone: '+49 30 695 199 20'
};
