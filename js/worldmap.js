/**
 * worldmap.js - Gestion de la carte du monde et de la progression
 */

const PHASE_1_ZONES = [
    { name: "Bourg Village", x: 23, y: 88, types: ["Normal"] }, // Presqu'île en bas à gauche
    { name: "Route de l'Éveil", x: 36, y: 82, types: ["Normal", "Vol"] },
    { name: "Plaines Sereines", x: 50, y: 85, types: ["Plante", "Insecte"] },
    { name: "Bois de l'Oubli", x: 40, y: 65, types: ["Insecte", "Poison", "Plante"] },
    { name: "Rivages du Lac Azur", x: 62, y: 58, types: ["Eau", "Normal"] },
    { name: "Cité des Anciens", x: 48, y: 43, types: ["Roche", "Psy", "Spectre"] },
    { name: "Flanc du Mont Sélénite", x: 25, y: 38, types: ["Roche", "Combat", "Sol"] },
    { name: "Col des Brumes", x: 28, y: 25, types: ["Glace", "Vol"] },
    { name: "Pic Enneigé", x: 35, y: 15, types: ["Glace", "Roche"] },
    { name: "Archipel des Songes", x: 82, y: 22, types: ["Eau", "Dragon", "Vol"] },
    { name: "Sanctuaire du Ciel", x: 72, y: 12, types: ["Légendaire", "Dragon", "Psy"] }
];

window.initWorldmap = async () => {
    // Initialiser les données de jeu
    await GameData.init();
    renderMap();
};

function renderMap() {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    // Récupérer la progression via GameData
    const progressionData = GameData.getProgression();
    // zoneIndex dans GameData est 1-indexed.
    // Une zone est considérée comme terminée si le joueur est à la zone suivante.
    // Phase 1 zones sont index 1 à 10.
    const currentZone = progressionData.zone;

    PHASE_1_ZONES.forEach((zone, index) => {
        const isVillage = index === 0;
        const zoneNumber = index;
        const isCompleted = isVillage || zoneNumber < currentZone;
        const isUnlocked = isVillage || zoneNumber <= currentZone;
        const isActive = zoneNumber === currentZone;

        const pin = document.createElement('div');
        pin.className = `map-pin ${isUnlocked ? 'unlocked' : 'locked'} ${isCompleted ? 'completed' : ''} ${isVillage ? 'village' : ''} ${isActive ? 'active' : ''}`;
        pin.style.left = `${zone.x}%`;
        pin.style.top = `${zone.y}%`;

        // Contenu du pin
        let marker = isCompleted ? '✅' : '📍';
        if (isActive) marker = '🚀'; // Icone spéciale pour la zone en cours

        pin.innerHTML = `
            <div class="pin-marker">${marker}</div>
            ${isActive ? '<div class="player-mini-marker"></div>' : ''}
            <div class="pin-info">
                <span class="pin-number">${zoneNumber === 0 ? 'Base' : zoneNumber}</span>
                <span class="pin-name">${zone.name}</span>
            </div>
        `;

        if (isUnlocked && !isVillage) {
            pin.onclick = () => launchBattle(index);
        } else if (isVillage) {
            pin.onclick = () => goBack();
        }

        mapContainer.appendChild(pin);
    });

    // Mettre à jour la barre de progression dans le header
    const progressPercent = Math.min(100, (currentZone / (PHASE_1_ZONES.length - 1)) * 100);
    const titleEl = document.querySelector('.map-title');
    if (titleEl) {
        titleEl.innerHTML = `
            <div class="progress-container">
                <div class="progress-text">Phase 1 : L'Éveil (${Math.floor(progressPercent)}%)</div>
                <div class="map-progress-bg">
                    <div class="map-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
            </div>
        `;
    }
}

function launchBattle(zoneIndex) {
    localStorage.setItem('pokerode_current_zone', zoneIndex);
    ViewManager.show('battle');
}

function goBack() {
    ViewManager.show('home');
}
