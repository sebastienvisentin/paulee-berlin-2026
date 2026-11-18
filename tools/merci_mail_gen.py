import html as H
SANS="Inter,'Helvetica Neue',Helvetica,Arial,sans-serif"
LOGO="https://img.mailinblue.com/4714031/images/content_library/original/6ad9c042c57d77e51f6d850a.png"
FOOTLOGO="https://img.mailinblue.com/4714031/images/content_library/original/6ad9c4432078a6dd55b34f8a.png"
APP="https://paulee.weine-visentin.de"
COEUR=[("Domaine Ogereau","Savennières „La Saponaire“ 2024"),("Domaine de L'Écu","Granite 2024"),
 ("Domaine Camin-Larredya","Jurançon Sec „La Part Davant“ 2024"),("Domaine Bachelet-Monnot","Bourgogne Côte d'Or Blanc 2023"),
 ("Domaine du Gros Noré","Bandol Rosé 2025"),("Château de Montfaucon","Lirac „Baron Louis“ 2020"),
 ("Domaine Cosse-Maisonneuve","Cahors „Les Laquets“ 2021"),("Château de Saint Cosme","Gigondas 2020"),
 ("Domaine Élian Da Ros","Côtes du Marmandais „Clos Baquey“ 2020")]
T={
'de':dict(lang='de',subject='Merci – für einen besonderen Tag in der Botschaft',pre='Das Privilège Paulée noch einmal – vom 20. bis 22. November.',
 label='Merci Paulée &middot; 20. bis 22. November 2026',hello='Liebe Weinfreunde,',
 intro='zehn Jahre La Paulée de Berlin – und ein Tag, an dem Sie gemeinsam mit über 70 Winzern die Französische Botschaft mit Leben gefüllt haben. Für Ihren Besuch, Ihre Neugier und die vielen schönen Gespräche danken wir Ihnen von Herzen.',
 gesture='Als kleine Geste zum Jubiläum gilt das Privilège Paulée noch einmal – ausschließlich für die Gäste der Botschaft:',
 when='ab der ersten Flasche &middot; Freitag, 20., bis Sonntag, 22. November, 23:59 Uhr',
 also='Auch wenn Sie am 2. November bereits bestellt haben.',
 b2b='Für Gastronomie und Fachhandel gelten mit dem Code <strong style="color:#003B54;">PAULEE-PRO</strong> Ihre Nettopreise.',
 cta='Zur Weinliste',coeurH='Mes coups de cœur de la Paulée',coeurT='Neun Weine, die mich an diesem Tag besonders berührt haben:',coeurCta='Meine Coups de cœur ansehen',
 delivH='Lieferung und Abholung',deliv='Lieferung oder kostenfreie Abholung in Berlin und Hamburg bis zum 11. Dezember – rechtzeitig vor Weihnachten. Es gelten die Versandkonditionen vom 2. November. Ihre Bestellung bestätigen wir nach Prüfung der Verfügbarkeit.',
 askH='Eine Frage zum Schluss',ask='Was hat Ihnen gefallen – und was dürfen wir bei der nächsten Paulée besser machen? Antworten Sie einfach auf diese Mail. Wir freuen uns auf Ihre Rückmeldung.',
 bye='Herzlich',sign='Sébastien Visentin &amp; das Team von VISENTIN',unsub='Keine weiteren Nachrichten erhalten'),
'en':dict(lang='en',subject='Merci – for a special day at the embassy',pre='The Privilège Paulée once more – from 20 to 22 November.',
 label='Merci Paulée &middot; 20 to 22 November 2026',hello='Dear friends of wine,',
 intro='Ten years of La Paulée de Berlin – and a day on which you and more than 70 winemakers filled the French Embassy with life. For your visit, your curiosity and the many wonderful conversations, thank you from the bottom of our hearts.',
 gesture='As a small gesture for our anniversary, the Privilège Paulée applies once more – exclusively for the guests of the embassy:',
 when='from the first bottle &middot; Friday 20 to Sunday 22 November, 11:59 pm',
 also='Even if you already ordered on 2 November.',
 b2b='Restaurants and wine merchants see their net prices with the code <strong style="color:#003B54;">PAULEE-PRO</strong>.',
 cta='Open the wine list',coeurH='Mes coups de cœur de la Paulée',coeurT='Nine wines that particularly moved me on the day:',coeurCta='See my coups de cœur',
 delivH='Delivery and pick-up',deliv='Delivery, or free pick-up in Berlin and Hamburg, by 11 December – in good time for Christmas. Shipping terms as on 2 November. We confirm your order once we have checked availability.',
 askH='One last question',ask='What did you enjoy – and what could we do better at the next Paulée? Simply reply to this email. We look forward to hearing from you.',
 bye='Warm regards',sign='Sébastien Visentin &amp; the VISENTIN team',unsub='Unsubscribe'),
'fr':dict(lang='fr',subject='Merci – pour une journée particulière à l’Ambassade',pre='Le Privilège Paulée une nouvelle fois – du 20 au 22 novembre.',
 label='Merci Paulée &middot; 20 – 22 novembre 2026',hello='Chers amis du vin,',
 intro='Dix ans de La Paulée de Berlin – et une journée où, aux côtés de plus de 70 vignerons, vous avez fait vivre l’Ambassade de France. Merci du fond du cœur pour votre visite, votre curiosité et ces nombreux beaux échanges.',
 gesture='En petit geste pour cet anniversaire, le Privilège Paulée s’applique une nouvelle fois – exclusivement pour les invités de l’Ambassade :',
 when='dès la première bouteille &middot; du vendredi 20 au dimanche 22 novembre, 23 h 59',
 also='Même si vous avez déjà commandé le 2 novembre.',
 b2b='Pour la restauration et les cavistes, le code <strong style="color:#003B54;">PAULEE-PRO</strong> donne accès à vos prix nets.',
 cta='Voir la carte des vins',coeurH='Mes coups de cœur de la Paulée',coeurT='Neuf vins qui m’ont particulièrement touché ce jour-là :',coeurCta='Voir mes coups de cœur',
 delivH='Livraison et retrait',deliv='Livraison, ou retrait gratuit à Berlin et Hambourg, jusqu’au 11 décembre – à temps pour Noël. Conditions d’expédition identiques à celles du 2 novembre. Nous confirmons votre commande après vérification de la disponibilité.',
 askH='Une dernière question',ask='Qu’avez-vous aimé – et que pourrions-nous améliorer lors de la prochaine Paulée ? Répondez simplement à ce message. Nous nous réjouissons de votre retour.',
 bye='Bien chaleureusement',sign='Sébastien Visentin &amp; l’équipe VISENTIN',unsub='Ne plus recevoir de messages'),
}
def P(txt,style=''): return f'<p style="margin:0;{style}">{txt}</p>'
def build(L,b2b):
    t=T[L]; body=f"font-family:{SANS};font-size:16px;line-height:1.65;color:#2E2E2E;"
    sec=lambda h: f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-bottom:1px solid #DDD5C8;padding:0 0 10px;font-family:{SANS};"><p style="margin:0;font-size:15px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#003B54;">{h}</p></td></tr></table>'''
    btn=lambda txt,url,bg: f'''<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td align="center" bgcolor="{bg}" style="background-color:{bg};border-radius:3px;padding:18px 44px;"><a href="{url}" style="font-family:{SANS};font-size:14px;font-weight:600;letter-spacing:1.3px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">{txt}&nbsp;&nbsp;&rarr;</a></td></tr></table>'''
    coeur=''.join(f'<tr><td width="20" valign="top" style="padding:8px 0 0;"><p style="margin:0;color:#B8995A;">&bull;</p></td><td style="padding:8px 0 0;"><p style="margin:0;"><span style="font-weight:600;color:#003B54;">{H.escape(d)}</span> &middot; {H.escape(w)}</p></td></tr>' for d,w in COEUR)
    b2bline=f'<p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#2E2E2E;">{t["b2b"]}</p>' if b2b else ''
    return f'''<!DOCTYPE html>
<html lang="{t['lang']}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<title>{t['subject']}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>body,table,td,p,a{{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}}table{{border-collapse:collapse!important;}}img{{border:0;outline:none;text-decoration:none;display:block;-ms-interpolation-mode:bicubic;}}p{{margin:0;}}
@media screen and (max-width:620px){{.w{{width:100%!important;}}.px{{padding-left:26px!important;padding-right:26px!important;}}.hd{{padding:30px 24px 26px!important;}}.logo{{width:220px!important;}}}}</style>
</head>
<body style="margin:0;padding:0;background-color:#EBE7E0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">{t['pre']}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EBE7E0;"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="w" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#FFFFFF;">
<tr><td class="hd" align="center" bgcolor="#003B54" style="background-color:#003B54;padding:40px 40px 34px;border-bottom:2px solid #C9A961;">
<img class="logo" src="{LOGO}" width="290" alt="La Paulée de Berlin" style="width:290px;max-width:78%;height:auto;margin:0 auto;">
<p style="margin:18px 0 0;font-family:{SANS};font-size:12px;font-weight:500;letter-spacing:3px;text-transform:uppercase;color:#C9A961;">{t['label']}</p></td></tr>
<tr><td class="px" style="padding:42px 56px 0;{body}">
<p style="margin:0 0 18px;">{t['hello']}</p>{P(t['intro'])}</td></tr>
<tr><td class="px" style="padding:28px 56px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EBE7E0" style="background-color:#EBE7E0;"><tr><td style="padding:26px 26px;font-family:{SANS};line-height:1.6;">
<p style="margin:0 0 12px;font-size:15px;color:#2E2E2E;">{t['gesture']}</p>
<p style="margin:0;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#75232A;">Privilège Paulée</p>
<p style="margin:4px 0 0;font-size:30px;font-weight:600;color:#003B54;line-height:1.2;">&ndash;10&nbsp;%</p>
<p style="margin:6px 0 0;font-size:15px;color:#2E2E2E;">{t['when']}</p>
<p style="margin:10px 0 0;font-size:15px;color:#2E2E2E;font-style:italic;">{t['also']}</p>{b2bline}
</td></tr></table></td></tr>
<tr><td align="center" style="padding:34px 56px 6px;">{btn(t['cta'],APP,'#75232A')}</td></tr>
<tr><td class="px" style="padding:36px 56px 0;">{sec(t['coeurH'])}
<p style="margin:16px 0 0;{body}">{t['coeurT']}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:{SANS};font-size:15px;line-height:1.55;color:#2E2E2E;">{coeur}</table></td></tr>
<tr><td align="center" style="padding:26px 56px 0;">{btn(t['coeurCta'],APP+'/?coeur','#9C7A3C')}</td></tr>
<tr><td class="px" style="padding:38px 56px 0;">{sec(t['delivH'])}<p style="margin:16px 0 0;{body}">{t['deliv']}</p></td></tr>
<tr><td class="px" style="padding:30px 56px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:3px solid #75232A;padding:2px 0 2px 16px;{body}">
<p style="margin:0 0 4px;font-weight:600;color:#003B54;">{t['askH']}</p>{P(t['ask'])}</td></tr></table></td></tr>
<tr><td class="px" style="padding:34px 56px 46px;{body}"><p style="margin:0;">{t['bye']}<br><span style="color:#003B54;font-weight:600;">{t['sign']}</span></p></td></tr>
<tr><td align="center" bgcolor="#EBE7E0" style="background-color:#EBE7E0;padding:34px 56px 24px;"><img src="{FOOTLOGO}" width="190" alt="VISENTIN – Vins Français d'Exception" style="width:190px;max-width:62%;height:auto;margin:0 auto;"></td></tr>
<tr><td class="px" align="center" bgcolor="#EBE7E0" style="background-color:#EBE7E0;padding:0 56px 26px;font-family:{SANS};font-size:14px;line-height:1.75;color:#5A5A5A;">
<p style="margin:0;">Köpenicker Straße 18–20 &middot; 10997 Berlin</p>
<p style="margin:0;">+49 30 695 199 20 &middot; <a href="mailto:info@weine-visentin.de" style="color:#75232A;text-decoration:none;">info@weine-visentin.de</a></p>
<p style="margin:0;"><a href="https://www.weine-visentin.de" style="color:#75232A;text-decoration:none;">weine-visentin.de</a></p></td></tr>
<tr><td align="center" bgcolor="#EBE7E0" style="background-color:#EBE7E0;padding:0 56px 30px;font-family:{SANS};font-size:12px;line-height:1.6;color:#8A8A8A;">
<p style="margin:0;"><a href="{{{{ unsubscribe }}}}" style="color:#8A8A8A;text-decoration:underline;">{t['unsub']}</a></p></td></tr>
</table></td></tr></table></body></html>'''
for L in ('de','en','fr'):
    for b in (False,True):
        open(f'merci_{L}_{"b2b" if b else "b2c"}.html','w',encoding='utf-8').write(build(L,b))
print('ok')
