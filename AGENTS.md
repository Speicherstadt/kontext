# Hinweise für Coding-Agenten

Kontext: Web-App und kleiner Bun-Server vor dem Mailserver Stalwart (Mail, Kalender, Kontakte, Chat). App in `src/`,
Server in `server/` (Bun, Hono, Better Auth, Drizzle auf SQLite), lokale Umgebung in `dev/`.

Die Regeln stehen einmal: Beitragen in [`docs/mitwirken.md`](docs/mitwirken.md), Bauen in
[`docs/development.md`](docs/development.md), beides auf Deutsch, für Menschen und Agenten. Diese Datei sagt, wo was
steht und was nie passieren darf. Sie gilt für jeden Agenten; `CLAUDE.md` verweist nur hierher.

## Doku

Die Doku liegt in `docs/` (<https://kontext.email/>). Vor dem Start die Seiten lesen, die die Änderung berühren:
`architecture.md` für das Zusammenspiel, `development.md` für den lokalen Stalwart, die Testdaten und die Tests,
`installation.md` für einen Kundenserver. Links in README und Doku zeigen auf die Website, nicht auf `docs/*.md`.

## Skills

Die Schritte für wiederkehrende Aufgaben stehen in [`.agents/skills`](.agents/skills); jeder Agent folgt denselben
Dateien. Aus der [Werkbank](https://github.com/Speicherstadt/werkbank) (gleich in allen Projekten, Änderungen dort):
`beitrag` (Branch, Commits, Pull Request als Entwurf, dann Selbstprüfung und Review), `beitrag-pruefen` (gewollt,
Quellen, einfachste Lösung, Regeln), `tdd-review` (unabhängiges Review, ein Befund braucht einen fehlschlagenden
Test), `doku-pruefen` (Review des Markdowns), `fork-pushen` (Push auf den Fork einer anderen Person),
`prs-abarbeiten` (alle offenen Pull Requests, vom einfachsten Merge an), `issue-schreiben`, `board-pflegen` (das
Board auf GitHub) und `release`. Aus diesem Projekt: `checks` (alle Prüfungen).

## Referenzimplementierungen

Details stützen sich auf die Quellen, nicht auf das Gedächtnis. Flach (`git clone --depth 1`) in ein temporäres
Verzeichnis klonen und die Quelldatei in Kommentaren und Commit-Nachrichten nennen, wo sie ein Detail entscheidet:

- **Stalwart** (`stalwartlabs/stalwart`, Tag aus `STALWART_VERSION` in `dev/config.ts`): die Verwaltungsobjekte
  (`crates/registry/src/schema/structs.rs`, als `x:<Object>/get|set`), der Bootstrap
  (`crates/store/src/registry/local.rs`, `UPGRADING/v0_16.md`), die JMAP-Methoden
  (`crates/jmap-proto/src/request/method.rs`).
- **JMAP**: RFC 8620 (Kern, Push), RFC 8621 (Mail), draft-ietf-jmap-calendars und draft-ietf-jmap-contacts;
  JSCalendar RFC 8984, JSContact RFC 9553.
- **Mockups**: die Design-Fläche „Mail UI Mockup“ (claude.ai-Artefakt) ist das Vorbild für das Aussehen: zinc-Tokens,
  Geist, Leiste + Seitenleiste + Liste + Ansicht, kompakt, die Handy-Ansichten mit Tab-Leiste.

## Nie

- Auf `main` pushen (Ausnahme: Reparatur eines roten `main` durch oder auf Anweisung des Maintainers), Commits von
  Beitragenden umschreiben, mergen (nur Maintainer oder Collaborator mit dessen Zustimmung), eigenen Code reviewen.
- Einen Test überspringen, abschwächen oder löschen, um grün zu werden; einen übersprungenen Test als bestanden melden.
- Issues und Pull Requests ohne Auftrag anlegen oder kommentieren.
- Eine Abhängigkeit hinzufügen, ohne zuerst eigenen Code zu versuchen und den Grund je Paket unter
  „## Neue Abhängigkeiten“ im Pull Request zu nennen.
- Befehle als root (`sudo`, `pkexec`) ausführen oder umgehen; die führt die Nutzerin oder der Nutzer aus. Laufende
  Prozesse von ihnen stoppen; für Tests andere Ports nehmen (Skill `checks`).
- Dem Browser mehr als ein httpOnly-Cookie geben: Den Token von Stalwart hält nur der Server.

## Bei jeder Änderung

Mitziehen, was die Änderung berührt, im selben Pull Request, und nur das:

- die Tests (Vitest neben dem Code für reine Logik, Playwright in `e2e/` für das, was jemand tut, Desktop und
  `@phone`); ein Fehler beginnt mit einem roten Test;
- die Seiten in `docs/`, die es beschreiben (nur Deutsch);
- `README.md` (nur Deutsch), wenn eine Funktion, die Nutzer sehen, dazukommt, sich ändert oder wegfällt;
- nach einer Änderung am Aussehen die Screenshots: **Actions → Update screenshots → Run workflow** (oder
  `bun run screenshots`), dann die neuen Bilder ansehen.

Dazu: jede berührte Datei sauberer hinterlassen und unter „Aufgeräumt“ nennen; Issues mit `Umgesetzt #…` oder
`Refs #…`, nie `Closes`/`Fixes`; Prüfungen grün vor jedem Push (Skill `checks`), übersprungene nennen, danach die CI
prüfen; die Beschreibung des Pull Requests wird die Squash-Nachricht und wird bei jedem Push nachgezogen, der etwas
daran ändert; vor dem Merge ein unabhängiges Review durch einen eigenen Agenten (`tdd-review` für Code,
`doku-pruefen` für Markdown). Jeder Commit trägt `Signed-off-by:` (`git commit -s`, siehe `CONTRIBUTING.md`).

## Arbeitsweise

- Deutsch für Kommentare, Doku, Commits, Pull Requests und alles, was Nutzer lesen; Bezeichner englisch. Ältere
  Kommentare und Commits sind englisch; was man anfasst, darf deutsch werden. `README.md`, `ROADMAP.md` und `docs/`
  nur Deutsch. Die App auf Deutsch und Englisch: Texte in `messages/de.json` und `messages/en.json` über Paraglide
  (`m.*`), ein neuer Text in beide; Datum und Zahlen über `LOCALE` (`src/lib/locale.ts`).
- Technik nach `tech-stack.md` in firsttris/workflows; Bun ist Laufzeit und Paketmanager (Node nur im Playwright-Image).
- Clean Code, funktional: klare Namen, kleine Funktionen, die eine Sache tun, Abhängigkeiten werden übergeben, keine
  Doppelungen, kein toter Code, Kommentare sagen warum. SOLID und Entwurfsmuster als Funktionen, Daten und Closures,
  nie als Klassen oder Vererbung. Reine Funktionen, Seiteneffekte am Rand, Fehler als Werte. Eine Datei über ~400
  Zeilen und eine Funktion über ~80 werden geteilt; ein Refactor ändert kein Verhalten.
- Fremde, nicht committete Änderungen gehören jemand anderem (oft einem anderen Agenten): beim eigenen Umfang bleiben.

## Besonderheiten

- Ein Stalwart (Community Edition, AGPL) je Kunde; Kontext spricht nur JMAP (`src/jmap/`). Der Server meldet über
  OAuth von Stalwart an und reicht JMAP mit dem Token der Sitzung durch. Neue Server-Funktionen (Gmail-Umzug,
  Firmenverwaltung, Passkeys) gehören dorthin.
- Gemeinsame Postfächer sind Gruppenkonten von Stalwart: Jedes Mitglied sieht das Konto der Gruppe in der JMAP-Sitzung
  (`isPersonal: false`) und kann mit seiner Adresse senden.
- Die Demo (`src/demo/`, `bun run build:demo`, auf GitHub Pages unter `/demo/` von kontext.email) ist die App ohne
  Server: Sie beantwortet `/jmap` und `/api` in der Seite aus den Testdaten. Eine neue `/api`-Route, die die App beim
  Start abfragt, braucht eine Antwort in `src/demo/api.ts`.
- Testdaten: `dev/seed-data.ts` (Mails) und `dev/seed-pim.ts` (Kontakte, Termine), „Weber Haustechnik“. Anmeldungen
  `jonas@`, `anna@`, `sandra@`, `max@weber-haustechnik.test`, Passwort `kaffee-werkbank-kontext` (`dev/config.ts`).
  Gemeinsame Postfächer `info@` und `rechnung@`.
- Bildschirmgrößen: Desktop ab `md` (768 px) mit Liste und Ansicht, Seitenleiste ab `lg`; Handys bekommen eine Ansicht
  nach der anderen, gewählt über die URL, und die Tab-Leiste.
