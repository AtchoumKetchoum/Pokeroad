// Module de raffinement universel
// Permet d'améliorer Pokémon, objets, IV/EV et CT au-delà de leurs limites normales

const Refinement = (() => {
    // Constantes
    const MAX_LEVEL = 100;
    const MAX_STARS = 5;
    
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
        level = Math.max(1, Math.min(200, level));
        stars = Math.max(0, Math.min(MAX_STARS, stars));
        
        // Niveau: 100% à 200% (1.0 à 2.0) pour niveau 1-100
        const levelMultiplier = 1.0 + ((level - 1) / 100);
        
        // Étoiles: +20% par étoile (0.2 par étoile)
        const starMultiplier = 1.0 + (stars * 0.2);
        
        // Multiplicateur total (linéaire)
        // Niveau 1 ★0: 1.0 + 1.0 - 1.0 = 1.0 (100%)
        // Niveau 100 ★0: 2.0 + 1.0 - 1.0 = 2.0 (200%)
        // Niveau 100 ★5: 2.0 + 2.0 - 1.0 = 3.0 (300%)
        // Niveau 200 ★5: 3.0 + 2.0 - 1.0 = 4.0 (400%) mais limité à 300%
        const total = levelMultiplier + starMultiplier - 1.0;
        
        // Cap à 300% (3.0)
        return Math.min(3.0, total);
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
    function getMaxLevel(grade, stars) {
        grade = Math.max(1, grade || 1);
        stars = Math.max(0, stars || 0);
        
        // Base: Grade * 20
        // Etoiles débloquent au-delà de 100
        if (stars > 0) {
            return 100 + (stars * 20);
        }
        return grade * 20;
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
        if (currentGrade >= 10) return 0; // Max
        
        // 1 clone pour les premiers grades, puis 2, etc.
        return Math.floor((currentGrade - 1) / 2) + 1; 
    }

    /**
     * Calcule le nombre d'exemplaires requis pour obtenir une étoile
     * @param {number} currentStars - Nombre d'étoiles actuel
     * @returns {number} Nombre d'exemplaires requis (toujours 5)
     */
    function getRequiredCopiesForStar(currentStars) {
        if (currentStars >= MAX_STARS) return 0;
        return 5;
    }

    /**
     * Calcule le coût en argent pour raffiner
     * NOUVEAU: Coût pour TOUS les niveaux (pas seulement après 20)
     * @param {string} type - Type d'objet ('pokemon', 'item', 'iv', 'ev', 'move')
     * @param {number} currentLevel - Niveau actuel
     * @param {number} currentStars - Étoiles actuelles
     * @returns {number} Coût en argent
     */
    function getMoneyCost(type, currentLevel, currentStars) {
        // Pour les Pokémon (Grade), le coût en argent est remplacé par du "Food" (XP sacrifice)
        if (type === 'pokemon') return 0;

        const baseValue = BASE_COSTS[type] || BASE_COSTS.item;
        // Formule: baseValue × currentLevel × (1 + stars × 0.5)
        const starMultiplier = 1 + (currentStars * 0.5);
        
        return Math.floor(baseValue * currentLevel * starMultiplier);
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
        const requiredCopies = getRequiredCopies(currentLevel);
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
                cost.money = 0;
                cost.foodXP = (currentLevel || 1) * 1000; 
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
        const requiredCopies = getRequiredCopiesForStar(currentStars);
        const moneyCost = getMoneyCost(type, currentLevel, currentStars);
        
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
        
        // Les objets clés ne sont pas raffinables
        if (item.pocket === 'key-items' || item.pocket === 'key') return false;
        
        return true;
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
        const currentLevel = refinable.refinementLevel || 1;
        const currentStars = refinable.refinementStars || 0;
        
        // Vérifier le niveau max selon les étoiles
        const maxLevel = getMaxLevel(currentStars);
        if (currentLevel >= maxLevel) {
            return { 
                possible: false, 
                reason: `Niveau maximum atteint (${maxLevel}). Ajoutez une étoile pour débloquer +20 niveaux.`,
                cost: null
            };
        }
        
        const requiredCopies = getRequiredCopies(currentLevel);
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
        const currentLevel = refinable.refinementLevel || 1;
        const currentStars = refinable.refinementStars || 0;
        
        // Vérifier que le niveau max actuel est atteint
        const maxLevel = getMaxLevel(currentStars);
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
        
        const requiredCopies = getRequiredCopiesForStar(currentStars);
        const moneyCost = getMoneyCost(type, currentLevel, currentStars);
        
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
        const currentLevel = refinable.refinementLevel || 1;
        
        if (currentLevel >= MAX_LEVEL) {
            console.warn('[Refinement] Niveau maximum déjà atteint');
            return refinable;
        }
        
        refinable.refinementLevel = currentLevel + 1;
        return refinable;
    }

    /**
     * Applique un raffinement d'étoile
     * @param {Object} refinable - Objet à raffiner
     * @returns {Object} Objet raffiné
     */
    function applyAddStar(refinable) {
        const currentStars = refinable.refinementStars || 0;
        
        if (currentStars >= MAX_STARS) {
            console.warn('[Refinement] Maximum d\'étoiles déjà atteint');
            return refinable;
        }
        
        refinable.refinementStars = currentStars + 1;
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

    // API publique
    return {
        // Constantes
        MAX_LEVEL: 200, // Mis à jour pour supporter jusqu'à 200
        MAX_STARS,
        
        // Fonctions de calcul
        getMultiplier,
        getMaxLevel,
        getMaxLevelByGrade,
        getFoodXP,
        getRequiredCopies,
        getRequiredCopiesForStar,
        getMoneyCost,
        getRefinementCost,
        getStarCost,
        getItemSlots,
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
