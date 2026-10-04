import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { meldevordruckInhaltSchrift, zeichneMeldevordruck } from "../src/MeldevordruckRenderer.js";
import { nachrichtenvordruckInhaltSchrift } from "../src/NachrichtenvordruckRenderer.js";
import { VordruckDaten } from "../src/VordruckDaten.js";

/** Zeichnet ohne Formularbild und protokolliert jeden Textaufruf. */
function zeichneUndProtokolliere(daten: VordruckDaten): { text: string; y: number }[] {
    const pdf = new jsPDF("p", "mm", "a5");
    const protokoll: { text: string; y: number }[] = [];
    const original = pdf.text.bind(pdf);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdf as any).text = (text: string | string[], x: number, y: number, optionen?: unknown) => {
        protokoll.push({ text: Array.isArray(text) ? text.join(" ") : String(text), y });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (original as any)(text, x, y, optionen);
    };

    zeichneMeldevordruck(pdf, daten, { ohneHintergrund: true, ohneRahmen: true });
    return protokoll;
}

function baueDaten(empfaenger: string[]): VordruckDaten {
    const daten = new VordruckDaten();
    daten.nummer = "7";
    daten.absender = "Heros Oldenburg 16/11";
    daten.verfasser = "Heros Oldenburg 16/11";
    daten.inhalt = "Sind einsatzbereit.";
    daten.empfaenger = empfaenger;
    return daten;
}

describe("Meldevordruck: Empfängerfeld", () => {
    it("setzt einen Empfänger auf die erste Grundlinie", () => {
        const protokoll = zeichneUndProtokolliere(baueDaten(["Heros Jever 21/10"]));

        expect(protokoll.filter(e => e.text === "Heros Jever 21/10" && e.y === 40)).toHaveLength(1);
    });

    it("führt alle Empfänger auf, auch wenn sie zwei Zeilen brauchen", () => {
        const empfaenger = [
            "Heros Wilhelmshaven 21/10",
            "Heros Bad Zwischenahn 19/51",
            "Heros Jever 21/10"
        ];

        const protokoll = zeichneUndProtokolliere(baueDaten(empfaenger));
        const gesetzt = protokoll.map(e => e.text).join(" ");

        // Die Vorgängerversion verwarf die zweite Zeile still.
        empfaenger.forEach(name => {
            expect(gesetzt).toContain(name);
        });
    });

    it("verliert auch bei vielen Empfängern keinen Namen", () => {
        const empfaenger = Array.from({ length: 8 }, (_, i) => `Heros Musterstadt ${20 + i}/1${i}`);

        const protokoll = zeichneUndProtokolliere(baueDaten(empfaenger));
        const gesetzt = protokoll.map(e => e.text).join(" ");

        empfaenger.forEach(name => {
            expect(gesetzt).toContain(name);
        });
    });

    it("bleibt mit allen Zeilen innerhalb des Feldes", () => {
        const empfaenger = Array.from({ length: 6 }, (_, i) => `Heros Musterstadt ${20 + i}/10`);

        const protokoll = zeichneUndProtokolliere(baueDaten(empfaenger));
        const empfaengerZeilen = protokoll.filter(e => e.text.startsWith("Heros Musterstadt"));

        expect(empfaengerZeilen.length).toBeGreaterThan(1);
        // Zelle am Formularbild gemessen: 30,8–45,9 mm.
        empfaengerZeilen.forEach(zeile => {
            expect(zeile.y).toBeGreaterThanOrEqual(40);
            expect(zeile.y).toBeLessThanOrEqual(45.9);
        });
    });

    it("zeichnet nichts, wenn kein Empfänger gesetzt ist", () => {
        const protokoll = zeichneUndProtokolliere(baueDaten([]));

        expect(protokoll.some(e => e.y >= 40 && e.y <= 45.9)).toBe(false);
    });
});

describe("Meldevordruck: Inhaltsfeld", () => {
    const lang = "Deich bricht bei Kilometer 3, Bereich sofort räumen. ".repeat(60);

    it("bleibt mit langem Text über Verfasser und Blattrand", () => {
        const daten = baueDaten(["Heros Jever 21/10"]);
        daten.inhalt = lang;

        const protokoll = zeichneUndProtokolliere(daten);
        const inhalt = protokoll.filter(e => e.text.includes("Deich") || e.text.includes("räumen"));

        // Raster am Formularbild gemessen: endet bei 185,7 mm, darunter Verfasser.
        expect(inhalt.length).toBeGreaterThan(26);
        inhalt.forEach(zeile => expect(zeile.y).toBeLessThanOrEqual(184.5));
        // Kein Text fällt weg.
        expect(inhalt.map(e => e.text).join(" ").split("Deich").length - 1).toBe(60);
    });

    it("meldet die Schriftgröße, mit der gesetzt wird", () => {
        const pdf = new jsPDF("p", "mm", "a5");

        expect(meldevordruckInhaltSchrift(pdf, "Sind einsatzbereit.")).toEqual({ schriftgroesse: 11.5, passt: true });
        const verkleinert = meldevordruckInhaltSchrift(pdf, lang);
        expect(verkleinert.schriftgroesse).toBeLessThan(11.5);
        expect(verkleinert.passt).toBe(true);
        expect(meldevordruckInhaltSchrift(pdf, lang.repeat(20)).passt).toBe(false);
    });
});

describe("Nachrichtenvordruck: Schriftgröße des Inhalts", () => {
    it("bleibt bei einem Funkspruch auf 12 pt und verkleinert langen Text", () => {
        const pdf = new jsPDF("p", "mm", "a5");
        pdf.setFontSize(16);

        expect(nachrichtenvordruckInhaltSchrift(pdf, "Erkundung abgeschlossen.")).toEqual({ schriftgroesse: 12, passt: true });
        const lang = nachrichtenvordruckInhaltSchrift(pdf, "Lage unverändert, keine weiteren Kräfte nötig. ".repeat(40));
        expect(lang.schriftgroesse).toBeLessThan(12);
        expect(lang.passt).toBe(true);
        // Ändert die Schriftgröße des Dokuments nicht.
        expect(pdf.getFontSize()).toBe(16);
    });
});
