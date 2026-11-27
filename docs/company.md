---
description: >-
  Firmenverwaltung ohne IT-Kenntnisse: Mitarbeiter anlegen und sperren, gemeinsame Postfächer mit
  Rechten, Abwesenheit mit Vertretung, Firmen-Signatur, Austritt mit Übergabe, Umzug von
  Microsoft 365, Gmail, GMX, Outlook (PST) und Google-Export.
---

# Firmenverwaltung und Umzug

Unter *Einstellungen → Firma* verwaltet der Chef (oder die Büroleitung) die Firma selbst – ohne
Stalwarts Admin-Oberfläche und ohne IT-Kenntnisse.

## Mitarbeiter und Postfächer

- **Mitarbeiter anlegen** mit Startpasswort, Passwort und Anmeldung mit Code zurücksetzen,
  **Zugang sperren** (Mails kommen weiter an), weitere Adressen wie buchhaltung@.
- **Stalwart Community oder Enterprise:** Kontext läuft mit beiden. Unter *Mitarbeiter* steht,
  welche Ausgabe der Server hat; eine Enterprise-Lizenz erkennt Kontext von selbst
  ([Installation](installation.md#stalwart-enterprise)). Mit Lizenz steht darunter, wie viele
  Postfächer belegt sind (etwa „12 von 25 Postfächern belegt“, gemeinsame Postfächer zählen mit),
  bis wann sie gilt und für welche Domain; ab 90 % belegt oder 30 Tage vor dem Ende warnt sie.
- **Gemeinsame Postfächer** mit Rechten je Person: kein Zugriff, nur lesen, lesen und senden;
  eigene Regeln je Postfach.
- **Räume und Geräte** (*Einstellungen → Firma → Räume und Geräte*): Besprechungsräume,
  Firmenwagen oder Geräte als eigene Ressourcenkonten (`x:Account` mit `@type: "Resource"`) mit
  Art (Raum oder Gerät), Ort, Plätzen, Verwaltern und Buchungsregel – automatisch (optional mit
  Doppelbuchungen, Serienterminen, externen Einladungen, Vorlauf und Höchstdauer) oder von Hand.
- **Gesendete Mails ablegen** je gemeinsamem Postfach (im Dialog des Postfachs): *Nur im
  gemeinsamen Postfach* (Standard) – Entwurf und gesendete Mail liegen in dessen Ordnern, auch wenn
  jemand aus dem eigenen Postfach als diese Adresse schreibt; *Im gemeinsamen Postfach und beim
  Absender* – dazu eine gelesene Kopie im Gesendet-Ordner der Person, die schreibt; *Nur beim
  Absender* – wer aus dem eigenen Postfach als diese Adresse schreibt, behält Entwurf und gesendete
  Mail im eigenen Postfach, ohne „(Postfach)“ im Absendernamen. Wer im gemeinsamen Postfach selbst
  schreibt, sendet immer über das Postfach. [Mehr](mail.md#schreiben)
- **Abwesenheit für Kollegen** (etwa bei Krankheit) mit Vertretung in der Antwort.
- **Abwesenheitsvorlagen** unter *Einstellungen → Firma → Abwesenheitsvorlagen*: ein paar Texte
  mit Titel („Urlaub“, „Krank“), die jede Person für ihre Abwesenheitsnotiz auswählen kann, und die
  Firmenverwaltung bei „Abwesenheit eintragen“. `{Name}`, `{Bis}` und `{Vertretung}` setzt Kontext
  dabei ein; eine Zeile, deren Angabe fehlt (kein Enddatum, keine Vertretung), fällt weg. Zu Beginn
  gibt es keine.
- **Regeln für Mitarbeiter:** am Eintrag der Person *Regeln* – etwa „Mails vom Lieferanten in den
  Ordner Bestellungen“ für eine neue Kollegin. Es sind dieselben Regeln wie unter
  *Einstellungen → Regeln* der Person: Sie sieht die vom Chef angelegten dort wie ihre eigenen
  und kann sie ändern oder löschen; umgekehrt sieht der Chef ihre eigenen. „Auch auf die Mails
  anwenden“ wirkt auf ihren Posteingang. Nur wer die Firmenverwaltung öffnen darf, kommt an
  die Regeln anderer.

  ![Regeln von Anna Weber in der Firmenverwaltung: Mails vom Großhandel als gelesen, Notdienst markiert](screenshots/employee-rules.png)

- **Firmen-Signatur** für alle auf einmal, mit `[Name]` und `[E-Mail]` je Absender und
  `[Telefon]`, `[Mobil]`, `[Position]`, `[Abteilung]`: die trägt jede Person einmal unter
  *Einstellungen → Profil* ein („Angaben für die Signatur“), und ihre Signatur ist sofort
  aktualisiert. Eine Zeile, deren Angabe fehlt, fällt weg – niemand hat „Mobil:“ ohne Nummer.

  ![Angaben für die Signatur im Profil: Position, Abteilung, Telefon, Mobil](screenshots/signature-details.png)

- **Pflichtangaben** unter *Einstellungen → Firma → Pflichtangaben*: was unter jeder
  geschäftlichen Mail stehen muss – Firma mit Rechtsform, Sitz, Registergericht und
  Handelsregisternummer, Geschäftsführer, USt-IdNr. (§ 35a GmbHG, § 37a HGB). Einmal eingetragen,
  setzt Kontext den Text beim Senden unter jede Mail aller Mitarbeiter, auch aus gemeinsamen
  Postfächern, verschlüsselt und signiert; anders als die Signatur kann ihn niemand weglassen oder
  ändern. Nur Text, Zeilenumbrüche bleiben; leer (so ist es zu Beginn) fügt Kontext nichts an.
  Wer mit einem anderen Mailprogramm über IMAP und SMTP sendet (etwa am Handy), bekommt ihn nicht:
  dort kann Kontext nichts anfügen.
- **Austritt:** Zugang sperren, Postfach einer Kollegin übergeben, neue Mails weiterleiten und
  automatisch antworten – gelöscht wird nichts.
- **Konto löschen** am Eintrag der Person, nur mit Stalwart Enterprise: Der Dialog sagt, wie viele
  Tage es sich noch wiederherstellen lässt ([Gelöschte Konten](#geloschte-konten)), oder, solange
  keine Aufbewahrung eingestellt ist, dass es mit allen Mails, Kalendern, Kontakten und Dateien
  endgültig weg ist. Mit Stalwart Community gibt es kein Löschen, nur den Austritt: So ist dort
  nichts mit einem Klick verloren. Das eigene Konto lässt sich nicht löschen.
- **Verfügbarkeit im Kalender** für alle einschalten.
- **Team-Chat:** Aufbewahrungsfrist; **Telefonie:** Fritzbox, wer klingelt, Mailbox,
  Öffnungszeiten ([Telefonie](telephony.md)).
- **Externe Empfänger** (Hinweis „Extern“, aus bis zum Einschalten): Mails von außerhalb tragen
  die Marke „Extern“, und vor dem Senden oder Einladen nach außen fragt Kontext einmal nach
  ([Mail](mail.md#schreiben)). Als intern gelten die eigenen Domains und die **Partner-Domains**,
  die hier eingetragen werden (eine je Zeile, etwa das Steuerbüro).
- **Phishing melden** unter *Einstellungen → Firma → Sicherheit der Mails*: eine Adresse, etwa die
  der eigenen IT oder des IT-Dienstleisters. Ist sie eingetragen, steht bei jeder Mail unter
  „Weitere Aktionen“ **Als Phishing melden**: Kontext schickt die Mail als Anhang (.eml, mit allen
  Kopfzeilen) an diese Adresse, ohne Kopie unter „Gesendet“, und verschiebt sie in den Spam. Leer
  (so ist es zu Beginn) gibt es den Punkt nicht.
- **Abmelden nach Inaktivität** unter *Einstellungen → Firma → Abmelden nach Inaktivität*: für
  Rechner, die mehrere nutzen (Empfang, Anmeldung). Die Firmenverwaltung wählt eine Zeit – aus
  (so ist es zu Beginn), 15 oder 30 Minuten, 1, 4 oder 8 Stunden. Hat so lange niemand die Maus
  bewegt, geklickt oder getippt, fragt Kontext „Angemeldet bleiben?“ und zählt eine Minute
  herunter (bei kurzen Zeiten höchstens die Hälfte). Mausbewegen beantwortet die Frage nicht, nur
  „Angemeldet bleiben“ (oder Schließen). Ohne Antwort speichert Kontext angefangene Mails als
  Entwurf und meldet ab, zurück zur Anmeldung. Eine Eingabe in einem Tab zählt für alle Tabs im
  selben Browser, ein laufender Anruf ebenso; war der Browser länger zu, als die Zeit erlaubt,
  meldet Kontext beim nächsten Öffnen gleich ab. Wer nur in *Dokumente* schreibt, wird ebenfalls
  gefragt: Eingaben in deren eigenem Rahmen sieht Kontext nicht. Gilt für die Web-App;
  Mailprogramme über IMAP und Kalender-Apps über CalDAV bleiben angemeldet.

  ![„Angemeldet bleiben?“ mit Countdown über dem Posteingang](screenshots/idle-logout.png)

- **S/MIME-Stellen** unter *Einstellungen → Firma → S/MIME-Stellen*: Zertifikate von Stellen,
  denen die Firma bei S/MIME vertraut, zusätzlich zu Mozillas Liste – etwa die Wurzel einer
  Landesverwaltung oder einer Kammer (.cer, .crt, .pem). Jede steht mit Name, Aussteller,
  Gültigkeit und Fingerabdruck da und lässt sich wieder entfernen
  ([Verschlüsselung](encryption.md#baustein-4-vertraulich-senden-fur-alle-empfanger)).
- **Sicherheit prüfen:** SPF, DMARC, MTA-STS, TLS-RPT, DANE und HTTPS der eigenen Domain
  ([Verschlüsselung](encryption.md#baustein-1-grundschutz-unsichtbar-fur-alles)).
- **Beim Versand verschlüsseln** unter *Einstellungen → Firma → Sicherheit der Mails*: ein
  Schalter, mit dem Stalwart Mails an Empfänger außerhalb der Firma selbst verschlüsselt, wenn es
  deren Schlüssel kennt, und die Liste dieser Schlüssel – eingefügt, von Stalwart gesucht (Web Key
  Directory, keys.openpgp.org) oder aus empfangenen Mails gelernt; jeder lässt sich entfernen
  ([Verschlüsselung](encryption.md#verschlusseln-durch-stalwart)).
- **Outlook und Handy-Apps (Exchange, Beta)** unter *Einstellungen → Firma → Sicherheit der Mails*:
  schaltet Exchange und ActiveSync in Stalwart ein (`x:Exchange.enable`), damit Outlook, iPhone und
  Android Mail, Kalender und Kontakte direkt synchronisieren können
  ([App](app.md#profil-passwort-und-anmeldung-mit-code), [Installation](installation.md#stalwart-121)).
- **KI-Spamfilter** unter *Einstellungen → Firma → Sicherheit der Mails* (nur mit Stalwart
  Enterprise; mit Community steht dort nur ein Hinweis): Anbieter (Anthropic, OpenAI, Google
  Gemini oder ein eigener Ollama-Server), Modell, API-Schlüssel – oder der des Assistenten im Chat
  – und ob das Urteil in der Spam-Bewertung zählt oder nur beobachtet wird. Stalwart fragt das
  Modell bei den Mails, bei denen sein Filter unsicher ist; das Urteil zeigt Kontext beim Lesen
  ([Mail](mail.md#sicherheit)). Was dabei an den Anbieter geht, steht unter
  [Installation → KI-Spamfilter](installation.md#ki-spamfilter).
- **Datensicherung:** wohin gesichert wird, wie der letzte Lauf ausging, wie voll der Speicher
  ist, die Uhrzeit der nächtlichen Sicherung und „Jetzt sichern“, dazu das Protokoll. Dafür
  müssen auf dem Server die Units eingerichtet sein
  ([Installation → Backups](installation.md#5-backups)); sonst steht dort „Steuerung auf dem
  Server nicht eingerichtet“.
- **Serverzustand** (nur mit Stalwart Enterprise) unter *Einstellungen → Firma → Serverzustand*:
  für die letzten 24 Stunden oder 7 Tage, wie viele Mails ankamen, als Spam einsortiert,
  verschickt oder unzustellbar wurden, dazu ein kleines Diagramm je Stunde oder Tag,
  fehlgeschlagene Anmeldungen (und wie viele Adressen Stalwart deshalb gesperrt hat), was in der
  Warteschlange wartet und wie viel Speicher die Postfächer belegen. Darunter die
  **Zustellprobleme**: Mails an Empfänger außerhalb, die nicht ankamen, mit der Antwort des
  fremden Servers („550 5.1.1 User unknown“) und ob Stalwart aufgegeben hat oder es noch einmal
  versucht. Stalwart muss dafür Kennzahlen und Zustellungen aufzeichnen
  ([Installation](installation.md#serverzustand)); mit Community fehlt der Eintrag.
- **Logo und Vorlagen** (nur mit Stalwart Enterprise) unter *Einstellungen → Firma → Logo und
  Vorlagen*: Stalwart verschickt einige Mails selbst – die **Erinnerung per Mail** an einen Termin
  und Mails zu Einladungen, wenn jemand am Handy oder in einem Kalenderprogramm (CalDAV) einlädt oder im Kalender antwortet. Dort steht
  dann das **Firmenlogo** statt Stalwarts Logo (PNG, JPEG, GIF, WebP, ICO oder SVG bis 1 MB; PNG
  zeigen alle Mailprogramme), und beide Mails lassen sich mit einer **eigenen HTML-Vorlage**
  gestalten. Ohne eigene Vorlage nimmt Stalwart seine eingebaute; der Editor beginnt dann mit
  Kontexts Vorlage im Stil der App, auf Deutsch oder Englisch (das betrifft nur feste Texte wie den
  Hinweis unter der Erinnerung – die übrigen Texte setzt Stalwart in der Sprache des Empfängers
  ein). Kontext prüft die Vorlage so, wie Stalwart sie liest, und zeigt sie mit einem
  Beispieltermin, bevor sie gilt; „Stalwarts Vorlage verwenden“ löscht die eigene wieder. Mit
  Community fehlt der Eintrag ([wie es funktioniert](architecture.md#logo-und-vorlagen)).
- **Gelöschte Elemente** (nur mit Stalwart Enterprise): unter *Datensicherung* stellt die
  Firmenverwaltung ein, wie viele Tage Stalwart endgültig Gelöschtes aufhebt – 0 (so ist es zu
  Beginn) hebt nichts auf; die Dauer gilt für das, was ab dann gelöscht wird. So lange holt jede
  Person ihre Mails unter *Einstellungen → Gelöschte Elemente* selbst zurück
  ([Mail](mail.md#ordnen-und-finden)). Am Eintrag eines Mitarbeiters und an jedem gemeinsamen
  Postfach öffnet **Gelöschte Elemente** dieselbe Liste für dieses Konto: wiederherstellen (in
  den Posteingang) oder endgültig löschen. Der Kontext-Server braucht dafür die Rechte
  `sysArchivedItem…` und `sysDataRetention…`, die der
  [Einrichtungsbefehl](installation.md#einrichtungsbefehl) vergibt. Mit der Community-Ausgabe
  gibt es beides nicht.

### Gelöschte Konten { #geloschte-konten }

Nur mit Stalwart Enterprise ([Installation](installation.md#stalwart-enterprise)); mit Community
fehlt der Abschnitt. Mit einer Lizenz hebt Stalwart ein gelöschtes Konto eine Zeit lang auf, samt
Mails, Kalendern und Dateien, und löscht es erst danach endgültig. Unter *Mitarbeiter →
Gelöschte Konten* stehen:

- **Aufbewahren für (Tage):** wie lange Stalwart gelöschte Konten aufhebt (in Stalwart
  `archiveDeletedAccountsFor` unter *Data Retention*). Zu Beginn 0: Auch mit Lizenz löscht
  Stalwart dann sofort endgültig. Eine neue Zeit gilt für Konten, die danach gelöscht werden.
- **die Konten, die noch da sind**, mit Adresse, wann gelöscht und wann endgültig weg – auch in
  Stalwarts Oberfläche gelöschte, wenn sie zu den Domains der Firma gehören, und gemeinsame
  Postfächer.
- **Wiederherstellen:** Das Konto ist wieder da, mit seinen Mails, Kalendern, Kontakten und
  Dateien. Stalwart legt es nur mit Name und Domain neu an; Kontext gibt einer Person ein neues
  Passwort (einmal angezeigt) und ihre gemeinsamen Postfächer zurück, soweit es sie noch gibt.
  Den Namen, weitere Adressen, das Recht für die Firmenverwaltung und einen gesperrten Zugang
  trägt die Firmenverwaltung danach neu ein; Ordner, die die Person freigegeben hatte, gibt sie
  neu frei.

## Anmeldung über Firmenkonto (SSO) { #sso }

Nur mit [Stalwart Enterprise](installation.md#stalwart-enterprise); in der Community-Ausgabe fehlt
der Eintrag. Unter *Einstellungen → Firma → Anmeldung über Firmenkonto (SSO)* melden sich die
Mitarbeiter einer Domain mit dem Konto der Firma an – Microsoft Entra ID, Google Workspace,
Keycloak oder ein anderer OpenID-Connect-Anbieter – statt mit einem Passwort für Kontext. Die
Schritte für Entra ID stehen in der [Installation](installation.md#sso-entra-id).

- **Anbieter:** Aussteller-URL, Client-ID und -Secret der App, die beim Anbieter für Kontext
  registriert ist (mit der angezeigten Weiterleitungs-URL), die Scopes, die Zielgruppe der Tokens
  (`aud`, leer heißt Client-ID) und welche Ansprüche Adresse, Name und Gruppen tragen. Bei
  Anbietern, deren Zugriffstokens keine JWTs sind (Google), „Beim Anbieter nachfragen
  (UserInfo)“ wählen. **Verbindung testen** prüft, ob der Anbieter antwortet und ob Stalwart die
  Anmeldung für jede Domain zu ihm schickt.
- **Domains:** je Domain *Anmeldung über Firmenkonto* und *Konten über SCIM*. Mit dem Firmenkonto
  nimmt Stalwart für die Domain **keine Passwörter mehr an** – auch nicht in Mailprogrammen; dort
  gelten App-Passwörter, die bei Stalwart weiter vor dem Verzeichnis geprüft werden. Wer sich zum
  ersten Mal anmeldet, bekommt sein Konto von selbst, es sei denn, SCIM ist an.
- **Anmelden:** Auf der Anmeldeseite die Adresse eingeben; gehört sie zu einer solchen Domain,
  verschwindet das Passwortfeld und **Weiter mit Firmenkonto** führt zum Anbieter und zurück.
- **Konten über SCIM:** Der Anbieter legt die Konten selbst an, ändert Namen und Adressen und
  sperrt Ausgeschiedene. Die Karte zeigt den **SCIM-Endpunkt** (`https://<Kontext>/scim/v2`) und
  erzeugt das **Token** dafür, das nur einmal angezeigt wird; ein neues ersetzt das alte. In der
  Mitarbeiterliste tragen diese Konten die Marke **SCIM**; Name, Adressen und Sperre sind dort
  nicht änderbar, weil der nächste Abgleich sie zurücksetzen würde. Bei Konten mit Firmenkonto
  fehlt „Passwort zurücksetzen“. Löschen über SCIM geht, weil der Einrichtungsbefehl der Rolle
  `Kontext-Server` das Recht `sysAccountDestroy` gibt; auf einem älteren Server erst, nachdem er
  noch einmal gelaufen ist, bis dahin sperrt der Anbieter nur.
- **Anbieter entfernen** gibt die Domains frei; wer nur das Firmenkonto hatte, braucht dann ein
  Passwort (*Passwort zurücksetzen*).

## Umzug nach Kontext

Unter *Einstellungen → Firma → Umzug* holt der Chef die Daten eines Mitarbeiters aus dem alten
System; ein Umzug lässt sich gefahrlos wiederholen, Doppeltes wird übersprungen.

| Von | Wie | Was kommt mit |
| --- | --- | --- |
| **Gmail, GMX, WEB.DE, Telekom, IONOS, STRATO, eigener Server** | IMAP mit (App-)Passwort, abgeglichen alle 15 Minuten bis zum Abschluss | Mails mit Ordnern bzw. Labels und Schlagworten |
| **Microsoft 365** | eine App im Microsoft-Konto der Firma (Graph) | Mails mit Ordnern und Outlook-Kategorien, Kontakte, Termine und Serien |
| **Outlook (PST-Datei)** | hochladen | Mails, Kontakte, Termine |
| **Google-Export** | vCard und iCalendar hochladen | Kontakte und Kalender |

Wer seine alte Adresse dauerhaft behalten will, verbindet sie als
[weiteres Postfach](mail.md#weitere-postfacher-gmail-gmx-webde-co).

Einrichtung: [Installation → Firmenverwaltung einschalten](installation.md#firmenverwaltung-einschalten)
und [Umzug](installation.md#umzug). Technik: [Architektur → Firmenverwaltung](architecture.md#firmenverwaltung)
und [Umzug](architecture.md#umzug).
