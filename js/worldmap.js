/**
 * worldmap.js - Carte du monde (dessinée en SVG) et choix de la zone
 */

// Coordonnées en pourcentage de la carte en portrait (720x1280) : on part du bourg en bas et l'on monte vers le ciel
const PHASE_1_ZONES = [
    { name: "Bourg Village", x: 28, y: 91, types: ["Normal"] }, // Presqu'île en bas
    { name: "Route de l'Éveil", x: 54, y: 85, types: ["Normal", "Vol"] },
    { name: "Plaines Sereines", x: 74, y: 77, types: ["Plante", "Insecte"] },
    { name: "Bois de l'Oubli", x: 34, y: 72, types: ["Insecte", "Poison", "Plante"] },
    { name: "Rivages du Lac Azur", x: 68, y: 63, types: ["Eau", "Normal"] },
    { name: "Cité des Anciens", x: 40, y: 56, types: ["Roche", "Psy", "Spectre"] },
    { name: "Flanc du Mont Sélénite", x: 30, y: 46, types: ["Roche", "Combat", "Sol"] },
    { name: "Col des Brumes", x: 58, y: 39, types: ["Glace", "Vol"] },
    { name: "Pic Enneigé", x: 30, y: 30, types: ["Glace", "Roche"] },
    { name: "Archipel des Songes", x: 72, y: 24, types: ["Eau", "Dragon", "Vol"] },
    { name: "Sanctuaire du Ciel", x: 46, y: 13, types: ["Légendaire", "Dragon", "Psy"] }
];

// Zone de la carte correspondant à un numéro de zone de combat (au-delà de la phase 1, on boucle sur les biomes)
function getZoneInfo(zoneNumber) {
    const index = ((zoneNumber - 1) % (PHASE_1_ZONES.length - 1)) + 1;
    const zone = PHASE_1_ZONES[index] || PHASE_1_ZONES[1];
    return { ...zone, biome: Art.biomeForTypes(zone.types) };
}

const BIOME_COLORS = {
    plains: '#8fd16a', meadow: '#ffcb05', forest: '#2f7a46', lake: '#3aa0d8', ruins: '#9a7ad0',
    mountain: '#b37a4c', mist: '#9db3c4', snow: '#e8f4ff', archipelago: '#22b8cf', sky: '#ff6fae', town: '#ee1515'
};

window.initWorldmap = async () => {
    await GameData.init();
    renderMap();
};

const MAP_W = 720, MAP_H = 1280;

function mapBackground() {
    // Mer + îles, en portrait
    const W = MAP_W, H = MAP_H;
    const blob = (cx, cy, rx, ry, fill) => {
        const pts = [...Array(10)].map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            const r = 1 + (((i * 37) % 7) - 3) / 18;
            return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r];
        });
        const d = pts.map((p, i) => {
            const n = pts[(i + 1) % pts.length];
            const mx = (p[0] + n[0]) / 2, my = (p[1] + n[1]) / 2;
            return `${i === 0 ? `M${mx} ${my}` : ''} Q${n[0]} ${n[1]} ${(n[0] + pts[(i + 2) % pts.length][0]) / 2} ${(n[1] + pts[(i + 2) % pts.length][1]) / 2}`;
        }).join(' ');
        return `<path d="${d}Z" fill="${fill}" stroke="#1b1f3b" stroke-width="5" stroke-linejoin="round"/>`;
    };
    const peak = (x, y, s = 1) => `<path d="M${x - 40 * s} ${y}l${40 * s}-${64 * s} ${40 * s} ${64 * s}z" fill="#8f7a64" stroke="#1b1f3b" stroke-width="4" stroke-linejoin="round"/><path d="M${x - 16 * s} ${y - 38 * s}l${16 * s}-${26 * s} ${16 * s} ${26 * s}z" fill="#fff"/>`;
    return `<svg class="art-scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
            <pattern id="map-waves" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M5 18c8-6 16-6 24 0" stroke="#bfe9ff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/></pattern>
            <radialGradient id="map-sea" cx="50%" cy="55%" r="80%"><stop offset="0" stop-color="#5cc6ff"/><stop offset="1" stop-color="#2a7fd4"/></radialGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#map-sea)"/>
        <rect width="${W}" height="${H}" fill="url(#map-waves)"/>
        ${blob(380, 930, 320, 280, '#8fd16a')}
        ${blob(250, 930, 110, 70, '#5fae4a')}
        ${blob(300, 580, 210, 150, '#b39470')}
        ${blob(270, 380, 170, 95, '#eef6ff')}
        ${blob(520, 310, 150, 90, '#f3e3b0')}
        ${blob(330, 160, 180, 72, '#ffe9f6')}
        ${peak(170, 600, 1.1)}${peak(250, 540)}${peak(380, 620, .9)}${peak(230, 410, .8)}${peak(330, 400, .7)}
        <ellipse cx="470" cy="800" rx="78" ry="46" fill="#3aa0d8" stroke="#1b1f3b" stroke-width="4"/>
        <circle cx="560" cy="90" r="36" fill="#fff4b0" stroke="#ffe066" stroke-width="8"/>
    </svg>`;
}

function renderMap() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;
    mapContainer.innerHTML = '';

    const currentZone = GameData.getProgression().zone;

    // Chemin en pointillés reliant les zones
    const toPoint = z => `${z.x * MAP_W / 100},${z.y * MAP_H / 100}`;
    const points = PHASE_1_ZONES.map(toPoint);
    const reached = PHASE_1_ZONES.slice(0, Math.min(PHASE_1_ZONES.length, currentZone + 1)).map(toPoint);
    mapContainer.innerHTML = Art.mute(mapBackground() + `
        <svg class="map-route" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <polyline points="${points.join(' ')}" fill="none" stroke="#1b1f3b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity=".25"/>
            <polyline points="${points.join(' ')}" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="2 16" stroke-linecap="round"/>
            <polyline points="${reached.join(' ')}" fill="none" stroke="#ffcb05" stroke-width="8" stroke-dasharray="2 16" stroke-linecap="round"/>
        </svg>`);
    mapContainer.querySelectorAll('svg').forEach(svg => Art.pixelate(svg, 4));

    PHASE_1_ZONES.forEach((zone, index) => {
        const isVillage = index === 0;
        const isCompleted = !isVillage && index < currentZone;
        const isUnlocked = isVillage || index <= currentZone;
        const isActive = index === currentZone;
        const biome = isVillage ? 'town' : Art.biomeForTypes(zone.types);

        const pin = document.createElement('button');
        pin.className = `map-pin ${isUnlocked ? 'unlocked' : 'locked'} ${isCompleted ? 'completed' : ''} ${isVillage ? 'village' : ''} ${isActive ? 'active' : ''}`;
        pin.style.left = `${zone.x}%`;
        pin.style.top = `${zone.y}%`;
        pin.style.setProperty('--biome', BIOME_COLORS[biome] || '#8fd16a');

        const badge = isVillage ? Art.icon('home', 26)
            : !isUnlocked ? Art.icon('lock', 24)
            : isCompleted ? Art.icon('check', 28)
            : `<span class="pin-number">${index}</span>`;

        pin.innerHTML = `
            ${isActive ? `<span class="pin-trainer">${Art.trainer(GameData.getPlayerData?.()?.gender || 'boy', 44)}</span>` : ''}
            <span class="pin-marker">${badge}</span>
            <span class="pin-name">${zone.name}</span>`;

        if (isUnlocked && !isVillage) pin.onclick = () => launchBattle(index);
        else if (isVillage) pin.onclick = () => goBack();
        else pin.disabled = true;

        mapContainer.appendChild(pin);
    });

    const progressPercent = Math.min(100, (Math.max(0, currentZone - 1) / (PHASE_1_ZONES.length - 1)) * 100);
    const titleEl = document.querySelector('.map-title');
    if (titleEl) {
        titleEl.innerHTML = `
            <div class="progress-text">Phase 1 : L'Éveil</div>
            <div class="map-progress-bg"><div class="map-progress-fill" style="width: ${progressPercent}%"></div></div>
            <div class="progress-pct">${Math.floor(progressPercent)}%</div>`;
    }
}

function launchBattle(zoneIndex) {
    localStorage.setItem('pokerode_current_zone', zoneIndex);
    ViewManager.show('battle');
}

function goBack() {
    ViewManager.show('home');
}
