/**
 * Système de combat simplifié
 */

let allPlayerPokemons = [];
const MAX_TEAM_SIZE = 5; // Nombre maximum de Pokémon sur le terrain
let playerBoard = []; // Pokémon actuellement sur le terrain du joueur
let draggedElement = null; // Élément en cours de drag & drop
let battle = null; // Instance de la classe Battle
var isAutoBattle = false; // Variable globale pour le combat auto
// Variables globales pour la progression, pour qu'elles soient accessibles depuis battle.js
var zoneIndex, waveIndex, battleIndex;

window.initBattle = async () => {
    // Initialisation des données et de l'interface de pré-combat
    try {
        console.log("Initialisation de la page de combat...");
        const gameState = await GameData.init();
        allPlayerPokemons = gameState.data.pokemons || [];

        // Charger la progression pour déterminer le niveau des ennemis
        const progression = GameData.getProgression();
        
        // Priorité à la zone sélectionnée sur la carte, sinon progression par défaut
        const selectedZone = localStorage.getItem('pokerode_current_zone');
        if (selectedZone !== null) {
            zoneIndex = parseInt(selectedZone); 
            if (zoneIndex === progression.zone) {
                waveIndex = progression.wave;
                battleIndex = progression.battle;
            } else {
                waveIndex = 1;
                battleIndex = 1;
            }
            // On vide l'override pour que les rechargements (ex: en cas de défaite) suivent la progression en cours
            localStorage.removeItem('pokerode_current_zone');
        } else {
            zoneIndex = progression.zone;
            waveIndex = progression.wave;
            battleIndex = progression.battle;
        }

        // Retour au pré-combat : on sort de l'état « combat » laissé par la bataille précédente
        // (Rejouer, Bourg puis retour, carte) et on remet le bouton de lancement
        playerBoard = [];
        if (typeof setCombatActive === 'function') setCombatActive(false);
        const status = document.getElementById('battleStatus');
        if (status) { status.style.display = 'none'; status.className = ''; }
        if (typeof hideInfoPanel === 'function') hideInfoPanel();
        renderStartBattleButton();

        createGrids();
        renderSelectionBanner(allPlayerPokemons);
        loadLastRoadTeam();

        // Initialise les éléments DOM globaux utilisés par le système de combat
        if (typeof initGlobals === 'function') {
            initGlobals(); // Appelle updateHud qui utilise les indices de progression
            if (typeof createAmbientEffects === 'function') {
                createAmbientEffects();
            }
        }

        // Charger les données nécessaires et afficher l'équipe ennemie pour la prévisualisation
        if (typeof loadPokedexDB === 'function' && typeof loadBattleLevelsDB === 'function' && typeof prepareEnemyGridForNewBattle === 'function') {
            await Promise.all([loadPokedexDB(), loadBattleLevelsDB()]);

            // Mettre à jour l'affichage du HUD après le chargement des données
            updateBattleHud();
            prepareEnemyGridForNewBattle();
        }

        // Gérer le bouton retour/abandon en haut à droite
        const homeButton = document.getElementById('home-flee-btn');
        if (homeButton) {
            homeButton.title = "Retour à l'accueil";
            homeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
            homeButton.onclick = goToHome;
        }

        // Créer et ajouter le bouton de combat auto
        if (homeButton && !document.getElementById('auto-battle-btn')) {
            const autoBattleBtn = document.createElement('button');
            autoBattleBtn.id = 'auto-battle-btn';
            autoBattleBtn.className = 'pk-btn-action';
            autoBattleBtn.title = 'Combat Automatique';
            autoBattleBtn.innerHTML = `${Art.icon('auto', 20)}<span>Auto</span>`;
            autoBattleBtn.addEventListener('click', async () => {
                // Pas de combat auto avant d'avoir lancé le combat
                if (!document.body.classList.contains('combat-active')) return;
                isAutoBattle = !isAutoBattle;
                autoBattleBtn.classList.toggle('active', isAutoBattle);

                // Si le combat auto est activé pendant que le jeu attend une action du joueur
                if (isAutoBattle && typeof dom !== 'undefined' && typeof dom._resolveTurn === 'function' && typeof currentTurnUnit !== 'undefined' && currentTurnUnit) {
                    if (typeof choosePlayerAutoAction === 'function') {
                        await choosePlayerAutoAction(currentTurnUnit);
                        if (dom._resolveTurn) {
                            dom._resolveTurn();
                            dom._resolveTurn = null; // Empêche une double résolution
                        }
                    }
                }
            });
            homeButton.parentNode.insertBefore(autoBattleBtn, homeButton);
        }

        console.log("Interface de pré-combat prête.");
    } catch (error) {
        console.error("Erreur lors de l'initialisation de la vue de combat:", error);
    }
};

function createGrids() {
    const playerGrid = document.getElementById('player-grid');
    const enemyGrid = document.getElementById('enemy-grid');
    playerGrid.innerHTML = '';
    enemyGrid.innerHTML = '';

    for (let i = 0; i < 9; i++) {
        const playerSlot = document.createElement('div');
        playerSlot.className = 'unit-slot';
        playerGrid.appendChild(playerSlot);

        const enemySlot = document.createElement('div');
        enemySlot.className = 'unit-slot';
        enemyGrid.appendChild(enemySlot);
    }
    addSlotEventListeners();
}

function updatePokemonCounter() {
    const counter = document.getElementById('pokemon-counter');
    if (counter) {
        counter.textContent = `${playerBoard.length}/${MAX_TEAM_SIZE}`;
    }
    // Rôles, lignes et synergies se mettent à jour à chaque changement de formation
    if (typeof FormationUI !== 'undefined') setTimeout(FormationUI.refresh, 0);
}

function renderSelectionBanner(pokemons) {
    const banner = document.getElementById('selection-banner');
    banner.innerHTML = '';
    const counter = document.createElement('h4');
    counter.id = 'pokemon-counter';
    banner.appendChild(counter);
    updatePokemonCounter();

    pokemons.forEach(p => {
        const p_el = document.createElement('div');
        p_el.className = 'banner-pokemon';
        p_el.id = `banner-${p.instanceId}`; // Utiliser l'ID d'instance unique pour éviter les doublons
        p_el.dataset.instanceId = p.instanceId; // appui long : fiche du Pokémon
        const name = (typeof p.name === 'object') ? (p.name.french || p.name.en) : p.name;
        p_el.innerHTML = `<img src="${p.sprite}" alt="${name}" title="${name} Lv.${p.level}" style="transform: scaleX(-1);"><span class="banner-lvl-badge">Lv.${p.level}</span>`;
        p_el.addEventListener('click', () => addPokemonToField(p, p_el));
        banner.appendChild(p_el);
    });
}

function placePokemonOnBoard(pokemon, bannerElement, slotElement) {
    if (!pokemon || !bannerElement || !slotElement) return;

    bannerElement.classList.add('selected');
    
    const existingOnBoard = playerBoard.find(p => p === pokemon);
    if (!existingOnBoard) {
        playerBoard.push(pokemon);
    }

    const unit = document.createElement('div');
    unit.className = 'unit';
    // Utiliser les attributs data-* est plus robuste pour stocker des métadonnées.
    unit.dataset.instanceId = pokemon.instanceId;
    unit.draggable = true;
    unit.style.animationDelay = `-${(Math.random() * 5).toFixed(2)}s`; // Désynchronise l'animation
    const name = (typeof pokemon.name === 'object') ? (pokemon.name.french || pokemon.name.en) : pokemon.name;
    const sprite = pokemon.sprite; // Illustration officielle : secours si SpriteCollab n'a pas ce Pokémon
    unit.innerHTML = `
        <div class="hp-box">
            <div class="status-icons"></div>
            <div class="status-main-row">
                <span class="lvl-badge">Lv.${pokemon.level}</span>
                <div class="hp-container-minimal">
                    <div class="ap-bar"><div class="ap-fill" style="width: 0%;"></div></div>
                    <div class="hp-bar-bg"><div class="hp-fill" style="width: 100%;"></div></div>
                </div>
                <span class="charge-text">0%</span>
            </div>
        </div>
        <div class="shadow"></div>
        ${PmdSprite.markup({ dex: pokemon.id, shiny: pokemon.isShiny, fallback: sprite, alt: name, facing: 'up', height: pokemon.height })}
    `;
    PmdSprite.hydrate(unit);
    
    unit.addEventListener('dragstart', e => { 
        draggedElement = e.target.closest('.unit');
        if (draggedElement) draggedElement.classList.add('is-dragging');

        // On ne cible que le camp joueur
        if (draggedElement && e.dataTransfer && draggedElement.closest('#player-grid')) {
            const ghostContainer = document.getElementById('drag-ghost');
            const ghostImg = document.getElementById('ghost-img');
            ghostContainer.querySelector('canvas')?.remove();

            // Le fantôme reprend l'image animée en cours (vue de dos), en pixel art ;
            // à défaut, l'illustration réduite à 96 px
            const frame = draggedElement.querySelector('.pmd-sprite[data-pmd-state="ready"] .pmd-frame');
            const ghostCanvas = frame && drawFrameToCanvas(frame, 3);
            if (ghostCanvas) {
                ghostImg.style.display = 'none';
                ghostContainer.appendChild(ghostCanvas);
                e.dataTransfer.setDragImage(ghostContainer, ghostCanvas.width / 2, ghostCanvas.height / 2);
            } else {
                ghostImg.style.display = '';
                ghostImg.src = sprite;
                e.dataTransfer.setDragImage(ghostContainer, 48, 48);
            }
        }
    });

    unit.addEventListener('dragend', () => {
        if (draggedElement) {
            draggedElement.classList.remove('is-dragging');
        }
    });

    unit.addEventListener('click', () => {
        if (document.body.classList.contains('combat-active')) return;
        const index = playerBoard.findIndex(p => p === pokemon);
        if (index > -1) {
            playerBoard.splice(index, 1);
            unit.remove();
            bannerElement.classList.remove('selected');
            updatePokemonCounter();
        }
    });
    
    slotElement.appendChild(unit);
    updatePokemonCounter();
}

// Copie la frame PMD affichée dans un canvas agrandi sans lissage (image de glisser-déposer)
function drawFrameToCanvas(frameEl, scale) {
    const cs = getComputedStyle(frameEl);
    const url = (cs.backgroundImage.match(/url\(["']?(.*?)["']?\)/) || [])[1];
    const w = frameEl.offsetWidth, h = frameEl.offsetHeight;
    if (!url || !w || !h) return null;
    const img = new Image();
    img.src = url; // déjà en cache : la planche est affichée
    if (!img.complete || !img.naturalWidth) return null;
    const [bx, by] = cs.backgroundPosition.split(' ').map(v => parseFloat(v) || 0);
    // Planche lissée en xBR : déjà agrandie (--pmd-hd), on la réduit d'autant en la lissant
    const hd = frameEl.classList.contains('pmd-hd') ? (parseFloat(cs.getPropertyValue('--pmd-hd')) || 1) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale / hd); canvas.height = Math.round(h * scale / hd);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = hd > 1;
    ctx.drawImage(img, -bx, -by, w, h, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function addPokemonToField(pokemon, bannerElement) {
    if (playerBoard.length >= MAX_TEAM_SIZE) {
        alert(`Vous ne pouvez pas déployer plus de ${MAX_TEAM_SIZE} Pokémon.`);
        return;
    }
    if (bannerElement.classList.contains('selected')) return;

    // Ligne avant d'abord (rangée du haut de la grille du joueur), du centre vers les bords
    const placementOrder = [0, 1, 2].flatMap(depth => [1, 0, 2].map(lane => BattleRules.indexAt('player', depth, lane)));
    const allSlots = document.querySelectorAll('#player-grid .unit-slot');
    let firstEmptySlot = null;

    for (const slotIndex of placementOrder) {
        const slot = allSlots[slotIndex];
        if (slot && !slot.querySelector('.unit')) {
            firstEmptySlot = slot;
            break;
        }
    }

    if (!firstEmptySlot) {
        alert("Le terrain est plein ! Déplacez un Pokémon pour libérer une place.");
        return;
    }

    placePokemonOnBoard(pokemon, bannerElement, firstEmptySlot);
}

function loadLastRoadTeam() {
    const lastTeam = GameData.getLastRoadTeam();
    if (!lastTeam || lastTeam.length === 0) return;

    const playerSlots = document.querySelectorAll('#player-grid .unit-slot');

    lastTeam.forEach(teamMember => {
        // Gère les anciennes sauvegardes avec 'id' et les nouvelles avec 'instanceId'
        const pokemon = allPlayerPokemons.find(p => 
            (teamMember.instanceId && p.instanceId === teamMember.instanceId) ||
            (!teamMember.instanceId && p.id === teamMember.id)
        );
        if (!pokemon) return;
        const bannerElement = document.getElementById(`banner-${pokemon.instanceId}`); // Utiliser l'ID d'instance pour trouver le bon banner
        
        if (pokemon && bannerElement && !bannerElement.classList.contains('selected')) {
            const targetSlot = playerSlots[teamMember.slot];
            if (targetSlot) {
                placePokemonOnBoard(pokemon, bannerElement, targetSlot);
            }
        }
    });
}

function addSlotEventListeners() {
    document.querySelectorAll('#player-grid .unit-slot').forEach(slot => {
        slot.addEventListener('dragover', e => e.preventDefault());
        slot.addEventListener('dragenter', e => e.target.closest('.unit-slot').classList.add('drag-over'));
        slot.addEventListener('dragleave', e => e.target.closest('.unit-slot').classList.remove('drag-over'));
        slot.addEventListener('drop', e => {
            e.preventDefault();
            const targetSlot = e.target.closest('.unit-slot');
            targetSlot.classList.remove('drag-over');
            if (draggedElement && targetSlot) {
                const existingUnit = targetSlot.querySelector('.unit');
                if (existingUnit) { // Swap
                    draggedElement.parentNode.appendChild(existingUnit);
                }
                targetSlot.appendChild(draggedElement);
            }
            draggedElement = null;
            FormationUI.refresh();
        });
    });
}

// (Re)crée le bouton « Démarrer le combat » : la fin d'un combat vide #side-actions
function renderStartBattleButton() {
    const sideActions = document.getElementById('side-actions');
    if (!sideActions || document.getElementById('start-battle-btn')) return;
    sideActions.innerHTML = `<button class="pk-btn-action" id="start-battle-btn" onclick="startBattle()">${Art.icon('play', 26)}<span>Démarrer le combat</span></button>`;
}

function startBattle() {
    debugLog("[DEBUG] startBattle() called");
    if(playerBoard.length === 0) {
        alert("Vous devez placer au moins un Pokémon sur le terrain.");
        return;
    }

    const teamToSave = [];
    document.querySelectorAll('#player-grid .unit-slot').forEach((slot, index) => {
        const unit = slot.querySelector('.unit');
        if (unit) {
            const instanceId = unit.dataset.instanceId;
            const pokemon = playerBoard.find(p => p.instanceId === instanceId);
            if (pokemon) {
                teamToSave.push({ instanceId: pokemon.instanceId, slot: index });
            }
        }
    });
    GameData.setLastRoadTeam(teamToSave);

    // On lance le combat !
    debugLog("[DEBUG] Creating new Battle instance");
    window.isRunning = false; // Reset de sécurité avant nouvelle instance
    battle = new Battle();
    debugLog("[DEBUG] Calling battle.start()");
    battle.start();
}

// Quitte l'écran de combat pour la carte de la zone (js/zonemap.js), ou le bourg à défaut.
// Après une victoire, la progression avance d'abord pour que le prochain départ reprenne au combat suivant
// (après le boss de la zone, c'est la carte de la zone suivante qui s'ouvre).
function leaveBattleToHome(afterVictory = false) {
    window.isRunning = false;
    if (afterVictory) {
        battleIndex += 1;
        if (battleIndex > 10) { battleIndex = 1; waveIndex += 1; }
        if (waveIndex > 10) { waveIndex = 1; zoneIndex += 1; }
        GameData.setProgression(zoneIndex, waveIndex, battleIndex);
    }
    const status = document.getElementById('battleStatus');
    if (status) { status.style.display = 'none'; status.className = ''; }
    if (typeof setCombatActive === 'function') setCombatActive(false);
    if (typeof openZone === 'function') openZone(zoneIndex); else goToHome();
}

function fleeBattle() {
    if (battle) {
        isRunning = false; // Stop the combat loop if it's running
        battle = null;
    }
    ViewManager.show('battle'); // Reload the battle view via ViewManager
}
