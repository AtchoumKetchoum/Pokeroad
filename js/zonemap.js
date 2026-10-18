/**
 * zonemap.js - Carte d'une zone (ex. Route de l'Éveil), entre la carte du monde et le combat.
 * Décor du biome de la zone, chemin sinueux qui monte et les 10 vagues de combats :
 * vagues terminées cochées, vague en cours avec le dresseur et sa progression, boss à la vague 10.
 * Le bouton « Combattre » reprend là où le joueur en est (js/battle-ui.js lit pokerode_current_zone).
 */

// Pokémon d'ambiance par biome : un qui vole, d'autres cachés dans les herbes (numéros du Pokédex)
const ZONE_LIFE = {
    plains: { fly: 16, hide: [19, 161] },      // Roucool ; Rattata, Fouinette
    meadow: { fly: 12, hide: [43, 10] },       // Papilusion ; Mystherbe, Chenipan
    forest: { fly: 15, hide: [13, 10] },       // Dardargnan ; Aspicot, Chenipan
    lake: { fly: 278, hide: [118] },           // Goélise ; Poissirène
    ruins: { fly: 41, hide: [92, 200] },       // Nosferapti ; Fantominus, Feuforêve
    mountain: { fly: 21, hide: [74, 66] },     // Piafabec ; Racaillou, Machoc
    mist: { fly: 41, hide: [220] },            // Nosferapti ; Marcacrin
    snow: { fly: 225, hide: [220, 215] },      // Cadoizo ; Marcacrin, Farfuret
    archipelago: { fly: 278, hide: [] },       // Goélise
    sky: { fly: 333, hide: [] }                // Tylton
};
const GRASSY = ['plains', 'meadow', 'forest', 'lake', 'ruins'];

// Place des 10 vagues sur la carte (en % de la scène), de la vague 1 (en bas) au boss (en haut)
const WAVE_SPOTS = [[50, 80], [27, 72.5], [62, 65], [31, 57.5], [69, 50], [34, 42.5], [66, 35], [30, 27.5], [61, 20], [50, 12.5]];

let zoneViewIndex = 1;

function openZone(zoneIndex) {
    zoneViewIndex = zoneIndex;
    localStorage.setItem('pokerode_zone_view', zoneIndex);
    ViewManager.show('zone');
}

// Courbe lisse passant par tous les points (Catmull-Rom -> Bézier), en coordonnées de la scène
function smoothPath(points) {
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i], p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    return d;
}

window.initZone = async () => {
    await GameData.init();
    zoneViewIndex = +(localStorage.getItem('pokerode_zone_view') || zoneViewIndex) || 1;
    const view = document.getElementById('view-zone');
    const stage = view.querySelector('.scaler-view');
    const zone = getZoneInfo(zoneViewIndex);
    const prog = GameData.getProgression();

    // Où en est le joueur dans cette zone : terminée, en cours ou pas encore atteinte
    const done = zoneViewIndex < prog.zone;
    const current = zoneViewIndex === prog.zone;
    const wave = done ? 11 : current ? prog.wave : 1;
    const battle = current ? prog.battle : 1;

    // Décor du biome
    const sceneEl = document.getElementById('zone-scene');
    sceneEl.dataset.scene = zone.biome;
    delete sceneEl.dataset.sceneDrawn;
    Art.hydrate(stage);

    // Chemin à l'échelle de la scène (720 de large, hauteur variable)
    const W = stage.offsetWidth || 720, H = stage.offsetHeight || 1280;
    const pts = WAVE_SPOTS.map(([x, y]) => [Math.round(x * W / 100), Math.round(y * H / 100)]);
    pts.unshift([pts[0][0], H + 40]); // le chemin arrive par le bas de l'écran
    const d = smoothPath(pts);
    const reachedCount = Math.min(10, done ? 10 : wave);
    const reached = smoothPath(pts.slice(0, reachedCount + 1));
    document.getElementById('zone-path').innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
            <path d="${d}" fill="none" stroke="#2b2433" stroke-width="58" stroke-linecap="round" opacity=".16"/>
            <path d="${d}" fill="none" stroke="#e3cf9f" stroke-width="50" stroke-linecap="round"/>
            <path d="${d}" fill="none" stroke="#c9b07e" stroke-width="2" stroke-dasharray="3 20" stroke-linecap="round"/>
            <path d="${reached}" fill="none" stroke="#c6a437" stroke-width="7" stroke-dasharray="2 16" stroke-linecap="round"/>
        </svg>`;

    // Les 10 vagues
    const gender = GameData.getPlayerData?.()?.gender || 'boy';
    document.getElementById('zone-nodes').innerHTML = WAVE_SPOTS.map(([x, y], i) => {
        const n = i + 1;
        const isBoss = n === 10;
        const state = n < wave ? 'done' : n === wave ? 'current' : 'locked';
        const badge = state === 'done' ? Art.icon('check', 30)
            : state === 'locked' ? Art.icon('lock', 26)
            : isBoss ? Art.icon('bolt', 34) : `<span class="zone-node-num">${n}</span>`;
        return `<div class="zone-node ${state} ${isBoss ? 'boss' : ''}" style="left:${x}%; top:${y}%">
            ${state === 'current' ? `<span class="zone-trainer">${Art.trainer(gender, 46)}</span>` : ''}
            <span class="zone-node-marker">${badge}</span>
            <span class="zone-node-label">${isBoss ? 'Boss' : `Vague ${n}`}${state === 'current' ? ` · ${battle}/10` : ''}</span>
        </div>`;
    }).join('');

    // En-tête : nom de la zone et vagues terminées
    const wavesDone = done ? 10 : Math.max(0, wave - 1);
    document.getElementById('zone-title').innerHTML = `
        <div class="progress-text">${zone.name}</div>
        <div class="map-progress-bg"><div class="map-progress-fill" style="width:${wavesDone * 10}%"></div></div>
        <div class="progress-pct">${wavesDone}/10</div>`;

    // Bouton de combat
    const go = document.getElementById('zone-go');
    go.querySelector('.zone-go-sub').textContent = done ? 'Zone terminée : rejouer depuis la vague 1'
        : wave === 10 && battle === 10 ? 'Boss de la zone' : `Vague ${wave} · Combat ${battle}/10`;
    go.onclick = () => launchBattle(zoneViewIndex);

    // Ambiance : nuages, vent et Pokémon du biome
    const life = ZONE_LIFE[zone.biome] || ZONE_LIFE.plains;
    const grassy = GRASSY.includes(zone.biome);
    Ambient.mount(document.getElementById('zone-ambient'), {
        clouds: [[3, .9, 110], [10, .6, 150]],
        tufts: grassy ? [[10, 40], [88, 34], [14, 70], [86, 64], [44, 92], [80, 86], [18, 54]] : [],
        petals: grassy ? 5 : 0,
        flyer: life.fly ? { dex: life.fly, top: '130px' } : null,
        hiders: (life.hide || []).map((dex, i) => i === 0 ? [dex, 85, 50, 2] : [dex, 13, 42, 6])
    });
};
