/**
 * progression.js - Système d'évolution, Fusion et Incubation
 */

const ProgressionManager = {
    CONFIG: {
        MAX_LEVEL_BASE: 20,
        LEVELS_PER_GRADE: 10,
        EGG_HATCH_TIME: 3600000, // 1 heure par défaut en millisecondes
        ACCELERATION_COST_PER_MINUTE: 10, // Coût en PokéDollars pour sauter 1 min
        FOCUS_MULTIPLIER: 10, // Multiplicateur de chance pour le focus
        FOCUS_COST: 500, // Coût pour activer le focus sur un oeuf
        LEVEL_UP_COST_PER_LVL: 100 // Coût pour 1 niveau = level * ce montant
    },

    /**
     * SYSTÈME DE FUSION (MONTER EN GRADE)
     * Pour monter d'une étoile, il faut sacrifier (Grade Actuel + 1) doublons
     */
    fuse(mainPokeInstanceId, materialInstanceIds) {
        const data = GameData._load();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        const mainPoke = data.pokemons.find(p => p.instanceId === mainPokeInstanceId);
        if (!mainPoke) return { success: false, reason: "Pokémon principal non trouvé." };

        const currentGrade = mainPoke.grade || 0;
        const requiredCount = currentGrade + 1;

        if (materialInstanceIds.length < requiredCount) {
            return { success: false, reason: `Il manque ${requiredCount - materialInstanceIds.length} doublons.` };
        }

        // Suppression des doublons
        data.pokemons = data.pokemons.filter(p => !materialInstanceIds.includes(p.instanceId));

        // Montée en Grade (on doit retrouver le pokémon principal dans la nouvelle liste)
        const updatedMainPoke = data.pokemons.find(p => p.instanceId === mainPokeInstanceId);
        if (!updatedMainPoke) return { success: false, reason: "Erreur critique lors de la fusion." };

        updatedMainPoke.grade = currentGrade + 1;
        // On augmente les étoiles de raffinement pour un boost persistant
        updatedMainPoke.refinementStars = (updatedMainPoke.refinementStars || 0) + 1;
        
        // On ne reset pas le niveau, mais on augmente le plafond
        updatedMainPoke.maxLevel = this.CONFIG.MAX_LEVEL_BASE + (updatedMainPoke.grade * this.CONFIG.LEVELS_PER_GRADE);
        
        // Recalcul complet et propre des stats avec la nouvelle formule
        updatedMainPoke.stats = GameData.calculateStats(updatedMainPoke);

        GameData._save(data);
        return { success: true, newGrade: updatedMainPoke.grade };
    },

    /**
     * SYSTÈME D'AMÉLIORATION (NIVEAU)
     * Permet d'augmenter le niveau d'un Pokémon en utilisant de l'argent.
     */
    levelUpWithMoney(pokemonInstanceId, levelsToAdd = 1) {
        const data = GameData._load();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };

        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        if (!pokemon) return { success: false, reason: "Pokémon non trouvé." };

        const maxLevel = pokemon.maxLevel || (this.CONFIG.MAX_LEVEL_BASE + ((pokemon.grade || 0) * this.CONFIG.LEVELS_PER_GRADE));
        if (pokemon.level >= maxLevel) {
            return { success: false, reason: `Niveau maximum (${maxLevel}) déjà atteint.` };
        }

        const finalLevel = Math.min(pokemon.level + levelsToAdd, maxLevel);
        const actualLevelsToAdd = finalLevel - pokemon.level;

        if (actualLevelsToAdd <= 0) {
            return { success: false, reason: "Impossible d'ajouter des niveaux." };
        }

        // Coût progressif : 100$ * niveau actuel pour chaque niveau à ajouter.
        let totalCost = 0;
        for (let i = 0; i < actualLevelsToAdd; i++) {
            totalCost += (pokemon.level + i) * this.CONFIG.LEVEL_UP_COST_PER_LVL;
        }

        if (data.money < totalCost) {
            return { success: false, reason: `Pas assez d'argent. Requis : ${totalCost} $.` };
        }

        // Appliquer les changements
        data.money -= totalCost;
        pokemon.level = finalLevel;
        
        // Recalculer les stats suite au gain de niveau
        pokemon.stats = GameData.calculateStats(pokemon);

        GameData._save(data);
        return { success: true, newLevel: pokemon.level, cost: totalCost };
    },

    /**
     * SYSTÈME D'OEUFS (INCUBATION & FOCUS)
     */
    addEggToIncubator(focusPokemonId = null) {
        const data = GameData._load();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        if (!data.inventory) data.inventory = { incubators: [] };
        if (!data.inventory.incubators) data.inventory.incubators = [];

        if (data.inventory.incubators.length >= 3) return { success: false, reason: "Incubateurs pleins" };

        const newEgg = {
            instanceId: `egg-${Date.now()}`,
            startTime: Date.now(),
            endTime: Date.now() + this.CONFIG.EGG_HATCH_TIME,
            focusId: focusPokemonId, // ID du Pokémon dont on veut booster le taux
            isReady: false
        };

        if (focusPokemonId) {
            if (data.money < this.CONFIG.FOCUS_COST) return { success: false, reason: "Pas assez d'argent pour le Focus" };
            data.money -= this.CONFIG.FOCUS_COST;
        }

        data.inventory.incubators.push(newEgg);
        GameData._save(data);
        return { success: true, egg: newEgg };
    },

    /**
     * ACCÉLÉRATION PAYANTE
     */
    speedUpHatch(eggInstanceId) {
        const data = GameData._load();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        const egg = data.inventory.incubators.find(e => e.instanceId === eggInstanceId);
        if (!egg) return { success: false, reason: "Oeuf non trouvé." };

        const remainingMs = egg.endTime - Date.now();
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        const cost = remainingMinutes * this.CONFIG.ACCELERATION_COST_PER_MINUTE;

        if (data.money >= cost) {
            data.money -= cost;
            egg.endTime = Date.now(); // Prêt immédiatement
            GameData._save(data);
            return { success: true };
        }
        return { success: false, reason: "Argent insuffisant" };
    },

    /**
     * ÉCLOSION (LOGIQUE ALÉATOIRE + FOCUS X10)
     */
    hatch(eggInstanceId) {
        const data = GameData._load();
        if (!data) return { success: false, reason: "Sauvegarde non trouvée." };
        const eggIndex = data.inventory.incubators.findIndex(e => e.instanceId === eggInstanceId);
        const egg = data.inventory.incubators[eggIndex];
        if (!egg) return { success: false, reason: "Oeuf non trouvé." };

        if (Date.now() < egg.endTime) return { success: false, reason: "L'oeuf n'est pas prêt" };

        // Logique de tirage
        const allPossibleIds = GameData.getAllAvailablePokemonIds(); 
        let finalPokemonId;

        if (egg.focusId) {
            // Création d'une table de loot pondérée
            let pool = [];
            allPossibleIds.forEach(id => {
                const weight = (id === egg.focusId) ? this.CONFIG.FOCUS_MULTIPLIER : 1;
                for (let i = 0; i < weight; i++) pool.push(id);
            });
            finalPokemonId = pool[Math.floor(Math.random() * pool.length)];
        } else {
            finalPokemonId = allPossibleIds[Math.floor(Math.random() * allPossibleIds.length)];
        }

        // Ajouter le Pokémon à la collection
        const newPoke = GameData.createInstance(finalPokemonId);
        data.pokemons.push(newPoke);

        // Retirer l'oeuf
        data.inventory.incubators.splice(eggIndex, 1);
        
        GameData._save(data);
        return { success: true, pokemon: newPoke };
    },

    /**
     * Gère la progression au combat suivant.
     */
    advanceToNextBattle() {
        const currentProgression = GameData.getProgression();
        let { zone, wave, battle } = currentProgression;

        battle += 1;
        if (battle > 10) {
            battle = 1;
            wave += 1;
        }
        if (wave > 10) {
            wave = 1;
            zone += 1;
        }

        GameData.setProgression(zone, wave, battle);
        return { zone, wave, battle };
    }
};
