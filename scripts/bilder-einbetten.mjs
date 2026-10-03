// Schreibt die Formularbilder aus assets/ als Data-URLs nach src/hintergrund.ts.
//
//   npm run bilder
//
// Die Bilder stecken im Code statt als Datei im Paket, damit eine Anwendung
// nichts kopieren oder ausliefern muss: jsPDF bekommt die Daten direkt. Die
// erzeugte Datei ist eingecheckt; tests/hintergrund.test.ts schlägt fehl, wenn
// sie nicht mehr zu den PNGs passt.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const BILDER = [
    {
        name: "NACHRICHTENVORDRUCK_HINTERGRUND",
        datei: "assets/nachrichtenvordruck4fach.png",
        beschreibung: "Formularbild des Nachrichtenvordrucks (4fach-Satz), 148 × 210 mm."
    },
    {
        name: "MELDEVORDRUCK_HINTERGRUND",
        datei: "assets/meldevordruck.png",
        beschreibung: "Formularbild des Meldevordrucks, 148 × 210 mm."
    }
];

export async function erzeugeQuelle() {
    const teile = [
        "// Erzeugt von scripts/bilder-einbetten.mjs – nicht von Hand ändern.",
        ""
    ];
    for (const bild of BILDER) {
        const daten = await readFile(path.join(root, bild.datei));
        teile.push(`/** ${bild.beschreibung} Quelle: \`${bild.datei}\`. */`);
        teile.push(`export const ${bild.name} =`);
        teile.push(`    "data:image/png;base64,${daten.toString("base64")}";`);
        teile.push("");
    }
    return teile.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await writeFile(path.join(root, "src/hintergrund.ts"), await erzeugeQuelle());
    console.log("src/hintergrund.ts geschrieben.");
}
