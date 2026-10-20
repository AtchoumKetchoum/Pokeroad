// Module de raffinement universel
// Permet d'améliorer Pokémon, objets, IV/EV et CT au-delà de leurs limites normales

const Refinement = (() => {
    // Progression infinie : plus aucun plafond, ce sont les coûts qui augmentent à chaque palier
    const MAX_LEVEL = Infinity;
    const MAX_STARS = Infinity;
    
    // Coûts de base en argent
    const BASE_COSTS = {
        pokemon: 500,  // Raffinement (Potentiel)
        item: 300,
        iv: 800,
        ev: 600,
        tm: 1000,
        xp: 50 // Coût de base par niveau d'expérience (si monétaire)
    };

    // Objets exclus du raffinement
    const EXCLUDED_CATEGORIES = ['Évolution', 'mega-stones'];
    const EXCLUDED_ITEMS = [
        // Pierres d'évolution
        'fire-stone', 'water-stone', 'thunder-stone', 'leaf-stone', 'moon-stone',
        'sun-stone', 'shiny-stone', 'dusk-stone', 'dawn-stone', 'ice-stone',
        // Objets d'XP
        'rare-candy', 'exp-candy-xs', 'exp-candy-s', 'exp-candy-m', 
        'exp-candy-l', 'exp-candy-xl'
    ];

    /**
     * Calcule le multiplicateur total basé sur le niveau et les étoiles
     * FORMULE RÉVISÉE: Linéaire jusqu'à 300%
     * @param {number} level - Niveau de raffinement (1-200)
     * @param {number} stars - Nombre d'étoiles (0-5)
     * @returns {number} Multiplicateur total
     */
    function getMultiplier(level, stars) {
        level = Math.max(1, level || 1);
        stars = Math.max(0, stars || 0);
        // +1 % par niveau et +20 % par étoile, sans plafond
        return 1.0 + (level - 1) / 100 + stars * 0.2;
    }

    /**
     * Calcule le niveau maximum en fonction du grade (refinementLevel) et des étoiles
     * Chaque grade/étoile débloque +20 niveaux (jusqu'à 200)
     * @param {number} grade - Grade de raffinement (1-5+)
     * @param {number} stars - Nombre d'étoiles (0-5)
     * @returns {number} Niveau maximum
     */
    /**
     * Calcule le niveau maximum en fonction du grade (refinementLevel)
     * Par défaut: 20, puis +20 par grade
     * @param {number} grade - Grade de raffinement (1-5+)
     * @returns {number} Niveau maximum
     */
    function getMaxLevelByGrade(grade) {
        return Math.max(20, (grade || 1) * 20);
    }

    /**
     * Calcule le niveau maximum total (Grade + Étoiles)
     * @param {number} grade - Grade (1-10)
     * @param {number} stars - Étoiles (0-5)
     * @returns {number} Niveau maximum total
     */
    // Pokémon : un palier tous les 10 niveaux. Grades 1 à 10 jusqu'au niveau 100, puis une étoile par palier (★10 = niveau 200)
    const LEVELS_PER_TIER = 10;
    const GRADE_CAP = 10;
    function getMaxLevel(grade, stars) {
        const g = Math.min(GRADE_CAP, Math.max(1, grade || 1));
        return g * LEVELS_PER_TIER + (g >= GRADE_CAP ? Math.max(0, stars || 0) * LEVELS_PER_TIER : 0);
    }

    // Palier partagé : au niveau 10, 20, 30…, on ne passe que si assez d'autres (Pokémon, capacités, stats) y sont aussi
    function tierGate(level, peerLevels, need) {
        if (!level || level % LEVELS_PER_TIER !== 0) return null;
        const have = peerLevels.filter(l => l >= level).length;
        return { level, need, have: Math.min(have, need), ok: have >= need };
    }

    // Objets, attaques, IV/EV : 20 niveaux par palier d'étoile (★0 : 20, ★1 : 40, ★2 : 60…)
    function getMaxRefineLevel(stars) {
        return (Math.max(0, stars || 0) + 1) * 20;
    }

    /**
     * Calcule l'XP fournie par un Pokémon sacrifié
     * @param {Object} pokemon - Pokémon "food"
     * @returns {number} XP gagnée
     */
    function getFoodXP(pokemon) {
        if (!pokemon) return 0;
        
        // Base XP liée au niveau
        const baseXP = pokemon.level * 100;
        
        // Multiplicateur de rareté (basé sur le nom car la rareté n'est pas toujours dans l'objet)
        // On peut aussi utiliser stats de base comme indicateur de rareté
        const statsTotal = Object.values(pokemon.stats || {}).reduce((a, b) => a + b, 0);
        const rarityMult = statsTotal > 500 ? 2.5 : (statsTotal > 400 ? 1.5 : 1.0);
        
        // Bonus pour Pokémon déjà raffiné
        const refinementMult = 1.0 + ((pokemon.refinementLevel || 1) - 1) * 0.2;
        
        return Math.floor(baseXP * rarityMult * refinementMult);
    }

    /**
     * Calcule le nombre d'exemplaires REQUIS pour passer au GRADE suivant
     * @param {number} currentGrade - Grade actuel
     * @returns {number} Nombre d'exemplaires identiques requis
     */
    function getRequiredCopies(currentGrade) {
        if (currentGrade < 1) return 1;
        
        // 1 clone pour les premiers grades, puis 2, etc.
        return Math.floor((currentGrade - 1) / 2) + 1; 
    }

    /**
     * Calcule le nombre d'exemplaires requis pour obtenir une étoile
     * @param {number} currentStars - Nombre d'étoiles actuel
     * @returns {number} Nombre d'exemplaires requis (toujours 5)
     */
    function getRequiredCopiesForStar(currentStars) {
        // 5 doublons pour la 1re étoile, puis un de plus toutes les 2 étoiles
        return 5 + Math.floor(Math.max(0, currentStars) / 2);
    }

    /**
     * Calcule le coût en argent pour raffiner
     * NOUVEAU: Coût pour TOUS les niveaux (pas seulement après 20)
     * @param {string} type - Type d'objet ('pokemon', 'item', 'iv', 'ev', 'move')
     * @param {number} currentLevel - Niveau actuel
     * @param {number} currentStars - Étoiles actuelles
     * @returns {number} Coût en argent
     */
    // Hausse des prix avec les étoiles déjà obtenues
    function escalation(stars) {
        return Math.pow(1.35, stars || 0);
    }
    // Objets de déblocage des paliers : rien pour les étoiles 1 et 2, puis de plus en plus rares
    const STAR_KEYS = [
        { from: 3, to: 5, item: 'star-piece' },
        { from: 6, to: 9, item: 'comet-shard' },
        { from: 10, to: Infinity, item: 'relic-crown' },
    ];
    function getStarKey(nextStar) {
        const tier = STAR_KEYS.find(t => nextStar >= t.from && nextStar <= t.to);
        return tier ? { item: tier.item, count: nextStar - tier.from + 1 } : null;
    }

    function getMoneyCost(type, currentLevel, currentStars) {
        // Pour les Pokémon (Grade), le coût en argent est remplacé par du "Food" (XP sacrifice)
        if (type === 'pokemon') return 0;

        const baseValue = BASE_COSTS[type] || BASE_COSTS.item;
        // Chaque étoile rend la suite 35 % plus chère (courbe exponentielle)
        const starMultiplier = escalation(currentStars);
        // Le coût grimpe un peu plus vite que linéairement : la course au grinding ne s'arrête jamais
        return Math.floor(baseValue * currentLevel * starMultiplier * (1 + currentLevel / 100));
    }

    /**
     * Calcule les ressources nécessaires pour raffiner
     * @param {string} type - Type de raffinement
     * @param {number} currentLevel - Niveau actuel
     * @param {number} currentStars - Étoiles actuelles
     * @param {Object} context - { statValue, isRefinementPhase }
     * @returns {Object} Ressources nécessaires
     */
    function getRefinementCost(type, currentLevel, currentStars, context = {}) {
        const requiredCopies = type === 'move' ? 0 : getRequiredCopies(currentLevel);
        const moneyCost = getMoneyCost(type, currentLevel, currentStars);
        
        const cost = {
            money: moneyCost,
            copies: requiredCopies
        };
        
        // Coûts spécifiques selon le type
        switch(type) {
            case 'pokemon':
                // Grade: Coût en argent remplacé par nourriture (Pokémon)
                // On demande autant de nourriture que d'exemplaires ?
                // Si Grade 1 -> 2, on demande 1 clone + 500 XP de food?
                // Grades de 10 niveaux : des exemplaires un grade sur deux (au passage des niveaux 20, 40, 60, 80)
                cost.money = 0;
                const g = currentLevel || 1;
                cost.copies = g % 2 === 0 ? Math.floor((g / 2 - 1) / 2) + 1 : 0;
                cost.foodXP = Math.ceil(g / 2) * 500;
                break;
                
            case 'iv':
                // IVs: 
                // Phase 1: Train (0-31) -> Ailes
                // Phase 2: Refine (Max Level 200) -> Argent + Capsules d'Or tous les 20
                if (context.statValue < 31) {
                    cost.wings = 1;
                    cost.money = 500;
                    cost.copies = 0;
                } else {
                    cost.money = 1000 + (currentLevel * 100);
                    cost.copies = 0;
                    // Capsule d'Or tous les 20 niveaux de raffinement
                    if (currentLevel > 0 && currentLevel % 20 === 0) {
                        const milestone = currentLevel / 20;
                        cost.goldBottleCaps = (milestone * 2) - 1; // 1 pour 20, 3 pour 40...
                    }
                }
                break;
                
            case 'ev':
                // EVs: 
                // Phase 1: Train (0-250) -> Vitamines
                // Phase 2: Refine (Max Level 200) -> Argent + Capsules d'Or tous les 20
                if (context.statValue < 250) {
                    cost.vitamins = 1;
                    cost.money = 1000;
                    cost.copies = 0;
                } else {
                    cost.money = 1500 + (currentLevel * 150);
                    cost.copies = 0;
                    if (currentLevel > 0 && currentLevel % 20 === 0) {
                        const milestone = currentLevel / 20;
                        cost.goldBottleCaps = (milestone * 2) - 1;
                    }
                }
                break;
                
            case 'move':
                cost.copies = 0;
                break;
                
            case 'item':
                cost.foodItems = requiredCopies;
                break;
        }
        
        return cost;
    }

    /**
     * Calcule les ressources nécessaires pour ajouter une étoile
     * @param {string} type - Type de raffinement
     * @param {number} currentLevel - Niveau actuel
     * @param {number} currentStars - Étoiles actuelles
     * @returns {Object} Ressources nécessaires
     */
    function getStarCost(type, currentLevel, currentStars) {
        // Les attaques passent leurs étoiles avec de l'argent seulement
        const requiredCopies = type === 'move' ? 0 : getRequiredCopiesForStar(currentStars);
        const moneyCost = getMoneyCost(type, currentLevel, currentStars) * (type === 'move' ? 3 : 1);
        
        return {
            money: moneyCost,
            copies: requiredCopies
        };
    }

    /**
     * Calcule le nombre de slots d'objets disponibles
     * @param {number} level - Niveau de raffinement
     * @param {number} stars - Nombre d'étoiles
     * @returns {number} Nombre de slots (1-3)
     */
    function getItemSlots(level, stars) {
        const slots = 1 + Math.floor(level / 100) + stars;
        return Math.min(3, slots); // Cap à 3 slots
    }

    /**
     * Calcule le nombre de slots de baies disponibles
     * @param {number} level - Niveau de raffinement
     * @param {number} stars - Nombre d'étoiles
     * @returns {number} Nombre de slots (1-3)
     */
    function getBerrySlots(level, stars) {
        const slots = 1 + Math.floor(level / 100) + stars;
        return Math.min(3, slots); // Cap à 3 slots
    }

    /**
     * Vérifie si un objet peut être raffiné
     * @param {Object} item - Objet à vérifier
     * @returns {boolean} True si l'objet peut être raffiné
     */
    function isRefinable(item) {
        if (!item) return false;
        
        // Vérifier si c'est un objet exclu
        if (item.id && EXCLUDED_ITEMS.includes(item.id)) return false;
        if (item.category && EXCLUDED_CATEGORIES.includes(item.category)) return false;
        
        // L'Atelier n'améliore que les objets tenus et les baies ;
        // les capacités (CT comprises) progressent sur chaque Pokémon
        return item.pocket === 'berries' || item.pocket === 'battle';
    }

    /**
     * Vérifie si un raffinement de niveau est possible
     * @param {Object} refinable - Objet avec propriétés de raffinement
     * @param {number} availableCopies - Nombre d'exemplaires disponibles
     * @param {number} availableMoney - Argent disponible
     * @param {string} type - Type d'objet
     * @returns {Object} { possible: boolean, reason: string, cost: Object }
     */
    function canRefineLevelUp(refinable, availableCopies, availableMoney, type = 'item') {
        const currentLevel = levelOf(refinable);
        const currentStars = starsOf(refinable);
        
        // Vérifier le niveau max selon les étoiles
        const maxLevel = getMaxRefineLevel(currentStars);
        if (currentLevel >= maxLevel) {
            return { 
                possible: false, 
                reason: `Niveau maximum atteint (${maxLevel}). Ajoutez une étoile pour débloquer +20 niveaux.`,
                cost: null
            };
        }
        
        const requiredCopies = type === 'move' ? 0 : getRequiredCopies(currentLevel);
        const moneyCost = getMoneyCost(type, currentLevel, currentStars);
        
        if (availableCopies < requiredCopies) {
            return {
                possible: false,
                reason: `${requiredCopies} exemplaire(s) requis`,
                cost: { copies: requiredCopies, money: moneyCost }
            };
        }
        
        if (availableMoney < moneyCost) {
            return {
                possible: false,
                reason: `${moneyCost} $ requis`,
                cost: { copies: requiredCopies, money: moneyCost }
            };
        }
        
        return {
            possible: true,
            reason: 'OK',
            cost: { copies: requiredCopies, money: moneyCost }
        };
    }

    /**
     * Vérifie si un raffinement d'étoile est possible
     * @param {Object} refinable - Objet avec propriétés de raffinement
     * @param {number} availableCopies - Nombre d'exemplaires disponibles
     * @param {number} availableMoney - Argent disponible
     * @param {string} type - Type d'objet
     * @returns {Object} { possible: boolean, reason: string, cost: Object }
     */
    function canRefineAddStar(refinable, availableCopies, availableMoney, type = 'item') {
        const currentLevel = levelOf(refinable);
        const currentStars = starsOf(refinable);
        
        // Vérifier que le niveau max actuel est atteint
        const maxLevel = getMaxRefineLevel(currentStars);
        if (currentLevel < maxLevel) {
            return {
                possible: false,
                reason: `Niveau ${maxLevel} requis pour ajouter une étoile`,
                cost: null
            };
        }
        
        if (currentStars >= MAX_STARS) {
            return {
                possible: false,
                reason: 'Maximum d\'étoiles atteint',
                cost: null
            };
        }
        
        // Les attaques passent leurs étoiles avec de l'argent seulement
        const requiredCopies = type === 'move' ? 0 : getRequiredCopiesForStar(currentStars);
        const moneyCost = getMoneyCost(type, currentLevel, currentStars) * (type === 'move' ? 3 : 1);
        
        if (availableCopies < requiredCopies) {
            return {
                possible: false,
                reason: `${requiredCopies} exemplaires requis`,
                cost: { copies: requiredCopies, money: moneyCost }
            };
        }
        
        if (availableMoney < moneyCost) {
            return {
                possible: false,
                reason: `${moneyCost} $ requis`,
                cost: { copies: requiredCopies, money: moneyCost }
            };
        }
        
        return {
            possible: true,
            reason: 'OK',
            cost: { copies: requiredCopies, money: moneyCost }
        };
    }

    /**
     * Applique un raffinement de niveau
     * @param {Object} refinable - Objet à raffiner
     * @returns {Object} Objet raffiné
     */
    function applyLevelUp(refinable) {
        const next = levelOf(refinable) + 1;
        if (usesShortKeys(refinable)) { refinable.level = next; delete refinable.refinementLevel; }
        else refinable.refinementLevel = next;
        return refinable;
    }

    /**
     * Applique un raffinement d'étoile
     * @param {Object} refinable - Objet à raffiner
     * @returns {Object} Objet raffiné
     */
    function applyAddStar(refinable) {
        const next = starsOf(refinable) + 1;
        if (usesShortKeys(refinable)) { refinable.stars = next; delete refinable.refinementStars; }
        else refinable.refinementStars = next;
        return refinable;
    }

    /**
     * Formate l'affichage du raffinement
     * @param {number} level - Niveau de raffinement
     * @param {number} stars - Nombre d'étoiles
     * @returns {string} Texte formaté (ex: "Niveau 45 ★★★")
     */
    function formatDisplay(level, stars) {
        let display = `Niveau ${level}`;
        if (stars > 0) {
            display += ' ' + '★'.repeat(stars);
        }
        return display;
    }

    /**
     * Initialise les propriétés de raffinement sur un objet
     * @param {Object} obj - Objet à initialiser
     * @returns {Object} Objet avec propriétés de raffinement
     */
    function initializeRefinement(obj) {
        if (!obj.refinementLevel) obj.refinementLevel = 1;
        if (!obj.refinementStars) obj.refinementStars = 0;
        return obj;
    }

    // Deux formats coexistent : { refinementLevel, refinementStars } pour les Pokémon,
    // { level, stars } pour les objets et les attaques
    function levelOf(r) { return Math.max(r.refinementLevel || 0, r.level || 0, 1); }
    function starsOf(r) { return Math.max(r.refinementStars || 0, r.stars || 0, 0); }
    function usesShortKeys(r) { return 'level' in r || 'stars' in r; }

    // API publique
    return {
        // Constantes
        MAX_LEVEL,
        MAX_STARS,
        
        // Fonctions de calcul
        getMultiplier,
        levelOf,
        starsOf,
        getMaxLevel,
        LEVELS_PER_TIER,
        GRADE_CAP,
        tierGate,
        getMaxRefineLevel,
        getMaxLevelByGrade,
        getFoodXP,
        getRequiredCopies,
        getRequiredCopiesForStar,
        getMoneyCost,
        getRefinementCost,
        getStarCost,
        getItemSlots,
        escalation,
        getStarKey,
        STAR_KEYS,
        getBerrySlots,
        
        // Validation
        isRefinable,
        canRefineLevelUp,
        canRefineAddStar,
        
        // Application
        applyLevelUp,
        applyAddStar,
        
        // Utilitaires
        formatDisplay,
        initializeRefinement
    };
})();

// Export pour Node.js (si nécessaire)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Refinement;
}
