# La Paulée de Berlin 2026 – digitale Weinliste & Bestellung

Offline-fähige Web-App unter **https://paulee.weine-visentin.de** (QR-Code auf Katalog und Bestellformularen).

## Aufbau
- `public/` – die Website, so wie sie ausgeliefert wird (Cloudflare Pages, *Build output directory* = `public`, kein Build-Befehl).
- `public/config.js` – **einzige Datei für den Betrieb**: Endpunkt der Bestellannahme, Bestellfenster, Vorschau-Modus, Versandregeln.
- `public/data.json` – Weinliste, erzeugt aus der Präsentationsliste. B2C-Preise lesbar, B2B-Nettopreise mit dem B2B-Code verschlüsselt.
- `tools/build_data.py` – erzeugt `data.json` aus der Excel-Liste (Blatt AMBASSADE).
- `tools/stamp.py` – setzt Version und Dateiliste im Service Worker. **Nach jeder Änderung an `public/` ausführen.**

## Weinliste aktualisieren
```
python3 tools/build_data.py Praesentation_Ambassade_Liste_….xlsx <B2B-Code>
python3 tools/stamp.py
git commit -am "Weinliste aktualisiert" && git push
```
Die Excel-Datei und der B2B-Code gehören **nicht** ins Repository.

## Regeln (wie Katalog und Formulare)
- Privilège Paulée –10 % ab der ersten Flasche, am 2.11.2026 bis 23:59 Uhr.
- a.A. / a.Z. digital nicht bestellbar (Hinweis „am Infotisch erfragen“). Sperre gilt je Preisansicht (128-4: B2B bestellbar, B2C a.A.).
- Versand B2C: frei ab 180 € (Listenpreis vor Privilège), sonst 8,90 € je angefangene 12 Fl. – B2B: frei ab 500 € netto, sonst 0,50 €/Fl., mind. 9,50 €. Abholung Berlin/Hamburg kostenfrei.
- Pflichtfelder B2C: Name, Anschrift, Telefon, E-Mail, Volljährigkeit, AGB. B2B: Firma, Ansprechpartner, E-Mail.

## Offline & Übertragung
Service Worker speichert alles beim ersten Öffnen. Bestellungen werden zuerst auf dem Gerät gespeichert (mit eindeutiger ID), dann gesendet; ohne Empfang automatische Wiederholung, zusätzlich Versand per E-Mail möglich. Die Bestellannahme verwirft doppelte IDs.
