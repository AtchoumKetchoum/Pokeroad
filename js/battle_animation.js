/**
 * battle_animation.js - Mise en scène des attaques
 * Chaque attaque se joue en quatre temps : concentration de l'attaquant, cases visées qui s'illuminent
 * (selon la forme de zone et sa part de dégâts), trajet (élan au contact, projectile, salve, ricochet),
 * puis impact (images du type, secousse, chiffres de dégâts). Les dessins sont faits par js/battle-vfx.js ;
 * ici on pilote les sprites (élan, recul, animations PMD), les textes et le rythme.
 */

const BattleAnimation = (() => {
    let dom = {}; // Initialisé avec les références du DOM depuis battle.js
    let _getSlotEl = null; // Pour stocker la fonction passée depuis battle.js
    let _spawnEffectText = null; // Pour stocker la fonction passée depuis battle.js

    // --- CONFIGURATION ---
    let _battleSpeed = 1;

    // --- FONCTIONS UTILITAIRES ---

    const sleep = (ms) => new Promise(res => setTimeout(res, ms / _battleSpeed));
    const VFX = () => (typeof BattleVfx !== 'undefined' && !BattleVfx.disabled ? BattleVfx : null);

    // Boîte de dialogue du combat : le texte s'écrit lettre par lettre, comme sur GBA
    let sayToken = 0;
    function say(text) {
        const box = document.getElementById('targetPrompt');
        if (!box) return;
        const token = ++sayToken;
        box.style.display = 'block';
        box.classList.add('gba-say');
        box.textContent = '';
        const chars = [...String(text)];
        const delay = Math.max(4, 22 / _battleSpeed);
        let i = 0;
        const tick = () => {
            if (token !== sayToken) return; // un nouveau message a remplacé celui-ci
            box.textContent = chars.slice(0, ++i).join('');
            if (i < chars.length) setTimeout(tick, delay);
        };
        tick();
    }

    // Conteneur de la scène de combat (toutes les particules / textes y sont injectés)
    function getBattleScreen() {
        return document.querySelector('#view-battle .scaler-view');
    }

    function getElementCenter(el) {
        const screen = getBattleScreen();
        if (!screen || !el) return { x: 0, y: 0 };
        const screenRect = screen.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();

        // Calculer l'échelle actuelle appliquée par MobileManager
        const scaleX = screenRect.width / screen.offsetWidth;
        const scaleY = screenRect.height / screen.offsetHeight;

        return {
            x: (elRect.left + elRect.width / 2 - screenRect.left) / (scaleX || 1),
            y: (elRect.top + elRect.height / 2 - screenRect.top) / (scaleY || 1)
        };
    }

    // Sprite animé PMD (js/pmd-sprite.js) : sans effet si le Pokémon garde son illustration
    function playSpriteAnim(unitOrSlotEl, names, options) {
        const spriteEl = unitOrSlotEl?.querySelector('.sprite');
        if (spriteEl && typeof PmdSprite !== 'undefined') PmdSprite.play(spriteEl, names, options);
    }

    // Animations PMD jouées selon la catégorie de l'attaque (la première disponible est utilisée)
    const SPRITE_ANIMS = {
        physical: ['Attack'],
        special: ['Shoot', 'Charge', 'Attack'],
        status: ['Charge', 'Pose', 'Attack'],
    };

    // Coup reçu façon Pokémon GBA : la cible clignote et recule par petits à-coups
    function playUnitShake(unitSlotEl) {
        if (!unitSlotEl) return;
        const unitEl = unitSlotEl.querySelector('.unit');
        if (!unitEl) return;
        unitEl.classList.remove('gba-hit');
        void unitEl.offsetWidth; // relance l'animation
        unitEl.style.setProperty('--gba-hit-duration', `${Math.round(480 / _battleSpeed)}ms`);
        unitEl.classList.add('gba-hit');
        setTimeout(() => unitEl.classList.remove('gba-hit'), 500 / _battleSpeed);
    }

    function spawnMoveNameText(attacker, name, offsetY = 0) {
        if (!attacker) return;
        const targetEl = _getSlotEl(attacker._side, attacker._index);
        if (!targetEl) return;

        const screen = getBattleScreen();
        const center = getElementCenter(targetEl);

        const textEl = document.createElement('div');
        textEl.className = 'move-name-float-text explosive-text';
        textEl.textContent = name;

        textEl.style.left = `${center.x}px`;
        textEl.style.top = `${center.y + offsetY - 40}px`;

        screen.appendChild(textEl);
        setTimeout(() => textEl.remove(), 2000 / _battleSpeed);
    }

    // Décalage vertical des textes flottants (utilisé par battle.js)
    const TEXT_OFFSET_Y = -30;

    // --- OUTILS DE MISE EN SCÈNE ---

    const moveTypeOf = (attacker, move) => {
        try { return (typeof BattleRules !== 'undefined' && BattleRules.moveTypeFor?.(attacker, move)) || move.type || 'normal'; }
        catch { return move.type || 'normal'; }
    };
    const shapeOf = (move) => (move?._isBoosted && move.rw?.z?.shape) || move?.rw?.shape || '';
    const isContactMove = (move) => {
        try { if (typeof BattleRules !== 'undefined' && BattleRules.isContact) return !!BattleRules.isContact(move); }
        catch { /* règle indisponible */ }
        return move.damage_class === 'physical';
    };

    /**
     * L'attaquant s'élance vers la cible : petit recul d'élan, puis ruée jusqu'au contact.
     * Le Pokémon est dans un plateau incliné en 3D : on mesure où le mène un décalage et on corrige,
     * pour qu'il arrive vraiment sur sa cible.
     */
    async function lunge(unitEl, targetSlotEl) {
        const targetUnit = targetSlotEl.querySelector('.unit') || targetSlotEl;
        const start = getElementCenter(unitEl), end = getElementCenter(targetUnit);
        let dx = end.x - start.x, dy = end.y - start.y;
        const d = Math.hypot(dx, dy) || 1;
        // Mesure (sans transition ni rendu intermédiaire) du rapport entre décalage local et décalage à l'écran
        unitEl.style.transition = 'none';
        unitEl.style.transform = `translate(${dx}px, ${dy}px)`;
        const probe = getElementCenter(unitEl);
        const rx = Math.abs(probe.x - start.x) > 4 ? dx / (probe.x - start.x) : 1;
        const ry = Math.abs(probe.y - start.y) > 4 ? dy / (probe.y - start.y) : 1;
        dx *= Math.max(0.5, Math.min(2.5, rx)); dy *= Math.max(0.5, Math.min(2.5, ry));
        unitEl.style.transform = '';
        void unitEl.offsetWidth;

        const grid = unitEl.closest('.team-grid');
        if (grid) grid.style.zIndex = 6; // passe devant le plateau adverse
        unitEl.style.zIndex = 100;
        // Élan
        unitEl.style.transition = `transform ${0.1 / _battleSpeed}s ease-out`;
        unitEl.style.transform = `translate(${-dx / d * 18}px, ${-dy / d * 18}px) scale(1.1, .9)`;
        await sleep(100);
        // Ruée (accélère jusqu'à l'impact)
        unitEl.style.transition = `transform ${0.14 / _battleSpeed}s cubic-bezier(.6, 0, .9, .5)`;
        unitEl.style.transform = `translate(${dx * 0.82}px, ${dy * 0.82}px) scale(.92, 1.1)`;
        await sleep(140);
    }
    async function lungeBack(unitEl) {
        unitEl.style.transition = `transform ${0.26 / _battleSpeed}s cubic-bezier(.2, .8, .3, 1)`;
        unitEl.style.transform = '';
        await sleep(260);
        unitEl.style.zIndex = 'auto';
        const grid = unitEl.closest('.team-grid');
        if (grid) grid.style.zIndex = '';
    }

    function effectivenessMessage(typeMod) {
        if (typeMod >= 2) return "C'est super efficace !";
        if (typeMod === 0) return "Ça n'affecte pas l'ennemi...";
        if (typeMod > 0 && typeMod < 1) return "Ce n'est pas très efficace...";
        return '';
    }

    // --- ATTAQUE OFFENSIVE ---

    /**
     * damages : [{ target, dmg, typeMod, mult (part de la forme), crit, strikes (coups visibles) }]
     */
    async function playAttack(attacker, damages, move) {
        const attSlot = _getSlotEl(attacker._side, attacker._index);
        const unitEl = attSlot?.querySelector('.unit');
        if (!unitEl) return;
        const fx = VFX();
        const type = moveTypeOf(attacker, move);
        const z = !!move._isBoosted;
        const contact = isContactMove(move);
        const shape = shapeOf(move);
        const hits = damages
            .map(d => ({ ...d, el: _getSlotEl(d.target._side, d.target._index) }))
            .filter(h => h.el && !h.target.isKO);
        if (!hits.length) return;
        const common = { power: move.power || 50, z, boss: !!attacker.isBoss, contact, mark: contact && fx ? fx.markFor(move) : null };
        const mainMod = hits[0].typeMod ?? 1;

        unitEl.classList.add('is-attacking');
        playSpriteAnim(unitEl, contact ? SPRITE_ANIMS.physical : SPRITE_ANIMS.special);
        if (fx) await fx.charge(attSlot, type, { z, ms: contact ? 120 : 170 });
        // Cases touchées : chacune s'illumine selon sa part de dégâts
        if (fx && (hits.length > 1 || z)) fx.zone(hits.map(h => ({ el: h.el, mult: h.mult ?? 1 })), type);

        let stopped = false; // un seul gel d'image par attaque
        let lethalPause = false;
        const land = (h, main, final) => {
            const lethal = final && h.dmg > 0 && h.dmg >= h.target.hp && h.target.hp > 0;
            if (lethal) lethalPause = true;
            fx?.impact(type, h.el, { ...common, mult: h.mult ?? 1, crit: h.crit, typeMod: h.typeMod, lethal, main: main || lethal });
            if (h.dmg > 0) {
                playSpriteAnim(h.el, ['Hurt'], { hold: 250 });
                playUnitShake(h.el);
            }
            if (final) showHitNumber(h, lethal);
            // Gel de l'image sur le coup principal s'il est marquant
            const strong = h.crit || (h.typeMod ?? 1) >= 2 || (move.power || 0) >= 80 || z || lethal;
            if (main && strong && !stopped && fx) { stopped = true; fx.freeze(z ? 160 : 90); return sleep(z ? 160 : 90); }
            return null;
        };
        const later = (ms, fn) => sleep(ms).then(fn);

        if (contact) {
            fx?.dash(attSlot, hits[0].el, type);
            await lunge(unitEl, hits[0].el);
            const strikes = Math.min(4, hits[0].strikes || 1);
            for (let s = 0; s < strikes; s++) {
                const isLast = s === strikes - 1;
                await Promise.all(hits.map((h, i) => (i ? later(i * 45, () => land(h, false, isLast)) : land(h, s === 0, isLast))));
                if (!isLast) await sleep(110);
            }
        } else if (shape.startsWith('ricochet') && hits.length > 1) {
            let from = attSlot;
            for (let i = 0; i < hits.length; i++) {
                await (fx ? fx.launch(type, from, hits[i].el, i ? 0.8 : 1) : sleep(200));
                await land(hits[i], i === 0, true);
                from = hits[i].el;
            }
        } else {
            await Promise.all(hits.map(async (h, i) => {
                if (i) await sleep(i * 50);
                const strikes = Math.min(4, h.strikes || 1);
                for (let s = 0; s < strikes; s++) {
                    if (s) await sleep(70);
                    await (fx ? fx.launch(type, attSlot, h.el, z ? 1.4 : 1) : sleep(300));
                    await land(h, i === 0 && s === 0, s === strikes - 1);
                }
            }));
        }

        const msg = effectivenessMessage(mainMod);
        if (msg) say(msg);
        fx?.release(attSlot);
        // Coup fatal : on laisse le ralenti se jouer
        if (lethalPause) await sleep(fx && !fx.reduced() ? 320 : 120);
        if (contact) { await sleep(150); await lungeBack(unitEl); } // reste un instant au contact
        else await sleep(z ? 260 : 180);
        unitEl.classList.remove('is-attacking');
    }

    // Chiffre de dégâts d'une cible : plus gros pour un critique, un super efficace, un coup fatal
    function showHitNumber(h, lethal) {
        if (!h.dmg) return;
        const cls = [
            typeof Epic !== 'undefined' ? Epic.damageClass(h.dmg, h.target.maxHp) : '',
            h.crit ? 'crit' : '',
            (h.typeMod ?? 1) >= 2 ? 'super' : '',
            (h.typeMod ?? 1) > 0 && (h.typeMod ?? 1) < 1 ? 'weak' : '',
            lethal ? 'lethal' : '',
        ].filter(Boolean).join(' ');
        api.showDamageNumber(h.el, h.dmg, TEXT_OFFSET_Y - 40, cls); // au-dessus de l'impact, pour rester lisible
    }

    // --- CAPACITÉ DE STATUT ---

    async function playStatus(attacker, target, move) {
        const attSlot = _getSlotEl(attacker._side, attacker._index);
        const unitEl = attSlot?.querySelector('.unit');
        if (!unitEl) return;
        const fx = VFX();
        const type = moveTypeOf(attacker, move);
        const sprite = unitEl.querySelector('.sprite');
        unitEl.classList.add('is-attacking');
        playSpriteAnim(unitEl, SPRITE_ANIMS.status);
        sprite?.classList.add('status-glow');
        if (fx) {
            const charging = fx.charge(attSlot, type, { status: true, z: !!move._isBoosted, ms: 360 });
            const targetEl = target && target !== attacker ? _getSlotEl(target._side, target._index) : null;
            if (targetEl) setTimeout(() => fx.puff(type, targetEl), 260 / _battleSpeed);
            await charging;
            await sleep(200);
            fx.release(attSlot);
        } else {
            await sleep(600);
        }
        sprite?.classList.remove('status-glow');
        unitEl.classList.remove('is-attacking');
    }

    // --- K.O. ---

    function knockOut(slotEl, unit) {
        const fx = VFX();
        if (!slotEl || !fx) return; // banc d'équilibrage : pas de mise en scène
        fx.knockOut(slotEl, { boss: !!unit?.isBoss });
        const screen = getBattleScreen();
        if (!screen) return;
        const c = getElementCenter(slotEl);
        const stamp = document.createElement('div');
        stamp.className = 'ko-stamp' + (unit?.isBoss ? ' boss' : '');
        stamp.textContent = 'K.O. !';
        stamp.style.left = `${c.x}px`;
        stamp.style.top = `${c.y - 20}px`;
        stamp.style.setProperty('--ko-duration', `${Math.round(1100 / _battleSpeed)}ms`);
        screen.appendChild(stamp);
        setTimeout(() => stamp.remove(), 1150 / _battleSpeed);
    }

    // --- API PUBLIQUE ---
    const guard = (label, fn) => async (...args) => {
        try { await fn(...args); }
        catch (e) { console.warn(`[BattleAnimation] ${label} ignorée :`, e); }
    };

    const api = {
        init: (domRefs, getSlotElFn, spawnEffectTextFn) => {
            dom = domRefs;
            _getSlotEl = getSlotElFn;
            _spawnEffectText = spawnEffectTextFn;
        },

        say,

        setSpeed: (speed) => {
            _battleSpeed = speed;
            if (typeof BattleVfx !== 'undefined') BattleVfx.setSpeed(speed);
            // L'accélération ne concerne les sprites que pendant le combat (préparation et victoire à vitesse normale)
            if (typeof PmdSprite !== 'undefined') PmdSprite.setSpeed(window.isRunning ? speed : 1);
        },

        // Utilisés par battle.js (nom de l'attaque, décalage vertical des textes flottants)
        spawnMoveNameText,
        BaseAnimationStrategy: { TEXT_OFFSET_Y },

        // Les animations sont purement visuelles : une erreur ne doit jamais bloquer le combat
        playAttack: guard('animation', playAttack),
        playActionAnimation: guard('animation', async (attacker, target, move, damage, typeMod) => {
            if (move.damage_class === 'status' || !move.power) return playStatus(attacker, target, move);
            return playAttack(attacker, [{ target, dmg: damage, typeMod, mult: 1 }], move);
        }),
        playAoeAnimation: guard('animation de zone', (attacker, damages, move) => playAttack(attacker, damages, move)),
        playPhysicalAOEAnimation: guard('animation de zone', (attacker, targets, move, damages) =>
            playAttack(attacker, damages.map((d, i) => ({ target: targets[i], ...d })), move)),
        knockOut: (slotEl, unit) => { try { knockOut(slotEl, unit); } catch (e) { console.warn('[BattleAnimation] K.O. ignoré :', e); } },

        showDamageNumber: (targetEl, damage, offsetY = 0, extraClass = '') => {
            if (!targetEl || damage === 0) return;
            const screen = getBattleScreen();
            if (!screen) return;
            const center = getElementCenter(targetEl);
            const numberEl = document.createElement('div');
            numberEl.className = 'damage-float-number' + (damage < 0 ? ' heal' : '') + (extraClass ? ` ${extraClass}` : '');
            numberEl.textContent = damage < 0 ? `+${-damage}` : damage;
            if (/\bcrit\b/.test(extraClass)) numberEl.dataset.tag = 'CRITIQUE !';
            numberEl.style.left = `${center.x + (Math.random() * 24 - 12)}px`;
            numberEl.style.top = `${center.y + offsetY}px`;
            numberEl.style.setProperty('--dmg-duration', `${Math.round(1150 / _battleSpeed)}ms`);
            screen.appendChild(numberEl);
            setTimeout(() => numberEl.remove(), 1200 / _battleSpeed);
        }
    };
    return api;
})();
