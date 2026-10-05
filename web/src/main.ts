/// <reference types="vite/client" />

/** Bauzeitpunkt, von web/vite.config.ts eingesetzt. */
declare const __FASSUNG__: string;
import "./seite.js";
import { zeichneBildvorschau } from "./bildvorschau.js";
import { dekodiereCsv, schreibeCsv, leseCsv } from "./csv.js";
import { VordruckDaten as VordruckDatenKlasse, type VordruckDaten } from "../../src/index.js";
import { dateiname, erzeugePdf, type Blattformat, type PdfOptionen, type VordruckWahl } from "./pdf.js";
import { gekuerzteFelder, gekuerztMeldung, istKritisch, pruefeTextlaenge, pruefvermerk, teileInhalt, textlaengeMeldung } from "./textlaenge.js";
import { HOECHSTENS, verlaufKennung, ladeVerlauf, loescheVerlauf, merkeVordruck, merkeVordrucke, mitNummer, setzeVerlauf, verlaufAlsCsv, type Eintrag } from "./verlauf.js";
import {
    SPALTEN,
    UNMOEGLICH,
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
    return frageWahl(text, ja, nein).then(wahl => wahl === "ja");
}

/** Wie `frage`, mit einem dritten Knopf `dritte`; ergibt „ja“, „dritte“ oder „nein“. */
function frageWahl(text: string, ja: string, nein = "Abbrechen", dritte = ""): Promise<"ja" | "nein" | "dritte"> {
    const dialog = element<HTMLDialogElement>("frage");
    if (typeof dialog.showModal !== "function") {
        return Promise.resolve(confirm(text) ? "ja" : "nein");
    }
    element<HTMLParagraphElement>("frage-text").textContent = text;
    element<HTMLButtonElement>("frage-ja").textContent = ja;
    element<HTMLButtonElement>("frage-nein").textContent = nein;
    element<HTMLButtonElement>("frage-dritte").textContent = dritte;
    element<HTMLButtonElement>("frage-dritte").hidden = !dritte;
    dialog.returnValue = "";
    dialog.showModal();
    element<HTMLButtonElement>("frage-nein").focus();
    // Ein Doppeltipp auf den auslösenden Knopf darf die Rückfrage nicht gleich bestätigen:
    // die weiterführenden Knöpfe nehmen erst nach einer halben Sekunde Tipps an.
    // „Abbrechen“ bleibt sofort bedienbar: Es ist die sichere Wahl.
    const sperren = [element<HTMLButtonElement>("frage-ja"), element<HTMLButtonElement>("frage-dritte")];
    for (const knopf of sperren) {
        knopf.disabled = true;
    }
    setTimeout(() => {
        for (const knopf of sperren) {
            knopf.disabled = false;
        }
        if (dialog.open) {
            element<HTMLButtonElement>("frage-nein").focus();
        }
    }, 600);
    return new Promise(fertig => dialog.addEventListener("close", () => {
        const wert = dialog.returnValue;
        fertig(wert === "ja" || wert === "dritte" ? wert : "nein");
    }, { once: true }));
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
    // Eine Kurzmeldung gehört zum Reiter, auf dem sie entstand.
    document.getElementById("kurzmeldung")?.setAttribute("hidden", "");
    einstellungenZeigen();
}

addEventListener("popstate", () => {
    // Zurück-Taste bei offener Rückfrage: wie „Abbrechen“, der Reiter dahinter bleibt.
    const dialog = document.getElementById("frage") as HTMLDialogElement | null;
    if (dialog?.open) {
        const offen = REITER.find(reiter => !reiter.ansicht.hidden)?.name ?? "einzeln";
        history.pushState(null, "", offen === "einzeln" ? location.pathname + location.search : `#${offen}`);
        dialog.close("nein");
        return;
    }
    zeigeReiter(location.hash === "#tabelle" ? "tabelle" : "einzeln", false, "keiner");
});

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

/** Zusammenfassung der Einstellungen im zugeklappten Kopf, damit „ohne Formular“ nicht übersehen wird. */
function einstellungenZeigen(): void {
    const gewaehlt = optionen();
    const text = (name: string) =>
        document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.parentElement?.textContent?.trim() ?? "";
    const teile = [text("vordruck"), text("blatt")];
    if (gewaehlt.ohneHintergrund) {
        const versatz = gewaehlt.versatzX || gewaehlt.versatzY
            ? ` (verschoben ${[gewaehlt.versatzX ?? 0, gewaehlt.versatzY ?? 0].map(mm => mm.toLocaleString("de-DE")).join(" / ")} mm)`
            : "";
        teile.push(`ohne Formular${versatz}`);
    }
    element<HTMLSpanElement>("einstellungen-stand").textContent = teile.join(" · ");
    // Wie am Tabellenknopf: eine gemerkte Einstellung soll beim Download nicht überraschen.
    element<HTMLButtonElement>("einzeln-pdf").textContent = gewaehlt.ohneHintergrund ? "PDF herunterladen (ohne Formular)" : "PDF herunterladen";
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
    // Der Meldevordruck hat keine Richtung, aber auch „Übermittelt“ mit Funk, Kurier, Telefon und Fax.
    const meldung = optionen().vordruck === "meldung";
    const fehlt = [
        (maske.elements.namedItem("weg") as HTMLSelectElement).value ? "" : "Übermittlungsweg",
        meldung || document.querySelector('input[name="richtung"]:checked') ? "" : "Richtung"
    ].filter(Boolean);
    const hinweis = element<HTMLParagraphElement>("richtung-hinweis");
    hinweis.hidden = fehlt.length === 0;
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

document.querySelector(".einstellungen")?.addEventListener("change", ereignis => {
    // Was gedruckt wird, soll auch im Feld stehen: ±20 mm.
    const feld = ereignis.target;
    if (feld instanceof HTMLInputElement && (feld.name === "versatzX" || feld.name === "versatzY")) {
        feld.value = String(versatzWert(feld.name));
    }
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

/**
 * Die Vorgaben der Maske aus dem HTML, nicht aus den aktuellen Feldern: Wer vor
 * dem Start der App schon getippt hat, dessen Text ist keine Vorgabe.
 */
function vorgabenLesen(): Eingabe {
    const vorgabe: Eingabe = {};
    for (const spalte of SPALTEN) {
        const werte: string[] = [];
        const feld = maske.elements.namedItem(spalte.schluessel);
        const felder = feld instanceof RadioNodeList ? Array.from(feld) : feld ? [feld] : [];
        for (const einzeln of felder) {
            if (einzeln instanceof HTMLInputElement && (einzeln.type === "radio" || einzeln.type === "checkbox")) {
                if (einzeln.defaultChecked) {
                    werte.push(einzeln.value);
                }
            } else if (einzeln instanceof HTMLSelectElement) {
                const gewaehlt = Array.from(einzeln.options).find(option => option.defaultSelected) ?? einzeln.options[0];
                werte.push(gewaehlt?.value ?? "");
            } else if (einzeln instanceof HTMLInputElement || einzeln instanceof HTMLTextAreaElement) {
                werte.push(einzeln.defaultValue);
            }
        }
        vorgabe[spalte.schluessel] = werte.join(spalte.schluessel === "verteiler" ? ", " : "");
    }
    return vorgabe;
}
const vorgaben = vorgabenLesen();

// Was „Nächster Vordruck“ stehen lässt: Angaben, die von Nachricht zu Nachricht
// gleich bleiben. Alles andere gehört zur Nachricht und wird geleert, damit
// nichts davon unbemerkt auf dem nächsten Bogen landet. Nach einem Ausgang sind
// Absender, Zeichen und Funktion die eigenen, nach einem Eingang die der Gegenstelle.
const BEHALTEN_AUSGANG: readonly Schluessel[] = ["weg", "richtung", "absender", "verfasser", "zeichen", "funktion", "titel", "hinweis"];
const BEHALTEN_EINGANG: readonly Schluessel[] = ["weg", "richtung", "titel", "hinweis"];

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
    if ((window as Window & { bnvVorStartGetippt?: boolean }).bnvVorStartGetippt && weichtAb(maskeLesen())) {
        // Vor dem Start Getipptes gilt; ein älterer Entwurf kommt in die Ablage statt darüber.
        if (entwurf && (entwurf.inhalt ?? "").trim()) {
            const { _geaendert: _, ...alt } = entwurf;
            const ablage = JSON.parse(speicher()?.getItem("bnv.ablage.v1") ?? "[]") as unknown[];
            speicher()?.setItem("bnv.ablage.v1", JSON.stringify([...ablage, { eingabe: alt, wie: "vor dem Start ersetzt", zeit: new Date().toISOString() }].slice(-10)));
        }
        entwurfSpeichern();
    } else if (entwurf) {
        maskeSchreiben(entwurf);
        // Ein leerer Folgevordruck (nur übernommene Angaben, kein Text) braucht keinen Hinweis.
        wiederhergestellt = weichtAb(maskeLesen()) && (entwurf.inhalt ?? "").trim() ? entwurf : null;
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
    // Im Raster ist ein Kreuz in der falschen Zeile leicht übersehen; als Text fällt es auf.
    const verteiler = (eingabe.verteiler ?? "").trim();
    element<HTMLParagraphElement>("verteiler-stand").textContent = verteiler ? `Angekreuzt: ${verteiler}` : "Nichts angekreuzt.";
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
    const stand = JSON.stringify(maskeLesen());
    const erstellt = ladeVerlauf().find(eintrag => JSON.stringify(eintrag.eingabe) === stand);
    const erstelltText = erstellt
        ? `schon als PDF erstellt ${zeitpunkt(erstellt.zeit).replace(/^von /, "").replace(/^vom /, "am ")}`
        : "noch nicht als PDF erstellt";
    // Eine Zeile zum Erfassen, der Rest klein darunter.
    const kopf = document.createElement("strong");
    kopf.textContent = `${nummer ? `Nr. ${nummer}` : "Entwurf"} ${zeitpunkt(wiederhergestellt._geaendert)} wiederhergestellt: ${erstelltText}.`;
    const zusatz = document.createElement("span");
    zusatz.className = "nebentext";
    zusatz.id = "entwurf-zusatz";
    zusatz.textContent = weitereZaehlen() > 0 ? "Gedruckt wird, was hier steht, auch unter „Vermerke, Quittung und Verteiler“." : "";
    element<HTMLParagraphElement>("entwurf-text").replaceChildren(kopf, " ", zusatz);
    // Noch nicht erstellt: Weiterarbeiten ist der sichere Hauptweg, nicht das Leeren.
    if (!erstellt) {
        const behalten = element<HTMLButtonElement>("entwurf-behalten");
        const naechster = element<HTMLButtonElement>("entwurf-naechster");
        behalten.classList.add("primaer");
        naechster.classList.remove("primaer");
        behalten.after(naechster);
    }
    entwurfHinweis.hidden = false;
    if (weitereZaehlen() > 0) {
        weitere.open = true;
    }
    // Sonst springt der Browser an die alte Stelle, und der Hinweis oben bleibt ungesehen.
    // scrollRestoration setzt schon das Skript im Kopf der Seite; das hier ist die Absicherung.
    history.scrollRestoration = "manual";
    scrollTo(0, 0);
    // Im flachen Querformat steht der Hinweis sonst unter dem Kopf außer Sicht.
    if (innerHeight < 480) {
        entwurfHinweis.scrollIntoView({ block: "start" });
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

/**
 * Die Einträge der letzten 24 Stunden. Nummern früherer Übungen oder Einsätze
 * auf diesem Gerät sollen weder als doppelt gelten noch übersprungen werden.
 */
function juengste(): Eintrag[] {
    const grenze = Date.now() - 24 * 60 * 60 * 1000;
    return verlauf.filter(eintrag => new Date(eintrag.zeit).getTime() >= grenze);
}

/**
 * Rückmeldung unter den Knöpfen, bei Bedarf mit einem Knopf, der die Aktion
 * zurücknimmt. Er nennt die Aktion und gilt nur, bis wieder getippt wird:
 * danach würde er frisch Geschriebenes verwerfen. Er liegt im Sitzungsspeicher
 * des Tabs und übersteht so ein Neuladen.
 */
interface Zuruecknahme {
    /** Stand der Maske vor der Aktion. */
    stand: Eingabe;
    /** Die Aktion, wie sie auf dem Knopf heißt. */
    aktion: string;
    /** Eigene Beschriftung des Knopfs, sonst „„Aktion“ zurücknehmen (Nr. …)“. */
    beschriftung?: string;
}
const RUECKGAENGIG_SCHLUESSEL = "bnv.rueckgaengig.v2";
let zuruecknahme: Zuruecknahme | null = null;
try {
    const gespeichert = JSON.parse(tabSpeicher()?.getItem(RUECKGAENGIG_SCHLUESSEL) ?? "null") as Zuruecknahme | null;
    zuruecknahme = gespeichert?.stand && gespeichert.aktion ? gespeichert : null;
} catch {
    zuruecknahme = null;
}
const kurzmeldung = element<HTMLDivElement>("kurzmeldung");
const kurzmeldungRueckgaengig = element<HTMLButtonElement>("kurzmeldung-rueckgaengig");

function zuruecknahmeZeigen(): void {
    const nummer = zuruecknahme?.stand.nummer?.trim();
    const beschriftung = !zuruecknahme
        ? ""
        : zuruecknahme.beschriftung ?? `„${zuruecknahme.aktion}“ zurücknehmen${nummer ? ` (zurück zu Nr. ${nummer})` : ""}`;
    rueckgaengig.hidden = !zuruecknahme;
    rueckgaengig.textContent = beschriftung;
    const oben = document.getElementById("oben-rueckgaengig");
    if (oben?.parentElement) {
        oben.parentElement.hidden = !zuruecknahme;
        oben.textContent = beschriftung;
    }
    if (!zuruecknahme) {
        document.getElementById("entwurf-rueckgaengig")?.setAttribute("hidden", "");
    }
    if (zuruecknahme) {
        tabSpeicher()?.setItem(RUECKGAENGIG_SCHLUESSEL, JSON.stringify(zuruecknahme));
    } else {
        tabSpeicher()?.removeItem(RUECKGAENGIG_SCHLUESSEL);
    }
}
zuruecknahmeZeigen();

/** Ob ein Element ganz im sichtbaren Bereich liegt. */
function imBild(knoten: HTMLElement): boolean {
    const rahmen = knoten.getBoundingClientRect();
    return rahmen.height > 0 && rahmen.top >= 0 && rahmen.bottom <= innerHeight;
}

/**
 * Setzt die Rückmeldung. `zurueck`: Stand und Name der Aktion, die sich
 * zurücknehmen lässt; `null` nimmt ein früheres Zurücknehmen weg, „behalten“
 * lässt es stehen. `woanders`: Der Blick ist woanders (etwa oben im ersten
 * Feld), die Rückmeldung kommt zusätzlich als Kurzmeldung. Sonst wird sie
 * ins Bild geholt, falls sie knapp darunter liegt.
 */
function meldeStatus(text: string, zurueck: Zuruecknahme | null | "behalten" = null, woanders = false): void {
    statusText.textContent = text;
    if (zurueck !== "behalten") {
        zuruecknahme = zurueck;
        zuruecknahmeZeigen();
    }
    if (text && woanders) {
        zeigeKurzmeldung(zuruecknahme ? `${text} Zurücknehmen: oben über der Maske.` : text);
    } else {
        kurzmeldungSchliessen();
        if (text && !imBild(statusText)) {
            statusText.parentElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }
}

/**
 * Kurzmeldung am unteren Bildschirmrand: Wer unten „Nächster Vordruck“ tippt,
 * landet oben im ersten Feld und sähe die Rückmeldung unter den Knöpfen nicht.
 * Sie schließt beim ersten Tippen in der Maske und beim Reiterwechsel.
 */
let kurzmeldungUhr: ReturnType<typeof setTimeout> | undefined;
// Die Kurzmeldung ist reine Anzeige ohne Knöpfe und lässt Tipps durch: Sie liegt
// dort, wo sonst die Sprungleiste oder ein Knopf ist, und darf nichts auslösen.
function zeigeKurzmeldung(text: string, _mitZuruecknahme = false): void {
    element<HTMLSpanElement>("kurzmeldung-text").textContent = text;
    kurzmeldungRueckgaengig.hidden = true;
    kurzmeldung.hidden = false;
    clearTimeout(kurzmeldungUhr);
    kurzmeldungUhr = setTimeout(kurzmeldungSchliessen, 7_000);
}
function kurzmeldungSchliessen(): void {
    clearTimeout(kurzmeldungUhr);
    kurzmeldung.hidden = true;
}
document.getElementById("oben-rueckgaengig")?.addEventListener("click", () => rueckgaengig.click());
kurzmeldungRueckgaengig.addEventListener("click", () => {
    kurzmeldungSchliessen();
    rueckgaengig.click();
});
element<HTMLButtonElement>("kurzmeldung-schliessen").addEventListener("click", kurzmeldungSchliessen);
kurzmeldung.addEventListener("click", ereignis => {
    ereignis.stopPropagation();
    kurzmeldungSchliessen();
});

rueckgaengig.addEventListener("click", () => {
    if (!zuruecknahme) {
        return;
    }
    const { stand, aktion } = zuruecknahme;
    const jetzt = maskeLesen();
    // Der zurückgenommene Stand ist wieder in der Maske; als Ablage-Eintrag wäre er doppelt.
    ablageEntfernen(stand);
    entwurfHinweis.hidden = true;
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(stand);
    entwurfSpeichern();
    weitereZaehlen();
    angefasstZuruecksetzen();
    planeVorschau();
    // Das Zurücknehmen lässt sich seinerseits zurücknehmen: nichts geht verloren.
    const zurueckNr = jetzt.nummer?.trim();
    meldeStatus(aktion === "Zurücknehmen"
        ? `Wieder der Stand${stand.nummer?.trim() ? ` mit Nr. ${stand.nummer.trim()}` : ""}.`
        : `„${aktion}“ zurückgenommen, voriger Stand${stand.nummer?.trim() ? ` (Nr. ${stand.nummer.trim()})` : ""} wiederhergestellt.`,
        weichtAb(jetzt) ? { stand: jetzt, aktion: "Zurücknehmen", beschriftung: zurueckNr ? `Doch wieder Nr. ${zurueckNr}` : "Doch wieder den Stand davor" } : null);
});
/**
 * Ablage für nie erstellte Vordrucke, die „Nächster Vordruck“, „Felder leeren“
 * oder ein Zurückholen aus der Maske genommen hat. Bis zu zehn, im
 * Gerätespeicher: Sie überstehen Tippen, Neuladen und einen neuen Tab. Ein
 * Stand verschwindet aus der Ablage, wenn er zurückgeholt oder seine Nr.
 * erstellt wird.
 */
interface Abgelegt {
    eingabe: Eingabe;
    /** Wie er aus der Maske kam: „verworfen“, „geleert“ oder „getauscht“. */
    wie: string;
    zeit: string;
}
const ABLAGE_SCHLUESSEL = "bnv.ablage.v1";
const ABLAGE_HOECHSTENS = 10;
function ablageLesen(): Abgelegt[] {
    try {
        const daten = JSON.parse(speicher()?.getItem(ABLAGE_SCHLUESSEL) ?? "[]") as unknown;
        return Array.isArray(daten) ? daten as Abgelegt[] : [];
    } catch {
        return [];
    }
}
function ablageSchreiben(liste: readonly Abgelegt[]): void {
    if (liste.length > 0) {
        speicher()?.setItem(ABLAGE_SCHLUESSEL, JSON.stringify(liste.slice(-ABLAGE_HOECHSTENS)));
    } else {
        speicher()?.removeItem(ABLAGE_SCHLUESSEL);
    }
    ablageZeigen();
}
/** Legt einen nicht erstellten Stand mit Text ab; derselbe Stand liegt nur einmal darin. */
function ablegen(eingabe: Eingabe, wie: string): void {
    if (!(eingabe.inhalt ?? "").trim() || istErstellt(eingabe)) {
        return;
    }
    const kennung = verlaufKennung(eingabe);
    ablageSchreiben([...ablageLesen().filter(eintrag => verlaufKennung(eintrag.eingabe) !== kennung),
        { eingabe, wie, zeit: new Date().toISOString() }]);
}
/** Nimmt Stände aus der Ablage: denselben Stand, oder bei `nummer` alle mit dieser Nr. */
function ablageEntfernen(eingabe: Eingabe, nummer = false): void {
    const kennung = verlaufKennung(eingabe);
    const nr = (eingabe.nummer ?? "").trim();
    const vorher = ablageLesen();
    const nachher = vorher.filter(eintrag => verlaufKennung(eintrag.eingabe) !== kennung
        && !(nummer && nr && (eintrag.eingabe.nummer ?? "").trim() === nr));
    if (nachher.length !== vorher.length) {
        ablageSchreiben(nachher);
    }
}
function ablageZeigen(): void {
    const liste = ablageLesen();
    const bereich = element<HTMLDivElement>("verworfen");
    bereich.hidden = liste.length === 0;
    const WIE: Record<string, string> = { verworfen: "verworfen", geleert: "geleert", getauscht: "beim Zurückholen abgelegt" };
    bereich.replaceChildren(...[...liste].reverse().map((eintrag, index) => {
        const nummer = eintrag.eingabe.nummer?.trim();
        const zeit = new Date(eintrag.zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const knopf = document.createElement("button");
        knopf.type = "button";
        knopf.className = "link";
        knopf.textContent = `Nicht erstellten Vordruck${nummer ? ` Nr. ${nummer}` : ""} („${kurz(eintrag.eingabe.inhalt ?? "", 30)}“, ${WIE[eintrag.wie] ?? eintrag.wie} ${zeit} Uhr) zurückholen`;
        knopf.addEventListener("click", () => void zurueckholen(liste.length - 1 - index));
        const zeile = document.createElement("p");
        zeile.className = "nebentext";
        zeile.append(knopf);
        return zeile;
    }));
}
ablageZeigen();

/**
 * Holt einen abgelegten Stand in die Maske. Was dort stand und nicht erstellt
 * ist, kommt seinerseits in die Ablage: nichts geht verloren, auch nicht beim
 * Weitertippen.
 */
async function zurueckholen(index: number): Promise<void> {
    const eintrag = ablageLesen()[index];
    if (!eintrag) {
        return;
    }
    const geholt = eintrag.eingabe;
    const jetzt = maskeLesen();
    const jetztNr = jetzt.nummer?.trim();
    const jetztAblegen = Boolean((jetzt.inhalt ?? "").trim()) && !istErstellt(jetzt);
    if (jetztAblegen && !await frage(`Vordruck${geholt.nummer?.trim() ? ` Nr. ${geholt.nummer.trim()}` : ""} zurückholen? Die jetzigen Eingaben${jetztNr ? ` (Nr. ${jetztNr})` : ""} kommen dafür in die Ablage darunter und lassen sich ebenso zurückholen.`, "Zurückholen")) {
        return;
    }
    ablageEntfernen(geholt);
    if (jetztAblegen) {
        ablegen(jetzt, "getauscht");
    }
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(geholt);
    entwurfSpeichern();
    weitereZaehlen();
    angefasstZuruecksetzen();
    planeVorschau();
    entwurfHinweis.hidden = true;
    meldeStatus(`Vordruck${geholt.nummer?.trim() ? ` Nr. ${geholt.nummer.trim()}` : ""} zurückgeholt.${jetztAblegen ? ` Nr. ${jetztNr ?? ""} liegt jetzt in der Ablage darunter.` : ""}`);
}

let vorschauUrl = "";
let vorschauTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Angaben, die nach einer neuen Nr. noch unverändert vom zuletzt erstellten
 * Vordruck stehen und seitdem nicht angefasst wurden, als Satz mit Werten;
 * leer, wenn es keine gibt. Was von Nachricht zu Nachricht gleich bleibt,
 * zählt nicht.
 */
function altwerte(eingabe: Eingabe): string {
    const felder = altFelder(eingabe);
    if (felder.length === 0) {
        return "";
    }
    const werte = felder.slice(0, 4).map(spalte => `${spalte.titel} „${kurz(eingabe[spalte.schluessel] ?? "", 20)}“`);
    const liste = felder.length > 4 ? `${werte.join(", ")} und ${felder.length - 4} weitere` : aufzaehlen(werte);
    return `Von Nr. ${verlauf.at(-1)?.eingabe.nummer?.trim() ?? ""} stehen geblieben: ${liste}. Bitte prüfen; beim Erzeugen lassen sie sich leeren`;
}

/**
 * Die Felder hinter `altwerte`. Bei einem Eingang zählen auch Absender, Zeichen
 * und Funktion: Sie gehören der sendenden Stelle und wechseln mit jedem Spruch.
 * Die Gegenstelle zählt in beiden Richtungen.
 */
function altFelder(eingabe: Eingabe): typeof SPALTEN[number][] {
    const zuletzt = verlauf.at(-1)?.eingabe;
    const nummer = eingabe.nummer?.trim() ?? "";
    if (!zuletzt || !nummer || !zuletzt.nummer?.trim() || nummer === zuletzt.nummer.trim()) {
        return [];
    }
    // Dieselbe Gegenstelle bei einem Eingang: Absender, Zeichen und Funktion
    // dürfen gleich sein, es sendet dieselbe Stelle noch einmal.
    const gleicheStelle = (eingabe.empfaenger ?? "").trim() === (zuletzt.empfaenger ?? "").trim();
    const behalten = eingabe.richtung === "Eingang" && !gleicheStelle ? BEHALTEN_EINGANG : BEHALTEN_AUSGANG;
    return SPALTEN.filter(spalte => !behalten.includes(spalte.schluessel)
        && !["nummer", "inhalt", "empfaenger", "anschrift"].includes(spalte.schluessel)
        && !angefasst.has(spalte.schluessel)
        && (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? "")
        && eingabe[spalte.schluessel] === zuletzt[spalte.schluessel]);
}

/** Liest die Maske und hält Fehler- und Längenhinweise aktuell. */
function einzelPruefen() {
    const eingabe = maskeLesen();
    const { daten, fehler, hinweise } = zuVordruckDaten(eingabe);
    richtungPruefen();
    einzelnFehler.hidden = fehler.length === 0;
    einzelnFehler.textContent = fehler.join(" · ");
    // Bei Eingang den Aufnahmevermerk hervorheben, bei Ausgang Annahme und Beförderung.
    weitere.dataset["richtung"] = eingabe.richtung ?? "";
    // Oben, was falsch gedruckt würde; unten, was nur noch fehlt.
    const wichtig: string[] = [];
    const fehlt: string[] = [];
    const frueher = mitNummer(juengste(), daten.nummer).filter(eintrag => JSON.stringify(eintrag.eingabe) !== JSON.stringify(eingabe));
    const letzter = frueher.at(-1);
    if (letzter) {
        const zeit = new Date(letzter.zeit);
        const tag = zeit.toDateString() === new Date().toDateString()
            ? "heute"
            : `am ${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}`;
        const uhrzeit = zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        // Gleiche Nr. und Gegenstelle: eher eine Korrektur derselben Nachricht als eine doppelte Nummer.
        (letzter.eingabe.empfaenger ?? "") === (eingabe.empfaenger ?? "")
            ? hinweise.push(`Korrektur von Nr. ${daten.nummer}? Die Nummer wurde schon ${tag} um ${uhrzeit} Uhr erstellt`)
            : wichtig.push(`Nr. ${daten.nummer} wurde schon ${tag} um ${uhrzeit} Uhr erstellt, mit Gegenstelle ${letzter.eingabe.empfaenger || "leer"}`);
    }
    const alt = altwerte(eingabe);
    if (alt) {
        wichtig.push(alt);
    }
    const gekuerzt = gekuerztMeldung(daten, optionen().vordruck);
    if (gekuerzt) {
        wichtig.push(gekuerzt);
    }
    // Die Längenwarnung auch dort, wo vor dem Download die übrigen Hinweise stehen.
    const laengeVorab = pruefeTextlaenge(daten.inhalt, optionen().vordruck);
    if (istKritisch(laengeVorab)) {
        wichtig.push(textlaengeMeldung(laengeVorab).replace(/\.$/, ""));
    }
    if (daten.nummer && !/\d/.test(daten.nummer)) {
        hinweise.push(`Nr. „${daten.nummer}“ enthält keine Ziffer; „Nächster Vordruck“ kann sie nicht hochzählen`);
    } else if (/\d[^\d\s/-]+\d/.test(daten.nummer)) {
        hinweise.push(`Nr. „${daten.nummer}“ mischt Ziffern und Buchstaben; „Nächster Vordruck“ zählt nur die Ziffern am Ende hoch`);
    }
    // Vermerke passen zur Richtung: Aufnahme beim Eingang, Annahme und Beförderung beim Ausgang.
    const vermerk = (gruppe: string) => ["Datum", "Uhrzeit", "Hdz"].some(teil => (eingabe[`${gruppe}${teil}` as Schluessel] ?? "").trim());
    if (optionen().vordruck !== "meldung") {
        if (eingabe.richtung === "Eingang" && (vermerk("annahme") || vermerk("befoerderung"))) {
            wichtig.push("Richtung Eingang, aber Annahme- oder Beförderungsvermerk ausgefüllt; die gehören zum Ausgang");
        }
        if (eingabe.richtung === "Ausgang" && vermerk("aufnahme")) {
            wichtig.push("Richtung Ausgang, aber Aufnahmevermerk ausgefüllt; der gehört zum Eingang");
        }
        if (eingabe.richtung === "Eingang" && daten.inhalt && !vermerk("aufnahme")) {
            fehlt.push("Aufnahmevermerk (Datum, Uhrzeit, Hdz.)");
        }
    }
    // Beim Eingang trägt man die Abfassungszeit der sendenden Stelle ein, falls übermittelt; „Jetzt“ wäre falsch.
    if (daten.inhalt && eingabe.richtung !== "Eingang" && !(eingabe.abfassungszeit ?? "").trim()) {
        fehlt.push("Abfassungszeit („Jetzt“ trägt sie ein)");
    }
    if (daten.inhalt && !daten.nummer) {
        fehlt.push("Nr.");
    }
    if (daten.inhalt && eingabe.richtung === "Ausgang" && !(eingabe.absender ?? "").trim()) {
        fehlt.push("Absender");
    }
    // Angaben, die der gewählte Vordruck nicht hat: sie bleiben erhalten, das soll man wissen.
    const ausgeblendet = SPALTEN.filter(spalte => {
        const feld = maske.elements.namedItem(spalte.schluessel);
        const ziel = feld instanceof RadioNodeList ? feld[0] : feld;
        return ziel instanceof HTMLElement && ziel.closest("[data-nur][hidden]")
            && (eingabe[spalte.schluessel] ?? "") !== (vorgaben[spalte.schluessel] ?? "");
    });
    if (ausgeblendet.length > 0) {
        hinweise.push(`${aufzaehlen(ausgeblendet.map(spalte => spalte.titel))} ${ausgeblendet.length === 1 ? `gehört nur zum ${optionen().vordruck === "meldung" ? "Nachrichtenvordruck" : "Meldevordruck"}; das Feld ist ausgeblendet und bleibt gespeichert` : `gehören nur zum ${optionen().vordruck === "meldung" ? "Nachrichtenvordruck" : "Meldevordruck"}; die Felder sind ausgeblendet und bleiben gespeichert`}`);
    }
    const zeilen = [
        ...wichtig.map(text => ({ text, wichtig: true })),
        ...hinweise.map(text => ({ text, wichtig: false })),
        ...(fehlt.length > 0 ? [{ text: `Noch leer: ${aufzaehlen(fehlt)}`, wichtig: false }] : [])
    ];
    einzelnHinweise.hidden = zeilen.length === 0;
    const liste = document.createElement("ul");
    liste.replaceChildren(...zeilen.map(zeile => {
        const li = document.createElement("li");
        li.textContent = zeile.text;
        li.classList.toggle("wichtig", zeile.wichtig);
        return li;
    }));
    einzelnHinweise.replaceChildren(liste);
    const laenge = pruefeTextlaenge(daten.inhalt, optionen().vordruck);
    textlaenge.hidden = !laenge;
    textlaenge.textContent = laenge ? textlaengeMeldung(laenge) : "";
    textlaenge.className = `textlaenge ${istKritisch(laenge) ? "warnung" : "hinweis"}`;
    return daten;
}

// Telefone zeigen eine PDF im iframe meist gar nicht an. Dann zeigt ein Bild den
// Vordruck. In Dunkel und Nacht ebenso: Der PDF-Betrachter wäre die hellste Fläche.
const eingebettet = (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;
const bildvorschau = element<HTMLCanvasElement>("einzeln-bild");
let pdfImRahmen = eingebettet;

function vorschauArtSetzen(): void {
    const klassen = document.documentElement.classList;
    const vorher = pdfImRahmen;
    pdfImRahmen = eingebettet && !klassen.contains("dunkel-modus") && !klassen.contains("nacht-modus");
    // Der Rahmen bleibt zum Drucken geladen, auch wenn das Bild gezeigt wird.
    vorschau.hidden = !eingebettet;
    vorschau.classList.toggle("nur-zum-drucken", !pdfImRahmen);
    bildvorschau.hidden = pdfImRahmen;
    element<HTMLElement>("vorschau-ersatz").hidden = pdfImRahmen;
    if (vorher !== pdfImRahmen) {
        planeVorschau();
    }
}
vorschauArtSetzen();
new MutationObserver(vorschauArtSetzen).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

/** Lädt die PDF in den Vorschaurahmen; daraus wird auch gedruckt. */
function pdfInRahmenLaden(boegen = 1): void {
    const pdf = erzeugePdf(einzelDaten(boegen), optionen());
    const alt = vorschauUrl;
    vorschauUrl = URL.createObjectURL(pdf.output("blob"));
    // Seitenbreite einpassen, keine Werkzeugleiste: die Vorschau ist ein Blick, kein Betrachter.
    vorschau.src = `${vorschauUrl}#toolbar=0&view=Fit`;
    if (alt) {
        setTimeout(() => URL.revokeObjectURL(alt), 1_000);
    }
}

function vorschauAktualisieren(): void {
    if (element<HTMLElement>("ansicht-einzeln").hidden) {
        return;
    }
    if (!pdfImRahmen) {
        void zeichneBildvorschau(bildvorschau, einzelDaten()[0] ?? einzelPruefen(), optionen());
        return;
    }
    pdfInRahmenLaden();
}

function planeVorschau(): void {
    clearTimeout(vorschauTimer);
    vorschauTimer = setTimeout(vorschauAktualisieren, 350);
}

/**
 * Felder, die seit dem letzten Erstellen oder „Nächster Vordruck“ angefasst
 * wurden. Was nicht angefasst wurde und wie beim letzten Vordruck lautet, ist
 * vermutlich stehen geblieben; bewusst gleich Eingetragenes nicht.
 */
const ANGEFASST_SCHLUESSEL = "bnv.angefasst.v1";
let angefasst = new Set<string>();
try {
    angefasst = new Set(JSON.parse(tabSpeicher()?.getItem(ANGEFASST_SCHLUESSEL) ?? "[]") as string[]);
} catch {
    angefasst = new Set();
}
function angefasstZuruecksetzen(): void {
    angefasst.clear();
    tabSpeicher()?.removeItem(ANGEFASST_SCHLUESSEL);
}

/**
 * Absender, Zeichen und Funktion der eigenen Station: gemerkt beim Erstellen
 * eines Ausgangs. Beim Umstellen auf Eingang werden sie geleert, beim Umstellen
 * auf Ausgang in leere Felder wieder eingesetzt, auch nach einem Eingang.
 */
const STATION_SCHLUESSEL = "bnv.eigene-station.v1";
const STATION_FELDER = ["absender", "zeichen", "funktion"] as const;
function eigeneStation(): Eingabe | null {
    try {
        return JSON.parse(speicher()?.getItem(STATION_SCHLUESSEL) ?? "null") as Eingabe | null;
    } catch {
        return null;
    }
}
function eigeneStationMerken(eingabe: Eingabe): void {
    if (eingabe.richtung === "Ausgang" && STATION_FELDER.some(feld => (eingabe[feld] ?? "").trim())) {
        speicher()?.setItem(STATION_SCHLUESSEL, JSON.stringify(Object.fromEntries(STATION_FELDER.map(feld => [feld, eingabe[feld] ?? ""]))));
    }
}

function maskeGeaendert(ereignis: Event): void {
    const ziel = ereignis.target;
    const name = ziel instanceof HTMLInputElement || ziel instanceof HTMLTextAreaElement || ziel instanceof HTMLSelectElement ? ziel.name : "";
    if (name) {
        angefasst.add(name);
        tabSpeicher()?.setItem(ANGEFASST_SCHLUESSEL, JSON.stringify([...angefasst]));
    }
    const meldung = ziel instanceof HTMLInputElement && ziel.name === "richtung" && ereignis.type === "change"
        ? richtungGewechselt(ziel.value)
        : "";
    entwurfSpeichern();
    weitereZaehlen();
    // Wer tippt, arbeitet am neuen Stand weiter: ein Zurücknehmen würde ihn verwerfen.
    if (zuruecknahme || statusText.textContent) {
        meldeStatus("", null);
    }
    if (meldung) {
        zeigeKurzmeldung(meldung, false);
    } else {
        kurzmeldungSchliessen();
    }
    planeVorschau();
}

/**
 * Bei einem Eingang gehören Absender, Zeichen und Funktion der sendenden
 * Stelle. Stehen dort die eigenen, werden sie geleert; beim Wechsel auf Ausgang
 * kommen sie in leere Felder wieder. Bereits Getipptes bleibt unangetastet.
 */
function richtungGewechselt(richtung: string): string {
    const eingabe = maskeLesen();
    const eigene = eigeneStation() ?? uebernommen;
    if (!eigene) {
        if (richtung === "Eingang") {
            weitere.open = true;
        }
        return "";
    }
    if (richtung === "Eingang") {
        // Bei einem Eingang gehört der Aufnahmevermerk dazu; er steht im zugeklappten Bereich.
        weitere.open = true;
        const gleich = STATION_FELDER.filter(feld => (eingabe[feld] ?? "").trim() && eingabe[feld] === eigene[feld]);
        if (gleich.length > 0) {
            maskeSchreiben(Object.fromEntries(gleich.map(feld => [feld, ""])) as Eingabe);
            return "Eingang: Angaben der eigenen Station geleert. Hier gehören Absender, Zeichen und Funktion der sendenden Stelle hin; bei „Ausgang“ kommen sie in leere Felder zurück.";
        }
    } else if (richtung === "Ausgang") {
        const leer = STATION_FELDER.filter(feld => !(eingabe[feld] ?? "").trim() && (eigene[feld] ?? "").trim());
        if (leer.length > 0 && STATION_FELDER.every(feld => !(eingabe[feld] ?? "").trim())) {
            maskeSchreiben(Object.fromEntries(leer.map(feld => [feld, eigene[feld] ?? ""])) as Eingabe);
            return "Ausgang: Absender, Zeichen und Funktion der eigenen Station eingesetzt.";
        }
        if (leer.length > 0) {
            return "Ausgang: Absender, Zeichen oder Funktion sind schon belegt; die eigene Station wurde nicht eingesetzt.";
        }
    }
    return "";
}

// Wer in die Maske tippt oder klickt, braucht die Kurzmeldung nicht mehr.
maske.addEventListener("pointerdown", () => kurzmeldungSchliessen());
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
        zeigeKurzmeldung("Doppelter Tipp erkannt; der zweite Tipp wurde nicht ausgeführt.", false);
        return false;
    }
    knopf.dataset["gesperrt"] = "1";
    setTimeout(() => delete knopf.dataset["gesperrt"], 1_500);
    return true;
}

/**
 * Ob dieser Stand schon als PDF erstellt, gedruckt oder geöffnet wurde. Die
 * Liste steht im Gerätespeicher, das übersteht also auch ein Neuladen.
 */
function istErstellt(eingabe: Eingabe): boolean {
    const stand = JSON.stringify(eingabe);
    return verlauf.some(eintrag => JSON.stringify(eintrag.eingabe) === stand);
}

/**
 * Trägt den Stand in die Liste ein, außer die Maske ist leer. Derselbe Stand
 * als anderer Vordruck (Nachricht, dann Meldung) bekommt einen eigenen Eintrag.
 */
function alsErstelltMerken(eingabe: Eingabe, jetzt: Date, zusatz = ""): void {
    if (!((eingabe.inhalt ?? "").trim() || (eingabe.nummer ?? "").trim())) {
        return;
    }
    // Ist diese Nr. erstellt, sind abgelegte ältere Fassungen davon überholt.
    ablageEntfernen(eingabe, true);
    const gemerkt = merkeVordruck(eingabe, jetzt, optionen().vordruck, zusatz);
    verlauf = gemerkt.liste;
    if (gemerkt.verdraengt > 0) {
        statusText.textContent += ` Die Liste erstellter Vordrucke ist voll (${HOECHSTENS}); der älteste Eintrag ist herausgefallen.`;
    }
    verlaufZeigen();
}

/**
 * Bei Problemen vor dem Erzeugen nachfragen. Ergibt `false` bei Abbruch, sonst
 * die Anzahl der Bögen: 1, oder mehr, wenn langer Text auf Folgebögen verteilt wird.
 */
async function einzelBestaetigt(eingabe: Eingabe): Promise<false | number> {
    const { daten, fehler, hinweise } = zuVordruckDaten(eingabe);
    const laenge = pruefeTextlaenge(daten.inhalt, optionen().vordruck);
    const doppelt = mitNummer(juengste(), daten.nummer)
        .some(eintrag => JSON.stringify(eintrag.eingabe) !== JSON.stringify(eingabe) && (eintrag.eingabe.empfaenger ?? "") !== (eingabe.empfaenger ?? ""));
    // Gleiche Nr. und Gegenstelle, aber anderer Text: eher ein neuer Spruch als eine Korrektur.
    const andererText = !doppelt && mitNummer(juengste(), daten.nummer)
        .some(eintrag => (eintrag.eingabe.empfaenger ?? "") === (eingabe.empfaenger ?? "")
            && (eintrag.eingabe.inhalt ?? "").trim() !== (eingabe.inhalt ?? "").trim());
    const gekuerzt = gekuerztMeldung(daten, optionen().vordruck);
    const probleme = [
        istKritisch(laenge) ? textlaengeMeldung(laenge) : "",
        gekuerzt ? `${gekuerzt}.` : "",
        fehler.length > 0 ? `${fehler[0]}.` : "",
        ...hinweise.filter(text => text.includes(UNMOEGLICH)).map(text => `${text}.`),
        doppelt ? `Nr. ${daten.nummer} wurde schon für eine andere Gegenstelle erstellt.` : "",
        andererText ? `Nr. ${daten.nummer} an diese Gegenstelle wurde schon mit anderem Text erstellt. Korrektur? Für einen neuen Spruch „Nächster Vordruck“ nutzen.` : "",
        altwerte(eingabe) ? `${altwerte(eingabe)}.` : "",
        !daten.inhalt ? "Der Vordruck hat keinen Text." : "",
        // Ein Ausgang ohne Absender ist auf Papier nicht zuzuordnen.
        daten.inhalt && eingabe.richtung === "Ausgang" && !(eingabe.absender ?? "").trim() ? "Der Ausgang hat keinen Absender." : ""
    ].filter(Boolean);
    if (probleme.length === 0) {
        return 1;
    }
    // Fehlt Text auf dem Papier, sagt der Knopf das; sonst das übliche „Trotzdem“.
    // Zu langer Text lässt sich wie auf Papier auf Folgebögen verteilen; das ist
    // die Hauptwahl, Kürzen nur die Ausnahme.
    const boegen = istKritisch(laenge) ? teileInhalt(daten.inhalt, optionen().vordruck).length : 1;
    // Stehen gebliebene Angaben: gezielt leeren statt „Nächster Vordruck“, der den Text verwerfen würde.
    // Zuerst gefragt, auch bei langem Text; danach kommt die Frage nach dem Verteilen.
    const alt = altFelder(eingabe);
    if (alt.length > 0) {
        const ja = boegen > 1 ? "Weiter" : gekuerzt ? "Gekürzt erzeugen" : "Trotzdem erzeugen";
        const fragen = boegen > 1 ? [`${altwerte(eingabe)}.`] : probleme;
        const wahl = await frageWahl(`${fragen.join("\n")}\n\n${ja}?`, ja, "Abbrechen", "Stehen gebliebene leeren");
        if (wahl === "dritte") {
            maskeSchreiben(Object.fromEntries(alt.map(spalte => [spalte.schluessel, vorgaben[spalte.schluessel] ?? ""])) as Eingabe);
            entwurfSpeichern();
            weitereZaehlen();
            planeVorschau();
            meldeStatus(`Geleert: ${aufzaehlen(alt.map(spalte => spalte.titel))}. Bitte prüfen und erneut erzeugen.`, { stand: eingabe, aktion: "Leeren" });
            // Zum ersten geleerten Feld, damit ein zweiter Tipp auf „PDF“ nicht ungeprüft erzeugt.
            const erstes = maske.elements.namedItem(alt[0]?.schluessel ?? "");
            const ziel = erstes instanceof RadioNodeList ? erstes[0] : erstes;
            if (ziel instanceof HTMLElement) {
                ziel.closest("details")?.setAttribute("open", "");
                ziel.focus();
                ziel.scrollIntoView({ block: "center" });
            }
            return false;
        }
        if (wahl !== "ja") {
            return false;
        }
        if (boegen <= 1) {
            return 1;
        }
    }
    if (boegen > 1) {
        const wahl = await frageWahl(`${probleme.join("\n")}\n\nAuf ${boegen} Vordrucke verteilen?`, `Auf ${boegen} Vordrucke verteilen`, "Abbrechen", "Gekürzt erzeugen (Text fehlt)");
        return wahl === "nein" ? false : wahl === "ja" ? boegen : 1;
    }
    const ja = gekuerzt ? "Gekürzt erzeugen" : "Trotzdem erzeugen";
    return await frage(`${probleme.join("\n")}\n\n${ja}?`, ja) ? 1 : false;
}

/**
 * Die Vordrucke für den aktuellen Stand: einer, oder bei `boegen` > 1 der Text
 * auf Folgebögen verteilt, jeder mit „Blatt n von m“ am unteren Rand.
 */
function einzelDaten(boegen = 1): VordruckDaten[] {
    const daten = einzelPruefen();
    const { fehler } = zuVordruckDaten(maskeLesen());
    // Was auf dem Bogen anders steht als eingegeben, sagt der Bogen selbst.
    const vermerk = pruefvermerk(daten, optionen().vordruck, fehler, boegen > 1);
    if (boegen <= 1) {
        daten.pruefvermerk = vermerk;
        return [daten];
    }
    const teile = teileInhalt(daten.inhalt, optionen().vordruck);
    return teile.map((inhalt, index) => {
        const blatt = zuVordruckDaten(maskeLesen()).daten;
        blatt.inhalt = inhalt;
        blatt.blatt = `Blatt ${index + 1} von ${teile.length}`;
        blatt.pruefvermerk = vermerk;
        return blatt;
    });
}

/** Erzeugt den Einzelvordruck für Download, Druck oder neuen Tab und merkt ihn sich. */
async function einzelErstellen(knopf: HTMLButtonElement, wie: "herunterladen" | "drucken" | "oeffnen"): Promise<void> {
    if (!kurzSperren(knopf)) {
        return;
    }
    const eingabe = maskeLesen();
    // Ansehen im neuen Tab erzeugt nichts für die Ablage: keine Rückfrage, kein Eintrag.
    const boegen = wie === "oeffnen" ? 1 : await einzelBestaetigt(eingabe);
    if (boegen === false) {
        return;
    }
    // Dieselbe PDF kurz nacheinander noch einmal: eher ein versehentlicher zweiter Tipp.
    const kennung = verlaufKennung(eingabe);
    const eben = juengste().find(eintrag => verlaufKennung(eintrag.eingabe) === kennung && Date.now() - new Date(eintrag.zeit).getTime() < 120_000);
    if (wie === "herunterladen" && eben && !await frage(`Dieser Vordruck wurde vor ${Math.max(1, Math.round((Date.now() - new Date(eben.zeit).getTime()) / 1000))} Sekunden schon als PDF erstellt. Noch einmal herunterladen?`, "Noch einmal herunterladen")) {
        return;
    }
    const jetzt = new Date();
    const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    const nummer = eingabe.nummer?.trim() ?? "";
    if (wie === "herunterladen") {
        const name = dateiname(optionen(), 1, jetzt, nummer);
        herunterladen(erzeugePdf(einzelDaten(boegen), optionen()).output("blob"), name);
        meldeStatus(`${beschreibe(eingabe)} um ${uhr} Uhr als PDF erstellt${boegen > 1 ? `, Text auf ${boegen} Vordrucke verteilt${optionen().vordruck === "beide" ? " (je Art)" : ""}` : ""}${boegen === 1 && einzelDaten()[0]?.pruefvermerk ? `; auf dem Bogen steht „${einzelDaten()[0]?.pruefvermerk ?? ""}“` : ""}. Für die nächste Nachricht „Nächster Vordruck“ wählen.`);
    } else if (wie === "drucken") {
        // Die Vorschau ist dieselbe PDF; ihr Druckdialog druckt sie ohne Umweg über den Download.
        clearTimeout(vorschauTimer);
        pdfInRahmenLaden(boegen);
        vorschau.addEventListener("load", () => vorschau.contentWindow?.print(), { once: true });
        meldeStatus(`${beschreibe(eingabe)} um ${uhr} Uhr zum Drucken geöffnet; in der Liste als „zum Drucken geöffnet“ geführt, auch wenn der Druck abgebrochen wird.`);
    } else {
        // Zum Ansehen wie gedruckt: langer Text auf Folgebögen, wie es die Rückfrage anbieten würde.
        const laenge = pruefeTextlaenge(eingabe.inhalt ?? "", optionen().vordruck);
        window.open(URL.createObjectURL(erzeugePdf(einzelDaten(istKritisch(laenge) ? laenge.boegen : 1), optionen()).output("blob")), "_blank", "noopener");
        meldeStatus(`${beschreibe(eingabe)} um ${uhr} Uhr zur Ansicht in einem neuen Tab geöffnet; das zählt nicht als erstellt.`);
        return;
    }
    // Die Liste soll zeigen, was vom Stand abweicht: Folgebögen oder gekürzter Text.
    const { daten } = zuVordruckDaten(eingabe);
    const gekuerzt = boegen === 1 && (istKritisch(pruefeTextlaenge(daten.inhalt, optionen().vordruck)) || gekuerztMeldung(daten, optionen().vordruck));
    eigeneStationMerken(eingabe);
    const zusatz = [wie === "drucken" ? "zum Drucken geöffnet" : "", zuVordruckDaten(eingabe).fehler.length > 0 ? "mit Fehlern gedruckt" : "", boegen > 1 ? `auf ${boegen} Vordrucke verteilt` : gekuerzt ? "gekürzt gedruckt" : ""].filter(Boolean).join(", ");
    alsErstelltMerken(eingabe, jetzt, zusatz);
    angefasstZuruecksetzen();
}

element<HTMLButtonElement>("einzeln-pdf").addEventListener("click", ereignis =>
    void einzelErstellen(ereignis.currentTarget as HTMLButtonElement, "herunterladen"));
element<HTMLButtonElement>("einzeln-drucken").hidden = !eingebettet;
element<HTMLButtonElement>("einzeln-drucken").addEventListener("click", ereignis =>
    void einzelErstellen(ereignis.currentTarget as HTMLButtonElement, "drucken"));

element<HTMLButtonElement>("leere-vordrucke").addEventListener("click", ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    // Ohne Vorab-Kreuze: zuVordruckDaten lässt bei leerer Eingabe alles leer.
    // Immer mit Formular: ohne wäre ein Leerbogen ein weißes Blatt.
    const gewaehlt = { ...optionen(), ohneHintergrund: false };
    const anzahl = gewaehlt.blatt === "a4" && gewaehlt.vordruck !== "beide" ? 2 : 1;
    const leer = Array.from({ length: anzahl }, () => zuVordruckDaten({}).daten);
    const name = dateiname(gewaehlt, anzahl).replace(".pdf", "_leer.pdf");
    herunterladen(erzeugePdf(leer, gewaehlt).output("blob"), name);
    meldeStatus(`${name} erstellt: ein Blatt. Mehr Exemplare im Druckdialog unter „Kopien“ einstellen.`);
});

// Probeblatt für vorgedruckte Bögen: alle Felder mit Beispielwerten, ohne
// Formular, mit dem eingestellten Versatz. Gegen das Licht auf einen Bogen legen.
element<HTMLButtonElement>("probeblatt").addEventListener("click", ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    const beispiel = Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, spalte.beispiel || "X"])) as Eingabe;
    beispiel.verteiler = "Leiter, S1/1, S2/2, S3/3, S4/1, S6/2";
    beispiel.gespraechsnotiz = "ja";
    beispiel.richtung = "Ausgang";
    const gewaehlt = { ...optionen(), ohneHintergrund: true };
    herunterladen(erzeugePdf([zuVordruckDaten(beispiel).daten], gewaehlt).output("blob"), dateiname(gewaehlt, 1).replace(".pdf", "_probeblatt.pdf"));
    meldeStatus("Probeblatt erstellt: auf Normalpapier drucken, gegen das Licht auf einen Bogen legen, Versatz anpassen.");
});

// ---- Liste erstellter Vordrucke ----------------------------------------

const verlaufBereich = element<HTMLDetailsElement>("verlauf");

function verlaufZeigen(): void {
    verlaufBereich.hidden = verlauf.length === 0;
    element<HTMLSpanElement>("verlauf-zahl").textContent = String(verlauf.length);
    // Eine spätere Fassung derselben Nr. an dieselbe Gegenstelle ist eine Korrektur.
    const gesehen = new Set<string>();
    const korrektur = verlauf.map(eintrag => {
        const nummer = (eintrag.eingabe.nummer ?? "").trim();
        const schluessel = `${nummer}|${(eintrag.eingabe.empfaenger ?? "").trim()}|${eintrag.vordruck ?? ""}`;
        const tag = new Date(eintrag.zeit).toDateString();
        const schon = Boolean(nummer) && gesehen.has(`${schluessel}|${tag}`);
        gesehen.add(`${schluessel}|${tag}`);
        return schon;
    });
    const VORDRUCK_NAME: Record<string, string> = { nachricht: "Nachricht", meldung: "Meldung", beide: "Beide" };
    element<HTMLTableSectionElement>("verlauf-liste").replaceChildren(...[...verlauf].map((eintrag, index) => ({ eintrag, index })).reverse().map(({ eintrag, index }) => {
        const tr = document.createElement("tr");
        const zeit = new Date(eintrag.zeit);
        // Gedruckt wird nur ein gültiger Vorrang; ein verworfener Wert aus der Datei soll das nicht verschleiern.
        const vorrang = (eintrag.eingabe.vorrang ?? "").trim();
        const gueltig = !vorrang || /^(sofort|blitz)$/i.test(vorrang);
        for (const [beschriftung, text] of [
            ["Zeit", `${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`],
            ["Vordruck", VORDRUCK_NAME[eintrag.vordruck ?? ""] ?? ""],
            ["Nr.", `${eintrag.eingabe.nummer ?? ""}${korrektur[index] ? " (Korrektur)" : ""}`],
            ["Richtung", eintrag.eingabe.richtung ?? ""],
            ["Vorrang", gueltig ? vorrang : `${vorrang} (ungültig, nicht gedruckt)`],
            ["Gegenstelle", eintrag.eingabe.empfaenger ?? ""],
            ["Inhalt", kurz(eintrag.eingabe.inhalt ?? "", 60) + (eintrag.zusatz ? ` (${eintrag.zusatz})` : "")]
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
// Die gelöschte Liste bleibt im Gerätespeicher, bis sie wiederhergestellt oder
// von einem weiteren Löschen ergänzt wird: Wiederherstellen übersteht ein Neuladen.
const GELOESCHT_SCHLUESSEL = "bnv.verlauf.geloescht.v1";
function geloeschteListe(): Eintrag[] {
    try {
        const daten = JSON.parse(speicher()?.getItem(GELOESCHT_SCHLUESSEL) ?? "[]") as unknown;
        return Array.isArray(daten) ? daten as Eintrag[] : [];
    } catch {
        return [];
    }
}
function geloeschtZeigen(): void {
    const anzahl = geloeschteListe().length;
    element<HTMLParagraphElement>("verlauf-geloescht").hidden = anzahl === 0;
    const zeit = new Date(speicher()?.getItem(`${GELOESCHT_SCHLUESSEL}.zeit`) ?? "");
    const wann = Number.isNaN(zeit.getTime()) ? "" : ` vom ${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}, ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
    element<HTMLSpanElement>("verlauf-geloescht-text").textContent = `Gelöschte Liste${wann} mit ${anzahl} ${anzahl === 1 ? "Eintrag" : "Einträgen"} liegt noch bereit; „Wiederherstellen“ stellt sie vor die heutigen Einträge.`;
}
geloeschtZeigen();
element<HTMLButtonElement>("verlauf-verwerfen").addEventListener("click", async () => {
    if (!await frage(`Die gelöschte Liste mit ${geloeschteListe().length} Einträgen endgültig verwerfen? Das lässt sich nicht zurücknehmen.`, "Endgültig verwerfen")) {
        return;
    }
    speicher()?.removeItem(GELOESCHT_SCHLUESSEL);
    geloeschtZeigen();
});
element<HTMLButtonElement>("verlauf-loeschen").addEventListener("click", async () => {
    if (!await frage(`Die Liste mit ${verlauf.length} erstellten Vordrucken von diesem Gerät löschen? Die PDF-Dateien bleiben erhalten. „Wiederherstellen“ holt sie zurück, auch nach einem Neuladen.`, "Liste löschen")) {
        return;
    }
    // Ein zweites Löschen verwirft das erste nicht: beide kommen zusammen zurück.
    speicher()?.setItem(GELOESCHT_SCHLUESSEL, JSON.stringify([...geloeschteListe(), ...verlauf]));
    speicher()?.setItem(`${GELOESCHT_SCHLUESSEL}.zeit`, new Date().toISOString());
    loescheVerlauf();
    verlauf = [];
    verlaufZeigen();
    geloeschtZeigen();
});
element<HTMLButtonElement>("verlauf-wiederherstellen").addEventListener("click", () => {
    // Was seit dem Löschen dazugekommen ist, bleibt hinten in der Liste.
    verlauf = setzeVerlauf([...geloeschteListe(), ...ladeVerlauf()]);
    speicher()?.removeItem(GELOESCHT_SCHLUESSEL);
    element<HTMLParagraphElement>("verlauf-geloescht").hidden = true;
    verlaufZeigen();
});

/**
 * Angaben der eigenen Station, die „Nächster Vordruck“ nach einem Ausgang
 * stehen gelassen hat. Wird danach auf Eingang gestellt, gehören dort die
 * Angaben der sendenden Stelle hin; ein Hinweis sagt das.
 */
let uebernommen: Eingabe | null = null;

async function naechsterVordruck(knopf: HTMLButtonElement, ausHinweis: boolean): Promise<void> {
    // Ein Doppeltipp soll nicht die eigene Rückfrage bestätigen.
    if (!kurzSperren(knopf)) {
        return;
    }
    const eingabe = maskeLesen();
    if ((eingabe.inhalt ?? "").trim() && !istErstellt(eingabe)
        && !await frage("Dieser Vordruck wurde noch nicht als PDF erstellt. Trotzdem leeren und zum nächsten wechseln?", "Zum nächsten Vordruck")) {
        return;
    }
    // Ein nie erstellter Vordruck mit Text bleibt zurückholbar.
    if ((eingabe.inhalt ?? "").trim() && !istErstellt(eingabe)) {
        ablegen(eingabe, "verworfen");
    }
    // Bei einem Eingang sind Absender, Zeichen und Funktion die der Gegenstelle: nicht behalten.
    const eingang = eingabe.richtung === "Eingang";
    const behalten = eingang ? BEHALTEN_EINGANG : BEHALTEN_AUSGANG;
    const neu = Object.fromEntries(SPALTEN.map(spalte => [
        spalte.schluessel,
        behalten.includes(spalte.schluessel) ? eingabe[spalte.schluessel] ?? "" : vorgaben[spalte.schluessel] ?? ""
    ])) as Eingabe;
    // Schon erstellte Nummern überspringen, etwa nach einem Tabellenlauf.
    neu.nummer = naechsteNummer(eingabe.nummer ?? "");
    const ersteFreie = neu.nummer;
    for (let versuch = 0; versuch < 1000 && neu.nummer && mitNummer(juengste(), neu.nummer).length > 0; versuch++) {
        neu.nummer = naechsteNummer(neu.nummer);
    }
    const uebersprungen = neu.nummer !== ersteFreie ? ` Nr. ${ersteFreie} bis ${neu.nummer.replace(/\d+$/, zahl => String(Number(zahl) - 1))} sind auf diesem Gerät schon erstellt.` : "";
    uebernommen = eingang ? null : { absender: neu.absender ?? "", zeichen: neu.zeichen ?? "", funktion: neu.funktion ?? "" };
    maskeSchreiben(neu);
    angefasstZuruecksetzen();
    entwurfSpeichern();
    weitereZaehlen();
    planeVorschau();
    // Die Richtung ausdrücklich nennen: sie bleibt stehen und muss bei Bedarf umgestellt werden.
    // Nur nennen, was tatsächlich übernommen wurde.
    const richtung = neu.richtung ? `Richtung „${neu.richtung}“` : "keine Richtung gewählt";
    const uebernommenNamen = behalten
        .filter(schluessel => !["titel", "hinweis", "richtung"].includes(schluessel) && (neu[schluessel] ?? "").trim())
        .map(schluessel => SPALTEN.find(spalte => spalte.schluessel === schluessel)?.titel ?? schluessel);
    const text = `Neuer Vordruck${neu.nummer ? ` Nr. ${neu.nummer}` : ""}, ${richtung}.${uebersprungen} `
        + (uebernommenNamen.length > 0
            ? `Übernommen: ${aufzaehlen(uebernommenNamen)}; alles andere ist leer.`
            : "Alles andere ist leer.");
    if (!ausHinweis) {
        entwurfHinweis.hidden = true;
    }
    // Erst ins erste Feld, dann melden: Die Rückmeldung unter den Knöpfen ist dann außer Sicht und kommt als Kurzmeldung.
    (maske.elements.namedItem("empfaenger") as HTMLInputElement).focus({ preventScroll: ausHinweis });
    // Der Blick ist oben im ersten Feld: Kurzmeldung statt Sprung zur Statuszeile.
    meldeStatus(text, { stand: eingabe, aktion: "Nächster Vordruck" }, true);
    if (ausHinweis) {
        // Rückmeldung und Zurücknehmen dort, wo getippt wurde, nicht drei Bildschirme tiefer.
        element<HTMLParagraphElement>("entwurf-text").textContent = text;
        element<HTMLButtonElement>("entwurf-naechster").hidden = true;
        element<HTMLButtonElement>("entwurf-rueckgaengig").hidden = false;
        element<HTMLButtonElement>("entwurf-rueckgaengig").textContent = "„Nächster Vordruck“ zurücknehmen";
        element<HTMLButtonElement>("entwurf-behalten").textContent = "Schließen";
        kurzmeldungSchliessen();
    }
}

element<HTMLButtonElement>("einzeln-naechster").addEventListener("click", ereignis =>
    void naechsterVordruck(ereignis.currentTarget as HTMLButtonElement, false));
element<HTMLButtonElement>("entwurf-naechster").addEventListener("click", ereignis =>
    void naechsterVordruck(ereignis.currentTarget as HTMLButtonElement, true));
element<HTMLButtonElement>("entwurf-behalten").addEventListener("click", () => {
    entwurfHinweis.hidden = true;
    // Weiter bearbeiten heißt: zur Maske, ins erste leere Feld von Nr., Gegenstelle und Text.
    const ziel = (["nummer", "empfaenger", "inhalt"] as const)
        .map(name => maske.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)
        .find(feld => feld && !feld.value.trim()) ?? maske.elements.namedItem("inhalt") as HTMLTextAreaElement | null;
    ziel?.focus();
});
element<HTMLButtonElement>("entwurf-rueckgaengig").addEventListener("click", () => {
    rueckgaengig.click();
    entwurfHinweis.hidden = true;
});

element<HTMLButtonElement>("einzeln-oeffnen").addEventListener("click", ereignis =>
    void einzelErstellen(ereignis.currentTarget as HTMLButtonElement, "oeffnen"));

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
    // Schon leer: nichts tun. Ein zweiter Tipp daneben soll das „Rückgängig“ nicht wegnehmen.
    if (belegt.length === 0) {
        return;
    }
    if (!await frage(`Alle Felder leeren? ${belegt.length} ausgefüllte ${belegt.length === 1 ? "Angabe" : "Angaben"}${zusatz} ${belegt.length === 1 ? "wird" : "werden"} geleert. Ein nicht erstellter Vordruck lässt sich danach zurückholen, auch nach weiterem Tippen.`, "Felder leeren")) {
        return;
    }
    if ((eingabe.inhalt ?? "").trim() && !istErstellt(eingabe)) {
        ablegen(eingabe, "geleert");
    }
    maskeSchreiben(Object.fromEntries(SPALTEN.map(spalte => [spalte.schluessel, ""])) as Eingabe);
    maskeSchreiben(vorgaben);
    entwurfEntfernen();
    weitereZaehlen();
    entwurfHinweis.hidden = true;
    angefasstZuruecksetzen();
    meldeStatus("Alle Felder geleert.", { stand: eingabe, aktion: "Felder leeren" });
    planeVorschau();
});

// ---- Tabelle -------------------------------------------------------------

let ergebnis: TabellenErgebnis | null = null;
/** Hinweise des Lesens selbst, etwa Formeln ohne Wert. */
let leseHinweise: string[] = [];
let dateiName = "";
/** „Ersetzt alt.csv (3 Zeilen).“, wenn eine geladene Tabelle ausgetauscht wurde. */
let ersetztText = "";

/**
 * Der Excel-Teil wird erst bei Bedarf geladen. Fehlt er (alter Tab über zwei
 * Auslieferungen, kein Offline-Speicher), eine deutsche Meldung mit Ausweg.
 */
async function excelTeil(): Promise<typeof import("./excel.js")> {
    try {
        const teil = await import("./excel.js");
        // Auch die Bibliothek selbst ist ein eigener Teil; fehlt sie, dieselbe Meldung.
        await teil.excelBereit();
        return teil;
    } catch {
        throw new Error("Der Excel-Teil ist auf diesem Gerät gerade nicht verfügbar. Seite neu laden oder die Tabelle als CSV speichern und einlesen; „CSV-Vorlage“ geht immer.");
    }
}

element<HTMLButtonElement>("vorlage-xlsx").addEventListener("click", ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    void mitArbeit(knopf, "Vorlage wird erstellt…", async () => {
        try {
            const { erzeugeVorlage } = await excelTeil();
            herunterladen(await erzeugeVorlage(), "nachrichtenvordruck-vorlage.xlsx");
        } catch (fehler) {
            meldeStatus("", "behalten");
            zeigeKurzmeldung(fehler instanceof Error ? fehler.message : String(fehler), false);
        }
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
            const { leseExcel } = await excelTeil();
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
            const hinweise: string[] = [];
            tabelle = leseCsv(text, undefined, hinweise);
            leseHinweise = hinweise;
        } else {
            throw new Error("Gelesen werden nur Excel (.xlsx) und CSV (.csv, .tsv, .txt).");
        }
        const neu = leseTabelle(tabelle);
        // Eine leere oder fremde Datei soll eine geprüfte Tabelle nicht verdrängen.
        if (vorher && (neu.zeilen.length === 0 || neu.bekannteSpalten === 0)) {
            throw new Error(neu.bekannteSpalten === 0
                ? "In der ersten Zeile steht kein bekannter Spaltenkopf (z. B. „Nr“, „Empfänger“, „Inhalt“)."
                : "Unter der Kopfzeile steht keine ausgefüllte Zeile.");
        }
        ergebnis = neu;
        // Ein Austausch soll nicht unbemerkt bleiben.
        ersetztText = vorher ? ` Ersetzt ${vorher.dateiName} (${vorher.ergebnis.zeilen.length} ${vorher.ergebnis.zeilen.length === 1 ? "Zeile" : "Zeilen"}).` : "";
        dateiName = datei.name;
        // Nur der Name, nicht der Inhalt: nach dem Neuladen sagt die Seite, was zuvor geladen war.
        tabSpeicher()?.setItem("bnv.tabelle.v1", datei.name);
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

/** „Nr. 18 (Eingang von Heros Jever 21/10)“ für Rückmeldungen statt des Dateinamens. */
function beschreibe(eingabe: Eingabe): string {
    const nummer = eingabe.nummer?.trim();
    const gegenstelle = eingabe.empfaenger?.trim();
    const richtung = eingabe.richtung === "Eingang" ? "Eingang von" : eingabe.richtung === "Ausgang" ? "Ausgang an" : "Gegenstelle";
    const zusatz = gegenstelle ? ` (${richtung} ${kurz(gegenstelle, 30)})` : eingabe.richtung ? ` (${eingabe.richtung})` : "";
    return `${nummer ? `Nr. ${nummer}` : "Vordruck ohne Nr."}${zusatz}`;
}

/** „a“, „a und b“, „a, b und c“. */
function aufzaehlen(teile: readonly string[]): string {
    return teile.length <= 1 ? teile.join("") : `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}`;
}

function kurz(text: string, laenge: number): string {
    const einzeilig = text.replace(/\s+/g, " ").trim();
    return einzeilig.length > laenge ? `${einzeilig.slice(0, laenge - 1)}…` : einzeilig;
}

/** „In 5 von 20 Zeilen fehlt …: Zeilen 3, 4, 9 …“; leer, wenn in keiner Zeile. */
function fehltIn(betroffen: readonly TabellenErgebnis["zeilen"][number][], was: string): string {
    const gesamt = ergebnis?.zeilen.length ?? 0;
    if (betroffen.length === 0 || gesamt === 0) {
        return "";
    }
    if (betroffen.length === gesamt) {
        return `In keiner Zeile steht ${was}.`;
    }
    const nummern = betroffen.slice(0, 8).map(zeile => zeile.zeile).join(", ") + (betroffen.length > 8 ? " …" : "");
    return `In ${betroffen.length} von ${gesamt} Zeilen (${betroffen.length === 1 ? "Zeile" : "Zeilen"} ${nummern}) fehlt ${was}.`;
}

/** Zeilen, die genau so schon erstellt wurden, etwa beim erneuten Einlesen derselben Tabelle. */
function schonGleichErstellt(zeilen: readonly { zeile: number; eingabe: Eingabe }[]): string {
    const erstellt = new Map(verlauf.map(eintrag => [verlaufKennung(eintrag.eingabe), eintrag.zeit]));
    const gleich = zeilen.filter(zeile => erstellt.has(verlaufKennung(zeile.eingabe)));
    if (gleich.length === 0) {
        return "";
    }
    const zeit = new Date(erstellt.get(verlaufKennung(gleich[0]?.eingabe ?? {})) ?? "");
    const wann = Number.isNaN(zeit.getTime()) ? "" : ` (zuerst ${zeit.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${zeit.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr)`;
    return gleich.length === zeilen.length
        ? `Alle Zeilen wurden auf diesem Gerät schon genau so als PDF erstellt${wann}.`
        : `${gleich.length} von ${zeilen.length} Zeilen ${gleich.length === 1 ? "wurde" : "wurden"} auf diesem Gerät schon genau so als PDF erstellt${wann}.`;
}

/** Ausgefüllte Spalten, die der Meldevordruck nicht hat, als Satz; leer, wenn keine. */
function nichtGedruckt(zeilen: readonly { eingabe: Eingabe }[], vordruck: VordruckWahl): string {
    if (vordruck !== "meldung") {
        return "";
    }
    const spalten = SPALTEN.filter(spalte => spalte.nurNachricht && zeilen.some(zeile => (zeile.eingabe[spalte.schluessel] ?? "").trim()));
    return spalten.length > 0
        ? `Der Meldevordruck hat keine Felder für ${aufzaehlen(spalten.map(spalte => spalte.titel))}; diese Spalten werden nicht gedruckt.`
        : "";
}

/** Lücken in fortlaufenden Nummern, etwa „Nr. 105 bis 107 fehlen“; einzeln erstellte Nummern zählen nicht als Lücke. */
function nummernluecken(nummern: readonly string[]): string {
    const zahlen = [...new Set(nummern.map(nummer => /^\D*(\d+)$/.exec(nummer.trim())?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);
    if (zahlen.length < 3) {
        return "";
    }
    const erstellt = new Set(juengste().map(eintrag => Number(/^\D*(\d+)$/.exec((eintrag.eingabe.nummer ?? "").trim())?.[1] ?? NaN)));
    const fehlend: number[] = [];
    for (let i = 1; i < zahlen.length; i++) {
        const vorher = zahlen[i - 1] ?? 0;
        const jetzt = zahlen[i] ?? 0;
        if (jetzt - vorher > 1 && jetzt - vorher <= 50) {
            for (let nummer = vorher + 1; nummer < jetzt; nummer++) {
                if (!erstellt.has(nummer)) {
                    fehlend.push(nummer);
                }
            }
        }
    }
    if (fehlend.length === 0) {
        return "";
    }
    // Aufeinanderfolgende zu Bereichen zusammenfassen: „19 bis 21, 25“.
    const bereiche: string[] = [];
    for (let i = 0; i < fehlend.length; i++) {
        const anfang = fehlend[i] ?? 0;
        let ende = anfang;
        while (fehlend[i + 1] === ende + 1) {
            ende = fehlend[++i] ?? ende;
        }
        bereiche.push(ende === anfang ? `${anfang}` : ende === anfang + 1 ? `${anfang}, ${ende}` : `${anfang} bis ${ende}`);
    }
    return `In der Nummernfolge ${fehlend.length === 1 ? "fehlt" : "fehlen"} Nr. ${bereiche.slice(0, 5).join(", ")}${bereiche.length > 5 ? " u. a." : ""}.`;
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
            : `${dateiName}: ${zeilen.length} ${zeilen.length === 1 ? "Zeile" : "Zeilen"} → ${art}.${ersetztText}`;
    element<HTMLParagraphElement>("tabelle-erstellt").hidden = true;

    const warnung = element<HTMLElement>("ergebnis-warnung");
    // Gedruckt wird trotzdem; das soll vor dem Download auffallen.
    // „Gelesen wurde das Blatt …“ ist keine Warnung; es steht in der Zusammenfassung.
    const auffaellig = [...leseHinweise.filter(hinweis => !hinweis.startsWith("Gelesen wurde")), ...zeilen.flatMap(zeile => {
        const laenge = pruefeTextlaenge(zeile.daten.inhalt, vordruck);
        const gekuerzt = gekuerztMeldung(zeile.daten, vordruck);
        const frueher = frueherErstellt(zeile.daten.nummer, zeile.eingabe);
        const punkte = [
            ...zeile.hinweise,
            ...istKritisch(laenge) ? [textlaengeMeldung(laenge)] : [],
            ...gekuerzt ? [gekuerzt] : [],
            ...frueher ? [`Nr. ${zeile.daten.nummer} wurde am ${new Date(frueher.zeit).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} schon ${(frueher.eingabe.inhalt ?? "").trim() !== (zeile.eingabe.inhalt ?? "").trim() ? "mit anderem Inhalt" : "an eine andere Gegenstelle"} erstellt`] : []
        ];
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
    const zusatz = [
        ergebnis.kopfZeile > 1 ? `Die Spaltenköpfe stehen in Zeile ${ergebnis.kopfZeile}; die Zeilen davor werden übergangen.` : "",
        ...ergebnis.doppelteSpalten.map(paar => `Die Spalten ${paar} meinen dasselbe Feld; genommen wird die rechte.`),
        // Wie im Einzelweg: fehlt ein Kennzeichen überall, wird es auf keinem Bogen angekreuzt.
        vordruck !== "meldung" ? fehltIn(zeilen.filter(zeile => !zeile.daten.richtung),
            "eine Richtung; im Betriebsbuch wird dort weder Eingang noch Ausgang angekreuzt") : "",
        fehltIn(zeilen.filter(zeile => !zeile.daten.uebermittlungsweg), "ein Übermittlungsweg; dort wird keiner angekreuzt"),
        vordruck !== "meldung" ? fehltIn(zeilen.filter(zeile => zeile.daten.richtung === "eingang" && zeile.daten.inhalt
            && !Object.values(zeile.daten.aufnahmevermerk).some(wert => (wert ?? "").trim())), "bei einem Eingang der Aufnahmevermerk") : "",
        // Wie im Einzelweg: Abfassungszeit (nicht bei Eingängen) und Absender eines Ausgangs.
        fehltIn(zeilen.filter(zeile => zeile.daten.inhalt && zeile.daten.richtung !== "eingang" && !zeile.daten.abfassungszeit), "die Abfassungszeit"),
        fehltIn(zeilen.filter(zeile => zeile.daten.richtung === "ausgang" && !zeile.daten.absender), "bei einem Ausgang der Absender"),
        nummernluecken(zeilen.map(zeile => zeile.daten.nummer)),
        nichtGedruckt(zeilen, vordruck),
        schonGleichErstellt(zeilen)
    ].filter(Boolean);
    for (const text of zusatz) {
        const satz = document.createElement("p");
        satz.textContent = text;
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
        // Gelesene Auswahlwerte, damit ein verworfener Wert hier als „leer“ auffällt.
        const auswahl = (wert: string | undefined) => wert ? wert.charAt(0).toUpperCase() + wert.slice(1) : "leer";
        const WEGE_TEXT: Record<string, string> = { dfue: "DFÜ" };
        const weg = zeile.daten.uebermittlungsweg;
        // ⚠ Fehler (Wert fehlt auf dem Vordruck), ! Hinweis (wird gedruckt, wie es dasteht).
        const zuLang = istKritisch(pruefeTextlaenge(zeile.daten.inhalt, vordruck)) || Boolean(gekuerztMeldung(zeile.daten, vordruck));
        const marke = zeile.fehler.length > 0 ? " ⚠ Fehler" : zeile.hinweise.length > 0 || zuLang ? " ! Hinweis" : "";
        // Leer heißt beim Vorrang „ohne“; „leer“ nur, wenn ein Wert in der Datei verworfen wurde.
        const verworfen = (feld: string) => zeile.fehler.some(text => text.startsWith(`${feld}:`));
        const vorrang = zeile.daten.vorrang;
        const vorrangZelle = vorrang === "blitz"
            ? ["Vorrang", "⚡ BLITZ", "vorrang-blitz"]
            : vorrang
                ? ["Vorrang", auswahl(vorrang), "vorrang-hoch"]
                : verworfen("Vorrang") ? ["Vorrang", `leer („${(zeile.eingabe.vorrang ?? "").trim()}“ verworfen)`, "leer"] : ["Vorrang", "ohne", "ohne"];
        const zellen = [
            ["Zeile", `${zeile.zeile}${marke}`, "zahl"],
            ["Nr.", zeile.daten.nummer, "zahl"],
            vorrangZelle,
            ["Art", auswahl(zeile.daten.art), zeile.daten.art ? "" : "leer"],
            ["Weg", weg ? WEGE_TEXT[weg] ?? auswahl(weg) : "leer", weg ? "" : "leer"],
            ["Richtung", auswahl(zeile.daten.richtung), zeile.daten.richtung ? "" : "leer"],
            ["Zeit", zeile.daten.abfassungszeit, "zahl"],
            ["Gegenstelle", zeile.daten.empfaenger.join(", "), ""],
            ["Inhalt", kurz(zeile.daten.inhalt, 90), zuLang ? "inhalt zu-lang" : "inhalt"],
            ["Absender", zeile.daten.absender, ""]
        ] as const;
        // Auffällige Zeilen bleiben mobil auch in der verkürzten Übersicht sichtbar.
        tr.classList.toggle("auffaellig", Boolean(marke) || zuLang || vorrang === "blitz");
        for (const [beschriftung, text, klasse] of zellen as readonly (readonly [string, string, string])[]) {
            const td = document.createElement("td");
            td.textContent = text;
            // Am Telefon wird jede Zeile zur Karte, die Spaltenköpfe stehen dann vor den Werten.
            td.dataset["beschriftung"] = beschriftung;
            if (klasse) {
                td.className = klasse;
            }
            // Der Meldevordruck hat weder Vorrang noch Art noch Richtung.
            if (["Vorrang", "Art", "Richtung"].includes(beschriftung)) {
                td.classList.add("nur-nachricht");
            }
            if (beschriftung === "Gegenstelle" && vordruck === "meldung") {
                td.dataset["beschriftung"] = "Empfänger";
            }
            tr.append(td);
        }
        return tr;
    }));

    const tabelle = element<HTMLTableElement>("ergebnis-tabelle");
    tabelle.classList.toggle("meldung", vordruck === "meldung");
    element<HTMLTableCellElement>("uebersicht-gegenstelle").textContent = vordruck === "meldung" ? "Empfänger" : "Gegenstelle";
    // Am Telefon: bei vielen Zeilen zunächst nur die auffälligen, alle auf Wunsch.
    const auffaelligeZeilen = tabelle.tBodies[0]?.querySelectorAll("tr.auffaellig").length ?? 0;
    const alleKnopf = element<HTMLButtonElement>("uebersicht-alle");
    // Ohne auffällige Zeile bliebe die Übersicht leer; dann alle zeigen.
    const kuerzen = zeilen.length > 8 && auffaelligeZeilen > 0 && auffaelligeZeilen < zeilen.length;
    tabelle.classList.toggle("nur-auffaellige", kuerzen);
    alleKnopf.hidden = !kuerzen;
    alleKnopf.textContent = `Alle ${zeilen.length} Zeilen zeigen (jetzt ${auffaelligeZeilen} auffällige)`;

    const pdfKnopf = element<HTMLButtonElement>("tabelle-pdf");
    pdfKnopf.disabled = zeilen.length === 0;
    // Mit „Beide“ entstehen je Zeile zwei Vordrucke.
    const anzahl = zeilen.length * (vordruck === "beide" ? 2 : 1);
    // „Ohne Formular“ ist eine gemerkte Einstellung; am Knopf soll sie nicht überraschen.
    const ohne = optionen().ohneHintergrund ? ", ohne Formular" : "";
    pdfKnopf.textContent = `PDF herunterladen (${anzahl} ${anzahl === 1 ? "Vordruck" : "Vordrucke"}${ohne})`;
    element<HTMLButtonElement>("tabelle-oeffnen").disabled = zeilen.length === 0;
}

/**
 * Zeilen mit verworfenen Werten tragen am unteren Blattrand einen Prüfvermerk,
 * damit der Bogen selbst zeigt, dass dort etwas fehlt.
 */
function tabellenPdf(verteilen = false) {
    const { vordruck } = optionen();
    return erzeugePdf((ergebnis?.zeilen ?? []).flatMap(zeile => {
        const vermerke: string[] = [];
        if (zeile.fehler.length > 0) {
            // Nicht druckbare Zeichen nicht im Vermerk wiederholen: sie kämen dort ebenso als Zeichensalat heraus.
            vermerke.push(...zeile.fehler.map(text => text.startsWith("Zeichen ") ? "nicht druckbare Zeichen, als „?“ gedruckt" : text));
        }
        const zuLang = istKritisch(pruefeTextlaenge(zeile.daten.inhalt, vordruck));
        // Lange Texte auf Folgebögen, jeder mit „Blatt n von m“.
        const teile = verteilen && zuLang ? teileInhalt(zeile.daten.inhalt, vordruck) : [];
        if (zuLang && teile.length <= 1) {
            vermerke.push("Text gekürzt, Rest fehlt");
        }
        const gekuerzt = gekuerzteFelder(zeile.daten, vordruck);
        if (gekuerzt.length > 0) {
            vermerke.push(`gekürzt: ${gekuerzt.join(", ")}`);
        }
        const kurzvermerk = pruefvermerk(zeile.daten, vordruck, zeile.fehler, teile.length > 1);
        const mitVermerk = (daten: VordruckDaten): VordruckDaten => {
            // Kurz und gut sichtbar im Formular, ausführlich am unteren Rand.
            daten.pruefvermerk = kurzvermerk;
            if (vermerke.length > 0) {
                const vermerk = `Prüfen: ${kurz(vermerke.join("; "), 100)}`;
                daten.hinweis = zeile.eingabe.hinweis?.trim() ? `${zeile.eingabe.hinweis.trim()} · ${vermerk}` : vermerk;
            }
            return daten;
        };
        if (teile.length > 1) {
            return teile.map((inhalt, index) => {
                const blatt = zuVordruckDaten(zeile.eingabe).daten;
                blatt.inhalt = inhalt;
                blatt.blatt = `Blatt ${index + 1} von ${teile.length}`;
                return mitVermerk(blatt);
            });
        }
        return [mitVermerk(zeile.daten)];
    }), optionen());
}

/** Nummernbereich für den Dateinamen, z. B. „17-24“. */
function nummernbereich(zeilen: readonly { daten: { nummer: string } }[]): string {
    const nummern = zeilen.map(zeile => zeile.daten.nummer).filter(Boolean);
    const erste = nummern[0];
    const letzte = nummern.at(-1);
    return erste && letzte ? (erste === letzte ? erste : `${erste}-${letzte}`) : "";
}

element<HTMLButtonElement>("tabelle-pdf").addEventListener("click", async ereignis => {
    const knopf = ereignis.currentTarget as HTMLButtonElement;
    if (!kurzSperren(knopf)) {
        return;
    }
    const zeilen = ergebnis?.zeilen ?? [];
    const { vordruck } = optionen();
    const { probleme, zuLang } = tabellenProbleme();
    // Zu lange Texte lassen sich wie im Einzelweg auf Folgebögen verteilen.
    const wahl = probleme.length === 0
        ? "ja"
        : zuLang.length > 0
            ? await frageWahl(`${probleme.join("\n")}\n\nTrotzdem erzeugen, lange Texte auf Folgebögen verteilt?`, "Erzeugen, lange Texte verteilen", "Abbrechen", "Erzeugen, lange Texte gekürzt")
            : await frageWahl(`${probleme.join("\n")}\n\nTrotzdem die PDF erzeugen?`, gekuerzteZeilen() ? "Gekürzt erzeugen" : "Trotzdem erzeugen");
    if (wahl === "nein") {
        return;
    }
    const verteilen = zuLang.length > 0 && wahl === "ja";
    void mitArbeit(knopf, "PDF wird erstellt…", async () => {
        // Einen Takt warten, damit der Knopf seinen Arbeitszustand zeigt, bevor jsPDF rechnet.
        await new Promise(fertig => setTimeout(fertig, 30));
        const jetzt = new Date();
        herunterladen(tabellenPdf(verteilen).output("blob"), dateiname(optionen(), zeilen.length, jetzt, nummernbereich(zeilen)));
        // Auch Tabellen-Vordrucke in die Liste: zum Abgleich und gegen doppelte Nummern.
        // Ein zweiter Download derselben Tabelle trägt nichts doppelt ein.
        const gemerkt = merkeVordrucke(zeilen.map(zeile => zeile.eingabe), jetzt, vordruck, index => {
            const zeile = zeilen[index];
            if (!zeile) {
                return "";
            }
            const lang = istKritisch(pruefeTextlaenge(zeile.daten.inhalt, vordruck));
            return [
                zeile.fehler.length > 0 ? "mit Fehlern gedruckt" : "",
                lang && verteilen ? `auf ${teileInhalt(zeile.daten.inhalt, vordruck).length} Vordrucke verteilt`
                    : lang || gekuerztMeldung(zeile.daten, vordruck) ? "gekürzt gedruckt" : ""
            ].filter(Boolean).join(", ");
        });
        verlauf = gemerkt.liste;
        verlaufZeigen();
        const uhr = jetzt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
        const liste = gemerkt.neu === 0
            ? "Die Liste erstellter Vordrucke enthielt diese Zeilen schon."
            : `${gemerkt.neu} in die Liste erstellter Vordrucke eingetragen${gemerkt.verdraengt > 0 ? `; dafür sind die ältesten ${gemerkt.verdraengt} herausgefallen (Liste fasst ${HOECHSTENS})` : ""}.`;
        element<HTMLParagraphElement>("tabelle-erstellt").textContent = `PDF um ${uhr} Uhr erstellt. ${liste}`;
        element<HTMLParagraphElement>("tabelle-erstellt").hidden = false;
    });
});

/** Was vor dem Erzeugen aus der Tabelle nachgefragt wird, für Download und Vorschau gleich. */
function tabellenProbleme(): { probleme: string[]; zuLang: TabellenErgebnis["zeilen"] } {
    const zeilen = ergebnis?.zeilen ?? [];
    const mitFehler = zeilen.filter(zeile => zeile.fehler.length > 0);
    const erste = mitFehler[0];
    const { vordruck } = optionen();
    const zuLang = zeilen.filter(zeile => istKritisch(pruefeTextlaenge(zeile.daten.inhalt, vordruck)));
    const doppelt = zeilen.filter(zeile => zeile.hinweise.some(hinweis => hinweis.includes("steht auch in Zeile")));
    const schonErstellt = zeilen.filter(zeile => frueherErstellt(zeile.daten.nummer, zeile.eingabe));
    const gekuerzt = zeilen.filter(zeile => gekuerztMeldung(zeile.daten, vordruck));
    const unmoeglich = zeilen.filter(zeile => zeile.hinweise.some(hinweis => hinweis.includes(UNMOEGLICH)));
    const probleme = [
        erste ? `${mitFehler.length} ${mitFehler.length === 1 ? "Zeile hat" : "Zeilen haben"} Fehler, etwa Zeile ${erste.zeile}: ${erste.fehler[0]}. Betroffene Felder bleiben leer oder werden ersetzt.` : "",
        zuLang.length > 0 ? `In ${zuLang.length === 1 ? "Zeile" : "den Zeilen"} ${zeilenListe(zuLang)} ist der Text länger als ein Vordruck.` : "",
        gekuerzt.length > 0 ? `In ${gekuerzt.length === 1 ? "Zeile" : "den Zeilen"} ${zeilenListe(gekuerzt)}: ${gekuerztMeldung(gekuerzt[0]?.daten ?? new VordruckDatenKlasse(), vordruck)}${gekuerzt.length > 1 ? " (in Zeile " + gekuerzt[0]?.zeile + ")" : ""}.` : "",
        unmoeglich.length > 0 ? `In ${unmoeglich.length === 1 ? "Zeile" : "den Zeilen"} ${zeilenListe(unmoeglich)} steht eine unmögliche Uhrzeit oder ein unmögliches Datum.` : "",
        doppelt.length > 0 ? `Die Zeilen ${zeilenListe(doppelt)} haben doppelte Nummern.` : "",
        schonErstellt.length > 0 ? nummernSatz([...new Set(schonErstellt.map(zeile => zeile.daten.nummer))], "auf diesem Gerät schon mit anderem Inhalt oder an eine andere Gegenstelle erstellt") : "",
        // Was die Übersicht meldet, fragt auch die Rückfrage: auch beim zweiten Download.
        schonGleichErstellt(zeilen),
        nummernluecken(zeilen.map(zeile => zeile.daten.nummer)),
        vordruck !== "meldung" ? fehltIn(zeilen.filter(zeile => zeile.daten.richtung === "eingang" && zeile.daten.inhalt
            && !Object.values(zeile.daten.aufnahmevermerk).some(wert => (wert ?? "").trim())), "bei einem Eingang der Aufnahmevermerk") : "",
        leseHinweise.find(hinweis => !hinweis.startsWith("Gelesen wurde")) ?? ""
    ].filter(Boolean);
    return { probleme, zuLang };
}

/** „Nr. 17 wurde …“ oder „Die Nummern 17 und 18 wurden …“. */
function nummernSatz(nummern: readonly string[], rest: string): string {
    return nummern.length === 1
        ? `Nr. ${nummern[0] ?? ""} wurde ${rest}.`
        : `Die Nummern ${aufzaehlen(nummern.slice(0, 6))}${nummern.length > 6 ? " u. a." : ""} wurden ${rest}.`;
}

/** Ob in der Tabelle ein Feld gekürzt gedruckt würde. */
function gekuerzteZeilen(): boolean {
    const { vordruck } = optionen();
    return (ergebnis?.zeilen ?? []).some(zeile => gekuerzteFelder(zeile.daten, vordruck).length > 0);
}

/** „3, 7 und 9“, höchstens acht Zeilennummern. */
function zeilenListe(zeilen: readonly { zeile: number }[]): string {
    return aufzaehlen(zeilen.slice(0, 8).map(zeile => String(zeile.zeile))) + (zeilen.length > 8 ? " u. a." : "");
}

/** Ob die Nr. auf diesem Gerät schon mit anderem Inhalt erstellt wurde; der gleiche Stand zählt nicht. */
function frueherErstellt(nummer: string, eingabe: Eingabe): Eintrag | undefined {
    const stand = JSON.stringify(eingabe);
    return mitNummer(juengste(), nummer).find(eintrag => JSON.stringify(eintrag.eingabe) !== stand
        && ((eintrag.eingabe.inhalt ?? "").trim() !== (eingabe.inhalt ?? "").trim()
            || (eintrag.eingabe.empfaenger ?? "").trim() !== (eingabe.empfaenger ?? "").trim()));
}

// Auch die Vorschau fragt bei Fehlern nach: aus dem neuen Tab wird oft direkt gedruckt.
element<HTMLButtonElement>("tabelle-oeffnen").addEventListener("click", async ereignis => {
    if (!kurzSperren(ereignis.currentTarget as HTMLButtonElement)) {
        return;
    }
    // Dieselben Rückfragen wie beim Download: aus dem neuen Tab wird oft direkt gedruckt.
    const { probleme, zuLang } = tabellenProbleme();
    const wahl = probleme.length === 0
        ? "ja"
        : zuLang.length > 0
            ? await frageWahl(`${probleme.join("\n")}\n\nTrotzdem öffnen, lange Texte auf Folgebögen verteilt?`, "Öffnen, lange Texte verteilen", "Abbrechen", "Öffnen, lange Texte gekürzt")
            : await frageWahl(`${probleme.join("\n")}\n\nTrotzdem öffnen?`, "Trotzdem öffnen");
    if (wahl === "nein") {
        return;
    }
    window.open(URL.createObjectURL(tabellenPdf(zuLang.length > 0 && wahl === "ja").output("blob")), "_blank", "noopener");
});

element<HTMLButtonElement>("uebersicht-alle").addEventListener("click", ereignis => {
    element<HTMLTableElement>("ergebnis-tabelle").classList.remove("nur-auffaellige");
    (ereignis.currentTarget as HTMLButtonElement).hidden = true;
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
    if (!datei) {
        return;
    }
    if (element<HTMLElement>("ansicht-tabelle").hidden) {
        meldeStatus(`${datei.name} wurde nicht eingelesen. Tabellen im Reiter „Aus Excel oder CSV“ ablegen.`, "behalten");
        return;
    }
    // Neben der Ablagefläche gelandet und schon eine Tabelle geladen: eher ein Versehen.
    const aufFlaeche = ereignis.target instanceof Node && dateiZiel.contains(ereignis.target);
    if (ergebnis && !aufFlaeche) {
        void frage(`${datei.name} einlesen? Die geladene Tabelle ${dateiName} wird ersetzt.`, "Einlesen").then(ja => {
            if (ja) {
                void dateiEinlesen(datei);
            }
        });
        return;
    }
    void dateiEinlesen(datei);
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
{
    // Gestartet: die Ladefrist abbrechen und eine schon gezeigte Meldung wieder entfernen
    // (bei sehr langsamem Netz startet die App auch nach den 12 s noch).
    const fenster = window as Window & { bnvGestartet?: boolean; bnvLadeUhr?: number };
    fenster.bnvGestartet = true;
    clearTimeout(fenster.bnvLadeUhr);
    const meldung = document.getElementById("laedt-nicht");
    if (meldung) {
        meldung.remove();
        // Stand die Meldung schon da, soll auch der späte Start auffallen.
        zeigeKurzmeldung("Die App ist jetzt bereit; Eingaben werden gespeichert.", false);
    }
}
if (wiederhergestellt || verlauf.length > 0) {
    document.documentElement.classList.add("wiederkehrend");
}

// Zugeklappt; der Kopf zeigt die Wahl. So beginnt die Maske auch am Rechner weiter oben.
element<HTMLDetailsElement>("einstellungen").open = false;

// Sprung zum Abschluss: die Knöpfe unten im Bild, darüber Hinweise und so viel Vorschau wie Platz ist.
for (const knopf of document.querySelectorAll<HTMLButtonElement>("button[data-sprung]")) {
    knopf.addEventListener("click", () => {
        (document.activeElement as HTMLElement | null)?.blur();
        const aktionen = element<HTMLButtonElement>("einzeln-pdf").parentElement ?? element<HTMLElement>("abschluss");
        aktionen.scrollIntoView({ block: "end", behavior: "smooth" });
        // Der zweite Tipp eines Doppeltipps landet sonst auf dem Knopf, der jetzt
        // dort liegt, wo eben die Leiste war: kurz keine Tipps im Abschluss.
        const abschluss = element<HTMLElement>("abschluss");
        abschluss.style.pointerEvents = "none";
        setTimeout(() => {
            abschluss.style.pointerEvents = "";
        }, 700);
    });
}

// Ohne Netz geht alles weiter; das soll man sehen, statt es zu vermuten. Den
// Excel-Weg nur zusagen, wenn der Offline-Speicher die Seite steuert.
function netzZeigen(): void {
    element<HTMLParagraphElement>("netz-stand").hidden = navigator.onLine;
    const excel = element<HTMLSpanElement>("netz-excel");
    excel.hidden = true;
    // Den Excel-Weg nur zusagen, wenn er sich ohne Netz wirklich laden lässt:
    // genau die Teile dieser Fassung, nicht irgendeine gespeicherte.
    if (!navigator.onLine) {
        void excelTeil().then(() => {
            excel.hidden = navigator.onLine;
        }).catch(() => undefined);
        const hinweis = element<HTMLParagraphElement>("speicher-stand");
        if (!hinweis.hidden && hinweis.textContent?.startsWith("Der Server ist wieder erreichbar")) {
            hinweis.textContent = `Kein Netz: Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}.`;
        }
    }
    // Netz wieder da: Läuft die gespeicherte Fassung, prüfen, ob der Server wieder antwortet.
    if (navigator.onLine && !element<HTMLParagraphElement>("speicher-stand").hidden) {
        // HEAD geht am Offline-Dienst vorbei (er bedient nur GET) und fragt wirklich den Server.
        // Die Startseite selbst: Liefert der Server dafür noch einen Fehler, ist er nicht zurück.
        void fetch("./", { method: "HEAD", cache: "no-store" })
            .then(antwort => {
                if (antwort.ok) {
                    const hinweis = element<HTMLParagraphElement>("speicher-stand");
                    hinweis.textContent = "Der Server ist wieder erreichbar. Neu laden holt die aktuelle Fassung.";
                }
            })
            .catch(() => undefined);
    }
}
addEventListener("online", netzZeigen);
// Auch ohne Netzwechsel kann der Server zurückkommen: einmal pro Minute nachsehen.
setInterval(() => {
    if (!element<HTMLParagraphElement>("speicher-stand").hidden) {
        netzZeigen();
    }
}, 60_000);
addEventListener("offline", netzZeigen);
netzZeigen();
zeigeReiter(location.hash === "#tabelle" ? "tabelle" : "einzeln", false, "ersetzen");

// Nach dem Neuladen ist die Tabelle weg (sie wird nicht gespeichert); wenigstens sagen, welche es war.
const vorigeTabelle = tabSpeicher()?.getItem("bnv.tabelle.v1");
if (vorigeTabelle && !ergebnis) {
    const hinweis = element<HTMLParagraphElement>("tabelle-vorher");
    hinweis.textContent = `Vor dem Neuladen war ${vorigeTabelle} geladen. Tabellen werden nicht gespeichert; bitte erneut einlesen.`;
    hinweis.hidden = false;
}

// Ein zweiter offener Tab arbeitet mit demselben gespeicherten Entwurf; der Hinweis soll das sagen.
try {
    const kanal = new BroadcastChannel("bnv");
    kanal.addEventListener("message", nachricht => {
        if (nachricht.data === "wer-ist-da") {
            kanal.postMessage("hier");
        } else if (nachricht.data === "hier" && !entwurfHinweis.hidden && wiederhergestellt) {
            const zusatz = document.getElementById("entwurf-zusatz");
            if (zusatz && !zusatz.textContent?.includes("anderen Tab")) {
                zusatz.textContent += " Die App ist noch in einem anderen Tab offen; dieser Entwurf stammt vermutlich von dort.";
            }
        }
    });
    kanal.postMessage("wer-ist-da");
} catch {
    // Ohne BroadcastChannel kein Hinweis.
}

// Fassung im Fuß, damit bei Rückfragen klar ist, welcher Stand läuft.
element<HTMLSpanElement>("fassung").textContent = `Fassung ${__FASSUNG__}`;

// Nach dem ersten Aufruf startet die Seite aus dem Cache, auch ohne Netz.
// Der Dienst entsteht erst beim Bauen (web/vite.config.ts), im Entwicklungsserver gibt es ihn nicht.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    // Eine neue Fassung übernimmt sofort; die offene Seite läuft bis zum Neuladen mit der alten.
    const hatteDienst = Boolean(navigator.serviceWorker.controller);
    let nachWechsel = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        netzZeigen();
        // Nur melden, wenn der neue Dienst wirklich eine andere Fassung hat als diese Seite.
        if (hatteDienst) {
            nachWechsel = true;
            navigator.serviceWorker.controller?.postMessage("stand?");
        }
    });
    navigator.serviceWorker.addEventListener("message", ereignis => {
        const stand = ereignis.data as { art?: string; fassung?: string; ausSpeicher?: boolean } | null;
        if (stand?.art !== "stand") {
            return;
        }
        if (nachWechsel) {
            nachWechsel = false;
            if (stand.fassung && stand.fassung !== __FASSUNG__) {
                zeigeKurzmeldung(`Neue Fassung ${stand.fassung} ist geladen; sie gilt ab dem nächsten Neuladen. Eingaben bleiben erhalten.`, false);
            }
            return;
        }
        if (stand.ausSpeicher) {
            const hinweis = element<HTMLParagraphElement>("speicher-stand");
            hinweis.textContent = `Server nicht erreichbar: Es läuft die auf diesem Gerät gespeicherte Fassung ${__FASSUNG__}.`;
            hinweis.hidden = false;
        }
    });
    navigator.serviceWorker.controller?.postMessage("stand?");
    // Steuert schon ein Dienst die Seite (etwa beim Start ohne Netz), gilt die Zusage sofort.
    if (navigator.serviceWorker.controller) {
        element<HTMLElement>("offline-stand").hidden = false;
    }
    navigator.serviceWorker.register("./sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
            element<HTMLElement>("offline-stand").hidden = false;
            // Bitten, den Offline-Stand nicht bei Platzmangel zu räumen; der Browser entscheidet.
            void navigator.storage?.persist?.().catch(() => false);
        })
        .catch(() => {
            // Ohne Dienst läuft die Seite wie bisher, nur nicht ohne Netz.
        });
}
