/**
 * ambient.js - Vie du décor : nuages qui dérivent, rafales de vent (pétales), herbes qui ondulent,
 * un Pokémon qui traverse le ciel et d'autres qui sortent la tête des hautes herbes.
 * Usage : <div class="ambient-layer" data-ambient="town"></div> dans une scène (rempli au chargement).
 * Positions en % de la scène ; les Pokémon sont des sprites animés Donjon Mystère (js/pmd-sprite.js).
 */
const Ambient = (() => {
    const INK = '#2b2433';

    // Réglages par décor : nuages [haut %, échelle, durée s], touffes [gauche %, haut %],
    // Pokémon volant (n° du Pokédex, hauteur en % ou en px) et Pokémon cachés dans les herbes [n°, gauche %, haut %, délai s]
    const SCENES = {
        town: {
            clouds: [[4, 1, 95], [11, .7, 130], [16, .55, 160]],
            tufts: [[8, 31], [30, 39], [62, 37], [92, 33], [34, 63], [6, 70], [92, 76], [60, 86], [28, 87]],
            petals: 7,
            flyer: { dex: 16, top: '168px' }, // sous l'en-tête (HUD), au-dessus des collines
            hiders: [[43, 30, 61, 2], [19, 72, 44, 7]]
        },
        title: {
            clouds: [[6, 1, 90], [20, .7, 120], [30, .5, 150]],
            tufts: [[12, 62], [80, 60], [30, 74], [70, 80], [46, 90], [8, 86]],
            petals: 6,
            flyer: { dex: 16, top: 22 },
            hiders: [[43, 70, 66, 3]]
        },
        route: {
            clouds: [[3, .9, 100], [12, .6, 140]],
            tufts: [[10, 34], [86, 30], [40, 52], [8, 60], [90, 64], [30, 80], [74, 88]],
            petals: 6,
            flyer: { dex: 12, top: '120px' }, // Papilusion, sous la barre de titre
            hiders: [[25, 22, 50, 1], [10, 80, 72, 5]]
        },
        // Carte du monde : la mer, ses vagues et ses Pokémon nageurs [n°, gauche %, départ %, arrivée %, durée s, direction]
        map: {
            clouds: [[3, .8, 120], [10, .6, 150]],
            tufts: [],
            petals: 0,
            flyer: { dex: 278, top: '120px', bounce: true }, // Goélise, en aller-retour au-dessus de la mer
            hiders: [],
            swimmers: [[131, 6, 60, 16, 46, 'up'], [320, 93, 28, 56, 38, 'down']],
            waves: [[3, 28], [9, 46], [95, 36], [89, 50], [6, 9], [91, 15], [48, 4], [14, 22]]
        }
    };

    const cloudSvg = `<svg viewBox="0 0 120 46" aria-hidden="true"><path d="M6 42a24 24 0 0 1 28-24 32 32 0 0 1 58 4 22 22 0 0 1 22 20z" fill="#f7ecdc" stroke="#d8cbbb" stroke-width="1.5"/></svg>`;
    const tuftSvg = `<svg viewBox="0 0 30 26" aria-hidden="true"><path d="M3 26q3-14 7-3q2-20 6-1q3-17 7 1q3-12 6 3z" fill="#7ca868" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/><path d="M10 23q1-8 2-14M17 23q0-9 1-16" stroke="#9cc489" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>`;
    const waveSvg = `<svg viewBox="0 0 34 12" aria-hidden="true"><path d="M2 8q4-5 8 0t8 0M16 4q4-4 8 0t8 0" stroke="#e6f3f0" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
    const petalSvg = (c) => `<svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 4q5-5 10 0q-5 5-10 0z" fill="${c}" stroke="${INK}" stroke-width=".6"/></svg>`;
    const grassFront = `<svg class="amb-grass-front" viewBox="0 0 90 40" aria-hidden="true"><path d="M0 40q4-24 10-6q3-30 9-4q4-26 10 0q3-30 9-2q4-26 10 2q3-30 9-4q4-24 10 2q3-28 9 0q4-20 14 12z" fill="#5f9256" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 38q2-14 4-24M40 38q1-16 3-26M66 38q2-14 4-22" stroke="#86b277" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`;

    // Petit hasard reproductible pour varier durées et délais sans changer à chaque chargement
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    const pmd = (dex, facing, alt) => (typeof PmdSprite !== 'undefined')
        ? PmdSprite.markup({ dex, facing, alt }) : '';

    // cfgOverride : réglages fournis directement (cartes de zone, qui changent de biome)
    function build(layer, cfgOverride = null) {
        const cfg = cfgOverride || SCENES[layer.dataset.ambient];
        if (!cfg || layer.dataset.ambientReady) return;
        layer.dataset.ambientReady = '1';
        const parts = [];

        cfg.clouds.forEach(([top, scale, dur]) => parts.push(
            `<div class="amb-cloud" style="top:${top}%; --s:${scale}; --dur:${dur}s; --delay:-${(rand() * dur).toFixed(1)}s">${cloudSvg}</div>`));

        cfg.tufts.forEach(([left, top]) => parts.push(
            `<div class="amb-tuft" style="left:${left}%; top:${top}%; --dur:${(2.4 + rand() * 1.4).toFixed(2)}s; --delay:-${(rand() * 3).toFixed(2)}s">${tuftSvg}</div>`));

        // Rafales : les pétales partent ensemble par vagues, chacun à sa hauteur
        const colors = ['#e9a3b4', '#f3e2c3', '#f0c86e', '#e9a3b4'];
        for (let i = 0; i < cfg.petals; i++) parts.push(
            `<div class="amb-petal" style="top:${(18 + rand() * 62).toFixed(1)}%; --dur:${(6 + rand() * 3).toFixed(2)}s; --delay:${(rand() * 1.6 + (i % 2) * 7).toFixed(2)}s; --rise:${(-40 - rand() * 120).toFixed(0)}px">
                <span class="amb-petal-wobble">${petalSvg(colors[i % colors.length])}</span></div>`);

        if (cfg.flyer) {
            const top = typeof cfg.flyer.top === 'number' ? cfg.flyer.top + '%' : cfg.flyer.top;
            // bounce : aller vers la droite puis retour vers la gauche, un sprite par sens
            parts.push(cfg.flyer.bounce
                ? `<div class="amb-flyer bounce" style="top:${top}; --dur:32s; --delay:0s">
                    <div class="amb-swim-go">${pmd(cfg.flyer.dex, 'right', 'Pokémon en vol')}</div>
                    <div class="amb-swim-back">${pmd(cfg.flyer.dex, 'left', 'Pokémon en vol')}</div></div>`
                : `<div class="amb-flyer" style="top:${top}">${pmd(cfg.flyer.dex, 'right', 'Pokémon en vol')}</div>`);
        }

        (cfg.waves || []).forEach(([left, top]) => parts.push(
            `<div class="amb-wave" style="left:${left}%; top:${top}%; --delay:-${(rand() * 4).toFixed(2)}s">${waveSvg}</div>`));

        // Nageurs : aller-retour le long de la côte ; un sprite par sens (la direction d'un sprite PMD est fixe)
        const back = { up: 'down', down: 'up', left: 'right', right: 'left' };
        (cfg.swimmers || []).forEach(([dex, left, from, to, dur, facing]) => parts.push(
            `<div class="amb-swim" style="left:${left}%; --y0:${from}%; --y1:${to}%; --dur:${dur}s; --delay:-${(rand() * dur).toFixed(1)}s">
                <span class="amb-wake"></span>
                <div class="amb-swim-go">${pmd(dex, facing, 'Pokémon qui nage')}</div>
                <div class="amb-swim-back">${pmd(dex, back[facing] || facing, 'Pokémon qui nage')}</div></div>`));

        cfg.hiders.forEach(([dex, left, top, delay]) => parts.push(
            `<div class="amb-grass" style="left:${left}%; top:${top}%; --delay:${delay}s">
                <div class="amb-peek">${pmd(dex, 'down', 'Pokémon dans les herbes')}</div>${grassFront}</div>`));

        layer.innerHTML = parts.join('');

        if (typeof PmdSprite === 'undefined') return;
        PmdSprite.hydrate(layer);
        // Les Pokémon en mouvement jouent leur animation en boucle une fois le sprite chargé :
        // battement d'ailes sur place pour les volants (Float, Hover ; pas FlapAround, où le Pokémon tourne
        // sur lui-même), nage (Walk) pour les autres
        layer.querySelectorAll('.amb-flyer .pmd-sprite, .amb-swim .pmd-sprite').forEach(sprite => {
            const anims = sprite.closest('.amb-flyer') ? ['Float', 'Hover', 'Walk'] : ['Walk', 'Idle'];
            const tryMove = (tries = 0) => {
                if (sprite.dataset.pmdState === 'ready') PmdSprite.play(sprite, anims, { loop: true });
                else if (tries < 40 && sprite.dataset.pmdState !== 'fallback') setTimeout(() => tryMove(tries + 1), 250);
            };
            tryMove();
        });
    }

    const init = (root = document) => root.querySelectorAll('[data-ambient]').forEach(layer => build(layer));
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));

    // Remplit (ou remplit à nouveau) un calque avec des réglages donnés
    function mount(layer, cfg) {
        delete layer.dataset.ambientReady;
        layer.innerHTML = '';
        build(layer, { clouds: [], tufts: [], petals: 0, hiders: [], ...cfg });
    }

    return { init, mount };
})();
