// Module UI pour le système de raffinement
// Gère l'interface utilisateur pour raffiner Pokémon, IVs, EVs, Moves et Objets

const RefinementUI = (() => {
    let selectedPokemon = null;
    let selectedItem = null;
    let selectedTab = 'pokemon'; // Default
    let currentMode = 'pokemon'; // 'pokemon' or 'item' (Atelier)
    let selectedFoodIds = []; // Multi-selection pour le sacrifice XP

    /**
     * Initialise l'interface de raffinement
     */
    function init() {
        console.log('[RefinementUI] Initialisation...');
        // L'UI sera intégrée dans center.js
    }

    /**
     * @param {Object} pokemon - Pokémon à raffiner (optionnel)
     * @param {string} tab - Onglet à ouvrir (optionnel)
     */
    function open(target = null, mode = 'item') {
        try {
            currentMode = (mode === 'items') ? 'item' : mode;
            selectedFoodIds = []; // Reset selection
            
            if (currentMode === 'pokemon') {
                selectedPokemon = target;
                selectedItem = null;
                selectedTab = 'xp'; // Par défaut le niveau classique
            } else {
                selectedItem = target;
                selectedPokemon = null;
                selectedTab = 'items';
            }
            
            renderUI();
        } catch (e) {
            console.error('[RefinementUI] Error opening:', e);
            alert("Erreur lors de l'ouverture du raffinement : " + e.message);
        }
    }

    /**
     * Ferme l'interface de raffinement
     */
    function close() {
        selectedPokemon = null;
        selectedItem = null;
        const modal = document.getElementById('refinement-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Change l'onglet actif
     * @param {string} tab - Nom de l'onglet
     */
    function switchTab(tab) {
        selectedTab = tab;
        renderUI();
    }

    /**
     * Rend l'interface utilisateur
     */
    function renderUI() {
        try {
            let modal = document.getElementById('refinement-modal');
            if (!modal) {
                modal = createModal();
                document.body.appendChild(modal);
            } else if (!modal.querySelector('.refinement-content')) {
                // Conteneur vide présent dans la page : on y injecte la structure
                modal.innerHTML = createModal().innerHTML;
            }
    
            modal.style.display = 'flex';
            
            const content = modal.querySelector('.refinement-content');
            if (!content) return;
    
            // Titre contextuel
            const title = modal.querySelector('h2');
            if (title) {
                title.textContent = currentMode === 'pokemon' ? 'Entraînement' : 'Atelier';
            }

            if (currentMode === 'item' && !selectedItem) {
                 content.innerHTML = renderItemSelection();
            } else if (currentMode === 'pokemon' && !selectedPokemon) {
                 content.innerHTML = renderPokemonSelection();
            } else if (currentMode === 'item') {
                 content.innerHTML = renderItemRefinement();
            } else {
                 content.innerHTML = renderRefinementOptions();
            }
    
            attachEventListeners();
        } catch (e) {
            console.error('[RefinementUI] Error rendering:', e);
            alert("Erreur d'affichage : " + e.message);
        }
    }

    /**
     * Crée la modal de raffinement
     * @returns {HTMLElement} Modal element
     */
    function createModal() {
        const modal = document.createElement('div');
        modal.id = 'refinement-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-btn" onclick="RefinementUI.close()">&times;</span>
                <h2 style="margin-top:0;">Raffinement</h2>
                <div class="refinement-content"></div>
                ${selectedTab === 'items' && !selectedPokemon ? '<div class="refinement-footer"><button class="pk-btn back-btn" onclick="RefinementUI.switchTab(\'pokemon\')">Retour aux Pokémon</button></div>' : ''}
            </div>
        `;
        return modal;
    }

    /**
     * Rend la sélection de Pokémon
     * @returns {string} HTML
     */
    function renderPokemonSelection() {
        const data = GameData._load();
        if (!data || !data.pokemons) return '<p>Aucun Pokémon disponible.</p>';

        // Show all pokemons
        const pokemons = data.pokemons;

        return `
            <div class="pokemon-selection">
                <h3>Sélectionnez un Pokémon</h3>
                <div class="pokemon-grid">
                    ${pokemons.map(p => `
                        <div class="pokemon-card" onclick="RefinementUI.selectPokemon('${p.instanceId}')">
                            <div class="pokemon-sprite">
                                <img src="${p.sprite || Art.FALLBACK}" alt="${p.name}" onerror="this.src=Art.FALLBACK">
                            </div>
                            <div class="pokemon-info">
                                <div class="pokemon-name">${p.name}</div>
                                <div class="pokemon-level">Niv. ${p.level}</div>
                                <div class="pokemon-refinement">
                                    ${Refinement.formatDisplay(p.refinementLevel || 1, p.refinementStars || 0)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Rend les options de raffinement
     * @returns {string} HTML
     */
    function renderRefinementOptions() {
        if (!selectedPokemon) return '';

        const mult = Refinement.getMultiplier(
            selectedPokemon.refinementLevel || 1,
            selectedPokemon.refinementStars || 0
        );

        return `
            <div class="refinement-options">
                <div class="pokemon-header">
                    <img src="${selectedPokemon.sprite || Art.FALLBACK}" alt="${selectedPokemon.name}" class="pokemon-sprite-large" onerror="this.src=Art.FALLBACK">
                    <div class="pokemon-details">
                        <h3>${selectedPokemon.name}</h3>
                        <div class="refinement-display">
                            ${Refinement.formatDisplay(selectedPokemon.refinementLevel || 1, selectedPokemon.refinementStars || 0)}
                        </div>
                        <div class="multiplier">Multiplicateur: ×${mult.toFixed(2)} (${Math.floor(mult * 100)}%)</div>
                    </div>
                    </div>
                    <button class="modal-back-btn" onclick="RefinementUI.back()">${Art.icon('back', 22)}</button>
                </div>

                ${renderTabs()}

                <div class="refinement-panel">
                    ${renderTabContent()}
                </div>
            </div>
        `;
    }

    function renderTabs() {
        const tabs = [];
        if (currentMode === 'pokemon') {
            tabs.push({ id: 'xp', label: `${Art.item('macho-brace', 22)} Niveau` });
            tabs.push({ id: 'pokemon', label: `${Art.stars(1, 18)} Grade` });
            tabs.push({ id: 'iv', label: `${Art.item('bottle-cap', 22)} IVs` });
            tabs.push({ id: 'ev', label: `${Art.item('power-bracer', 22)} EVs` });
            if (GameData.isFeatureUnlocked('moves-refinement')) {
                tabs.push({ id: 'moves', label: `${Art.item('tm-normal', 22)} Attaques` });
            }
        } else {
            tabs.push({ id: 'items', label: `${Art.item('leftovers', 22)} Objets` });
            if (GameData.isFeatureUnlocked('moves-refinement')) {
                tabs.push({ id: 'tm_global', label: `${Art.item('tm-normal', 22)} CTs` });
            }
        }

        return `
            <div class="refinement-tabs">
                ${tabs.map(tab => `
                    <button class="tab-btn ${selectedTab === tab.id ? 'active' : ''}" onclick="RefinementUI.switchTab('${tab.id}')">
                        ${tab.label}
                    </button>
                `).join('')}
            </div>
        `;
    }

    /**
     * Rend le contenu de l'onglet actif
     * @returns {string} HTML
     */
    function renderTabContent() {
        switch(selectedTab) {
            case 'xp':
                return renderXPRefinement();
            case 'pokemon':
                return renderPokemonRefinement();
            case 'iv':
                return renderIVRefinement();
            case 'ev':
                return renderEVRefinement();
            case 'moves':
                return renderMovesRefinement();
            case 'items':
                return renderItemSelection();
            case 'tm_global':
                return renderTMGlobalSelection();
            default:
                return `<p>Onglet ${selectedTab} non implémenté</p>`;
        }
    }

    /**
     * Rend le raffinement du Pokémon
     * @returns {string} HTML
     */
    function renderPokemonRefinement() {
        const currentGrade = selectedPokemon.refinementLevel || 1;
        const currentStars = selectedPokemon.refinementStars || 0;
        const maxLevelForCurrentGrade = Refinement.getMaxLevel(currentGrade, currentStars);
        
        // Nous avons besoin du sprite de la forme de base pour l'affichage
        const baseFormId = GameData.getBaseFormId(selectedPokemon.id);
        const basePkData = GameData.getPokedexSubset().find(p => p.id === baseFormId);
        const baseSprite = basePkData ? basePkData.sprite : Art.FALLBACK;

        const data = GameData._load();
        const copies = data.pokemons.filter(p => 
            GameData.getBaseFormId(p.id) === baseFormId && 
            p.instanceId !== selectedPokemon.instanceId
        ).length;

        const gradeCost = Refinement.getRefinementCost('pokemon', currentGrade, currentStars);
        
        // Calcul de la nourriture actuellement sélectionnée
        const otherPokemons = data.pokemons.filter(p => p.instanceId !== selectedPokemon.instanceId);
        let currentFoodXP = 0;
        selectedFoodIds.forEach(fid => {
            const p = otherPokemons.find(p => p.instanceId === fid);
            if (p) currentFoodXP += Refinement.getFoodXP(p);
        });

        const isMaxLevelReached = selectedPokemon.level >= maxLevelForCurrentGrade;
        const hasEnoughCopies = copies >= gradeCost.copies;
        const hasEnoughFood = currentFoodXP >= gradeCost.foodXP;
        const canGradeUp = isMaxLevelReached && hasEnoughCopies && hasEnoughFood;

        const starCost = GameData.pokemonStarCost(selectedPokemon);
        const starHtml = `
                <div class="refinement-action star-action">
                    <h5>Étoile (${currentStars} → ${currentStars + 1}) : +20 % de stats et +20 niveaux max</h5>
                    <p class="small">${starCost.copies} exemplaire(s) de la même famille (${starCost.have} disponibles, hors favoris) et ${starCost.money.toLocaleString('fr-FR')} $.</p>
                    <button class="refine-btn star-btn ${starCost.ok ? '' : 'disabled'}" ${starCost.ok ? '' : 'disabled'} onclick="RefinementUI.refinePokemonStar()">Ajouter ★</button>
                </div>`;
        return `
            <div class="refinement-section">
                ${starHtml}
                <h4>Montée en Grade</h4>
                <p class="small info">Le Grade débloque le niveau maximum. (1 Grade = +20 Lv. Max)</p>
                
                <div class="current-stats">
                    <div>Grade actuel: ${currentGrade}</div>
                    <div style="flex-grow:1; text-align:right;">Niveau Max: ${maxLevelForCurrentGrade}</div>
                </div>

                <div class="refinement-action grade-action-card">
                    <h5>Prochain Grade (${currentGrade} → ${currentGrade + 1})</h5>
                    
                    <div class="requirements-grid" style="display:flex; gap:20px; margin:15px 0; justify-content:center;">
                        <div class="req-item ${hasEnoughCopies ? 'met' : 'unmet'}" style="text-align:center;">
                            <div class="req-label" style="font-size:12px; margin-bottom:5px; color:#888;">Condition 1</div>
                            <img src="${baseSprite}" style="width:50px; height:50px; background:rgba(255,255,255,0.05); border-radius:10px; padding:5px;">
                            <div style="font-weight:bold;">x${gradeCost.copies}</div>
                            <div class="small" style="color:${hasEnoughCopies ? '#4CAF50' : '#f44336'}">${copies} possédés</div>
                        </div>
                        
                        <div class="req-item ${hasEnoughFood ? 'met' : 'unmet'}" style="text-align:center;">
                            <div class="req-label" style="font-size:12px; margin-bottom:5px; color:#888;">Condition 2</div>
                            <div style="width:60px; height:60px; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.2); border-radius:50%; border:2px solid ${hasEnoughFood ? '#4CAF50' : '#333'}; font-size:10px; margin:0 auto 5px;">
                                ${currentFoodXP.toLocaleString()}<br>/${gradeCost.foodXP.toLocaleString()}
                            </div>
                            <div style="font-weight:bold;">Food XP</div>
                        </div>

                        <div class="req-item ${isMaxLevelReached ? 'met' : 'unmet'}" style="text-align:center;">
                            <div class="req-label" style="font-size:12px; margin-bottom:5px; color:#888;">Condition 3</div>
                            <div style="font-size:24px; color:${isMaxLevelReached ? '#4CAF50' : '#888'}; font-weight:bold;">L.${selectedPokemon.level}</div>
                            <div style="font-weight:bold;">Niveau</div>
                            <div class="small" style="color:${isMaxLevelReached ? '#4CAF50' : '#f44336'}">Requis: ${maxLevelForCurrentGrade}</div>
                        </div>
                    </div>

                    <div class="food-selection-area">
                        <p class="small" style="text-align:center; color:#aaa; margin-bottom:10px;">Sélectionnez la nourriture (Any Pokémon) :</p>
                        <div class="food-selection-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); gap:5px; max-height:120px; overflow-y:auto; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:15px;">
                            ${otherPokemons.map(p => {
                                const isSelected = selectedFoodIds.includes(p.instanceId);
                                return `
                                <div class="food-item ${isSelected ? 'selected' : ''}" onclick="RefinementUI.toggleFood('${p.instanceId}')" style="cursor:pointer; border:1px solid ${isSelected ? '#4CAF50' : 'transparent'}; border-radius:4px; padding:2px; position:relative;">
                                    <img src="${p.sprite || Art.FALLBACK}" style="width:100%; height:auto;">
                                    <div style="position:absolute; bottom:0; right:0; background:rgba(0,0,0,0.7); font-size:9px; padding:0 2px;">L.${p.level}</div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <button 
                        class="refine-btn ${canGradeUp ? '' : 'disabled'}" 
                        onclick="RefinementUI.refinePokemonLevel()"
                        ${!canGradeUp ? 'disabled' : ''}
                    >
                        Monter au Grade ${currentGrade + 1}
                    </button>
                </div>
            </div>
        `;
    }

    // Entraînement d'une stat (IV ou EV) : niveaux avec l'objet de la stat, palier tous les 20 niveaux (étoile)
    const STAT_LABEL = { hp: 'PV', atk: 'Attaque', def: 'Défense', spatk: 'Atq. Spé.', spdef: 'Déf. Spé.', speed: 'Vitesse' };
    function renderStatTraining(kind) {
        const data = GameData._load();
        const isIV = kind === 'iv';
        const base = (isIV ? selectedPokemon.ivs : selectedPokemon.evs) || {};
        const rows = GameData.STAT_KEYS.map(stat => {
            const t = GameData.statTrack(selectedPokemon, kind, stat);
            const max = GameData.trainingMax(t.stars);
            const cost = GameData.trainingCost(kind, stat, t);
            const have = GameData.countTrainingItem(cost.item);
            const ok = data.money >= cost.money && have >= cost.count;
            const value = Math.floor(((base[stat] || 0) + t.level * (isIV ? 1 : 10)) * (1 + 0.2 * t.stars));
            const icon = cost.item === 'feather-sample' ? Art.item('wingull-feather', 28) : Art.item(cost.item, 28);
            const itemName = cost.item === 'feather-sample' ? 'Plume d’échantillon' : (GameData.getItem(cost.item)?.name_fr || cost.item);
            return `
                <div class="train-row ${cost.star ? 'is-cap' : ''}">
                    <div class="train-stat"><b>${STAT_LABEL[stat]}</b><span>${isIV ? 'IV' : 'EV'} ${value}</span></div>
                    <div class="train-track">
                        <div class="train-level">Niv. ${t.level}/${max} ${Refinement.formatDisplay(1, t.stars).replace(/Niveau 1\s*/, '')}</div>
                        <div class="train-bar"><i style="width:${Math.min(100, (t.level - (max - 20)) / 20 * 100)}%"></i></div>
                    </div>
                    <button class="refine-btn train-btn ${ok ? '' : 'disabled'}" ${ok ? '' : 'disabled'} onclick="RefinementUI.${isIV ? 'refineIV' : 'refineEV'}('${stat}')" title="${itemName}">
                        <span class="train-cost">${icon}×${cost.count} · ${cost.money.toLocaleString('fr-FR')} $</span>
                        <span>${cost.star ? 'Palier ★' : 'Entraîner'}</span>
                    </button>
                </div>`;
        }).join('');
        return `
            <div class="refinement-section train-section">
                <h4>${isIV ? 'Entraînement des IV' : 'Entraînement des EV'}</h4>
                <p class="small info">${isIV
                    ? 'Chaque niveau : 1 plume de la stat (+1 IV). Tous les 20 niveaux, un palier : plumes d’échantillon (une étoile = +20 % sur l’IV de la stat).'
                    : 'Chaque niveau : 1 vitamine de la stat (+10 EV). Tous les 20 niveaux, un palier : mochi de la stat (une étoile = +20 % sur l’EV de la stat).'}</p>
                <div class="train-list">${rows}</div>
                <div class="small train-money">${data.money.toLocaleString('fr-FR')} $ disponibles</div>
            </div>`;
    }
    const renderIVRefinement = () => renderStatTraining('iv');
    const renderEVRefinement = () => renderStatTraining('ev');

    /**
     * Rend le raffinement des moves
     * @returns {string} HTML
     */
    function renderMovesRefinement() {
        // Les capacités équipées (ou, à défaut, les 4 dernières apprises) : attaques, tactiques et passifs
        const level = selectedPokemon.level || 1;
        const learnt = [...(selectedPokemon.moves || []).filter(m => (m.level ?? 0) <= level).map(m => m.name), ...(selectedPokemon.ctMoves || [])];
        const keys = (selectedPokemon.selectedMoves?.length ? selectedPokemon.selectedMoves : learnt.slice(-4));
        const data = GameData._load();
        const inv = data.inventory.items || {};
        const db = (typeof MovesDB !== 'undefined' && MovesDB) || {};
        const moveRefinements = selectedPokemon.moveRefinements || {};
        return `
            <div class="refinement-section">
                <h4>Entraînement des capacités</h4>
                <p class="small info">Chaque niveau : 1 PP Plus. Tous les 20 niveaux, un palier : PP Max. L'amélioration renforce les dégâts, mais aussi les boucliers, soins et régénérations de la capacité.</p>
                <div class="moves-list">
                    ${keys.map(key => {
                        const mv = db[key] || {};
                        const ref = moveRefinements[key] || { level: 1, stars: 0 };
                        const lvl = Refinement.levelOf(ref), stars = Refinement.starsOf(ref);
                        const atMax = lvl >= Refinement.getMaxRefineLevel(stars);
                        const mult = Refinement.getMultiplier(lvl, stars);
                        const cost = Refinement.getRefinementCost('move', lvl, stars);
                        const pp = atMax ? 'pp-max' : 'pp-up', ppCount = atMax ? stars + 1 : 1;
                        const ok = data.money >= cost.money && (inv[pp] || 0) >= ppCount;
                        const power = mv.rw?.kind === 'attack' ? mv.rw.power : null;
                        const kind = mv.rw?.kind === 'passive' ? 'Passif' : mv.rw?.kind === 'tactic' ? 'Tactique' : 'Attaque';
                        return `
                            <div class="move-card">
                                <div class="move-header">
                                    <span class="move-name">${mv.name_fr || key}</span>
                                    <span class="move-refinement">${Refinement.formatDisplay(lvl, stars)}</span>
                                </div>
                                <div class="move-stats">
                                    <div>${kind} · ×${mult.toFixed(2)}${power ? ` · Puissance ${Math.round(power * mult)}` : ''}</div>
                                </div>
                                <button class="refine-btn small ${ok ? '' : 'disabled'}" ${ok ? '' : 'disabled'} onclick="RefinementUI.refineMove('${key}')">
                                    ${Art.item(pp, 22)}×${ppCount} · ${cost.money.toLocaleString('fr-FR')} $ · ${atMax ? 'Palier ★' : 'Améliorer'}
                                </button>
                            </div>`;
                    }).join('') || '<p class="small">Aucune capacité équipée.</p>'}
                </div>
            </div>
        `;
    }

    /**
     * Sélectionne un Pokémon
     * @param {string} instanceId - ID de l'instance du Pokémon
     */

    /**
     * Retour à la sélection de Pokémon
     */

    /**
     * Raffine le niveau du Pokémon
     */
    function refinePokemonLevel() {
        const result = GameData.refinePokemonLevel(selectedPokemon.instanceId, selectedFoodIds);
        if (result.success) {
            selectedPokemon = result.pokemon;
            selectedFoodIds = []; // Reset food
            renderUI();
            showNotification('Grade augmenté avec succès !');
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Raffine les étoiles du Pokémon
     */
    function refinePokemonStar() {
        const result = GameData.refinePokemonStar(selectedPokemon.instanceId);
        if (result.success) {
            selectedPokemon = result.pokemon;
            renderUI();
            showNotification('Étoile ajoutée avec succès !');
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Raffine les IVs
     */
    function refineIV(stat) {
        const result = GameData.refineIV(selectedPokemon.instanceId, stat);
        if (result.success) {
            selectedPokemon = result.pokemon;
            renderUI();
            showNotification(`Stat ${stat.toUpperCase()} améliorée !`);
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Raffine les EVs
     */
    function refineEV(stat) {
        const result = GameData.refineEV(selectedPokemon.instanceId, stat);
        if (result.success) {
            selectedPokemon = result.pokemon;
            renderUI();
            showNotification(`Stat ${stat.toUpperCase()} améliorée !`);
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Sélectionne/Désélectionne un Pokémon pour la nourriture
     */

    /**
     * Raffine un move
     * @param {string} moveId - ID du move
     */
    function refineMove(moveId) {
        const result = GameData.refineMove(selectedPokemon.instanceId, moveId);
        if (result.success) {
            // Update selected pokemon with new data
            selectedPokemon = result.pokemon;
            renderUI();
            showNotification('Attaque raffinée avec succès !');
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Rend l'entraînement XP (Base Level)
     * @returns {string} HTML
     */
    function renderXPRefinement() {
        const pokemon = selectedPokemon;
        const currentGrade = pokemon.refinementLevel || 1;
        const currentStars = pokemon.refinementStars || 0;
        const maxLevel = Refinement.getMaxLevel(currentGrade, currentStars);
        
        let content = `
            <div class="refinement-section">
                <h4>Entraînement / Montée de Niveau</h4>
                <div class="current-stats">
                    <div>Niveau: ${pokemon.level} / ${maxLevel}</div>
                    <div style="flex-grow:1; margin-left:10px; height:10px; background:#444; border-radius:5px; overflow:hidden;">
                        <div style="width:${(pokemon.level / maxLevel) * 100}%; height:100%; background:#4CAF50;"></div>
                    </div>
                </div>
        `;

        if (pokemon.level >= maxLevel) {
            content += `
                <div class="info-message grade-up-notice">
                    <p>Ce Pokémon a atteint son niveau maximum pour son Grade actuel (${maxLevel}).</p>
                    <p class="small">Passez à l'onglet <strong>Grade</strong> pour monter de Grade.</p>
                    <button class="refine-btn small" onclick="RefinementUI.switchTab('pokemon')">Monter de Grade (Lv. ${maxLevel})</button>
                </div>
            `;
        } else {
             const data = GameData._load();
             
             // --- SACRIFICE DE POKÉMON (FOOD) ---
             const otherPokemons = data.pokemons.filter(p => p.instanceId !== pokemon.instanceId);
             
             let totalXP = 0;
             selectedFoodIds.forEach(fid => {
                 const food = otherPokemons.find(p => p.instanceId === fid);
                 if (food) totalXP += Refinement.getFoodXP(food);
             });
             
             const levelsGainable = Math.floor(totalXP / 500); // 1 niveau = 500 XP
             
             content += `
                <div class="refinement-action food-action-card">
                    <h5>Sacrifier des Pokémon (Food)</h5>
                    <p class="small info">Sélectionnez d'autres Pokémon pour donner de l'XP à ${pokemon.name}.</p>
                    
                    <div class="food-selection-grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr)); gap:5px; max-height:200px; overflow-y:auto; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px; margin-bottom:10px;">
                        ${otherPokemons.map(p => {
                            const isSelected = selectedFoodIds.includes(p.instanceId);
                            return `
                            <div class="food-item ${isSelected ? 'selected' : ''}" onclick="RefinementUI.toggleFood('${p.instanceId}')" style="cursor:pointer; border:2px solid ${isSelected ? '#4CAF50' : 'transparent'}; border-radius:4px; padding:2px; position:relative;">
                                <img src="${p.sprite || Art.FALLBACK}" style="width:100%; height:auto;">
                                <div style="position:absolute; bottom:0; right:0; background:rgba(0,0,0,0.7); font-size:10px; padding:0 2px;">L.${p.level}</div>
                            </div>
                            `;
                        }).join('')}
                    </div>

                    ${selectedFoodIds.length > 0 ? `
                        <div class="xp-calc" style="text-align:center; margin-bottom:10px; padding:10px; background:rgba(76, 175, 80, 0.1); border-radius:8px;">
                            <div style="font-weight:bold; color:#4CAF50;">XP Totale: ${totalXP.toLocaleString()}</div>
                            <div style="font-size:14px;">Gain estimé: +${levelsGainable} Niveaux</div>
                        </div>
                        <button class="refine-btn sacrifice-btn" onclick="RefinementUI.confirmFood()">
                            Sacrifier ${selectedFoodIds.length} Pokémon
                        </button>
                    ` : `
                        <p class="small" style="text-align:center; color:#888;">Sélectionnez des Pokémon ci-dessus</p>
                    `}
                </div>

                <div class="separator" style="margin:20px 0; text-align:center; border-bottom:1px solid #333; line-height:0.1em;"><span style="background:#222; padding:0 10px; color:#555;">OU</span></div>

                <div class="refinement-action xp-action-card">
                    <h5>Entraînement rapide (Argent)</h5>
                    <div class="xp-actions-grid" style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin: 15px 0;">
                        ${(() => {
                            const cost1 = GameData.levelUpCost(pokemon.level);
                            
                            let cost5 = 0;
                            let levels5 = 0;
                            for (let i = 0; i < 5; i++) {
                                if (pokemon.level + i < maxLevel) {
                                    cost5 += GameData.levelUpCost(pokemon.level + i);
                                    levels5++;
                                }
                            }
                            
                            let html = `<button class="refine-btn small" onclick="RefinementUI.trainXP(1)" ${data.money < cost1 ? 'disabled' : ''}>
                                +1 <br><small>${Art.item('relic-gold', 18)} ${cost1.toLocaleString()} $</small>
                            </button>`;
                            
                            if (levels5 > 1) {
                                html += `<button class="refine-btn secondary small" onclick="RefinementUI.trainXP(${levels5})" ${data.money < cost5 ? 'disabled' : ''}>
                                    +${levels5} <br><small>${Art.item('relic-gold', 18)} ${cost5.toLocaleString()} $</small>
                                </button>`;
                            }
                            return html;
                        })()}
                    </div>
                    <div class="available" style="text-align:center; font-size:12px;">Argent: ${data.money.toLocaleString()} $</div>
                </div>
             `;
        }

        content += `</div>`;
        return content;
    }

    function toggleFood(instanceId) {
        const index = selectedFoodIds.indexOf(instanceId);
        if (index === -1) {
            selectedFoodIds.push(instanceId);
        } else {
            selectedFoodIds.splice(index, 1);
        }
        renderUI();
    }

    async function confirmFood() {
        if (selectedFoodIds.length === 0) return;
        
        const confirmMessage = `Sacrifier ${selectedFoodIds.length} Pokémon pour entraîner ${selectedPokemon.name} ? Cette action est irréversible.`;
        if (!(await UI.confirm(confirmMessage, { title: 'Entraînement', okLabel: 'Sacrifier' }))) return;

        const result = GameData.feedPokemon(selectedPokemon.instanceId, selectedFoodIds);
        if (result.success) {
            selectedPokemon = result.pokemon;
            selectedFoodIds = [];
            renderUI();
            showNotification(`Entraînement terminé ! Gain de ${result.levelsGained} niveaux.`);
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Effectue l'entraînement XP
     * @param {number} amount - Nombre de niveaux
     */
    function trainXP(amount) {
        const result = GameData.levelUpPokemon(selectedPokemon.instanceId, amount);
        if (result.success) {
            selectedPokemon = result.pokemon; 
            renderUI();
            showNotification(`${selectedPokemon.name} a gagné ${amount} niveau(x) !`);
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Rend le raffinement de l'objet tenu
     */

    /**
     * Affiche une notification
     * @param {string} message - Message à afficher
     * @param {string} type - Type de notification ('success' ou 'error')
     */
    function showNotification(message, type = 'success') {
        // TODO: Implémenter un système de notifications
        alert(message);
    }

    /**
     * Rend la sélection d'objets
     * @returns {string} HTML
     */
    function renderItemSelection() {
        const data = GameData._load();
        const inventory = data.inventory.items || {};
        const items = GameData.getItems();
        
        // Collect all item IDs from inventory
        const inventoryIds = Object.keys(inventory).filter(id => inventory[id] > 0);
        
        // Collect all held item IDs from pokemons
        const heldIds = data.pokemons
            .map(p => p.heldItem)
            .filter(id => id); // Filter nulls
            
        // Generic set of unique IDs
        const uniqueIds = [...new Set([...inventoryIds, ...heldIds])];
        
        // Filter: only items that are refinable
        const refinableItems = uniqueIds.map(id => {
            const item = items[id];
            if (!item || !Refinement.isRefinable({ ...item, id })) return null;
            
            return {
                ...item,
                id,
                quantity: inventory[id] || 0,
                heldCount: heldIds.filter(h => h === id).length
            };
        }).filter(Boolean);

        if (refinableItems.length === 0) return '<div class="empty-state"><h3>Raffinement d\'Objets</h3><p>Aucun objet raffinable trouvé dans votre inventaire.</p><p class="info">Seuls certains objets (non-clés, non-évolutifs) peuvent être raffinés.</p></div>';

        return `
            <div class="pokemon-selection">
                <h3>Sélectionnez un Objet à raffiner</h3>
                <div class="pokemon-grid"> <!-- Reusing grid class for items -->
                    ${refinableItems.map(item => {
                        const ref = GameData.getGlobalItemRefinement(item.id);
                        return `
                        <div class="pokemon-card" onclick="RefinementUI.selectItem('${item.id}')">
                            <div class="pokemon-sprite">
                                <img src="${item.sprite || Art.FALLBACK}" alt="${item.name_fr}" onerror="this.onerror=null;this.src=Art.FALLBACK">
                            </div>
                            <div class="item-owned-count">${item.quantity} + ${item.heldCount} tenu(s)</div>
                            <div class="pokemon-info">
                                <div class="pokemon-name">${item.name_fr}</div>
                                <div class="pokemon-refinement">
                                    ${Refinement.formatDisplay(ref.level, ref.stars)}
                                </div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
    }

    function selectItem(itemId) {
        selectedItem = itemId;
        selectedPokemon = null; // Deselect pokemon
        renderUI();
    }

    function renderItemRefinement(targetItemId = null) {
        const itemId = targetItemId || selectedItem;
        if (!itemId) return renderItemSelection();
        
        const data = GameData._load();
        const item = GameData.getItem(itemId);
        const ref = GameData.getGlobalItemRefinement(itemId);
        const quantity = data.inventory.items[itemId] || 0;
        
        const mult = Refinement.getMultiplier(ref.level, ref.stars);
        const maxLevel = Refinement.getMaxRefineLevel(ref.stars);
        
        const levelCost = Refinement.getRefinementCost('item', ref.level, ref.stars);
        const starCost = Refinement.getStarCost('item', ref.level, ref.stars);
        
        const canLevelUp = ref.level < maxLevel && data.money >= levelCost.money && quantity >= levelCost.copies;
        const canAddStar = ref.level >= maxLevel && data.money >= starCost.money && quantity >= starCost.copies;

        return `
            <div class="refinement-options">
                 <div class="pokemon-header">
                    <img src="${item.sprite || Art.FALLBACK}" alt="${item.name_fr}" class="pokemon-sprite-large" onerror="this.onerror=null;this.src=Art.FALLBACK">
                    <div class="pokemon-details">
                        <h3>${item.name_fr}</h3>
                        <div class="refinement-display">
                            ${Refinement.formatDisplay(ref.level, ref.stars)}
                        </div>
                        <div class="multiplier">Efficacité Global: ×${mult.toFixed(2)} (${Math.floor(mult * 100)}%)</div>
                    </div>
                    <button class="back-btn" onclick="RefinementUI.back()">← Retour</button>
                </div>
                
                <div class="refinement-panel">
                    <div class="refinement-section">
                        <h4>Amélioration Global de l'Objet</h4>
                        <p class="info">Améliorer cet objet augmentera son efficacité pour TOUS les exemplaires, actuels et futurs.</p>
                        
                        <div class="current-stats">
                            <div>Niveau: ${ref.level}/${maxLevel}</div>
                            <div>Étoiles : ${Refinement.formatDisplay(ref.level, ref.stars)}</div>
                        </div>

                        <div class="refinement-action">
                            <h5>Monter de niveau (${ref.level} → ${ref.level + 1})</h5>
                            <div class="cost-display">
                                <div class="cost-item">${Art.item('relic-gold', 18)} ${levelCost.money.toLocaleString()} $</div>
                                <div class="cost-item">${Art.pokeball(18)} ${levelCost.copies} exemplaires</div>
                                <div class="available">En inventaire: ${quantity}</div>
                            </div>
                            <button 
                                class="refine-btn ${canLevelUp ? '' : 'disabled'}" 
                                onclick="RefinementUI.refineItem('${itemId}')"
                                ${!canLevelUp ? 'disabled' : ''}
                            >
                                Raffiner
                            </button>
                        </div>
                        
                         ${ref.level >= maxLevel ? `
                            <div class="refinement-action star-action">
                                <h5>Ajouter une étoile (★${ref.stars} → ★${ref.stars + 1})</h5>
                                <div class="cost-display">
                                    <div class="cost-item">${Art.item('relic-gold', 18)} ${starCost.money.toLocaleString()} $</div>
                                    <div class="cost-item">${Art.pokeball(18)} ${starCost.copies} exemplaires</div>
                                    <div class="available">En inventaire: ${quantity}</div>
                                </div>
                                <button 
                                    class="refine-btn star-btn ${canAddStar ? '' : 'disabled'}" 
                                    onclick="RefinementUI.refineItem('${itemId}')"
                                    ${!canAddStar ? 'disabled' : ''}
                                >
                                    Ajouter ★
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    function refineItem(targetItemId = null) {
        const itemId = targetItemId || selectedItem;
        const result = GameData.refineItem(itemId);
        if (result.success) {
            renderUI();
            showNotification(`${GameData.getItem(itemId)?.name_fr || itemId} amélioré !`);
        } else {
            showNotification(result.reason, 'error');
        }
    }

    /**
     * Sélectionne un Pokémon à raffiner
     * @param {string} pokemonInstanceId - ID de l'instance du Pokémon
     */
    function selectPokemon(pokemonInstanceId) {
        console.log('[RefinementUI] Selecting pokemon:', pokemonInstanceId);
        const data = GameData._load();
        const pokemon = data.pokemons.find(p => p.instanceId === pokemonInstanceId);
        
        if (pokemon) {
            selectedPokemon = pokemon;
            // Default to pokemon tab when selecting a pokemon
            if (selectedTab === 'items') selectedTab = 'pokemon';
            renderUI();
        } else {
            console.error('Pokemon not found:', pokemonInstanceId);
        }
    }

    /**
     * Retourne à la sélection
     */
     function back() {
        if (selectedPokemon) {
            selectedPokemon = null;
            selectedItem = null;
        } else if (selectedItem) {
            selectedItem = null;
        }
        renderUI();
    }

    /**
     * Attache les event listeners
     */
    function attachEventListeners() {
        // Les event listeners sont gérés via onclick dans le HTML
    }

    function renderTMGlobalSelection() {
        const data = GameData._load();
        const items = GameData.getItems();
        const inventory = data.inventory.items || {};
        
        // Filter: only TMs
        const tmsOwned = Object.keys(inventory).filter(id => id.startsWith('tm') || id.startsWith('ct')).map(id => {
            const item = items[id];
            if (!item) return null;
            return { ...item, id, quantity: inventory[id] };
        }).filter(Boolean);

        if (tmsOwned.length === 0) return '<div class="empty-state"><h3>Raffinement de CT</h3><p>Aucune CT trouvée dans votre sac.</p></div>';

        return `
            <div class="pokemon-selection">
                <h3>Sélectionnez une CT à raffiner globalement</h3>
                <div class="pokemon-grid">
                    ${tmsOwned.map(tm => {
                        const ref = GameData.getGlobalItemRefinement(tm.id);
                        return `
                        <div class="pokemon-card" onclick="RefinementUI.selectItem('${tm.id}')">
                            <div class="pokemon-sprite">
                                ${Art.disc(tm.type)}
                            </div>
                            <div class="item-owned-count">x${tm.quantity}</div>
                            <div class="pokemon-info">
                                <div class="pokemon-name">${tm.name}</div>
                                <div class="pokemon-refinement">${Refinement.formatDisplay(ref.level, ref.stars)}</div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;
    }

    function renderHeldItemRefinement() {
        return renderItemRefinement(); 
    }

    // API publique
    return {
        init,
        open,
        close,
        switchTab,
        selectPokemon,
        selectItem,
        back: () => {
             selectedPokemon = null;
             selectedItem = null;
             selectedFoodIds = [];
             renderUI();
        },
        refinePokemonLevel,
        refinePokemonStar,
        refineIV,
        refineEV,
        refineMove,
        trainXP,
        toggleFood,
        confirmFood,
        refineItem
    };
})();

// Initialiser au chargement
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        RefinementUI.init();
    });
}
