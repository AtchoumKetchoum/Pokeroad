// Script pour régénérer battle_levels.json avec progression ennemie
// Inclut niveau, grade, raffinement, IVs/EVs selon la zone

const fs = require('fs');

// Charger le Pokédex
const pokedex = JSON.parse(fs.readFileSync('./data/pokedex.json', 'utf8'));

// Configuration
const ZONES = 50;
const WAVES_PER_ZONE = 10;
const BATTLES_PER_WAVE = 10;
const TEAM_SIZE = 5;

// Noms de zones et types prioritaires
const ZONES_DATA = [
    // --- Phase 1 : L'Éveil ---
    { name: "Rivage paisible", types: ["Eau", "Vol", "Normal", "Sol"] },
    { name: "Plaine sauvage", types: ["Normal", "Plante", "Insecte", "Sol"] },
    { name: "Vallée fleurie", types: ["Plante", "Fée", "Insecte", "Vol"] },
    { name: "Marais mystique", types: ["Eau", "Poison", "Plante", "Spectre"] },
    { name: "Forêt brumeuse", types: ["Plante", "Insecte", "Spectre", "Poison"] },
    { name: "Clairière des soupirs", types: ["Fée", "Plante", "Psy", "Normal"] },
    { name: "Colline rocheuse", types: ["Roche", "Sol", "Combat", "Vol"] },
    { name: "Grotte sombre", types: ["Roche", "Sol", "Ténèbres", "Poison"] },
    { name: "Prairie électrique", types: ["Électrik", "Normal", "Plante", "Insecte"] },
    { name: "Jardin céleste", types: ["Fée", "Vol", "Plante", "Psy"] },

    // --- Phase 2 : L'Exploration ---
    { name: "Désert aride", types: ["Sol", "Roche", "Feu", "Combat"] },
    { name: "Canyon profond", types: ["Roche", "Sol", "Vol", "Dragon"] },
    { name: "Oasis cachée", types: ["Eau", "Plante", "Sol", "Fée"] },
    { name: "Jungle tropicale", types: ["Plante", "Insecte", "Poison", "Eau"] },
    { name: "Falaise vertigineuse", types: ["Vol", "Roche", "Combat", "Électrik"] },
    { name: "Lac cristallin", types: ["Eau", "Glace", "Fée", "Psy"] },
    { name: "Toundra glacée", types: ["Glace", "Sol", "Roche", "Eau"] },
    { name: "Montagne enneigée", types: ["Glace", "Roche", "Acier", "Vol"] },
    { name: "Centrale abandonnée", types: ["Électrik", "Acier", "Poison", "Spectre"] },
    { name: "Plateau venteux", types: ["Vol", "Roche", "Sol", "Normal"] },

    // --- Phase 3 : Les Mystères ---
    { name: "Plage dorée", types: ["Eau", "Sol", "Normal", "Vol"] },
    { name: "Récif corallien", types: ["Eau", "Roche", "Poison", "Fée"] },
    { name: "Marécage toxique", types: ["Poison", "Eau", "Spectre", "Ténèbres"] },
    { name: "Ruines anciennes", types: ["Roche", "Sol", "Spectre", "Psy"] },
    { name: "Temple oublié", types: ["Psy", "Spectre", "Combat", "Ténèbres"] },
    { name: "Forêt enchantée", types: ["Fée", "Plante", "Psy", "Spectre"] },
    { name: "Caverne lumineuse", types: ["Fée", "Roche", "Psy", "Électrik"] },
    { name: "Volcan endormi", types: ["Feu", "Roche", "Sol", "Acier"] },
    { name: "Cratère lunaire", types: ["Roche", "Psy", "Ténèbres", "Fée"] },
    { name: "Labyrinthe perdu", types: ["Psy", "Ténèbres", "Roche", "Spectre"] },

    // --- Phase 4 : Le Péril ---
    { name: "Volcan ardent", types: ["Feu", "Roche", "Sol", "Acier"] },
    { name: "Terre désolée", types: ["Sol", "Roche", "Ténèbres", "Feu"] },
    { name: "Glacier éternel", types: ["Glace", "Acier", "Eau", "Roche"] },
    { name: "Grotte de glace", types: ["Glace", "Roche", "Eau", "Ténèbres"] },
    { name: "Forêt pétrifiée", types: ["Roche", "Plante", "Spectre", "Ténèbres"] },
    { name: "Abîme sans fond", types: ["Ténèbres", "Spectre", "Eau", "Dragon"] },
    { name: "Océan infini", types: ["Eau", "Dragon", "Spectre", "Poison"] },
    { name: "Sommet enneigé", types: ["Glace", "Roche", "Vol", "Dragon"] },
    { name: "Vallée interdite", types: ["Ténèbres", "Dragon", "Spectre", "Poison"] },
    { name: "Citadelle flottante", types: ["Vol", "Acier", "Électrik", "Psy"] },

    // --- Phase 5 : Le Mythe ---
    { name: "Désert de cristal", types: ["Roche", "Fée", "Sol", "Psy"] },
    { name: "Montagne sacrée", types: ["Dragon", "Psy", "Combat", "Fée"] },
    { name: "Plaine fantôme", types: ["Spectre", "Normal", "Ténèbres", "Dragon"] },
    { name: "Sanctuaire sacré", types: ["Psy", "Fée", "Spectre", "Acier"] },
    { name: "Royaume des ombres", types: ["Ténèbres", "Spectre", "Psy", "Dragon"] },
    { name: "Dimension parallèle", types: ["Psy", "Spectre", "Ténèbres", "Dragon"] },
    { name: "Nexus temporel", types: ["Psy", "Acier", "Dragon", "Électrik"] },
    { name: "Vortex cosmique", types: ["Psy", "Dragon", "Spectre", "Électrik"] },
    { name: "Sanctuaire ultime", types: ["Dragon", "Psy", "Fée", "Acier"] },
    { name: "Fin du monde", types: ["Ténèbres", "Spectre", "Feu", "Dragon"] }
];

// Raretés et leurs valeurs
const RARITY_VALUES = {
    'Commun': 5,
    'Peu Commun': 10,
    'Rare': 20,
    'Bébé': 15,
    'Très Rare': 40,
    'Légendaire': 100,
    'Mythique': 150
};

// Filtrer les Pokémon par rareté
const pokemonByRarity = {};
pokedex.forEach(p => {
    const rarity = p.rarity || 'Commun';
    if (!pokemonByRarity[rarity]) pokemonByRarity[rarity] = [];
    pokemonByRarity[rarity].push(p);
});

// Légendaires et Mythiques dans l'ordre du Pokédex
const legendariesMythicals = pokedex
    .filter(p => p.rarity === 'Légendaire' || p.rarity === 'Mythique')
    .sort((a, b) => a.id - b.id);

let legendaryIndex = 0;

/**
 * Calcule les paramètres d'un ennemi selon la zone
 * Progression linéaire pour atteindre le max à la zone 50
 * @param {number} zone - Numéro de zone (1-50)
 * @returns {Object} Paramètres de l'ennemi
 */
function getEnemyParams(zone) {
    // Progression linéaire sur 50 zones
    // Zone 1: Niveau 5, pas de raffinement
    // Zone 50: Niveau 200, raffinement 200, 5 étoiles
    
    // Niveau: 5 → 200 (progression linéaire)
    const level = Math.floor(5 + ((zone - 1) / 49) * 195);
    
    // Grade: 0 → 5 (progression linéaire, arrondi)
    const grade = Math.min(5, Math.round((zone - 1) / 49 * 5));
    
    // Raffinement niveau: 1 → 200 (progression linéaire)
    const refinementLevel = Math.floor(1 + ((zone - 1) / 49) * 199);
    
    // Étoiles: 0 → 5 (progression linéaire, arrondi)
    const refinementStars = Math.min(5, Math.round((zone - 1) / 49 * 5));
    
    // IV raffinement: 1 → 100 (progression linéaire)
    const ivLevel = Math.floor(1 + ((zone - 1) / 49) * 99);
    
    // EV raffinement: 1 → 100 (progression linéaire)
    const evLevel = Math.floor(1 + ((zone - 1) / 49) * 99);
    
    // IVs de base: 15 → 31 (progression linéaire)
    const ivBase = Math.floor(15 + ((zone - 1) / 49) * 16);
    
    // EVs de base: 0 → 252 (progression linéaire)
    const evBase = Math.floor(((zone - 1) / 49) * 252);
    
    return {
        level: Math.min(200, level),
        grade: Math.min(5, grade),
        refinement: {
            level: Math.min(200, refinementLevel),
            stars: Math.min(5, refinementStars),
            ivLevel: Math.min(100, ivLevel),
            evLevel: Math.min(100, evLevel)
        },
        ivBase: Math.min(31, ivBase),
        evBase: Math.min(252, evBase)
    };
}

/**
 * Génère les IVs d'un ennemi
 * @param {number} base - Valeur de base des IVs
 * @returns {Object} IVs
 */
function generateIVs(base) {
    const variance = Math.floor(Math.random() * 5) - 2; // ±2
    const value = Math.max(0, Math.min(31, base + variance));
    return {
        hp: value,
        atk: value,
        def: value,
        spatk: value,
        spdef: value,
        speed: value
    };
}

/**
 * Génère les EVs d'un ennemi
 * Distribue les EVs sur toutes les stats proportionnellement
 * @param {number} base - Valeur de base des EVs (0-252)
 * @returns {Object} EVs
 */
function generateEVs(base) {
    if (base === 0) {
        return { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 };
    }
    
    // Distribuer proportionnellement sur toutes les stats
    // Chaque stat reçoit une part du total
    const perStat = Math.floor(base);
    
    return {
        hp: perStat,
        atk: perStat,
        def: perStat,
        spatk: perStat,
        spdef: perStat,
        speed: perStat
    };
}

// Table de correspondance des types Français -> Anglais
const TYPE_MAPPING = {
    "Normal": "normal",
    "Plante": "grass",
    "Insecte": "bug",
    "Sol": "ground",
    "Eau": "water",
    "Vol": "flying",
    "Poison": "poison",
    "Fée": "fairy",
    "Psy": "psychic",
    "Roche": "rock",
    "Combat": "fighting",
    "Électrik": "electric",
    "Glace": "ice",
    "Feu": "fire",
    "Acier": "steel",
    "Spectre": "ghost",
    "Ténèbres": "dark",
    "Dragon": "dragon"
};

/**
 * Sélectionne un Pokémon selon le budget de rareté et les types prioritaires
 * @param {number} budget - Budget de rareté
 * @param {number} zone - Numéro de zone
 * @param {string[]} priorityTypes - Types de Pokémon à prioriser (en français)
 * @returns {Object} Pokémon sélectionné
 */
function selectPokemon(budget, zone, priorityTypes = []) {
    // Légendaires/Mythiques
    if (zone >= 100 && Math.random() < 0.1) {
        if (legendaryIndex < legendariesMythicals.length) {
            const legendary = legendariesMythicals[legendaryIndex++];
            return legendary;
        }
    }

    // Traduire les types prioritaires en anglais
    const priorityEnglish = priorityTypes.map(t => TYPE_MAPPING[t]).filter(t => t);

    let pool = pokedex.filter(p => p.rarity !== 'Légendaire' && p.rarity !== 'Mythique');

    // 75% de chance de prioriser les types de la zone
    if (priorityEnglish.length > 0 && Math.random() < 0.75) {
        // On ne regarde QUE le premier type (type primaire)
        const priorityPool = pool.filter(p => 
            p.types && p.types[0] && priorityEnglish.includes(p.types[0])
        );
        
        if (priorityPool.length > 0) {
            pool = priorityPool;
        }
    }
    
    const availableRarities = Object.keys(RARITY_VALUES)
        .filter(r => RARITY_VALUES[r] <= budget && r !== 'Légendaire' && r !== 'Mythique');

    if (availableRarities.length === 0) {
        const communInPool = pool.filter(p => p.rarity === 'Commun');
        if (communInPool.length > 0) {
            return communInPool[Math.floor(Math.random() * communInPool.length)];
        }
        return pokemonByRarity['Commun'][Math.floor(Math.random() * pokemonByRarity['Commun'].length)];
    }

    // Sélectionner une rareté et un Pokémon dans le pool filtré
    let attempts = 0;
    while (attempts < 10) {
        const rarity = availableRarities[Math.floor(Math.random() * availableRarities.length)];
        const rarityPool = pool.filter(p => p.rarity === rarity);
        
        if (rarityPool.length > 0) {
            return rarityPool[Math.floor(Math.random() * rarityPool.length)];
        }
        attempts++;
    }
    
    // Fallback
    const communInPool = pool.filter(p => p.rarity === 'Commun');
    if (communInPool.length > 0) {
        return communInPool[Math.floor(Math.random() * communInPool.length)];
    }
    return pokemonByRarity['Commun'][Math.floor(Math.random() * pokemonByRarity['Commun'].length)];
}


/**
 * Calcule le budget de rareté selon la zone
 * @param {number} zone - Numéro de zone
 * @returns {number} Budget de rareté
 */
function getRarityBudget(zone) {
    return 5 + (zone * 2);
}

/**
 * Génère une équipe ennemie
 * @param {number} zone - Numéro de zone
 * @returns {Array} Équipe de 5 Pokémon
 */
function generateEnemyTeam(zone) {
    const params = getEnemyParams(zone);
    const budget = getRarityBudget(zone);
    const team = [];
    const priorityTypes = (ZONES_DATA[zone - 1] && ZONES_DATA[zone - 1].types) || [];
    
    // Générer 5 slots aléatoires uniques
    const availableSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const selectedSlots = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
        const randomIndex = Math.floor(Math.random() * availableSlots.length);
        selectedSlots.push(availableSlots[randomIndex]);
        availableSlots.splice(randomIndex, 1);
    }
    
    // Générer les Pokémon
    for (let i = 0; i < TEAM_SIZE; i++) {
        const pokemon = selectPokemon(budget, zone, priorityTypes);
        const ivs = generateIVs(params.ivBase);
        const evs = generateEVs(params.evBase);
        
        team.push({
            id: pokemon.id,
            slot: selectedSlots[i],
            level: params.level,
            grade: params.grade,
            refinement: params.refinement,
            ivs,
            evs
        });
    }
    
    return team;
}

// Générer tous les combats
console.log('Génération de battle_levels.json avec progression ennemie...');

const battles = [];
let totalBattleIndex = 0;

for (let zone = 1; zone <= ZONES; zone++) {
    const zoneName = ZONES_DATA[zone - 1]?.name || `Zone ${zone}`;
    
    for (let wave = 1; wave <= WAVES_PER_ZONE; wave++) {
        for (let battle = 1; battle <= BATTLES_PER_WAVE; battle++) {
            totalBattleIndex++;
            
            const team = generateEnemyTeam(zone);
            
            battles.push({
                zone,
                wave,
                battle,
                zoneName,
                team
            });
        }
    }
    
    console.log(`Zone ${zone}/${ZONES} complétée (${battles.length} combats)`);
}

// Sauvegarder
fs.writeFileSync('./data/battle_levels.json', JSON.stringify(battles, null, 2));
console.log(`\n✅ Génération terminée !`);
console.log(`📊 Total: ${battles.length} combats générés`);
console.log(`📁 Fichier: ./data/battle_levels.json`);
