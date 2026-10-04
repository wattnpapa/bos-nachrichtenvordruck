// CSV lesen und schreiben, wie Excel und LibreOffice es in Deutschland tun:
// Semikolon als Trenner, Anführungszeichen um Felder mit Trenner oder
// Zeilenumbruch, verdoppelte Anführungszeichen im Feld.

/**
 * Macht aus den Bytes einer CSV-Datei Text. Erst UTF-8; scheitert das, ist es
 * fast immer Windows-1252, so speichert Excel unter Windows „CSV (Trennzeichen-
 * getrennt)“. Ohne diesen Rückfall würden aus Umlauten Ersatzzeichen und
 * Spalten wie „Empfänger“ nicht erkannt.
 */
export function dekodiereCsv(bytes: ArrayBuffer | Uint8Array): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
        // Von Hand statt TextDecoder("windows-1252"): Node liest das als
        // Latin-1 und verliert dabei €, „“ und Gedankenstriche.
        return Array.from(new Uint8Array(bytes), byte =>
            byte >= 0x80 && byte < 0xa0 ? WINDOWS_1252[byte - 0x80] ?? "" : String.fromCharCode(byte)).join("");
    }
}

/** Windows-1252 an 0x80–0x9F; außerhalb davon gleicht es Latin-1. Leer: unbelegt. */
const WINDOWS_1252 = Array.from("€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ");

/** Trenner aus der Kopfzeile erraten: Semikolon, Tabulator oder Komma. */
export function erkenneTrenner(text: string): string {
    const kopf = text.split(/\r?\n/, 1)[0] ?? "";
    const kandidaten = [";", "\t", ","];
    let bester = ";";
    let anzahl = 0;
    for (const trenner of kandidaten) {
        const treffer = kopf.split(trenner).length - 1;
        if (treffer > anzahl) {
            bester = trenner;
            anzahl = treffer;
        }
    }
    return bester;
}

export function leseCsv(text: string, trenner = erkenneTrenner(text)): string[][] {
    const quelle = text.replace(/^﻿/, "");
    const zeilen: string[][] = [];
    let zeile: string[] = [];
    let feld = "";
    let inAnfuehrung = false;
    // Für die Fehlermeldung: Zeile, in der das offene Anführungszeichen steht.
    let zeilennummer = 1;
    let anfuehrungAb = 0;

    for (let i = 0; i < quelle.length; i++) {
        const zeichen = quelle[i];
        if (inAnfuehrung) {
            if (zeichen === "\n") {
                zeilennummer++;
            }
            if (zeichen === "\"") {
                if (quelle[i + 1] === "\"") {
                    feld += "\"";
                    i++;
                } else {
                    inAnfuehrung = false;
                }
            } else {
                feld += zeichen;
            }
            continue;
        }
        if (zeichen === "\"") {
            inAnfuehrung = true;
            anfuehrungAb = zeilennummer;
        } else if (zeichen === trenner) {
            zeile.push(feld);
            feld = "";
        } else if (zeichen === "\n" || zeichen === "\r") {
            if (zeichen === "\r" && quelle[i + 1] === "\n") {
                i++;
            }
            zeilennummer++;
            zeile.push(feld);
            zeilen.push(zeile);
            zeile = [];
            feld = "";
        } else {
            feld += zeichen;
        }
    }
    if (inAnfuehrung) {
        // Sonst verschlucken die Anführungszeichen still alle folgenden Zeilen.
        throw new Error(`In Zeile ${anfuehrungAb} wird ein Anführungszeichen geöffnet und nicht wieder geschlossen. Bitte die Datei prüfen.`);
    }
    if (feld !== "" || zeile.length > 0) {
        zeile.push(feld);
        zeilen.push(zeile);
    }
    return zeilen;
}

export function schreibeCsv(zeilen: string[][], trenner = ";"): string {
    const feld = (wert: string) =>
        /[";\n\r,\t]/.test(wert) ? `"${wert.replace(/"/g, "\"\"")}"` : wert;
    // BOM, damit Excel die Datei als UTF-8 öffnet und Umlaute stimmen.
    return "﻿" + zeilen.map(zeile => zeile.map(feld).join(trenner)).join("\r\n") + "\r\n";
}
