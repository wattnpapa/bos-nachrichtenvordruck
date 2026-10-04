// Legt das gezeichnete Formular in Rot über die Formularbilder aus assets/.
//
//   npm run vergleich
//
// Schreibt vergleich/vergleich.pdf: links der Nachrichtenvordruck, rechts der
// Meldevordruck, jeweils das PNG der Vorlage mit dem Strichbild der Bibliothek
// darüber. Wo Grau oder Schwarz neben einer roten Linie hervorsieht, weicht
// die Geometrie ab.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import {
    MELDEVORDRUCK_FORMULAR,
    NACHRICHTENVORDRUCK_FORMULAR,
    VORDRUCK_BREITE,
    VORDRUCK_HOEHE,
    zeichneFormular
} from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const VORDRUCKE = [
    { bild: "assets/nachrichtenvordruck4fach.png", formular: NACHRICHTENVORDRUCK_FORMULAR },
    { bild: "assets/meldevordruck.png", formular: MELDEVORDRUCK_FORMULAR }
];

const pdf = new jsPDF("l", "mm", "a4");
for (const [index, { bild, formular }] of VORDRUCKE.entries()) {
    const offsetX = index * VORDRUCK_BREITE;
    const png = new Uint8Array(await readFile(path.join(root, bild)));
    pdf.addImage(png, "PNG", offsetX, 0, VORDRUCK_BREITE, VORDRUCK_HOEHE);
    zeichneFormular(pdf, formular, { offsetX, farbe: "#ff0000", flaechen: false });
}

await mkdir(path.join(root, "vergleich"), { recursive: true });
await writeFile(path.join(root, "vergleich/vergleich.pdf"), Buffer.from(pdf.output("arraybuffer")));
console.log("vergleich/vergleich.pdf geschrieben.");
