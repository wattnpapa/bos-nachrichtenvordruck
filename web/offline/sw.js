// Dienst für den Start ohne Netz. Vorlage: web/vite.config.ts setzt beim Bauen
// VERSION und DATEIEN ein und legt das Ergebnis als sw.js neben index.html.
//
// Seiten: erst das Netz (damit eine neue Fassung ankommt), ohne Netz die
// gespeicherte. Alles andere hat einen Inhalts-Hash im Namen und kommt aus dem
// Speicher. Eine neue Fassung übernimmt erst, wenn kein Tab der alten mehr
// offen ist; bis dahin bleiben Seite und Programmteile zueinander passend.

const VERSION = "__VERSION__";
const DATEIEN = __DATEIEN__;
const SPEICHER = `bnv-${VERSION}`;
const NETZ_WARTEN_MS = 3000;

self.addEventListener("install", ereignis => {
    ereignis.waitUntil(caches.open(SPEICHER).then(speicher => speicher.addAll(DATEIEN)));
});

self.addEventListener("activate", ereignis => {
    ereignis.waitUntil(caches.keys().then(namen => Promise.all(
        namen.filter(name => name.startsWith("bnv-") && name !== SPEICHER).map(name => caches.delete(name))
    )));
});

function ausSpeicher(anfrage) {
    return caches.open(SPEICHER).then(speicher => speicher.match(anfrage, { ignoreSearch: true }));
}

function seite(anfrage) {
    const ersatz = () => ausSpeicher(anfrage)
        .then(gefunden => gefunden ?? ausSpeicher(new URL("./index.html", self.registration.scope).href))
        .then(gefunden => gefunden ?? Response.error());
    // Bei schwachem Netz nicht ewig warten: nach drei Sekunden die gespeicherte Seite.
    return new Promise(fertig => {
        const uhr = setTimeout(() => fertig(ersatz()), NETZ_WARTEN_MS);
        fetch(anfrage)
            .then(antwort => {
                clearTimeout(uhr);
                fertig(antwort);
            })
            .catch(() => {
                clearTimeout(uhr);
                fertig(ersatz());
            });
    });
}

self.addEventListener("fetch", ereignis => {
    const anfrage = ereignis.request;
    if (anfrage.method !== "GET" || new URL(anfrage.url).origin !== self.location.origin) {
        return;
    }
    if (anfrage.mode === "navigate") {
        ereignis.respondWith(seite(anfrage));
        return;
    }
    ereignis.respondWith(ausSpeicher(anfrage).then(gefunden => gefunden ?? fetch(anfrage)));
});
