import type { CellValue, Workbook } from "exceljs";
import { SPALTEN, schluesselZuKopf } from "./spalten.js";

// ExcelJS ist groß (rund 1 MB). Es wird erst geladen, wenn jemand die Vorlage
// holt oder eine Excel-Datei einliest – die Eingabemaske braucht es nie.
async function excel(): Promise<typeof import("exceljs")> {
    const modul = await import("exceljs");
    return (modul as unknown as { default?: typeof import("exceljs") }).default ?? modul;
}

const BLATT = "Vordrucke";
const LEERZEILEN = 500;

/** Die Vorlage: ein Blatt mit Kopfzeile und Auswahllisten, eins mit Anleitung. */
export async function erzeugeVorlage(): Promise<Blob> {
    const ExcelJS = await excel();
    const mappe: Workbook = new ExcelJS.Workbook();
    mappe.creator = "bos-nachrichtenvordruck";

    const blatt = mappe.addWorksheet(BLATT, { views: [{ state: "frozen", ySplit: 1 }] });
    blatt.columns = SPALTEN.map(spalte => ({
        header: spalte.titel,
        key: spalte.schluessel,
        width: spalte.breite,
        // Als Text, sonst macht Excel aus „0815" eine 815 und aus „14:15" eine Uhrzeit.
        style: { numFmt: "@", alignment: { vertical: "top", wrapText: spalte.schluessel === "inhalt" } }
    }));

    const kopf = blatt.getRow(1);
    kopf.font = { bold: true, color: { argb: "FFFFFFFF" } };
    kopf.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12275E" } };
    kopf.alignment = { vertical: "middle" };
    kopf.height = 22;

    SPALTEN.forEach((spalte, index) => {
        const zelle = blatt.getRow(1).getCell(index + 1);
        zelle.note = spalte.beschreibung;
        if (!spalte.auswahl) {
            return;
        }
        for (let zeile = 2; zeile <= LEERZEILEN + 1; zeile++) {
            blatt.getRow(zeile).getCell(index + 1).dataValidation = {
                type: "list",
                allowBlank: true,
                formulae: [`"${spalte.auswahl.join(",")}"`],
                showErrorMessage: true,
                errorTitle: spalte.titel,
                error: `Erlaubt: ${spalte.auswahl.join(", ")} oder leer.`
            };
        }
    });

    const anleitung = mappe.addWorksheet("Anleitung");
    anleitung.columns = [
        { header: "Spalte", key: "titel", width: 22 },
        { header: "Bedeutung", key: "beschreibung", width: 70, style: { alignment: { wrapText: true, vertical: "top" } } },
        { header: "Erlaubte Werte", key: "auswahl", width: 34 },
        { header: "Beispiel", key: "beispiel", width: 34 },
        { header: "Nur Nachrichtenvordruck", key: "nur", width: 14 }
    ];
    anleitung.getRow(1).font = { bold: true };
    anleitung.addRow({ titel: "Jede Zeile im Blatt „Vordrucke“ ergibt einen Vordruck. Leere Zeilen werden übersprungen, leere Zellen bleiben auf dem Vordruck leer." });
    anleitung.addRow({});
    for (const spalte of SPALTEN) {
        anleitung.addRow({
            titel: spalte.titel,
            beschreibung: spalte.beschreibung,
            auswahl: spalte.auswahl?.join(", ") ?? "",
            beispiel: spalte.beispiel,
            nur: spalte.nurNachricht ? "ja" : ""
        });
    }

    const puffer = await mappe.xlsx.writeBuffer();
    return new Blob([puffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function zweistellig(zahl: number): string {
    return String(zahl).padStart(2, "0");
}

/** Zellwert als Text, so wie er in der Zelle zu sehen war. */
export function zellText(wert: CellValue): string {
    if (wert === null || wert === undefined) {
        return "";
    }
    if (typeof wert === "string") {
        return wert;
    }
    if (typeof wert === "number") {
        return String(wert);
    }
    if (typeof wert === "boolean") {
        return wert ? "ja" : "nein";
    }
    if (wert instanceof Date) {
        // ExcelJS liefert Datum und Uhrzeit in UTC. Eine reine Uhrzeit hängt
        // am Excel-Nulltag 1899-12-30.
        const uhrzeit = `${zweistellig(wert.getUTCHours())}:${zweistellig(wert.getUTCMinutes())}`;
        if (wert.getUTCFullYear() < 1901) {
            return uhrzeit;
        }
        const datum = `${zweistellig(wert.getUTCDate())}.${zweistellig(wert.getUTCMonth() + 1)}.${wert.getUTCFullYear()}`;
        return wert.getUTCHours() || wert.getUTCMinutes() ? `${datum} ${uhrzeit}` : datum;
    }
    if ("richText" in wert) {
        return wert.richText.map(teil => teil.text).join("");
    }
    if ("formula" in wert || "sharedFormula" in wert) {
        return zellText((wert as { result?: CellValue }).result ?? null);
    }
    if ("text" in wert) {
        return String(wert.text);
    }
    return "";
}

/**
 * Liest die Excel-Datei als Tabelle aus Text. Genommen wird das Blatt
 * „Vordrucke", sonst das erste Blatt, dessen Kopfzeile ein bekanntes Feld hat.
 */
/**
 * `hinweise` sammelt Zellen, deren Wert nicht in der Datei steht: Formeln ohne
 * gespeichertes Ergebnis, wie sie andere Programme als Excel hinterlassen.
 */
export async function leseExcel(daten: ArrayBuffer, hinweise: string[] = []): Promise<string[][]> {
    const ExcelJS = await excel();
    const mappe = new ExcelJS.Workbook();
    try {
        await mappe.xlsx.load(daten);
    } catch {
        // Die Meldung der Bibliothek ist englisch und technisch („end of central directory …“).
        throw new Error("Die Datei ist keine lesbare Excel-Datei (.xlsx). Ist sie beschädigt oder nur umbenannt? In Excel öffnen und als .xlsx oder CSV neu speichern.");
    }

    // Das Blatt mit den meisten bekannten Spaltenköpfen in den ersten zehn
    // Zeilen; bei Gleichstand „Vordrucke“. Ein Blatt dieses Namens mit falschen
    // Köpfen gewinnt so nicht mehr gegen ein passendes anderes.
    const bewertung = (blatt: (typeof mappe.worksheets)[number]) => {
        let beste = 0;
        for (let zeile = 1; zeile <= Math.min(10, blatt.rowCount); zeile++) {
            const werte = blatt.getRow(zeile).values;
            const texte = Array.isArray(werte) ? werte.map(wert => zellText(wert ?? null)) : [];
            beste = Math.max(beste, texte.filter(text => schluesselZuKopf(text)).length);
        }
        return beste + (blatt.name === BLATT ? 0.5 : 0);
    };
    const blatt = [...mappe.worksheets].sort((a, b) => bewertung(b) - bewertung(a))
        .find(kandidat => bewertung(kandidat) >= 1);
    if (blatt && mappe.worksheets.length > 1) {
        hinweise.push(`Gelesen wurde das Blatt „${blatt.name}“.`);
    }
    if (!blatt) {
        throw new Error("In der Datei steht kein Blatt mit bekannten Spalten (z. B. „Inhalt“, „Gegenstelle“).");
    }

    const breite = blatt.columnCount;
    const tabelle: string[][] = [];
    blatt.eachRow({ includeEmpty: true }, zeile => {
        const werte: string[] = [];
        for (let spalte = 1; spalte <= breite; spalte++) {
            const zelle = zeile.getCell(spalte);
            const wert = zelle.value;
            if (wert && typeof wert === "object" && ("formula" in wert || "sharedFormula" in wert)
                && (wert as { result?: CellValue }).result === undefined) {
                hinweise.push(`Zelle ${zelle.address}: Formel ohne gespeicherten Wert, bleibt leer. Datei in Excel öffnen und neu speichern.`);
            }
            werte.push(zellText(wert));
        }
        tabelle[zeile.number - 1] = werte;
    });
    // Lücken (komplett leere Zeilen ohne Eintrag) auffüllen, damit Zeilennummern stimmen.
    for (let index = 0; index < tabelle.length; index++) {
        tabelle[index] ??= [];
    }
    return tabelle;
}
