// Dienst für den Start ohne Netz. Vorlage: web/vite.config.ts setzt beim Bauen
// VERSION und DATEIEN ein und legt das Ergebnis als sw.js neben index.html.
//
// Seiten: erst das Netz (damit eine neue Fassung ankommt), ohne Netz, bei
// Fehlerantwort oder nach drei Sekunden die gespeicherte. Alles andere hat
// einen Inhalts-Hash im Namen und kommt aus dem Speicher.
//
// Eine neue Fassung übernimmt sofort; die vorige bleibt als Speicher erhalten,
// damit ein noch offener Tab der alten Fassung seine Programmteile (etwa den
// Excel-Teil) auch ohne Netz findet.

const VERSION = "__VERSION__";
const DATEIEN = __DATEIEN__;
const SPEICHER = `bnv-${VERSION}`;
const NETZ_WARTEN_MS = 3000;

self.addEventListener("install", ereignis => {
    // cache: "reload" geht am HTTP-Cache vorbei. Sonst könnte eine dort noch
    // liegende alte Startseite neben den neuen Programmteilen landen und die
    // App ohne Netz nie fertig laden.
    ereignis.waitUntil(caches.open(SPEICHER)
        .then(speicher => speicher.addAll(DATEIEN.map(datei => new Request(datei, { cache: "reload" }))))
        .then(() => self.skipWaiting()));
});

self.addEventListener("activate", ereignis => {
    // Die aktuelle und die vorige Fassung bleiben, ältere fallen weg.
    ereignis.waitUntil(caches.keys()
        .then(namen => {
            const eigene = namen.filter(name => name.startsWith("bnv-"));
            const behalten = new Set([SPEICHER, ...eigene.filter(name => name !== SPEICHER).slice(-1)]);
            return Promise.all(eigene.filter(name => !behalten.has(name)).map(name => caches.delete(name)));
        })
        .then(() => self.clients.claim()));
});

/** Erst in der aktuellen Fassung suchen, dann in der vorigen. */
function ausSpeicher(anfrage) {
    return caches.open(SPEICHER)
        .then(speicher => speicher.match(anfrage, { ignoreSearch: true }))
        .then(gefunden => gefunden ?? caches.match(anfrage, { ignoreSearch: true }));
}

function seite(anfrage) {
    const ersatz = () => ausSpeicher(anfrage)
        .then(gefunden => gefunden ?? ausSpeicher(new URL("./index.html", self.registration.scope).href))
        .then(gefunden => gefunden ?? Response.error());
    return new Promise(fertig => {
        let erledigt = false;
        const ende = antwort => {
            if (!erledigt) {
                erledigt = true;
                fertig(antwort);
            }
        };
        // Bei schwachem Netz nicht ewig warten: nach drei Sekunden die gespeicherte Seite.
        const uhr = setTimeout(() => ende(ersatz()), NETZ_WARTEN_MS);
        // no-cache: beim Server nachfragen, statt eine alte Seite aus dem HTTP-Cache zu nehmen.
        fetch(anfrage.url, { cache: "no-cache", credentials: "same-origin" })
            .then(antwort => {
                clearTimeout(uhr);
                // Eine Fehlerseite des Servers (404, 503 …) soll die gespeicherte App nicht verdrängen.
                ende(antwort.ok ? antwort : ersatz().then(gespeichert => gespeichert.type === "error" ? antwort : gespeichert));
            })
            .catch(() => {
                clearTimeout(uhr);
                ende(ersatz());
            });
    });
}

function programmteil(anfrage) {
    return ausSpeicher(anfrage).then(gefunden => gefunden ?? fetch(anfrage).then(antwort => {
        // Was nachgeladen werden musste, für den nächsten Start ohne Netz merken.
        if (antwort.ok && antwort.type === "basic") {
            const kopie = antwort.clone();
            caches.open(SPEICHER).then(speicher => speicher.put(anfrage, kopie));
        }
        return antwort;
    }));
}

self.addEventListener("fetch", ereignis => {
    const anfrage = ereignis.request;
    if (anfrage.method !== "GET" || new URL(anfrage.url).origin !== self.location.origin) {
        return;
    }
    ereignis.respondWith(anfrage.mode === "navigate" ? seite(anfrage) : programmteil(anfrage));
});
