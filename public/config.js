/* La Paulée de Berlin 2026 – Konfiguration
   Nur diese Datei muss für den Betrieb angepasst werden. */
window.PAULEE_CONFIG = {
  // Web-App-URL des Google Apps Script (Bestellannahme). Leer = Testbetrieb, nichts wird übertragen.
  endpoint: 'https://script.google.com/macros/s/AKfycbwrW0xqrlg8TxM88KwweflcqfzGZx-nq2QFKtUOEAE-H5ncyN5KddsgwqBWzgrYYbjp/exec',

  // Bestellfenster (Berliner Zeit). Außerhalb: Liste ansehen und vormerken, aber nicht absenden.
  orderStart: '2026-11-02T00:00:00+01:00',
  orderEnd:   '2026-11-02T23:59:59+01:00',

  // Vorschau: Bestellen jederzeit möglich, Hinweisband sichtbar; Bestellungen landen in den Test-Blättern,
  // Mails tragen [TEST]. Vor dem 2.11. auf false setzen.
  preview: false,

  privilegePct: 10,
  vatPct: 19,          // Wein, Spirituosen, alkoholfreie Getränke und Versand: 19 %
  // Versand Privatkunden: frei ab (Listenpreis vor Privilège), sonst je angefangene 12 Flaschen
  b2cFreeFrom: 180, b2cParcel: 8.90, b2cParcelSize: 12,
  // Versand Gastronomie & Fachhandel: frei ab (netto, vor Privilège), sonst je Flasche, mindestens
  b2bFreeFrom: 500, b2bPerBottle: 0.50, b2bMin: 9.50,

  deliveryUntil: '30. November 2026',
  deliveryFrom: '2026-11-03',      // frühester Wunschtermin im Datumsfeld
  contactMail: 'info@weine-visentin.de',
  contactPhone: '+49 30 695 199 20'
};
