const GameData = (() => {
    const SAVE_KEY = 'pokeRoadSave';
    let pokedexSubset = [];
    let itemsCatalog = {};
    let itemsByPocket = {};

    const NATURES = [
        { name: "Hardi", plus: null, minus: null }, { name: "Solo", plus: "atk", minus: "def" },
        { name: "Brave", plus: "atk", minus: "speed" }, { name: "Rigide", plus: "atk", minus: "spatk" },
        { name: "Mauvais", plus: "atk", minus: "spdef" }, { name: "Assuré", plus: "def", minus: "atk" },
        { name: "Docile", plus: null, minus: null }, { name: "Relax", plus: "def", minus: "speed" },
        { name: "Malin", plus: "def", minus: "spatk" }, { name: "Lâche", plus: "def", minus: "spdef" },
        { name: "Timide", plus: "speed", minus: "atk" }, { name: "Pressé", plus: "speed", minus: "def" },
        { name: "Sérieux", plus: null, minus: null }, { name: "Jovial", plus: "speed", minus: "spatk" },
        { name: "Naïf", plus: "speed", minus: "spdef" }, { name: "Modeste", plus: "spatk", minus: "atk" },
        { name: "Doux", plus: "spatk", minus: "def" }, { name: "Discret", plus: "spatk", minus: "speed" },
        { name: "Pudique", plus: null, minus: null }, { name: "Foufou", plus: "spatk", minus: "spdef" },
        { name: "Calme", plus: "spdef", minus: "atk" }, { name: "Gentil", plus: "spdef", minus: "def" },
        { name: "Malpoli", plus: "spdef", minus: "speed" }, { name: "Prudent", plus: "spdef", minus: "spatk" },
        { name: "Bizarre", plus: null, minus: null }
    ];

    const EGG_RARITY_CHANCES = [
        { rarity: 'Commun', weight: 50 },
        { rarity: 'Peu Commun', weight: 25 },
        { rarity: 'Rare', weight: 13 },
        { rarity: 'Bébé', weight: 6 },
        { rarity: 'Très Rare', weight: 3 },
        { rarity: 'Légendaire', weight: 2 },
        { rarity: 'Mythique', weight: 1 }
    ];
    const totalWeight = EGG_RARITY_CHANCES.reduce((sum, item) => sum + item.weight, 0);

    const MISSION_TYPES = {
        patrol: { name: "Patrouille", duration: 2, difficulty: 1, risk: 0.1 },
        expedition: { name: "Expédition", duration: 4, difficulty: 2, risk: 0.2 },
        raid: { name: "Raid", duration: 8, difficulty: 3, risk: 0.3 },
        elite: { name: "Mission Élite", duration: 12, difficulty: 4, risk: 0.4 }
    };

    const AFFINITIES = {
        forest: { name: "Forêt", types: ['grass', 'bug', 'poison'] },
        mountain: { name: "Montagne", types: ['rock', 'ground', 'fighting'] },
        ocean: { name: "Océan", types: ['water', 'ice', 'flying'] },
        volcano: { name: "Volcan", types: ['fire', 'dragon', 'steel'] },
        ruins: { name: "Ruines", types: ['psychic', 'ghost', 'dark'] },
        city: { name: "Ville", types: ['electric', 'normal', 'fairy'] }
    };

    // Corrections manuelles pour les données d'évolution manquantes ou incorrectes
    const EVOLUTION_OVERRIDES = {
        // Starters Gen 1
        1: { targetId: 2, method: 'level-up', level: 16 }, // Bulbasaur -> Ivysaur
        2: { targetId: 3, method: 'level-up', level: 32 }, // Ivysaur -> Venusaur
        4: { targetId: 5, method: 'level-up', level: 16 }, // Charmander -> Charmeleon
        5: { targetId: 6, method: 'level-up', level: 36 }, // Charmeleon -> Charizard
        7: { targetId: 8, method: 'level-up', level: 16 }, // Squirtle -> Wartortle
        8: { targetId: 9, method: 'level-up', level: 36 }, // Wartortle -> Blastoise
        
        // Bugs communs
        25: { targetId: 26, method: 'use-item', item: 'thunder-stone' }, // Pikachu -> Raichu
        35: { targetId: 36, method: 'use-item', item: 'moon-stone' }, // Clefairy -> Clefable
        37: { targetId: 38, method: 'use-item', item: 'fire-stone' }, // Vulpix -> Ninetales
        39: { targetId: 40, method: 'use-item', item: 'moon-stone' }, // Jigglypuff -> Wigglytuff
        44: { targetId: 45, method: 'use-item', item: 'leaf-stone' }, // Gloom -> Vileplume
        58: { targetId: 59, method: 'use-item', item: 'fire-stone' }, // Growlithe -> Arcanine
        61: { targetId: 62, method: 'use-item', item: 'water-stone' }, // Poliwhirl -> Poliwrath
        64: { targetId: 65, method: 'level-up', level: 36 }, // Kadabra -> Alakazam
        67: { targetId: 68, method: 'level-up', level: 36 }, // Machoke -> Machamp
        70: { targetId: 71, method: 'use-item', item: 'leaf-stone' }, // Weepinbell -> Victreebel
        75: { targetId: 76, method: 'level-up', level: 36 }, // Graveler -> Golem
        90: { targetId: 91, method: 'use-item', item: 'water-stone' }, // Shellder -> Cloyster
        93: { targetId: 94, method: 'level-up', level: 36 }, // Haunter -> Gengar
        102: { targetId: 103, method: 'use-item', item: 'leaf-stone' }, // Exeggcute -> Exeggutor
        120: { targetId: 121, method: 'use-item', item: 'water-stone' }, // Staryu -> Starmie
        133: [ // Eevee has multiple evolutions
            { targetId: 134, method: 'use-item', item: 'water-stone' }, // Vaporeon
            { targetId: 135, method: 'use-item', item: 'thunder-stone' }, // Jolteon
            { targetId: 136, method: 'use-item', item: 'fire-stone' }  // Flareon
        ]
    };

    let BASE_FORM_POKEMON_IDS = [];
    
    // Mappings pour le raffinement des statistiques
    const IV_RESOURCE_MAP = {
        hp: 'health-wing',
        atk: 'muscle-wing',
        def: 'resist-wing',
        spatk: 'genius-wing',
        spdef: 'clever-wing',
        speed: 'swift-wing'
    };

    const EV_RESOURCE_MAP = {
        hp: 'hp-up',
        atk: 'protein',
        def: 'iron',
        spatk: 'calcium',
        spdef: 'zinc',
        speed: 'carbos'
    };

    // --- Fonctions Privées ---

    function getBaseFormId(pokemonId) {
        let currentId = pokemonId;
        // Protection contre les boucles infinies
        let iterations = 0;
        while (iterations < 10) {
            const pk = pokedexSubset.find(p => p.id === currentId);
            if (!pk || !pk.evolves_from) break;
            currentId = pk.evolves_from;
            iterations++;
        }
        return currentId;
    }

    function normalizePokemon(p) {
        if (!p) return p;
        const level = (typeof p.level === 'number' && p.level > 0) ? p.level : 5;
        const grade = p.grade || 0;
        const maxLevel = p.maxLevel || (20 + (grade * 20));
        const status = p.status || 'ready';
        const healingEndTime = p.healingEndTime || null;
        
        // New traits
        const nature = p.nature || NATURES[Math.floor(Math.random() * NATURES.length)];
        const isFavorite = p.isFavorite || false;
        
        // IVs and EVs
        const ivs = p.ivs || { hp: 31, atk: 31, def: 31, spatk: 31, spdef: 31, speed: 31 }; // Default for old pks
        const evs = p.evs || { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 };

        // Raffinement
        const refinementLevel = p.refinementLevel || 1;
        const refinementStars = p.refinementStars || 0;
        
        // IV/EV refinements per stat
        const ivRefinement = p.ivRefinement || { level: 1, stars: 0, stats: {} };
        const evRefinement = p.evRefinement || { level: 1, stars: 0, stats: {} };
        
        // Ensure stats objects exist within the refinement objects
        if (!ivRefinement.stats) ivRefinement.stats = {};
        if (!evRefinement.stats) evRefinement.stats = {};
        
        // Ensure stat levels exist
        const statsKeys = ['hp', 'atk', 'def', 'spatk', 'spdef', 'speed'];
        statsKeys.forEach(s => {
            if (ivRefinement.stats && ivRefinement.stats[s] === undefined) ivRefinement.stats[s] = 0;
            if (evRefinement.stats && evRefinement.stats[s] === undefined) evRefinement.stats[s] = 0;
        });

        const moveRefinements = p.moveRefinements || {}; // Raffinement des attaques apprises
        
        // Objets multiples
        const heldItems = p.heldItems || [];
        const berries = p.berries || [];

        // Ability selection if missing
        let ability = p.ability;
        if (!ability && p.abilities && p.abilities.length > 0) {
            ability = p.abilities[Math.floor(Math.random() * p.abilities.length)].name;
        }

        const normalized = { 
            ...p, 
            level,
            grade,
            maxLevel,
            status,
            healingEndTime,
            nature,
            ability: ability || "Absent",
            isFavorite,
            ivs,
            evs,
            refinementLevel,
            refinementStars,
            ivRefinement,
            evRefinement,
            moveRefinements,
            heldItems,
            berries
        };

        // Recalculate stats based on IVs/EVs/Nature
        normalized.stats = calculateStats(normalized);

        return normalized;
    }

    function calculateStats(pokemon) {
        const pkData = pokedexSubset.find(p => p.id === pokemon.id);
        if (!pkData || !pkData.stats) return pokemon.stats || {};
        const base = pkData.stats;
        const iv = pokemon.ivs || { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 };
        const ev = pokemon.evs || { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 };
        const level = pokemon.level || 1;
        
        // Multiplicateurs de raffinement
        const pokemonMult = typeof Refinement !== 'undefined' 
            ? Refinement.getMultiplier(pokemon.refinementLevel || 1, pokemon.refinementStars || 0)
            : 1.0;
        const ivMult = typeof Refinement !== 'undefined' && pokemon.ivRefinement
            ? Refinement.getMultiplier(pokemon.ivRefinement.level || 1, pokemon.ivRefinement.stars || 0)
            : 1.0;
        const evMult = typeof Refinement !== 'undefined' && pokemon.evRefinement
            ? Refinement.getMultiplier(pokemon.evRefinement.level || 1, pokemon.evRefinement.stars || 0)
            : 1.0;
        const nature = (typeof pokemon.nature === 'string') 
            ? NATURES.find(n => n.name === pokemon.nature) 
            : pokemon.nature;

        const calc = (baseVal, ivVal, evVal, isHP) => {
            if (isHP) {
                return Math.floor(((2 * baseVal + ivVal + Math.floor(evVal / 4)) * level) / 100) + level + 10;
            } else {
                let val = Math.floor(((2 * baseVal + ivVal + Math.floor(evVal / 4)) * level) / 100) + 5;
                // Nature impact
                if (nature) {
                    if (nature.plus === isHP) val = Math.floor(val * 1.1); // isHP here is the stat key (atk, def, etc)
                    if (nature.minus === isHP) val = Math.floor(val * 0.9);
                }
                return val;
            }
        };

        // Helper to get nature multiplier for non-HP stats
        const getNatureMult = (statKey) => {
            if (!nature) return 1;
            if (nature.plus === statKey) return 1.1;
            if (nature.minus === statKey) return 0.9;
            return 1;
        };

        // Appliquer les multiplicateurs de raffinement aux IVs et EVs
        const ivRefStats = pokemon.ivRefinement?.stats || {};
        const evRefStats = pokemon.evRefinement?.stats || {};

        const effectiveIV = {
            hp: Math.floor((iv.hp + (ivRefStats.hp || 0)) * ivMult),
            atk: Math.floor((iv.atk + (ivRefStats.atk || 0)) * ivMult),
            def: Math.floor((iv.def + (ivRefStats.def || 0)) * ivMult),
            spatk: Math.floor((iv.spatk + (ivRefStats.spatk || 0)) * ivMult),
            spdef: Math.floor((iv.spdef + (ivRefStats.spdef || 0)) * ivMult),
            speed: Math.floor((iv.speed + (ivRefStats.speed || 0)) * ivMult)
        };
        
        const effectiveEV = {
            hp: Math.floor((ev.hp + (evRefStats.hp || 0)) * evMult),
            atk: Math.floor((ev.atk + (evRefStats.atk || 0)) * evMult),
            def: Math.floor((ev.def + (evRefStats.def || 0)) * evMult),
            spatk: Math.floor((ev.spatk + (evRefStats.spatk || 0)) * evMult),
            spdef: Math.floor((ev.spdef + (evRefStats.spdef || 0)) * evMult),
            speed: Math.floor((ev.speed + (evRefStats.speed || 0)) * evMult)
        };

        // Calculer les stats selon la nouvelle logique demandée :
        // Chaque niveau apporte +1/50 Base + 1/100 (IV + EV)
        const calcValue = (baseVal, ivVal, evVal, isHP) => {
            const growth = (baseVal / 50) + ((ivVal + evVal) / 100);
            if (isHP) {
                return Math.floor(10 + level + (level * growth));
            } else {
                return Math.floor(5 + (level * growth));
            }
        };

        const rawStats = {
            hp: calcValue(base.hp || 0, effectiveIV.hp, effectiveEV.hp, true),
            atk: Math.floor(calcValue(base.atk || 0, effectiveIV.atk, effectiveEV.atk, false) * getNatureMult('atk')),
            def: Math.floor(calcValue(base.def || 0, effectiveIV.def, effectiveEV.def, false) * getNatureMult('def')),
            spatk: Math.floor(calcValue(base.spatk || 0, effectiveIV.spatk, effectiveEV.spatk, false) * getNatureMult('spatk')),
            spdef: Math.floor(calcValue(base.spdef || 0, effectiveIV.spdef, effectiveEV.spdef, false) * getNatureMult('spdef')),
            speed: Math.floor(calcValue(base.speed || 0, effectiveIV.speed, effectiveEV.speed, false) * getNatureMult('speed'))
        };
        
        // Appliquer le multiplicateur de raffinement du Pokémon aux stats finales
        return {
            hp: Math.floor(rawStats.hp * pokemonMult),
            atk: Math.floor(rawStats.atk * pokemonMult),
            def: Math.floor(rawStats.def * pokemonMult),
            spatk: Math.floor(rawStats.spatk * pokemonMult),
            spdef: Math.floor(rawStats.spdef * pokemonMult),
            speed: Math.floor(rawStats.speed * pokemonMult)
        };
    }

    function normalizeData(data) {
        if (!data) return data;
        if (Array.isArray(data.pokemons)) {
            data.pokemons = data.pokemons.map(normalizePokemon);
        } else {
            data.pokemons = [];
        }
        return data;
    }

    function generateWeightedEggRarity() {
        let random = Math.random() * totalWeight;
        for (const chance of EGG_RARITY_CHANCES) {
            if (random < chance.weight) return chance.rarity;
            random -= chance.weight;
        }
        return 'Commun';
    }

    function generateRandomEgg(forcedRarity = null) {
        const rarity = forcedRarity || generateWeightedEggRarity();
        const potentialPokemon = pokedexSubset.filter(p => (p.rarity === rarity || rarity === null) && !p.evolves_from);

        if (potentialPokemon.length === 0) {
            const allBaseForms = pokedexSubset.filter(p => !p.evolves_from);
            const randomPk = allBaseForms[Math.floor(Math.random() * allBaseForms.length)];
            return { pokemonId: randomPk.id, rarity: randomPk.rarity };
        }

        const randomPk = potentialPokemon[Math.floor(Math.random() * potentialPokemon.length)];
        return { pokemonId: randomPk.id, rarity: randomPk.rarity };
    }

    function identifyBaseForms() {
        // Une forme de base est un Pokémon qui n'évolue PAS d'un autre.
        // Cela repose sur la nouvelle propriété 'evolves_from' dans pokedex.json.
        BASE_FORM_POKEMON_IDS = pokedexSubset.filter(p => !p.evolves_from).map(p => p.id);
        console.log(`[GameData] ${BASE_FORM_POKEMON_IDS.length} formes de base identifiées pour la génération d'œufs.`);
    }

    async function initializeDefaultSave() {
        let basePokedex;
        try {
            const response = await fetch('../data/pokedex.json');
            if (!response.ok) throw new Error('Pokedex source introuvable.');
            basePokedex = await response.json();
        } catch (error) {
            console.error('ERREUR CRITIQUE : Impossible de charger pokedex.json. Le jeu ne peut pas être initialisé correctement.', error);
            basePokedex = [];
        }

        // On garde une liste des 24 premiers Pokémon comme "maîtres" du jeu
        const sliced = Array.isArray(basePokedex) ? basePokedex : []; // Utilise le pokedex complet pour la génération d'œufs
        pokedexSubset = sliced;

        // Charger le catalogue d'objets
        try {
            const itemsResponse = await fetch('../data/items.json');
            if (itemsResponse.ok) {
                itemsCatalog = await itemsResponse.json();
                categorizeItems();
            }
        } catch (error) {
            console.warn('[GameData] items.json introuvable au démarrage par défaut.');
        }

        identifyBaseForms();
        
        // MODIFICATION: Plus de Pokémon de départ, uniquement 3 oeufs.
        const startingPokemons = [];

        const now = Date.now();
        
        // MODIFICATION: Les œufs de départ sont des bébés Pokémon qui éclosent instantanément.
        const babyPokemonIds = pokedexSubset.filter(p => p.rarity === 'Bébé').map(p => p.id);
        const defaultEggs = [
            // Crée 3 œufs de bébés Pokémon aléatoires
            ...Array.from({ length: 5 }).map((_, i) => {
                const randomBabyId = babyPokemonIds[Math.floor(Math.random() * babyPokemonIds.length)];
                const babyPokemon = pokedexSubset.find(p => p.id === randomBabyId);
                return {
                    instanceId: `egg-${now}-${i}`,
                    startTime: now, // Rend l'œuf éclosable immédiatement
                    endTime: now,
                    pokemonId: randomBabyId, // Stocke l'ID du Pokémon qui va éclore
                    rarity: babyPokemon ? babyPokemon.rarity : 'Commun' // Stocke la rareté pour l'affichage
                };
            })
        ];

        const defaultSave = {
            pokemons: startingPokemons,
            playerName: 'RED',
            playerGender: 'boy',
            money: 1500,
            inventory: {
                incubators: defaultEggs, // Oeufs en incubation
                eggs: [], // Oeufs en stock
                items: {} // Objets généraux { "item-name": quantity }
            },
            mission: {
                team: [], // instanceIds des Pokémon en mission
                endTime: null,
                rewards: null,
                active: false
            },
            availableMissions: [], // Missions disponibles au choix
            unlockedIncubators: 1,
            lastRoadTeam: [],
            progression: { zone: 1, wave: 1, battle: 1 }
        };
        
        // Génère les premières missions
        defaultSave.availableMissions = generateMissionsBatch();
        
        saveData(defaultSave);
        return defaultSave;
    }

    function generateMissionsBatch() {
        const missions = [];
        const types = Object.keys(MISSION_TYPES);
        const affinities = Object.keys(AFFINITIES);
        
        for (let i = 0; i < 3; i++) {
            const typeKey = types[Math.floor(Math.random() * types.length)];
            const affinityKey = affinities[Math.floor(Math.random() * affinities.length)];
            const missionType = MISSION_TYPES[typeKey];
            const affinity = AFFINITIES[affinityKey];
            
            missions.push({
                id: `mission-${Date.now()}-${i}`,
                typeKey: typeKey,
                typeName: missionType.name,
                duration: missionType.duration,
                difficulty: missionType.difficulty,
                affinityKey: affinityKey,
                affinityName: affinity.name,
                affinityTypes: affinity.types,
                expiresAt: Date.now() + (24 * 3600 * 1000) // Expire dans 24h
            });
        }
        return missions;
    }
    
    function saveData(data) {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error("Impossible de sauvegarder les données:", error);
        }
    }

    function loadData() {
        try {
            const savedData = localStorage.getItem(SAVE_KEY);
            return savedData ? JSON.parse(savedData) : null;
        } catch (error) {
            console.error("Impossible de charger les données de sauvegarde:", error);
            return null;
        }
    }

    function cleanUpCorruptedMoves(data) {
        if (!data || !Array.isArray(data.pokemons)) return false;

        let dataWasChanged = false;
        data.pokemons.forEach(pk => {
            if (!pk) return;

            const availableMoveNames = (pk.moves || []).map(m => m.name);
            
            // Nettoie les capacités sélectionnées invalides
            if (Array.isArray(pk.selectedMoves)) {
                const originalCount = pk.selectedMoves.length;
                pk.selectedMoves = pk.selectedMoves.filter(moveName => availableMoveNames.includes(moveName));
                if (pk.selectedMoves.length !== originalCount) {
                    dataWasChanged = true;
                    console.log(`[DATA_CLEANUP] Nettoyage des capacités sélectionnées pour ${pk.name} (${pk.instanceId})`);
                }
            }

            // Nettoie la capacité Z si elle n'est pas dans la liste des capacités apprenables
            if (pk.boostedMove && !availableMoveNames.includes(pk.boostedMove)) {
                console.log(`[DATA_CLEANUP] Capacité Z invalide '${pk.boostedMove}' pour ${pk.name}. Réinitialisation.`);
                pk.boostedMove = null;
                dataWasChanged = true;
            }
            
            // S'assure que la capacité Z est bien l'une des capacités sélectionnées
            if (pk.boostedMove && pk.selectedMoves && !pk.selectedMoves.includes(pk.boostedMove)) {
                 console.log(`[DATA_CLEANUP] La capacité Z '${pk.boostedMove}' pour ${pk.name} n'était pas dans la liste sélectionnée. Réinitialisation.`);
                 pk.boostedMove = pk.selectedMoves[0] || null;
                 dataWasChanged = true;
            }
        });

        return dataWasChanged;
    }

    function categorizeItems() {
        itemsByPocket = {};
        Object.entries(itemsCatalog).forEach(([key, item]) => {
            let pocket = item.pocket || 'misc';
            if (pocket === 'machines') pocket = 'ct';
            
            // EXCLUSION TOTALE DES KEY ITEMS / POKEBALLS / MAIL
            if (pocket === 'key-items' || pocket === 'mail' || pocket === 'pokeballs' || pocket === 'key') return;

            // Re-catégorisation manuelle pour le confort de jeu
            if (item.category === 'Évolution') {
                pocket = 'evolution';
            } else if (item.category === 'mega-stones') {
                pocket = 'mega';
            } else if (key.includes('candy') || key.includes('bonbon')) {
                pocket = 'exp';
            } else if (item.category === 'Vitamines' || item.category === 'Vitamins') {
                pocket = 'vitamins';
            } else if (item.name_fr && item.name_fr.includes('Plume')) {
                pocket = 'feathers';
            } else if (pocket === 'misc' && (item.category.includes('loot') || item.category.includes('collectible'))) {
                pocket = 'loot';
            } else if (pocket === 'misc' && (item.attributes.includes('holdable') || item.attributes.includes('holdable-active'))) {
                pocket = 'battle';
            } else if (pocket === 'misc') {
                pocket = 'misc';
            }
            
            if (!itemsByPocket[pocket]) itemsByPocket[pocket] = [];
            itemsByPocket[pocket].push({ ...item, id: key });
        });
        console.log(`[GameData] ${Object.keys(itemsCatalog).length} objets chargés et catégorisés.`);
    }

    // --- Fonctions Publiques ---
    
    async function init() {
        let data = loadData();
        let isNew = false;
        if (!data) {
            console.log("Aucune sauvegarde trouvée, création d'une nouvelle partie...");
            data = await initializeDefaultSave();
            isNew = true;
        } else {
            // Si une sauvegarde existe, on charge le Pokédex complet pour l'enrichir
            try {
                const response = await fetch('../data/pokedex.json');
                pokedexSubset = await response.json();
            } catch (e) {
                console.warn("Source Pokédex indisponible à l'initialisation. Le jeu pourrait ne pas fonctionner correctement.", e);
                pokedexSubset = [];
            }

            // Charger le catalogue d'objets
            try {
                const itemsResponse = await fetch('../data/items.json');
                if (itemsResponse.ok) {
                    itemsCatalog = await itemsResponse.json();
                    categorizeItems();
                }
            } catch (error) {
                console.warn('[GameData] items.json introuvable au chargement de la sauvegarde.');
            }

            console.log("Sauvegarde locale chargée.");
            identifyBaseForms(); // Identifier les formes de base après le chargement du pokedex

            let needsSave = false;

            // --- MIGRATION & ENRICHISSEMENT ---
            // S'assure que les pokémons sauvegardés ont les dernières données (stats, types, etc.)
            if (Array.isArray(data.pokemons)) {
                const enrichedPokemons = data.pokemons.map(savedPk => {
                    if (!savedPk || !savedPk.id) return null;
                    const masterPk = pokedexSubset.find(p => p.id === savedPk.id);
                    if (!masterPk) return savedPk; // Ne peut pas enrichir, garde l'ancien

                    // Fusionne : le masterPk est la base, savedPk surcharge les données variables (niveau, etc.)
                    return { ...masterPk, ...savedPk };
                }).filter(Boolean);

                // Migration: add instanceId and grade to existing pokemon
                enrichedPokemons.forEach(pk => {
                    if (pk && !pk.instanceId) {
                        pk.instanceId = `pk-${pk.id}-${Date.now()}-${Math.random()}`;
                        needsSave = true;
                    }
                    if (pk && typeof pk.grade === 'undefined') {
                        pk.grade = 0;
                        needsSave = true;
                    }
                    if (pk && typeof pk.maxLevel === 'undefined') {
                        pk.maxLevel = 20 + ((pk.grade || 0) * 20);
                        needsSave = true;
                    }
                    if (pk && !pk.status) {
                        pk.status = 'ready'; // 'ready', 'on_mission', 'exhausted'
                        needsSave = true;
                    }
                    // Migration: ajouter les propriétés de raffinement
                    if (pk && typeof pk.refinementLevel === 'undefined') {
                        pk.refinementLevel = 1;
                        needsSave = true;
                    }
                    if (pk && typeof pk.refinementStars === 'undefined') {
                        pk.refinementStars = 0;
                        needsSave = true;
                    }
                    if (pk && !pk.ivRefinement) {
                        pk.ivRefinement = { level: 1, stars: 0 };
                        needsSave = true;
                    }
                    if (pk && !pk.evRefinement) {
                        pk.evRefinement = { level: 1, stars: 0 };
                        needsSave = true;
                    }
                    // Migration: tmRefinements → moveRefinements
                    if (pk && pk.tmRefinements && !pk.moveRefinements) {
                        pk.moveRefinements = pk.tmRefinements;
                        delete pk.tmRefinements;
                        needsSave = true;
                    }
                    if (pk && !pk.moveRefinements) {
                        pk.moveRefinements = {};
                        needsSave = true;
                    }
                    // Migration: heldItem → heldItems array
                    if (pk && pk.heldItem && !pk.heldItems) {
                        pk.heldItems = [pk.heldItem];
                        delete pk.heldItem;
                        needsSave = true;
                    }
                    if (pk && !pk.heldItems) {
                        pk.heldItems = [];
                        needsSave = true;
                    }
                    if (pk && !pk.berries) {
                        pk.berries = [];
                        needsSave = true;
                    }
                    // Recalcul forcé des statistiques pour appliquer la nouvelle formule à tous les Pokémon possédés
                    if (pk) {
                        const originalStats = JSON.stringify(pk.stats);
                        pk.stats = calculateStats(pk);
                        if (originalStats !== JSON.stringify(pk.stats)) {
                            needsSave = true;
                        }
                    }
                });

                data.pokemons = enrichedPokemons;
                // On ne sauvegarde que si un changement a été fait
                if (data.pokemons.some(p => !p.instanceId || typeof p.grade === 'undefined' || typeof p.maxLevel === 'undefined')) {
                    needsSave = true;
                }
            }

            // Normalisation (assure la présence d'un niveau)
            data = normalizeData(data);

            if (!Array.isArray(data.pokemons) || data.pokemons.length === 0) {
                // La sauvegarde est vide ou corrompue, on réinjecte les starters
                const defaultData = await initializeDefaultSave();
                data.pokemons = defaultData.pokemons;
                needsSave = true;
            }

            // Migration: ajoute le champ progression s'il manque
            if (typeof data.progression === 'undefined') {
                data.progression = { zone: 1, wave: 1, battle: 1 };
                needsSave = true;
            }

            // Migration: ajoute le champ battle s'il manque à une progression existante
            if (typeof data.progression.battle === 'undefined') {
                data.progression.battle = 1;
                needsSave = true;
            }


            // Migration: ajout des raffinements d'objets global
            if (typeof data.itemRefinements === 'undefined') {
                data.itemRefinements = {};
                needsSave = true;
            }

            // Migration: ajoute l'inventaire s'il manque
            if (typeof data.inventory === 'undefined') {
                data.inventory = { incubators: [], eggs: [], items: {} };
                needsSave = true;
            }
            if (typeof data.inventory.eggs === 'undefined') {
                data.inventory.eggs = [];
                needsSave = true;
            }
            if (typeof data.inventory.items === 'undefined') {
                data.inventory.items = {};
                needsSave = true;
            }

            // Migration: ajoute le sac d'objets s'il manque
            if (data.inventory && typeof data.inventory.items === 'undefined') {
                data.inventory.items = {};
                needsSave = true;
            }

            // Migration: ajoute le nombre d'incubateurs débloqués
            if (typeof data.unlockedIncubators === 'undefined') {
                data.unlockedIncubators = 1;
                needsSave = true;
            }

            // Migration: ajoute l'objet mission s'il manque ou met à jour sa structure
            if (typeof data.mission === 'undefined') {
                data.mission = { team: [], endTime: null, rewards: null, active: false };
                needsSave = true;
            } else if (typeof data.mission.active === 'undefined') {
                 // Migration vers la nouvelle structure
                 data.mission.active = data.mission.team.length > 0;
                 needsSave = true;
            }

            // Migration: ajoute les missions disponibles
            if (typeof data.availableMissions === 'undefined' || !Array.isArray(data.availableMissions)) {
                data.availableMissions = generateMissionsBatch();
                needsSave = true;
            }
            // Migration: ajoute le sac à oeufs s'il manque
            if (data.inventory && typeof data.inventory.eggs === 'undefined') {
                data.inventory.eggs = [];
                needsSave = true;
            }
            // Migration: Si l'ancienne équipe de route est basée sur les 'id', on la vide.
            // L'utilisateur devra la resélectionner une fois, mais cela évite les bugs de doublons.
            if (data.lastRoadTeam && data.lastRoadTeam.length > 0 && typeof data.lastRoadTeam[0].instanceId === 'undefined') {
                console.log("Migration de 'lastRoadTeam' : l'équipe sauvegardée est réinitialisée.");
                data.lastRoadTeam = [];
                needsSave = true;
            }

            // Migration: assure la présence d'un instanceId sur les œufs du sac
            if (data.inventory && Array.isArray(data.inventory.eggs)) {
                data.inventory.eggs.forEach((egg, idx) => {
                    if (egg && !egg.instanceId) {
                        egg.instanceId = `egg-mig-${Date.now()}-${idx}-${Math.random()}`;
                        needsSave = true;
                    }
                });
            }

            // Nettoyage automatique des données corrompues (problème des Z-Moves)
            if (cleanUpCorruptedMoves(data)) {
                needsSave = true;
                console.log('[GameData] Nettoyage des données de capacités corrompues effectué.');
            }

            if (needsSave) {
                console.log('Migration/Enrichissement/Nettoyage de la sauvegarde effectuée.');
                saveData(data);
            }
        }
        return { data, isNew };
    }
    
    function getPokemons() {
        const data = loadData();
        return data ? data.pokemons : [];
    }
    
    function getPokedexSubset() {
        return pokedexSubset;
    }

    function getPlayerData() {
        const data = loadData();
        if (!data) return { playerName: '???', money: 0 };
        return {
            playerName: data.playerName,
            money: data.money
        };
    }

    function exportData() {
        const data = loadData();
        if (!data) {
            alert("Aucune donnée à exporter !");
            return;
        }
        
        const dataStr = JSON.stringify(data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pokeroad_save.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log("Données exportées.");
    }

    function importData(file, onImported) {
        if (!file) {
            console.error("Aucun fichier sélectionné.");
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                // Validation simple
                if (importedData && importedData.pokemons && importedData.playerName) {
                    const normalized = normalizeData(importedData);
                    saveData(normalized);
                    console.log("Données importées avec succès !");
                    if (onImported) onImported(); // Callback pour rafraîchir la page
                } else {
                    throw new Error("Le fichier de sauvegarde est invalide.");
                }
            } catch (error) {
                alert("Erreur lors de l'importation: " + error.message);
                console.error(error);
            }
        };
        reader.readAsText(file);
    }

    // Met à jour la liste des 4 capacités équipées et l'attaque boostée pour un Pokémon donné
    function setPokemonMoves(pokemonInstanceId, selectedMoves, boostedMove) {
        try {
            const data = loadData();
            if (!data || !Array.isArray(data.pokemons)) return;
            const p = data.pokemons.find(pk => pk && pk.instanceId === pokemonInstanceId);
            if (!p) {
                console.error(`[GameData] setPokemonMoves: Pokémon avec instanceId ${pokemonInstanceId} non trouvé.`);
                return;
            }
            p.selectedMoves = Array.isArray(selectedMoves) ? selectedMoves.filter(Boolean).slice(0, 4) : [];
            p.boostedMove = boostedMove;
            saveData(data);
            console.log(`Capacités mises à jour pour instance #${pokemonInstanceId}:`, p.selectedMoves, 'Boosted:', p.boostedMove);
        } catch (e) {
            console.error('Échec mise à jour des capacités:', e);
        }
    }

    function setLastRoadTeam(team) {
        try {
            const data = loadData();
            if (!data) return;
            const validTeam = Array.isArray(team) ? team.map(m => ({ instanceId: m.instanceId, slot: m.slot })) : [];
            data.lastRoadTeam = validTeam;
            saveData(data);
        } catch (e) {
            console.error('Failed to save last road team:', e);
        }
    }

    function getLastRoadTeam() {
        const data = loadData();
        return data && data.lastRoadTeam ? data.lastRoadTeam : [];
    }

    function setProgression(zone, wave, battle) {
        try {
            const data = loadData();
            if (!data) return;
            if (!data.progression) data.progression = {};
            data.progression.zone = zone;
            data.progression.wave = wave;
            data.progression.battle = battle;
            saveData(data);
        } catch (e) {
            console.error('Failed to save progression:', e);
        }
    }

    function getProgression() {
        const data = loadData();
        return data && data.progression ? data.progression : { zone: 1, wave: 1, battle: 1 };
    }

    function getInventory() {
        const data = loadData();
        return data?.inventory || { incubators: [], eggs: [], items: {} };
    }

    function addEggsToBag(count = 1) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        if (!data.inventory.eggs) data.inventory.eggs = [];

        const newEggs = [];
        for (let i = 0; i < count; i++) {
            const egg = generateRandomEgg();
            if (egg) {
                data.inventory.eggs.push(egg);
                newEggs.push(egg);
            }
        }

        if (newEggs.length > 0) {
            saveData(data);
            console.log(`[GameData] Ajout de ${newEggs.length} oeuf(s) au sac.`);
            return { success: true, eggs: newEggs };
        }
        return { success: false, reason: "Impossible de générer des oeufs." };
    }

    function addItem(itemName, quantity = 1) {
        const data = loadData();
        if (!data) return;
        if (!data.inventory.items) data.inventory.items = {};
        data.inventory.items[itemName] = (data.inventory.items[itemName] || 0) + quantity;
        saveData(data);
        console.log(`[GameData] Ajout de ${quantity}x ${itemName}.`);
    }

    function clearSaveData() {
        try {
            localStorage.removeItem(SAVE_KEY);
            console.log("Données de sauvegarde effacées.");
        } catch (error) {
            console.error("Impossible d'effacer les données de sauvegarde:", error);
        }
    }

    function addMoney(amount) {
        try {
            const data = loadData();
            if (!data) return;
            data.money = (data.money || 0) + Number(amount);
            saveData(data);
            console.log(`${amount} $ ajoutés. Nouveau solde : ${data.money} $`);
        } catch (e) {
            console.error("Échec de l'ajout d'argent:", e);
        }
    }

    function addPlayerExp(amount) {
        // Système de niveau supprimé
        return false;
    }

    function getPlayerStats() {
        return { level: 1, exp: 0, nextLevelExp: 0 };
    }
    
    function isFeatureUnlocked(featureId) {
        // Toutes les fonctionnalités sont débloquées par défaut
        return true;
    }

    function getAllAvailablePokemonIds() {
        // Returns IDs of the first 24 pokemon, as per current game scope
        return pokedexSubset.map(p => p.id);
    }

    function fusePokemon(mainPkInstanceId, materialPkInstanceIds) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };

        const mainPk = data.pokemons.find(p => p.instanceId === mainPkInstanceId);
        if (!mainPk) return { success: false, reason: "Pokémon principal non trouvé." };

        const currentGrade = mainPk.grade || 0;
        if (currentGrade >= 4) return { success: false, reason: "Grade maximum (4) déjà atteint." };

        const requiredCount = currentGrade + 1;
        if (materialPkInstanceIds.length < requiredCount) {
            return { success: false, reason: `Nombre de Pokémon à sacrifier insuffisant. Requis : ${requiredCount}.` };
        }

        // Vérifier que tous les matériaux sont valides et de la même espèce
        const mainSpeciesId = mainPk.id;
        for (const matId of materialPkInstanceIds) {
            const materialPk = data.pokemons.find(p => p.instanceId === matId);
            if (!materialPk || materialPk.id !== mainSpeciesId) {
                return { success: false, reason: "Les Pokémon à sacrifier ne sont pas valides ou pas de la même espèce." };
            }
        }

        // Filtrer les Pokémon sacrifiés
        data.pokemons = data.pokemons.filter(p => !materialPkInstanceIds.includes(p.instanceId));

        // Retrouver le Pokémon principal dans la liste filtrée et le mettre à jour
        const upgradedPk = data.pokemons.find(p => p.instanceId === mainPkInstanceId);
        if (!upgradedPk) return { success: false, reason: "Erreur critique lors de la fusion." };

        upgradedPk.grade = currentGrade + 1;
        upgradedPk.maxLevel = 20 + (upgradedPk.grade * 20);

        saveData(data);
        return { success: true, pokemon: upgradedPk };
    }

    function levelUpPokemon(pokemonInstanceId, levelsToAdd) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };

        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon non trouvé." };

        const currentGrade = pokemon.refinementLevel || 1;
        const currentStars = pokemon.refinementStars || 0;
        const maxLevel = Refinement.getMaxLevel(currentGrade, currentStars);
        
        if (pokemon.level >= maxLevel) {
            return { success: false, reason: `Niveau maximum (${maxLevel}) atteint. Augmentez le Grade pour débloquer la suite.` };
        }

        const finalLevel = Math.min(pokemon.level + levelsToAdd, maxLevel);
        const actualLevelsToAdd = finalLevel - pokemon.level;
        if (actualLevelsToAdd <= 0) return { success: false, reason: "Impossible d'ajouter des niveaux." };

        let totalCost = 0;
        for (let i = 0; i < actualLevelsToAdd; i++) {
            totalCost += (pokemon.level + i) * 50; 
        }
        
        if (data.money < totalCost) return { success: false, reason: `Pas assez d'argent. Requis : ${totalCost.toLocaleString('fr-FR')} $.` };

        data.money -= totalCost;
        pokemon.level = finalLevel;
        
        // Recalcule les stats car le niveau a changé
        pokemon.stats = calculateStats(pokemon);
        
        saveData(data);
        return { success: true, pokemon: pokemon, newLevel: pokemon.level, cost: totalCost };
    }

    /**
     * Sacrifie des Pokémon pour donner de l'XP à un autre
     * @param {string} targetId - ID du Pokémon qui reçoit l'XP
     * @param {Array} foodIds - Liste des IDs des Pokémon sacrifiés
     */
    function feedPokemon(targetId, foodIds) {
        const data = loadData();
        const target = data.pokemons.find(p => p.instanceId === targetId);
        if (!target) return { success: false, reason: "Pokémon cible non trouvé." };

        const currentGrade = target.refinementLevel || 1;
        const currentStars = target.refinementStars || 0;
        const maxLevel = Refinement.getMaxLevel(currentGrade, currentStars);

        if (target.level >= maxLevel) {
            return { success: false, reason: "Niveau maximum atteint. Augmentez le Grade." };
        }

        let totalXP = 0;
        const foodPokemon = [];
        
        for (const fid of foodIds) {
            if (fid === targetId) continue;
            const index = data.pokemons.findIndex(p => p.instanceId === fid);
            if (index !== -1) {
                const p = data.pokemons[index];
                totalXP += Refinement.getFoodXP(p);
                foodPokemon.push(fid);
            }
        }

        if (foodPokemon.length === 0) return { success: false, reason: "Aucun Pokémon valide à sacrifier." };

        // Conversion XP en niveaux (Simplifié: 1 niveau = 500 XP pour l'instant)
        const levelsToAdd = Math.floor(totalXP / 500);
        const initialLevel = target.level;
        const finalLevel = Math.min(target.level + levelsToAdd, maxLevel);
        
        // Supprimer les Pokémon food
        data.pokemons = data.pokemons.filter(p => !foodPokemon.includes(p.instanceId));
        
        target.level = finalLevel;
        target.stats = calculateStats(target);
        
        saveData(data);
        return { success: true, pokemon: target, levelsGained: finalLevel - initialLevel, xpUsed: totalXP };
    }

    function createInstance(pokemonId) {
        const masterPk = pokedexSubset.find(p => p.id === pokemonId);
        if (!masterPk) return null;

        // Shiny chance: 1/128 for testing, normally 1/4096
        const isShiny = Math.random() < (1/128); 
        const nature = NATURES[Math.floor(Math.random() * NATURES.length)];
        
        let ability = "Absent";
        if (masterPk.abilities && masterPk.abilities.length > 0) {
            ability = masterPk.abilities[Math.floor(Math.random() * masterPk.abilities.length)].name;
        }

        const instance = {
            ...masterPk,
            level: 1,
            grade: 0,
            instanceId: `pk-${pokemonId}-${Date.now()}-${Math.random()}`,
            selectedMoves: [],
            boostedMove: null,
            isShiny: isShiny,
            nature: nature,
            ability: ability,
            isFavorite: false,
            status: 'ready',
            ivs: {
                hp: Math.floor(Math.random() * 32),
                atk: Math.floor(Math.random() * 32),
                def: Math.floor(Math.random() * 32),
                spatk: Math.floor(Math.random() * 32),
                spdef: Math.floor(Math.random() * 32),
                speed: Math.floor(Math.random() * 32)
            },
            evs: { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 }
        };

        // Recalculate stats with IVs/EVs
        instance.stats = calculateStats(instance);

        if (isShiny && masterPk.sprite_shiny) {
            instance.sprite = masterPk.sprite_shiny;
        }

        return instance;
    }

    function getPokemonRarity(pokemonId) {
        const pk = pokedexSubset.find(p => p.id === pokemonId);
        return pk ? pk.rarity : 'Commun';
    }

    function getRarityHatchTime(rarity) {
        const ONE_HOUR = 3600000;
        let rarityLevelMultiplier;
        switch(rarity) {
            case 'Bébé':
                rarityLevelMultiplier = 1; // 1 heure pour les œufs de bébé
                break;
            case 'Commun':
                rarityLevelMultiplier = 2; // 1 heure (base) + 1 heure par niveau de rareté
                break;
            case 'Peu Commun': rarityLevelMultiplier = 3; break;
            case 'Rare': rarityLevelMultiplier = 4; break;
            case 'Très Rare': rarityLevelMultiplier = 5; break;
            case 'Légendaire': rarityLevelMultiplier = 6; break;
            case 'Mythique': rarityLevelMultiplier = 7; break;
            default:
                rarityLevelMultiplier = 1; // Par défaut, 1 heure si la rareté n'est pas reconnue (ou pour les bébés si non spécifié)
                break;
        }
        return ONE_HOUR * rarityLevelMultiplier;
    }

    function getUnlockedIncubators() {
        const data = loadData();
        return data ? (data.unlockedIncubators || 1) : 1;
    }

    function getItems() {
        const data = loadData();
        return (data && data.inventory) ? (data.inventory.items || {}) : {};
    }

    function addEggToIncubator(eggInstanceId) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        if (!data.inventory) data.inventory = { incubators: [], eggs: [] };
        if (!data.inventory.incubators) data.inventory.incubators = [];
        
        const unlockedIncubators = data.unlockedIncubators || 1;
        if (data.inventory.incubators.length >= unlockedIncubators) return { success: false, reason: "Incubateurs pleins" };

        let eggIndex = data.inventory.eggs.findIndex(e => e.instanceId === eggInstanceId);
        
        // Fallback : si l'instanceId n'est pas trouvé, on tente par 'id' (sécurité pour les anciens œufs)
        if (eggIndex === -1 && eggInstanceId) {
            eggIndex = data.inventory.eggs.findIndex(e => e.id === eggInstanceId);
        }

        if (eggIndex === -1) return { success: false, reason: "Œuf non trouvé dans le sac." };

        const eggItem = data.inventory.eggs[eggIndex];
        
        // Si l'œuf a déjà un pokemonId (généré à l'acquisition), on le garde.
        // Sinon (ex: œuf acheté en boutique), on génère le Pokémon maintenant.
        let pokemonId = eggItem.pokemonId;
        if (!pokemonId) {
            const eggData = generateRandomEgg(eggItem.rarity);
            pokemonId = eggData.pokemonId;
        }
        
        const hatchTime = getRarityHatchTime(eggItem.rarity);
        const newIncubation = {
            instanceId: `inc-${Date.now()}-${Math.random()}`,
            startTime: Date.now(),
            endTime: Date.now() + hatchTime,
            pokemonId: pokemonId,
            rarity: eggItem.rarity
        };

        data.inventory.incubators.push(newIncubation);
        data.inventory.eggs.splice(eggIndex, 1);
        saveData(data);
        return { success: true, egg: newIncubation };
    }
    function buyIncubatorSlot() {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };

        const unlockedCount = data.unlockedIncubators || 1;
        if (unlockedCount >= 10) {
            return { success: false, reason: "Nombre maximum d'incubateurs atteint (10)." };
        }

        const COSTS = [
            0, 
            5000, 
            15000, 
            30000, 
            75000, 
            150000, 
            300000, 
            600000, 
            1200000, 
            2500000
        ];
        const cost = COSTS[unlockedCount];

        if (data.money < cost) {
            return { success: false, reason: `Pas assez d'argent. Requis : ${cost.toLocaleString('fr-FR')} $.` };
        }

        data.money -= cost;
        data.unlockedIncubators = unlockedCount + 1;
        saveData(data);

        return { success: true, newCount: data.unlockedIncubators, cost: cost };
    }

    function buyItem(itemKey, price, count = 1) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        
        const totalPrice = price * count;
        if (data.money < totalPrice) return { success: false, reason: "Pas assez d'argent." };
        
        data.money -= totalPrice;
        if (!data.inventory.items) data.inventory.items = {};
        data.inventory.items[itemKey] = (data.inventory.items[itemKey] || 0) + count;
        
        saveData(data);
        return { success: true, money: data.money };
    }

    function buyEgg(rarity, price) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        if (data.money < price) return { success: false, reason: "Pas assez d'argent." };
        
        data.money -= price;
        if (!data.inventory.eggs) data.inventory.eggs = [];
        data.inventory.eggs.push({
            instanceId: `egg-shop-${Date.now()}-${Math.random()}`,
            rarity: rarity
        });
        
        saveData(data);
        return { success: true, money: data.money };
    }

    function useItemOnPokemon(itemKey, pokemonInstanceId) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon non trouvé." };
        
        const inventory = data.inventory.items || {};
        if (!inventory[itemKey] || inventory[itemKey] <= 0) return { success: false, reason: "Objet non possédé." };

        // Logic for Vitamins (EVs)
        const vitaminMap = {
            "hp-up": "hp", "protein": "atk", "iron": "def", 
            "calcium": "spatk", "zinc": "spdef", "carbos": "speed", "carbone": "speed"
        };

        const berryEvMap = {
            "pomeg-berry": "hp", "kelpsy-berry": "atk", "qualot-berry": "def",
            "hondew-berry": "spatk", "grepa-berry": "spdef", "tamato-berry": "speed"
        };

        if (vitaminMap[itemKey]) {
            const stat = vitaminMap[itemKey];
            if (!pokemon.evs) pokemon.evs = { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 };
            
            const currentTotalEV = Object.values(pokemon.evs).reduce((a, b) => a + b, 0);
            if (currentTotalEV >= 510) return { success: false, reason: "Total d'EVs maximum atteint (510)." };
            if (pokemon.evs[stat] >= 252) return { success: false, reason: `EVs en ${stat.toUpperCase()} déjà au maximum.` };
            
            const gain = Math.min(10, 252 - pokemon.evs[stat], 510 - currentTotalEV);
            pokemon.evs[stat] += gain;
            pokemon.stats = calculateStats(pokemon);
        } else if (berryEvMap[itemKey]) {
            const stat = berryEvMap[itemKey];
            if (!pokemon.evs) pokemon.evs = { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 };
            if (pokemon.evs[stat] <= 0) return { success: false, reason: `EVs en ${stat.toUpperCase()} sont déjà à 0.` };
            
            pokemon.evs[stat] = Math.max(0, pokemon.evs[stat] - 10);
            pokemon.stats = calculateStats(pokemon);
        } else if (itemKey === "gold-bottle-cap") {
            pokemon.ivs = { hp: 31, atk: 31, def: 31, spatk: 31, spdef: 31, speed: 31 };
            pokemon.stats = calculateStats(pokemon);
        } else {
            return { success: false, reason: "Cet objet ne peut pas être utilisé de cette manière." };
        }

        inventory[itemKey]--;
        saveData(data);
        return { success: true, pokemon: pokemon };
    }

    function useBottleCap(pokemonInstanceId, statKey) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon non trouvé." };
        
        const itemKey = "silver-bottle-cap";
        if (!data.inventory.items[itemKey] || data.inventory.items[itemKey] <= 0) {
            return { success: false, reason: "Bouchon d'Argent non possédé." };
        }

        if (!pokemon.ivs) pokemon.ivs = { hp: 0, atk: 0, def: 0, spatk: 0, spdef: 0, speed: 0 };
        pokemon.ivs[statKey] = 31;
        pokemon.stats = calculateStats(pokemon);
        
        data.inventory.items[itemKey]--;
        saveData(data);
        return { success: true, pokemon: pokemon };
    }

    function hatchEgg(eggInstanceId) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };

        const eggIndex = data.inventory.incubators.findIndex(e => e.instanceId === eggInstanceId);
        if (eggIndex === -1) return { success: false, reason: "Oeuf non trouvé." };

        const egg = data.inventory.incubators[eggIndex];
        if (Date.now() < egg.endTime) return { success: false, reason: "L'oeuf n'est pas prêt à éclore." };

        const newPokemon = createInstance(egg.pokemonId);
        if (!newPokemon) return { success: false, reason: "Données du Pokémon à éclore introuvables." };

        data.pokemons.push(newPokemon);
        data.inventory.incubators.splice(eggIndex, 1);
        saveData(data);

        return { success: true, pokemon: newPokemon };
    }

    function hatchAllReadyEggs() {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };

        const now = Date.now();
        const readyEggs = data.inventory.incubators.filter(egg => now >= egg.endTime);
        if (readyEggs.length === 0) return { success: false, reason: "Aucun oeuf prêt à éclore." };

        const hatchedPokemons = [];
        const remainingEggs = data.inventory.incubators.filter(egg => now < egg.endTime);

        for (const egg of readyEggs) {
            const newPokemon = createInstance(egg.pokemonId);
            if (newPokemon) {
                hatchedPokemons.push(newPokemon);
                data.pokemons.push(newPokemon);
            }
        }

        data.inventory.incubators = remainingEggs;
        saveData(data);

        return { success: true, hatchedPokemons };
    }

    function getIncubatorEggs() {
        const data = loadData();
        return data?.inventory?.incubators || [];
    }

    function getEggs() {
        const data = loadData();
        return data?.inventory?.eggs || [];
    }

    function getMission() {
        const data = loadData();
        return data ? data.mission : null;
    }

    function getAvailableMissions() {
        const data = loadData();
        if (!data) return [];
        // Nettoyage des missions expirées
        const now = Date.now();
        if (data.availableMissions) {
            data.availableMissions = data.availableMissions.filter(m => m.expiresAt > now);
        }
        // Si vide (ou tout expiré), on en régénère
        if (!data.availableMissions || data.availableMissions.length === 0) {
            data.availableMissions = generateMissionsBatch();
            saveData(data);
        }
        return data.availableMissions;
    }

    function startMission(missionId, teamInstanceIds) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        if (data.mission && data.mission.active) return { success: false, reason: "Une mission est déjà en cours." };
        if (teamInstanceIds.length !== 5) return { success: false, reason: "L'équipe doit contenir 5 Pokémon." };

        const mission = data.availableMissions.find(m => m.id === missionId);
        if (!mission) return { success: false, reason: "Mission introuvable ou expirée." };

        // Vérification des Pokémon
        for (const id of teamInstanceIds) {
            const pk = data.pokemons.find(p => p.instanceId === id);
            if (!pk || pk.status !== 'ready') {
                return { success: false, reason: `Le Pokémon ${pk ? pk.name : id} n'est pas disponible.` };
            }
        }

        const now = Date.now();
        const endTime = now + mission.duration * 3600 * 1000;

        data.mission = {
            active: true,
            team: teamInstanceIds,
            startTime: now,
            endTime: endTime,
            rewards: null,
            details: mission // On stocke les détails pour le calcul des récompenses
        };

        // Mise à jour du statut des Pokémon
        teamInstanceIds.forEach(id => {
            const pk = data.pokemons.find(p => p.instanceId === id);
            if (pk) pk.status = 'on_mission';
        });

        // Retirer la mission de la liste des disponibles
        data.availableMissions = data.availableMissions.filter(m => m.id !== missionId);

        saveData(data);
        return { success: true, mission: data.mission };
    }

    // Items pool enrichie pour les missions
    function pickRandomItem(pockets = ['misc', 'medicine', 'battle', 'berries', 'training', 'tm']) {
        const availablePockets = pockets.filter(p => itemsByPocket[p] && itemsByPocket[p].length > 0);
        if (availablePockets.length === 0) return null;
        
        const pocket = availablePockets[Math.floor(Math.random() * availablePockets.length)];
        const pool = itemsByPocket[pocket];
        const item = pool[Math.floor(Math.random() * pool.length)];
        return item;
    }

    function calculateAndSetMissionRewards() {
        const data = loadData();
        if (!data || !data.mission || !data.mission.active || data.mission.rewards) return;

        const teamPokemons = data.mission.team.map(id => {
            const savedPk = data.pokemons.find(p => p.instanceId === id);
            if (!savedPk) return null;
            const base = pokedexSubset.find(p => p.id === savedPk.id);
            return base ? { ...base, ...savedPk } : savedPk;
        }).filter(Boolean);
        
        if (teamPokemons.length === 0) return;

        const missionDetails = data.mission.details || { 
            difficulty: 1, 
            duration: (data.mission.endTime - data.mission.startTime) / 3600000, 
            affinityTypes: [] 
        };

        const durationHours = missionDetails.duration;
        const difficulty = missionDetails.difficulty || 1;
        const affinityTypes = missionDetails.affinityTypes || [];

        // 1. Calcul du Score de l'équipe
        let totalLevel = 0;
        let affinityBonus = 0;

        teamPokemons.forEach(p => {
            totalLevel += p.level;
            // Vérification simple des types (primary et secondary)
            const pTypes = [p.type];
            if (p.types) pTypes.push(...p.types); // Support structure array
            
            const hasAffinity = pTypes.some(t => t && affinityTypes.includes(t.toLowerCase()));
            if (hasAffinity) affinityBonus += 1;
        });

        // 2. Génération des Logs
        const logs = [];
        logs.push(`L'équipe est arrivée dans la zone : ${missionDetails.affinityName || 'Inconnue'}.`);
        if (affinityBonus > 0) {
            logs.push(`${affinityBonus} Pokémon se sentent à l'aise dans cet environnement !`);
        }

        // 3. Calcul des Récompenses
        // Argent rééquilibré (Légère augmentation pour suivre la progression)
        const baseMoney = totalLevel * 15 * durationHours * (1 + (difficulty * 0.25));
        const moneyReward = Math.floor(baseMoney * (1 + (affinityBonus * 0.15))); // +15% par affinité

        // Oeufs
        let eggsFound = 0;
        const baseEggChance = (totalLevel / 500) * durationHours;
        const eggRolls = 1 + Math.floor(durationHours / 4); // 1 roll every 4 hours + 1 base
        
        for(let i=0; i<eggRolls; i++) {
            if (Math.random() < baseEggChance) {
                eggsFound++;
                logs.push(`L'équipe a trouvé un œuf mystérieux en chemin.`);
            }
        }
        eggsFound = Math.min(eggsFound, 3); // Max 3 oeufs

        const newEggs = [];
        for (let i = 0; i < eggsFound; i++) {
            const rarity = generateWeightedEggRarity();
            newEggs.push({ 
                instanceId: `egg-${Date.now()}-${i}-${Math.random()}`,
                rarity: rarity 
            });
        }

        // Objets & Baies & Entraînement
        const itemsFound = [];
        const itemChance = 0.4 + (affinityBonus * 0.05); // 40% base + bonus affinité
        
        if (Math.random() < itemChance) {
            let pockets = ['medicine', 'berries', 'training'];
            if (difficulty >= 2) pockets.push('misc', 'battle');
            
            const foundItem = pickRandomItem(pockets);
            if (foundItem) {
                itemsFound.push({ id: foundItem.id, name: foundItem.name_fr, count: 1 });
                logs.push(`En explorant, l'équipe a déniché un objet utile : ${foundItem.name_fr} !`);
            }
        }

        // Drop de CT (TM) - Rare
        if (difficulty >= 2 && Math.random() < (0.1 * difficulty)) {
            const tmItem = pickRandomItem(['tm']);
            if (tmItem) {
                itemsFound.push({ id: tmItem.id, name: tmItem.name_fr || tmItem.id.toUpperCase(), count: 1 });
                logs.push(`Merveilleux ! L'équipe a découvert une CT oubliée : ${tmItem.name_fr || tmItem.id.toUpperCase()} !`);
            }
        }

        logs.push("Mission accomplie ! L'équipe rentre à la base.");

        data.mission.rewards = { 
            money: moneyReward, 
            eggs: newEggs,
            items: itemsFound,
            logs: logs
        };
        saveData(data);
    }

    function claimMissionRewards() {
        const data = loadData();
        if (!data || !data.mission || !data.mission.rewards) return { success: false, reason: "Aucune récompense à récupérer." };

        data.money += data.mission.rewards.money;
        
        // Ajout des oeufs
        if (data.mission.rewards.eggs) {
            data.inventory.eggs.push(...data.mission.rewards.eggs);
        }

        // Ajout des objets
        if (data.mission.rewards.items) {
            if (!data.inventory.items) data.inventory.items = {};
            data.mission.rewards.items.forEach(item => {
                data.inventory.items[item.id] = (data.inventory.items[item.id] || 0) + item.count;
            });
        }

        data.mission.team.forEach(id => {
            const pk = data.pokemons.find(p => p.instanceId === id);
            if (pk) pk.status = 'exhausted';
        });

        const rewards = { ...data.mission.rewards };
        data.mission = { team: [], endTime: null, rewards: null, active: false, details: null };
        saveData(data);
        return { success: true, rewards };
    }


    function checkEvolution(pokemonInstanceId) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return null;

        const basePk = pokedexSubset.find(p => p.id === pokemon.id);
        if (!basePk) return null;

        // Check Override first, then Pokedex data
        let evolutionData = EVOLUTION_OVERRIDES[pokemon.id] || basePk.evolution;
        
        if (!evolutionData) return null;

        // Handle Array of evolutions (e.g. Eevee)
        const options = Array.isArray(evolutionData) ? evolutionData : [evolutionData];
        
        const possibleEvolutions = options.map(evo => {
            const targetPk = pokedexSubset.find(p => p.id === evo.targetId);
            if (!targetPk) return null;

            let canEvolve = false;
            let reason = "";

            if (evo.method === 'level-up') {
                if (pokemon.level >= evo.level) {
                   canEvolve = true; 
                } else {
                    reason = `Niveau requis : ${evo.level}`;
                }
            } else if (evo.method === 'use-item' || evo.method === 'trade') {
                const requiredItem = evo.item;
                const owned = (data.inventory.items && data.inventory.items[requiredItem]) || 0;
                if (owned > 0) {
                    canEvolve = true;
                } else {
                    // Try to find readable name for item
                    const itemInfo = (typeof REWARD_ITEMS_POOL !== 'undefined') ? REWARD_ITEMS_POOL.find(i => i.id === requiredItem) : null;
                    const itemName = itemInfo ? itemInfo.name : requiredItem;
                    reason = `Objet requis : ${itemName}`;
                }
            }

            return {
                targetId: evo.targetId,
                targetName: targetPk.name,
                targetSprite: targetPk.sprite,
                method: evo.method,
                level: evo.level,
                item: evo.item,
                canEvolve: canEvolve,
                reason: reason
            };
        }).filter(Boolean);

        return possibleEvolutions.length > 0 ? possibleEvolutions : null;
    }

    function evolvePokemon(pokemonInstanceId, targetId) {
        const data = loadData();
        const pokemonIndex = data.pokemons.findIndex(p => p.instanceId === pokemonInstanceId);
        if (pokemonIndex === -1) return { success: false, reason: "Pokémon introuvable." };
        
        const pokemon = data.pokemons[pokemonIndex];
        const currentId = pokemon.id;
        
        let evolutionData = EVOLUTION_OVERRIDES[currentId] || pokedexSubset.find(p => p.id === currentId)?.evolution;
        if (!evolutionData) return { success: false, reason: "Ce Pokémon n'évolue pas." };
        
        const options = Array.isArray(evolutionData) ? evolutionData : [evolutionData];
        const evoOption = options.find(e => e.targetId === targetId);

        if (!evoOption) return { success: false, reason: "Évolution invalide." };

        if (evoOption.method === 'level-up') {
            if (pokemon.level < evoOption.level) return { success: false, reason: "Niveau insuffisant." };
        } else if (evoOption.method === 'use-item' || evoOption.method === 'trade') {
            const item = evoOption.item;
            if (!data.inventory.items || !data.inventory.items[item] || data.inventory.items[item] <= 0) {
                return { success: false, reason: "Objet manquant." };
            }
            // Consume item
            data.inventory.items[item]--;
        }

        // Perform Evolution
        const targetPkBase = pokedexSubset.find(p => p.id === targetId);
        if (!targetPkBase) return { success: false, reason: "Données d'évolution cibles introuvables." };

        // Update Pokemon Data
        pokemon.id = targetId;
        pokemon.name = targetPkBase.name; // Reset nickname to species name on evolution usually
        pokemon.sprite = targetPkBase.sprite;
        pokemon.types = targetPkBase.types;
        // Keep level, grade, moves, etc.
        
        saveData(data);
        return { success: true, newPokemon: pokemon };
    }

    function equipItem(pokemonInstanceId, itemId) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };

        // If already has an item, unequip first
        if (pokemon.heldItem) {
            const unequipResult = _unequipItemInternal(data, pokemon);
            if (!unequipResult.success) return unequipResult;
        }

        // Check inventory
        if (!data.inventory.items || !data.inventory.items[itemId] || data.inventory.items[itemId] <= 0) {
            return { success: false, reason: "Objet non possédé." };
        }

        // Equip
        data.inventory.items[itemId]--;
        pokemon.heldItem = itemId;

        saveData(data);
        return { success: true, pokemon };
    }

    function unequipItem(pokemonInstanceId) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };
        if (!pokemon.heldItem) return { success: false, reason: "Ce Pokémon n'a pas d'objet." };

        const result = _unequipItemInternal(data, pokemon);
        if (result.success) {
            saveData(data);
        }
        return result;
    }

    function _unequipItemInternal(data, pokemon) {
        if (!pokemon.heldItem) return { success: true };
        const itemId = pokemon.heldItem;
        if (!data.inventory.items) data.inventory.items = {};
        data.inventory.items[itemId] = (data.inventory.items[itemId] || 0) + 1;
        pokemon.heldItem = null;
        return { success: true, pokemon };
    }

    function healAllPokemon() {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        let healedCount = 0;
        const HEALING_DURATION = 6 * 3600 * 1000; // 6 heures
        const now = Date.now();
        data.pokemons.forEach(pk => {
            if (pk && pk.status === 'exhausted') {
                pk.status = 'healing';
                pk.healingEndTime = now + HEALING_DURATION;
                healedCount++;
            }
        });
        if (healedCount > 0) {
            saveData(data);
            return { success: true, count: healedCount };
        }
        return { success: false, reason: "Aucun Pokémon à soigner." };
    }

    // On expose les fonctions que le reste du jeu peut utiliser
    function updateProfile(name, gender) {
        const data = loadData();
        if (!data) return { success: false };
        data.playerName = name || data.playerName;
        data.playerGender = gender || data.playerGender;
        saveData(data);
        return { success: true, data };
    }

    function getPlayerData() {
        const data = loadData();
        return data ? { name: data.playerName, gender: data.playerGender, money: data.money } : null;
    }

    // On expose les fonctions que le reste du jeu peut utiliser
    function toggleFavorite(instanceId) {
        const data = loadData();
        const p = data.pokemons.find(pk => pk.instanceId === instanceId);
        if (p) {
            p.isFavorite = !p.isFavorite;
            saveData(data);
            return { success: true, isFavorite: p.isFavorite };
        }
        return { success: false };
    }

    // --- REFINEMENT SYSTEM BACKEND ---

    function getRefinementResourceCount(type) {
        const data = loadData();
        if (!data || !data.inventory || !data.inventory.items) return 0;
        // Mapping simple pour les ressources génériques (à adapter selon items.json)
        switch(type) {
            case 'feather': return (data.inventory.items['feather'] || 0); // TODO: Gérer types spécifiques ?
            case 'vitamin': return (data.inventory.items['protein'] || 0) + (data.inventory.items['calcium'] || 0) + (data.inventory.items['iron'] || 0) + (data.inventory.items['zinc'] || 0) + (data.inventory.items['carbos'] || 0) + (data.inventory.items['hp-up'] || 0); // Somme pour l'affichage (simplification)
            default: return 0;
        }
    }

    function refinePokemonLevel(instanceId) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === instanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };

        const currentLevel = pokemon.refinementLevel || 1;
        const currentStars = pokemon.refinementStars || 0;
        
        // --- NOUVEAU: Vérifier que le niveau actuel est au max pour ce grade ---
        const maxLevelForCurrentGrade = Refinement.getMaxLevel(currentLevel, currentStars);
        if (pokemon.level < maxLevelForCurrentGrade) {
            return { success: false, reason: `Vous devez atteindre le niveau ${maxLevelForCurrentGrade} avant de monter de Grade.` };
        }

        if (typeof Refinement === 'undefined') return { success: false, reason: "Module Refinement non chargé." };

        const clones = data.pokemons.filter(p => p.id === pokemon.id && p.instanceId !== instanceId);
        const availableCopies = clones.length;
        
        const realCheck = Refinement.canRefineLevelUp(pokemon, availableCopies, data.money, 'pokemon');
        
        if (!realCheck.possible) {
            return { success: false, reason: realCheck.reason };
        }

        const cost = realCheck.cost;
        
        // Consume Cost
        data.money -= cost.money;
        
        if (cost.copies > 0) {
            const clonesToRemove = clones.slice(0, cost.copies).map(p => p.instanceId);
            data.pokemons = data.pokemons.filter(p => !clonesToRemove.includes(p.instanceId));
        }

        // Apply Upgrade
        pokemon.refinementLevel = currentLevel + 1;
        
        // Recalculate stats
        pokemon.stats = calculateStats(pokemon);
        
        saveData(data);
        return { success: true, pokemon: pokemon };
    }

    function refinePokemonStar(instanceId) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === instanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };

        if (typeof Refinement === 'undefined') return { success: false, reason: "Module Refinement non chargé." };

        const clones = data.pokemons.filter(p => p.id === pokemon.id && p.instanceId !== instanceId);
        const availableCopies = clones.length;
        
        const realCheck = Refinement.canRefineAddStar(pokemon, availableCopies, data.money, 'pokemon');
        
        if (!realCheck.possible) {
            return { success: false, reason: realCheck.reason };
        }

        const cost = realCheck.cost;
        
        data.money -= cost.money;
        
        if (cost.copies > 0) {
            const clonesToRemove = clones.slice(0, cost.copies).map(p => p.instanceId);
            data.pokemons = data.pokemons.filter(p => !clonesToRemove.includes(p.instanceId));
        }

        const currentStars = pokemon.refinementStars || 0;
        pokemon.refinementStars = currentStars + 1;
        pokemon.stats = calculateStats(pokemon);
        
        saveData(data);
        return { success: true, pokemon: pokemon };
    }

    function refineIV(instanceId) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === instanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };

        if (typeof Refinement === 'undefined') return { success: false, reason: "Module Refinement non chargé." };

        const ivRef = pokemon.ivRefinement || { level: 1, stars: 0 };
        const dummyRefinable = { refinementLevel: ivRef.level, refinementStars: ivRef.stars }; // Simulate object for helper

        // Cost check
        // IV refinement requires 'feathers' (generic for now, or use specific feathers?)
        // Refinement.js says: cost.feathers = ceil(level / 10)
        // Let's assume we use a generic "pretty-feather" item or similar.
        // For now, let's look at available items.
        // Simplified: Use 'feather' item key if exists, or just money for now if items not implemented fully?
        // Plan: Check 'pretty-feather' count.
        
        const featherCount = (data.inventory.items['pretty-feather'] || 0); 
        // Note: Refinement.js doesn't export a 'canRefineIV' specifically, it uses generic canRefineLevelUp with type 'iv' 
        // but 'canRefineLevelUp' calls 'getRefinementCost' which returns 'feathers'.
        // 'canRefineLevelUp' only checks 'availableCopies' vs 'requiredCopies'. It doesn't check 'feathers'.
        // We must implement the check here manually or extend Refinement.js.
        // Manual check here is safer to avoid modifying Refinement.js too much (it was seemingly pure logic).
        
        const cost = Refinement.getRefinementCost('iv', ivRef.level, ivRef.stars);
        
        if (data.money < cost.money) return { success: false, reason: `Pas assez d'argent (${cost.money} $ requis).` };
        if (featherCount < cost.feathers) return { success: false, reason: `Pas assez de plumes (${cost.feathers} requises).` };

        // Apply
        data.money -= cost.money;
        data.inventory.items['pretty-feather'] -= cost.feathers;
        
        if (!pokemon.ivRefinement) pokemon.ivRefinement = { level: 1, stars: 0 };
        pokemon.ivRefinement.level = (pokemon.ivRefinement.level || 1) + 1;
        
        pokemon.stats = calculateStats(pokemon);
        saveData(data);
        return { success: true, pokemon: pokemon };
    }

    function refineEV(instanceId) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === instanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };

        // Similar logic to IV but with vitamins
        const evRef = pokemon.evRefinement || { level: 1, stars: 0 };
        
        // Sum of all vitamins? Or generic 'vitamin-mix' item?
        // Refinement.js line 144: cost.vitamins
        // Let's use any vitamin. Simple approach: Consume 'health-vitamin' generic or specific?
        // Let's assume 'protein' for simplicity or any.
        // Better: We need a "Refinement Stone" or just allow Money if vitamins are for stats directly.
        // Use 'pp-up' or similar rare item?
        // Let's check inventory for ANY vitamin and consume it? That's complex.
        // Let's require "refinement-crystal" or something new?
        // User asked for "Refinement".
        // Let's check 'zinc', 'calcium', etc.
        // For now, I will implementation a check for 'calcium' as a placeholder for "Generic Vitamin" or add a new item type.
        // Let's use 'hp-up' as the generic resource for now.
        const vitaminCount = (data.inventory.items['hp-up'] || 0);

        const cost = Refinement.getRefinementCost('ev', evRef.level, evRef.stars);
        
        if (data.money < cost.money) return { success: false, reason: `Pas assez d'argent.` };
        if (vitaminCount < cost.vitamins) return { success: false, reason: `Pas assez de PV Plus (${cost.vitamins} requis).` };

        data.money -= cost.money;
        data.inventory.items['hp-up'] -= cost.vitamins;
        
        if (!pokemon.evRefinement) pokemon.evRefinement = { level: 1, stars: 0 };
        pokemon.evRefinement.level = (pokemon.evRefinement.level || 1) + 1;
        
        pokemon.stats = calculateStats(pokemon);
        saveData(data);
        return { success: true, pokemon: pokemon };
    }

    function refineMove(pokemonInstanceId, moveName) {
        const data = loadData();
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };

        if (!pokemon.moveRefinements) pokemon.moveRefinements = {};
        if (!pokemon.moveRefinements[moveName]) {
             pokemon.moveRefinements[moveName] = { level: 1, stars: 0 };
        }

        const currentRef = pokemon.moveRefinements[moveName];
        
        // Check conditions using Refinement module
        // Moves cost money only
        const check = Refinement.canRefineLevelUp(currentRef, 1, data.money, 'move');
        
        if (!check.possible) {
            return { success: false, reason: check.reason };
        }

        // Apply cost
        data.money -= check.cost.money;
        
        // Apply upgrade
        pokemon.moveRefinements[moveName] = Refinement.applyLevelUp(currentRef);
        pokemon.stats = calculateStats(pokemon); 
        
        saveData(data);
        return { success: true, pokemon, moveRefinement: currentRef, cost: check.cost };
    }

    function getGlobalItemRefinement(itemId) {
        const data = loadData();
        if (!data || !data.itemRefinements) return { level: 1, stars: 0 };
        return data.itemRefinements[itemId] || { level: 1, stars: 0 };
    }

    function refineItem(itemId) {
        const data = loadData();
        if (!data.itemRefinements) data.itemRefinements = {};
        if (!data.itemRefinements[itemId]) data.itemRefinements[itemId] = { level: 1, stars: 0 };
        
        const currentRef = data.itemRefinements[itemId];
        const inventory = data.inventory.items || {};
        const availableCopies = inventory[itemId] || 0;
        
        // Check Level Up first
        const maxLevel = Refinement.getMaxLevel(currentRef.stars);
        
        if (currentRef.level < maxLevel) {
            const check = Refinement.canRefineLevelUp(currentRef, availableCopies, data.money, 'item');
            if (!check.possible) return { success: false, reason: check.reason };
            
            // Apply
            inventory[itemId] -= check.cost.copies;
            data.money -= check.cost.money;
            data.itemRefinements[itemId] = Refinement.applyLevelUp(currentRef);
            
            saveData(data);
            return { success: true, refinement: currentRef, cost: check.cost };
        } 
        // Check Star Up
        else if (currentRef.stars < 5) {
             const check = Refinement.canRefineAddStar(currentRef, availableCopies, data.money, 'item');
             if (!check.possible) return { success: false, reason: check.reason };
             
             // Apply
             inventory[itemId] -= check.cost.copies;
             data.money -= check.cost.money;
             data.itemRefinements[itemId] = Refinement.applyAddStar(currentRef);
             
             saveData(data);
             return { success: true, refinement: currentRef, cost: check.cost };
        }
        
        return { success: false, reason: "Niveau maximum atteint." };
    }


    const standardSort = (a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        return a.id - b.id; // Default sort by ID
    };

    // === FONCTIONS DE RAFFINEMENT ===
    
    function refinePokemonLevel(pokemonInstanceId, foodInstanceIds = []) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };
        
        const currentGrade = pokemon.refinementLevel || 1;
        const currentStars = pokemon.refinementStars || 0;
        
        const copiesCount = data.pokemons.filter(p => 
            GameData.getBaseFormId(p.id) === GameData.getBaseFormId(pokemon.id) && 
            p.instanceId !== pokemonInstanceId
        ).length;
        const check = Refinement.getRefinementCost('pokemon', currentGrade, currentStars);
        
        // Vérification des clones
        if (copiesCount < check.copies) {
            return { success: false, reason: `Il faut ${check.copies} exemplaire(s) identique(s).` };
        }

        // Vérification de la nourriture (FOOD remplace l'argent)
        let availableFoodXP = 0;
        foodInstanceIds.forEach(fid => {
            const food = data.pokemons.find(p => p.instanceId === fid);
            if (food) availableFoodXP += Refinement.getFoodXP(food);
        });

        if (availableFoodXP < check.foodXP) {
            return { success: false, reason: `Pas assez de nourriture (${availableFoodXP}/${check.foodXP} XP).` };
        }
        
        // Consommer les exemplaires
        const targetBaseFormId = GameData.getBaseFormId(pokemon.id);
        for (let i = 0; i < check.copies; i++) {
            const copyIndex = data.pokemons.findIndex(p => 
                GameData.getBaseFormId(p.id) === targetBaseFormId && 
                p.instanceId !== pokemonInstanceId &&
                !foodInstanceIds.includes(p.instanceId) // Ne pas consommer un Pokémon déjà sélectionné comme FOOD
            );
            if (copyIndex !== -1) {
                data.pokemons.splice(copyIndex, 1);
            }
        }
        
        // Consommer la nourriture
        data.pokemons = data.pokemons.filter(p => !foodInstanceIds.includes(p.instanceId));
        
        // Appliquer le raffinement
        pokemon.refinementLevel = currentGrade + 1;
        pokemon.stats = calculateStats(pokemon);
        
        saveData(data);
        return { success: true, pokemon, cost: check };
    }
    
    function refinePokemonStar(pokemonInstanceId) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };
        
        const copies = data.pokemons.filter(p => p.id === pokemon.id && p.instanceId !== pokemonInstanceId);
        const check = Refinement.canRefineAddStar(pokemon, copies.length, data.money, 'pokemon');
        
        if (!check.possible) {
            return { success: false, reason: check.reason, cost: check.cost };
        }
        
        // Consommer les exemplaires
        for (let i = 0; i < check.cost.copies; i++) {
            const copyIndex = data.pokemons.findIndex(p => p.id === pokemon.id && p.instanceId !== pokemonInstanceId);
            if (copyIndex !== -1) {
                data.pokemons.splice(copyIndex, 1);
            }
        }
        
        data.money -= check.cost.money;
        
        // Appliquer le raffinement
        pokemon.refinementStars = (pokemon.refinementStars || 0) + 1;
        pokemon.stats = calculateStats(pokemon);
        
        saveData(data);
        return { success: true, pokemon, cost: check.cost };
    }
    
    function refineIV(pokemonInstanceId, stat) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };
        
        const currentIV = pokemon.ivs[stat] || 0;
        const currentRefLevel = pokemon.ivRefinement.stats[stat] || 0;
        
        const cost = Refinement.getRefinementCost('iv', currentRefLevel, pokemon.ivRefinement.stars, { statValue: currentIV });
        
        if (data.money < cost.money) return { success: false, reason: "Pas assez d'argent." };
        
        if (cost.wings) {
            const wingId = IV_RESOURCE_MAP[stat];
            if ((data.inventory.items[wingId] || 0) < cost.wings) {
                return { success: false, reason: `Pas assez de ${getItem(wingId).name}.` };
            }
            data.inventory.items[wingId] -= cost.wings;
            pokemon.ivs[stat] += 1;
        } else {
            // Refinement phase
            if (cost.goldBottleCaps) {
                if ((data.inventory.items['gold-bottle-cap'] || 0) < cost.goldBottleCaps) {
                    return { success: false, reason: `Pas assez de Capsules d'Or (${cost.goldBottleCaps} requises).` };
                }
                data.inventory.items['gold-bottle-cap'] -= cost.goldBottleCaps;
            }
            pokemon.ivRefinement.stats[stat] = currentRefLevel + 1;
        }
        
        data.money -= cost.money;
        pokemon.stats = calculateStats(pokemon);
        saveData(data);
        return { success: true, pokemon };
    }
    
    function refineEV(pokemonInstanceId, stat) {
        const data = loadData();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon introuvable." };
        
        const currentEV = pokemon.evs[stat] || 0;
        const currentRefLevel = pokemon.evRefinement.stats[stat] || 0;
        
        const cost = Refinement.getRefinementCost('ev', currentRefLevel, pokemon.evRefinement.stars, { statValue: currentEV });
        
        if (data.money < cost.money) return { success: false, reason: "Pas assez d'argent." };
        
        if (cost.vitamins) {
            const vitId = EV_RESOURCE_MAP[stat];
            if ((data.inventory.items[vitId] || 0) < cost.vitamins) {
                return { success: false, reason: `Pas assez de ${getItem(vitId).name}.` };
            }
            data.inventory.items[vitId] -= cost.vitamins;
            // +25 EV par vitamin comme demandé (ou cap à 252)
            pokemon.evs[stat] = Math.min(252, currentEV + 25);
        } else {
            // Refinement phase
            if (cost.goldBottleCaps) {
                if ((data.inventory.items['gold-bottle-cap'] || 0) < cost.goldBottleCaps) {
                    return { success: false, reason: `Pas assez de Capsules d'Or (${cost.goldBottleCaps} requises).` };
                }
                data.inventory.items['gold-bottle-cap'] -= cost.goldBottleCaps;
            }
            pokemon.evRefinement.stats[stat] = currentRefLevel + 1;
        }
        
        data.money -= cost.money;
        pokemon.stats = calculateStats(pokemon);
        saveData(data);
        return { success: true, pokemon };
    }

    /**
     * Retourne le nombre d'unités d'une ressource de raffinement
     */
    function getRefinementResourceCount(itemId) {
        const data = loadData();
        return data?.inventory?.items[itemId] || 0;
    }

    return {
        init,
        updateProfile,
        getPlayerData,
        getPokemons,
        getPokedexSubset,
        exportData,
        importData,
        setPokemonMoves,
        setLastRoadTeam,
        getLastRoadTeam,
        setProgression,
        getProgression,
        clearSaveData,
        getInventory,
        addEggsToBag,
        addItem,
        addMoney,
        _load: loadData,
        _save: saveData,
        fusePokemon,
        levelUpPokemon,
        feedPokemon,
        getAllAvailablePokemonIds,
        createInstance,
        addEggToIncubator,
        getPokemonRarity, 
        getUnlockedIncubators,
        buyIncubatorSlot,
        getIncubatorEggs,
        hatchEgg,
        hatchAllReadyEggs,
        getEggs,
        isBaseForm: (pokemonId) => BASE_FORM_POKEMON_IDS.includes(pokemonId),
        getBaseFormId,
        getMission,
        getAvailableMissions,
        startMission,
        calculateAndSetMissionRewards,
        claimMissionRewards,
        healAllPokemon,
        checkEvolution,
        evolvePokemon,
        equipItem,
        unequipItem,
        toggleFavorite,
        getItems: () => itemsCatalog,
        getItemsByPocket: () => itemsByPocket,
        getItem: (id) => itemsCatalog[id],
        // Fonctions de raffinement
        refinePokemonLevel,
        refinePokemonStar,
        refineIV,
        refineEV,
        refineMove,
        getGlobalItemRefinement,
        refineItem,
        getRefinementResourceCount,
        addPlayerExp,
        getPlayerStats,
        isFeatureUnlocked,
        calculateStats
    };
})();
