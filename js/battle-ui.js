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

document.addEventListener('DOMContentLoaded', async () => {
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
            waveIndex = 1;
            battleIndex = 1;
            // On peut optionnellement vider l'override pour que la suite suive la progression normale
            // localStorage.removeItem('pokerode_current_zone');
        } else {
            zoneIndex = progression.zone;
            waveIndex = progression.wave;
            battleIndex = progression.battle;
        }

        // --- OPTIMISATION ---
        // On lance le préchargement de l'image de fond dès que possible pour
        // qu'elle soit prête lorsque l'interface l'affichera.
        const bgImage = new Image();
        bgImage.src = `../assets/zones/zone_${zoneIndex}.png`;

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
            updateHud();
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
        const topRightActions = document.getElementById('top-right-actions');
        if (topRightActions && homeButton) {
            const autoBattleBtn = document.createElement('button');
            autoBattleBtn.id = 'auto-battle-btn';
            autoBattleBtn.className = 'pk-btn-action';
            autoBattleBtn.title = 'Combat Automatique';
            autoBattleBtn.textContent = 'A';
            autoBattleBtn.addEventListener('click', async () => {
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
            topRightActions.insertBefore(autoBattleBtn, homeButton);
        }

        console.log("Interface de pré-combat prête.");
    } catch (error) {
        console.error("Erreur lors de l'initialisation de la page de combat:", error);
        alert("Une erreur est survenue lors du chargement de la page. Veuillez réessayer.");
    }
});

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
    const sprite = pokemon.sprite; // Utilise le sprite statique
    unit.innerHTML = `
        <div class="status-icons"></div>
        <div class="hp-box">
          <span class="lvl-badge">Lv.${pokemon.level}</span>
          <div class="hp-bar-bg"><div class="hp-fill" style="width: 100%;"></div></div>
          <span class="charge-text">0%</span>
        </div>
        <div class="z-move-indicator"></div>
        <div class="ap-bar"><div class="ap-fill"></div></div>
        <div class="shadow"></div>
        <img src="${sprite}" class="sprite" alt="${name}" style="--transform-base: scaleX(-1);">
    `;
    
    unit.addEventListener('dragstart', e => { 
        draggedElement = e.target.closest('.unit');
        if (draggedElement) draggedElement.classList.add('is-dragging');

        const sprite = draggedElement.querySelector('.sprite');
        
        // On ne cible que le camp joueur
        if (sprite && e.dataTransfer && draggedElement.closest('#player-grid')) {
            const ghostContainer = document.getElementById('drag-ghost');
            const ghostImg = document.getElementById('ghost-img');
            
            // On copie la source de l'image dans notre fantôme déjà inversé en CSS
            ghostImg.src = sprite.src;
            
            // On force le navigateur à utiliser ce fantôme comme image de drag
            // Le 32, 32 permet de centrer le curseur sur le sprite de 64px
            e.dataTransfer.setDragImage(ghostContainer, 32, 32);
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

function addPokemonToField(pokemon, bannerElement) {
    if (playerBoard.length >= MAX_TEAM_SIZE) {
        alert(`Vous ne pouvez pas déployer plus de ${MAX_TEAM_SIZE} Pokémon.`);
        return;
    }
    if (bannerElement.classList.contains('selected')) return;

    // Ordre Joueur : Haut-Droit(2), Milieu-Droit(5), Bas-Droit(8)...
    const placementOrder = [2, 5, 8, 1, 4, 7, 0, 3, 6];
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
        });
    });
}

function startBattle() {
    console.log("[DEBUG] startBattle() called");
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
    console.log("[DEBUG] Creating new Battle instance");
    battle = new Battle();
    console.log("[DEBUG] Calling battle.start()");
    battle.start();
}

function goToHome() {
    localStorage.removeItem('pokerode_current_zone');
    window.location.href = 'home.html';
}

function fleeBattle() {
    if (battle) {
        isRunning = false; // Stop the combat loop if it's running
        battle = null;
    }
    window.location.reload(); // The simplest way to reset the state and go back to selection
}
