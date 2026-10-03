# CLAUDE.md

Bibliothek, die den BOS-Nachrichtenvordruck und den Meldevordruck mit jsPDF ausfüllt.
Herausgelöst aus `wattnpapa/sprechfunk-uebung` (dort `src/pdf/` als Adapter).

## Befehle

```bash
npm install
npm test             # Vitest (watch)
npx vitest run --coverage
npm run typecheck
npm run build        # tsc → dist/
npm run bilder       # assets/*.png → src/hintergrund.ts
```

## Regeln

- Keine Begriffe einer bestimmten Anwendung (Übung, Teilnehmer, Nachricht-ID) im Code.
  Was der Aufrufer weiß, kommt über `VordruckDaten`.
- `jspdf` bleibt Peer-Abhängigkeit, keine Laufzeit-Abhängigkeiten dazunehmen.
- Die Zeichenreihenfolge ist festgeschrieben: gleiche Eingabe, gleiche PDF.
- Koordinaten sind am Formularbild vermessen (mm). Zellhöhen nicht vergrößern,
  sonst greift die Schriftverkleinerung nicht.
- Relative Imports mit `.js`-Endung (ESM für Node).
- `src/hintergrund.ts` ist generiert; nur über `npm run bilder` ändern.
- Commits: Conventional Commits, z. B. `feat(nachrichtenvordruck): …`.
