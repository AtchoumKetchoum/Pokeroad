/**
 * pokedex.js - Logique de la page du Pokédex
 */

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log("Pokédex: Initialisation...");
        const grid = document.getElementById('pokedex-grid');
        if (grid) grid.innerHTML = "<p class='empty-pokedex-message'>Chargement des données du Pokédex...</p>";
        
        // 1. Initialiser GameData pour accéder aux données du joueur
        await GameData.init();

        // 2. Charger toutes les données nécessaires pour le Pokédex
        await loadPokedexData();

        // 3. Mettre en place les filtres
        setupFilters();

        // 4. Afficher le Pokédex
        filterAndDisplayPokedex();

        console.log("Pokédex: Prêt.");

    } catch (error) {
        console.error("Erreur critique lors de l'initialisation du Pokédex:", error);
        const grid = document.getElementById('pokedex-grid');
        if (grid) grid.innerHTML = `<p class='empty-pokedex-message'>Erreur: ${error.message}<br>Veuillez rafraîchir la page.</p>`;
    }
});

// --- STATE & DATA ---
let allPokemon = []; // Liste de tous les pokémons du pokedex.json
let allItems = {}; // Liste de tous les objets du items.json
let ownedPokemonMap = new Map(); // Map<id, {count, instances}>
let currentOwnershipFilter = 'all'; // 'all', 'owned', 'unowned'
let currentObtentionFilter = 'all'; // 'all', 'evol-normal', 'evol-special', or a rarity name
const rarities = ['Bébé', 'Commun', 'Peu Commun', 'Rare', 'Très Rare', 'Légendaire', 'Mythique'];

async function loadPokedexData() {
    // Récupère la liste complète des Pokémon depuis GameData
    allPokemon = GameData.getPokedexSubset();
    if (!allPokemon || allPokemon.length === 0) {
        throw new Error("Les données du Pokédex n'ont pas pu être chargées depuis GameData.");
    }

    // Charger les données des objets pour les noms d'évolution
    try {
        const itemsResponse = await fetch('../data/items.json');
        if (itemsResponse.ok) {
            allItems = await itemsResponse.json();
        } else {
            console.warn(`Pokédex: Fichier items.json non trouvé (statut: ${itemsResponse.status}). Les noms d'objets d'évolution pourraient ne pas s'afficher.`);
        }
    } catch (e) {
        console.warn("Pokédex: Erreur réseau lors du chargement de items.json. Les noms d'objets d'évolution pourraient ne pas s'afficher.", e);
    }

    // Récupère les Pokémon possédés par le joueur et les compte
    const playerPokemons = GameData.getPokemons();
    ownedPokemonMap.clear();
    playerPokemons.forEach(pk => {
        if (!pk) return;
        if (ownedPokemonMap.has(pk.id)) {
            ownedPokemonMap.get(pk.id).count++;
            ownedPokemonMap.get(pk.id).instances.push(pk);
        } else {
            ownedPokemonMap.set(pk.id, { count: 1, instances: [pk] });
        }
    });
    console.log(`Pokédex: ${ownedPokemonMap.size} espèces uniques possédées.`);
}

/**
 * Normalise une chaîne de rareté pour correspondre au nom de fichier de l'œuf.
 * ex: "Peu Commun" -> "peucommun"
 * @param {string} rarity - La rareté à normaliser.
 * @returns {string} La chaîne normalisée.
 */
function normalizeRarity(rarity) {
    return (rarity || 'commun').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ /g, '');
}
// --- FILTERS ---

function setupFilters() {
    console.log("Pokédex: Mise en place des filtres.");
    
    // Conteneur principal des filtres
    const filtersContainer = document.getElementById('pokedex-filters');
    if (!filtersContainer) {
        console.error("ERREUR: L'élément #pokedex-filters est introuvable dans le HTML.");
        return;
    }
    filtersContainer.innerHTML = ''; // Vider le conteneur pour une génération propre

    // --- Groupe 1: Filtres de possession ---
    const ownershipGroup = document.createElement('div');
    ownershipGroup.id = 'ownership-filters'; // ID pour le ciblage JS
    ownershipGroup.className = 'filter-group';
    ownershipGroup.innerHTML = `
        <button id="filter-all" class="filter-btn active">Tous</button>
        <button id="filter-owned" class="filter-btn">Possédés</button>
        <button id="filter-unowned" class="filter-btn">Non possédés</button>
    `;
    filtersContainer.appendChild(ownershipGroup);

    document.getElementById('filter-all').addEventListener('click', () => setOwnershipFilter('all'));
    document.getElementById('filter-owned').addEventListener('click', () => setOwnershipFilter('owned'));
    document.getElementById('filter-unowned').addEventListener('click', () => setOwnershipFilter('unowned'));

    // --- Groupe 2: Filtres par méthode d'obtention ---
    const obtentionFilterGroup = document.createElement('div');
    obtentionFilterGroup.id = 'obtention-filters';
    obtentionFilterGroup.className = 'filter-group';
    obtentionFilterGroup.innerHTML = `
        <button class="filter-btn active" data-filter="all">Tous</button>
        <button class="filter-btn" data-filter="evol-normal">Evol.</button>
        <button class="filter-btn" data-filter="evol-special">Evol. Spé.</button>
    `;
    filtersContainer.appendChild(obtentionFilterGroup);

    // --- Groupe 3: Filtres de rareté ---
    const rarityFilterContainer = document.createElement('div');
    rarityFilterContainer.id = 'rarity-filters';
    rarityFilterContainer.className = 'filter-group';

    rarities.forEach(rarity => {
        const label = document.createElement('label');
        label.className = 'rarity-filter-label';
        label.title = rarity;
        label.dataset.filter = rarity; // Use data-attribute for filtering

        const normalizedRarity = normalizeRarity(rarity);
        const eggVisual = document.createElement('div');
        eggVisual.className = `egg-visual`;
        eggVisual.innerHTML = `<img src="../assets/egg_${normalizedRarity}.png" alt="Oeuf ${rarity}" onerror="this.src='../assets/egg_commun.png'">`;

        label.appendChild(eggVisual);
        rarityFilterContainer.appendChild(label);
    });

    filtersContainer.appendChild(rarityFilterContainer);
    
    // Add a single handler for all obtention/rarity buttons
    document.querySelectorAll('#obtention-filters .filter-btn, #rarity-filters .rarity-filter-label').forEach(btn => {
        // Skip ownership buttons which have their own handlers
        if (btn.parentElement.id === 'ownership-filters') return;
        btn.addEventListener('click', (e) => {
            const filterValue = e.currentTarget.dataset.filter;
            setObtentionFilter(filterValue);
        });
    });

    console.log("Pokédex: Filtres créés et ajoutés.");
}

function setOwnershipFilter(filterType) {
    currentOwnershipFilter = filterType;
    document.querySelectorAll('#ownership-filters .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.id === `filter-${filterType}`);
    });
    filterAndDisplayPokedex();
}

function setObtentionFilter(filterType) {
    // If clicking the same filter, toggle it off (back to 'all')
    if (currentObtentionFilter === filterType) {
        currentObtentionFilter = 'all';
    } else {
        currentObtentionFilter = filterType;
    }

    // Update UI
    document.querySelectorAll('#obtention-filters .filter-btn, #rarity-filters .rarity-filter-label').forEach(btn => {
        btn.classList.remove('active');
    });

    const activeButton = document.querySelector(`[data-filter="${currentObtentionFilter}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    } else {
        // Fallback to 'Tous' if the current filter is 'all'
        document.querySelector('[data-filter="all"]').classList.add('active');
    }

    filterAndDisplayPokedex();
}

function isSpecialEvolution(pokemon) {
    if (!pokemon.evolves_from) return false;
    const preEvolution = allPokemon.find(p => p.id === pokemon.evolves_from.id);
    if (!preEvolution || !preEvolution.evolution) return false; // Not an evolution or data missing
    const evo = preEvolution.evolution;
    return (evo.method === 'use-item' || (evo.method === 'trade' && evo.held_item));
}

// --- DISPLAY ---

function filterAndDisplayPokedex() {
    const grid = document.getElementById('pokedex-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // 1. Filtrer par possession
    let filteredList = allPokemon.filter(pokemon => {
        const isOwned = ownedPokemonMap.has(pokemon.id);
        if (currentOwnershipFilter === 'owned') return isOwned;
        if (currentOwnershipFilter === 'unowned') return !isOwned;
        return true; // 'all'
    });

    // 2. Filtrer par méthode d'obtention
    if (currentObtentionFilter !== 'all') {
        filteredList = filteredList.filter(pokemon => {
            const isBaseForm = !pokemon.evolves_from;

            switch(currentObtentionFilter) {
                case 'evol-normal':
                    return !isBaseForm && !isSpecialEvolution(pokemon);
                case 'evol-special':
                    return !isBaseForm && isSpecialEvolution(pokemon);
                default:
                    // Rareté
                    return isBaseForm && (pokemon.rarity === currentObtentionFilter);
            }
        });
    }

    console.log(`Pokédex Displaying: ${filteredList.length} / ${allPokemon.length}`);

    // 3. Afficher
    if (filteredList.length === 0) {
        grid.innerHTML = '<p class="empty-pokedex-message">Aucun Pokémon ne correspond à ces filtres.</p>';
    } else {
        filteredList.forEach(pokemon => {
            const entry = createPokedexEntry(pokemon);
            grid.appendChild(entry);
        });
    }
}

function getEvolutionMethodText(evo) {
    if (!evo) return '';

    const getItemName = (key) => {
        if (!key) return 'un objet';
        return allItems[key]?.name_fr || key.replace(/-/g, ' ');
    };

    switch (evo.method) {
        case 'level-up':
            // Toutes les évolutions par niveau (y compris celles qui étaient avant par bonheur, etc.)
            if (evo.level) {
                return `Niveau ${evo.level}`;
            }
            return `Niveau Sup.`;
        case 'use-item':
            const itemDetails = allItems[evo.item];
            if (itemDetails && itemDetails.name_fr.includes('Pierre')) { // Heuristic for evolution stones
                return `Utiliser ${getItemName(evo.item)}`;
            } else {
                return `Gagner un combat avec ${getItemName(evo.item)}`;
            }
        case 'trade':
            return evo.held_item ? `Échange avec ${getItemName(evo.held_item)}` : 'Échange';
        default:
            // Pour toute autre méthode non explicitement gérée, on la ramène à une évolution par niveau supérieur
            return `Niveau Sup.`;
    }
}

function openPokemonDetailModal(pokemon) {
    const modal = document.getElementById('pokemon-detail-modal');
    const content = document.getElementById('pokemon-detail-content');
    if (!modal || !content) {
        console.error("Modal elements for Pokémon detail not found!");
        return;
    }

    const name = (typeof pokemon.name === 'object') ? (pokemon.name.french || pokemon.name.en) : pokemon.name;
    const typesHtml = pokemon.types.map(t => `<span class="chip type-${t.toLowerCase()}">${t}</span>`).join(' ');
    
    // Safety check for stats
    const stats = pokemon.stats || {};
    const statsHtml = Object.entries(stats).map(([stat, value]) => `
        <div class="stat-item">
            <strong>${stat.toUpperCase()}</strong>
            <span>${value || '--'}</span>
        </div>
    `).join('');

    content.innerHTML = `
        <div class="detail-left-panel">
            <img src="${pokemon.sprite}" alt="${name}">
            <h2>#${String(pokemon.id).padStart(3, '0')} ${name}</h2>
            <div class="detail-types">${typesHtml}</div>
        </div>
        <div class="detail-right-panel">
            <div class="detail-section">
                <h3>Description</h3>
                <p>${pokemon.description || 'Aucune description disponible.'}</p>
            </div>
            <div class="detail-section">
                <h3>Statistiques de base</h3>
                <div class="stats-grid">${statsHtml}</div>
            </div>
        </div>
    `;

    modal.style.display = 'block';

    const closeButton = modal.querySelector('.close-button');
    // Use once:true to avoid stacking listeners if modal is opened multiple times
    closeButton.addEventListener('click', () => modal.style.display = 'none', { once: true });
    
    // Close on outside click
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    }, { once: true });
}

function createPokedexEntry(pokemon) {
    const entry = document.createElement('div');
    entry.className = 'pokedex-entry';
    
    const isOwned = ownedPokemonMap.has(pokemon.id);
    if (!isOwned) {
        entry.classList.add('unowned');
    }

    const name = (typeof pokemon.name === 'object') ? (pokemon.name.french || pokemon.name.en) : pokemon.name;

    let ownedCountBadge = '';
    if (isOwned) {
        const ownedData = ownedPokemonMap.get(pokemon.id);
        ownedCountBadge = `<div class="owned-count" title="Possédés : ${ownedData.count}">x${ownedData.count}</div>`;
    }

    let bottomInfoHtml = '';

    // 1. Si c'est une forme de base (n'évolue de rien), on affiche son œuf.
    if (!pokemon.evolves_from) {
        const normalizedRarity = normalizeRarity(pokemon.rarity);
        bottomInfoHtml = `
            <div class="egg-type" title="Obtenable par Œuf">
                <div class="egg-visual">
                    <img src="../assets/egg_${normalizedRarity}.png" alt="Œuf ${pokemon.rarity}" onerror="this.src='../assets/egg_commun.png'">
                </div>
                <span class="evolution-text">${pokemon.rarity || 'Commun'}</span>
            </div>
        `;
    } 
    // 2. Sinon, c'est une évolution. On affiche de quel Pokémon il provient et comment.
    else {
        const preEvolution = allPokemon.find(p => p.id === pokemon.evolves_from.id);
        
        if (preEvolution && preEvolution.evolution) {
            const evo = preEvolution.evolution;
            const preEvoSprite = preEvolution.sprite || '../assets/egg.png';
            const evolutionMethodText = getEvolutionMethodText(evo);
            const preEvoName = (typeof preEvolution.name === 'object' ? preEvolution.name.french : preEvolution.name) || pokemon.evolves_from.name;

            bottomInfoHtml = `
                <div class="evolution-method" title="Évolue de ${preEvoName}">
                    <img src="${preEvoSprite}" alt="${preEvoName}" class="evolution-sprite">
                    <span class="evolution-arrow">→</span>
                    <span class="evolution-text">${evolutionMethodText}</span>
                </div>
            `;
        }
    }

    entry.innerHTML = `
        ${ownedCountBadge}
        <img src="${pokemon.sprite}" alt="${name}">
        <h3>#${String(pokemon.id).padStart(3, '0')} ${name}</h3>
        ${bottomInfoHtml}
    `;
    entry.addEventListener('click', () => openPokemonDetailModal(pokemon));

    return entry;
}
