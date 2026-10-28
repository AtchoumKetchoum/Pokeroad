/**
 * enemy-gen.js - Équipes ennemies thématiques et reproductibles
 *
 *  - Les Pokémon suivent les types de la zone (Glace au Pic Enneigé, Eau au Lac Azur…).
 *  - Même combat = même équipe, même formation, mêmes attaques : on peut préparer une contre-stratégie.
 *  - Formations qui jouent avec le ciblage par colonne : fragile abrité derrière un tank, colonne vide qui renvoie
 *    le contact sur un tank, lanceur au centre qui voit les trois colonnes… Le style dépend de la zone et du boss,
 *    avec une part de hasard (formation, côté) : il faut lire la formation adverse avant de placer son équipe.
 *  - Le 10e combat de chaque vague est un boss entouré de 3 escortes (PV ×1,5 à ×2,5, fureur sous 50 % de PV) ;
 *    les Légendaires ne sont boss qu'à la 10e vague (boss final de la zone).
 *  - Réglages vérifiés avec le banc tools/balance-bench.html.
 */

const EnemyGen = (() => {
    // Générateur pseudo-aléatoire à graine (mulberry32)
    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const FR_TO_TYPE = Object.fromEntries(Object.entries(TYPE_FR).map(([en, fr]) => [fr, en]));
    const bst = (pk) => Object.values(pk.stats || {}).reduce((a, b) => a + b, 0);

    // Puissance de base autorisée selon le niveau : formes de base au début, évolutions ensuite.
    // Au-delà du niveau 53 (~500, évolutions finales), elle monte moins vite : un joueur aligne rarement plus de ~540,
    // la difficulté passe alors par les niveaux et les paliers plutôt que par des pseudo-légendaires partout.
    const maxBstFor = (level) => level <= 53 ? 260 + level * 4.5 : 498.5 + (level - 53) * 2.5;

    // forBoss : false, 'boss' (boss de vague) ou 'final' (boss de la 10e vague, qui peut être un Légendaire)
    function zonePool(zoneNumber, level, forBoss) {
        const zone = getZoneInfo(zoneNumber);
        const legendaryZone = zone.types.includes('Légendaire');
        const wanted = zone.types.map(t => FR_TO_TYPE[t]).filter(Boolean);
        // Boss de vague : un peu plus puissant que la zone ; boss final : Légendaire possible, mais pas plus fort que la zone
        const cap = maxBstFor(level) + (forBoss === 'boss' ? 40 : 0);
        const all = Object.values(PokedexDB || {}).filter(pk => pk && pk.stats && pk.types);
        // Légendaires : boss final de chaque zone, et équipes ordinaires de la zone légendaire (jamais boss de vague)
        const legendOk = forBoss === 'final' || (legendaryZone && !forBoss);
        const allowedRarity = (pk) => legendOk ? pk.rarity !== 'Mythique' : !['Légendaire', 'Mythique'].includes(pk.rarity);
        let pool = all.filter(pk => allowedRarity(pk) && bst(pk) <= cap && pk.types.some(t => wanted.includes(t)));
        // Toujours de quoi remplir une équipe : on élargit si la zone est trop restrictive
        if (pool.length < 8) pool = all.filter(pk => allowedRarity(pk) && bst(pk) <= cap + 60 && pk.types.some(t => wanted.includes(t)));
        if (pool.length < 8) pool = all.filter(pk => allowedRarity(pk) && bst(pk) <= cap);
        // Les plus forts autorisés en premier : la difficulté monte avec le niveau
        return pool.sort((a, b) => bst(b) - bst(a));
    }

    // Choix déterministe de 4 attaques : les meilleures offensives (STAB et couverture) + un effet utile
    function pickMoves(pk, level, rand) {
        const learn = (pk.moves || []).filter(m => typeof m?.name === 'string' && (m.level == null || m.level <= level) && MovesDB?.[m.name]);
        const unique = [...new Map(learn.map(m => [m.name, MovesDB[m.name]])).entries()];
        const score = ([id, mv]) => {
            const stab = pk.types.includes((mv.type || '').toLowerCase()) ? 1.5 : 1;
            return (mv.power || 0) * stab * ((mv.accuracy ?? 100) / 100);
        };
        const damaging = unique.filter(([, mv]) => (mv.power || 0) > 1).sort((a, b) => score(b) - score(a));
        const utility = unique.filter(([, mv]) => mv.damage_class === 'status' && (mv.effect || mv.ops));
        const chosen = [];
        const usedTypes = new Set();
        for (const entry of damaging) {
            if (chosen.length >= 3) break;
            const type = entry[1].type;
            if (usedTypes.has(type) && chosen.length >= 1 && damaging.length > 3) continue; // couverture de types
            chosen.push(entry[0]); usedTypes.add(type);
        }
        if (utility.length) chosen.push(utility[Math.floor(rand() * utility.length)][0]);
        for (const entry of damaging) { if (chosen.length >= 4) break; if (!chosen.includes(entry[0])) chosen.push(entry[0]); }
        return chosen.slice(0, 4);
    }

    // Paliers d'amélioration d'un ennemi : grade, étoiles, niveau des attaques et de l'objet.
    // Ils montent avec la zone, sans plafond, au rythme de ce qu'un joueur peut financer (banc tools/balance-bench.html) :
    // une rampe régulière plutôt que des marches (l'ancienne étoile de la zone 6 donnait +20 % de stats d'un coup).
    function enemyTier(level) {
        const progress = (zoneIndex - 1) + (waveIndex - 1) / 10; // 0 au début, 9,9 en fin de zone 10
        const moveLevel = 1 + Math.floor(progress);
        const itemLevel = moveLevel;
        const starsOf = (lvl) => lvl > 20 ? Math.ceil(lvl / 20) - 1 : 0;
        return {
            grade: 1 + Math.floor(progress * 1.5), // +1,5 % de stats par zone
            stars: Math.floor((zoneIndex - 1) / 10),
            moveLevel, moveStars: starsOf(moveLevel),
            itemLevel, itemStars: starsOf(itemLevel),
        };
    }
    const TYPE_BOOSTER = {
        normal: 'silk-scarf', fire: 'charcoal', water: 'mystic-water', grass: 'miracle-seed', flying: 'sharp-beak',
        poison: 'poison-barb', ground: 'soft-sand', rock: 'hard-stone', electric: 'magnet', ice: 'never-melt-ice',
        fighting: 'black-belt', dragon: 'dragon-fang', ghost: 'spell-tag', steel: 'metal-coat', psychic: 'twisted-spoon', bug: 'silver-powder',
    };

    // ------------------------------------------------------------------
    // FORMATIONS
    // ------------------------------------------------------------------
    // Cases 1 à 9 (1-2-3 devant, de gauche à droite, face aux cases 1-2-3 du joueur). Le contact ne frappe que le premier
    // ennemi de sa colonne (colonne vide : la plus proche), la distance voit sa colonne et les voisines (battle-rules.js).
    // Chaque case liste les rôles qu'elle attend, du plus voulu au moins voulu.
    // Au plus un Pokémon à l'arrière : les zones des attaques sont réglées pour 3 devant + 2 au centre, et chaque ennemi
    // de plus tout au fond les esquive (banc : environ −5 points de victoires par Pokémon à l'arrière).
    const GUARD = ['tank', 'attacker', 'speedster'];                 // devant, encaisse
    const STRIKER = ['attacker', 'speedster', 'tank'];               // devant, frappe
    const GUNNER = ['caster', 'speedster', 'attacker', 'support'];   // à distance
    const SHELTERED = ['caster', 'support', 'speedster'];            // fragile, abrité derrière un autre
    const FORMATIONS = {
        // Ligne de front complète, un lanceur au centre qui voit les trois colonnes, un fragile caché derrière un flanc
        rempart: { name: 'Rempart', slots: { 1: STRIKER, 2: GUARD, 3: STRIKER, 5: GUNNER, 6: SHELTERED } },
        // Deux colonnes gardées : un fragile derrière chaque tank, un attaquant seul au centre
        abri: { name: 'Abri', slots: { 1: GUARD, 4: SHELTERED, 2: STRIKER, 3: GUARD, 6: SHELTERED } },
        // Une colonne vide : le contact qui la vise retombe sur le tank de la colonne voisine
        entonnoir: { name: 'Entonnoir', slots: { 2: GUARD, 5: GUNNER, 8: SHELTERED, 3: STRIKER, 6: GUNNER } },
        // Centre vide, flancs garnis : chaque flanc du joueur n'atteint que le flanc d'en face, son centre est visé des deux côtés
        tenaille: { name: 'Tenaille', slots: { 1: GUARD, 4: GUNNER, 7: SHELTERED, 3: STRIKER, 6: GUNNER } },
    };
    // Style de chaque zone (poids des formations). La Route de l'Éveil apprend à lire une ligne ;
    // au-delà de la zone 10, toutes les formations s'ajoutent au style de la zone.
    const ZONE_STYLE = {
        "Route de l'Éveil": { rempart: 4, abri: 1 },
        'Plaines Sereines': { rempart: 2, abri: 2, entonnoir: 1 },
        "Bois de l'Oubli": { tenaille: 3, abri: 2, entonnoir: 1 },        // embuscades sur les flancs
        'Rivages du Lac Azur': { entonnoir: 3, rempart: 1, abri: 1 },     // le courant rabat vers le tank
        'Cité des Anciens': { abri: 3, rempart: 2, tenaille: 1 },          // gardiens devant les mystiques
        'Flanc du Mont Sélénite': { rempart: 3, abri: 2, entonnoir: 1 },  // murs de roche
        'Col des Brumes': { tenaille: 3, entonnoir: 2, rempart: 1 },      // vols sur les flancs
        'Pic Enneigé': { abri: 2, rempart: 2, entonnoir: 2 },
        'Archipel des Songes': { tenaille: 2, entonnoir: 2, abri: 2 },
        'Sanctuaire du Ciel': { rempart: 1, abri: 1, entonnoir: 1, tenaille: 1 },
    };
    function zoneStyle(zoneNumber) {
        const style = { ...(ZONE_STYLE[getZoneInfo(zoneNumber).name] || ZONE_STYLE['Sanctuaire du Ciel']) };
        if (zoneNumber > 10) Object.keys(FORMATIONS).forEach(key => { style[key] = (style[key] || 0) + 1; });
        return style;
    }
    const ROW_OF_DEPTH = ['front', 'middle', 'back'];
    const laneOfSlot = (slot) => (slot - 1) % 3;
    const depthOfSlot = (slot) => Math.floor((slot - 1) / 3);
    const mirrorSlot = (slot) => slot + 2 - 2 * laneOfSlot(slot);

    // Poste du boss : un Tank tient l'avant, un fragile reste gardé au centre derrière une escorte de sa colonne,
    // un Attaquant fait l'un ou l'autre (gardé deux fois sur trois). Jamais tout au fond : il y esquiverait les zones.
    function bossPost(role, rand) {
        if (role === 'tank') return 'front';
        if (role === 'attacker') return rand() < 2 / 3 ? 'guarded' : 'front';
        return 'guarded';
    }

    // Intérêt d'une case pour un Pokémon : le rôle que la case attend, et une ligne où son rôle garde son bonus.
    // Le boss compte double, préfère la colonne du centre et tient son poste (dans chaque formation,
    // une case de la rangée du centre a toujours quelqu'un devant elle dans sa colonne).
    function slotFit(p, wants, slot) {
        const rank = wants.indexOf(p.role);
        const wellPlaced = BattleRules.ROLES[p.role]?.rows.includes(ROW_OF_DEPTH[depthOfSlot(slot)]);
        const fit = ([3, 2, 1, 0.5][rank] ?? 0) + (wellPlaced ? 1.5 : -2);
        if (!p.boss) return fit;
        return fit * 2 + (laneOfSlot(slot) === 1 ? 3 : 0) + (depthOfSlot(slot) === (p.post === 'front' ? 0 : 1) ? 8 : 0);
    }

    // Meilleure répartition de l'équipe sur les cases d'une formation (5 Pokémon : 120 essais au plus).
    // Un léger bruit départage les égalités : deux équipes proches ne se rangent pas toujours pareil.
    function placeIn(formation, picks, rand) {
        const slots = Object.keys(formation.slots).map(Number);
        const noise = picks.map(() => slots.map(() => rand() * 0.3));
        const at = [], used = new Set();
        let best = { score: -Infinity, at: null };
        (function walk(i, score) {
            if (i === picks.length) { if (score > best.score) best = { score, at: [...at] }; return; }
            slots.forEach((slot, s) => {
                if (used.has(slot)) return;
                used.add(slot); at[i] = slot;
                walk(i + 1, score + slotFit(picks[i], formation.slots[slot], slot) + noise[i][s]);
                used.delete(slot);
            });
        })(0, 0);
        return best;
    }

    // Formation tirée parmi celles qui vont à l'équipe (à 15 % de la meilleure), selon le style de la zone, et un côté au hasard
    function chooseFormation(picks, rand) {
        const style = zoneStyle(zoneIndex);
        const options = Object.entries(style).filter(([key, w]) => w > 0 && Object.keys(FORMATIONS[key].slots).length >= picks.length)
            .map(([key, weight]) => ({ key, weight, ...placeIn(FORMATIONS[key], picks, rand) }));
        // Plus de Pokémon que de cases dans les formations : on remplit l'avant, puis le centre et l'arrière
        if (!options.length) return { key: null, slots: [2, 1, 3, 5, 4, 6, 8, 7, 9].slice(0, picks.length) };
        const top = Math.max(...options.map(o => o.score));
        const fitting = options.filter(o => o.score >= top - Math.abs(top) * 0.15);
        let r = rand() * fitting.reduce((a, o) => a + o.weight, 0);
        const chosen = fitting.find(o => (r -= o.weight) < 0) || fitting[0];
        const mirror = rand() < 0.5;
        return { key: chosen.key, slots: chosen.at.map(slot => mirror ? mirrorSlot(slot) : slot) };
    }

    function generate() {
        const level = getEnemyLevel();
        const isBoss = battleIndex === 10;
        const seed = zoneIndex * 100000 + waveIndex * 1000 + battleIndex * 7 + 13;
        const rand = rng(seed);
        // Toujours 5 contre 5 : un combat de boss aligne le boss et 4 escortes
        const count = getEnemyCount(isBoss ? 4 : 5);
        const pool = zonePool(zoneIndex, level, false);
        const top = pool.slice(0, Math.max(12, Math.ceil(pool.length * 0.35)));

        const picks = [];
        // Zone légendaire : au plus un Légendaire par équipe ordinaire
        const isLegend = (pk) => pk.rarity === 'Légendaire';
        let tries = 0;
        while (picks.length < count && top.length && tries++ < 200) {
            const pk = top[Math.floor(rand() * top.length)];
            if (isLegend(pk) && picks.some(p => isLegend(p.pk)) && top.some(x => !isLegend(x))) continue;
            if (!picks.some(p => p.pk.id === pk.id) || top.length < count) picks.push({ pk });
        }
        if (isBoss) {
            const bossPool = zonePool(zoneIndex, level, waveIndex === 10 ? 'final' : 'boss');
            const boss = bossPool[Math.floor(rand() * Math.min(8, bossPool.length))];
            if (boss) picks.unshift({ pk: boss, boss: true });
        }

        const tierBase = enemyTier(level);
        // Combat de boss : le boss prend tout le bonus de niveau ; ses 4 escortes restent un peu sous le niveau de la vague
        const escortLevel = isBoss ? Math.max(1, Math.min(level, getEnemyLevel(9) - 1)) : level;
        picks.forEach(p => {
            p.level = p.boss ? level + Math.ceil(level * 0.08) : escortLevel;
            p.tier = { ...tierBase };
            p.moves = pickMoves(p.pk, p.level, rand);
            p.role = BattleRules.computeRole(p.pk.stats, p.moves.map(id => ({ ...MovesDB[id], id })));
        });

        // Formation : chaque Pokémon sur la case de la formation qui lui va le mieux (index de la grille ennemie)
        picks.filter(p => p.boss).forEach(p => { p.post = bossPost(p.role, rand); });
        const formation = chooseFormation(picks, rand);
        picks.formation = formation.key;
        picks.forEach((p, i) => { p.slot = BattleRules.indexAt('enemy', depthOfSlot(formation.slots[i]), laneOfSlot(formation.slots[i])); });
        // Objets tenus et baies adaptés au rôle, de plus en plus nombreux avec la zone (comme le joueur)
        picks.forEach(p => {
            p.tier.items = []; p.tier.berries = [];
            if (zoneIndex < 2 && !p.boss) { p.tier.item = null; return; }
            const firstType = (MovesDB?.[p.moves[0]]?.type || p.pk.types[0] || 'normal').toLowerCase();
            const byRole = {
                tank: ['leftovers', 'rocky-helmet', 'assault-vest', 'sitrus-berry'],
                support: ['leftovers', 'light-clay', 'soothe-bell', 'sitrus-berry'],
                speedster: ['quick-claw', 'scope-lens', 'focus-sash', 'salac-berry'],
                attacker: [TYPE_BOOSTER[firstType] || 'muscle-band', 'life-orb', 'expert-belt', 'liechi-berry'],
                caster: [TYPE_BOOSTER[firstType] || 'wise-glasses', 'life-orb', 'expert-belt', 'petaya-berry'],
            }[p.role] || ['leftovers', 'life-orb', 'expert-belt', 'sitrus-berry'];
            // Autant d'objets que le joueur à ce stade (2e emplacement au Grade 3, 3e au Grade 5) ;
            // le boss en a un de plus à partir de la zone 3 (en zones 1-2 il apprend au joueur à le battre)
            const bossExtra = p.boss && zoneIndex >= 3 ? 1 : 0;
            const nItems = Math.min(3, 1 + (zoneIndex >= 5 ? 1 : 0) + (zoneIndex >= 11 ? 1 : 0) + bossExtra);
            const nBerries = Math.min(3, (zoneIndex >= 3 ? 1 : 0) + (zoneIndex >= 6 ? 1 : 0) + (p.boss ? 1 : 0));
            byRole.filter(id => !/-berry$/.test(id)).slice(0, nItems).forEach(id => p.tier.items.push(id));
            [byRole.find(id => /-berry$/.test(id)), 'lum-berry', 'enigma-berry'].filter(Boolean).slice(0, nBerries).forEach(id => p.tier.berries.push(id));
            p.tier.item = p.tier.items[0] || null;
        });
        return picks;
    }

    function setup() {
        const enemyGrid = document.getElementById('enemy-grid');
        if (!enemyGrid || !PokedexDB) return;
        const slots = Array.from(enemyGrid.querySelectorAll('.unit-slot'));
        const picks = generate();
        enemyGrid.dataset.formation = picks.formation || '';
        picks.forEach(p => {
            const slot = slots[p.slot];
            if (!slot) return;
            const unit = document.createElement('div');
            unit.className = 'unit' + (p.boss ? ' is-boss' : '');
            unit.dataset.pokemonId = p.pk.id;
            unit.dataset.moves = p.moves.join(',');
            if (p.boss) unit.dataset.boss = '1';
            unit.dataset.tier = JSON.stringify(p.tier);
            unit.style.animationDelay = `-${(Math.random() * 5).toFixed(2)}s`;
            const name = safeName(p.pk);
            unit.innerHTML = `
                <div class="hp-box">
                    <div class="status-icons"></div>
                    <div class="status-main-row">
                        <span class="lvl-badge">Lv.${p.level}${p.tier.stars ? ` ${'★'.repeat(Math.min(3, p.tier.stars))}${p.tier.stars > 3 ? p.tier.stars : ''}` : ''}</span>
                        <div class="hp-container-minimal">
                            <div class="ap-bar"><div class="ap-fill" style="width: 0%;"></div></div>
                            <div class="hp-bar-bg"><div class="hp-fill" style="width: 100%;"></div></div>
                        </div>
                        <span class="charge-text">0%</span>
                    </div>
                </div>
                <div class="shadow"></div>
                ${PmdSprite.markup({ dex: p.pk.id, fallback: p.pk.sprite, alt: name, facing: 'down', height: p.pk.height })}`;
            slot.appendChild(unit);
            PmdSprite.hydrate(unit);
            Epic.decorateEnemy(unit, p.tier, p.boss);
        });
    }

    return { setup, generate };
})();
