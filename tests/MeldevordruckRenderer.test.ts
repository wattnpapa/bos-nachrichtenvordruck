import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { meldevordruckInhaltZeilen, zeichneMeldevordruck } from "../src/MeldevordruckRenderer.js";
import { nachrichtenvordruckInhaltZeilen, zeichneNachrichtenvordruck } from "../src/NachrichtenvordruckRenderer.js";
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

    it("setzt langen Text in voller Größe und schneidet nach 26 Zeilen mit „…“ ab", () => {
        const daten = baueDaten(["Heros Jever 21/10"]);
        daten.inhalt = lang;

        const protokoll = zeichneUndProtokolliere(daten);
        const inhalt = protokoll.filter(e => e.y >= 55 && e.y <= 184.5 && (e.text.includes("Deich") || e.text.includes("räumen") || e.text.endsWith("…")));

        expect(inhalt).toHaveLength(26);
        // Die Zeilen bleiben im Abstand von 5 mm auf dem Raster.
        expect(inhalt.map(e => e.y)).toEqual(Array.from({ length: 26 }, (_, i) => 55 + i * 5));
        expect(inhalt.at(-1)?.text.endsWith(" …")).toBe(true);
        expect(protokoll.some(e => e.y > 184.5 && e.text.includes("Deich"))).toBe(false);
    });

    it("meldet, wie viele Zeilen der Text braucht und wie viele Platz haben", () => {
        const pdf = new jsPDF("p", "mm", "a5");

        expect(meldevordruckInhaltZeilen(pdf, "Sind einsatzbereit.")).toEqual({ zeilen: 1, maxZeilen: 26 });
        expect(meldevordruckInhaltZeilen(pdf, lang).zeilen).toBeGreaterThan(26);
    });
});

describe("Nachrichtenvordruck: Inhaltsfeld", () => {
    it("bleibt bei 12 pt auf den zwölf Linien und schneidet längeren Text ab", () => {
        const pdf = new jsPDF("p", "mm", "a5");
        pdf.setFontSize(16);
        const lang = "Lage unverändert, keine weiteren Kräfte nötig. ".repeat(40);

        expect(nachrichtenvordruckInhaltZeilen(pdf, "Erkundung abgeschlossen.")).toEqual({ zeilen: 1, maxZeilen: 12 });
        expect(nachrichtenvordruckInhaltZeilen(pdf, lang).zeilen).toBeGreaterThan(12);
        // Ändert die Schriftgröße des Dokuments nicht.
        expect(pdf.getFontSize()).toBe(16);

        const daten = baueDaten([]);
        daten.inhalt = lang;
        const protokoll: { text: string; y: number; groesse: number }[] = [];
        const zeichnen = new jsPDF("p", "mm", "a5");
        const text = zeichnen.text.bind(zeichnen);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (zeichnen as any).text = (inhalt: string, x: number, y: number, optionen?: unknown) => {
            protokoll.push({ text: String(inhalt), y, groesse: zeichnen.getFontSize() });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (text as any)(inhalt, x, y, optionen);
        };
        zeichneNachrichtenvordruck(zeichnen, daten, { ohneHintergrund: true, ohneRahmen: true });
        const zeilen = protokoll.filter(e => e.text.includes("Lage") || e.text.includes("Kräfte") || e.text.endsWith("…"));
        expect(zeilen).toHaveLength(12);
        expect(zeilen.every(e => e.groesse === 12)).toBe(true);
        expect(zeilen.map(e => Math.round(e.y * 10) / 10)).toEqual(Array.from({ length: 12 }, (_, i) => Math.round((77.11 + i * (149.84 - 78.41) / 11) * 10) / 10));
        expect(zeilen.at(-1)?.text.endsWith(" …")).toBe(true);
    });
});

describe("Meldevordruck: Übermittelt", () => {
    function kreuze(weg: VordruckDaten["uebermittlungsweg"]) {
        const daten = baueDaten([]);
        if (weg) {
            daten.uebermittlungsweg = weg;
        } else {
            delete daten.uebermittlungsweg;
        }
        return zeichneUndProtokolliere(daten).filter(e => e.text === "x");
    }

    it("kreuzt wie bisher Funk an, wenn nichts anderes gesetzt ist", () => {
        expect(kreuze("funk")).toEqual([{ text: "x", y: 10 }]);
        expect(new VordruckDaten().uebermittlungsweg).toBe("funk");
    });

    it("kreuzt Telefon und Fax in der unteren Zeile an und lässt ohne Weg alles leer", () => {
        expect(kreuze("telefon")).toEqual([{ text: "x", y: 15.4 }]);
        expect(kreuze("telefax")).toEqual([{ text: "x", y: 15.4 }]);
        expect(kreuze("dfue")).toEqual([]);
        expect(kreuze(undefined)).toEqual([]);
    });
});
