/**
 * utils.js - Utilitaires partagés par toutes les vues
 * Chargé en premier : tout ce qui est utilisé par plusieurs fichiers vit ici.
 */

// Dictionnaire des types -> Français
const TYPE_FR = {
    normal: 'Normal', fire: 'Feu', water: 'Eau', grass: 'Plante', electric: 'Électrik', ice: 'Glace',
    fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol', psychic: 'Psy', bug: 'Insecte',
    rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon', dark: 'Ténèbres', steel: 'Acier', fairy: 'Fée',
    shadow: 'Ombre'
};

function formatTypeLabel(code) {
    if (!code) return '';
    return TYPE_FR[String(code).toLowerCase()] || code;
}

// "Peu Commun" -> "peucommun" (correspond aux noms de fichiers des œufs)
function normalizeRarity(rarity) {
    return (rarity || 'commun').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ /g, '');
}

// Durée en ms -> "HH:MM:SS"
function formatTime(ms) {
    if (ms <= 0) return "00:00:00";
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    seconds %= 60;
    minutes %= 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function safeName(pokemon) {
    if (!pokemon) return 'Inconnu';
    if (typeof pokemon.name === 'object' && pokemon.name) {
        return pokemon.name.french || pokemon.name.fr || pokemon.name.en || Object.values(pokemon.name)[0] || 'Inconnu';
    }
    return pokemon.name || 'Inconnu';
}

// Fichiers de données (pokedex, objets, attaques…) : téléchargés et lus une seule fois,
// puis partagés par toutes les vues. Ne pas modifier les objets renvoyés.
const _jsonCache = new Map();
function loadJSON(url) {
    if (!_jsonCache.has(url)) {
        _jsonCache.set(url, fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`${url} introuvable (statut ${res.status})`);
                return res.json();
            })
            .catch(err => { _jsonCache.delete(url); throw err; })); // un échec pourra être retenté
    }
    return _jsonCache.get(url);
}

function goToHome() {
    localStorage.removeItem('pokerode_current_zone');
    ViewManager.show('home');
}
