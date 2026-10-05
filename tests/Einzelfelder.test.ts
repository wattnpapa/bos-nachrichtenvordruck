import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { VordruckDaten, zeichneMeldevordruck, zeichneNachrichtenvordruck } from "../src/index.js";

/** Protokolliert jeden Text mit Lage, Schriftgröße und Breite. */
function protokoll() {
    const pdf = new jsPDF("p", "mm", "a5");
    const texte: { text: string; x: number; y: number; groesse: number; breite: number }[] = [];
    const text = pdf.text.bind(pdf);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).text = (inhalt: string, x: number, y: number, optionen?: unknown) => {
        texte.push({ text: String(inhalt), x, y, groesse: pdf.getFontSize(), breite: pdf.getTextWidth(String(inhalt)) });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (text as any)(inhalt, x, y, optionen);
    };
    return { pdf, texte };
}

const LANG = "Heros Oldenburg 16/11 Zugtrupp Fachgruppe Wasserschaden/Pumpen mit sehr langem Zusatz";

describe("Einzeilige Felder", () => {
    it("Nachrichtenvordruck: ein langer Absender verkleinert den Rufnamen nicht", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.absender = LANG;
        daten.empfaenger = ["Heros Jever 21/10"];

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        expect(texte.find(t => t.text === "Heros Jever 21/10")?.groesse).toBe(12);
    });

    it("Nachrichtenvordruck: lange Nr. und Quittungsstelle bleiben in ihrer Zelle und mindestens 6 pt", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.nummer = "2026-10-04-0017-Abschnitt-Nord";
        daten.quittung = { stelle: "Heros Jever 21/10 Abschnitt Nord" };

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const nr = texte.find(t => t.text.startsWith("2026"));
        expect(nr?.text.endsWith("…")).toBe(true);
        expect((nr?.x ?? 0) + (nr?.breite ?? 99)).toBeLessThanOrEqual(142.4);
        for (const eintrag of texte) {
            expect(eintrag.groesse).toBeGreaterThanOrEqual(6);
        }
    });

    it("Nachrichtenvordruck: lange Vermerke stehen mehrzeilig auf der freien Fläche, nicht über dem Rand", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.vermerke = "Rückfrage bei TEL um 14:20 Uhr, Antwort steht aus; danach an S3 weitergegeben";

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const zeilen = texte.filter(t => t.y > 170);
        expect(zeilen.length).toBeGreaterThan(1);
        for (const zeile of zeilen) {
            expect(zeile.groesse).toBe(9);
            expect(zeile.x + zeile.breite).toBeLessThanOrEqual(142.6);
            expect(zeile.y).toBeLessThan(204.2);
        }
        expect(zeilen.map(z => z.text).join(" ").replace(/\s+/g, " ")).toBe(daten.vermerke);
    });

    it("Meldevordruck: druckt Abfassungszeit sowie Ausgang und Eingang mit Datum und Uhrzeit", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.abfassungszeit = "041416okt26";
        daten.annahmevermerk = { datum: "04.10.", uhrzeit: "14:16" };
        daten.aufnahmevermerk = { datum: "04.10.", uhrzeit: "14:30" };

        zeichneMeldevordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        expect(texte.find(t => t.text === "041416okt26")).toMatchObject({ x: 91.5, y: 193.6 });
        expect(texte.filter(t => t.x === 123.6).map(t => t.text)).toEqual(["04.10.", "14:16", "04.10.", "14:30"]);
    });

    it("Meldevordruck: lange Nr. läuft nicht über „Übermittelt“", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.nummer = "2026-10-04-0017-Abschnitt-Nord";

        zeichneMeldevordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const nr = texte.find(t => t.text.startsWith("2026"));
        expect((nr?.x ?? 0) + (nr?.breite ?? 99)).toBeLessThanOrEqual(89.5);
    });
});

describe("Gekürzte Felder vorab", () => {
    it("nennt, was nicht ganz aufs Blatt passt", async () => {
        const { meldevordruckGekuerzt, nachrichtenvordruckGekuerzt } = await import("../src/index.js");
        const pdf = new jsPDF("p", "mm", "a5");
        const daten = new VordruckDaten();
        daten.nummer = "17";
        daten.absender = "Heros Oldenburg 16/11";
        expect(nachrichtenvordruckGekuerzt(pdf, daten)).toEqual([]);
        expect(meldevordruckGekuerzt(pdf, daten)).toEqual([]);

        daten.nummer = "2026-10-04-0017-Abschnitt-Nord";
        daten.quittung = { stelle: "Heros Jever 21/10 Abschnitt Nord" };
        daten.verfasser = LANG;
        expect(nachrichtenvordruckGekuerzt(pdf, daten)).toEqual(["nummer", "quittungStelle"]);
        expect(meldevordruckGekuerzt(pdf, daten)).toEqual(["nummer", "verfasser"]);
    });
});

describe("Inhalt teilen", () => {
    it("teilt langen Text in Stücke, die je ohne Kürzung auf einen Vordruck passen", async () => {
        const { meldevordruckInhaltTeilen, meldevordruckInhaltZeilen, nachrichtenvordruckInhaltTeilen, nachrichtenvordruckInhaltZeilen } = await import("../src/index.js");
        const pdf = new jsPDF("p", "mm", "a5");
        const text = Array.from({ length: 30 }, (_, i) => `Punkt ${i + 1}: Lage unverändert, keine weiteren Kräfte nötig.`).join("\n");
        const teile = nachrichtenvordruckInhaltTeilen(pdf, text);
        expect(teile.length).toBeGreaterThan(1);
        for (const teil of teile) {
            const { zeilen, maxZeilen } = nachrichtenvordruckInhaltZeilen(pdf, teil);
            expect(zeilen).toBeLessThanOrEqual(maxZeilen);
        }
        expect(teile.join("\n")).toBe(text);
        expect(meldevordruckInhaltTeilen(pdf, text).every(teil => meldevordruckInhaltZeilen(pdf, teil).zeilen <= 26)).toBe(true);
        expect(nachrichtenvordruckInhaltTeilen(pdf, "Kurz.")).toEqual(["Kurz."]);
    });
});

describe("Lange Wörter", () => {
    it("trennt ein Wort, das breiter als die Zeile ist, mit Trennstrich", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.vermerke = "Rückfrage Wasserschadenpumpeneinsatzabschnittsleitungsstellenvertretung erledigt";

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const zeilen = texte.filter(t => t.y > 170);
        expect(zeilen.some(z => z.text.endsWith("-"))).toBe(true);
        for (const zeile of zeilen) {
            expect(zeile.x + zeile.breite).toBeLessThanOrEqual(142.6);
        }
        expect(zeilen.map(z => z.text).join(" ").replace(/- /g, "")).toContain("Wasserschadenpumpeneinsatzabschnittsleitungsstellenvertretung");
    });
});

describe("Prüfvermerk und Blatt", () => {
    it("stehen in der Zeile „Inhalt“ beider Vordrucke, nicht am Blattrand", () => {
        for (const zeichne of [zeichneNachrichtenvordruck, zeichneMeldevordruck]) {
            const { pdf, texte } = protokoll();
            const daten = new VordruckDaten();
            daten.pruefvermerk = "Prüfen: Text gekürzt";
            daten.blatt = "Blatt 1 von 2";
            zeichne(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });
            const vermerk = texte.find(t => t.text === "Prüfen: Text gekürzt");
            const blatt = texte.find(t => t.text === "Blatt 1 von 2");
            expect(vermerk?.y).toBeLessThan(75);
            expect((vermerk?.x ?? 0) + (vermerk?.breite ?? 999)).toBeLessThan(blatt?.x ?? 0);
        }
    });
});

describe("Umbruch an eigenen Bruchstellen", () => {
    it("bricht eine Adresse am Schrägstrich um, ohne Trennstrich einzufügen", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.inhalt = "https://www.example-ortsverband.de/einsatz/2026/lagemeldungen/abschnitt-nord/stand-0800.html";

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const zeilen = texte.filter(t => t.groesse === 12 && t.y > 75 && t.y < 151).map(t => t.text);
        expect(zeilen.length).toBeGreaterThan(1);
        expect(zeilen.join("")).toBe(daten.inhalt);
    });

    it("teilt den ersten Vermerk nicht zwischen Streifen und freier Fläche", () => {
        const { pdf, texte } = protokoll();
        const daten = new VordruckDaten();
        daten.vermerke = "19:40 S2 informiert\n19:45 Rückruf";

        zeichneNachrichtenvordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });

        const zeilen = texte.filter(t => t.y > 170).map(t => t.text);
        expect(zeilen).toContain("19:40 S2 informiert");
    });
});
