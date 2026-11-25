---
name: checks
description: "Prüfungen von Kontext ausführen (Typen, Lint, Vitest, Build, Doku; E2E in der CI). Vor jedem Push, im Review und wenn Bun, Stalwart oder ein Werkzeug für die Tests fehlt."
---

# Prüfungen

Vor jedem Push grün, danach die CI prüfen. Den lokalen Stalwart, die Testdaten und die Tests beschreibt
`docs/development.md`.

```sh
bun install --frozen-lockfile
bun run typecheck && bun run lint && bun run test && bun run build
zensical build --strict  # wenn docs/ oder mkdocs.yml geändert sind (pip install -r requirements-docs.txt)
```

- Die E2E-Tests (`bun run e2e`, Desktop, `@phone`, PWA) laufen in der CI; lokal vor einem Push nicht nötig.
- Ports: Dev nutzt Stalwart 18080, Server 18090, Vite 5173; E2E 28080, 28090, 5174. Laufende Prozesse nicht stoppen.
- Was übersprungen wurde, gehört mit Grund in die Beschreibung des Pull Requests, nie als bestanden.

Die Regeln am Pull Request selbst (Titel, `Umgesetzt`/`Refs`, neue Abhängigkeiten, lange Funktionen) prüft vor dem
Push die Werkbank, siehe Skill `beitrag`.
