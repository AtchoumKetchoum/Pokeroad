/**
 * sw.js - Service worker de PokéRoad (installation en appli sur mobile)
 * - Fichiers du jeu (même site) : réseau d'abord, pour toujours avoir la dernière version,
 *   avec repli sur le cache si l'appareil est hors ligne.
 * - Sprites distants (PMD, PokeAPI sur GitHub) : cache d'abord, ils ne changent pas.
 */
const VERSION = 'pokeroad-v6'; // ciblage par colonne (cases 1 à 9), zones rééquilibrées pour 5 Pokémon sur 9 cases
const SHELL = ['./', './index.html', './manifest.webmanifest', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
const SPRITE_HOSTS = ['raw.githubusercontent.com'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    // Supprime les caches des versions précédentes
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (SPRITE_HOSTS.includes(url.hostname)) {
        event.respondWith(caches.open(VERSION).then(async cache => {
            const hit = await cache.match(req);
            // Une copie « opaque » (chargée par <img>) ne sert pas à une requête CORS qui doit lire les pixels
            if (hit && !(hit.type === 'opaque' && req.mode === 'cors')) return hit;
            const res = await fetch(req);
            // Les images chargées par <img> arrivent en réponse « opaque » : on les garde aussi
            if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
            return res;
        }));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(fetch(req).then(res => {
            if (res.ok) {
                const copy = res.clone(); // copie faite tout de suite, avant que la page ne lise la réponse
                caches.open(VERSION).then(cache => cache.put(req, copy));
            }
            return res;
        }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
    }
});
