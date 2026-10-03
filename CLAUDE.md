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
npm run web          # Web-App (web/) im Entwicklungsserver
npm run web:build    # Web-App → dist-web/, GitHub Pages
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
- Die Web-App in `web/` ist Anwendung, nicht Bibliothek: ihre Abhängigkeiten
  (Vite, ExcelJS, Archivo) bleiben devDependencies und landen nie in `dist/`.
  Gestaltung nach dem Design-System von erfassungsbogen.app (`web/src/stil.css`:
  Rollen-Token, Radius 0, Anzeigemodi Standard/Dunkel/Feld/Nacht).
- Commits: Conventional Commits, z. B. `feat(nachrichtenvordruck): …`.
