// On utilise window.isRunning pour assurer une visibilité totale entre tous les fichiers
window.isRunning = false; 
window.globalTurnCount = 0;
window.currentTurnUnit = null; 
window.isAutoBattle = false;

let dom = {
  battleStatus: null,
  movesRow: null,
  infoDisplayPanel: null, // Renommé pour le nouveau panneau d'infos
  targetPrompt: null,
  zMovePanel: null, // Nouveau pour les boutons Z-Move
  player: {},
  enemy: {},
};

let grid = {
  player: new Array(9).fill(null),
  enemy: new Array(9).fill(null),
};

let MovesDB = null;
async function loadMovesDB() {
  if (MovesDB) return MovesDB;
  try {
    const [statusRes, specialRes, physicalRes] = await Promise.all([
      fetch('../data/status_moves.json'),
      fetch('../data/special_moves.json'),
      fetch('../data/physical_moves.json')
    ]);

    const statusMoves = await statusRes.json();
    const specialMoves = await specialRes.json();
    const physicalMoves = await physicalRes.json();

    MovesDB = { ...statusMoves, ...specialMoves, ...physicalMoves };
  } catch (e) {
    console.error("Échec du chargement des fichiers de capacités, utilisation du fallback.", e);
    // Fallback minimal pour les starters
    MovesDB = {
      'tackle': { name_fr: 'Charge', power: 40, accuracy: 100, type: 'normal', damage_class: 'physical' },
      'scratch': { name_fr: 'Griffe', power: 40, accuracy: 100, type: 'normal', damage_class: 'physical' },
      'ember': { name_fr: 'Flammèche', power: 40, accuracy: 100, type: 'fire', damage_class: 'special' },
      'water-gun': { name_fr: 'Pistolet à O', power: 40, accuracy: 100, type: 'water', damage_class: 'special' },
      'vine-whip': { name_fr: 'Fouet Lianes', power: 45, accuracy: 100, type: 'grass', damage_class: 'physical' },
      'bite': { name_fr: 'Morsure', power: 60, accuracy: 100, type: 'dark', damage_class: 'physical' },
      'quick-attack': { name_fr: 'Vive-Attaque', power: 40, accuracy: 100, type: 'normal', damage_class: 'physical' },
      'growl': { name_fr: 'Rugissement', power: null, accuracy: 100, type: 'normal', damage_class: 'status' },
    };
  }
  return MovesDB;
}

let RulesDB = null;
async function loadRulesDB() {
  if (RulesDB) return RulesDB;
  try {
    const res = await fetch('../data/Rules.json');
    const rawRules = (await res.json()).game_effects;
    // Aplatir l'objet pour un accès direct par ID d'effet
    RulesDB = {};
    for (const categoryKey in rawRules) {
        Object.assign(RulesDB, rawRules[categoryKey]);
    }
  } catch (e) {
    console.error("Failed to load and flatten Rules.json", e);
    RulesDB = {}; // Fallback
  }
  return RulesDB;
}

// --- Helpers utilitaires ---
let battleSpeed = 1;
const sleep = (ms) => new Promise(res => setTimeout(res, ms / battleSpeed));

function setBattleSpeed(speed) {
  battleSpeed = speed;
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.speed) === speed);
  });
  // Si on a un moteur d'animation, on le prévient
  if (typeof BattleAnimation !== 'undefined' && BattleAnimation.setSpeed) {
    BattleAnimation.setSpeed(speed);
  }
}

function safeName(p) {
  if (!p) return '???';
  if (typeof p.name === 'object') return p.name.french || p.name.en || '???';
  return p.name || '???';
}

function firstType(p) {
  if (!p) return 'normal';
  const t = p.type || p.types;
  if (Array.isArray(t) && t.length) return (t[0] || '').toLowerCase();
  if (typeof t === 'string') return t.toLowerCase();
  return 'normal';
}

function getTypes(p) {
  if (!p) return ['normal'];
  // La structure de l'acteur doit maintenant avoir un tableau `types`
  if (Array.isArray(p.types) && p.types.length) {
    return p.types.map(t => (t || 'normal').toLowerCase());
  }
  if (typeof p.type === 'string') return [p.type.toLowerCase()];
  return ['normal'];
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function getElementCenter(el) {
    const screen = document.getElementById('game-screen');
    if (!screen || !el) return { x: 0, y: 0 };
    const screenRect = screen.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    return {
        x: elRect.left + elRect.width / 2 - screenRect.left,
        y: elRect.top + elRect.height / 2 - screenRect.top
    };
}

// Base de données des types
let TypesDB = null;
async function loadTypesDB() {
  if (TypesDB) return TypesDB;
  try {
    const res = await fetch('../data/types.json');
    TypesDB = await res.json();
  } catch (e) {
    console.error("Failed to load types.json", e);
    TypesDB = {}; // Fallback
  }
  return TypesDB;
}

let AoeDB = null;
async function loadAoeDB() {
  if (AoeDB) return AoeDB;
  try {
    const res = await fetch('../data/aoe.json');
    AoeDB = await res.json();
  } catch (e) {
    console.error("Failed to load aoe.json", e);
    AoeDB = {}; // Fallback
  }
  return AoeDB;
}

function getAoePreviewIndexes(aoeName, primaryTargetIndex, targetSide) {
    const t = primaryTargetIndex;
    const side = targetSide;

    let indexes = [];

    switch(aoeName) {
        case 'single':
        case 'random_single': // For preview, we just highlight the hovered target.
            indexes = [t];
            break;
        case 'all':
            indexes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            break;
        case 'row': {
            const start = Math.floor(t / 3) * 3;
            indexes = [start, start + 1, start + 2];
            break;
        }
        case 'column': {
            const col = t % 3;
            indexes = [col, col + 3, col + 6];
            break;
        }
        case 'cross': {
            const adjacent = { 0:[1,3], 1:[0,2,4], 2:[1,5], 3:[0,4,6], 4:[1,3,5,7], 5:[2,4,8], 6:[3,7], 7:[6,8,4], 8:[7,5] };
            indexes = Array.from(new Set([t, ...(adjacent[t] || [])]));
            break;
        }
        case 'diagonal_x':
            if (t === 4) indexes = [0, 2, 4, 6, 8];
            else if ([0, 8].includes(t)) indexes = [0, 4, 8];
            else if ([2, 6].includes(t)) indexes = [2, 4, 6];
            else indexes = [t];
            break;
        case 'frontline':
            indexes = side === 'player' ? [2, 5, 8] : [0, 3, 6];
            break;
        case 'midline':
            indexes = [1, 4, 7];
            break;
        case 'backline':
            indexes = side === 'player' ? [0, 3, 6] : [2, 5, 8];
            break;
        case 'splash_v': {
            const s = { 0:[0,3], 3:[3,0,6], 6:[6,3], 1:[1,4], 4:[4,1,7], 7:[7,4], 2:[2,5], 5:[5,2,8], 8:[8,5] };
            indexes = s[t] || [t];
            break;
        }
        case 'line_of_2': {
            const col = t % 3;
            if (side === 'player') {
                if (col > 0) indexes = [t, t - 1];
                else indexes = [t];
            } else { // enemy
                if (col < 2) indexes = [t, t + 1];
                else indexes = [t];
            }
            break;
        }
        default:
            indexes = [t];
            break;
    }
    return indexes;
}

function getAoeTargets(aoeName, primaryTarget, targetSide) {
    const t = primaryTarget._index;
    const side = targetSide;
    const targetGrid = grid[side];

    if (!targetGrid) return [];

    let indexes = [];

    switch(aoeName) {
        case 'single':
            indexes = [t];
            break;
        case 'all':
            indexes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            break;
        case 'row': {
            const start = Math.floor(t / 3) * 3;
            indexes = [start, start + 1, start + 2];
            break;
        }
        case 'column': {
            const col = t % 3;
            indexes = [col, col + 3, col + 6];
            break;
        }
        case 'cross': {
            const adjacent = {
                0:[1,3], 1:[0,2,4], 2:[1,5], 3:[0,4,6], 4:[1,3,5,7], 5:[2,4,8], 6:[3,7], 7:[6,8,4], 8:[7,5]
            };
            indexes = Array.from(new Set([t, ...(adjacent[t] || [])]));
            break;
        }
        case 'diagonal_x':
            if (t === 4) indexes = [0, 2, 4, 6, 8];
            else if ([0, 8].includes(t)) indexes = [0, 4, 8];
            else if ([2, 6].includes(t)) indexes = [2, 4, 6];
            else indexes = [t];
            break;
        case 'frontline':
            indexes = side === 'player' ? [2, 5, 8] : [0, 3, 6];
            break;
        case 'midline':
            indexes = [1, 4, 7];
            break;
        case 'backline':
            indexes = side === 'player' ? [0, 3, 6] : [2, 5, 8];
            break;
        case 'splash_v': {
            const s = { 0:[0,3], 3:[3,0,6], 6:[6,3], 1:[1,4], 4:[4,1,7], 7:[7,4], 2:[2,5], 5:[5,2,8], 8:[8,5] };
            indexes = s[t] || [t];
            break;
        }
        case 'line_of_2': {
            const col = t % 3;
            if (side === 'player') {
                if (col > 0) indexes = [t, t - 1];
                else indexes = [t];
            } else { // enemy
                if (col < 2) indexes = [t, t + 1];
                else indexes = [t];
            }
            break;
        }
        case 'random_single': {
            const aliveTargetsIndexes = [];
            targetGrid.forEach((unit, index) => {
                if (unit && !unit.isKO) {
                    aliveTargetsIndexes.push(index);
                }
            });
            if (aliveTargetsIndexes.length > 0) {
                const randomIndex = Math.floor(Math.random() * aliveTargetsIndexes.length);
                indexes = [aliveTargetsIndexes[randomIndex]];
            }
            break;
        }
        default:
            indexes = [t];
            break;
    }
    return indexes.map(i => targetGrid[i]).filter(unit => unit && !unit.isKO);
}

function getAoePatternForDisplay(aoeName) {
    const t = 4; // Cible centrale pour la visualisation
    let indexes = [];

    // Logique simplifiée pour la visualisation, centrée sur l'index 4
    switch(aoeName) {
        case 'single':
        case 'random_single':
            indexes = [t];
            break;
        case 'all':
            indexes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            break;
        case 'row':
            indexes = [3, 4, 5]; // Ligne du milieu
            break;
        case 'column':
            indexes = [1, 4, 7]; // Colonne du milieu
            break;
        case 'cross':
            indexes = [1, 3, 4, 5, 7];
            break;
        case 'diagonal_x':
            indexes = [0, 2, 4, 6, 8];
            break;
        case 'frontline':
            indexes = [2, 5, 8]; // Perspective joueur
            break;
        case 'backline':
            indexes = [0, 3, 6]; // Perspective joueur
            break;
        case 'splash_v':
            indexes = [1, 4, 7]; // Colonne centrale
            break;
        case 'line_of_2':
            indexes = [4, 1]; // Perspective joueur depuis le centre
            break;
        default:
            indexes = [t];
            break;
    }
    
    const pattern = new Array(9).fill(false);
    indexes.forEach(i => { if (i >= 0 && i < 9) pattern[i] = true; });

    // Pivoter la grille de 90 degrés vers la droite pour l'affichage
    const rotatedPattern = new Array(9).fill(false);
    // Map de rotation horaire (vers la droite) : la nouvelle case `i` prend la valeur de l'ancienne case `sourceMap[i]`
    const sourceMap = [6, 3, 0, 7, 4, 1, 8, 5, 2];
    for (let i = 0; i < 9; i++) {
        rotatedPattern[i] = pattern[sourceMap[i]];
    }
    return rotatedPattern;
}

const AOE_NAMES_FR = {
    single: 'Cible unique',
    all: 'Tous',
    row: 'Ligne',
    column: 'Colonne',
    cross: 'Croix',
    diagonal_x: 'Diagonale',
    frontline: 'Ligne avant',
    midline: 'Ligne milieu',
    backline: 'Ligne arrière',
    splash_v: 'Éclaboussure',
    random_single: 'Aléatoire',
    line_of_2: 'Perforation'
};

// Mapping pour la compatibilité des noms de types
const typeToFrench = (type) => {
  const map = {
      normal: 'Normal', fire: 'Feu', water: 'Eau', electric: 'Électrik', grass: 'Plante',
      ice: 'Glace', fighting: 'Combat', poison: 'Poison', ground: 'Sol', flying: 'Vol',
      psychic: 'Psy', bug: 'Insecte', rock: 'Roche', ghost: 'Spectre', dragon: 'Dragon',
      steel: 'Acier', dark: 'Ténèbres', fairy: 'Fée'
  };
  return map[(type || '').toLowerCase()];
};



function spawnEffectText(target, text, type = 'info', offsetY = 0) {
    if (!target) return;

    const screen = document.getElementById('game-screen');
    if (!screen) return;

    const targetEl = getSlotEl(target._side, target._index);
    if (!targetEl) return;

    const center = getElementCenter(targetEl); // Get center of the slot

    const textEl = document.createElement('div');
    textEl.className = `effect-float-text ${type}`;
    textEl.textContent = text;

    textEl.style.left = `${center.x}px`;
    textEl.style.top = `${center.y + offsetY}px`;

    screen.appendChild(textEl);
    setTimeout(() => textEl.remove(), 1500);
}

function getSlotEl(side, index) {
  if (!dom || !Number.isInteger(index)) return null;
  const gridEl = side === 'player' ? dom.playerGrid : dom.enemyGrid;
  if (!gridEl) return null;
  const slots = gridEl.querySelectorAll('.unit-slot');
  return slots[index] || null;
}

function handleGridHover(event) {
    if (!document.body.classList.contains('combat-active')) return;

    const unitSlot = event.target.closest('.unit-slot');
    if (!unitSlot) return;

    const gridId = unitSlot.parentElement.id;
    if (!gridId) return;
    const side = gridId.includes('player') ? 'player' : 'enemy';
    
    const slots = Array.from(unitSlot.parentElement.children);
    const index = slots.indexOf(unitSlot);

    const unit = grid[side][index];
    if (unit && !unit.isKO && dom.infoDisplayPanel) { // Vérifier si le panneau existe
        showPokemonDetails(unit);
    }
}

function handleGridMouseOut(event) {
    if (!document.body.classList.contains('combat-active')) {
        hideInfoPanel();
        return;
    }

    const unitSlot = event.target.closest('.unit-slot');
    if (unitSlot) {
        showTerrainInfo();
    }
}

// --- Type Chart from types.json ---
function getTypeModifier(attackerType, defenderType) {
  if (!TypesDB) return 1.0; // Sécurité si DB non chargée

  const attFr = typeToFrench(attackerType);
  const defFr = typeToFrench(defenderType);

  if (!attFr || !defFr) return 1.0; // Type inconnu

  if (TypesDB[attFr] && typeof TypesDB[attFr][defFr] !== 'undefined') {
    return TypesDB[attFr][defFr];
  }
  
  return 1.0; // Pas de modificateur par défaut
}

const STAT_MOD_PERCENT_PER_STACK = 0.15;

function getStatMultiplier(stage) {
    const rule = RulesDB['MOD_STAT'] || { max_stacks: 6 }; // fallback à 6 cumuls max
    const clampedStage = clamp(stage, -rule.max_stacks, rule.max_stacks);
    // Assure que le multiplicateur ne descend pas en dessous d'un seuil pour éviter des dégâts nuls/négatifs.
    return Math.max(0.1, 1 + (clampedStage * STAT_MOD_PERCENT_PER_STACK));
}

const MAX_CRIT_STAGE = 3; // Maximum critical hit stages (e.g., 0, 1, 2, 3+)
function getZPower(basePower) {
    // Exemple : une base de 60 donnera environ 90
    // Une base de 100 donnera 150
    return Math.min(200, Math.ceil(basePower * 1.5 / 10) * 10);
}

// --- Dégâts (style Pokémon) ---
function computeDamage(attacker, defender, move) {
    let power = move.power || 0;
    if (move._isBoosted) {
        power = getZPower(power);
        // Si le Z-Move est une attaque de zone, on applique une réduction de 25% pour l'équilibrage.
        if (move.aoe && move.aoe !== 'single' && move.aoe !== 'random_single') {
            power = Math.floor(power * 0.75);
        }
    }
    if (power === 0 || move.damage_class === 'status') return { damage: 0, typeMod: 1.0 };

    const isPhysical = move.damage_class === 'physical';

    // --- NOUVEAU: Prise en compte des modificateurs de stats ---
    const attackerAtkMod = attacker.statMods[isPhysical ? 'ATK' : 'SPA'] || 0;
    const defenderDefMod = defender.statMods[isPhysical ? 'DEF' : 'SPD'] || 0;

    const atkMultiplier = getStatMultiplier(attackerAtkMod);
    const defMultiplier = getStatMultiplier(defenderDefMod);

    const atk = (isPhysical ? (attacker.attack || 10) : (attacker.spatk || 10)) * atkMultiplier;
    const def = (isPhysical ? (defender.defense || 10) : (defender.spdef || 10)) * defMultiplier;
    // --- FIN NOUVEAU ---

    // Application littérale de la formule de dégâts Gen 4 avec arrondi entier à chaque étape.
    let damage = Math.floor(attacker.level * 2 / 5);
    damage += 2;
    damage = Math.floor(damage * power); // power est déjà ajusté pour les Z-moves
    damage = Math.floor(damage * atk / 50);
    damage = Math.floor(damage / Math.max(1, def));

    // Mod1 (non implémenté)
    damage += 2;

    // CC & Mod2 (non implémentés)

    // Random (R)
    const randomFactor = Math.floor(Math.random() * (100 - 85 + 1)) + 85;
    damage = Math.floor(damage * randomFactor / 100);

    // STAB
    const attackerTypes = getTypes(attacker);
    const moveType = (move.type || 'normal').toLowerCase();
    const stab = attackerTypes.includes(moveType) ? 1.5 : 1.0;
    damage = Math.floor(damage * stab);

    // Type effectiveness
    const defenderTypes = getTypes(defender);
    let typeMod = 1.0;
    for (const defenderType of defenderTypes) {
        typeMod *= getTypeModifier(moveType, defenderType);
    }
    damage = Math.floor(damage * typeMod);
    
    // --- NOUVEAU: Objets tenus ---
    if (attacker.heldItem) {
        const item = attacker.heldItem;
        // Type boosters (1.2x)
        const typeBoosters = {
            'silk-scarf': 'normal', 'charcoal': 'fire', 'mystic-water': 'water',
            'miracle-seed': 'grass', 'sharp-beak': 'flying', 'poison-barb': 'poison',
            'soft-sand': 'ground', 'hard-stone': 'rock', 'magnet': 'electric',
            'never-melt-ice': 'ice', 'black-belt': 'fighting', 'dragon-fang': 'dragon',
            'spell-tag': 'ghost', 'metal-coat': 'steel', 'twisted-spoon': 'psychic',
            'silver-powder': 'bug'
        };
        if (typeBoosters[item] === moveType) {
            damage = Math.floor(damage * 1.2);
        }
        // Life Orb (1.3x)
        if (item === 'life-orb') {
            damage = Math.floor(damage * 1.3);
        }
        // Expert Belt (1.2x if super effective)
        if (item === 'expert-belt' && typeMod > 1.0) {
            damage = Math.floor(damage * 1.2);
        }
    }

    // Mod3 (non implémenté)

    if (typeMod === 0) return { damage: 0, typeMod };
    return { damage: Math.max(1, damage), typeMod };
}

function applyEffect(attacker, target, move) {
    if (!move.effect || !RulesDB) return;

    const effects = Array.isArray(move.effect) ? move.effect : [move.effect];
    
    const v_stat_count_raw = move.v_stat_count;
    let v_stat_counts;
    if (typeof v_stat_count_raw === 'string' && v_stat_count_raw.startsWith('[')) {
        try { v_stat_counts = JSON.parse(v_stat_count_raw); } catch { v_stat_counts = [0]; }
    } else {
        v_stat_counts = Array.isArray(v_stat_count_raw) ? v_stat_count_raw : [v_stat_count_raw];
    }

    effects.forEach((effectId, index) => {
        const rule = RulesDB[effectId];
        if (!rule) {
            console.warn(`Effect rule for '${effectId}' not found.`);
            return;
        }

        const effectTarget = (move.zone === 'self' || move.zone === 'ally') ? attacker : target;
        if (effectTarget.isKO) return;

        // Empêche le cumul des statuts majeurs non cumulables
        if (rule.category === 'Majeur' && !rule.cumulable) {
            if (effectTarget.activeEffects.some(e => RulesDB[e.id]?.category === 'Majeur')) {
                spawnEffectText(effectTarget, "Échoue", 'info');
                return;
            }
        }

        const v_stat_count = v_stat_counts[index] || v_stat_counts[0] || 0;
        const duration = move.duration || rule.duration || 1;

        switch (rule.category) {
            case 'Majeur':
            case 'Mineur':
                effectTarget.activeEffects.push({
                    id: effectId,
                    duration: duration,
                    source: attacker.id
                });
                spawnEffectText(effectTarget, rule.name, 'status');
                break;

            case 'V-Stat':
                const statsToModify = Array.isArray(move.effect_target_stat) ? move.effect_target_stat : [move.effect_target_stat];
                statsToModify.forEach((stat, i) => {
                    const modValue = v_stat_counts[i] !== undefined ? v_stat_counts[i] : v_stat_counts[0] || 0;
                    if (modValue === 0) return;

                    const statKey = stat.toUpperCase();
                    const currentMod = effectTarget.statMods[statKey] || 0;
                    const newMod = clamp(currentMod + modValue, -rule.max_stacks, rule.max_stacks);
                    
                    if (newMod !== currentMod) {
                        effectTarget.statMods[statKey] = newMod;
                        const changeText = modValue > 0 ? `+${statKey}` : `-${statKey}`;
                        spawnEffectText(effectTarget, changeText, modValue > 0 ? 'buff' : 'debuff');
                    }
                });
                break;
            
            case 'Action':
                if (effectId === 'HEAL_HP') {
                    const healPercent = v_stat_count || rule.effect_value_pct || 0;
                    const healAmount = Math.floor(effectTarget.maxHp * (healPercent / 100));
                    effectTarget.hp = Math.min(effectTarget.maxHp, effectTarget.hp + healAmount);
                    animateHpGrid(effectTarget._side, effectTarget._index, effectTarget.maxHp, effectTarget.hp, effectTarget.maxHp);
                    if (typeof BattleAnimation !== 'undefined' && BattleAnimation.showDamageNumber) {
                        BattleAnimation.showDamageNumber(getSlotEl(effectTarget._side, effectTarget._index), -healAmount);
                    }
                }
                // ACTION_REVIVE needs special handling, maybe outside this function.
                break;
            
            case 'Buff':
                 effectTarget.activeEffects.push({
                    id: effectId,
                    duration: duration,
                    source: attacker.id
                });
                spawnEffectText(effectTarget, rule.name, 'buff');
                break;
        }

        updateStatusIcons(effectTarget);
    });
}

// --- DOM / Initialisation ---
function cacheDom() { // Renommé pour éviter le conflit avec la version précédente
  if (dom.battleStatus) return; // déjà fait (vérifie si les éléments de base sont déjà mis en cache)
  dom.turnUnitDisplay = document.getElementById('turn-unit-display');
  dom.infoDisplayPanel = document.getElementById('infoDisplayPanel'); // Nouveau ID
  dom.hudProgress = document.getElementById('hudProgress');
  dom.battleStatus = document.getElementById('battleStatus');
  dom.movesRow = document.getElementById('movesRow');
  dom.targetPrompt = document.getElementById('targetPrompt');
  dom.playerGrid = document.getElementById('player-grid');
  dom.enemyGrid = document.getElementById('enemy-grid');
  if (dom.playerGrid) {
    dom.playerGrid.addEventListener('mouseover', handleGridHover);
    dom.playerGrid.addEventListener('mouseout', handleGridMouseOut);
  }
  if (dom.enemyGrid) {
    dom.enemyGrid.addEventListener('mouseover', handleGridHover);
    dom.enemyGrid.addEventListener('mouseout', handleGridMouseOut);
  }
  dom.turnOrderSidebar = document.getElementById('turnOrderSidebar'); // Timeline
  dom.actionPanel = document.getElementById('actionPanel'); // Cache actionPanel
  dom.zMovePanel = document.getElementById('z-move-panel'); // Nouveau panneau Z-Move
}

function initGlobals() {
  cacheDom();
  if (typeof BattleAnimation !== 'undefined') BattleAnimation.init(dom, getSlotEl, spawnEffectText);
  // showTerrainInfo(); // On l'affichera au début du combat
  try {
    ['#mainHpBar', '.globalHpBar', '#hpMain', '#topLifeBar', '.global-hp'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
    });
  } catch {}
}

function updateHud() {
  const hud = dom.hudProgress || document.getElementById('hudProgress');
  
  // Trouver dynamiquement le nom de la zone dans battle_levels.json
  let zoneDisplay = `Zone ${zoneIndex}`;
  if (BattleLevelsDB && BattleLevelsDB.length > 0) {
    const zoneEntry = BattleLevelsDB.find(entry =>
      entry.zone === zoneIndex && entry.wave === waveIndex && entry.battle === battleIndex
    );
    if (zoneEntry && zoneEntry.zoneName) {
      zoneDisplay = zoneEntry.zoneName;
    }
  }

  if (hud) {
    hud.innerHTML = `${zoneDisplay} | Vague : <span id="hudWave">${waveIndex}</span> | Combat : <span id="hudBattle">${battleIndex}</span>`;
  }

  const battleScreen = document.getElementById('scaler-view') || document.getElementById('game-screen');
  if (battleScreen) {
    const backgroundUrl = `/assets/zones/zone_${zoneIndex}.png`;
    const fallbackUrl = '../assets/zones/zone_1.png';
    const img = new Image();
    img.onload = () => {
      battleScreen.style.backgroundImage = `url('${backgroundUrl}')`;
    };
    img.onerror = () => {
      console.warn(`Zone background ${backgroundUrl} not found, using fallback`);
      battleScreen.style.backgroundImage = `url('${fallbackUrl}')`;
    };
    img.src = backgroundUrl;
  }
}

function setCombatActive(active) {
  try {
    document.body.classList.toggle('combat-active', !!active);
    // Gérer l'attribut draggable qui ne peut pas être fait en pur CSS
    document.querySelectorAll('#player-grid .unit').forEach(u => {
        u.draggable = !active;
    });

    const homeFleeButton = document.getElementById('home-flee-btn');
    if (homeFleeButton) {
        if (active) {
            // En combat : icône 'X' pour abandonner (plus de transparence)
            homeFleeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            homeFleeButton.onclick = fleeBattle;
            homeFleeButton.title = "Abandonner";
        } else {
            // Hors combat : icône 'maison' pour retourner à l'accueil (plus de transparence)
            homeFleeButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>';
            homeFleeButton.onclick = goToHome;
            homeFleeButton.title = "Retour";
        }
    }
  } catch (e) {
    console.error("Erreur lors du changement d'état de combat:", e);
  }
}

function initBattleView() {
  createAmbientEffects();
  updateHud();
  // Reset UI states
  if (dom.battleStatus) {
    dom.battleStatus.classList.remove('win', 'lose');
    dom.battleStatus.style.display = 'none';
  }
  // Supprimer les anciens boutons de fin de combat s'ils existent
  document.getElementById('end-battle-nav-win')?.remove();
  document.getElementById('end-battle-nav-lose')?.remove();
}

function createAmbientEffects() {
    const container = document.getElementById('ambient-effects');
    if (!container) return;
    container.innerHTML = ''; // Clear previous effects if any

    // Wind lines
    for (let i = 0; i < 15; i++) { // Plus de traits de vent
        const windLine = document.createElement('div');
        windLine.className = 'wind-line';
        windLine.style.top = `${10 + Math.random() * 80}%`;
        windLine.style.animationDelay = `${Math.random() * 10}s`; // Délai aléatoire
        windLine.style.animationDuration = `${8 + Math.random() * 8}s`; // Durée plus longue pour plus de lenteur
        container.appendChild(windLine);
    }

    // Fireflies
    for (let i = 0; i < 30; i++) { // Plus de lucioles
        const firefly = document.createElement('div');
        firefly.className = 'firefly';
        firefly.style.left = `${Math.random() * 100}%`;
        firefly.style.top = `${Math.random() * 100}%`;
        firefly.style.width = `${Math.random() * 2 + 1}px`; // Taille aléatoire (1-3px)
        firefly.style.height = firefly.style.width;
        firefly.style.animationDelay = `${Math.random() * 10}s`; // Délai aléatoire
        firefly.style.animationDuration = `${8 + Math.random() * 8}s`; // Durée plus longue pour plus de lenteur
        container.appendChild(firefly);
    }
}

function updateTurnDisplay(unit) {
    if (!dom.turnUnitDisplay) return;

    if (!unit) {
        dom.turnUnitDisplay.innerHTML = '';
        return;
    }

    const sprite = unit.spriteSrc || '';
    const hpText = `HP: ${unit.hp} / ${unit.maxHp}`;
    
    dom.turnUnitDisplay.innerHTML = `
        <img src="${sprite}" alt="${unit.name}" style="transform: ${unit._side === 'player' ? 'scaleX(-1)' : 'scaleX(1)'};" id="turn-unit-sprite">
        <div class="turn-unit-info">
            <span class="turn-unit-name" id="turn-unit-name">${unit.name}</span>
            <span class="turn-unit-hp" id="turn-unit-hp">${hpText}</span>
        </div>
    `;
}



function updateStatusIcons(unit) {
    if (!unit) return;
    const slotEl = getSlotEl(unit._side, unit._index);
    if (!slotEl) return;

    const iconsContainer = slotEl.querySelector('.status-icons');
    if (!iconsContainer) return;
    
    if (unit.isKO) {
        iconsContainer.style.display = 'none';
        return;
    } else {
        iconsContainer.style.display = 'flex';
    }
    
    iconsContainer.innerHTML = '';

    const effectsToDisplay = {};

    // Afficher les statuts majeurs et mineurs
    unit.activeEffects.forEach(effect => {
        const rule = RulesDB[effect.id];
        if (!rule || (rule.category !== 'Majeur' && rule.category !== 'Mineur')) return;

        const iconKey = effect.id;
        const iconClass = effect.id.substring(5).toLowerCase();
        const iconText = iconClass.substring(0, 3).toUpperCase();

        if (!effectsToDisplay[iconKey]) {
            effectsToDisplay[iconKey] = { class: iconClass, text: iconText, title: rule.name };
        }
    });

    // Afficher les modificateurs de stats individuellement
    for (const [stat, value] of Object.entries(unit.statMods)) {
        if (value === 0) continue;
        const modType = value > 0 ? 'buff' : 'debuff';
        const statAbbr = stat.substring(0, 3).toUpperCase();
        const title = `${stat} ${value > 0 ? 'augmentée' : 'diminuée'}`;
        const iconKey = `V_STAT_${stat}_${modType.toUpperCase()}`;
        
        effectsToDisplay[iconKey] = { 
            class: `v-stat ${modType}`, 
            text: statAbbr, 
            title: title 
        };
    }

    // Créer les éléments DOM
    for (const key in effectsToDisplay) {
        const displayInfo = effectsToDisplay[key];
        const iconEl = document.createElement('div');
        iconEl.className = `status-icon ${displayInfo.class}`; // ex: "status-icon v-stat buff"
        iconEl.textContent = displayInfo.text;
        iconEl.title = displayInfo.title;
        iconsContainer.appendChild(iconEl);
    }
}


function updateActionPointsUI(unit) {
    if (!unit) return;
    const slot = getSlotEl(unit._side, unit._index);
    if (!slot) return;
    const fill = slot.querySelector('.ap-fill');
    if (fill) {
        const percentage = Math.min(100, Math.round((unit.actionPoints / 100) * 100));
        fill.style.width = `${percentage}%`;
        
        // Ajouter une classe pour l'animation
        fill.classList.add('ap-fill-update');
        setTimeout(() => {
            fill.classList.remove('ap-fill-update');
        }, 200);
    }
}

function setHpFillVisual(fillEl, pct) {
  const clampedPct = clamp(pct, 0, 100);
  fillEl.style.width = `${clampedPct}%`;
  fillEl.classList.remove('midHp', 'lowHp');
  if (clampedPct < 20) fillEl.classList.add('lowHp');
  else if (clampedPct < 50) fillEl.classList.add('midHp');
}

function animateHpGrid(side, index, from, to, maxHp) {
  const slot = getSlotEl(side, index);
  if (!slot) return;
  const fill = slot.querySelector('.hp-fill');
  if (!fill) return;
  const max = maxHp || from || 1;
  const pct = Math.max(0, Math.round((to / max) * 100));
  setHpFillVisual(fill, pct); // La transition est gérée en CSS
}

function applyDamageGrid(target) {
  let pendingDamage = target._pendingDamage || 0;
  target._pendingDamage = 0;

  // Focus Sash check
  if (target.heldItem === 'focus-sash' && target.hp === target.maxHp && pendingDamage >= target.hp) {
      pendingDamage = target.maxHp - 1;
      spawnEffectText(target, "Ceinture Force", 'info');
      target.heldItem = null; // Consommé
  }

  target.hp = Math.max(0, target.hp - pendingDamage);
  const newHp = target.hp;

  // Berries check (Heal)
  if (target.heldItem === 'sitrus-berry' && newHp > 0 && newHp <= (target.maxHp || 0) * 0.5) {
      const heal = Math.floor(target.maxHp * 0.25);
      target.hp = Math.min(target.maxHp, target.hp + heal);
      spawnEffectText(target, "Baie Sitrus", 'buff');
      target.heldItem = null;
  } else if (target.heldItem === 'oran-berry' && newHp > 0 && newHp <= (target.maxHp || 0) * 0.5) {
      const heal = 10;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      spawnEffectText(target, "Baie Oran", 'buff');
      target.heldItem = null;
  }

  // Met à jour la barre de vie visuellement
  const slot = getSlotEl(target._side, target._index);
  if (slot) {
    const fill = slot.querySelector('.hp-fill');
    if (fill) {
      // Ajoute une classe pour l'animation de flash
      fill.classList.add('hp-flash-damage');
      setTimeout(() => fill.classList.remove('hp-flash-damage'), 200);

      // Met à jour la largeur après un court délai pour que le flash soit visible
      setTimeout(() => {
        const pct = Math.max(0, Math.round((newHp / (target.maxHp || 1)) * 100));
        setHpFillVisual(fill, pct);
      }, 50);
    }
  }

  if (newHp <= 0 && !target.isKO) {
    target.isKO = true;
    const slot = getSlotEl(target._side, target._index);
    if (slot) { 
      const unitEl = slot.querySelector('.unit');
      if (unitEl) unitEl.classList.add('is-ko');

      const spriteEl = slot.querySelector('.sprite');
      if (spriteEl) {
        spriteEl.style.display = 'none'; // Le sprite disparaît au lieu d'afficher une tombe
        // L'animation est maintenant arrêtée via la classe .is-ko
      }
      const hpBox = slot.querySelector('.hp-box');
      if (hpBox) {
        hpBox.style.display = 'none';
      }
      const apBar = slot.querySelector('.ap-bar');
      if (apBar) {
        apBar.style.display = 'none';
      }
      const zMoveIndicator = slot.querySelector('.z-move-indicator');
      if (zMoveIndicator) {
        zMoveIndicator.style.display = 'none';
      }
    }
  }
  target._pendingDamage = 0;
}

// --- Grille et ordre des tours ---
function buildActorsFromDom() {
  if (!dom.playerGrid || !dom.enemyGrid) return;

  const pSlots = Array.from(dom.playerGrid.querySelectorAll('.unit-slot'));
  const eSlots = Array.from(dom.enemyGrid.querySelectorAll('.unit-slot'));
  grid.player = new Array(9).fill(null);
  grid.enemy = new Array(9).fill(null);

  const playerPokemons = (typeof GameData !== 'undefined' && GameData.getPokemons) ? GameData.getPokemons() : [];
  const getTypesFromPokedex = (pk) => (Array.isArray(pk?.types) && pk.types.length) ? pk.types.map(t => t.toLowerCase()) : ['normal'];
  const firstTypeFrom = (pk) => getTypesFromPokedex(pk)[0];
  const resolveSelectedMoves = (pk, level) => {
    const db = MovesDB || {};
    const pickFromLevel = (arr) => (arr || []).filter(m => typeof m?.name === 'string' && (m.level == null || m.level <= level))
      .map(m => String(m.name));
    const base = Array.isArray(pk?.selectedMoves) && pk.selectedMoves.length ? pk.selectedMoves : pickFromLevel(pk?.moves);
    return base.slice(0, 4).map(key => {
      const info = db[key] || {};
      // Si damage_class n'est pas défini, on essaie de le deviner : sans puissance > 0 -> statut, sinon -> physique.
      const damage_class = info.damage_class || (info.power > 0 ? 'physical' : 'status');
      return { 
          ...info, // Copie toutes les données du JSON (effect, v_stat_count, etc.)
          id: key,
          name: info.name_fr || key,
          type: (info.type || firstTypeFrom(pk)).toLowerCase(),
          damage_class: damage_class,
          description: info.description_fr || '',
      };
    });
  };
  // Joueur
  pSlots.forEach((slot, i) => {
    const unit = slot.querySelector('.unit');
    if (!unit) return;

    const instanceId = unit.dataset.instanceId;
    const srcPk = instanceId ? playerPokemons.find(pp => pp && pp.instanceId === instanceId) : null;

    if (!srcPk) {
        console.warn(`Could not find player pokemon for unit.id ${unit.id}`);
        return;
    }

    const level = parseInt(slot.querySelector('.lvl-badge')?.textContent.replace('Lv.', '') || '5');
    
    // BUG FIX: Utiliser les stats pré-calculées de l'instance pour le joueur
    // car elles contiennent déjà IVs, EVs, Natures et Raffinements.
    const stats = {
        maxHp: srcPk.stats.hp,
        attack: srcPk.stats.atk,
        defense: srcPk.stats.def,
        spatk: srcPk.stats.spatk,
        spdef: srcPk.stats.spdef,
        speed: srcPk.stats.speed
    };
    const resolvedTypes = getTypesFromPokedex(srcPk);
    
    const actor = {
      id: `P-${i}-${Date.now()}`,
      name: safeName(srcPk) || '???',
      type: resolvedTypes[0], // Pour la compatibilité
      types: resolvedTypes, // Le tableau complet des types
      level,
      ...stats, // includes maxHp, attack, defense, etc.
      hp: stats.maxHp,
      isKO: false,
      spriteSrc: srcPk.sprite || '',
      _spriteSrc: srcPk.sprite || '',
      _side: 'player', _index: i,
      _pokemonId: srcPk.id,
      _instanceId: srcPk.instanceId, // IMPORTANT: Ajout de l'ID d'instance
      activeEffects: [], // Initialisation des effets actifs
      isIdle: true, // Pour l'animation de "respiration"
      statMods: { ATK: 0, DEF: 0, SPA: 0, SPD: 0, SPE: 0, PRE: 0, EVA: 0, CRIT: 0 }, // Ajout de l'évasion (EVA)
      _boostedMoveId: null, // Initialisation explicite du boostedMoveId
      heldItem: srcPk.heldItem || null,
    };
    actor.boostGauge = 0;
    actor.actionPoints = 0;

    if (srcPk) {
        // Assurez-vous que les moves sont bien chargés
        actor.moves = resolveSelectedMoves(srcPk, level);
        const boostedKey = (srcPk.boostedMove); // On ne prend que boostedMove pour l'instant
        if (boostedKey && typeof boostedKey === 'string') actor._boostedMoveId = boostedKey;
        let unlockTurn = 3;
        if (Number.isFinite(srcPk.boostUnlockTurn)) unlockTurn = srcPk.boostUnlockTurn;
        actor._boostUnlockTurn = unlockTurn;
        console.log(`Actor ${actor.name} built with boosted move ID: ${actor._boostedMoveId}`);
    }

    grid.player[i] = actor;
    animateHpGrid('player', i, actor.maxHp, actor.hp, actor.maxHp);
  });
  // Ennemi
  eSlots.forEach((slot, i) => {
    const unit = slot.querySelector('.unit');
    if (!unit) return;

    const pokemonId = unit.dataset.pokemonId;
    const level = parseInt(slot.querySelector('.lvl-badge')?.textContent.replace('Lv.', '') || getEnemyLevel());
    const srcPk = (pokemonId && PokedexDB) ? PokedexDB[pokemonId] : null;

    const stats = calculateStats(srcPk?.stats, level, pokemonId);
    const resolvedTypes = srcPk ? getTypesFromPokedex(srcPk) : ['normal'];

    const actor = {
      id: `E-${i}-${Date.now()}`,
      name: srcPk ? safeName(srcPk) : '???',
      type: resolvedTypes[0],
      types: resolvedTypes,
      level,
      ...stats,
      hp: stats.maxHp,
      isKO: false,
      spriteSrc: srcPk?.sprite || '',
      _spriteSrc: srcPk?.sprite || '',
      _side: 'enemy', _index: i,
      _pokemonId: pokemonId,
    };
    actor.isIdle = true; // Pour l'animation de "respiration"
    actor.activeEffects = []; // Initialisation des effets actifs
    actor.statMods = { ATK: 0, DEF: 0, SPA: 0, SPD: 0, SPE: 0, PRE: 0, EVA: 0, CRIT: 0 }; // Ajout de l'évasion (EVA)
    actor._boostedMoveId = null; // Initialisation explicite
    actor.boostGauge = 0;
    actor.actionPoints = 0;
    
    if (srcPk) {
      // Assurez-vous que les moves sont bien chargés
      actor.moves = resolveSelectedMoves(srcPk, level);
      // Assigner un Z-Move à l'ennemi
      const damagingMoves = actor.moves.filter(m => m.power > 0);
      if (damagingMoves.length > 0) {
          const baseMove = damagingMoves[Math.floor(Math.random() * damagingMoves.length)];
          actor._boostedMoveId = baseMove.id;
          console.log(`[AI Setup] ${actor.name} a reçu un Z-Move basé sur ${baseMove.name}`);
      }
    }
    
    grid.enemy[i] = actor;
    animateHpGrid('enemy', i, actor.maxHp, actor.hp, actor.maxHp);
  });
}
function aliveOnSide(side) {
  return (grid[side] || []).filter(a => a && !a.isKO);
}

function updateTurnOrderDisplay() {
    if (!dom.turnOrderSidebar) return;
    dom.turnOrderSidebar.innerHTML = '';

    const allUnits = [...aliveOnSide('player'), ...aliveOnSide('enemy')];
    if (allUnits.length === 0) return;

    // Créer une copie pour la simulation afin de ne pas altérer l'état réel du combat
    let simUnits = allUnits.map(u => ({
        id: u.id,
        name: u.name,
        spriteSrc: u.spriteSrc,
        _side: u._side,
        actionPoints: u.actionPoints,
        effectiveSpeed: u.effectiveSpeed,
        boostGauge: u.boostGauge || 0
    }));

    const turnPrediction = [];
    const maxTurnsToShow = 8;
    while (turnPrediction.length < maxTurnsToShow && simUnits.length > 0) {
        // Trier par AP pour voir qui est le plus proche de jouer
        simUnits.sort((a, b) => b.actionPoints - a.actionPoints);

        // Si personne ne peut jouer, on "charge" les AP de tout le monde jusqu'à ce que le plus rapide puisse jouer.
        if (simUnits[0].actionPoints < 100 && simUnits[0].effectiveSpeed > 0) {
            const apNeeded = 100 - simUnits[0].actionPoints;
            const ticks = Math.ceil(apNeeded / simUnits[0].effectiveSpeed);
            
            // Appliquer la charge à tous les Pokémon
            simUnits.forEach(u => u.actionPoints += u.effectiveSpeed * (ticks > 0 ? ticks : 1));
            continue; // Recommencer la boucle pour retrier et trouver qui joue
        }
        if (simUnits[0].actionPoints < 100) {
            break; // Cannot predict further if top speed is 0
        }

        // Le premier Pokémon de la liste triée est celui qui joue
        const unitToPlay = simUnits[0];
        turnPrediction.push(unitToPlay);

        // Il dépense ses AP pour jouer
        unitToPlay.actionPoints -= 100;
    }

    // Afficher la prédiction
    turnPrediction.forEach(unit => {
        const container = document.createElement('div');
        container.className = 'timeline-unit-container';

        const boostGauge = document.createElement('div');
        boostGauge.className = 'timeline-boost-gauge';
        const boostFill = document.createElement('div');
        boostFill.className = 'timeline-boost-fill';
        boostFill.style.width = `${(unit.boostGauge / 50) * 100}%`;
        boostGauge.appendChild(boostFill);

        const spriteImg = document.createElement('img');
        spriteImg.className = 'timeline-unit';
        spriteImg.src = unit.spriteSrc;
        spriteImg.title = `${unit.name}`;
        spriteImg.classList.add(unit._side);
        
        container.appendChild(boostGauge);
        container.appendChild(spriteImg);
        dom.turnOrderSidebar.appendChild(container);
    });
}

// --- Choix du joueur (UI) ---
let uiLocked = false;
let currentTargetingController = null;

function defaultMovesFor(unit) {
  const db = MovesDB || {};
  // Essaye de récupérer les infos de "Charge" depuis la BDD, sinon utilise un fallback.
  const tackleInfo = db['tackle'] || { name_fr: 'Charge', power: 40, type: 'normal', damage_class: 'physical', accuracy: 100, description_fr: '' };

  return [{
    id: 'tackle',
    name: tackleInfo.name_fr,
    type: tackleInfo.type,
    power: tackleInfo.power,
    accuracy: tackleInfo.accuracy,
    damage_class: tackleInfo.damage_class,
    target: 'single',
    description: tackleInfo.description_fr || ''
  }];
}

function clearActionUI() {
  if (dom.movesRow) dom.movesRow.innerHTML = '';
  if (dom.targetPrompt) {
      dom.targetPrompt.textContent = '';
      dom.targetPrompt.style.display = 'none';
  }
  if (dom.turnUnitDisplay) dom.turnUnitDisplay.innerHTML = '';
  if (dom.infoDisplayPanel) showTerrainInfo(); // Revenir aux infos du terrain
}

function hideInfoPanel() {
    if (dom.infoDisplayPanel) {
        dom.infoDisplayPanel.classList.remove('visible');
    }
}


function showPokemonDetails(unit) {
    if (!dom.infoDisplayPanel || !unit) return;

    const typesHtml = (unit.types || []).map(t => `<span class="chip type-${t.toLowerCase()}">${typeToFrench(t)}</span>`).join(' ');
    
    let statDisplayHtml = '';
    const statsMap = {
        'ATK': 'attack',
        'DEF': 'defense',
        'SPA': 'spatk',
        'SPD': 'spdef',
        'SPE': 'speed'
    };

    for (const statKey in statsMap) {
        const baseStatName = statsMap[statKey];
        const baseStatValue = unit[baseStatName];
        const modifierStage = unit.statMods[statKey] || 0;

        let statValueText = `${baseStatValue}`;
        if (modifierStage !== 0) {
            const modifiedValue = Math.floor(baseStatValue * getStatMultiplier(modifierStage));
            const modClass = modifierStage > 0 ? 'buff-text' : 'debuff-text';
            statValueText += ` <span class="${modClass}">(${modifiedValue})</span>`;
        }
        statDisplayHtml += `<span class="info-item"><strong>${statKey}:</strong> ${statValueText}</span>`;
    }
    
    let effectsHtml = 'Aucun';
    if (unit.activeEffects && unit.activeEffects.length > 0) {
        effectsHtml = unit.activeEffects.map(effect => {
            const rule = RulesDB[effect.id];
            if (!rule) return '';
            const type = rule.type || 'normal'; // Fallback to 'normal' if type is undefined
            return `<span class="chip type-${type}">${rule.name} ${effect.duration > 1 ? `(${effect.duration})` : ''}</span>`; // Display duration if > 1
        }).join(' ');
    }

    dom.infoDisplayPanel.innerHTML = `
        <div class="info-section">
            <span class="info-item"><strong>${unit.name}</strong> (Lv. ${unit.level})</span>
            <span class="info-item"><strong>HP:</strong> ${unit.hp}/${unit.maxHp}</span>
            ${statDisplayHtml}
            <span class="info-item"><strong>Types:</strong> ${typesHtml}</span>
            <div class="info-item" style="flex-basis: 100%;"><strong>Effets:</strong> ${effectsHtml}</div>
        </div>
    `;
    dom.infoDisplayPanel.classList.add('visible');
}

function showTerrainInfo() {
    if (!dom.infoDisplayPanel) return;
    // Placeholder for terrain info - to be implemented later
    dom.infoDisplayPanel.innerHTML = `<div class="info-section"><span class="info-item"><strong>Terrain:</strong> Normal</span><span class="info-item"><strong>Météo:</strong> Clair</span></div>`;
    dom.infoDisplayPanel.classList.add('visible');
}

function showMoveDetails(move, unit, isZMove = false) {
    if (!dom.infoDisplayPanel || !move) return;

    let power = move.power ?? '—';
    const accuracy = move.accuracy ?? '—';
    const typeName = typeToFrench(move.type);
    const damageClass = move.damage_class === 'physical' ? 'Physique' : (move.damage_class === 'special' ? 'Spéciale' : 'Statut');
    const description = move.description || 'Pas de description.';

    let zPowerHtml = '';
    if (isZMove && move.power > 0) { // Vérifier si c'est une Z-Move active
        const zPower = getZPower(move.power);
        zPowerHtml = `<span class="info-item z-power-details"><strong>Puiss. Z:</strong> ${zPower}</span>`;
    } else if (unit && unit._boostedMoveId === move.id && move.power > 0) { // Si c'est le move boosté mais pas encore activé
        const zPower = getZPower(move.power);
        zPowerHtml = `<span class="info-item z-power-details"><strong>Z-Move:</strong> ${zPower}</span>`;
    }

    let critRateHtml = '';
    if (move.crit_rate_stage && move.crit_rate_stage > 0) {
        critRateHtml = `<span class="info-item"><strong>Tx Crit:</strong> +${move.crit_rate_stage}</span>`;
    }

    // --- Nouvelle grille AOE ---
    let aoeGridHtml = '';
    if (move.aoe) {
        const aoeNameFr = (AOE_NAMES_FR && AOE_NAMES_FR[move.aoe]) || move.aoe;
        const aoePattern = getAoePatternForDisplay(move.aoe);
        const gridCells = aoePattern.map((isHit, index) => {
            const cellClass = isHit ? 'hit' : '';
            const isCenter = index === 4;
            return `<div class="aoe-grid-cell ${cellClass} ${isCenter ? 'center' : ''}"></div>`;
        }).join('');

        aoeGridHtml = `
            <div class="info-item aoe-display"><span><strong>Zone:</strong> ${aoeNameFr}</span><div class="aoe-grid">${gridCells}</div></div>
        `;
    }

    // --- NOUVEAU: Détails des effets ---
    let effectsHtml = '';
    if (move.effect && RulesDB) {
        const effects = Array.isArray(move.effect) ? move.effect : [move.effect];
        const effectDescriptions = effects.map((effectId, index) => {
            const rule = RulesDB[effectId];
            if (!rule) return '';

            const v_stat_count_raw = move.v_stat_count;
            let v_stat_counts;
            if (typeof v_stat_count_raw === 'string' && v_stat_count_raw.startsWith('[')) {
                try { v_stat_counts = JSON.parse(v_stat_count_raw); } catch { v_stat_counts = [0]; }
            } else {
                v_stat_counts = Array.isArray(v_stat_count_raw) ? v_stat_count_raw : [v_stat_count_raw];
            }
            const modValue = v_stat_counts[index] || v_stat_counts[0] || 0;

            switch (rule.category) {
                case 'V-Stat': {
                    const statsToModify = Array.isArray(move.effect_target_stat) ? move.effect_target_stat : [move.effect_target_stat];
                    return statsToModify.map((stat, i) => {
                        const currentModValue = v_stat_counts[i] !== undefined ? v_stat_counts[i] : modValue;
                        const percentage = currentModValue * STAT_MOD_PERCENT_PER_STACK * 100;
                        if (percentage === 0) return '';
                        const sign = percentage > 0 ? '+' : '';
                        return `<span class="chip type-normal">${sign}${percentage.toFixed(0)}% ${stat.toUpperCase()}</span>`;
                    }).join(' ');
                }
                case 'Majeur':
                case 'Mineur':
                case 'Buff':
                    return `<span class="chip type-${rule.type || 'normal'}">${rule.name}</span>`;
                case 'Action':
                    if (effectId === 'HEAL_HP') {
                        return `<span class="chip type-grass">Soin (${modValue}%)</span>`;
                    }
                    return `<span class="chip type-normal">${rule.name}</span>`;
                default: return '';
            }
        }).filter(Boolean).join(' ');

        if (effectDescriptions) {
            effectsHtml = `<div class="info-item" style="flex-basis: 100%;"><strong>Effet:</strong> ${effectDescriptions}</div>`;
        }
    }

    dom.infoDisplayPanel.innerHTML = `
        <div class="info-section">
            <span class="info-item"><strong>${move.name}</strong></span>
            <span class="info-item"><strong>Type:</strong> <span class="chip type-${move.type.toLowerCase()}">${typeName}</span></span>
            <span class="info-item"><strong>Classe:</strong> ${damageClass}</span>
            <span class="info-item"><strong>Puissance:</strong> ${power}</span>
            <span class="info-item"><strong>Précision:</strong> ${accuracy}</span>
            ${critRateHtml}
            ${zPowerHtml}
            ${aoeGridHtml}
            ${effectsHtml}
            <p class="move-description">${description}</p>
        </div>
    `;
    dom.infoDisplayPanel.classList.add('visible');
}

async function renderMovesForUnit(unit) {
  await Promise.all([loadMovesDB(), loadTypesDB()]);
  if (!dom.movesRow || !dom.targetPrompt) return Promise.resolve();
  dom.movesRow.innerHTML = '';
  const moves = Array.isArray(unit.moves) && unit.moves.length ? unit.moves : defaultMovesFor(unit);
  if (dom.targetPrompt) dom.targetPrompt.style.display = 'none';
  moves.slice(0, 4).forEach(mv => {
    const btn = document.createElement('button');
    btn.className = 'move-btn';

    const isZMoveReady = unit._boostedMoveId === mv.id && unit.boostGauge >= 50;

    if (unit._boostedMoveId === mv.id) {
        btn.classList.add('is-z-move-base'); // Always show the 'Z' badge if it's the base move
    }

    if (isZMoveReady) {
        btn.textContent = `Z-${mv.name}`; // Change text to indicate Z-Move
        btn.style.setProperty('--type-color', `var(--type-${(mv.type || 'normal').toLowerCase()})`); // Use base move type color
        btn.addEventListener('click', async () => {
            if (uiLocked) return;
            uiLocked = true;
            clearActionUI(); // Clear normal move UI
            await triggerZMove(unit); // Trigger the Z-Move logic
            if (dom._resolveTurn) dom._resolveTurn(); // Resolve the turn after Z-Move
            dom._resolveTurn = null;
            uiLocked = false;
        });
    } else {
        // Normal move logic (or Z-Move base not ready)
    // Ajoute la classe si c'est la base d'un Z-Move
    if (unit._boostedMoveId && mv.id === unit._boostedMoveId) {
        btn.classList.add('is-z-move-base');
    }

    btn.textContent = mv.name;
    const type = (mv.type || 'normal').toLowerCase();
    btn.style.setProperty('--type-color', `var(--type-${type})`);
    btn.addEventListener('mouseover', (e) => {
        showMoveDetails(mv, unit, isZMoveReady); // Pass isZMoveReady to showMoveDetails
        btn.classList.add('is-hovered');
    });
    btn.addEventListener('focus', () => showMoveDetails(mv, unit, btn.classList.contains('boosted-attack'))); // Pour l'accessibilité
    btn.addEventListener('mouseout', () => {
        btn.classList.remove('is-hovered');
        showTerrainInfo(); // Revenir aux infos du terrain
    });
    btn.addEventListener('blur', showTerrainInfo); // Pour l'accessibilité

    btn.addEventListener('click', async () => {
      if (uiLocked) {
        // Si l'UI est verrouillée, on vérifie si c'est à cause d'une sélection de cible.
        // Si oui, un clic sur un autre bouton de capacité annule la sélection.
        if (currentTargetingController) {
          currentTargetingController.abort();
        }
        return; // On ne fait rien d'autre, l'utilisateur doit re-cliquer pour choisir une nouvelle action.
      }
      uiLocked = true;

      // Gérer les capacités qui ne nécessitent pas de sélection de cible
      if (['all', 'random_single'].includes(mv.aoe)) {
        const potentialTargets = aliveOnSide('enemy');
        if (potentialTargets.length > 0) {
          clearActionUI();
          await attack(unit, potentialTargets[0], mv);
          if (dom._resolveTurn) dom._resolveTurn();
          dom._resolveTurn = null;
        } else {
          if (dom.targetPrompt) {
            dom.targetPrompt.style.display = 'block';
            dom.targetPrompt.textContent = 'Aucune cible valide.';
            setTimeout(() => {
              if (dom.targetPrompt && dom.targetPrompt.textContent === 'Aucune cible valide.') {
                dom.targetPrompt.textContent = '';
                dom.targetPrompt.style.display = 'none';
              }
            }, 1500);
          }
        }
        uiLocked = false;
      } else {
        const targetSelected = await promptTargetSelection(mv, unit);
        if (!targetSelected) uiLocked = false;
      }
    });
    dom.movesRow.appendChild(btn);
}
  });
}

function updateZMoveIndicators() {
    const allUnits = [...grid.player, ...grid.enemy];
    allUnits.forEach(unit => {
        if (!unit) return;

        const slotEl = getSlotEl(unit._side, unit._index);
        if (!slotEl) return;

        const unitEl = slotEl.querySelector('.unit');
        
        // Cacher tout si KO
        if (unit.isKO) {
            // Cacher aussi les status-icons si présent dans unitEl
            if (unitEl) {
                const icons = unitEl.querySelector('.status-icons');
                if (icons) icons.style.display = 'none';
            }
            return;
        }
        const displayPercent = Math.min(100, unit.boostGauge || 0);

        // Mise à jour du texte de charge persistant dans le HUD (le nôtre)
        if (unitEl) {
            const chargeText = unitEl.querySelector('.charge-text');
            if (chargeText) {
                chargeText.textContent = `${displayPercent}%`;
            }
        }
    });
}

function promptTargetSelection(move, unit) {
    if (!dom.enemyGrid) return Promise.resolve();
    const slots = Array.from(dom.enemyGrid.querySelectorAll('.unit-slot'));

    let hasTarget = false;
    // Marque les cibles valides
    slots.forEach((slot, idx) => {
        const valid = !!(grid.enemy[idx] && !grid.enemy[idx].isKO);

        if (valid) hasTarget = true;
        slot.classList.toggle('targetable', valid);
    });

    // S'il n'y a aucune cible valide, on ne peut pas continuer le tour du joueur.
    if (!hasTarget) {
        console.warn(`Aucune cible valide pour ${move.name}. Le joueur peut choisir une autre action.`);
        if (dom.targetPrompt) {
            dom.targetPrompt.style.display = 'block'; // Afficher le message d'erreur
            dom.targetPrompt.textContent = 'Aucune cible valide pour cette capacité.';
            setTimeout(() => { if (dom.targetPrompt.textContent === 'Aucune cible valide pour cette capacité.') {
                dom.targetPrompt.textContent = '';
                dom.targetPrompt.style.display = 'none';
            } }, 1500);
        }
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const controller = new AbortController();
        currentTargetingController = controller;

        const cleanup = () => {
            document.querySelectorAll('#enemy-grid .unit-slot.aoe-highlight').forEach(s => s.classList.remove('aoe-highlight'));
            slots.forEach(s => s.classList.remove('targetable'));
            if (dom.targetPrompt) {
                dom.targetPrompt.style.display = 'none';
                dom.targetPrompt.textContent = '';
            }
            currentTargetingController = null;
        };

        controller.signal.addEventListener('abort', () => { cleanup(); resolve(false); });

        const clearHighlights = () => document.querySelectorAll('#enemy-grid .unit-slot.aoe-highlight').forEach(s => s.classList.remove('aoe-highlight'));

        slots.forEach((slot, idx) => {
            // --- NOUVEAU: Listeners pour la prévisualisation de l'AOE ---
            slot.addEventListener('mouseover', () => {
                clearHighlights();
                const aoeIndexes = getAoePreviewIndexes(move.aoe || 'single', idx, 'enemy');
                
                aoeIndexes.forEach(targetIndex => {
                    const targetSlot = getSlotEl('enemy', targetIndex);
                    if (targetSlot) {
                        targetSlot.classList.add('aoe-highlight');
                    }
                });
            }, { signal: controller.signal });

            slot.addEventListener('mouseout', clearHighlights, { signal: controller.signal });
            // --- FIN NOUVEAU ---

            if (!slot.classList.contains('targetable')) return;

            slot.addEventListener('click', async () => {
                const target = grid.enemy[idx];
                if (!target || target.isKO) return;

                // Annuler les autres listeners et nettoyer l'UI
                cleanup();

                // Si c'est une attaque boostée, on vide la jauge
                if (move._isBoosted) {
                    unit.boostGauge = 0;
                    // On ne nettoie pas l'UI des actions car le tour du joueur n'est pas forcément terminé
                    // On met à jour juste les boutons Z-Move
                    renderZMoveButtons();
                } else {
                    // Pour un move normal, on nettoie tout
                    clearActionUI();
                }
                
                await attack(unit, target, move);

                uiLocked = false;
                // Si ce n'est PAS un Z-Move, on continue le flux normal du tour
                if (!move._isBoosted) {
                    if (dom._resolveTurn) dom._resolveTurn();
                    dom._resolveTurn = null;
                }
                resolve(true);
            }, { signal: controller.signal, once: true });
        });
    });
}

// --- IA ennemie ---
async function chooseEnemyAction(unit) {
  const allMoves = Array.isArray(unit.moves) && unit.moves.length ? unit.moves : defaultMovesFor(unit);
  const moves = allMoves.filter(m => m);

  if (moves.length === 0) {
    console.warn(`Enemy ${unit.name} has no moves. Passing turn.`);
    return;
  }

  const allPlayerUnits = aliveOnSide('player');
  if (allPlayerUnits.length === 0) {
    console.warn(`Enemy ${unit.name} has no targets. Passing turn.`);
    return;
  }

  let possibleActions = [];

  // Étape 1: Évaluer toutes les combinaisons (capacité, cible)
  for (const move of moves) {
    for (const target of allPlayerUnits) {
      let score = 0;

      if (move.damage_class === 'status') {
        // Score de base pour les capacités de statut.
        score = 0.5;
      } else {
        // Score pour les capacités offensives
        const defenderTypes = getTypes(target);
        score = defenderTypes.reduce((mod, dType) => mod * getTypeModifier(move.type, dType), 1);

        // Bonus pour cibler les Pokémon avec peu de PV.
        score *= (1.5 - (target.hp / target.maxHp)); // Facteur entre 0.5 (full HP) et 1.5 (low HP)
      }

      if (score > 0) {
        possibleActions.push({ move, target, score });
      }
    }
  }

  // Étape 2: Exécuter la meilleure action trouvée
  if (possibleActions.length > 0) {
    possibleActions.sort((a, b) => b.score - a.score);
    const bestAction = possibleActions[0];
    console.log(`[AI] ${unit.name} a choisi ${bestAction.move.name} sur ${bestAction.target.name} (Score: ${bestAction.score.toFixed(2)})`);
    await attack(unit, bestAction.target, bestAction.move);
    return;
  }

  // Étape 3: Fallback ultime si aucune action n'a un score > 0
  console.warn(`[AI Ultimate Fallback] Aucune action avec un score positif pour ${unit.name}. Choix aléatoire.`);
  const randomMove = moves[Math.floor(Math.random() * moves.length)];
  const randomTarget = allPlayerUnits[Math.floor(Math.random() * allPlayerUnits.length)];
  if (randomMove && randomTarget) {
    console.log(`[AI Ultimate Fallback] ${unit.name} utilise ${randomMove.name} sur ${randomTarget.name}.`);
    await attack(unit, randomTarget, randomMove);
  } else {
    console.error(`[AI FAILURE] ${unit.name} n'a trouvé aucune action à effectuer. Passe son tour.`);
  }
}

async function choosePlayerAutoAction(unit) {
    if (!unit || unit.isKO) return;

    const allMoves = (Array.isArray(unit.moves) && unit.moves.length ? unit.moves : defaultMovesFor(unit)).filter(m => m);
    if (allMoves.length === 0) {
        console.warn(`[Auto-Battle] ${unit.name} n'a aucune capacité. Passe son tour.`);
        return;
    }

    const allEnemyUnits = aliveOnSide('enemy');
    if (allEnemyUnits.length === 0) {
        console.warn(`[Auto-Battle] ${unit.name} n'a aucune cible. Passe son tour.`);
        return;
    }

    // --- NOUVELLE LOGIQUE ---
    let possibleActions = [];
    for (const move of allMoves) {
        // Les capacités qui ciblent le lanceur ou les alliés sont toujours considérées comme valides pour l'instant.
        if (move.zone === 'self' || move.zone === 'ally') {
            possibleActions.push({ move, target: unit }); // La cible est l'unité elle-même ou un allié (simplifié)
            continue;
        }

        for (const target of allEnemyUnits) {
            let isActionValid = true;

            // Si c'est une capacité de statut, on vérifie si elle est utile
            if (move.damage_class === 'status') {
                const effectId = move.effect;
                if (effectId && RulesDB) {
                    const rule = RulesDB[effectId];
                    if (rule) {
                        // 1. Vérifier si un statut majeur non cumulable est déjà appliqué
                        if (rule.category === 'Majeur' && !rule.cumulable) {
                            if (target.activeEffects.some(e => RulesDB[e.id]?.category === 'Majeur')) {
                                isActionValid = false;
                            }
                        }
                        // 2. Vérifier si le statut spécifique est déjà appliqué (pour les non-cumulables)
                        if (isActionValid && !rule.cumulable && target.activeEffects.some(e => e.id === effectId)) {
                            isActionValid = false;
                        }
                        // 3. Vérifier les malus de stats
                        if (isActionValid && rule.category === 'V-Stat') {
                            const modValue = move.v_stat_count;
                            if (modValue < 0) { // C'est un malus
                                const statsToModify = Array.isArray(move.effect_target_stat) ? move.effect_target_stat : [move.effect_target_stat];
                                const allStatsMin = statsToModify.every(statKey => {
                                    const currentMod = target.statMods[statKey.toUpperCase()] || 0;
                                    return (currentMod <= -(rule.max_stacks || 6));
                                });
                                if (allStatsMin) {
                                    isActionValid = false;
                                }
                            }
                        }
                    }
                }
            }
            
            if (isActionValid) {
                possibleActions.push({ move, target });
            }
        }
    }

    // Si aucune action "intelligente" n'est possible, on se rabat sur toutes les actions (offensives et autres).
    if (possibleActions.length === 0) {
        console.warn(`[Auto-Battle] Aucune action de statut/debuff jugée utile. Sélection parmi toutes les actions possibles.`);
        for (const move of allMoves) {
            for (const target of allEnemyUnits) {
                possibleActions.push({ move, target });
            }
        }
    }
    
    if (possibleActions.length === 0) {
        console.error(`[Auto-Battle] Échec critique, ${unit.name} ne peut rien faire.`);
        return;
    }

    // Choisir une action au hasard parmi les possibles
    const chosenAction = possibleActions[Math.floor(Math.random() * possibleActions.length)];
    
    console.log(`[Auto-Battle] ${unit.name} utilise ${chosenAction.move.name} sur ${chosenAction.target.name}`);
    clearActionUI();
    await attack(unit, chosenAction.target, chosenAction.move);
}

async function triggerZMove(unit) {
    if (!unit || unit.isKO || !unit._boostedMoveId || unit.boostGauge < 50) {
        return;
    }

    // Verrouiller l'interface pour empêcher d'autres actions
    uiLocked = true;

    console.log(`[Z-MOVE AUTO] ${unit.name} déchaîne sa puissance Z !`);

    // Annoncer le Z-Move
    if (dom.targetPrompt) {
        dom.targetPrompt.style.display = 'block';
        dom.targetPrompt.textContent = `${unit.name} déchaîne sa puissance Z !`;
        await sleep(1500);
    }

    const boostInfo = MovesDB[unit._boostedMoveId];
    if (!boostInfo) {
        uiLocked = false;
        return;
    }

    const mv = { ...boostInfo, id: unit._boostedMoveId, name: `Z-${boostInfo.name_fr}`, _isBoosted: true };

    // Les Z-Moves sont considérés comme des attaques de zone sur tous les ennemis.
    // On a juste besoin d'une cible principale pour lancer la fonction attack.
    const potentialTargets = aliveOnSide(unit._side === 'player' ? 'enemy' : 'player');

    if (potentialTargets.length > 0) {
        // On force la propriété AOE pour que la fonction attack la traite correctement.
        mv.aoe = 'all';
        await attack(unit, potentialTargets[0], mv);

        unit.boostGauge = 0; // Vider la jauge
        updateZMoveIndicators(); // Mettre à jour l'interface
    }

    uiLocked = false; // Déverrouiller l'interface
}

// --- Résolution d'attaque ---
async function attack(attacker, primaryTarget, move) {
  if (!attacker || !primaryTarget || attacker.isKO) {
    console.warn(`[DEBUG] Attack cancelled: Invalid attacker or target state`);
    return;
  }

  const moveToDo = move || defaultMovesFor(attacker)[0];
  if (!moveToDo) {
    console.error(`Attaque annulée pour ${attacker.name}: aucune capacité valide trouvée, même par défaut.`);
    return;
  }

    // --- LOGIQUE D'ATTAQUE REFACTORISÉE ---
    const moveForThisHit = { ...moveToDo };
    const targets = getAoeTargets(moveForThisHit.aoe || 'single', primaryTarget, primaryTarget._side);
    if (targets.length === 0) {
        console.warn(`[ATTACK] No valid targets for ${moveForThisHit.name}`);
        return;
    }

    console.log(`[ATTACK] ${attacker.name} uses ${moveForThisHit.name} on ${targets.map(t => t.name).join(', ')}`);
    
    // Afficher le nom de la capacité une seule fois
    if (typeof BattleAnimation !== 'undefined' && BattleAnimation.spawnMoveNameText) {
        BattleAnimation.spawnMoveNameText(attacker, moveForThisHit.name, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
    }

    const damages = [];
    const successfulTargets = [];
    let allTargetsThisTurn = new Set();

    // 1. Vérifier la précision et calculer les dégâts pour chaque cible
    for (const target of targets) {
        if (target.isKO) continue;
        allTargetsThisTurn.add(target);

        let finalAccuracy = moveForThisHit.accuracy;

        // --- NOUVEAU: Calcul de la précision finale ---
        if (finalAccuracy !== null) { // Ne s'applique pas aux capacités qui ne ratent jamais
            finalAccuracy = finalAccuracy ?? 100; // Si non-nul mais undefined, on met 100
            const attackerAccuracyMod = attacker.statMods.PRE || 0;
            const defenderEvasionMod = target.statMods.EVA || 0;
            
            const totalStageMod = clamp(attackerAccuracyMod - defenderEvasionMod, -6, 6);
            finalAccuracy *= getStatMultiplier(totalStageMod);
        }

        if (finalAccuracy !== null && Math.random() * 100 >= finalAccuracy) {
            spawnEffectText(target, "Raté !", 'info');
            continue; // La cible a esquivé
        }

        successfulTargets.push(target);
        const damageResult = computeDamage(attacker, target, moveForThisHit);
        damages.push({
            target,
            dmg: damageResult.damage,
            typeMod: damageResult.typeMod
        });
    }

  // Mettre à jour les jauges de boost (une seule fois par action)
  // La jauge de boost ne doit augmenter que pour les capacités offensives (physiques ou spéciales) qui ne sont pas déjà des Z-Moves.
  if (!moveToDo._isBoosted && (moveForThisHit.damage_class === 'physical' || moveForThisHit.damage_class === 'special') && (moveForThisHit.power && moveForThisHit.power > 0)) {
      // Attacker's boost gauge
      if (attacker.boostGauge < 50) {
          attacker.boostGauge = Math.min(50, (attacker.boostGauge || 0) + 10); // Incrément de 10 points (20% de la jauge max de 50)
      }
      // Target's boost gauge (only primary target for AOE, as per user's rule)
      // Check if primaryTarget is still valid (not KO'd before this move)
      if (primaryTarget && !primaryTarget.isKO && primaryTarget.boostGauge < 50) {
          primaryTarget.boostGauge = Math.min(50, (primaryTarget.boostGauge || 0) + 10); // Incrément de 10 points (20% de la jauge max de 50)
      }
  }

    if (successfulTargets.length === 0) {
        await sleep(500); // Attendre que le texte "Raté!" soit visible
        return;
    }

    // 2. Jouer les animations
    if (typeof BattleAnimation !== 'undefined') {
        if (moveForThisHit.damage_class === 'status') {
            // Pour les capacités de statut, l'animation principale (lueur de l'attaquant) ne joue qu'une fois.
            // Les effets sur les cibles sont gérés plus bas par applyEffect.
            await BattleAnimation.playActionAnimation(attacker, primaryTarget, moveForThisHit, 0, 1.0);
        } else if (moveForThisHit.damage_class === 'physical' && successfulTargets.length > 1) {
            // Stratégie dédiée pour les AOE physiques
            await BattleAnimation.playPhysicalAOEAnimation(attacker, successfulTargets, moveForThisHit, damages);
        } else { // Cible unique (physique/spécial) ou AOE spéciale
            // Pour les AOE spéciales, les animations joueront séquentiellement pour éviter les problèmes d'affichage.
            // Pour les cibles uniques, cette boucle ne s'exécute qu'une fois.
            for (const { target, dmg, typeMod } of damages) {
                await BattleAnimation.playActionAnimation(attacker, target, moveForThisHit, dmg, typeMod);
            }
        }
    }

    // 3. Appliquer les dégâts et les effets
    for (const { target, dmg } of damages) {
        if (dmg > 0) {
            target._pendingDamage = (target._pendingDamage || 0) + dmg;
            applyDamageGrid(target);
        }
        // Appliquer l'effet si la capacité en a un (après le check de précision)
        if (moveForThisHit.effect) {
            applyEffect(attacker, target, moveForThisHit);
        }
    }
    
    // --- NOUVEAU: Contrecoup Objets ---
    if (attacker.heldItem === 'life-orb' && successfulTargets.length > 0 && !attacker.isKO) {
        const recoil = Math.max(1, Math.floor(attacker.maxHp / 10));
        attacker.hp = Math.max(0, attacker.hp - recoil);
        spawnEffectText(attacker, "Orbe Vie", 'status');
        animateHpGrid(attacker._side, attacker._index, attacker.maxHp, attacker.hp, attacker.maxHp);
        if (attacker.hp <= 0) applyDamageGrid(attacker);
        await sleep(400);
    }
  // Mettre à jour la timeline et les boutons Z-Move après application des dégâts et potentiels KO
  updateTurnOrderDisplay();
  updateZMoveIndicators();
  await sleep(100); // Petite pause après les dégâts

  // Déclenchement des Z-Moves en réaction
  let zMoveHasTriggered = false;
  if (!moveToDo._isBoosted) {
      for (const target of successfulTargets) {
          if (target.boostGauge >= 50 && !target.isKO) {
              await triggerZMove(target);
              zMoveHasTriggered = true;
              break; // Une seule réaction par action
          }
      }
      if (!zMoveHasTriggered && attacker.boostGauge >= 50 && !attacker.isKO) {
          await triggerZMove(attacker);
      }
  }

  // Incrémente le compteur global après chaque action résolue
  globalTurnCount += 1;
}

let BattleLevelsDB = null;
async function loadBattleLevelsDB() {
    if (BattleLevelsDB) return BattleLevelsDB;
    try {
        const res = await fetch('../data/battle_levels.json');
        BattleLevelsDB = await res.json();
    } catch (e) {
        console.warn("Could not load battle_levels.json, will use random generation.", e);
        BattleLevelsDB = []; // Fallback to empty array
    }
    return BattleLevelsDB;
}

function setupPredefinedEnemyTeam(team) {
    const enemyGrid = document.getElementById('enemy-grid');
    if (!enemyGrid) return;
    const slots = Array.from(enemyGrid.querySelectorAll('.unit-slot'));
    const level = getEnemyLevel();

    team.forEach(member => {
        const pokemon = PokedexDB[member.id];
        const slot = slots[member.slot];

        if (pokemon && slot) {
            const unit = document.createElement('div');
            unit.className = 'unit';
            unit.dataset.pokemonId = pokemon.id;
            unit.style.animationDelay = `-${(Math.random() * 5).toFixed(2)}s`;
            const name = safeName(pokemon);
            const sprite = pokemon.sprite;
            unit.innerHTML = `
                <div class="hp-box">
                    <div class="status-icons"></div>
                    <div class="status-main-row">
                        <span class="lvl-badge">Lv.${level}</span>
                        <div class="hp-container-minimal">
                            <div class="ap-bar"><div class="ap-fill" style="width: 0%;"></div></div>
                            <div class="hp-bar-bg"><div class="hp-fill" style="width: 100%;"></div></div>
                        </div>
                        <span class="charge-text">0%</span>
                    </div>
                </div>
                <div class="shadow"></div>
                <img src="${sprite}" class="sprite" alt="${name}" style="--transform-base: scaleX(1);">`;
            slot.appendChild(unit);
        }
    });
}

function setupRandomEnemyTeam() {
    const enemyGrid = document.getElementById('enemy-grid');
    if (!enemyGrid) return;

    const slots = Array.from(enemyGrid.querySelectorAll('.unit-slot'));
    const pokedexArray = Object.values(PokedexDB);
    if (pokedexArray.length === 0) {
        console.error("Pokedex is empty, impossible to choose enemies.");
        return;
    }

    const level = getEnemyLevel();
    const enemyCount = Math.min(9, Math.floor(1 + (zoneIndex / 2) + (waveIndex / 4)));

    const enemiesToCreate = [];
    for (let i = 0; i < enemyCount; i++) {
        const availableEnemies = pokedexArray.slice(0, 24);
        const randomPk = availableEnemies[Math.floor(Math.random() * availableEnemies.length)];
        if (randomPk) enemiesToCreate.push(randomPk);
    }

    const enemyPlacementOrder = [0, 3, 6, 1, 4, 7, 2, 5, 8];
    let enemyIndex = 0;
    for (const slotIndex of enemyPlacementOrder) {
        if (enemyIndex >= enemiesToCreate.length) break;
        const enemy = enemiesToCreate[enemyIndex];
        const slot = slots[slotIndex];
        if (enemy && slot) {
            const unit = document.createElement('div');
            unit.className = 'unit';
            unit.dataset.pokemonId = enemy.id;
            unit.style.animationDelay = `-${(Math.random() * 5).toFixed(2)}s`;
            const name = safeName(enemy);
            const sprite = enemy.sprite;
            unit.innerHTML = `
                <div class="hp-box">
                    <div class="status-icons"></div>
                    <div class="status-main-row">
                        <span class="lvl-badge">Lv.${level}</span>
                        <div class="hp-container-minimal">
                            <div class="ap-bar"><div class="ap-fill" style="width: 0%;"></div></div>
                            <div class="hp-bar-bg"><div class="hp-fill" style="width: 100%;"></div></div>
                        </div>
                        <span class="charge-text">0%</span>
                    </div>
                </div>
                <div class="shadow"></div>
                <img src="${sprite}" class="sprite" alt="${name}" style="--transform-base: scaleX(1);">`;
            slot.appendChild(unit);
            enemyIndex++;
        }
    }
}

function setupEnemyTeam() {
    if (!PokedexDB) {
        console.error("PokedexDB not loaded, cannot create enemy team.");
        return;
    }

    const predefinedTeam = BattleLevelsDB?.find(level => 
        level.zone === zoneIndex && level.wave === waveIndex && level.battle === battleIndex
    );

    if (predefinedTeam && predefinedTeam.team) {
        setupPredefinedEnemyTeam(predefinedTeam.team);
    } else {
        setupRandomEnemyTeam();
    }
}

function restorePlayerGridForNewBattle() {
  // 1. Restaurer l'état visuel du DOM du joueur
  for (let i = 0; i < 9; i++) {
    const slot = getSlotEl('player', i);
    if (slot) {
      const unitEl = slot.querySelector('.unit');
      if (unitEl) { // Restaurer uniquement s'il y avait une unité
        unitEl.classList.remove('is-ko');
        
        // Restaurer le sprite original à partir des données du jeu
        const instanceId = unitEl.dataset.instanceId;
        if (instanceId) {
            const playerPokemons = GameData.getPokemons();
            const srcPk = playerPokemons.find(p => p && p.instanceId === instanceId);
            if (srcPk) {
                const img = unitEl.querySelector('.sprite');
                if (img) {
                    img.src = srcPk.sprite;
                }
            }
        }
        
        const hpBox = unitEl.querySelector('.hp-box');
        if (hpBox) {
          hpBox.style.display = 'flex';
          const fill = hpBox.querySelector('.hp-fill');
          if (fill) setHpFillVisual(fill, 100);
          const apBar = unitEl.querySelector('.ap-bar');
          if (apBar) {
            apBar.style.display = 'block';
          }
          const apFill = unitEl.querySelector('.ap-fill');
          if (apFill) apFill.style.width = '0%';
        }
        const statusIcons = unitEl.querySelector('.status-icons');
        if (statusIcons) {
            statusIcons.innerHTML = '';
        }
      }
    }
  }
}

function prepareEnemyGridForNewBattle() {
  // Nettoyer et régénérer complètement le DOM ennemi
  try {
    const enemyGrid = document.getElementById('enemy-grid');
    if (enemyGrid) {
      enemyGrid.innerHTML = ''; // Vider la grille
      for (let i = 0; i < 9; i++) { // Recréer les slots vides
        const slot = document.createElement('div');
        slot.className = 'unit-slot';
        enemyGrid.appendChild(slot);
      }
    }
    setupEnemyTeam();
  } catch (e) {
    console.error("Erreur lors de la préparation de l'équipe ennemie:", e);
  }
}

function prepareGridsForNewBattle() {
  restorePlayerGridForNewBattle();
  prepareEnemyGridForNewBattle();
}

async function handleStartOfTurnEffects(unit) {
    if (unit.isKO) return { canAct: false };

    let canAct = true;
    let selfHit = false;

    // Objets tenus (Début de tour)
    if (unit.heldItem === 'leftovers' && unit.hp > 0 && unit.hp < unit.maxHp) {
        const leftoversHeal = Math.max(1, Math.floor(unit.maxHp / 16));
        unit.hp = Math.min(unit.maxHp, unit.hp + leftoversHeal);
        animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
        spawnEffectText(unit, "Restes", 'buff');
        await sleep(400);
    }

    // Copie pour pouvoir modifier l'original dans la boucle
    const effectsToProcess = [...unit.activeEffects];

    for (const effect of effectsToProcess) {
        const rule = RulesDB[effect.id];
        if (!rule) continue;

        switch (effect.id) {
            case 'STAT_PSN':
                const poisonDamage = Math.floor(unit.maxHp * (rule.effect_value / -100));
                unit.hp = Math.max(0, unit.hp - poisonDamage);
                animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
                if (BattleAnimation.showDamageNumber) BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), poisonDamage, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
                spawnEffectText(unit, "Poison", 'status');
                await sleep(400);
                if (unit.hp <= 0) { applyDamageGrid(unit); canAct = false; }
                break;
            case 'STAT_BRU':
                const burnDamage = Math.floor(unit.maxHp * 0.0625); // 1/16th
                unit.hp = Math.max(0, unit.hp - burnDamage);
                animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
                if (BattleAnimation.showDamageNumber) BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), burnDamage, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
                spawnEffectText(unit, "Brûlure", 'status');
                await sleep(400);
                if (unit.hp <= 0) { applyDamageGrid(unit); canAct = false; }
                break;
            case 'BUFF_REG':
                const regenAmount = Math.floor(unit.maxHp * (rule.effect_value / 100));
                unit.hp = Math.min(unit.maxHp, unit.hp + regenAmount);
                animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
                if (BattleAnimation.showDamageNumber) BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), -regenAmount, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
                await sleep(400);
                break;
            case 'STAT_SOM':
                if (Math.random() * 100 < rule.wake_up_chance) {
                    unit.activeEffects = unit.activeEffects.filter(e => e.id !== 'STAT_SOM');
                    spawnEffectText(unit, `${unit.name} se réveille!`, 'info');
                } else {
                    spawnEffectText(unit, `${unit.name} dort...`, 'info');
                    canAct = false;
                }
                await sleep(800);
                break;
            case 'STAT_CONF':
                if (Math.random() * 100 < rule.self_hit_chance) {
                    spawnEffectText(unit, `${unit.name} se blesse dans sa confusion!`, 'status');
                    const selfDamageResult = computeDamage(unit, unit, { power: 40, damage_class: 'physical', type: 'normal' }); // computeDamage now returns {damage, typeMod}
                    const selfDamage = selfDamageResult.damage; // computeDamage now returns {damage, typeMod}
                    unit.hp = Math.max(0, unit.hp - selfDamage);
                    animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
                    if (BattleAnimation.showDamageNumber) BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), selfDamage);
                    if (unit.hp <= 0) applyDamageGrid(unit);
                    canAct = false; selfHit = true;
                    await sleep(800);
                }
                break;
        }
        if (!canAct) break;
    }

    unit.activeEffects = unit.activeEffects.filter(e => e.duration === 'permanent' || --e.duration > 0);
    updateStatusIcons(unit);
    return { canAct };
}

async function runCombatLoop() {
    console.log("[DEBUG] runCombatLoop: enter, window.isRunning =", window.isRunning);
    while (window.isRunning) {
        console.log("[DEBUG] runCombatLoop: iteration start");
        const playerAlive = aliveOnSide('player');
        const enemyAlive = aliveOnSide('enemy');

        if (playerAlive.length === 0 || enemyAlive.length === 0) {
            console.log("[DEBUG] runCombatLoop: someone is dead, stopping loop");
            break;
        }

        // --- NOUVELLE LOGIQUE DE GAIN D'AP ET DE TOUR ---
        const allUnits = [...playerAlive, ...enemyAlive];
        
        let unitToPlay = null;
        // Chercher la première unité avec assez d'AP
        allUnits.sort((a, b) => b.actionPoints - a.actionPoints);
        if (allUnits[0] && allUnits[0].actionPoints >= 100) {
            unitToPlay = allUnits[0];
        }

        // Si personne ne peut jouer, on charge les AP jusqu'à ce que le plus rapide puisse jouer.
        if (!unitToPlay) {
            // Trier par vitesse pour trouver qui atteindra 100 AP en premier
            allUnits.sort((a, b) => b.effectiveSpeed - a.effectiveSpeed);
            unitToPlay = allUnits[0];
            if (!unitToPlay) break; // Plus personne

            if (unitToPlay.effectiveSpeed <= 0) {
                console.error(`[FATAL] ${unitToPlay.name} a 0 de vitesse et ne peut pas gagner d'AP. Boucle de combat interrompue.`);
                break; // Sécurité pour éviter une boucle infinie
            }
            const apNeeded = 100 - unitToPlay.actionPoints;
            const ticks = Math.ceil(apNeeded / unitToPlay.effectiveSpeed);

            allUnits.forEach(u => {
                if (!u.isKO) {
                    const speed = u.effectiveSpeed || 50; // Fallback sécurité
                    u.actionPoints += speed * (ticks > 0 ? ticks : 1);
                    if (u._side === 'player') console.log(`[DEBUG] ${u.name} AP: ${u.actionPoints}`);
                    updateActionPointsUI(u);
                }
            });

            updateTurnOrderDisplay();
            await sleep(50);
            continue; // On recommence la boucle pour retrier et trouver qui joue.
        }

        // Une unité a 100+ AP, c'est son tour.
        const unit = unitToPlay;

        currentTurnUnit = unit;

        // --- Gérer les effets de début de tour ---
        const { canAct } = await handleStartOfTurnEffects(unit);
        if (!canAct) {
            // L'effet a empêché l'action (sommeil, confusion, etc.)
            // Dépenser les AP et passer au tour suivant.
            unit.actionPoints -= 100;
            updateActionPointsUI(unit);
            currentTurnUnit = null;
            await sleep(500);
            continue; // Re-run loop to find next turn
        }

        // --- INDICATEUR DE TOUR ---
        document.querySelectorAll('.is-current-turn').forEach(el => el.classList.remove('is-current-turn'));
        const currentUnitEl = getSlotEl(unit._side, unit._index)?.querySelector('.unit');
        if (currentUnitEl) currentUnitEl.classList.add('is-current-turn');

        updateTurnOrderDisplay();
        updateTurnDisplay(unit);

        // --- Le Pokémon agit ---
        const actionPanel = document.getElementById('actionPanel');
        if (unit._side === 'player') {
            if (actionPanel) actionPanel.classList.remove('enemy-turn');
            // Vérifie si le combat auto est activé
            if (typeof isAutoBattle !== 'undefined' && isAutoBattle) {
                if (dom.targetPrompt) {
                    dom.targetPrompt.style.display = 'block';
                    dom.targetPrompt.textContent = `Tour de ${unit.name}...`;
                }
                await sleep(800); // Petite pause pour voir qui joue
                await choosePlayerAutoAction(unit);
            } else {
                await new Promise(resolve => {
                    dom._resolveTurn = resolve;
                    renderMovesForUnit(unit);
                });
            }
        } else {
            if (actionPanel) actionPanel.classList.add('enemy-turn');
            if (dom.targetPrompt) {
                dom.targetPrompt.style.display = 'block';
                dom.targetPrompt.textContent = `${unit.name} attaque...`;
            }
            await sleep(1200);
            uiLocked = true;
            await chooseEnemyAction(unit);
            uiLocked = false;
        }

        // Dépenser les AP.
        unit.actionPoints -= 100;
        updateActionPointsUI(unit);
        currentTurnUnit = null;

        if (aliveOnSide('player').length === 0 || aliveOnSide('enemy').length === 0) {
            break;
        }

        await sleep(200);
    }

    await checkWinCondition();
    window.isRunning = false;
    currentTurnUnit = null;
    console.log("[DIAGNOSTIC] Boucle de combat terminée");
    clearActionUI(); // Nettoyer l'UI à la fin
}

async function beginBattleSequence() {
    console.log("[DEBUG] beginBattleSequence() called");
    if (window.isRunning) {
        console.warn("[DEBUG] window.isRunning was already true, force reset");
        window.isRunning = false;
        await sleep(100);
    }
    window.isRunning = true;
    console.log("[DEBUG] window.isRunning is now true");

    // 1. Charger toutes les données nécessaires avec gestion d'erreurs individuelle
    console.log("[DEBUG] Loading databases...");
    const dbLoads = [
        { name: 'Moves', fn: loadMovesDB },
        { name: 'Types', fn: loadTypesDB },
        { name: 'Pokedex', fn: loadPokedexDB },
        { name: 'Levels', fn: loadBattleLevelsDB },
        { name: 'AOE', fn: loadAoeDB },
        { name: 'Rules', fn: loadRulesDB }
    ];

    for (const db of dbLoads) {
        try {
            await db.fn();
            console.log(`[DEBUG] ${db.name} DB loaded.`);
        } catch (e) {
            console.warn(`[DEBUG] Failed to load ${db.name} DB:`, e);
        }
    }

    // 2. Préparer le terrain (nettoyer les anciennes batailles, générer les nouveaux ennemis)
    console.log("[DEBUG] Preparing grids for new battle");
    // L'équipe ennemie est maintenant préparée avant (battle-ui.js ou nextBattleProgression).
    // On ne restaure que la grille du joueur ici pour ne pas recréer les ennemis.
    if (typeof restorePlayerGridForNewBattle === 'function') {
        restorePlayerGridForNewBattle();
    }

    // Afficher le panneau d'info avec les données du terrain
    showTerrainInfo();
    await sleep(50); // Laisse le temps au DOM de se mettre à jour

    // 3. Réinitialiser le compteur de tour pour la nouvelle bataille
    globalTurnCount = 0;

    const getEffectiveSpeed = (unit) => {
        const baseSpeed = unit.speed || 0;
        const slotIndex = unit._index || 0;
        let modifier = 1.0;

        if (unit._side === 'player') {
            if ([2, 5, 8].includes(slotIndex)) modifier = 1.1;
            else if ([0, 3, 6].includes(slotIndex)) modifier = 0.9;
        } else { // enemy
            if ([0, 3, 6].includes(slotIndex)) modifier = 1.1;
            else if ([2, 5, 8].includes(slotIndex)) modifier = 0.9;
        }
        let finalSpeed = baseSpeed * modifier;

        // Appliquer paralysie
        if (unit.activeEffects && unit.activeEffects.some(e => e.id === 'STAT_PAR')) {
            finalSpeed *= 0.7; // Réduction de 30%
        }

        return finalSpeed;
    };

    // 4. Construire les objets "acteurs" à partir du DOM maintenant prêt
    console.log("[DEBUG] Building actors from DOM...");
    buildActorsFromDom();
    console.log("[DEBUG] Grid player length:", grid.player.filter(u => u !== null).length);
    console.log("[DEBUG] Grid enemy length:", grid.enemy.filter(u => u !== null).length);
    
    [...grid.player, ...grid.enemy].forEach(unit => {
        if (unit) {
            unit.effectiveSpeed = getEffectiveSpeed(unit);
            console.log(`[DEBUG] Actor ready: ${unit.name} (${unit._side}) Speed: ${unit.effectiveSpeed}`);
        }
    });

    // 5. SÉCURITÉ : Vérifier que des combattants ont bien été créés.
    const playerUnits = aliveOnSide('player');
    const enemyUnits = aliveOnSide('enemy');

    console.log(`[DEBUG] Player units alive: ${playerUnits.length}`);
    console.log(`[DEBUG] Enemy units alive: ${enemyUnits.length}`);

    if (playerUnits.length === 0) {
        console.error("Combat annulé : Aucun Pokémon joueur valide sur le terrain après initialisation.");
        window.isRunning = false;
        setCombatActive(false); // Annuler le mode combat
        alert("Erreur critique : Impossible de démarrer le combat, aucun combattant valide trouvé.");
        return;
    }
    if (enemyUnits.length === 0) {
        console.error("Combat annulé : Aucun Pokémon ennemi valide sur le terrain après initialisation.");
        window.isRunning = false;
        setCombatActive(false);
        alert("Erreur critique : Impossible de générer les ennemis. Vérifiez que les fichiers de données (pokedex.json) sont accessibles.");
        return;
    }

    updateTurnOrderDisplay();
    updateZMoveIndicators(); // Initialiser les indicateurs Z-Move

    // Lancer la boucle de combat
    console.log("[DEBUG] Starting runCombatLoop...");
    runCombatLoop(); // On ne l'attend pas forcément ici si on veut rendre la main à l'UI
    console.log("[DEBUG] beginBattleSequence() finished.");
}

async function checkWinCondition() {
  const playerAlive = aliveOnSide('player').length;
  const enemyAlive = aliveOnSide('enemy').length;
  const battleScreen = document.getElementById('game-screen');
  const sideActions = document.getElementById('side-actions');

  const cleanupTurnIndicator = () => {
      document.querySelectorAll('.is-current-turn').forEach(el => el.classList.remove('is-current-turn'));
  };

  // Réinitialiser l'ordre des éléments d'action à la fin du combat
  const actionPanel = document.getElementById('actionPanel');
  if (actionPanel) {
      actionPanel.classList.remove('enemy-turn');
  }

  if (enemyAlive === 0 && playerAlive > 0) {
    // Victoire


    // Ajout de la récompense en argent rééquilibrée
    const reward = 25 + (getEnemyLevel() * 20); // Courbe de récompense améliorée
    if (typeof GameData !== 'undefined' && GameData.addMoney) {
        GameData.addMoney(reward);
    }

    // Logique de drop d'oeuf
    let eggCount = 1;
    // Les variables zoneIndex, waveIndex, battleIndex sont globales dans battle-ui.js
    if (waveIndex === 10 && battleIndex === 10) {
        eggCount = 5;
    } else if (battleIndex === 10) {
        eggCount = 2;
    }

    // --- NOUVELLES RÉCOMPENSES (Objets & Baies) ---
    const dropableItems = [
        'silk-scarf', 'charcoal', 'mystic-water', 'miracle-seed', 'sharp-beak', 
        'poison-barb', 'soft-sand', 'hard-stone', 'magnet', 'never-melt-ice', 
        'black-belt', 'dragon-fang', 'spell-tag', 'metal-coat', 'twisted-spoon', 
        'silver-powder', 'leftovers', 'life-orb', 'focus-sash', 'rocky-helmet', 'expert-belt'
    ];
    const dropableBerries = [
        'oran-berry', 'sitrus-berry', 'lum-berry', 'leppa-berry',
        'pomeg-berry', 'kelpsy-berry', 'qualot-berry', 'hondew-berry', 'grepa-berry', 'tamato-berry'
    ];
    
    const droppedItems = [];
    
    // Fonction helper pour obtenir le nom français propre (incluant le contenu des CT)
    const getCleanItemNameFr = (id) => {
        const item = GameData.getItem(id);
        if (!item) return id.toUpperCase();
        let name = item.name_fr || item.name || id;
        
        // Si c'est une CT, on essaie d'extraire le nom de la capacité pour plus de clarté
        if (id.startsWith('tm') && item.effect_fr) {
            const match = item.effect_fr.match(/Apprend (.*?) à un Pokémon/);
            if (match && match[1]) {
                name = `${name} - ${match[1]}`;
            }
        }
        return name;
    };
    
    // 1 Objet garanti
    const randomItem = dropableItems[Math.floor(Math.random() * dropableItems.length)];
    GameData.addItem(randomItem, 1);
    droppedItems.push({ id: randomItem, name: getCleanItemNameFr(randomItem), icon: '📦' });
    
    // 1 Baie garantie
    const randomBerry = dropableBerries[Math.floor(Math.random() * dropableBerries.length)];
    GameData.addItem(randomBerry, 1);
    droppedItems.push({ id: randomBerry, name: getCleanItemNameFr(randomBerry), icon: '🍒' });

    // CT drop chance (fixed 20%)
    let droppedTM = null;
    if (Math.random() < 0.2) {
        const tmId = `tm${Math.floor(Math.random() * 50) + 1}`; 
        GameData.addItem(tmId, 1);
        droppedTM = { id: tmId, name: getCleanItemNameFr(tmId), icon: '💿' };
    }

    let finalEggCount = 0;
    if (typeof GameData !== 'undefined' && GameData.addEggsToBag) {
        const result = GameData.addEggsToBag(eggCount);
        if (result.success) {
            finalEggCount = result.eggs.length;
        }
    }

    if (dom.battleStatus) {
        dom.battleStatus.innerHTML = `
            <div class="status-title">VICTOIRE !</div>
            <div class="rewards-summary">
                <div class="reward-item">
                    <span class="reward-icon">💰</span>
                    <span class="reward-amount">+${reward} $</span>
                </div>
                ${finalEggCount > 0 ? `
                <div class="reward-item">
                    <img src="../assets/egg.png" class="reward-egg-icon" />
                    <span class="reward-amount">+${finalEggCount} Œuf${finalEggCount > 1 ? 's' : ''}</span>
                </div>
                ` : ''}
                <div class="rewards-grid-mini">
                    ${droppedItems.map(item => `
                        <div class="reward-badge" title="${item.name}">
                            ${item.icon} ${item.name}
                        </div>
                    `).join('')}
                    ${droppedTM ? `
                        <div class="reward-badge tm" title="${droppedTM.name}">
                            ${droppedTM.icon} ${droppedTM.name}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        dom.battleStatus.classList.remove('lose');
        dom.battleStatus.classList.add('win');
        dom.battleStatus.style.display = 'block';
    }
    clearActionUI();
    if (sideActions) sideActions.innerHTML = ''; // Vider les anciens boutons

    const navWin = document.createElement('div');
    navWin.id = 'end-battle-nav-win';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pk-btn-action';
    nextBtn.title = 'Combat Suivant';
    nextBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
    nextBtn.addEventListener('click', nextBattleProgression, { once: true });
    navWin.appendChild(nextBtn);
    if (battleScreen) battleScreen.appendChild(navWin);
    cleanupTurnIndicator();
    updateZMoveIndicators(); // Mettre à jour l'état des Z-Moves après le combat
  } else if (playerAlive === 0) {
    // Défaite
    if (dom.battleStatus) {
      dom.battleStatus.textContent = 'PERDU';
      dom.battleStatus.classList.remove('win');
      dom.battleStatus.classList.add('lose');
      dom.battleStatus.style.display = 'block';
    }
    clearActionUI();
    if (sideActions) sideActions.innerHTML = ''; // Vider les anciens boutons

    const navLose = document.createElement('div');
    navLose.id = 'end-battle-nav-lose';
    const replayBtn = document.createElement('button');
    replayBtn.className = 'pk-btn-action';
    replayBtn.title = 'Rejouer';
    replayBtn.innerHTML = `Rejouer <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
    replayBtn.addEventListener('click', fleeBattle, { once: true });
    navLose.appendChild(replayBtn);
    if (battleScreen) battleScreen.appendChild(navLose);
    cleanupTurnIndicator();
    updateZMoveIndicators(); // Mettre à jour l'état des Z-Moves après le combat
  } else {
    // Combat non terminé (sécurité)
    if (dom.battleStatus) dom.battleStatus.style.display = 'none';
  }
}

// --- New Stat & Level Calculation ---
let PokedexDB = null;
async function loadPokedexDB() {
    if (PokedexDB) return PokedexDB;
    try {
        const res = await fetch('../data/pokedex.json');
        const pokedexArray = await res.json();
        // Convert array to object with ID as key for quick lookup
        PokedexDB = pokedexArray.reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
        }, {});
    } catch (e) {
        console.error("Failed to load pokedex.json", e);
        PokedexDB = {}; // Fallback
    }
    return PokedexDB;
}

function getEnemyLevel() {
    return ((zoneIndex - 1) * 100) + ((waveIndex - 1) * 10) + battleIndex;
}

function calculateStats(baseStats, level, pokemonId = null) {
    // Utilisation des formules de stats standards de Pokémon (Cas Général Gen 3+)
    // Stat = floor( ((2 * Base + IV + floor(EV/4)) * Niv / 100) + 5 )
    // PV = floor( ((2 * Base + IV + floor(EV/4)) * Niv / 100) ) + Niv + 10
    // Pour les ennemis, on considère IV=0 et EV=0 pour la simplicité.
    const safeBase = baseStats || { hp: 30, atk: 30, def: 30, spatk: 30, spdef: 30, speed: 30 };

    if (pokemonId === 292 || pokemonId === "292") return {
        maxHp: 1,
        attack: Math.floor((2 * (safeBase.atk || 0) * level / 100) + 5),
        defense: Math.floor((2 * (safeBase.def || 0) * level / 100) + 5),
        spatk: Math.floor((2 * (safeBase.spatk || 0) * level / 100) + 5),
        spdef: Math.floor((2 * (safeBase.spdef || 0) * level / 100) + 5),
        speed: Math.floor((2 * (safeBase.speed || 0) * level / 100) + 5),
    };

    const calcStat = (base) => Math.floor( ( (2 * (base || 0)) * level / 100 ) + 5 );

    const calculated = {
        attack: calcStat(safeBase.atk),
        defense: calcStat(safeBase.def),
        spatk: calcStat(safeBase.spatk),
        spdef: calcStat(safeBase.spdef),
        speed: calcStat(safeBase.speed),
    };
    
    calculated.maxHp = Math.floor( ( (2 * (safeBase.hp || 0)) * level / 100 ) + level + 10 );

    return calculated;
}

async function nextBattleProgression() {
  // Incrémente indices Zone > Vague > Combat
  battleIndex += 1;
  if (battleIndex > 10) { battleIndex = 1; waveIndex += 1; }
  if (waveIndex > 10) { waveIndex = 1; zoneIndex += 1; }
  updateHud();

  // Sauvegarder la nouvelle progression via GameData
  GameData.setProgression(zoneIndex, waveIndex, battleIndex);

  // Restaurer les boutons de pré-combat
  const sideActions = document.getElementById('side-actions');
  if (sideActions) {
      sideActions.innerHTML = `
          <button class="pk-btn-action" id="start-battle-btn" onclick="startBattle()">DÉMARRER</button>
      `;
  }

    initBattleView();
    hideInfoPanel(); // Cacher le panneau d'info en retournant au pré-combat
    // On ne démarre pas la bataille suivante automatiquement, on retourne à l'écran de sélection.
    // L'équipe ennemie sera générée pour que le joueur puisse la voir.
    await Promise.all([loadPokedexDB(), loadBattleLevelsDB()]);
    buildActorsFromDom(); // Reconstruire les acteurs pour réinitialiser les stats/effets
    if (typeof prepareEnemyGridForNewBattle === 'function') prepareEnemyGridForNewBattle();
    if (typeof restorePlayerGridForNewBattle === 'function') restorePlayerGridForNewBattle();
    updateZMoveIndicators(); // Mettre à jour les Z-Moves pour la nouvelle progression

    setCombatActive(false); // Afficher l'écran de sélection pré-combat
}

// --- Classe Battle (intégration avec startBattle()) ---
class Battle {
  constructor() {
    this.turn = 0;
    this.battleLog = [];
  }

  async start() {
    console.log("[DEBUG] Battle.start() method called");
    window.isRunning = false; // Reset propre avant de commencer
    await sleep(50);
    initGlobals();
    setCombatActive(true);
    this.log("Le combat commence !");
    console.log("[DEBUG] Initializing battle view");
    initBattleView();
    await sleep(200); // Laisse le temps au DOM de se stabiliser
    console.log("[DEBUG] Calling beginBattleSequence()");
    await beginBattleSequence();
    console.log("[DEBUG] Battle.start() completed");
  }

  log(message) {
    try { console.log(message); } catch {}
    this.battleLog.push(message);
  }
}
