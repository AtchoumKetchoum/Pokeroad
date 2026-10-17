/**
 * modes.js - Route des Défis : 2e carte, au bout du chemin qui monte depuis le bourg.
 * Chaque étape de la route est un mode de jeu. L'Aventure (mode principal) est la première ;
 * les autres sont réservées aux modes à venir : il suffit de compléter GAME_MODES.
 */

const GAME_MODES = [
    { id: 'adventure', name: 'Aventure', desc: 'Le mode principal : traverse les zones de la carte.', icon: 'map', color: 'var(--red)', open: () => ViewManager.show('worldmap') },
    { id: 'tower', name: 'Tour de Combat', desc: 'Enchaîne les étages face à des dresseurs de plus en plus forts.', icon: 'shield', color: 'var(--blue)' },
    { id: 'safari', name: 'Zone Safari', desc: 'Explore et rencontre des Pokémon rares.', icon: 'star', color: 'var(--green)' },
    { id: 'arena', name: 'Arène des Champions', desc: 'Affronte les champions pour gagner leurs badges.', icon: 'bolt', color: 'var(--orange)' }
];

window.initModes = () => {
    const list = document.getElementById('modes-list');
    if (!list) return;

    // Du haut (le plus loin sur la route) vers le bas (le plus proche du bourg)
    list.innerHTML = GAME_MODES.slice().reverse().map(mode => {
        const available = typeof mode.open === 'function';
        return `
            <button class="mode-stop ${available ? '' : 'locked'}" data-mode="${mode.id}" ${available ? '' : 'disabled'} style="--mode-color: ${mode.color}">
                <span class="mode-marker">${Art.icon(available ? mode.icon : 'lock', 34)}</span>
                <span class="mode-card">
                    <span class="mode-name">${mode.name}</span>
                    <span class="mode-desc">${available ? mode.desc : 'Bientôt disponible'}</span>
                </span>
            </button>`;
    }).join('');

    list.querySelectorAll('.mode-stop:not(.locked)').forEach(btn => {
        const mode = GAME_MODES.find(m => m.id === btn.dataset.mode);
        btn.onclick = () => mode.open();
    });
};

// Entraînement : bâtiment à part dans le bourg (il était auparavant dans le Laboratoire)
function openTraining() {
    RefinementUI.open(null, 'pokemon');
}
