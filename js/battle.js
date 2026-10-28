// On utilise window.isRunning pour assurer une visibilité totale entre tous les fichiers
window.isRunning = false; 
window.globalTurnCount = 0;
window.currentTurnUnit = null; 
window.isAutoBattle = false;

// Traces du déroulé d'un combat : coupées par défaut (une ligne par action, ça ralentit la console).
// Pour les voir : localStorage.setItem('pokeroad_debug', '1') puis recharger.
const DEBUG_BATTLE = (() => { try { return localStorage.getItem('pokeroad_debug') === '1'; } catch { return false; } })();
function debugLog(...args) { if (DEBUG_BATTLE) console.log(...args); }

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
    const [statusMoves, specialMoves, physicalMoves] = await Promise.all([
      loadJSON('data/status_moves.json'),
      loadJSON('data/special_moves.json'),
      loadJSON('data/physical_moves.json')
    ]);

    MovesDB = { ...statusMoves, ...specialMoves, ...physicalMoves };
    if (typeof MoveRework !== 'undefined') await MoveRework.load();
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
    const res = await fetch('data/Rules.json');
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

// Vitesse : un seul bouton visible (la vitesse en cours) qui passe à la suivante à chaque toucher
function cycleBattleSpeed() {
  const order = [1, 2, 4];
  setBattleSpeed(order[(order.indexOf(battleSpeed) + 1) % order.length] || 1);
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
    const screen = document.querySelector('#view-battle .scaler-view');
    if (!screen || !el) return { x: 0, y: 0 };
    const screenRect = screen.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const scaleX = screenRect.width / screen.offsetWidth;
    const scaleY = screenRect.height / screen.offsetHeight;
    
    return {
        x: (elRect.left + elRect.width / 2 - screenRect.left) / (scaleX || 1),
        y: (elRect.top + elRect.height / 2 - screenRect.top) / (scaleY || 1)
    };
}

// Base de données des types
let TypesDB = null;
async function loadTypesDB() {
  if (TypesDB) return TypesDB;
  try {
    const res = await fetch('data/types.json');
    TypesDB = await res.json();
  } catch (e) {
    console.error("Failed to load types.json", e);
    TypesDB = {}; // Fallback
  }
  return TypesDB;
}

// Cases touchées par une zone d'attaque autour de la case visée t.
// Grilles en portrait : index = rangée × 3 + couloir (rangée 0 en haut de l'écran) ;
// la profondeur (avant / centre / arrière) dépend du camp, voir BattleRules.
function getAoeIndexes(aoeName, t, side) {
    const lane = t % 3;
    const depth = BattleRules.depthOfIndex(side, t);
    switch (aoeName) {
        case 'all':
            return [0, 1, 2, 3, 4, 5, 6, 7, 8];
        case 'row': // tout le couloir de la cible, de l'avant à l'arrière
            return [lane, lane + 3, lane + 6];
        case 'column': // toute la ligne de la cible (même profondeur)
            return BattleRules.lineIndexes(side, depth);
        case 'cross': {
            const adjacent = { 0:[1,3], 1:[0,2,4], 2:[1,5], 3:[0,4,6], 4:[1,3,5,7], 5:[2,4,8], 6:[3,7], 7:[6,8,4], 8:[7,5] };
            return [t, ...(adjacent[t] || [])];
        }
        case 'diagonal_x':
            if (t === 4) return [0, 2, 4, 6, 8];
            if ([0, 8].includes(t)) return [0, 4, 8];
            if ([2, 6].includes(t)) return [2, 4, 6];
            return [t];
        case 'frontline':
            return BattleRules.lineIndexes(side, 0);
        case 'midline':
            return BattleRules.lineIndexes(side, 1);
        case 'backline':
            return BattleRules.lineIndexes(side, 2);
        case 'splash_v': // la cible et ses voisins de ligne (gauche / droite)
            return [t, ...(lane > 0 ? [t - 1] : []), ...(lane < 2 ? [t + 1] : [])];
        case 'line_of_2': // perforation : la cible et la case juste derrière elle
            return depth < 2 ? [t, BattleRules.indexAt(side, depth + 1, lane)] : [t];
        default: // single, random_single (aperçu)
            return [t];
    }
}

function getAoePreviewIndexes(aoeName, primaryTargetIndex, targetSide) {
    return getAoeIndexes(aoeName, primaryTargetIndex, targetSide);
}

function getAoeTargets(aoeName, primaryTarget, targetSide) {
    const targetGrid = grid[targetSide];
    if (!targetGrid) return [];
    let indexes;
    if (aoeName === 'random_single') {
        const alive = targetGrid.map((unit, index) => (unit && !unit.isKO ? index : -1)).filter(i => i >= 0);
        indexes = alive.length ? [alive[Math.floor(Math.random() * alive.length)]] : [];
    } else {
        indexes = getAoeIndexes(aoeName || 'single', primaryTarget._index, targetSide);
    }
    return indexes.map(i => targetGrid[i]).filter(unit => unit && !unit.isKO);
}

// Motif d'une zone sur une grille 3×3 vue comme à l'écran : la grille ennemie, cible au centre
// (la ligne avant ennemie est en bas, face à ton équipe)
function getAoePatternForDisplay(aoeName) {
    const pattern = new Array(9).fill(false);
    getAoeIndexes(aoeName, 4, 'enemy').forEach(i => { if (i >= 0 && i < 9) pattern[i] = true; });
    return pattern;
}

const AOE_NAMES_FR = {
    single: 'Cible unique',
    all: 'Tous',
    row: 'Colonne',
    column: 'Ligne',
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

    // Même repère que getElementCenter : la scène de combat mise à l'échelle
    const screen = document.querySelector('#view-battle .scaler-view');
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
    setTimeout(() => textEl.remove(), 1500 / battleSpeed);
}

function getSlotEl(side, index) {
  if (!dom || !Number.isInteger(index)) return null;
  const gridEl = side === 'player' ? dom.playerGrid : dom.enemyGrid;
  if (!gridEl) return null;
  const slots = gridEl.querySelectorAll('.unit-slot');
  return slots[index] || null;
}

function handleGridHover(event) {
    // Remplacé par la grande fiche au survol (js/info-tip.js) : une seule fiche à la fois
    return;
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

const STAT_MOD_PERCENT_PER_STACK = 0.20;

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

function getEffectiveSpeed(unit) {
    const baseSpeed = unit.speed || 0;
    const slotIndex = unit._index || 0;
    let modifier = 1.0;

    // Ligne avant : +10 % de vitesse, ligne arrière : −10 %
    const line = BattleRules.rowOfIndex(unit._side, slotIndex);
    if (line === 'front') modifier = 1.1;
    else if (line === 'back') modifier = 0.9;
    
    // Multiplicateur supplémentaire (ex: baie Sailak)
    const extraMult = unit.speedMultiplier || 1.0;
    const stageMult = unit.statMods ? getStatMultiplier(unit.statMods.SPE || 0) : 1.0;
    let finalSpeed = baseSpeed * modifier * extraMult * stageMult;

    // Appliquer paralysie
    if (unit.activeEffects && unit.activeEffects.some(e => e.id === 'STAT_PAR')) {
        finalSpeed *= 0.7; // Réduction de 30%
    }

    // Distorsion : les plus lents agissent en premier
    if (typeof BattleRules !== 'undefined' && BattleRules.speedInverted()) finalSpeed = 10000 / Math.max(1, finalSpeed);

    return finalSpeed;
}

// --- Dégâts (style Pokémon) ---
function computeDamage(attacker, defender, move, options = {}) {
    let power = move.power || 0;
    if (move._isBoosted && !move.rw) {
        power = getZPower(power);
        // Si le Z-Move est une attaque de zone, on applique une réduction de 25% pour l'équilibrage.
        if (move.aoe && move.aoe !== 'single' && move.aoe !== 'random_single') {
            power = Math.floor(power * 0.75);
        }
    }
    if (power === 0 || move.damage_class === 'status') return { damage: 0, typeMod: 1.0 };

    // Dégâts fixes (Frappe Atlas, Croc Fatal, K.O. en un coup…) : seule l'immunité de type compte
    const executed = typeof MoveRework !== 'undefined' ? MoveRework.executeDamage(attacker, defender, move) : null;
    if (executed !== null) return { damage: executed, typeMod: 1, isCrit: false, executed: true };
    const fixed = BattleRules.fixedDamage(attacker, defender, move);
    if (fixed !== null) {
        const fixedType = BattleRules.moveTypeFor(attacker, move);
        const immune = getTypes(defender).some(t => getTypeModifier(fixedType, t) === 0);
        return { damage: immune ? 0 : Math.max(0, Math.floor(fixed)), typeMod: immune ? 0 : 1, isCrit: false };
    }
    if (!move._isBoosted) power = BattleRules.dynamicPower(attacker, defender, move) ?? power;
    power = power * (move._refMult || 1); // amélioration de l'attaque (Laboratoire)
    power = Math.round(power * BattleRules.powerMultiplier(attacker, defender, move));

    const isPhysical = move.damage_class === 'physical';

    // --- NOUVEAU: Prise en compte des modificateurs de stats ---
    const attackerAtkMod = attacker.statMods[isPhysical ? 'ATK' : 'SPA'] || 0;
    const defenderDefMod = defender.statMods[isPhysical ? 'DEF' : 'SPD'] || 0;

    const atkMultiplier = getStatMultiplier(attackerAtkMod);
    const defMultiplier = getStatMultiplier(defenderDefMod);

    const atk = (isPhysical ? (attacker.attack || 10) : (attacker.spatk || 10)) * atkMultiplier;
    const def = BattleRules.defenseStat(defender, isPhysical) * defMultiplier;
    // --- FIN NOUVEAU ---

    // Application littérale de la formule de dégâts Gen 4 avec arrondi entier à chaque étape.
    let damage = Math.floor(attacker.level * 2 / 5);
    damage += 2;
    damage = Math.floor(damage * power); // power est déjà ajusté pour les Z-moves
    damage = Math.floor(damage * atk / 50);
    damage = Math.floor(damage / Math.max(1, def));

    // Mod1 : la brûlure réduit les dégâts infligés
    if (attacker.activeEffects && attacker.activeEffects.some(e => e.id === 'STAT_BRU') && !(typeof HeldItems !== 'undefined' && HeldItems.ignoresBurnPenalty(attacker))) {
        const burnRule = RulesDB && RulesDB['STAT_BRU'];
        damage = Math.floor(damage * (1 + (burnRule ? burnRule.effect_value : -30) / 100));
    }
    damage += 2;

    // Coup critique : 6.25% / 12.5% / 50% / 100% selon le palier
    const critStage = clamp((attacker.statMods.CRIT || 0) + (move.crit_rate_stage || 0) + (typeof HeldItems !== 'undefined' ? HeldItems.critStages(attacker) : 0), 0, MAX_CRIT_STAGE);
    const critChance = [6.25, 12.5, 50, 100][critStage];
    const forcedCrit = attacker.flags?.nextCrit && !options.noRandom;
    const isCrit = !defender.flags?.noCrit && (forcedCrit || (!options.noRandom && Math.random() * 100 < critChance));
    if (isCrit) damage = Math.floor(damage * 1.5);

    // Random (R) — l'IA estime avec la moyenne (92%)
    const randomFactor = options.noRandom ? 92 : Math.floor(Math.random() * (100 - 85 + 1)) + 85;
    damage = Math.floor(damage * randomFactor / 100);

    // STAB
    const attackerTypes = getTypes(attacker);
    const moveType = BattleRules.moveTypeFor(attacker, move);
    const stab = attackerTypes.includes(moveType) ? 1.5 : 1.0;
    damage = Math.floor(damage * stab);

    // Lignes, rôles, synergies, météo et champs
    damage = Math.floor(damage * BattleRules.damageMultiplier(attacker, defender, move, moveType));

    // Type effectiveness
    const defenderTypes = getTypes(defender);
    let typeMod = 1.0;
    for (const defenderType of defenderTypes) {
        typeMod *= getTypeModifier(moveType, defenderType);
    }
    damage = Math.floor(damage * typeMod);
    
    // Objets tenus et baies (js/held-items.js) : bonus de l'attaquant, résistances du défenseur
    if (typeof HeldItems !== 'undefined') {
        const itemCtx = { moveType, typeMod, isCrit, estimate: !!options.noRandom, cellMult: options.cellMult, contact: BattleRules.isContact(move), contactMove: BattleRules.isContact(move) };
        damage = Math.floor(damage * HeldItems.offenseMult(attacker, defender, move, itemCtx) * HeldItems.defenseMult(defender, attacker, move, itemCtx));
    }
    // Synergies du défenseur : Ancrage (Sol), Blindage (Acier)
    if (typeof Synergies !== 'undefined') damage = Math.floor(damage * Synergies.defenseMult(defender, { typeMod }));

    // Mod3 (non implémenté)

    if (typeMod === 0) return { damage: 0, typeMod, isCrit: false };
    return { damage: Math.max(1, damage), typeMod, isCrit };
}

// Normalise move.effect : "", "STAT_PAR", ["A","B"] ou '["A", "B"]' (chaîne JSON) -> tableau d'IDs
function getMoveEffects(move) {
    let effect = move && move.effect;
    if (!effect) return [];
    if (typeof effect === 'string' && effect.trim().startsWith('[')) {
        try { effect = JSON.parse(effect); } catch { return []; }
    }
    return (Array.isArray(effect) ? effect : [effect]).filter(Boolean);
}

// Statistique visée par une modification de stat (certaines capacités n'ont pas effect_target_stat)
function getEffectTargetStats(move, effectId) {
    if (move.effect_target_stat) {
        return Array.isArray(move.effect_target_stat) ? move.effect_target_stat : [move.effect_target_stat];
    }
    if (effectId === 'MOD_CRIT') return ['CRIT'];
    if (effectId === 'MOD_PRE') return [(move.zone === 'self' || move.zone === 'ally') ? 'EVA' : 'PRE'];
    return [];
}

// Durée en tours d'un statut appliqué (les statuts majeurs durent jusqu'à la fin du combat)
function getEffectDuration(effectId, rule, move) {
    switch (effectId) {
        case 'STAT_PAR': case 'STAT_BRU': case 'STAT_PSN': case 'STAT_NO_REVIVE':
            return 'permanent';
        case 'STAT_SOM':
        case 'STAT_GEL':
            return rule.max_duration || 3;
        case 'STAT_CONF':
            return 2 + Math.floor(Math.random() * 4); // 2 à 5 tours
        case 'STAT_FLINCH':
            return 1;
    }
    if (move.duration > 1) return move.duration;
    return Number.isFinite(rule.duration) ? rule.duration : 3;
}

function applyEffect(attacker, target, move) {
    if (!RulesDB) return;

    const effects = getMoveEffects(move);
    if (effects.length === 0) return;

    // Effet secondaire d'une attaque offensive : probabilité (100% par défaut pour les capacités de statut)
    if (move.damage_class !== 'status') {
        const chance = Number.isFinite(move.effect_chance) ? move.effect_chance : 100;
        if (Math.random() * 100 >= chance) return;
    }
    
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

        // 'self' : le lanceur ; 'ally' : l'allié ciblé ; sinon la cible ennemie
        const effectTarget = (move.zone === 'self' || move.effect_self) ? attacker : target;
        if (effectTarget.isKO) return;

        // Empêche le cumul des statuts majeurs non cumulables
        if (rule.category === 'Majeur' && !rule.cumulable) {
            if (effectTarget.activeEffects.some(e => RulesDB[e.id]?.category === 'Majeur')) {
                spawnEffectText(effectTarget, "Échoue", 'info');
                return;
            }
        }

        const v_stat_count = v_stat_counts[index] || v_stat_counts[0] || 0;
        const duration = getEffectDuration(effectId, rule, move);

        // Un statut non cumulable déjà présent n'est pas réappliqué
        if (!rule.cumulable && effectTarget.activeEffects.some(e => e.id === effectId)) return;

        switch (rule.category) {
            case 'Majeur':
            case 'Mineur':
            case 'Effet':
                effectTarget.activeEffects.push({
                    id: effectId,
                    duration: duration,
                    source: attacker.id
                });
                spawnEffectText(effectTarget, rule.name, 'status');
                break;

            case 'V-Stat':
                const statsToModify = getEffectTargetStats(move, effectId);
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
                    BattleRules.heal(effectTarget, effectTarget.maxHp * (healPercent / 100), attacker);
                }
                // ACTION_REVIVE needs special handling, maybe outside this function.
                break;
            
            case 'Buff':
                 if (effectId === 'BUFF_SHIELD') {
                     effectTarget.shield = Math.floor(effectTarget.maxHp * (rule.effect_value || 20) / 100);
                     spawnEffectText(effectTarget, rule.name, 'buff');
                     break;
                 }
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

function updateBattleHud() {
  const hud = dom.hudProgress || document.getElementById('hudProgress');
  const zone = getZoneInfo(zoneIndex);
  const isBoss = battleIndex === 10;

  if (hud) {
    hud.innerHTML = `
      <span class="hud-zone">${zone.name}</span>
      <span class="hud-step" title="Vague ${waveIndex} sur 10">V <b id="hudWave">${waveIndex}</b>/10</span>
      <span class="hud-step ${isBoss ? 'boss' : ''}" title="Combat ${battleIndex} sur 10">${isBoss ? 'BOSS' : `C <b id="hudBattle">${battleIndex}</b>/10`}</span>
      ${Epic.rankChip(zoneIndex, { short: true })}`;
  }
  // Éclairage et particules de l'arène selon le rang de la zone
  Epic.applyArena(zoneIndex);

  // Décor dessiné selon le biome de la zone
  const sceneLayer = document.getElementById('battle-scene');
  if (sceneLayer && sceneLayer.dataset.scene !== zone.biome) {
    sceneLayer.dataset.scene = zone.biome;
    Art.hydrate(sceneLayer.parentElement);
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
  updateBattleHud();
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
    // Grade et étoiles : la sauvegarde pour nos Pokémon, le palier pour les ennemis
    const pk = unit._instanceId && typeof GameData !== 'undefined' ? GameData.getPokemons().find(p => p.instanceId === unit._instanceId) : null;
    const grade = pk ? (pk.refinementLevel || 1) : (unit.tier?.grade || 1);
    const stars = pk ? (pk.refinementStars || 0) : (unit.tier?.stars || 0);
    const hpPct = Math.max(0, Math.min(100, unit.hp / unit.maxHp * 100));
    const z = Math.min(100, Math.round(unit.boostGauge || 0));
    const ap = Math.max(0, Math.min(100, Math.round(unit.actionPoints || 0)));
    const types = (unit.types || []).map(t => `<span class="chip type-${t}">${typeof formatTypeLabel === 'function' ? formatTypeLabel(t) : t}</span>`).join('');
    // Objets tenus et baies : icônes à droite (grisées une fois utilisées), effet dans l'infobulle ;
    // les emplacements débloqués mais vides restent visibles en pointillés
    const slots = typeof GameData !== 'undefined' && GameData.getHoldSlots ? GameData.getHoldSlots({ refinementLevel: pk ? grade : grade * 2 }) : { items: 1, berries: 1 };
    const itemChip = id => `<span class="held-chip tud-item ${unit._usedItems?.has(id) ? 'used' : ''} ${unit._itemsOff ? 'off' : ''}" data-item="${id}" data-side="${unit._side}" data-index="${unit._index}">${Art.item(id, 30)}</span>`;
    const group = (ids, n, kind) => {
        const list = (ids || []).slice(0, Math.max(n, (ids || []).length));
        const empty = Math.max(0, n - list.length);
        return list.map(itemChip).join('') + Array.from({ length: empty }, () => `<span class="tud-item tud-empty ${kind}" title="${kind === 'berry' ? 'Emplacement de baie libre' : "Emplacement d’objet libre"}"></span>`).join('');
    };
    const held = `<span class="tud-group">${group(unit.heldItems, slots.items, 'item')}</span><span class="tud-group">${group(unit.berries, slots.berries, 'berry')}</span>`;

    // Fiche du Pokémon actif : portrait, nom, niveau (couleur du grade), étoiles, types, PV chiffrés, jauge Z
    dom.turnUnitDisplay.innerHTML = `
        <div class="tud-portrait"><img src="${sprite}" alt="${unit.name}" style="transform: ${unit._side === 'player' ? 'scaleX(-1)' : 'scaleX(1)'};" id="turn-unit-sprite"></div>
        <div class="tud-main">
            <div class="tud-line">
                <span class="turn-unit-name" id="turn-unit-name">${unit.name}</span>
                <span class="tud-lvl g${Math.min(6, pk ? Math.ceil(grade / 2) : grade)}" title="Niveau ${unit.level} · Grade ${grade}">${unit.level}</span>
                ${stars ? `<span class="tud-stars">★${stars}</span>` : ''}
                <span class="tud-types">${types}</span>
            </div>
            <div class="tud-hp ${hpPct < 25 ? 'low' : hpPct < 50 ? 'mid' : ''}"><div class="tud-hp-fill" style="width:${hpPct}%"></div><span class="turn-unit-hp no-minfont" id="turn-unit-hp">${Math.max(0, unit.hp)} / ${unit.maxHp}</span></div>
            <div class="tud-gauges">
                <div class="tud-ap" title="Jauge d'action"><div style="width:${ap}%"></div></div>
                <div class="tud-z ${z >= 100 ? 'full' : ''}" title="Jauge Z ${z} %"><div style="width:${z}%"></div></div>
            </div>
        </div>
        <div class="tud-items">${held}</div>
    `;
}



function updateStatusIcons(unit) {
    // Vignettes carrées au-dessus du Pokémon (js/unit-tiles.js)
    if (unit && typeof UnitTiles !== 'undefined') UnitTiles.render(unit);
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


  // Le bouclier absorbe les dégâts avant les PV
  if (target.shield > 0 && pendingDamage > 0) {
      const absorbed = Math.min(target.shield, pendingDamage);
      target.shield -= absorbed;
      pendingDamage -= absorbed;
      if (target.shield <= 0) spawnEffectText(target, "Bouclier brisé", 'info');
  }

  // Objets (Ceinture Force, Bandeau), puis refonte : Ténacité (coup fatal), passifs « sous 50 % de PV »
  if (typeof HeldItems !== 'undefined' && pendingDamage > 0) pendingDamage = HeldItems.beforeHpLoss(target, pendingDamage);
  if (typeof MoveRework !== 'undefined' && pendingDamage > 0) pendingDamage = MoveRework.beforeHpLoss(target, pendingDamage);
  const hpBefore = target.hp;
  target.hp = Math.max(0, target.hp - pendingDamage);
  const newHp = target.hp;
  if (typeof MoveRework !== 'undefined' && newHp > 0) MoveRework.afterHpLoss(target, hpBefore);
  // Baies et objets « sous X % de PV »
  if (typeof HeldItems !== 'undefined' && newHp > 0) HeldItems.afterHpLoss(target, hpBefore);


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
        const pct = Math.max(0, Math.round((target.hp / (target.maxHp || 1)) * 100));
        setHpFillVisual(fill, pct);
      }, 50);
    }
  }

  if (newHp <= 0 && !target.isKO) {
    target.isKO = true;
    const slot = getSlotEl(target._side, target._index);
    if (slot) {
      // Éclatement du sprite, « K.O. ! » (avant que le sprite disparaisse)
      if (typeof BattleAnimation !== 'undefined' && BattleAnimation.knockOut) BattleAnimation.knockOut(slot, target);
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
    const keys = base.slice(0, 4);
    // Sans attaque offensive, un Pokémon ne peut rien faire : on ajoute Charge
    // (sauf si le joueur a choisi lui-même ses capacités : avec seulement des passifs, il ne joue pas)
    const chosen = pk?.instanceId && Array.isArray(pk?.selectedMoves) && pk.selectedMoves.length;
    if (!chosen && !keys.some(k => (db[k]?.power || 0) > 0)) {
        if (keys.length >= 4) keys.pop();
        keys.push('tackle');
    }
    return keys.map(key => {
      const info = db[key] || {};
      // Si damage_class n'est pas défini, on essaie de le deviner : sans puissance > 0 -> statut, sinon -> physique.
      const damage_class = info.damage_class || (info.power > 0 ? 'physical' : 'status');
      return MoveRework.normalize({
          ...info, // Copie toutes les données du JSON (effect, v_stat_count, etc.)
          // Amélioration de l'attaque (Laboratoire) : multiplie sa puissance
          _refMult: (pk?.moveRefinements?.[key] ? Refinement.getMultiplier(Refinement.levelOf(pk.moveRefinements[key]), Refinement.starsOf(pk.moveRefinements[key])) : 1),
          id: key,
          name: info.name_fr || key,
          type: (info.type || firstTypeFrom(pk)).toLowerCase(),
          damage_class: damage_class,
          description: info.description_game || info.description_fr || '',
      });
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
      heldItems: [...(srcPk.heldItems || [])].filter(Boolean),
      berries: [...(srcPk.berries || [])].filter(Boolean),
    };
    // Niveau d'Atelier de chaque objet porté
    actor.itemMults = {};
    [...actor.heldItems, ...actor.berries].forEach(id => {
        const ref = GameData.getGlobalItemRefinement(id);
        actor.itemMults[id] = Refinement.getMultiplier(Refinement.levelOf(ref), Refinement.starsOf(ref));
    });
    // Compatibilité : l'ancien code lit un objet et une baie
    actor.heldItem = actor.heldItems[0] || actor.berries[0] || null;
    actor.itemMult = actor.itemMults[actor.heldItem] || 1;
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
        debugLog(`Actor ${actor.name} built with boosted move ID: ${actor._boostedMoveId}`);
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
    
    actor.isBoss = unit.dataset.boss === '1';
    const tier = unit.dataset.tier ? JSON.parse(unit.dataset.tier) : null;
    if (tier) {
        const statMult = Refinement.getMultiplier(tier.grade, tier.stars);
        ['attack', 'defense', 'spatk', 'spdef', 'speed', 'maxHp'].forEach(k => { actor[k] = Math.round(actor[k] * statMult); });
        actor.hp = actor.maxHp;
        actor.heldItem = tier.item || null;
        actor.itemMult = Refinement.getMultiplier(tier.itemLevel, tier.itemStars);
        actor.heldItems = tier.items || (tier.item ? [tier.item] : []);
        actor.berries = tier.berries || [];
        actor.itemMults = Object.fromEntries([...actor.heldItems, ...actor.berries].map(id => [id, actor.itemMult]));
        actor.tier = tier;
    }
    const power = enemyPowerMult();
    if (power !== 1) {
        ['attack', 'defense', 'spatk', 'spdef', 'maxHp'].forEach(k => { actor[k] = Math.round(actor[k] * power); });
        actor.hp = actor.maxHp;
    }
    if (srcPk) {
      // Attaques choisies par le générateur d'équipes (sinon les premières apprises), améliorées selon la progression
      const chosen = unit.dataset.moves ? unit.dataset.moves.split(',').filter(Boolean) : null;
      const enemyRefs = tier && chosen ? Object.fromEntries(chosen.map(k => [k, { level: tier.moveLevel, stars: tier.moveStars }])) : undefined;
      actor.moves = resolveSelectedMoves(chosen ? { ...srcPk, selectedMoves: chosen, moveRefinements: enemyRefs } : srcPk, level);
      // Assigner un Z-Move à l'ennemi
      const damagingMoves = actor.moves.filter(m => m.power > 0);
      if (damagingMoves.length > 0) {
          const baseMove = damagingMoves[Math.floor(Math.random() * damagingMoves.length)];
          actor._boostedMoveId = baseMove.id;
          debugLog(`[AI Setup] ${actor.name} a reçu un Z-Move basé sur ${baseMove.name}`);
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
  if (typeof FieldFx !== 'undefined') FieldFx.update(); // le terrain suit la météo, les champs et les pièges
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
        _slot: BattleRules.slotOf(u),
        actionPoints: u.actionPoints,
        effectiveSpeed: u.effectiveSpeed,
        boostGauge: u.boostGauge || 0
    }));

    const turnPrediction = [];
    const maxTurnsToShow = 8;
    while (turnPrediction.length < maxTurnsToShow && simUnits.length > 0) {
        // Trier par AP pour voir qui est le plus proche de jouer
        simUnits.sort((a, b) => b.actionPoints - a.actionPoints || a._slot - b._slot);

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
        container.__unit = unit; // toucher : fiche de combat (js/info-modal.js)

        const boostGauge = document.createElement('div');
        boostGauge.className = 'timeline-boost-gauge';
        const boostFill = document.createElement('div');
        boostFill.className = 'timeline-boost-fill';
        boostFill.style.width = `${Math.min(100, unit.boostGauge || 0)}%`;
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


// Objets et baies portés (barrés une fois utilisés, grisés sous Zone Magique)
function heldItemsHtml(unit) {
    const ids = [...(unit.heldItems || []), ...(unit.berries || [])];
    if (!ids.length) return '';
    const chip = id => {
        const it = typeof GameData !== 'undefined' ? GameData.getItem(id) : null;
        const used = unit._usedItems?.has(id);
        const v = typeof HeldItems !== 'undefined' && HeldItems.spec(id) ? Math.round(HeldItems.valueOf(unit, id) * 10) / 10 : null;
        const title = (it?.effect_fr || '').replace(/"/g, '&quot;');
        return `<span class="held-chip ${used ? 'used' : ''} ${unit._itemsOff ? 'off' : ''}" title="${title}" data-item="${id}" data-side="${unit._side}" data-index="${unit._index}">${Art.item(id, 22)}${it?.name_fr || id}${v != null ? ` <small>${v}</small>` : ''}</span>`;
    };
    return `<div class="info-item held-items-line" style="flex-basis: 100%;"><strong>Objets :</strong> ${ids.map(chip).join(' ')}</div>`;
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
        const modifierStage = unit.statMods?.[statKey] || 0;

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
            <div class="info-item" style="flex-basis: 100%;"><strong>Effets :</strong> ${typeof UnitTiles !== 'undefined' ? UnitTiles.describe(unit) : effectsHtml}</div>
            ${heldItemsHtml(unit)}
            ${unit._side === 'player' && unit._instanceId ? `<button class="pk-btn-action small info-sheet-link" onclick="PokeSheet.open('${unit._instanceId}')">Fiche complète</button>` : ''}
        </div>
    `;
    dom.infoDisplayPanel.classList.remove('terrain-mode');
    dom.infoDisplayPanel.classList.add('visible');
}

function showTerrainInfo() {
    if (!dom.infoDisplayPanel) return;
    const parts = typeof BattleRules !== 'undefined' ? BattleRules.describeField() : ['Météo : Clair', 'Terrain : Normal'];
    dom.infoDisplayPanel.innerHTML = `<div class="info-section">${parts.map(p => `<span class="info-item">${p}</span>`).join('')}</div>`;
    // État par défaut : simple bandeau entre les deux camps (les fiches s'affichent en haut)
    dom.infoDisplayPanel.classList.add('visible', 'terrain-mode');
    // Temps clair et terrain normal : rien à signaler, le bandeau se cache
    dom.infoDisplayPanel.classList.toggle('field-default', parts.every(p => /: (Clair|Normal)$/.test(p)));
    if (typeof FieldFx !== 'undefined') FieldFx.update(); // météo, champ et pièges visibles sur le plateau
    // Pastilles sous le bandeau : seulement ce qui sort de l'ordinaire (détail dans l'infobulle)
    const chips = document.getElementById('field-chips');
    if (chips) {
        const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        chips.innerHTML = parts.filter(p => !/: (Clair|Normal)$/.test(p)).map(p => {
            const kind = /^Météo/.test(p) ? 'weather' : /^Terrain/.test(p) ? 'terrain' : /^Chez toi/.test(p) ? 'hazard-me' : /^Chez l/.test(p) ? 'hazard-foe' : 'room';
            // Libellé court sur la pastille, le texte complet dans l'infobulle
            const SHORT = { 'Tempête de sable': 'Sable', 'Ciel Ombre': 'Ombre', 'Champ Herbu': 'Herbu', 'Champ Électrifié': 'Électrifié', 'Champ Psychique': 'Psychique', 'Champ Brumeux': 'Brumeux', 'Pics Toxik': 'Toxik', 'Piège de Roc': 'Roc', 'Toile Gluante': 'Toile' };
            const label = p.replace(/^[^:]+:\s*/, '').split(', ').map(x => x.replace(/^([^×]+?)(\s*×\d+)?$/, (m, n, l) => (SHORT[n.trim()] || n.trim()) + (l || ''))).join(' · ');
            return `<span class="field-chip fc-${kind}" data-tip="${esc(p)}">${esc(label)}</span>`;
        }).join('');
    }
}

function showMoveDetails(move, unit, isZMove = false) {
    if (!dom.infoDisplayPanel || !move) return;
    if (move.rw && typeof MoveRework !== 'undefined') return showReworkMoveDetails(move, unit, isZMove);

    let power = move.power ?? '—';
    const accuracy = move.accuracy ?? '—';
    const typeName = typeToFrench(move.type);
    const damageClass = (move.damage_class === 'physical' ? 'Physique' : (move.damage_class === 'special' ? 'Spéciale' : 'Statut'))
        + ((move.power || 0) > 0 && move.damage_class !== 'status' ? (BattleRules.isContact(move) ? ' · Contact (1er ennemi de sa colonne)' : ' · Distance (sa colonne et les voisines)') : '');
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
    dom.infoDisplayPanel.classList.remove('terrain-mode');
    dom.infoDisplayPanel.classList.add('visible');
}

// Contenu d'un bouton d'attaque : nom, puis genre · puissance · portée (ou un libellé imposé)
function moveBtnHtml(mv, sub = null, isZ = false) {
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (sub == null) {
        const rw = mv.rw || {};
        const parts = [];
        if (rw.kind === 'tactic') parts.push('Tactique');
        else if (mv.damage_class === 'status' && rw.kind !== 'attack') parts.push('Statut');
        else {
            parts.push('Attaque');
            const power = Math.round((rw.power || mv.power || 0) * (mv._refMult || 1));
            if (power) parts.push(power);
            if (typeof BattleRules !== 'undefined') parts.push(BattleRules.isContact(mv) ? 'contact' : 'distance');
        }
        sub = parts.join(' · ');
    }
    // Mini-zone : la forme touchée (3 × 3), ou « Z » quand l'attaque Z est prête
    let zone = '';
    if (isZ) zone = '<span class="mb-z">Z</span>';
    else if (typeof MoveRework !== 'undefined') {
        const pat = MoveRework.displayPattern(mv);
        if (pat?.values?.length === 9) zone = `<span class="mb-zone">${pat.values.map(v => `<i class="${v > 0 ? 'on' : ''}"></i>`).join('')}</span>`;
    }
    return `<span class="mb-stripe"></span><span class="mb-text"><span class="mb-name">${esc(mv.name)}</span><span class="mb-sub no-minfont">${esc(sub)}</span></span>${zone}`;
}

async function renderMovesForUnit(unit) {
  await Promise.all([loadMovesDB(), loadTypesDB()]);
  if (!dom.movesRow || !dom.targetPrompt) return Promise.resolve();
  dom.movesRow.innerHTML = '';
  const moves = Array.isArray(unit.moves) && unit.moves.length ? unit.moves : defaultMovesFor(unit);
  if (dom.targetPrompt) dom.targetPrompt.style.display = 'none';
  // Attaques verrouillées (objet Choix, Veste de Combat) : affichées grisées, avec la raison
  const locked = (unit._lockedMoves || []).slice(0, Math.max(0, 4 - Math.min(4, moves.length)));
  setTimeout(() => locked.forEach(({ move: lm, reason }) => {
    if (!dom.movesRow || dom.movesRow.children.length >= 4) return;
    const b = document.createElement('button');
    b.className = 'move-btn is-locked';
    b.setAttribute('aria-disabled', 'true');
    b.style.setProperty('--type-color', `var(--type-${(lm.type || 'normal').toLowerCase()})`);
    b.innerHTML = moveBtnHtml(lm, `Bloquée · ${reason}`);
    b.__move = lm; b.__unit = unit;
    dom.movesRow.appendChild(b);
  }), 0);
  moves.slice(0, 4).forEach(mv => {
    const btn = document.createElement('button');
    btn.className = 'move-btn';
    btn.__move = mv; btn.__unit = unit; // appui long : fiche complète (js/info-modal.js)

    const isZMoveReady = unit._boostedMoveId === mv.id && unit.boostGauge >= 100;

    if (unit._boostedMoveId === mv.id) {
        btn.classList.add('is-z-move-base'); // Always show the 'Z' badge if it's the base move
    }

    if (isZMoveReady) {
        btn.innerHTML = moveBtnHtml(mv, 'Attaque Z prête', true); // version Z
        btn.classList.add('z-ready');
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

    btn.innerHTML = moveBtnHtml(mv);
    const type = (mv.type || 'normal').toLowerCase();
    btn.style.setProperty('--type-color', `var(--type-${type})`);
    const passive = typeof MoveRework !== 'undefined' && MoveRework.isPassive(mv);
    if (passive) {
        // Un passif occupe un emplacement mais ne se lance jamais : il se déclenche seul
        btn.classList.add('is-passive');
        btn.innerHTML = moveBtnHtml(mv, 'Passif' + (mv.rw?.triggerLabel ? ` · ${mv.rw.triggerLabel}` : ''));
        btn.setAttribute('aria-disabled', 'true');
        btn.addEventListener('mouseover', () => showMoveDetails(mv, unit, false));
        btn.addEventListener('click', () => showMoveDetails(mv, unit, false));
        btn.addEventListener('mouseout', showTerrainInfo);
        dom.movesRow.appendChild(btn);
        return;
    }
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
      const AUTO_SHAPES = ['onde', 'tempete', 'front', 'salve', 'hasard', 'onde_forte', 'tempete_forte', 'salve_z'];
      const autoTarget = mv.rw?.kind === 'attack' ? AUTO_SHAPES.includes(mv.rw.shape) : ['all', 'random_single'].includes(mv.aoe);
      if (autoTarget) {
        const potentialTargets = aliveOnSide('enemy');
        if (potentialTargets.length > 0) {
          clearActionUI();
          await attack(unit, potentialTargets[0], mv);
          if (dom._resolveTurn) dom._resolveTurn();
          dom._resolveTurn = null;
        } else {
          if (dom.targetPrompt) {
            BattleAnimation.say('Aucune cible valide.');
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
            const zBar = unitEl.querySelector('.z-bar');
            if (zBar) {
                zBar.querySelector('.z-fill').style.width = `${displayPercent}%`;
                zBar.classList.toggle('full', displayPercent >= 100);
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
        const valid = !!(grid.enemy[idx] && !grid.enemy[idx].isKO) && BattleRules.canTarget(unit, move, grid.enemy[idx]);

        if (valid) hasTarget = true;
        slot.classList.toggle('targetable', valid);
        // Pokémon présent mais hors de portée (colonne pour le contact et la distance, Plongée…) : grisé
        slot.classList.toggle('not-targetable', !valid && !!(grid.enemy[idx] && !grid.enemy[idx].isKO));
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
            document.querySelectorAll('#enemy-grid .unit-slot.aoe-highlight, #enemy-grid .unit-slot.aoe-confirm').forEach(s => s.classList.remove('aoe-highlight', 'aoe-confirm'));
            slots.forEach(s => s.classList.remove('targetable', 'not-targetable'));
            dom.enemyGrid.classList.remove('is-targeting');
            if (typeof InfoTip !== 'undefined') InfoTip.hide(); // le détail de l'attaque se range
            if (dom.targetPrompt) {
                dom.targetPrompt.style.display = 'none';
                dom.targetPrompt.textContent = '';
            }
            currentTargetingController = null;
        };

        controller.signal.addEventListener('abort', () => { cleanup(); resolve(false); });

        // Cases que l'attaque touchera si elle part sur la case `idx` (forme de zone de la refonte)
        const hitIndexesFor = (idx) => {
            const target = grid.enemy[idx];
            if (!target || target.isKO) return [];
            return (move.rw?.kind === 'attack' && typeof MoveRework !== 'undefined')
                ? [...new Set(MoveRework.previewHits(move, unit, target).map(h => h.unit._index))]
                : getAoePreviewIndexes(move.aoe || 'single', idx, 'enemy');
        };
        const paint = (cls, indexes) => {
            document.querySelectorAll(`#enemy-grid .unit-slot.${cls}`).forEach(s => s.classList.remove(cls));
            indexes.forEach(i => getSlotEl('enemy', i)?.classList.add(cls));
        };
        const slotUnder = (e) => {
            const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('#enemy-grid .unit-slot');
            const idx = el ? slots.indexOf(el) : -1;
            return idx >= 0 && slots[idx].classList.contains('targetable') ? idx : -1;
        };

        const launch = async (idx) => {
            const target = grid.enemy[idx];
            if (!target || target.isKO) return;
            // Annuler les autres listeners et nettoyer l'UI
            cleanup();
            ev.abort(); // plus d'écoute du ciblage
            // Si c'est une attaque boostée, on vide la jauge
            if (move._isBoosted) {
                unit.boostGauge = 0;
                // On ne nettoie pas l'UI des actions car le tour du joueur n'est pas forcément terminé
                updateZMoveIndicators();
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
        };

        // Écouteurs du ciblage : coupés au lancement de l'attaque ou à l'annulation
        const ev = new AbortController();
        controller.signal.addEventListener('abort', () => ev.abort());
        dom.enemyGrid.classList.add('is-targeting'); // (plus de message : les couleurs orange / rouge suffisent)

        // Survol à la souris : les Pokémon réellement touchés passent en rouge
        slots.forEach((slot, idx) => {
            // (pressed vaut -1 hors appui : tester « < 0 », pas « ! »)
            slot.addEventListener('mouseenter', () => { if (pressed < 0) paint('aoe-highlight', slot.classList.contains('targetable') ? hitIndexesFor(idx) : []); }, { signal: ev.signal });
            slot.addEventListener('mouseleave', () => { if (pressed < 0) paint('aoe-highlight', []); }, { signal: ev.signal });
        });

        // Appui maintenu (doigt ou souris) : les Pokémon touchés passent en rouge ; relâcher lance l'attaque
        let pressed = -1;
        dom.enemyGrid.addEventListener('pointerdown', (e) => {
            const idx = slotUnder(e);
            if (idx < 0) return;
            e.preventDefault();
            pressed = idx;
            paint('aoe-highlight', []);
            paint('aoe-confirm', hitIndexesFor(idx));
        }, { signal: ev.signal });
        document.addEventListener('pointermove', (e) => {
            if (pressed < 0) return;
            const idx = slotUnder(e);
            if (idx >= 0 && idx !== pressed) { pressed = idx; paint('aoe-confirm', hitIndexesFor(idx)); }
            if (idx < 0) paint('aoe-confirm', []);
        }, { signal: ev.signal });
        document.addEventListener('pointerup', (e) => {
            if (pressed < 0) return;
            const idx = slotUnder(e);
            pressed = -1;
            paint('aoe-confirm', []);
            if (idx >= 0) launch(idx); // relâché sur une cible valide : l'attaque part
        }, { signal: ev.signal });
        document.addEventListener('pointercancel', () => { pressed = -1; paint('aoe-confirm', []); }, { signal: ev.signal });
    });
}

// --- IA ennemie ---
// --- IA commune (ennemis et combat automatique) ---

// Premier palier de modification de stat d'une capacité (v_stat_count peut être un nombre, un tableau ou une chaîne JSON)
function getStatDelta(move) {
    let raw = move.v_stat_count;
    if (typeof raw === 'string' && raw.trim().startsWith('[')) {
        try { raw = JSON.parse(raw); } catch { raw = 0; }
    }
    return Number(Array.isArray(raw) ? raw[0] : raw) || 0;
}

function isDamagingMove(move) {
    return move.damage_class !== 'status' && (move.power || 0) > 0;
}

// Cibles possibles d'une capacité selon sa zone
function getCandidateTargets(unit, move) {
    if (move.zone === 'self') return [unit];
    if (move.zone === 'ally') return aliveOnSide(unit._side);
    // Placement : le contact vise le premier ennemi de sa colonne, la distance sa colonne et les voisines
    return aliveOnSide(unit._side === 'player' ? 'enemy' : 'player').filter(t => !t.flags?.diving && BattleRules.canTarget(unit, move, t));
}

// Intérêt d'une action : dégâts attendus (en fraction des PV max), bonus de KO, ou utilité d'un statut
function scoreAction(unit, move, primaryTarget) {
    const accuracy = (move.accuracy == null ? 100 : move.accuracy) / 100;
    const plan = move.zone === 'self'
        ? [{ unit, mult: 1 }]
        : (typeof MoveRework !== 'undefined' && move.rw?.kind === 'attack'
            ? MoveRework.previewHits(move, unit, primaryTarget)
            : getAoeTargets(move.aoe || 'single', primaryTarget, primaryTarget._side).map(u => ({ unit: u, mult: 1 })));
    const targets = [...new Set(plan.map(h => h.unit))].filter(t => t && !t.isKO);

    if (isDamagingMove(move)) {
        let score = 0;
        const dealt = new Map();
        for (const { unit: t, mult } of plan) {
            if (!t || t.isKO) continue;
            const { damage } = computeDamage(unit, t, move, { noRandom: true });
            dealt.set(t, (dealt.get(t) || 0) + damage * (mult ?? 1));
        }
        for (const [t, damage] of dealt) {
            score += Math.min(damage, t.hp) / t.maxHp;
            if (damage >= t.hp) score += 0.5; // Mettre KO est prioritaire
        }
        // Retardement : l'impact n'arrive que deux tours plus tard (et une seule fois par cible)
        if (move.rw?.delay && !move._isBoosted) {
            if (typeof MoveRework !== 'undefined' && MoveRework.pendingDelayOn(primaryTarget)) return 0;
            score *= 0.6;
        }
        // Les ennemis s'acharnent sur un Tank bien placé (provocation)
        if (unit._side === 'enemy' && BattleRules.roleActive(primaryTarget, 'tank')) score *= 1.6;
        if (typeof HeldItems !== 'undefined' && HeldItems.isAggro(primaryTarget) && primaryTarget._side !== unit._side) score *= 2;
        // Par Ici ! / Poudre Fureur : attire toutes les attaques
        if (primaryTarget.flags?.provoke) score *= 2.5;
        return score * accuracy + (move.ops ? BattleRules.scoreOps(unit, move, primaryTarget) : 0);
    }

    const effects = getMoveEffects(move);
    const opsScore = move.ops ? BattleRules.scoreOps(unit, move, primaryTarget) : 0;
    if (!RulesDB || effects.length === 0) return opsScore * accuracy;

    const STATUS_VALUE = { STAT_SOM: 0.35, STAT_GEL: 0.3, STAT_PAR: 0.25, STAT_PSN: 0.25, STAT_BRU: 0.25, STAT_CONF: 0.2, BUFF_REG: 0.15 };
    let score = 0;
    for (const effectId of effects) {
        const rule = RulesDB[effectId];
        if (!rule) continue;
        for (const t of targets) {
            if (effectId === 'HEAL_HP') { score += Math.max(0, (1 - t.hp / t.maxHp) - 0.3); continue; }
            if (effectId === 'BUFF_SHIELD') { score += t.shield > 0 ? 0 : 0.15; continue; }
            if (rule.category === 'V-Stat') {
                const delta = getStatDelta(move);
                const stages = getEffectTargetStats(move, effectId).map(s => t.statMods[String(s).toUpperCase()] || 0);
                // Modeste : une vraie attaque (même 8 % des PV) passe avant Rugissement ou Mimi-Queue
                if (delta > 0 && Math.max(...stages) < 2) score += 0.06;
                if (delta < 0 && Math.min(...stages) > -2) score += 0.05;
                continue;
            }
            if (t.activeEffects.some(e => e.id === effectId)) continue;
            if (rule.category === 'Majeur' && t.activeEffects.some(e => RulesDB[e.id]?.category === 'Majeur')) continue;
            score += STATUS_VALUE[effectId] || 0.05;
        }
    }
    return (score + opsScore) * accuracy;
}

// Meilleure action pour une unité. Les ennemis choisissent parmi les bonnes options pour rester imprévisibles.
function chooseBestAction(unit, { varied = false, cunning = false } = {}) {
    let moves = (Array.isArray(unit.moves) && unit.moves.length ? unit.moves : defaultMovesFor(unit)).filter(Boolean);
    if (typeof MoveRework !== 'undefined') moves = moves.filter(m => !MoveRework.isPassive(m));
    if (!moves.length) return null; // seulement des passifs : ne joue pas
    const actions = [];
    for (const move of moves) {
        for (const target of getCandidateTargets(unit, move)) {
            let score = scoreAction(unit, move, target);
            // IA vicieuse : finir les blessés, et une mise K.O. vaut encore plus
            if (cunning && score > 0 && isDamagingMove(move) && target._side !== unit._side) {
                score *= 1 + ENEMY_CUNNING.woundedFocus * (1 - target.hp / target.maxHp);
                if (computeDamage(unit, target, move, { noRandom: true }).damage >= target.hp) score += ENEMY_CUNNING.koBonus;
            }
            actions.push({ move, target, score });
        }
    }
    actions.sort((a, b) => b.score - a.score);

    if (actions.length === 0 || actions[0].score <= 0) {
        // Rien d'utile : première attaque offensive sur un ennemi au hasard
        const foes = aliveOnSide(unit._side === 'player' ? 'enemy' : 'player');
        // D'abord une attaque qui peut toucher quelqu'un (pas d'immunité de type)
        for (const m of moves.filter(isDamagingMove)) {
            const hittable = getCandidateTargets(unit, m).filter(t => t._side !== unit._side && computeDamage(unit, t, m, { noRandom: true }).typeMod > 0);
            if (hittable.length) return { move: m, target: hittable[Math.floor(Math.random() * hittable.length)] };
        }
        const move = moves.find(isDamagingMove) || moves[0];
        return foes.length ? { move, target: foes[Math.floor(Math.random() * foes.length)] } : null;
    }
    if (!varied) return actions[0];
    const good = actions.filter(a => a.score >= actions[0].score * 0.8);
    return good[Math.floor(Math.random() * good.length)];
}

// À partir de la zone 2, les ennemis jouent juste : ils s'acharnent sur les Pokémon blessés, cherchent la mise K.O.
// et ne laissent plus de place au hasard. En zone 1 (apprentissage), ils varient parmi les bonnes options.
const ENEMY_CUNNING = { from: 2, woundedFocus: 0.8, koBonus: 0.6 };

function pickEnemyAction(unit) {
    if (zoneIndex < ENEMY_CUNNING.from) return chooseBestAction(unit, { varied: true });
    return chooseBestAction(unit, { cunning: true });
}

async function chooseEnemyAction(unit) {
    const action = pickEnemyAction(unit);
    if (!action) return;
    debugLog(`[AI] ${unit.name} utilise ${action.move.name} sur ${action.target.name}`);
    await attack(unit, action.target, action.move);
}

// Combat automatique « réflexe » : il se défend, sans plus. Il frappe fort l'ennemi en face de lui
// sans regarder les types, les zones, les effets ni qui est presque K.O., et place parfois une
// capacité de soutien au hasard. Jouer soi-même (bon type, bonne cible, bonne zone) fait la différence.
const AUTO_SUPPORT_CHANCE = 0.15;

function chooseReflexAction(unit) {
    let moves = (Array.isArray(unit.moves) && unit.moves.length ? unit.moves : defaultMovesFor(unit)).filter(Boolean);
    if (typeof MoveRework !== 'undefined') moves = moves.filter(m => !MoveRework.isPassive(m));
    if (!moves.length) return null;
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const attacks = moves.filter(isDamagingMove);
    const support = moves.filter(m => !isDamagingMove(m));

    if (support.length && (!attacks.length || Math.random() < AUTO_SUPPORT_CHANCE)) {
        const move = pick(support);
        const targets = getCandidateTargets(unit, move);
        if (targets.length) return { move, target: targets[0] };
    }

    // Ennemi le plus proche de son couloir, à l'avant : celui qu'il a sous les yeux
    const lane = BattleRules.laneOf(unit._index);
    const inFront = (targets) => targets.reduce((best, t) => {
        const d = Math.abs(BattleRules.laneOf(t._index) - lane) * 3 + BattleRules.depthOf(t);
        return !best || d < best.d ? { t, d } : best;
    }, null)?.t;
    // La plus puissante sur le papier (parfois la deuxième), tant qu'elle peut toucher quelqu'un
    const byPower = [...attacks].sort((a, b) => (b.power || 0) - (a.power || 0));
    if (byPower.length > 1 && Math.random() < 0.3) byPower.push(byPower.shift());
    for (const move of byPower) {
        const target = inFront(getCandidateTargets(unit, move).filter(t => t._side !== unit._side
            && computeDamage(unit, t, move, { noRandom: true }).typeMod > 0));
        if (target) return { move, target };
    }
    return chooseBestAction(unit); // rien d'évident : il fait au mieux
}

async function choosePlayerAutoAction(unit) {
    if (!unit || unit.isKO) return;
    const action = chooseReflexAction(unit);
    if (!action) return;
    debugLog(`[Auto-Battle] ${unit.name} utilise ${action.move.name} sur ${action.target.name}`);
    clearActionUI();
    await attack(unit, action.target, action.move);
}

async function triggerZMove(unit) {
    if (!unit || unit.isKO || !unit._boostedMoveId || unit.boostGauge < 100) {
        return;
    }

    // Verrouiller l'interface pour empêcher d'autres actions
    uiLocked = true;

    debugLog(`[Z-MOVE AUTO] ${unit.name} déchaîne sa puissance Z !`);

    // Annoncer le Z-Move
    if (dom.targetPrompt) {
        BattleAnimation.say(`${unit.name} déchaîne sa puissance Z !`);
        await sleep(900);
    }

    const boostInfo = MovesDB[unit._boostedMoveId];
    if (!boostInfo) {
        uiLocked = false;
        return;
    }

    const own = (unit.moves || []).find(m => m && m.id === unit._boostedMoveId);
    const zRw = typeof MoveRework !== 'undefined' ? MoveRework.zVersion({ ...(own || boostInfo), id: unit._boostedMoveId }) : null;
    const mv = zRw ? { ...zRw, name: `Z-${boostInfo.name_fr}` } : { ...boostInfo, id: unit._boostedMoveId, name: `Z-${boostInfo.name_fr}`, _isBoosted: true };
    await Epic.zMoveCutin(unit, boostInfo.name_fr || unit._boostedMoveId);

    // Refonte : la version Z a sa propre forme ; un passif déclenche son Éveil, une tactique son effet Z
    if (zRw) {
        if (zRw.rw.kind === 'passive') {
            BattleAnimation.say(`${unit.name} : Éveil de ${boostInfo.name_fr} !`);
            await MoveRework.runSupportZ(unit, mv, null);
        } else {
            const pick = chooseBestAction({ ...unit, moves: [mv] }) || {};
            const target = pick.target || (mv.damage_class === 'status' ? unit : aliveOnSide(unit._side === 'player' ? 'enemy' : 'player')[0]);
            if (target) await attack(unit, target, mv);
        }
        unit.boostGauge = 0;
        if (typeof HeldItems !== 'undefined') HeldItems.afterZMove(unit);
        updateZMoveIndicators();
        uiLocked = false;
        return;
    }

    // Les Z-Moves sont considérés comme des attaques de zone sur tous les ennemis.
    // On a juste besoin d'une cible principale pour lancer la fonction attack.
    const potentialTargets = aliveOnSide(unit._side === 'player' ? 'enemy' : 'player');

    if (potentialTargets.length > 0) {
        // On force la propriété AOE pour que la fonction attack la traite correctement.
        mv.aoe = 'all';
        await attack(unit, potentialTargets[0], mv);

        unit.boostGauge = 0; // Vider la jauge
        if (typeof HeldItems !== 'undefined') HeldItems.afterZMove(unit);
        updateZMoveIndicators(); // Mettre à jour l'interface
    }

    uiLocked = false; // Déverrouiller l'interface
}

// Fiche d'une capacité de la refonte : forme de zone (vignette orientée comme l'écran), effets, version Z
function showReworkMoveDetails(move, unit, isZMove) {
    const rw = move.rw;
    const typeName = typeToFrench(move.type);
    const isBase = unit && unit._boostedMoveId === move.id;
    const z = isZMove ? MoveRework.zVersion(move) : null;
    const shown = z || move;
    const pattern = rw.kind === 'attack' ? MoveRework.displayPattern(shown) : (rw.shape || rw.z?.shape) ? MoveRework.displayPattern({ ...move, rw: { ...rw, kind: 'attack', shape: rw.shape } }) : null;
    let zone = '';
    if (pattern) {
        const cells = pattern.values.map(v => `<div class="aoe-grid-cell ${v ? 'hit' : ''} ${v === 100 ? 'center' : ''}" style="${v ? `--hit-alpha:${Math.max(0.25, v / 100)}` : ''}" title="${v ? v + ' %' : ''}"></div>`).join('');
        zone = `<div class="info-item aoe-display"><span><strong>Zone :</strong> ${pattern.name}${pattern.ally ? ' (ton camp, ta ligne avant en haut)' : ''}</span><div class="aoe-grid${pattern.ally ? ' ally' : ''}">${cells}</div></div>`;
    } else if (rw.kind === 'attack') {
        const sh = MoveRework.shapes[(z ? rw.z?.shape : rw.shape)] || {};
        zone = `<div class="info-item aoe-display"><span><strong>Zone :</strong> ${sh.name || 'Cible unique'}</span></div>`;
    }
    const head = rw.kind === 'passive'
        ? `<span class="info-item"><strong>Passif</strong> · ${rw.triggerLabel || ''}</span>`
        : rw.kind === 'attack'
            ? `<span class="info-item"><strong>Puiss. :</strong> ${shown.power ?? '—'}</span><span class="info-item"><strong>Préc. :</strong> ${shown.accuracy ?? '—'}</span><span class="info-item"><strong>Catégorie :</strong> ${move.damage_class === 'physical' ? 'Physique' : 'Spéciale'}${BattleRules.isContact(move) ? ' · Contact (1er ennemi de sa colonne)' : ' · Distance (sa colonne et les voisines)'}</span>`
            : `<span class="info-item"><strong>Tactique</strong></span>`;
    const zLine = (isZMove || isBase) && move.description_z ? `<div class="move-description z"><strong>${isZMove ? 'Version Z :' : 'Z (jauge pleine) :'}</strong> ${move.description_z}</div>` : '';
    dom.infoDisplayPanel.innerHTML = `
        <div class="info-section">
            <span class="info-item"><strong>${isZMove ? 'Z-' : ''}${move.name}</strong></span>
            <span class="info-item"><strong>Type :</strong> ${typeName}</span>
            ${head}
            ${zone}
        </div>
        <div class="move-description">${isZMove ? '' : (move.description || '')}</div>
        ${zLine}`;
    dom.infoDisplayPanel.classList.remove('terrain-mode');
    dom.infoDisplayPanel.style.display = 'block';
}

// --- Résolution d'attaque ---
async function attack(attacker, primaryTarget, move) {
  // Attaque ennemie vue une fois : elle apparaît désormais dans la fiche de ce Pokémon (mémorisé)
  if (attacker?._side === 'enemy' && typeof InfoTip !== 'undefined') InfoTip.rememberMove(attacker, move);
  if (!attacker || !primaryTarget || attacker.isKO) {
    console.warn(`[DEBUG] Attack cancelled: Invalid attacker or target state`);
    return;
  }

  const moveToDo = move || defaultMovesFor(attacker)[0];
  if (!moveToDo) {
    console.error(`Attaque annulée pour ${attacker.name}: aucune capacité valide trouvée, même par défaut.`);
    return;
  }

    // Provoc, Possessif, Nuée de Poudre… peuvent empêcher l'action
    if (!BattleRules.beforeAttack(attacker, moveToDo)) {
        await sleep(400);
        return;
    }
    BattleRules.recordMove(attacker, moveToDo);
    const RW = typeof MoveRework !== 'undefined' ? MoveRework : null;
    if (RW && !RW.canUse(attacker, moveToDo)) { await sleep(400); return; }
    // Plongée : disparaît ce tour-ci, le coup part à son prochain tour
    if (RW && RW.startDive(attacker, moveToDo, primaryTarget)) { await sleep(600); globalTurnCount += 1; return; }
    // Prescience : l'impact part deux tours plus tard
    if (RW && RW.startDelay(attacker, moveToDo, primaryTarget)) { await sleep(500); globalTurnCount += 1; return; }

    // --- LOGIQUE D'ATTAQUE REFACTORISÉE ---
    const moveForThisHit = { ...moveToDo };
    // Placement : le contact frappe le premier ennemi de sa colonne, la distance sa colonne et les voisines
    if (!BattleRules.canTarget(attacker, moveForThisHit, primaryTarget)) {
        primaryTarget = BattleRules.retarget(attacker, moveForThisHit, primaryTarget);
        if (!primaryTarget) return;
    }
    // Cases touchées : formes pondérées (refonte) ou zones d'origine, à 100 %
    const isRwAttack = RW && moveForThisHit.rw?.kind === 'attack';
    const hitPlan = isRwAttack
        ? RW.hitList(moveForThisHit, attacker, primaryTarget)
        : getAoeTargets(moveForThisHit.aoe || 'single', primaryTarget, primaryTarget._side).map(unit => ({ unit, mult: 1 }));
    const targets = [...new Set(hitPlan.map(h => h.unit))];
    if (targets.length === 0) {
        console.warn(`[ATTACK] No valid targets for ${moveForThisHit.name}`);
        return;
    }

    debugLog(`[ATTACK] ${attacker.name} uses ${moveForThisHit.name} on ${targets.map(t => t.name).join(', ')}`);
    
    // Afficher le nom de la capacité une seule fois
    if (typeof BattleAnimation !== 'undefined' && BattleAnimation.spawnMoveNameText) {
        BattleAnimation.spawnMoveNameText(attacker, moveForThisHit.name, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
    }
    BattleAnimation.say(`${attacker.name} utilise ${moveForThisHit.name} !`);

    const damages = [];
    const successfulTargets = [];
    let allTargetsThisTurn = new Set();

    // Une version Z brise boucliers et Abri
    if (moveForThisHit._isBoosted && moveForThisHit.damage_class !== 'status') {
        targets.forEach(t => { if (t._side !== attacker._side) { t.protect = null; if (t.shield > 0) { t.shield = 0; spawnEffectText(t, 'Bouclier brisé', 'info'); } } });
    }
    const protectedTargets = new Set();
    const damageByTarget = new Map();
    let missedAny = false, anyCrit = false;

    // 1. Vérifier la précision et calculer les dégâts pour chaque coup
    for (const { unit: target, mult } of hitPlan) {
        if (target.isKO || protectedTargets.has(target)) continue;
        allTargetsThisTurn.add(target);
        // Reflet Magik : la capacité de statut ennemie échoue
        if (RW && RW.blocksStatusMove(target, attacker, moveForThisHit)) continue;

        let finalAccuracy = moveForThisHit.accuracy;

        // --- NOUVEAU: Calcul de la précision finale ---
        if (finalAccuracy !== null) { // Ne s'applique pas aux capacités qui ne ratent jamais
            finalAccuracy = finalAccuracy ?? 100; // Si non-nul mais undefined, on met 100
            const attackerAccuracyMod = attacker.statMods.PRE || 0;
            const defenderEvasionMod = target.statMods.EVA || 0;
            
            const totalStageMod = clamp(attackerAccuracyMod - defenderEvasionMod, -6, 6);
            finalAccuracy *= getStatMultiplier(totalStageMod);
            if (BattleRules.field.room?.type === 'gravity') finalAccuracy *= 1.3;
        }

        if (finalAccuracy !== null && typeof HeldItems !== 'undefined') { const am = HeldItems.accuracyMult(attacker, target); finalAccuracy = am === Infinity ? null : finalAccuracy * am; }
        if (finalAccuracy !== null && typeof Synergies !== 'undefined') finalAccuracy *= Synergies.evasionMult(target);
        if (attacker.flags?.sureHit) finalAccuracy = null;
        if (finalAccuracy !== null && Math.random() * 100 >= finalAccuracy) {
            spawnEffectText(target, "Raté !", 'info');
            if (typeof HeldItems !== 'undefined') HeldItems.onDodge(target); // Encens Doux
            missedAny = true;
            continue; // La cible a esquivé
        }

        // Abri et variantes (Garde Large protège sa colonne des attaques de zone)
        if (BattleRules.checkProtect(attacker, target, moveForThisHit)) { protectedTargets.add(target); continue; }
        if (target.flags?.wideGuard && targets.length > 1 && target._side !== attacker._side) { spawnEffectText(target, 'Garde Large', 'info'); protectedTargets.add(target); continue; }

        if (!successfulTargets.includes(target)) successfulTargets.push(target);
        // Attaques multi-coups (Torgnoles, Double Pied…)
        const hitsRange = moveForThisHit.multihit || moveForThisHit.mech?.multihit;
        const hits = Array.isArray(hitsRange) ? hitsRange[0] + Math.floor(Math.random() * (hitsRange[1] - hitsRange[0] + 1)) : 1;
        const cellMult = (mult ?? 1) < 1 && typeof HeldItems !== 'undefined' ? Math.min(1, mult + HeldItems.waveSplash(attacker, BattleRules.moveTypeFor(attacker, moveForThisHit))) : (mult ?? 1);
        let damageResult = computeDamage(attacker, target, moveForThisHit, { cellMult });
        for (let h = 1; h < hits && damageResult.damage > 0; h++) {
            const extra = computeDamage(attacker, target, moveForThisHit, { cellMult });
            damageResult = { ...damageResult, damage: damageResult.damage + extra.damage, isCrit: damageResult.isCrit || extra.isCrit };
        }
        // Dé Pipé : un coup de plus sur les attaques à coups multiples
        if (hits > 1 && typeof HeldItems !== 'undefined' && HeldItems.extraHitPct(attacker) > 0 && damageResult.damage > 0) {
            const extra = computeDamage(attacker, target, moveForThisHit, { cellMult });
            damageResult = { ...damageResult, damage: damageResult.damage + Math.floor(extra.damage * HeldItems.extraHitPct(attacker) / 100) };
        }
        // Griffe Rasoir : les coups critiques percent une partie du bouclier
        if (damageResult.isCrit && target.shield > 0 && typeof HeldItems !== 'undefined' && HeldItems.critPierce(attacker) > 0) target.shield = Math.floor(target.shield * (1 - HeldItems.critPierce(attacker) / 100));
        if (damageResult.isCrit) anyCrit = true;
        if (hits > 1) spawnEffectText(target, `Touché ${hits} fois !`, 'info', -90);
        // Part de la puissance reçue par cette case de la forme
        const dmg = damageResult.executed ? damageResult.damage : Math.max(damageResult.damage > 0 ? 1 : 0, Math.floor(damageResult.damage * cellMult));
        if (damageResult.executed) spawnEffectText(target, 'Exécution !', 'debuff', -60);
        // Pour l'animation : part de la forme (mult), critique (le chiffre l'affiche), coups visibles (salves, multi-coups)
        const prev = damageByTarget.get(target);
        if (prev) { prev.dmg += dmg; prev.strikes += hits; prev.crit = prev.crit || damageResult.isCrit; prev.mult = Math.max(prev.mult, mult ?? 1); }
        else { const entry = { target, dmg, typeMod: damageResult.typeMod, mult: mult ?? 1, crit: !!damageResult.isCrit, strikes: hits }; damageByTarget.set(target, entry); damages.push(entry); }
    }
    if (attacker.flags?.nextCrit) delete attacker.flags.nextCrit;

  // Mettre à jour les jauges de boost (une seule fois par action)
  // La jauge de boost ne doit augmenter que pour les capacités offensives (physiques ou spéciales) qui ne sont pas déjà des Z-Moves.
  if (!moveToDo._isBoosted && (moveForThisHit.damage_class === 'physical' || moveForThisHit.damage_class === 'special') && (moveForThisHit.power && moveForThisHit.power > 0)) {
      // Attacker's boost gauge
      if (attacker.boostGauge < 100) {
          attacker.boostGauge = Math.min(100, (attacker.boostGauge || 0) + Math.round(20 * (attacker.zGainMult || 1) * (typeof HeldItems !== 'undefined' ? HeldItems.zGainMult(attacker, BattleRules.moveTypeFor(attacker, moveForThisHit)) : 1))); // 20% de la jauge (plus avec la synergie Dragon et les cristaux Z)
      }
      // Target's boost gauge (only primary target for AOE, as per user's rule)
      // Check if primaryTarget is still valid (not KO'd before this move)
      if (primaryTarget && !primaryTarget.isKO && primaryTarget.boostGauge < 100) {
          primaryTarget.boostGauge = Math.min(100, (primaryTarget.boostGauge || 0) + 20); // +20 % de la jauge (sur 100)
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
        } else {
            // Une seule mise en scène pour toutes les cibles : élan ou projectiles, cases touchées, impacts
            await BattleAnimation.playAttack(attacker, damages, moveForThisHit);
        }
    }

    // 3. Appliquer les dégâts et les effets
    for (const { target, dmg } of damages) {
        if (dmg > 0) {
            target._pendingDamage = (target._pendingDamage || 0) + dmg;
            applyDamageGrid(target);
            if (RW && target._side !== attacker._side) await RW.onDamaged(target, attacker, moveForThisHit, dmg);
            if (typeof HeldItems !== 'undefined') {
                const entry = damageByTarget.get(target);
                await HeldItems.onHit(target, attacker, moveForThisHit, dmg, { typeMod: entry?.typeMod ?? 1, moveType: BattleRules.moveTypeFor(attacker, moveForThisHit), contact: BattleRules.isContact(moveForThisHit) });
            }
            if (typeof Synergies !== 'undefined') Synergies.onHit(target, attacker, dmg, { contact: BattleRules.isContact(moveForThisHit) });
        }
        // Appliquer l'effet si la capacité en a un (après le check de précision)
        if (moveForThisHit.effect) {
            applyEffect(attacker, target, moveForThisHit);
        }
    }

    // Vol de vie, contrecoup, recharge, priorité, piège, Lien du Destin…
    if ((moveForThisHit.power || 0) > 0) BattleRules.afterDamage(attacker, moveForThisHit, damages);
    // Effets décrits par des « ops » (météo, champs, abris, échanges, appels d'autres capacités…)
    if (moveForThisHit.ops && moveForThisHit.ops.length) {
        if (RW && moveForThisHit.rw) await RW.runOps(attacker, moveForThisHit.ops, { target: primaryTarget, targets: successfulTargets, move: moveForThisHit });
        else await BattleRules.executeOps(attacker, primaryTarget, moveForThisHit, successfulTargets);
    }
    // Refonte : effets secondaires, jauge, versions Z (attaques et tactiques)
    if (RW && moveForThisHit.rw) {
        if (moveForThisHit.rw.kind === 'attack') await RW.afterAttack(attacker, moveForThisHit, primaryTarget, damages);
        else if (moveForThisHit._isBoosted) await RW.runSupportZ(attacker, moveForThisHit, primaryTarget);
    }
    
    // Objets après l'action : Orbe Vie, Grelot Coque, Roche Royale, Vive Griffe, Métronome…
    if (typeof HeldItems !== 'undefined') await HeldItems.afterAction(attacker, moveForThisHit, { damages, primary: primaryTarget, missed: missedAny, crit: anyCrit, moveType: BattleRules.moveTypeFor(attacker, moveForThisHit) });
    if (typeof Synergies !== 'undefined') Synergies.afterAction(attacker, moveForThisHit, { damages, primary: primaryTarget, moveType: BattleRules.moveTypeFor(attacker, moveForThisHit) });
  // Mettre à jour la timeline et les boutons Z-Move après application des dégâts et potentiels KO
  updateTurnOrderDisplay();
  updateZMoveIndicators();
  await sleep(100); // Petite pause après les dégâts

  // Déclenchement des Z-Moves en réaction
  let zMoveHasTriggered = false;
  if (!moveToDo._isBoosted) {
      // Une capacité de statut (Entrave…) ne déclenche pas de Z en réaction : seulement un Pokémon qui vient d'encaisser des dégâts
      const hurt = damages.filter(d => d.dmg > 0).map(d => d.target);
      for (const target of hurt) {
          if (target.boostGauge >= 100 && !target.isKO) {
              await triggerZMove(target);
              zMoveHasTriggered = true;
              break; // Une seule réaction par action
          }
      }
      if (!zMoveHasTriggered && attacker.boostGauge >= 100 && !attacker.isKO) {
          await triggerZMove(attacker);
      }
  }

  // Incrémente le compteur global après chaque action résolue
  globalTurnCount += 1;
}

let BattleLevelsDB = null;
async function loadBattleLevelsDB() {
    // Les équipes ennemies sont générées (js/enemy-gen.js) : le gros fichier battle_levels.json n'est plus chargé
    BattleLevelsDB = BattleLevelsDB || [];
    return BattleLevelsDB;
}

function setupEnemyTeam() {
    if (!PokedexDB) {
        console.error("PokedexDB not loaded, cannot create enemy team.");
        return;
    }
    // Équipe thématique et reproductible (js/enemy-gen.js)
    EnemyGen.setup();
}

function restorePlayerGridForNewBattle() {
  // 1. Restaurer l'état visuel du DOM du joueur
  for (let i = 0; i < 9; i++) {
    const slot = getSlotEl('player', i);
    if (slot) {
      const unitEl = slot.querySelector('.unit');
      if (unitEl) { // Restaurer uniquement s'il y avait une unité
        unitEl.classList.remove('is-ko', 'victory-walk');
        const walkingSprite = unitEl.querySelector('.sprite');
        if (walkingSprite && typeof PmdSprite !== 'undefined') PmdSprite.play(walkingSprite, ['Idle'], { loop: true });
        
        // Le sprite masqué au K.O. réapparaît (il a continué son animation Idle)
        const spriteEl = unitEl.querySelector('.sprite');
        if (spriteEl) spriteEl.style.display = '';
        
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
        slot.dataset.slot = BattleRules.slotNumber('enemy', i);
        enemyGrid.appendChild(slot);
      }
    }
    setupEnemyTeam();
    if (typeof FormationUI !== 'undefined') FormationUI.refresh();
  } catch (e) {
    console.error("Erreur lors de la préparation de l'équipe ennemie:", e);
  }
}

function prepareGridsForNewBattle() {
  restorePlayerGridForNewBattle();
  prepareEnemyGridForNewBattle();
}

// Épuisement : au-delà de 100 tours, chaque Pokémon perd 5 % de ses PV max au début de son tour,
// +5 % tous les 10 tours. Un combat finit toujours (ex. Spectre contre Normal, aucun ne peut toucher l'autre).
const FATIGUE_START = 100;
let battleTurns = 0;
async function handleStartOfTurnEffects(unit) {
    if (unit.isKO) return { canAct: false };
    battleTurns += 1;
    if (battleTurns === FATIGUE_START + 1) BattleAnimation.say('Les Pokémon s’épuisent : le combat doit finir !');
    if (battleTurns > FATIGUE_START) {
        const pct = 5 + 5 * Math.floor((battleTurns - FATIGUE_START - 1) / 10);
        BattleRules.damage(unit, unit.maxHp * pct / 100, 'Épuisement');
        if (unit.hp <= 0 || unit.isKO) { if (!unit.isKO) applyDamageGrid(unit); return { canAct: false }; }
    }

    // Météo, champs, pièges, effets sur la durée, phase de boss
    const ruleResult = await BattleRules.onTurnStart(unit);
    if (unit.isKO) return { canAct: false };
    // Refonte : passifs « chaque tour », régénérations, piège, vœux
    if (typeof MoveRework !== 'undefined') await MoveRework.onTurnStart(unit);
    if (unit.isKO) return { canAct: false };

    let canAct = ruleResult.canAct;
    let selfHit = false;

    // Objets tenus (début de tour) : Restes, Boue Noire, Grelot, orbes, graines…
    if (typeof HeldItems !== 'undefined') { await HeldItems.onTurnStart(unit); if (unit.isKO) return { canAct: false }; }
    if (typeof Synergies !== 'undefined') Synergies.onTurnStart(unit);

    // Copie pour pouvoir modifier l'original dans la boucle
    const effectsToProcess = [...unit.activeEffects];

    for (const effect of effectsToProcess) {
        const rule = RulesDB[effect.id];
        if (!rule) continue;

        switch (effect.id) {
            case 'STAT_PSN':
                if (typeof HeldItems !== 'undefined' && HeldItems.poisonHeals(unit)) { BattleRules.heal(unit, unit.maxHp * HeldItems.poisonHealPct(unit) / 100, null); spawnEffectText(unit, 'Orbe Toxique', 'buff'); await sleep(300); break; }
                const poisonBefore = unit.hp;
                const poisonDamage = Math.floor(unit.maxHp * (rule.effect_value / -100));
                unit.hp = Math.max(0, unit.hp - poisonDamage);
                animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
                if (BattleAnimation.showDamageNumber) BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), poisonDamage, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
                spawnEffectText(unit, "Poison", 'status');
                await sleep(400);
                if (unit.hp <= 0) { applyDamageGrid(unit); canAct = false; }
                else if (typeof HeldItems !== 'undefined') HeldItems.afterHpLoss(unit, poisonBefore);
                break;
            case 'STAT_BRU':
                const burnBefore = unit.hp;
                const burnDamage = Math.floor(unit.maxHp * 0.0625); // 1/16th
                unit.hp = Math.max(0, unit.hp - burnDamage);
                animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
                if (BattleAnimation.showDamageNumber) BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), burnDamage, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
                spawnEffectText(unit, "Brûlure", 'status');
                await sleep(400);
                if (unit.hp <= 0) { applyDamageGrid(unit); canAct = false; }
                else if (typeof HeldItems !== 'undefined') HeldItems.afterHpLoss(unit, burnBefore);
                break;
            case 'BUFF_REG':
                const regenAmount = Math.floor(unit.maxHp * (rule.effect_value / 100));
                unit.hp = Math.min(unit.maxHp, unit.hp + regenAmount);
                animateHpGrid(unit._side, unit._index, unit.maxHp, unit.hp, unit.maxHp);
                if (BattleAnimation.showDamageNumber) BattleAnimation.showDamageNumber(getSlotEl(unit._side, unit._index), -regenAmount, BattleAnimation.BaseAnimationStrategy.TEXT_OFFSET_Y);
                await sleep(400);
                break;
            case 'STAT_GEL':
                if (Math.random() * 100 < rule.thaw_chance) {
                    unit.activeEffects = unit.activeEffects.filter(e => e.id !== 'STAT_GEL');
                    spawnEffectText(unit, `${unit.name} dégèle !`, 'info');
                } else {
                    spawnEffectText(unit, `${unit.name} est gelé...`, 'status');
                    canAct = false;
                }
                await sleep(600);
                break;
            case 'STAT_FLINCH':
                spawnEffectText(unit, `${unit.name} a peur !`, 'status');
                canAct = false;
                await sleep(600);
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
    debugLog("[DEBUG] runCombatLoop: enter, window.isRunning =", window.isRunning);
    while (window.isRunning) {
        debugLog("[DEBUG] runCombatLoop: iteration start");
        const playerAlive = aliveOnSide('player');
        const enemyAlive = aliveOnSide('enemy');

        if (playerAlive.length === 0 || enemyAlive.length === 0) {
            debugLog("[DEBUG] runCombatLoop: someone is dead, stopping loop");
            break;
        }

        // --- NOUVELLE LOGIQUE DE GAIN D'AP ET DE TOUR ---
        const allUnits = [...playerAlive, ...enemyAlive];
        // La vitesse change en cours de combat (paralysie, paliers de Vitesse, baies)
        allUnits.forEach(u => { u.effectiveSpeed = getEffectiveSpeed(u); });
        
        let unitToPlay = null;
        // Chercher la première unité avec assez d'AP (à égalité, le plus petit numéro de case joue d'abord)
        allUnits.sort((a, b) => b.actionPoints - a.actionPoints || BattleRules.slotOf(a) - BattleRules.slotOf(b));
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
                    if (u._side === 'player') debugLog(`[DEBUG] ${u.name} AP: ${u.actionPoints}`);
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
        const RWL = typeof MoveRework !== 'undefined' ? MoveRework : null;
        const dive = RWL ? RWL.pendingDive(unit) : null;
        if (dive) {
            // Plongée : le coup part maintenant, sur n'importe quelle case
            BattleAnimation.say(`${unit.name} réapparaît !`);
            await sleep(350);
            await attack(unit, dive.target, dive.move);
        } else if (RWL && RWL.hasOnlyPassives(unit)) {
            // Seulement des passifs : le Pokémon ne joue pas
            spawnEffectText(unit, 'Passifs seulement', 'info');
            await sleep(500);
        } else if (unit._side === 'player') {
            if (actionPanel) actionPanel.classList.remove('enemy-turn');
            // Vérifie si le combat auto est activé
            if (typeof isAutoBattle !== 'undefined' && isAutoBattle) {
                if (dom.targetPrompt) {
                    BattleAnimation.say(`Tour de ${unit.name}...`);
                }
                await sleep(350); // Petite pause pour voir qui joue
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
                BattleAnimation.say(`${unit.name} attaque...`);
            }
            await sleep(450);
            uiLocked = true;
            await chooseEnemyAction(unit);
            uiLocked = false;
        }

        // Dépenser les AP.
        unit.actionPoints -= 100;
        if (RWL) RWL.onAction(unit);
        updateActionPointsUI(unit);
        currentTurnUnit = null;

        if (aliveOnSide('player').length === 0 || aliveOnSide('enemy').length === 0) {
            break;
        }

        await sleep(200);
    }

    window.isRunning = false;
    if (typeof PmdSprite !== 'undefined') PmdSprite.setSpeed(1);
    await checkWinCondition();
    currentTurnUnit = null;
    debugLog("[DIAGNOSTIC] Boucle de combat terminée");
    clearActionUI(); // Nettoyer l'UI à la fin
}

async function beginBattleSequence() {
    debugLog("[DEBUG] beginBattleSequence() called");
    if (window.isRunning) {
        console.warn("[DEBUG] window.isRunning was already true, force reset");
        window.isRunning = false;
        await sleep(100);
    }
    window.isRunning = true;
    if (typeof PmdSprite !== 'undefined') PmdSprite.setSpeed(battleSpeed);
    debugLog("[DEBUG] window.isRunning is now true");

    // 1. Charger toutes les données nécessaires avec gestion d'erreurs individuelle
    debugLog("[DEBUG] Loading databases...");
    const dbLoads = [
        { name: 'Moves', fn: loadMovesDB },
        { name: 'Types', fn: loadTypesDB },
        { name: 'Pokedex', fn: loadPokedexDB },
        { name: 'Levels', fn: loadBattleLevelsDB },
        { name: 'Rules', fn: loadRulesDB }
    ];

    for (const db of dbLoads) {
        try {
            await db.fn();
            debugLog(`[DEBUG] ${db.name} DB loaded.`);
        } catch (e) {
            console.warn(`[DEBUG] Failed to load ${db.name} DB:`, e);
        }
    }

    // 2. Préparer le terrain (nettoyer les anciennes batailles, générer les nouveaux ennemis)
    debugLog("[DEBUG] Preparing grids for new battle");
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
    battleTurns = 0;

    // 4. Construire les objets "acteurs" à partir du DOM maintenant prêt
    debugLog("[DEBUG] Building actors from DOM...");
    buildActorsFromDom();
    BattleRules.setupBattle();
    showTerrainInfo();
    // Entrée en scène du boss
    const bossUnit = grid.enemy.find(u => u && u.isBoss);
    if (bossUnit) await Epic.bossIntro(bossUnit);
    debugLog("[DEBUG] Grid player length:", grid.player.filter(u => u !== null).length);
    debugLog("[DEBUG] Grid enemy length:", grid.enemy.filter(u => u !== null).length);
    
    [...grid.player, ...grid.enemy].forEach(unit => {
        if (unit) {
            unit.effectiveSpeed = getEffectiveSpeed(unit);
            debugLog(`[DEBUG] Actor ready: ${unit.name} (${unit._side}) Speed: ${unit.effectiveSpeed}`);
        }
    });

    // 5. SÉCURITÉ : Vérifier que des combattants ont bien été créés.
    const playerUnits = aliveOnSide('player');
    const enemyUnits = aliveOnSide('enemy');

    debugLog(`[DEBUG] Player units alive: ${playerUnits.length}`);
    debugLog(`[DEBUG] Enemy units alive: ${enemyUnits.length}`);

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
    debugLog("[DEBUG] Starting runCombatLoop...");
    runCombatLoop(); // On ne l'attend pas forcément ici si on veut rendre la main à l'UI
    debugLog("[DEBUG] beginBattleSequence() finished.");
}

// Victoire : l'équipe repart sur la PokéRoad, vers le haut de l'écran, derrière la fenêtre des gains
function playVictoryWalk() {
  grid.player.filter(u => u && !u.isKO).forEach(u => {
    const unitEl = getSlotEl('player', u._index)?.querySelector('.unit');
    if (!unitEl) return;
    const sprite = unitEl.querySelector('.sprite');
    if (sprite && typeof PmdSprite !== 'undefined') PmdSprite.play(sprite, ['Walk'], { loop: true });
    // Les Pokémon de devant partent en premier
    unitEl.style.setProperty('--walk-delay', `${BattleRules.depthOf(u) * 0.25 + BattleRules.laneOf(u._index) * 0.08}s`);
    unitEl.classList.add('victory-walk');
  });
}

// Prime des boss : ×2, ×3 pour le boss final de la zone (10e vague)
function bossRewardMult() {
  return battleIndex === 10 ? (waveIndex === 10 ? 3 : 2) : 1;
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
    const itemBonus = typeof HeldItems !== 'undefined' ? HeldItems.rewardBonus((grid.player || []).filter(Boolean)) : { moneyMult: 1, extraLootChance: 0 };
    // Récompense qui suit le niveau des ennemis ; un boss rapporte ×2 (×3 le boss final de la zone) :
    // battre un boss par la stratégie finance l'amélioration suivante, plutôt que rejouer des combats faciles
    const reward = Math.round(battleMoneyReward(getEnemyLevel()) * bossRewardMult() * (BattleRules.field.moneyMult || 1) * itemBonus.moneyMult);
    if (typeof GameData !== 'undefined' && GameData.addMoney) {
        GameData.addMoney(reward);
    }

    // Logique de drop d'oeuf
    // Œufs : rares sur un combat normal, garantis contre les boss (3 contre le boss de fin de zone)
    let eggCount = Math.random() < BATTLE_REWARDS.egg ? 1 : 0;
    if (waveIndex === 10 && battleIndex === 10) {
        eggCount = 3;
    } else if (battleIndex === 10) {
        eggCount = 1;
    }

    // --- NOUVELLES RÉCOMPENSES (Objets & Baies) ---
    // Objets tenus du catalogue (hors objets d'espèce), plus des objets d'évolution
    const catalog = GameData.getItemsByPocket();
    const heldPool = (catalog.battle || []).filter(it => !it.species_only && !it.not_sold).map(it => it.id);
    // Tous les objets d'évolution (sucreries comprises), les échantillons et l'entraînement (bonbons, vitamines, plumes, mochi)
    // peuvent aussi tomber ; poches du jeu (GameData.categorizeItems), pas celles de data/items.json
    const evolutionPool = [...(catalog.evolution || []), ...(catalog.loot || [])].filter(it => !it.not_sold).map(it => it.id);
    const trainingPool = [...(catalog.exp || []), ...(catalog.vitamins || []), ...(catalog.feathers || [])].filter(it => !it.not_sold).map(it => it.id);
    const dropableItems = [...heldPool, ...evolutionPool];
    // Tirage pondéré : 25 % des objets tombés sont de l'entraînement, où les bonbons pèsent plus
    // (les petits plus souvent que les gros : un Bonbon Exp XL vaut 30 niveaux)
    const LOOT_TRAINING_SHARE = 0.25;
    const CANDY_WEIGHT = { 'exp-candy-xs': 5, 'exp-candy-s': 4, 'rare-candy': 3, 'exp-candy-m': 3, 'exp-candy-l': 2, 'exp-candy-xl': 1 };
    const pickTraining = () => {
        const total = trainingPool.reduce((a, id) => a + (CANDY_WEIGHT[id] || 1), 0);
        let roll = Math.random() * total;
        return trainingPool.find(id => (roll -= CANDY_WEIGHT[id] || 1) < 0) || trainingPool[0];
    };
    const pickItem = () => (trainingPool.length && Math.random() < LOOT_TRAINING_SHARE)
        ? pickTraining()
        : dropableItems[Math.floor(Math.random() * dropableItems.length)];
    const ctPool = (catalog.ct || []).filter(it => !it.not_sold).map(it => it.id);
    const dropableBerries = (GameData.getItemsByPocket().berries || []).map(it => it.id);
    
    const droppedItems = [];
    
    // Fonction helper pour obtenir le nom français propre (incluant le contenu des CT)
    const getCleanItemNameFr = (id) => {
        const item = GameData.getItem(id);
        if (!item) return id.toUpperCase();
        let name = item.name_fr || item.name || id;
        
        // Si c'est une CT, on essaie d'extraire le nom de la capacité pour plus de clarté
        if (item.pocket === 'ct' && item.effect_fr) {
            const match = item.effect_fr.match(/Apprend (.*?) à un Pokémon/);
            if (match && match[1]) {
                name = `${name} - ${match[1]}`;
            }
        }
        return name;
    };
    
    // Un objet et une baie, chacun avec une chance (toujours garantis contre un boss)
    if (battleIndex === 10 || Math.random() < BATTLE_REWARDS.item) {
        const randomItem = pickItem();
        GameData.addItem(randomItem, 1);
        droppedItems.push({ id: randomItem, name: getCleanItemNameFr(randomItem), icon: Art.item(randomItem, 22) });
    }
    if (battleIndex === 10 || Math.random() < BATTLE_REWARDS.berry) {
        const randomBerry = dropableBerries[Math.floor(Math.random() * dropableBerries.length)];
        GameData.addItem(randomBerry, 1);
        droppedItems.push({ id: randomBerry, name: getCleanItemNameFr(randomBerry), icon: Art.item(randomBerry, 22) });
    }
    // Œuf Chance : un butin de plus
    if (Math.random() < itemBonus.extraLootChance) {
        const bonus = Math.random() < 0.5 ? pickItem() : dropableBerries[Math.floor(Math.random() * dropableBerries.length)];
        GameData.addItem(bonus, 1);
        droppedItems.push({ id: bonus, name: getCleanItemNameFr(bonus), icon: Art.item(bonus, 22) });
    }

    // CT : de temps en temps
    let droppedTM = null;
    // (toutes les CT du catalogue, pas seulement CT01 à CT50)
    if (ctPool.length && Math.random() < BATTLE_REWARDS.tm) {
        const tmId = ctPool[Math.floor(Math.random() * ctPool.length)];
        const tmIcon = (GameData.getItem(tmId)?.sprite || '').split('/').pop().replace('.png', '') || 'tm-normal';
        GameData.addItem(tmId, 1);
        droppedTM = { id: tmId, name: getCleanItemNameFr(tmId), icon: Art.item(tmIcon, 22) };
    }

    // Objets de déblocage des paliers : sur les boss, de plus en plus rares
    if (battleIndex === 10) {
        const keyDrops = ['star-piece'];
        if (waveIndex === 10 || (zoneIndex >= 5 && Math.random() < 0.25)) keyDrops.push('comet-shard');
        if (waveIndex === 10 && zoneIndex >= 8 && Math.random() < 0.3) keyDrops.push('relic-crown');
        keyDrops.forEach(id => {
            GameData.addItem(id, 1);
            droppedItems.push({ id, name: getCleanItemNameFr(id), icon: Art.item(id, 22) });
        });
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
                <div class="reward-main">
                    <span class="reward-chip money"><span class="coin"></span>+${reward.toLocaleString('fr-FR')} $</span>
                    ${finalEggCount > 0 ? `<span class="reward-chip egg">${Art.egg('commun', 26)}+${finalEggCount} œuf${finalEggCount > 1 ? 's' : ''}</span>` : ''}
                </div>
                <div class="rewards-grid-mini">
                    ${droppedItems.map(item => `<div class="reward-badge" title="${item.name}">${item.icon} ${item.name}</div>`).join('')}
                    ${droppedTM ? `<div class="reward-badge tm" title="${droppedTM.name}">${droppedTM.icon} ${droppedTM.name}</div>` : ''}
                </div>
            </div>
            <div id="end-battle-nav-win" class="end-battle-actions" style="position:relative; bottom:auto; left:auto; transform:none; margin-top:20px;">
                <button class="pk-btn-action secondary-btn" title="Retour à la carte de la zone" onclick="leaveBattleToHome(true)">${Art.icon('map', 20)} Carte</button>
                <button class="pk-btn-action" title="Combat Suivant" onclick="nextBattleProgression()">
                    Combat suivant ${Art.icon('play', 20)}
                </button>
            </div>
        `;
        dom.battleStatus.classList.remove('lose');
        dom.battleStatus.classList.add('win');
        dom.battleStatus.style.display = 'block';
    }
    clearActionUI();
    if (sideActions) sideActions.innerHTML = ''; 
    cleanupTurnIndicator();
    updateZMoveIndicators();
    playVictoryWalk();
  } else if (playerAlive === 0) {
    // Défaite : on reste sur ce combat (pas de retour au début de la vague) ; il faut se renforcer ou changer de stratégie
    // Aucun gain en cas de défaite : perdre en boucle ne doit pas servir à farmer de l'argent
    const enemiesTotal = grid.enemy.filter(Boolean).length;
    const enemiesDown = grid.enemy.filter(u => u && u.isKO).length;
    
    if (dom.battleStatus) {
      dom.battleStatus.innerHTML = `
        <div class="status-title" style="color:#e74c3c;">DÉFAITE...</div>
        <p style="color:#666; margin-bottom:8px;">Votre équipe a été mise KO.</p>
        <div class="rewards-summary"><p style="margin:6px 0 16px; font-size:14px;">Aucune récompense (${enemiesDown}/${enemiesTotal} ennemis K.O.). Entraîne ton équipe ou change de stratégie !</p></div>
        <div id="end-battle-nav-lose" class="end-battle-actions" style="position:relative; bottom:auto; left:auto; transform:none;">
            <button class="pk-btn-action secondary-btn" title="Retour à la carte de la zone" onclick="leaveBattleToHome()">${Art.icon('map', 20)} Carte</button>
            <button class="pk-btn-action" title="Rejouer" onclick="fleeBattle()">
                Rejouer <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
        </div>
      `;
      dom.battleStatus.classList.remove('win');
      dom.battleStatus.classList.add('lose');
      dom.battleStatus.style.display = 'block';
    }
    clearActionUI();
    if (sideActions) sideActions.innerHTML = ''; 
    cleanupTurnIndicator();
    updateZMoveIndicators();
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
        const pokedexArray = await loadJSON('data/pokedex.json'); // même fichier que GameData, lu une fois
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

// Rang du combat dans toute l'aventure : 0 (zone 1, vague 1, combat 1) -> 4999 (zone 50, vague 10, combat 10)
function getStageIndex(battle = battleIndex) {
    return ((zoneIndex - 1) * 100) + ((waveIndex - 1) * 10) + (battle - 1);
}

// Courbe de difficulté : niv. 1 au départ, ~19 en fin de zone 1, ~50 en zone 5, 200 en zone 50, puis sans fin.
// Le 10e combat de chaque vague est un « boss » un peu plus fort.
// battle : numéro du combat dans la vague (par défaut le combat en cours).
function getEnemyLevel(battle = battleIndex) {
    let level = levelForStage(getStageIndex(battle));
    if (battle === 10) level = Math.ceil(level * 1.1) + 1;
    return level;
}

// Niveau des ennemis d'une étape de la route (0 = premier combat), hors boss
function levelForStage(stage) {
    const progress = Math.min(1, stage / 4999);
    // Au-delà de la zone 50, la progression continue sans fin (+1 niveau tous les 20 combats)
    return Math.floor(1 + 199 * Math.pow(progress, 0.6)) + Math.max(0, Math.floor((stage - 4999) / 20));
}

// Gains d'une victoire, volontairement modestes : on progresse surtout par la patrouille (patrol.js),
// qui rapporte pendant l'absence, et les combats durs se gagnent par la technique.
const BATTLE_REWARDS = { money: 0.4, item: 0.35, berry: 0.5, egg: 0.1, tm: 0.1 };
function battleMoneyReward(level) {
    return Math.round((40 + level * 20) * BATTLE_REWARDS.money);
}

// Toujours une équipe complète en face, dès le premier combat : 5 contre 5
function getEnemyCount(maxCount) {
    return maxCount;
}

// Bonus de stats des ennemis (hors vitesse), en plus de leurs paliers (enemy-gen.js) :
// léger en zone 1 (apprentissage), net dès la zone 2, puis un peu plus à chaque zone
const ENEMY_POWER = { zone1: 0.08, zone2: 0.28, perZone: 0.02, max: 0.5 };
function enemyPowerMult(zone = zoneIndex) {
    if (zone <= 1) return 1 + ENEMY_POWER.zone1;
    return 1 + Math.min(ENEMY_POWER.max, ENEMY_POWER.zone2 + ENEMY_POWER.perZone * (zone - 2));
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
  updateBattleHud();

  // Sauvegarder la nouvelle progression via GameData
  GameData.setProgression(zoneIndex, waveIndex, battleIndex);

  // Restaurer les boutons de pré-combat
  const sideActions = document.getElementById('side-actions');
  if (sideActions) sideActions.innerHTML = '';
  if (typeof renderStartBattleButton === 'function') renderStartBattleButton();

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
    debugLog("[DEBUG] Battle.start() method called");
    window.isRunning = false; // Reset propre avant de commencer
    await sleep(50);
    initGlobals();
    setCombatActive(true);
    this.log("Le combat commence !");
    debugLog("[DEBUG] Initializing battle view");
    initBattleView();
    await sleep(200); // Laisse le temps au DOM de se stabiliser
    debugLog("[DEBUG] Calling beginBattleSequence()");
    await beginBattleSequence();
    debugLog("[DEBUG] Battle.start() completed");
  }

  log(message) {
    debugLog(message);
    this.battleLog.push(message);
  }
}
