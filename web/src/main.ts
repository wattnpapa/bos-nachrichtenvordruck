/// <reference types="vite/client" />
import "./seite.js";
import { zeichneBildvorschau } from "./bildvorschau.js";
import { dekodiereCsv, schreibeCsv, leseCsv } from "./csv.js";
import { dateiname, erzeugePdf, type Blattformat, type PdfOptionen, type VordruckWahl } from "./pdf.js";
import { pruefeTextlaenge, textlaengeMeldung } from "./textlaenge.js";
import { ladeVerlauf, loescheVerlauf, merkeVordruck, mitNummer, verlaufAlsCsv, type Eintrag } from "./verlauf.js";
import {
    SPALTEN,
    datumZeitGruppe,
    leseTabelle,
    naechsteNummer,
    zuVordruckDaten,
    type Eingabe,
    type Schluessel,
    type TabellenErgebnis
} from "./spalten.js";

// ---- Hilfen --------------------------------------------------------------

function element<T extends HTMLElement>(id: string): T {
    const gefunden = document.getElementById(id);
    if (!gefunden) {
        throw new Error(`#${id} fehlt im Markup`);
    }
    return gefunden as T;
}

function speicher(): Storage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function herunterladen(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Rückfrage im Stil der Seite statt des Systemdialogs: folgt dem Anzeigemodus,
 * blendet nachts nicht, und die Knöpfe sagen, was passiert. Vorbelegt ist
 * „Abbrechen“, damit ein versehentliches Enter nichts löscht.
 */
function frage(text: string, ja: string, nein = "Abbrechen"): Promise<boolean> {
    const dialog = element<HTMLDialogElement>("frage");
    if (typeof dialog.showModal !== "function") {
        return Promise.resolve(confirm(text));
    }
    element<HTMLParagraphElement>("frage-text").textContent = text;
    element<HTMLButtonElement>("frage-ja").textContent = ja;
    element<HTMLButtonElement>("frage-nein").textContent = nein;
    dialog.returnValue = "";
    dialog.showModal();
    element<HTMLButtonElement>("frage-nein").focus();
    return new Promise(fertig => dialog.addEventListener("close", () => fertig(dialog.returnValue === "ja"), { once: true }));
}

/** Knopf während der Arbeit: bleibt lesbar, sagt in Worten, was läuft. */
async function mitArbeit(knopf: HTMLButtonElement, text: string, arbeit: () => Promise<void>): Promise<void> {
    const vorher = knopf.textContent;
    knopf.disabled = true;
    knopf.classList.add("arbeitet");
    knopf.setAttribute("aria-busy", "true");
    knopf.textContent = text;
    try {
        await arbeit();
    } finally {
        knopf.disabled = false;
        knopf.classList.remove("arbeitet");
        knopf.removeAttribute("aria-busy");
        knopf.textContent = vorher;
    }
}

// ---- Reiter --------------------------------------------------------------

const REITER = [
    { knopf: element<HTMLButtonElement>("reiter-einzeln"), ansicht: element<HTMLElement>("ansicht-einzeln"), name: "einzeln" },
    { knopf: element<HTMLButtonElement>("reiter-tabelle"), ansicht: element<HTMLElement>("ansicht-tabelle"), name: "tabelle" }
];

/**
 * `verlauf`: „neu“ legt einen Eintrag an, damit die Zurück-Taste des Telefons
 * zum vorigen Reiter führt statt aus der App heraus; „ersetzen“ beim Start,
 * „keiner“, wenn der Wechsel selbst aus dem Verlauf kommt.
 */
function zeigeReiter(name: string, fokus = false, verlauf: "neu" | "ersetzen" | "keiner" = "neu"): void {
    for (const reiter of REITER) {
        const aktiv = reiter.name === name;
        reiter.knopf.setAttribute("aria-selected", String(aktiv));
        reiter.knopf.tabIndex = aktiv ? 0 : -1;
        reiter.ansicht.hidden = !aktiv;
        if (aktiv && fokus) {
            reiter.knopf.focus();
        }
    }
    const ziel = name === "einzeln" ? location.pathname + location.search : `#${name}`;
    if (verlauf !== "keiner" && location.hash !== (name === "einzeln" ? "" : `#${name}`)) {
        if (verlauf === "neu") {
            history.pushState(null, "", ziel);
        } else {
            history.replaceState(null, "", ziel);
        }
    }
    if (name === "einzeln") {
        planeVorschau();
    }
    einstellungenZeigen();
}

addEventListener("popstate", () => zeigeReiter(location.hash === "#tabelle" ? "tabelle" : "einzeln", false, "keiner"));

REITER.forEach((reiter, index) => {
    reiter.knopf.addEventListener("click", () => zeigeReiter(reiter.name));
    reiter.knopf.addEventListener("keydown", ereignis => {
        const schritt = ereignis.key === "ArrowRight" ? 1 : ereignis.key === "ArrowLeft" ? -1 : 0;
        if (schritt) {
            const ziel = REITER[(index + schritt + REITER.length) % REITER.length];
            if (ziel) {
                zeigeReiter(ziel.name, true);
            }
        }
    });
});

// ---- Einstellungen -------------------------------------------------------

const EINSTELLUNGEN_SCHLUESSEL = "bnv.einstellungen.v1";

function optionen(): PdfOptionen {
    const wert = (name: string) =>
        document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? "";
    return {
        vordruck: (wert("vordruck") || "nachricht") as VordruckWahl,
        blatt: (wert("blatt") || "a4") as Blattformat,
        ohneHintergrund: document.querySelector<HTMLInputElement>('input[name="ohneHintergrund"]')?.checked ?? false,
        versatzX: versatzWert("versatzX"),
        versatzY: versatzWert("versatzY")
    };
}

function versatzWert(name: string): number {
    const zahl = Number(document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value.replace(",", ".") ?? 0);
    return Number.isFinite(zahl) ? Math.max(-20, Math.min(20, zahl)) : 0;
}

/** Zusammenfassung der Einstellungen im zugeklappten Kopf, damit „ohne Formularbild“ nicht übersehen wird. */
function einstellungenZeigen(): void {
    const gewaehlt = optionen();
    const text = (name: string) =>
        document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.parentElement?.textContent?.trim() ?? "";
    const teile = [text("vordruck"), text("blatt")];
    if (gewaehlt.ohneHintergrund) {
        const versatz = gewaehlt.versatzX || gewaehlt.versatzY
            ? ` (verschoben ${[gewaehlt.versatzX ?? 0, gewaehlt.versatzY ?? 0].map(mm => mm.toLocaleString("de-DE")).join(" / ")} mm)`
            : "";
        teile.push(`ohne Formularbild${versatz}`);
    }
    element<HTMLSpanElement>("einstellungen-stand").textContent = teile.join(" · ");
    element<HTMLDivElement>("versatz").hidden = !gewaehlt.ohneHintergrund;
    // Im Einzelreiter füllt ein Vordruck nur die linke Hälfte von A4 quer.
    element<HTMLParagraphElement>("blatt-hinweis").hidden = !(gewaehlt.blatt === "a4" && gewaehlt.vordruck !== "beide"
        && !element<HTMLElement>("ansicht-einzeln").hidden);
}

function felderFuerVordruckZeigen(): void {
    const { vordruck } = optionen();
    for (const bereich of document.querySelectorAll<HTMLElement>("[data-nur]")) {
        const nur = bereich.dataset["nur"];
        bereich.hidden = vordruck !== "beide" && nur !== vordruck;
    }
    // Der Nachrichtenvordruck fragt nach der Gegenstelle, der Meldevordruck nach dem Empfänger.
    element<HTMLSpanElement>("empfaenger-titel").textContent =
        vordruck === "meldung" ? "Empfänger" : "Rufname der Gegenstelle";
    element<HTMLHeadingElement>("spruchkopf-titel").textContent = vordruck === "meldung" ? "Empfänger" : "Spruchkopf";
    richtungPruefen();
}

/** Ohne Übermittlungsweg oder Richtung bleibt dort auf dem Vordruck nichts angekreuzt; das soll auffallen. */
function richtungPruefen(): void {
    const fehlt = [
        (maske.elements.namedItem("weg") as HTMLSelectElement).value ? "" : "Übermittlungsweg",
        document.querySelector('input[name="richtung"]:checked') ? "" : "Richtung"
    ].filter(Boolean);
    const hinweis = element<HTMLParagraphElement>("richtung-hinweis");
    hinweis.hidden = fehlt.length === 0 || optionen().vordruck === "meldung";
    hinweis.textContent = `${fehlt.join(" und ")} nicht gewählt: Dort wird auf dem Vordruck nichts angekreuzt.`;
}

function einstellungenLaden(): void {
    try {
        const gespeichert = JSON.parse(speicher()?.getItem(EINSTELLUNGEN_SCHLUESSEL) ?? "null") as Partial<PdfOptionen> | null;
        if (!gespeichert) {
            return;
        }
        for (const [name, wert] of [["vordruck", gespeichert.vordruck], ["blatt", gespeichert.blatt]] as const) {
            const feld = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${wert}"]`);
            if (feld) {
                feld.checked = true;
            }
        }
        const ohne = document.querySelector<HTMLInputElement>('input[name="ohneHintergrund"]');
        if (ohne) {
            ohne.checked = gespeichert.ohneHintergrund === true;
        }
        for (const name of ["versatzX", "versatzY"] as const) {
            const feld = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
            if (feld && typeof gespeichert[name] === "number") {
                feld.value = String(gespeichert[name]);
            }
        }
    } catch {
        // Kaputter Eintrag: Vorgaben aus dem Markup gelten.
    }
}

document.querySelector(".einstellungen")?.addEventListener("change", () => {
    speicher()?.setItem(EINSTELLUNGEN_SCHLUESSEL, JSON.stringify(optionen()));
    einstellungenZeigen();
    felderFuerVordruckZeigen();
    planeVorschau();
    tabelleAnzeigen();
});

// ---- Einzeln: Maske ------------------------------------------------------

const maske = element<HTMLFormElement>("maske");
const ENTWURF_SCHLUESSEL = "bnv.entwurf.v1";

// Verteilerraster: Zeilen S1–S4 und S6, je drei Spalten wie auf dem Bogen.
const raster = element<HTMLTableSectionElement>("verteiler-raster");
for (const zeile of [1, 2, 3, 4, 6]) {
    const tr = document.createElement("tr");
    const kopf = document.createElement("th");
    kopf.scope = "row";
    kopf.textContent = `S${zeile}`;
    tr.append(kopf);
    for (const spalte of [1, 2, 3]) {
        const td = document.createElement("td");
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.name = "verteiler";
        box.value = `S${zeile}/${spalte}`;
        box.setAttribute("aria-label", `S${zeile}, Spalte ${spalte}`);
        label.append(box);
        td.append(label);
        tr.append(td);
    }
    raster.append(tr);
}

function maskeLesen(): Eingabe {
    const formular = new FormData(maske);
    const eingabe: Eingabe = {};
    for (const spalte of SPALTEN) {
        const werte = formular.getAll(spalte.schluessel).map(String);
        eingabe[spalte.schluessel] = werte.join(spalte.schluessel === "verteiler" ? ", " : "");
    }
    return eingabe;
}

function maskeSchreiben(eingabe: Eingabe): void {
    for (const feld of Array.from(maske.elements)) {
        if (!(feld instanceof HTMLInputElement || feld instanceof HTMLSelectElement || feld instanceof HTMLTextAreaElement)) {
            continue;
        }
        const wert = eingabe[feld.name as Schluessel];
        if (wert === undefined) {
            continue;
        }
        if (feld instanceof HTMLInputElement && feld.type === "radio") {
            feld.checked = feld.value === wert;
        } else if (feld instanceof HTMLInputElement && feld.type === "checkbox") {
            feld.checked = feld.name === "verteiler"
                ? wert.split(",").map(teil => teil.trim()).includes(feld.value)
                : wert === feld.value;
        } else {
            feld.value = wert;
        }
    }
}

const vorgaben = maskeLesen();

/** Der Entwurf trägt den Zeitpunkt der letzten Änderung mit; maskeSchreiben übergeht ihn. */
type Entwurf = Eingabe & { _geaendert?: string };

/** Eigener Stand dieses Tabs: übersteht das Neuladen, ohne dass ein zweiter Tab ihn überschreibt. */
function tabSpeicher(): Storage | null {
    try {
        return globalThis.sessionStorage ?? null;
    } catch {
        return null;
    }
}

function entwurfSpeichern(): void {
    const jetzt = new Date();
    const entwurf = JSON.stringify({ ...maskeLesen(), _geaendert: jetzt.toISOString() } satisfies Entwurf);
    // localStorage: für einen neuen Tab oder nach dem Neustart des Browsers.
    speicher()?.setItem(ENTWURF_SCHLUESSEL, entwurf);
    tabSpeicher()?.setItem(ENTWURF_SCHLUESSEL, entwurf);
    entwurfStand.textContent = `Entwurf auf diesem Gerät gespeichert, ${jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr.`;
}

function entwurfEntfernen(): void {
    speicher()?.removeItem(ENTWURF_SCHLUESSEL);
    tabSpeicher()?.removeItem(ENTWURF_SCHLUESSEL);
    entwurfStand.textContent = "";
}

const entwurfStand = element<HTMLParagraphElement>("entwurf-stand");

function weichtAb(eingabe: Eingabe): boolean {
    return SPALTEN.some(spalte => (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? ""));
}

let wiederhergestellt: Entwurf | null = null;
try {
    const entwurf = JSON.parse(tabSpeicher()?.getItem(ENTWURF_SCHLUESSEL)
        ?? speicher()?.getItem(ENTWURF_SCHLUESSEL) ?? "null") as Entwurf | null;
    if (entwurf) {
        maskeSchreiben(entwurf);
        wiederhergestellt = weichtAb(maskeLesen()) ? entwurf : null;
    }
} catch {
    // Kaputter Entwurf: leere Maske.
}

// Belegte Felder im zugeklappten Bereich sichtbar machen: was dort steht, wird mitgedruckt.
const weitere = element<HTMLDetailsElement>("weitere");
const weitereZahl = element<HTMLSpanElement>("weitere-zahl");

function weitereZaehlen(): number {
    const eingabe = maskeLesen();
    const namen = new Set(Array.from(weitere.querySelectorAll<HTMLInputElement>("input"), feld => feld.name as Schluessel));
    let zahl = 0;
    for (const name of namen) {
        const wert = eingabe[name] ?? "";
        if (name === "verteiler") {
            zahl += wert ? wert.split(",").length : 0;
        } else if (wert !== (vorgaben[name] ?? "")) {
            zahl += 1;
        }
    }
    weitereZahl.hidden = zahl === 0;
    weitereZahl.textContent = `${zahl} ${zahl === 1 ? "Angabe" : "Angaben"}`;
    // Titel und Hinweis bleiben von Vordruck zu Vordruck stehen; zugeklappt sollen sie sichtbar sein.
    const rand = [eingabe.titel, eingabe.hinweis].map(wert => (wert ?? "").trim()).filter(Boolean);
    element<HTMLSpanElement>("blattrand-stand").textContent = rand.length > 0
        ? `Gedruckt wird: ${rand.map(wert => `„${kurz(wert, 40)}“`).join(", ")}`
        : "Titel und Hinweis außerhalb des Formulars";
    return zahl;
}

const entwurfHinweis = element<HTMLDivElement>("entwurf-hinweis");

function zeitpunkt(iso: string | undefined): string {
    const datum = iso ? new Date(iso) : null;
    if (!datum || Number.isNaN(datum.getTime())) {
        return "vom letzten Mal";
    }
    const heute = new Date().toDateString() === datum.toDateString();
    const uhr = datum.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    return heute ? `von heute, ${uhr} Uhr` : `vom ${datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${uhr} Uhr`;
}

if (wiederhergestellt) {
    const nummer = wiederhergestellt.nummer?.trim();
    element<HTMLParagraphElement>("entwurf-text").textContent =
        `Angaben ${zeitpunkt(wiederhergestellt._geaendert)} wiederhergestellt${nummer ? ` (Nr. ${nummer})` : ""}. ` +
        "Sie werden so gedruckt, wie sie hier stehen, auch die unter „Vermerke, Quittung und Verteiler“.";
    entwurfHinweis.hidden = false;
    if (weitereZaehlen() > 0) {
        weitere.open = true;
    }
}
weitereZaehlen();

const vorschau = element<HTMLIFrameElement>("einzeln-vorschau");
const einzelnFehler = element<HTMLParagraphElement>("einzeln-fehler");
const textlaenge = element<HTMLParagraphElement>("textlaenge");
const einzelnHinweise = element<HTMLDivElement>("einzeln-hinweise");
const statusText = element<HTMLSpanElement>("einzeln-status-text");
const rueckgaengig = element<HTMLButtonElement>("einzeln-rueckgaengig");
let verlauf: Eintrag[] = ladeVerlauf();

/** Rückmeldung unter den Knöpfen, bei Bedarf mit „Rückgängig“ auf einen früheren Stand. */
let rueckgaengigStand: Eingabe | null = null;
function meldeStatus(text: string, vorher: Eingabe | null = null): void {
    statusText.textContent = text;
    rueckgaengigStand = vorher;
    rueckgaengig.hidden = !vorher;
}

rueckgaengig.addEventListener("click", () => {
    if (!rueckgaengigStand) {
        return;
    }
    maskeSchreiben(rueckgaengigStand);
    entwurfSpeichern();
    weitereZaehlen();
    planeVorschau();
    meldeStatus("Vorheriger Stand wiederhergestellt.");
});
let vorschauUrl = "";
let vorschauTimer: ReturnType<typeof setTimeout> | undefined;

/** Liest die Maske und hält Fehler- und Längenhinweise aktuell. */
function einzelPruefen() {
    const eingabe = maskeLesen();
    const { daten, fehler, hinweise } = zuVordruckDaten(eingabe);
    richtungPruefen();
    einzelnFehler.hidden = fehler.length === 0;
    einzelnFehler.textContent = fehler.join(" · ");
    const frueher = mitNummer(verlauf, daten.nummer).filter(eintrag => JSON.stringify(eintrag.eingabe) !== JSON.stringify(eingabe));
    const letzter = frueher.at(-1);
    if (letzter) {
        const zeit = new Date(letzter.zeit);
        const tag = zeit.toDateString() === new Date().toDateString()
            ? "heute"
            : `am ${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
        hinweise.push(`Nr. ${daten.nummer} wurde schon ${tag} um ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr erstellt (Gegenstelle ${letzter.eingabe.empfaenger || "–"})`);
    }
    // Angaben, die der gewählte Vordruck nicht hat: sie bleiben erhalten, das soll man wissen.
    const ausgeblendet = SPALTEN.filter(spalte => {
        const feld = maske.elements.namedItem(spalte.schluessel);
        const ziel = feld instanceof RadioNodeList ? feld[0] : feld;
        return ziel instanceof HTMLElement && ziel.closest("[data-nur][hidden]")
            && (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? "");
    });
    if (ausgeblendet.length > 0) {
        hinweise.push(`${ausgeblendet.length} ${ausgeblendet.length === 1 ? "Angabe gehört" : "Angaben gehören"} nur zum anderen Vordruck; sie sind ausgeblendet und bleiben gespeichert`);
    }
    einzelnHinweise.hidden = hinweise.length === 0;
    einzelnHinweise.textContent = hinweise.join(" · ");
    const laenge = pruefeTextlaenge(daten.inhalt, optionen().vordruck);
    textlaenge.hidden = !laenge;
    textlaenge.textContent = laenge ? textlaengeMeldung(laenge) : "";
    textlaenge.className = `textlaenge ${laenge && laenge.stufe !== "verkleinert" ? "warnung" : "hinweis"}`;
    return daten;
}

function einzelPdf() {
    return erzeugePdf([einzelPruefen()], optionen());
}

// Telefone zeigen eine PDF im iframe meist gar nicht an. Dann zeigt ein Bild den Vordruck.
const eingebettet = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
const bildvorschau = element<HTMLCanvasElement>("einzeln-bild");
vorschau.hidden = !eingebettet;
bildvorschau.hidden = eingebettet;
element<HTMLElement>("vorschau-ersatz").hidden = eingebettet;

function vorschauAktualisieren(): void {
    if (element<HTMLElement>("ansicht-einzeln").hidden) {
        return;
    }
    if (!eingebettet) {
        void zeichneBildvorschau(bildvorschau, einzelPruefen(), optionen());
        return;
    }
    const pdf = einzelPdf();
    const alt = vorschauUrl;
    vorschauUrl = URL.createObjectURL(pdf.output("blob"));
    // Seitenbreite einpassen, keine Werkzeugleiste: die Vorschau ist ein Blick, kein Betrachter.
    vorschau.src = `${vorschauUrl}#toolbar=0&view=Fit`;
    if (alt) {
        setTimeout(() => URL.revokeObjectURL(alt), 1_000);
    }
}

function planeVorschau(): void {
    clearTimeout(vorschauTimer);
    vorschauTimer = setTimeout(vorschauAktualisieren, 350);
}

function maskeGeaendert(ereignis: Event): void {
    entwurfSpeichern();
    weitereZaehlen();
    meldeStatus("");
    // Bei einem Eingang gehört der Aufnahmevermerk dazu; er steht im zugeklappten Bereich.
    const ziel = ereignis.target;
    if (ziel instanceof HTMLInputElement && ziel.name === "richtung" && ziel.value === "Eingang") {
        weitere.open = true;
    }
    planeVorschau();
}

maske.addEventListener("input", maskeGeaendert);
maske.addEventListener("change", maskeGeaendert);

function setzeFeld(name: string, wert: string): void {
    const feld = maske.elements.namedItem(name) as HTMLInputElement | null;
    if (feld) {
        feld.value = wert;
        feld.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

element<HTMLButtonElement>("jetzt").addEventListener("click", () => setzeFeld("abfassungszeit", datumZeitGruppe(new Date())));

// „Jetzt“ nimmt die Uhr des Geräts; zum Abgleich mit der Uhr der Stelle steht sie daneben.
function geraetezeitZeigen(): void {
    const jetzt = new Date();
    element<HTMLParagraphElement>("geraetezeit").textContent =
        `Datum-Zeit-Gruppe: Tag, Stunde, Minute, Monat, Jahr. „Jetzt“ nimmt die Uhr dieses Geräts: ${datumZeitGruppe(jetzt)} `
        + `(${jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr).`;
}
geraetezeitZeigen();
setInterval(geraetezeitZeigen, 30_000);

// „Jetzt“ bei den Vermerken: Datum TT.MM. und Uhrzeit HH:MM wie auf dem Bogen üblich.
for (const knopf of document.querySelectorAll<HTMLButtonElement>("button[data-jetzt]")) {
    knopf.addEventListener("click", () => {
        const jetzt = new Date();
        const zwei = (zahl: number) => String(zahl).padStart(2, "0");
        const gruppe = knopf.dataset["jetzt"] ?? "";
        setzeFeld(`${gruppe}Uhrzeit`, `${zwei(jetzt.getHours())}:${zwei(jetzt.getMinutes())}`);
        if (gruppe !== "quittung") {
            setzeFeld(`${gruppe}Datum`, `${zwei(jetzt.getDate())}.${zwei(jetzt.getMonth() + 1)}.`);
        }
    });
}

/** Sperrt einen Knopf kurz, damit ein Doppeltipp nicht zweimal herunterlädt. */
function kurzSperren(knopf: HTMLButtonElement): boolean {
    if (knopf.dataset["gesperrt"]) {
        return false;
    }
    knopf.dataset["gesperrt"] = "1";
    setTimeout(() => delete knopf.dataset["gesperrt"], 1_500);
    return true;
}

/** Stand der Maske beim letzten Herunterladen, um ungesicherte Arbeit zu erkennen. */
let zuletztHeruntergeladen = "";

element<HTMLButtonElement>("einzeln-pdf").addEventListener("click", ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    const pdf = einzelPdf();
    const eingabe = maskeLesen();
    const jetzt = new Date();
    const nummer = eingabe.nummer?.trim() ?? "";
    const name = dateiname(optionen(), 1, jetzt, nummer);
    herunterladen(pdf.output("blob"), name);
    // Denselben Stand nicht doppelt in die Liste.
    if (JSON.stringify(eingabe) !== zuletztHeruntergeladen) {
        verlauf = merkeVordruck(eingabe, jetzt);
        verlaufZeigen();
    }
    zuletztHeruntergeladen = JSON.stringify(eingabe);
    const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    meldeStatus(`${name} um ${uhr} Uhr erstellt. Für die nächste Nachricht „Nächster Vordruck“ wählen.`);
});

element<HTMLButtonElement>("einzeln-drucken").hidden = !eingebettet;
element<HTMLButtonElement>("einzeln-drucken").addEventListener("click", ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    // Die Vorschau ist dieselbe PDF; ihr Druckdialog druckt sie ohne Umweg über den Download.
    clearTimeout(vorschauTimer);
    vorschauAktualisieren();
    vorschau.addEventListener("load", () => vorschau.contentWindow?.print(), { once: true });
});

element<HTMLButtonElement>("leere-vordrucke").addEventListener("click", ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    // Ohne Vorab-Kreuze: zuVordruckDaten lässt bei leerer Eingabe alles leer.
    const gewaehlt = optionen();
    const anzahl = gewaehlt.blatt === "a4" && gewaehlt.vordruck !== "beide" ? 2 : 1;
    const leer = Array.from({ length: anzahl }, () => zuVordruckDaten({}).daten);
    herunterladen(erzeugePdf(leer, gewaehlt).output("blob"), dateiname(gewaehlt, anzahl).replace(".pdf", "_leer.pdf"));
});

// ---- Liste erstellter Vordrucke ----------------------------------------

const verlaufBereich = element<HTMLDetailsElement>("verlauf");

function verlaufZeigen(): void {
    verlaufBereich.hidden = verlauf.length === 0;
    element<HTMLSpanElement>("verlauf-zahl").textContent = String(verlauf.length);
    element<HTMLTableSectionElement>("verlauf-liste").replaceChildren(...[...verlauf].reverse().map(eintrag => {
        const tr = document.createElement("tr");
        const zeit = new Date(eintrag.zeit);
        for (const [beschriftung, text] of [
            ["Zeit", `${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`],
            ["Nr.", eintrag.eingabe.nummer ?? ""],
            ["Gegenstelle", eintrag.eingabe.empfaenger ?? ""],
            ["Inhalt", kurz(eintrag.eingabe.inhalt ?? "", 60)]
        ] as const) {
            const td = document.createElement("td");
            td.textContent = text;
            td.dataset["beschriftung"] = beschriftung;
            tr.append(td);
        }
        return tr;
    }));
}

element<HTMLButtonElement>("verlauf-csv").addEventListener("click", () => {
    herunterladen(new Blob([verlaufAlsCsv(verlauf)], { type: "text/csv;charset=utf-8" }), "erstellte-vordrucke.csv");
});
element<HTMLButtonElement>("verlauf-loeschen").addEventListener("click", async () => {
    if (!await frage(`Die Liste mit ${verlauf.length} erstellten Vordrucken von diesem Gerät löschen? Die PDF-Dateien bleiben erhalten.`, "Liste löschen")) {
        return;
    }
    loescheVerlauf();
    verlauf = [];
    verlaufZeigen();
});

// Was „Nächster Vordruck“ stehen lässt: eigene Angaben und Einstellungen, die
// von Nachricht zu Nachricht gleich bleiben. Alles andere gehört zur Nachricht
// und wird geleert, damit nichts davon unbemerkt auf dem nächsten Bogen landet.
const BEHALTEN: readonly Schluessel[] = ["weg", "richtung", "absender", "verfasser", "zeichen", "funktion", "titel", "hinweis"];

async function naechsterVordruck(rueckfrage: boolean): Promise<void> {
    const eingabe = maskeLesen();
    if (rueckfrage && (eingabe.inhalt ?? "").trim() && JSON.stringify(eingabe) !== zuletztHeruntergeladen
        && !await frage("Dieser Vordruck wurde seit der letzten Änderung nicht heruntergeladen. Trotzdem zum nächsten wechseln?", "Zum nächsten Vordruck")) {
        return;
    }
    const neu = Object.fromEntries(SPALTEN.map(spalte => [
        spalte.schluessel,
        BEHALTEN.includes(spalte.schluessel) ? eingabe[spalte.schluessel] ?? "" : vorgaben[spalte.schluessel] ?? ""
    ])) as Eingabe;
    neu.nummer = naechsteNummer(eingabe.nummer ?? "");
    maskeSchreiben(neu);
    entwurfSpeichern();
    weitereZaehlen();
    entwurfHinweis.hidden = true;
    planeVorschau();
    meldeStatus(`Neuer Vordruck${neu.nummer ? ` Nr. ${neu.nummer}` : ""}. Absender, Zeichen, Funktion, Übermittlungsweg und Richtung sind übernommen, alles andere ist leer.`, eingabe);
    (maske.elements.namedItem("empfaenger") as HTMLInputElement).focus();
}

element<HTMLButtonElement>("einzeln-naechster").addEventListener("click", () => void naechsterVordruck(true));
element<HTMLButtonElement>("entwurf-naechster").addEventListener("click", () => void naechsterVordruck(false));
element<HTMLButtonElement>("entwurf-behalten").addEventListener("click", () => {
    entwurfHinweis.hidden = true;
});

element<HTMLButtonElement>("einzeln-oeffnen").addEventListener("click", () => {
    window.open(URL.createObjectURL(einzelPdf().output("blob")), "_blank", "noopener");
});

element<HTMLButtonElement>("einzeln-leeren").addEventListener("click", async () => {
    const eingabe = maskeLesen();
    const belegt = SPALTEN.filter(spalte => (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? ""));
    // Was gerade nicht zu sehen ist, zählt mit; das soll die Rückfrage sagen.
    const verborgen = belegt.filter(spalte => {
        const feld = maske.elements.namedItem(spalte.schluessel);
        const ziel = feld instanceof RadioNodeList ? feld[0] : feld;
        return ziel instanceof HTMLElement && Boolean(ziel.closest("[hidden], details:not([open])"));
    });
    const zusatz = verborgen.length > 0 ? ` (davon ${verborgen.length} in zugeklappten oder ausgeblendeten Bereichen)` : "";
    if (belegt.length > 0 && !await frage(`Alle Felder leeren? ${belegt.length} ausgefüllte Angaben${zusatz} werden geleert. Danach lässt es sich einmal rückgängig machen.`, "Felder leeren")) {
        return;
    }
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(vorgaben);
    entwurfEntfernen();
    weitereZaehlen();
    entwurfHinweis.hidden = true;
    meldeStatus(belegt.length > 0 ? "Alle Felder geleert." : "", belegt.length > 0 ? eingabe : null);
    planeVorschau();
});

// ---- Tabelle -------------------------------------------------------------

let ergebnis: TabellenErgebnis | null = null;
/** Hinweise des Lesens selbst, etwa Formeln ohne Wert. */
let leseHinweise: string[] = [];
let dateiName = "";

element<HTMLButtonElement>("vorlage-xlsx").addEventListener("click", ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    void mitArbeit(knopf, "Vorlage wird erstellt…", async () => {
        const { erzeugeVorlage } = await import("./excel.js");
        herunterladen(await erzeugeVorlage(), "nachrichtenvordruck-vorlage.xlsx");
    });
});

element<HTMLButtonElement>("vorlage-csv").addEventListener("click", () => {
    const csv = schreibeCsv([
        SPALTEN.map(spalte => spalte.titel),
        SPALTEN.map(spalte => spalte.beispiel)
    ]);
    herunterladen(new Blob([csv], { type: "text/csv;charset=utf-8" }), "nachrichtenvordruck-vorlage.csv");
});

async function dateiEinlesen(datei: File): Promise<void> {
    const zusammenfassung = element<HTMLParagraphElement>("ergebnis-zusammenfassung");
    element<HTMLElement>("ergebnis").hidden = false;
    zusammenfassung.textContent = `${datei.name} wird gelesen…`;
    // Lässt sich die neue Datei nicht lesen, bleibt die zuvor geprüfte geladen.
    const vorher = ergebnis ? { ergebnis, dateiName, leseHinweise } : null;
    // Bis die neue Datei gelesen ist, gibt es nichts herunterzuladen; sonst
    // käme eine leere PDF oder die der vorigen Datei.
    ergebnis = null;
    element<HTMLButtonElement>("tabelle-pdf").disabled = true;
    element<HTMLButtonElement>("tabelle-pdf").textContent = "PDF herunterladen";
    element<HTMLButtonElement>("tabelle-oeffnen").disabled = true;
    element<HTMLElement>("ergebnis-warnung").hidden = true;
    element<HTMLElement>("ergebnis-fehler").hidden = true;
    element<HTMLTableElement>("ergebnis-tabelle").tBodies[0]?.replaceChildren();
    try {
        let tabelle: string[][];
        if (/\.xlsx$/i.test(datei.name)) {
            const { leseExcel } = await import("./excel.js");
            const hinweise: string[] = [];
            tabelle = await leseExcel(await datei.arrayBuffer(), hinweise);
            leseHinweise = hinweise;
        } else if (/\.xls$/i.test(datei.name)) {
            throw new Error("Das alte Excel-Format .xls wird nicht gelesen. Bitte in Excel als .xlsx oder CSV speichern.");
        } else if (/\.(csv|tsv|txt)$/i.test(datei.name)) {
            const text = dekodiereCsv(await datei.arrayBuffer());
            // Nullbytes kommen in Text nicht vor, wohl aber in PDF, Bildern oder umbenannten Excel-Dateien.
            if (text.includes("\u0000") || text.startsWith("PK\u0003\u0004") || text.startsWith("%PDF")) {
                throw new Error("Das ist keine Text- oder CSV-Datei. Gelesen werden Excel (.xlsx) und CSV.");
            }
            tabelle = leseCsv(text);
            leseHinweise = [];
        } else {
            throw new Error("Gelesen werden nur Excel (.xlsx) und CSV (.csv, .tsv, .txt).");
        }
        ergebnis = leseTabelle(tabelle);
        dateiName = datei.name;
    } catch (fehler) {
        const meldung = `${datei.name} ließ sich nicht lesen: ${fehler instanceof Error ? fehler.message : String(fehler)}`;
        ergebnis = vorher?.ergebnis ?? null;
        if (vorher) {
            dateiName = vorher.dateiName;
            leseHinweise = vorher.leseHinweise;
            tabelleAnzeigen();
        } else {
            zusammenfassung.textContent = "";
        }
        const kasten = element<HTMLElement>("ergebnis-fehler");
        const satz = document.createElement("p");
        satz.textContent = vorher ? `${meldung} Weiter geladen ist ${vorher.dateiName}.` : meldung;
        kasten.prepend(satz);
        kasten.hidden = false;
        return;
    }
    tabelleAnzeigen();
    element<HTMLElement>("ergebnis").scrollIntoView({ block: "start" });
}

function kurz(text: string, laenge: number): string {
    const einzeilig = text.replace(/\s+/g, " ").trim();
    return einzeilig.length > laenge ? `${einzeilig.slice(0, laenge - 1)}…` : einzeilig;
}

function tabelleAnzeigen(): void {
    if (!ergebnis) {
        return;
    }
    const { zeilen, unbekannteSpalten, beispielZeilen } = ergebnis;
    const mitFehler = zeilen.filter(zeile => zeile.fehler.length > 0);
    const { vordruck } = optionen();
    const art = { nachricht: "Nachrichtenvordrucke", meldung: "Meldevordrucke", beide: "Nachrichten- und Meldevordrucke" }[vordruck];

    element<HTMLParagraphElement>("ergebnis-zusammenfassung").textContent = ergebnis.bekannteSpalten === 0
        ? `In der ersten Zeile von ${dateiName} steht kein bekannter Spaltenkopf (z. B. „Nr“, „Empfänger“, „Inhalt“). Am einfachsten die Vorlage holen und die Daten dort einfügen.`
        : zeilen.length === 0
            ? `In ${dateiName} steht unter der Kopfzeile keine ausgefüllte Zeile.`
            : `${dateiName}: ${zeilen.length} ${zeilen.length === 1 ? "Zeile" : "Zeilen"} → ${art}.`;

    const warnung = element<HTMLElement>("ergebnis-warnung");
    // Gedruckt wird trotzdem; das soll vor dem Download auffallen.
    const auffaellig = [...leseHinweise, ...zeilen.flatMap(zeile => {
        const laenge = pruefeTextlaenge(zeile.daten.inhalt, vordruck);
        const punkte = [...zeile.hinweise, ...laenge && laenge.stufe !== "verkleinert" ? [textlaengeMeldung(laenge)] : []];
        return punkte.length > 0 ? [`Zeile ${zeile.zeile}: ${punkte.join("; ")}`] : [];
    })];
    warnung.replaceChildren();
    if (beispielZeilen.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `${beispielZeilen.length === 1 ? "Zeile" : "Zeilen"} ${beispielZeilen.join(", ")} ist die unveränderte Beispielzeile aus der Vorlage und wird nicht gedruckt.`;
        warnung.append(satz);
    }
    if (unbekannteSpalten.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `Diese Spalten sind unbekannt und werden ignoriert: ${unbekannteSpalten.join(", ")}.`;
        warnung.append(satz);
    }
    if (auffaellig.length > 0) {
        const liste = document.createElement("ul");
        const zeigen = [...auffaellig.slice(0, 20), ...auffaellig.length > 20 ? [`… und ${auffaellig.length - 20} weitere`] : []];
        liste.append(...zeigen.map(text => {
            const punkt = document.createElement("li");
            punkt.textContent = text;
            return punkt;
        }));
        warnung.append(liste);
    }
    warnung.hidden = warnung.childElementCount === 0;

    const fehlerKasten = element<HTMLElement>("ergebnis-fehler");
    fehlerKasten.hidden = mitFehler.length === 0;
    fehlerKasten.replaceChildren();
    if (mitFehler.length > 0) {
        const satz = document.createElement("p");
        satz.textContent = `${mitFehler.length} ${mitFehler.length === 1 ? "Zeile hat" : "Zeilen haben"} Fehler, in der Übersicht mit ⚠ markiert. Ungültige Auswahlwerte bleiben auf dem Vordruck leer, nicht druckbare Zeichen werden ersetzt. Besser in der Datei korrigieren und neu einlesen.`;
        const liste = document.createElement("ul");
        for (const zeile of mitFehler.slice(0, 20)) {
            const punkt = document.createElement("li");
            punkt.textContent = `Zeile ${zeile.zeile}: ${zeile.fehler.join("; ")}`;
            liste.append(punkt);
        }
        if (mitFehler.length > 20) {
            const punkt = document.createElement("li");
            punkt.textContent = `… und ${mitFehler.length - 20} weitere`;
            liste.append(punkt);
        }
        fehlerKasten.append(satz, liste);
    }

    const tbody = element<HTMLTableElement>("ergebnis-tabelle").tBodies[0];
    tbody?.replaceChildren(...zeilen.map(zeile => {
        const tr = document.createElement("tr");
        tr.classList.toggle("mit-fehler", zeile.fehler.length > 0);
        // Gelesene Auswahlwerte, damit ein verworfener Vorrang hier als leer auffällt.
        const auswahl = (wert: string | undefined) => wert ? wert.charAt(0).toUpperCase() + wert.slice(1) : "–";
        const zellen = [
            ["Zeile", zeile.fehler.length > 0 ? `${zeile.zeile} ⚠` : String(zeile.zeile), "zahl"],
            ["Nr.", zeile.daten.nummer, "zahl"],
            ["Vorrang", auswahl(zeile.daten.vorrang), ""],
            ["Richtung", auswahl(zeile.daten.richtung), ""],
            ["Gegenstelle", zeile.daten.empfaenger.join(", "), ""],
            ["Inhalt", kurz(zeile.daten.inhalt, 90), "inhalt"],
            ["Absender", zeile.daten.absender, ""]
        ] as const;
        for (const [beschriftung, text, klasse] of zellen) {
            const td = document.createElement("td");
            td.textContent = text;
            // Am Telefon wird jede Zeile zur Karte, die Spaltenköpfe stehen dann vor den Werten.
            td.dataset["beschriftung"] = beschriftung;
            if (klasse) {
                td.className = klasse;
            }
            tr.append(td);
        }
        return tr;
    }));

    const pdfKnopf = element<HTMLButtonElement>("tabelle-pdf");
    pdfKnopf.disabled = zeilen.length === 0;
    // Mit „Beide“ entstehen je Zeile zwei Vordrucke.
    const anzahl = zeilen.length * (vordruck === "beide" ? 2 : 1);
    pdfKnopf.textContent = `PDF herunterladen (${anzahl} ${anzahl === 1 ? "Vordruck" : "Vordrucke"})`;
    element<HTMLButtonElement>("tabelle-oeffnen").disabled = zeilen.length === 0;
}

function tabellenPdf() {
    return erzeugePdf((ergebnis?.zeilen ?? []).map(zeile => zeile.daten), optionen());
}

element<HTMLButtonElement>("tabelle-pdf").addEventListener("click", async ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    const mitFehler = (ergebnis?.zeilen ?? []).filter(zeile => zeile.fehler.length > 0);
    const erste = mitFehler[0];
    if (erste && !await frage(
        `${mitFehler.length} ${mitFehler.length === 1 ? "Zeile hat" : "Zeilen haben"} Fehler, etwa Zeile ${erste.zeile}: ${erste.fehler[0]}. `
        + "Betroffene Felder bleiben leer oder werden ersetzt. Trotzdem die PDF erzeugen?",
        "Trotzdem erzeugen"
    )) {
        return;
    }
    void mitArbeit(knopf, "PDF wird erstellt…", async () => {
        // Einen Takt warten, damit der Knopf seinen Arbeitszustand zeigt, bevor jsPDF rechnet.
        await new Promise(fertig => setTimeout(fertig, 30));
        herunterladen(tabellenPdf().output("blob"), dateiname(optionen(), ergebnis?.zeilen.length ?? 0, new Date()));
    });
});

element<HTMLButtonElement>("tabelle-oeffnen").addEventListener("click", () => {
    window.open(URL.createObjectURL(tabellenPdf().output("blob")), "_blank", "noopener");
});

const dateiFeld = element<HTMLInputElement>("datei");
dateiFeld.addEventListener("change", () => {
    const datei = dateiFeld.files?.[0];
    if (datei) {
        void dateiEinlesen(datei);
    }
    dateiFeld.value = "";
});

const dateiZiel = element<HTMLLabelElement>("datei-ziel");
dateiZiel.addEventListener("dragover", ereignis => {
    ereignis.preventDefault();
    dateiZiel.classList.add("ueber");
});
dateiZiel.addEventListener("dragleave", () => dateiZiel.classList.remove("ueber"));
// Eine Datei, die neben der Ablagefläche landet, würde der Browser selbst öffnen
// und die App verlassen. Im Tabellenreiter gilt deshalb die ganze Seite als
// Ablage, im Einzelreiter wird der Fehlwurf nur abgefangen.
addEventListener("dragover", ereignis => {
    if (ereignis.dataTransfer?.types.includes("Files")) {
        ereignis.preventDefault();
    }
});
addEventListener("drop", ereignis => {
    if (!ereignis.dataTransfer?.types.includes("Files")) {
        return;
    }
    ereignis.preventDefault();
    dateiZiel.classList.remove("ueber");
    const datei = ereignis.dataTransfer.files[0];
    if (datei && !element<HTMLElement>("ansicht-tabelle").hidden) {
        void dateiEinlesen(datei);
    }
});

// Eine eingelesene Tabelle wird nicht gespeichert; vor dem Neuladen fragt der Browser nach.
addEventListener("beforeunload", ereignis => {
    if (ergebnis && ergebnis.zeilen.length > 0) {
        ereignis.preventDefault();
    }
});

// ---- Start ---------------------------------------------------------------

einstellungenLaden();
einstellungenZeigen();
felderFuerVordruckZeigen();
verlaufZeigen();
element<HTMLParagraphElement>("laedt").hidden = true;

// Am Telefon stehen die Einstellungen sonst vor der eigentlichen Arbeit; der Kopf
// zeigt zugeklappt, was gewählt ist. Am breiten Bildschirm bleiben sie offen.
element<HTMLDetailsElement>("einstellungen").open = matchMedia("(min-width: 64rem)").matches;

element<HTMLButtonElement>("zur-vorschau").addEventListener("click", () => {
    (document.activeElement as HTMLElement | null)?.blur();
    element<HTMLElement>(eingebettet ? "abschluss" : "vorschau-titel").scrollIntoView({ block: "start", behavior: "smooth" });
});

// Ohne Netz geht alles weiter; das soll man sehen, statt es zu vermuten.
function netzZeigen(): void {
    element<HTMLParagraphElement>("netz-stand").hidden = navigator.onLine;
}
addEventListener("online", netzZeigen);
addEventListener("offline", netzZeigen);
netzZeigen();
zeigeReiter(location.hash === "#tabelle" ? "tabelle" : "einzeln", false, "ersetzen");

// Nach dem ersten Aufruf startet die Seite aus dem Cache, auch ohne Netz.
// Der Dienst entsteht erst beim Bauen (web/vite.config.ts), im Entwicklungsserver gibt es ihn nicht.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
            element<HTMLElement>("offline-stand").hidden = false;
        })
        .catch(() => {
            // Ohne Dienst läuft die Seite wie bisher, nur nicht ohne Netz.
        });
}
