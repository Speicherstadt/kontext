# Plan: Funktionen aus Stalwart 1.2 in Kontext

Arbeitsplan für Agenten. Seit #331 läuft Kontext auf Stalwart 1.2.1. Hier stehen die Funktionen aus
1.2, die Kontext noch nicht nutzt, nach Nutzen und Aufwand geordnet. Jeder Abschnitt wird ein
eigener Pull Request, in dieser Reihenfolge. Vor dem Start AGENTS.md lesen, danach die
Doku-Seiten, die genannt sind. Die Quellen sind Stalwart `v1.2.1` (`git clone --depth 1 --branch
v1.2.1 https://github.com/stalwartlabs/stalwart`). Jede Angabe zu Stalwart hier ist in diesen
Quellen nachzuprüfen, bevor Code darauf baut.

| # | Funktion | Nutzen für Anwender | Aufwand |
| --- | --- | --- | --- |
| 1 | Arbeitszeiten | mittel: „Wer hat Zeit?“ schlägt nichts außerhalb der Arbeitszeit vor, Teilzeit wird sichtbar | klein bis mittel |
| 2 | Exchange und ActiveSync | hoch: Outlook für Windows und die Mail-Apps am Handy mit Mail, Kalender und Kontakten ohne Zusatz-App | mittel, schwer zu testen |
| 3 | Räume und Geräte | mittel bis hoch für Firmen mit gemeinsamen Räumen oder Fahrzeugen | groß |
| 4 | Lesebestätigungen über JMAP | gering, für Anwender ändert sich nichts | klein |

Wenn eine Funktion fertig ist, ihre Zeile in der Tabelle „Neu in Stalwart“ der `ROADMAP.md`
entfernen, ins `CHANGELOG.md` unter „Unreleased“ eintragen und `README.md` nachziehen, wenn
Anwender sie sehen. Zuletzt diesen Abschnitt hier löschen. Ist der letzte Abschnitt erledigt,
wird die ganze Datei gelöscht.

## 1. Arbeitszeiten

**Ziel:** Jede Person pflegt ihre Arbeitszeiten (Tage und Uhrzeiten, auch mehrere Blöcke pro Tag)
in Kontext. Kollegen sehen die Zeit außerhalb als „nicht verfügbar“, und „Wer hat Zeit?“ schlägt
dort keine Termine vor.

**Stalwart:**

- Objekt `x:CalendarSettings`, ein Singleton je Konto, gelesen im eigenen Konto mit
  `x:CalendarSettings/get { ids: ["singleton"] }` und geschrieben mit `/set { update: { singleton:
  … } }`. Es lässt sich nicht anlegen oder löschen
  (`crates/jmap/src/registry/mapping/calendar_settings.rs`).
- Feld `workingHours`:
  - `{ enable, timeZone, slots: [{ days: { mon: true, … }, start: "08:00:00", end: "16:00:00" }] }`
  - Quelle: `WorkingHours` und `WorkingHoursSlot` in `crates/registry/src/schema/structs.rs`.
  - Die Schreibweise von Wochentagen und Uhrzeiten (`Weekday`, `LocalTime`) steht in `enums.rs`
    und `jmap` und muss dort nachgesehen werden.
- Stalwart meldet die Zeit außerhalb in `Principal/getAvailability` als `busyStatus: "unavailable"`
  (`crates/groupware/src/calendar/availability.rs`, `BusyLevel::Unavailable`). Kontext kennt
  `unavailable` schon (`src/lib/availability.ts`).
- Rechte: `sysCalendarSettingsGet` und `sysCalendarSettingsUpdate` in der Rolle *User*.
  - Ein Server, der vor 1.2 eingerichtet wurde, hat sie erst nach
    `STALWART_UPDATE_ROLE_PERMISSIONS=true` (docs/installation.md, „Stalwart 1.2.1“).
  - Fehlen die Rechte, die Karte ausblenden und einen Hinweis zeigen, wie bei den Passkeys:
    `passkeyRightsMessage`/`checkPasskeyRights` in `server/stalwart-setup.ts` als Vorbild für eine
    Prüfung im Einrichtungsbefehl.

**Kontext heute:**

- `src/features/settings/work-hours-card.tsx`, `src/features/calendar/work-hours-setting.ts` und
  `src/lib/work-hours.ts` speichern pro Gerät nur, ab wann der Kalender den Tag zeigt und was er
  schattiert.
- Verfügbarkeit: `src/jmap/availability.ts`, `src/features/calendar/availability-*.tsx` und
  `use-planning.ts`.

**Schritte:**

1. Reine Funktionen in `src/lib/working-hours.ts`: Stalwarts `workingHours` in eine Form fürs
   Formular umwandeln und zurück. Tests mit Vitest daneben.
2. JMAP-Zugriff in `src/jmap/calendar-settings.ts`: lesen und schreiben, mit Test gegen einen
   Fake-Client wie in `src/jmap/contacts.test.ts`.
3. Die Karte in den Einstellungen zeigt, an welchen Tagen und von wann bis wann gearbeitet wird,
   auch mehrere Blöcke pro Tag, sowie die Zeitzone. Vorschlag: die bestehende Karte „Arbeitszeit
   im Kalender“ ablösen und ihren Wert aus den Arbeitszeiten ableiten, statt zwei Einstellungen zu
   führen. Das vorher mit dem Maintainer klären.
4. Verfügbarkeit: `unavailable` in Zeitleiste und Vorschlägen anders darstellen als „belegt“, zum
   Beispiel schraffiert mit dem Text „außerhalb der Arbeitszeit“. „Wer hat Zeit?“ schlägt dort
   keine Zeiten vor.
5. Firmenverwaltung (optional, eigener Schritt): Arbeitszeiten eines Mitarbeiters setzen. Der
   Server schreibt dabei im Konto des Mitarbeiters, wie bei der Abwesenheit
   (docs/architecture.md, „Für Ordner, Abwesenheit …“).
6. Texte in `messages/de.json` und `messages/en.json`. Doku: docs/calendar-contacts.md und
   docs/architecture.md, Abschnitt „Verfügbarkeit“.
7. E2E (`e2e/availability.spec.ts`): Anna arbeitet nur vormittags, Jonas lädt sie für 15 Uhr ein
   und sieht „außerhalb der Arbeitszeit“.

**Erledigt, wenn:** die Arbeitszeiten über ein Neuladen und ein anderes Gerät erhalten bleiben,
Kollegen sie in der Verfügbarkeit sehen, und ohne die Rechte ein verständlicher Hinweis erscheint.

## 2. Exchange und ActiveSync

**Ziel:** In Outlook für Windows und Mac, iOS Mail und Kalender, Android (Gmail-App, Samsung) und
Outlook fürs Handy trägt man nur Adresse und App-Passwort ein. Mail, Kalender und Kontakte
synchronisieren dann mit Push. Das wird als Beta freigeschaltet.

**Stalwart:**

- Objekt `x:Exchange` (Singleton): `enable` (Standard aus), `ewsVersion`, `maxRequestSize`,
  `maxDevices`, `maxHeartbeat` und `maxObjectSize` (`structs.rs`). Rechte `sysExchangeGet` und
  `sysExchangeUpdate`. Wirksam vermutlich erst nach `ReloadSettings`, das in den Quellen prüfen.
- Protokolle: EWS, MAPI über HTTP, ActiveSync 14.1 und 16.1 sowie Autodiscover (POX, SOAP, JSON
  v2). Nur Basic und OAuth, kein NTLM und kein Kerberos.
- Die URL-Pfade stehen in `crates/http/src/request.rs`. Autodiscover ist bestätigt; EWS
  (`/EWS/…`), MAPI (`/mapi/…`) und `/Microsoft-Server-ActiveSync` dort nachsehen.

**Kontext heute:**

- Caddy leitet schon `/autodiscover/*`, `/.well-known/*`, `/dav/*` und andere Pfade an Stalwart
  weiter (`deploy/Caddyfile`, Matcher `@stalwart`).
- App-Passwörter gibt es schon (`src/features/settings/app-passwords-*`). Mit Zwei-Faktor sind sie
  der Weg für Basic Auth.
- Die Anleitungen für andere Apps stehen in `src/features/settings/sync-section.tsx`.

**Schritte:**

1. Caddy: die Pfade für EWS, MAPI und ActiveSync zum Matcher `@stalwart` hinzufügen. Compose und
   Quadlet nutzen dieselbe `deploy/Caddyfile`. Die Grenzen für Body-Größe
   und Timeouts für ActiveSync-Ping (lange Verbindungen bis `maxHeartbeat`) prüfen.
2. Firmenverwaltung: ein Schalter „Outlook und Handy-Apps (Exchange, Beta)“, der `x:Exchange.enable`
   setzt und neu lädt. Vorbild: andere Schalter mit `ReloadSettings` in `server/company/`. Die
   Rechte zu `server/stalwart-rights.ts` hinzufügen, optional wie bei `GATEWAY_RIGHTS`, damit
   alte Rollen nicht brechen.
3. Einstellungen → Synchronisieren: je eine Anleitung für Outlook (Windows, Mac), iPhone und
   Android, mit dem Hinweis auf das App-Passwort. Nur zeigen, wenn Exchange an ist.
4. Mit echten Clients prüfen, mindestens Outlook für Windows (EWS oder MAPI) und iOS
   (ActiveSync). Das Ergebnis im Pull Request festhalten, denn in der CI geht das nicht. Unit- und
   E2E-Tests nur für Schalter und Anleitung.
5. Doku: docs/app.md (Anleitung), docs/installation.md (Caddy, DNS: `autodiscover.<domain>` oder
   SRV `_autodiscover._tcp`) und docs/architecture.md (wie Exchange neben JMAP auf dieselben
   Daten zugreift).
6. Klären und festhalten: Wie verhalten sich die Regeln von Kontext (Sieve, `server/rules/`),
   wenn Outlook eigene Regeln anlegt? Laut Stalwart landen sie als `x:MailRule` im Skript
   `managed`, das Kontexts Regel-Skript einbindet (`server/rules/filters.ts`). Mit einem echten
   Client prüfen, dass beide nebeneinander laufen.

**Erledigt, wenn:** Outlook für Windows und ein iPhone mit eingeschaltetem Exchange Mail, Kalender
und Kontakte zeigen und ändern, und ein ausgeschaltetes Exchange keinen der Pfade beantwortet.

## 3. Räume und Geräte

**Ziel:** Die Firmenverwaltung legt Räume und Geräte an (Besprechungsraum, Transporter, Beamer).
Im Termin lädt man sie wie eine Person ein, und Stalwart sagt zu oder lehnt eine Doppelbuchung ab.

**Stalwart:**

- `x:Account` mit `@type: "Resource"` (`ResourceAccount` in `structs.rs`). Felder:
  - `name`, `domainId`, `description`
  - `kind`: `Room` oder `Equipment` (in JSON die Schreibweise in `enums.rs` nachsehen)
  - `capacity`, `location`, `delegateIds`
  - `booking`: entweder `{ "@type": "Automatic", allowConflicts, allowRecurring, allowExternal,
    bookingWindow, maxDuration }` oder `{ "@type": "Manual" }`
- Die Zusage per iTIP schickt Stalwart selbst (`crates/groupware/src/scheduling/`). Die Verwalter
  in `delegateIds` verwalten den Kalender der Ressource.

**Kontext heute:**

- Konten legt `server/company/accounts.ts` an (`x:Account/set`), gemeinsame Postfächer
  `server/company/mailstore.ts` und `mailboxes-section.tsx`.
- Den Termin-Editor bilden `src/features/calendar/event-editor.tsx` und die Teilnehmer.
- In `ROADMAP.md` steht die Idee „Räume, Firmenwagen und Geräte buchen“.

**Schritte:**

1. Server: Ressourcen auflisten, anlegen, ändern und löschen über `x:Account` mit
   `@type: Resource`. Eine reine Funktion für den Plan wie in `server/stalwart-setup.ts`. Tests.
2. Firmenverwaltung: Abschnitt „Räume und Geräte“ mit Name, Art, Ort, Plätzen, Buchungsregel
   (automatisch mit Optionen oder von Hand) und Verwaltern.
3. Termin-Editor: Ressourcen getrennt von Personen vorschlagen (Feld „Raum“). Als Teilnehmer mit
   `kind: "resource"` oder `"location"` nach JSCalendar RFC 8984 §4.4.6 eintragen und die
   Verfügbarkeit des Raums zeigen (`Principal/getAvailability` geht auch für Ressourcen; prüfen).
4. Antwort zeigen: zugesagt, abgelehnt oder offen, wie bei Personen.
5. Kalenderansicht: die Kalender der Räume einblenden, für die man Verwalter ist oder die
   freigegeben sind.
6. Doku: docs/company.md, docs/calendar-contacts.md, docs/architecture.md. E2E: Raum anlegen, zwei
   Termine zur selben Zeit, der zweite wird abgelehnt.

**Erledigt, wenn:** eine Doppelbuchung bei automatischer Buchung abgelehnt wird und das im Termin
zu sehen ist.

## 4. Lesebestätigungen über JMAP

**Ziel:** Kontext baut Lesebestätigungen nicht mehr selbst, Stalwart übernimmt das Format
(RFC 9007). Für Anwender ändert sich nichts.

**Stalwart:** `MDN/send` und `MDN/parse`, Capability `urn:ietf:params:jmap:mdn`
(`crates/jmap-proto/src/request/capability.rs`; die Methoden unter `crates/jmap/src/`).

**Kontext heute:** `src/lib/mdn.ts`, `src/jmap/receipts.ts` und `src/features/mail/receipts.tsx`;
docs/architecture.md, „Lesebestätigung“.

**Schritte:**

1. Senden über `MDN/send` (mit `onSuccessUpdateEmail`, um `$MDNSent` zu setzen), Lesen
   eingehender Bestätigungen über `MDN/parse`.
2. Den Eigenbau löschen, soweit Stalwart ihn ersetzt. Das Verhalten bleibt gleich, die
   bestehenden E2E-Tests müssen ohne Änderung grün bleiben.
3. Prüfen, ob die Kopie in „Gesendet“ und die Absender-Adresse wie bisher sind (docs/architecture.md
   nennt das Verhalten).

**Erledigt, wenn:** dieselben Tests grün sind und weniger eigener Code da ist.
