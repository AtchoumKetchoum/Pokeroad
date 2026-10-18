/**
 * battle_animation.js - Moteur d'animations de combat
 * Utilise un pattern "Strategy" pour choisir l'animation appropriée
 * en fonction de la catégorie de l'attaque (physique, spéciale, statut).
 */

const BattleAnimation = (() => {
    let dom = {}; // Initialisé avec les références du DOM depuis battle.js
    let _getSlotEl = null; // Pour stocker la fonction passée depuis battle.js
    let _spawnEffectText = null; // Pour stocker la fonction passée depuis battle.js

    // --- CONFIGURATION ---
    let _battleSpeed = 1;

    // 1. Dictionnaire des types pour les effets visuels
    const TYPE_CONFIG = {
        normal:    { color: '#A8A878', particle: 'spark', flash: '#ffffff' },
        fire:      { color: '#F08030', particle: 'flame', flash: '#ff4400' },
        water:     { color: '#6890F0', particle: 'bubble', flash: '#00ccff' },
        grass:     { color: '#78C850', particle: 'leaf', flash: '#00ff00' },
        electric:  { color: '#F8D030', particle: 'electric', flash: '#ffff00' },
        ice:       { color: '#98D8D8', particle: 'ice', flash: '#ffffff' },
        fighting:  { color: '#C03028', particle: 'spark', flash: '#ff0000' },
        poison:    { color: '#A040A0', particle: 'bubble', flash: '#aa00ff' },
        ground:    { color: '#E0C068', particle: 'rock_shard', flash: '#663300' },
        flying:    { color: '#A890F0', particle: 'gust', flash: '#ffffff' },
        psychic:   { color: '#F85888', particle: 'psychic_wave', flash: '#ff00ff' },
        bug:       { color: '#A8B820', particle: 'spark', flash: '#ccff00' },
        rock:      { color: '#B8A038', particle: 'rock_shard', flash: '#666666' },
        ghost:     { color: '#705898', particle: 'ghost_orb', flash: '#330066' },
        dragon:    { color: '#7038F8', particle: 'spark', flash: '#3300ff' },
        dark:      { color: '#705848', particle: 'spark', flash: '#111111' },
        steel:     { color: '#B8B8D0', particle: 'spark', flash: '#cccccc' },
        fairy:     { color: '#EE99AC', particle: 'fairy_dust', flash: '#ffccff' }
    };

    // --- FONCTIONS UTILITAIRES ---

    const sleep = (ms) => new Promise(res => setTimeout(res, ms / _battleSpeed));

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

    function playScreenFlash(color = 'white') {
        const screen = getBattleScreen();
        if (!screen) return;
        const flash = document.createElement('div');
        flash.className = 'screen-flash';
        flash.style.backgroundColor = color;
        screen.appendChild(flash);
        setTimeout(() => flash.remove(), 400 / _battleSpeed);
    }

    /**
     * Applique une teinte de couleur à tout l'écran de manière progressive.
     */
    function applyScreenTint(color) {
        let tint = document.getElementById('screen-tint-overlay');
        if (!tint) {
            tint = document.createElement('div');
            tint.id = 'screen-tint-overlay';
            tint.className = 'screen-tint-overlay';
            getBattleScreen()?.appendChild(tint);
        }
        tint.style.backgroundColor = color;
        tint.classList.add('active');
    }

    function removeScreenTint() {
        const tint = document.getElementById('screen-tint-overlay');
        if (tint) tint.classList.remove('active');
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
    function playUnitShake(unitSlotEl, power) {
        if (!unitSlotEl) return;
        const unitEl = unitSlotEl.querySelector('.unit');
        if (!unitEl) return;
        unitEl.classList.remove('gba-hit');
        void unitEl.offsetWidth; // relance l'animation
        unitEl.style.setProperty('--gba-hit-duration', `${Math.round(480 / _battleSpeed)}ms`);
        unitEl.classList.add('gba-hit');
        setTimeout(() => unitEl.classList.remove('gba-hit'), 500 / _battleSpeed);
    }

    // Secousse réservée aux coups marquants (super efficace, critique, grosse puissance) :
    // le décor et les équipes tremblent par paliers, l'interface reste fixe
    function playScreenShake(power, strong = false) {
        if (!strong && (power || 0) < 90) return;
        const screen = getBattleScreen();
        if (!screen) return;
        screen.classList.remove('gba-quake');
        void screen.offsetWidth;
        screen.style.setProperty('--gba-quake-duration', `${Math.round(320 / _battleSpeed)}ms`);
        screen.classList.add('gba-quake');
        setTimeout(() => screen.classList.remove('gba-quake'), 340 / _battleSpeed);
    }

    // Éclat d'impact en pixel art (étoile 11x11 colorée selon le type)
    const BURST_PIXELS = [
        '.....#.....', '.....#.....', '..#..#..#..', '...#.#.#...', '....###....',
        '###########', '....###....', '...#.#.#...', '..#..#..#..', '.....#.....', '.....#.....'
    ];
    function pixelBurstSvg(color) {
        const rects = [];
        BURST_PIXELS.forEach((row, y) => [...row].forEach((c, x) => {
            if (c !== '#') return;
            const isCore = Math.abs(x - 5) <= 1 && Math.abs(y - 5) <= 1;
            rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${isCore ? '#fff' : color}"/>`);
        }));
        return `<svg viewBox="-1 -1 13 13" shape-rendering="crispEdges" aria-hidden="true"><g stroke="#1b1f3b" stroke-width=".35" paint-order="stroke">${rects.join('')}</g></svg>`;
    }

    // --- STRATÉGIES D'ANIMATION (Design Pattern: Strategy) ---

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

    class BaseAnimationStrategy {
        static TEXT_OFFSET_Y = -30;
        constructor(attacker, target, move, damage, typeMod) {
            this.attacker = attacker;
            this.target = target;
            this.move = move;
            this.damage = damage;
            this.typeMod = typeMod;
            this.typeConfig = TYPE_CONFIG[move.type] || TYPE_CONFIG.normal;

            this.attackerEl = _getSlotEl(attacker._side, attacker._index);
            this.targetEl = _getSlotEl(target._side, target._index);
        }

        getPowerScale() {
            return 1.3 + ((this.move.power || 40) / 100) * 1.5;
        }

        /** Éclat pixel art à l'impact (remplace l'ancienne pluie de confettis). */
        createImpactExplosion() {
            if (!this.targetEl) return;
            const center = getElementCenter(this.targetEl);
            const burst = document.createElement('div');
            burst.className = 'gba-burst';
            burst.innerHTML = pixelBurstSvg(this.typeConfig.color);
            burst.style.left = `${center.x}px`;
            burst.style.top = `${center.y}px`;
            burst.style.setProperty('--gba-burst-size', `${Math.round(70 + Math.min(60, (this.move.power || 40) / 2))}px`);
            burst.style.setProperty('--gba-burst-duration', `${Math.round(360 / _battleSpeed)}ms`);
            getBattleScreen().appendChild(burst);
            setTimeout(() => burst.remove(), 380 / _battleSpeed);
        }

        async playHitFreeze(duration = 70) {
            const screen = getBattleScreen();
            if (screen) screen.classList.add('hit-stop-global');
            await sleep(duration);
            if (screen) screen.classList.remove('hit-stop-global');
        }

        async applyHitEffects() {
            // Hit Stop / Freeze
            const targetSprite = this.targetEl?.querySelector('.sprite');
            if (targetSprite) targetSprite.classList.add('hit-stop');
            
            await this.playHitFreeze(80); 
            
            if (targetSprite) targetSprite.classList.remove('hit-stop');

            this.createImpactExplosion();
            
            playSpriteAnim(this.targetEl, ['Hurt'], { hold: 250 });

            playUnitShake(this.targetEl, this.move.power);
            playScreenShake(this.move.power, this.typeMod >= 2);
            
            BattleAnimation.showDamageNumber(_getSlotEl(this.target._side, this.target._index), this.damage, BaseAnimationStrategy.TEXT_OFFSET_Y,
                typeof Epic !== 'undefined' ? Epic.damageClass(this.damage, this.target.maxHp) : '');

            // Efficacité
            let effectivenessMessage = '';
            if (this.typeMod >= 2) effectivenessMessage = "C'est super efficace !";
            else if (this.typeMod === 0.5) effectivenessMessage = "Ce n'est pas très efficace...";
            else if (this.typeMod === 0) effectivenessMessage = "Ça n'affecte pas l'ennemi...";

            // Comme sur GBA, le message d'efficacité s'écrit dans la boîte de dialogue
            if (effectivenessMessage) say(effectivenessMessage);
            await sleep(150);
        }
    }

    class PhysicalAOEAnimationStrategy extends BaseAnimationStrategy {
        constructor(attacker, targets, move, damages) {
            super(attacker, targets[0], move, damages[0].dmg, damages[0].typeMod);
            this.targets = targets;
            this.damages = damages;
        }

        async execute() {
            if (!this.attackerEl || !this.targets.length) return;
            const unitEl = this.attackerEl.querySelector('.unit');
            if (!unitEl) return;

            unitEl.classList.add('is-attacking');

            const startPos = getElementCenter(unitEl);
            unitEl.style.zIndex = 100;

            for (let i = 0; i < this.targets.length; i++) {
                const target = this.targets[i];
                const damageData = this.damages[i];
                const targetEl = _getSlotEl(target._side, target._index);
                if (!targetEl || target.isKO) continue;

                const targetUnit = targetEl.querySelector('.unit');
                const endPos = getElementCenter(targetUnit);

                playSpriteAnim(unitEl, SPRITE_ANIMS.physical);
                unitEl.style.transition = `transform ${0.2 / _battleSpeed}s cubic-bezier(0.1, 0.7, 0.1, 1)`;
                unitEl.style.transform = `translate(${endPos.x - startPos.x}px, ${endPos.y - startPos.y}px)`;
                await sleep(200);

                // Shake à l'impact sur l'ennemi
                targetUnit.classList.add('physical-impact-shake');
                this.target = target;
                this.damage = damageData.dmg;
                this.typeMod = damageData.typeMod;
                this.targetEl = targetEl;
                await this.applyHitEffects();
                setTimeout(() => targetUnit.classList.remove('physical-impact-shake'), 300);
            }

            unitEl.style.transition = `transform ${0.3 / _battleSpeed}s ease-in-out`;
            unitEl.style.transform = '';
            await sleep(300);
            unitEl.style.zIndex = 'auto';
            unitEl.classList.remove('is-attacking');
        }
    }

    // Attaque de zone : l'attaquant part une seule fois, toutes les cibles encaissent en même temps
    class SimultaneousAOEAnimationStrategy extends BaseAnimationStrategy {
        constructor(attacker, damages, move) {
            super(attacker, damages[0].target, move, damages[0].dmg, damages[0].typeMod);
            this.damages = damages;
        }

        // Effets d'impact d'une cible, sans attendre les autres
        hitOne({ target, dmg, typeMod }) {
            const hit = Object.create(this);
            hit.target = target; hit.damage = dmg; hit.typeMod = typeMod;
            hit.targetEl = _getSlotEl(target._side, target._index);
            return hit.applyHitEffects();
        }

        async execute() {
            if (!this.attackerEl) return;
            const unitEl = this.attackerEl.querySelector('.unit');
            if (!unitEl) return;
            unitEl.classList.add('is-attacking');
            const startPos = getElementCenter(unitEl);
            const physical = this.move.damage_class === 'physical';
            if (physical) {
                // Élan vers le point d'impact (première cible), puis tous les coups ensemble
                const firstEl = this.targetEl?.querySelector('.unit');
                const endPos = firstEl ? getElementCenter(firstEl) : startPos;
                playSpriteAnim(unitEl, SPRITE_ANIMS.physical);
                unitEl.style.zIndex = 100;
                unitEl.style.transition = `transform ${0.2 / _battleSpeed}s cubic-bezier(0.17, 0.84, 0.44, 1)`;
                unitEl.style.transform = `translate(${endPos.x - startPos.x}px, ${endPos.y - startPos.y}px)`;
                await sleep(200);
            } else {
                // Un projectile par cible, tous lancés en même temps
                playSpriteAnim(unitEl, SPRITE_ANIMS.special);
                const shots = this.damages.map(({ target }) => {
                    const el = _getSlotEl(target._side, target._index)?.querySelector('.unit');
                    if (!el) return null;
                    const end = getElementCenter(el);
                    const shot = document.createElement('div');
                    shot.className = `projectile ${this.typeConfig.particle}`;
                    shot.style.backgroundColor = this.typeConfig.color;
                    shot.style.width = shot.style.height = '22px';
                    shot.style.borderRadius = '50%';
                    shot.style.boxShadow = `0 0 15px ${this.typeConfig.color}`;
                    shot.style.transform = `translate(${startPos.x}px, ${startPos.y}px) translate(-50%, -50%) scale(0.5)`;
                    getBattleScreen().appendChild(shot);
                    return { shot, end };
                }).filter(Boolean);
                await sleep(50);
                shots.forEach(({ shot, end }) => {
                    shot.style.transition = `transform ${0.4 / _battleSpeed}s cubic-bezier(0.4, 0, 0.2, 1)`;
                    shot.style.transform = `translate(${end.x}px, ${end.y}px) translate(-50%, -50%) scale(${this.getPowerScale()})`;
                });
                await sleep(400);
                shots.forEach(({ shot }) => shot.remove());
            }
            const units = this.damages.map(({ target }) => _getSlotEl(target._side, target._index)?.querySelector('.unit')).filter(Boolean);
            units.forEach(el => el.classList.add('physical-impact-shake'));
            await Promise.all(this.damages.map(d => this.hitOne(d)));
            setTimeout(() => units.forEach(el => el.classList.remove('physical-impact-shake')), 300);
            if (physical) {
                unitEl.style.transition = `transform ${0.3 / _battleSpeed}s ease-in-out`;
                unitEl.style.transform = '';
                await sleep(300);
                unitEl.style.zIndex = 'auto';
            }
            unitEl.classList.remove('is-attacking');
        }
    }

    class PhysicalAnimationStrategy extends BaseAnimationStrategy {
        async execute() {
            if (!this.attackerEl || !this.targetEl) return;
            const unitEl = this.attackerEl.querySelector('.unit');
            if (!unitEl) return;

            unitEl.classList.add('is-attacking');

            const targetUnit = this.targetEl.querySelector('.unit');
            const startPos = getElementCenter(unitEl);
            const endPos = getElementCenter(targetUnit);

            // 1. Déplacement
            playSpriteAnim(unitEl, SPRITE_ANIMS.physical);
            unitEl.style.zIndex = 100;
            unitEl.style.transition = `transform ${0.2 / _battleSpeed}s cubic-bezier(0.17, 0.84, 0.44, 1)`;
            unitEl.style.transform = `translate(${endPos.x - startPos.x}px, ${endPos.y - startPos.y}px)`;
            await sleep(200);

            // 2. Shake à l'impact
            targetUnit.classList.add('physical-impact-shake');
            await this.applyHitEffects();
            setTimeout(() => targetUnit.classList.remove('physical-impact-shake'), 300);

            // 3. Retour
            unitEl.style.transition = `transform ${0.4 / _battleSpeed}s ease-in-out`;
            unitEl.style.transform = '';
            await sleep(400);
            
            unitEl.style.zIndex = 'auto';
            unitEl.classList.remove('is-attacking');
        }
    }

    class SpecialAnimationStrategy extends BaseAnimationStrategy {
        async execute() {
            if (!this.attackerEl || !this.targetEl) return;
            const unitEl = this.attackerEl.querySelector('.unit');
            if (!unitEl) return;
            const attackerSprite = unitEl.querySelector('.sprite');

            unitEl.classList.add('is-attacking');

            const startPos = getElementCenter(unitEl);
            const endPos = getElementCenter(this.targetEl.querySelector('.unit'));

            playSpriteAnim(unitEl, SPRITE_ANIMS.special);
            if (attackerSprite) {
                attackerSprite.classList.add('is-recoiling');
                await sleep(150);
            }

            const projectile = document.createElement('div');
            projectile.className = `projectile ${this.typeConfig.particle}`;
            projectile.style.backgroundColor = this.typeConfig.color;
            const size = 20 + Math.random() * 10;
            projectile.style.width = `${size}px`;
            projectile.style.height = `${size}px`;
            projectile.style.borderRadius = '50%';
            projectile.style.boxShadow = `0 0 15px ${this.typeConfig.color}`;
            
            projectile.style.transform = `translate(${startPos.x}px, ${startPos.y}px) translate(-50%, -50%) scale(0.5)`;
            getBattleScreen().appendChild(projectile);

            await sleep(50);
            projectile.style.transition = `transform ${0.4 / _battleSpeed}s cubic-bezier(0.4, 0, 0.2, 1)`;
            projectile.style.transform = `translate(${endPos.x}px, ${endPos.y}px) translate(-50%, -50%) scale(${this.getPowerScale()})`;

            await sleep(400);
            projectile.remove();
            await this.applyHitEffects();
            
            if (attackerSprite) attackerSprite.classList.remove('is-recoiling');
            unitEl.classList.remove('is-attacking');
        }
    }

    class StatusAnimationStrategy extends BaseAnimationStrategy {
        async execute() {
            if (!this.attackerEl) return;
            const unitEl = this.attackerEl.querySelector('.unit');
            if (!unitEl) return;
            const attackerSprite = unitEl.querySelector('.sprite');

            unitEl.classList.add('is-attacking');

            playSpriteAnim(unitEl, SPRITE_ANIMS.status);
            if (attackerSprite) {
                attackerSprite.classList.add('status-glow');
                await sleep(600);
                attackerSprite.classList.remove('status-glow');
            }
            
            unitEl.classList.remove('is-attacking');
        }
    }

    // --- MOTEUR (Factory) ---

    function getAnimationStrategy(attacker, target, move, damage, typeMod) {
        if (move.damage_class === 'status' || !move.power || move.power === 0) {
            return new StatusAnimationStrategy(attacker, target, move, damage, typeMod);
        }
        return move.damage_class === 'physical' ? 
            new PhysicalAnimationStrategy(attacker, target, move, damage, typeMod) : 
            new SpecialAnimationStrategy(attacker, target, move, damage, typeMod);
    }

    // --- API PUBLIQUE ---
    return {
        init: (domRefs, getSlotElFn, spawnEffectTextFn) => {
            dom = domRefs;
            _getSlotEl = getSlotElFn;
            _spawnEffectText = spawnEffectTextFn;
        },

        say,

        setSpeed: (speed) => {
            _battleSpeed = speed;
            // L'accélération ne concerne les sprites que pendant le combat (préparation et victoire à vitesse normale)
            if (typeof PmdSprite !== 'undefined') PmdSprite.setSpeed(window.isRunning ? speed : 1);
        },

        // Utilisés par battle.js (nom de l'attaque, décalage vertical des textes flottants)
        spawnMoveNameText,
        BaseAnimationStrategy,

        // Les animations sont purement visuelles : une erreur ne doit jamais bloquer le combat
        playActionAnimation: async (attacker, target, move, damage, typeMod) => {
            try {
                await getAnimationStrategy(attacker, target, move, damage, typeMod).execute();
            } catch (e) {
                console.warn('[BattleAnimation] animation ignorée :', e);
            }
        },

        playAoeAnimation: async (attacker, damages, move) => {
            try {
                await new SimultaneousAOEAnimationStrategy(attacker, damages, move).execute();
            } catch (e) {
                console.warn('[BattleAnimation] animation de zone ignorée :', e);
            }
        },

        playPhysicalAOEAnimation: async (attacker, targets, move, damages) => {
            try {
                await new PhysicalAOEAnimationStrategy(attacker, targets, move, damages).execute();
            } catch (e) {
                console.warn('[BattleAnimation] animation de zone ignorée :', e);
            }
        },

        showDamageNumber: (targetEl, damage, offsetY = 0, extraClass = '') => {
            if (!targetEl || damage === 0) return;
            const center = getElementCenter(targetEl);
            const numberEl = document.createElement('div');
            numberEl.className = 'damage-float-number' + (damage < 0 ? ' heal' : '') + (extraClass ? ` ${extraClass}` : '');
            numberEl.textContent = damage < 0 ? `+${-damage}` : damage;
            numberEl.style.left = `${center.x}px`;
            numberEl.style.top = `${center.y + offsetY}px`;
            getBattleScreen().appendChild(numberEl);
            setTimeout(() => numberEl.remove(), 1200 / _battleSpeed);
        }
    };
})();
