import { describe, expect, it } from "vitest";
import { beiSpeicherZustand, geraeteSpeicher, gescheiterteSchluessel, schreibe, speicherPruefen, speicherWarnung, speicherZustand } from "../../web/src/speicherwache.js";

/** Ein Speicher, dessen Schreiben mit `fehler` scheitert (oder nie). */
function speicher(fehler?: { name: string }): Storage {
    const daten = new Map<string, string>();
    return {
        getItem: (schluessel: string) => daten.get(schluessel) ?? null,
        setItem: (schluessel: string, wert: string) => {
            if (fehler) {
                throw Object.assign(new Error("Speicher"), fehler);
            }
            daten.set(schluessel, wert);
        },
        removeItem: (schluessel: string) => void daten.delete(schluessel),
        clear: () => daten.clear(),
        key: () => null,
        length: 0
    } as unknown as Storage;
}

describe("Speicherwache", () => {
    it("meldet einen vollen und einen gesperrten Speicher und nimmt die Warnung erst zurück, wenn derselbe Schlüssel wieder geht", () => {
        const zustaende: string[] = [];
        beiSpeicherZustand(zustand => zustaende.push(zustand));
        expect(schreibe(speicher(), "a", "1")).toBe(true);
        expect(speicherZustand()).toBe("ok");
        expect(schreibe(speicher({ name: "QuotaExceededError" }), "a", "1")).toBe(false);
        expect(speicherZustand()).toBe("voll");
        // Ein kleiner Schreibzugriff auf einen anderen Schlüssel rettet den Entwurf nicht: Die Warnung bleibt.
        expect(schreibe(speicher(), "b", "1")).toBe(true);
        expect(speicherZustand()).toBe("voll");
        expect(schreibe(null, "c", "1")).toBe(false);
        expect(speicherZustand()).toBe("gesperrt");
        expect(schreibe(speicher(), "c", "1")).toBe(true);
        expect(speicherZustand()).toBe("voll");
        expect(schreibe(speicher(), "a", "1")).toBe(true);
        expect(speicherZustand()).toBe("ok");
        expect(zustaende.filter(zustand => zustand !== "ok")).toEqual(expect.arrayContaining(["voll", "gesperrt"]));
        expect(zustaende.at(-1)).toBe("ok");
    });

    it("prüft beim Start mit einem kleinen Wert", () => {
        expect(speicherPruefen(speicher({ name: "SecurityError" }))).toBe(false);
        expect(speicherZustand()).toBe("gesperrt");
        expect(speicherPruefen(speicher())).toBe(true);
        expect(speicherZustand()).toBe("ok");
    });

    it("behandelt einen nicht lesbaren Speicher als gesperrt und überschreibt dann nichts still", () => {
        const roh = { getItem: () => { throw new Error("denied"); }, setItem: () => undefined, removeItem: () => undefined };
        Object.defineProperty(globalThis, "localStorage", { value: roh, configurable: true });
        try {
            const ort = geraeteSpeicher("local");
            expect(ort?.getItem("x")).toBeNull();
            expect(speicherZustand()).toBe("gesperrt");
            expect(schreibe(ort, "bnv.verlauf.v1", "[]")).toBe(false);
            expect(gescheiterteSchluessel()).not.toContain("(lesen)");
        } finally {
            Reflect.deleteProperty(globalThis, "localStorage");
        }
    });

    it("sagt bei gescheiterter Liste nur das, nicht einen verlorenen Entwurf", () => {
        expect(speicherWarnung("voll", ["bnv.verlauf.v1"])).toContain("Liste erstellter Vordrucke");
        expect(speicherWarnung("voll", ["bnv.verlauf.v1"])).not.toContain("Entwurf");
        expect(speicherWarnung("voll", ["bnv.entwurf.v1"])).toContain("Entwurf");
    });

    it("hat für jeden Zustand einen Warntext, nur für „ok“ keinen", () => {
        expect(speicherWarnung("ok")).toBe("");
        expect(speicherWarnung("voll")).toContain("voll");
        expect(speicherWarnung("gesperrt")).toContain("speichert nichts");
    });
});
