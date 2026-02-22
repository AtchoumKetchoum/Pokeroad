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

    function playScreenFlash(color = 'white') {
        const screen = document.getElementById('scaler-view');
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
            document.getElementById('scaler-view')?.appendChild(tint);
        }
        tint.style.backgroundColor = color;
        tint.classList.add('active');
    }

    function removeScreenTint() {
        const tint = document.getElementById('screen-tint-overlay');
        if (tint) tint.classList.remove('active');
    }

    function getElementCenter(el) {
        const screen = document.getElementById('scaler-view');
        if (!screen || !el) return { x: 0, y: 0 }; // Sécurité
        const screenRect = screen.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        
        return {
            x: elRect.left + elRect.width / 2 - screenRect.left,
            y: elRect.top + elRect.height / 2 - screenRect.top
        };
    }

    function playUnitShake(unitSlotEl, power) {
        if (!unitSlotEl) return;
        const unitEl = unitSlotEl.querySelector('.unit');
        if (!unitEl) return;

        const intensity = Math.min(8, Math.max(2, (power || 40) / 15));
        
        unitEl.style.animation = 'none';
        void unitEl.offsetWidth; // Force reflow
        
        unitEl.style.setProperty('--shake-intensity', `${intensity}px`);
        unitEl.style.animation = 'unit-shake-dynamic 0.4s cubic-bezier(.36,.07,.19,.97) both';
        
        setTimeout(() => {
            unitEl.style.animation = '';
            unitEl.style.removeProperty('--shake-intensity');
        }, 400);
    }

    function playScreenShake(power) {
        const intensity = Math.min(3, Math.max(1, (power || 40) / 40));
        const screen = document.getElementById('scaler-view');
        if (screen) {
            screen.style.transformOrigin = 'center center';
            screen.style.transition = 'transform 0.05s ease-out';

            const shake = () => {
                const rx = (Math.random() - 0.5) * intensity * 2;
                const ry = (Math.random() - 0.5) * intensity * 2;
                screen.style.transform = `translate(${rx}px, ${ry}px)`;
            };

            const interval = setInterval(shake, 50);
            setTimeout(() => {
                clearInterval(interval);
                screen.style.transform = 'none';
            }, 300);
        }
    }
    
    // --- STRATÉGIES D'ANIMATION (Design Pattern: Strategy) ---

    function spawnMoveNameText(attacker, name, offsetY = 0) {
        if (!attacker) return;
        const targetEl = _getSlotEl(attacker._side, attacker._index);
        if (!targetEl) return;

        const screen = document.getElementById('scaler-view');
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

        /** Crée une explosion de "confettis" à l'impact. */
        createImpactExplosion() {
            if (!this.targetEl) return;
            const center = getElementCenter(this.targetEl);
            const particleCount = 50 + Math.floor((this.move.power || 40) / 2);
            const shapes = ['circle', 'square', 'rect'];

            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                const shape = shapes[Math.floor(Math.random() * shapes.length)];
                particle.className = `impact-particle shape-${shape}`;
                
                // Varier légèrement la couleur
                const baseColor = this.typeConfig.color;
                particle.style.backgroundColor = baseColor;
                particle.style.filter = `brightness(${0.7 + Math.random() * 0.6}) saturate(${0.8 + Math.random() * 0.4})`;
                
                const size = Math.random() * 10 + 5;
                particle.style.width = `${size}px`;
                particle.style.height = `${size}px`;

                particle.style.left = `${center.x}px`;
                particle.style.top = `${center.y}px`;

                const angle = Math.random() * 360;
                const distance = Math.random() * 200 + 80;
                const xEnd = Math.cos(angle * Math.PI / 180) * distance;
                const yEnd = Math.sin(angle * Math.PI / 180) * distance + (Math.random() * 100 + 50); // Plus de dispersion vers le bas

                particle.style.setProperty('--x-end', `${xEnd}px`);
                particle.style.setProperty('--y-end', `${yEnd}px`);
                particle.style.setProperty('--rot-end', `${Math.random() * 1440 - 720}deg`);

                document.getElementById('scaler-view').appendChild(particle);
                setTimeout(() => particle.remove(), 1500 / _battleSpeed);
            }
        }

        async playHitFreeze(duration = 70) {
            const screen = document.getElementById('scaler-view');
            if (screen) screen.classList.add('hit-stop-global');
            await sleep(duration);
            if (screen) screen.classList.remove('hit-stop-global');
        }

        createImpactRipple() {
            if (!this.targetEl) return;
            const center = getElementCenter(this.targetEl);
            const ripple = document.createElement('div');
            ripple.className = 'impact-ripple';
            ripple.style.left = `${center.x}px`;
            ripple.style.top = `${center.y}px`;
            ripple.style.borderColor = this.typeConfig.color;
            
            const scale = this.getPowerScale() * 2.5;
            ripple.style.setProperty('--ripple-scale', scale);
            
            document.getElementById('scaler-view').appendChild(ripple);
            setTimeout(() => ripple.remove(), 600 / _battleSpeed);
        }

        async applyHitEffects() {
            // Hit Stop / Freeze
            const targetSprite = this.targetEl?.querySelector('.sprite');
            if (targetSprite) targetSprite.classList.add('hit-stop');
            
            await this.playHitFreeze(80); 
            
            if (targetSprite) targetSprite.classList.remove('hit-stop');

            this.createImpactExplosion();
            this.createImpactRipple();
            
            if (targetSprite) {
                targetSprite.classList.add('hitFlash');
                setTimeout(() => targetSprite.classList.remove('hitFlash'), 200 / _battleSpeed);
            }

            playUnitShake(this.targetEl, this.move.power);
            playScreenShake(this.move.power);
            
            BattleAnimation.showDamageNumber(_getSlotEl(this.target._side, this.target._index), this.damage, BaseAnimationStrategy.TEXT_OFFSET_Y);

            // Efficacité
            let effectivenessMessage = '';
            if (this.typeMod >= 2) effectivenessMessage = "C'est super efficace !";
            else if (this.typeMod === 0.5) effectivenessMessage = "Ce n'est pas très efficace...";
            else if (this.typeMod === 0) effectivenessMessage = "Ça n'affecte pas l'ennemi...";

            if (effectivenessMessage && _spawnEffectText) {
                await sleep(100);
                _spawnEffectText(this.target, effectivenessMessage, 'info', BaseAnimationStrategy.TEXT_OFFSET_Y - 35);
            }
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
            const attackerSprite = unitEl.querySelector('.sprite');

            unitEl.classList.add('is-attacking');

            const startPos = getElementCenter(unitEl);
            const endPos = getElementCenter(this.targetEl.querySelector('.unit'));

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
            document.getElementById('scaler-view').appendChild(projectile);

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
            const attackerSprite = unitEl.querySelector('.sprite');

            unitEl.classList.add('is-attacking');

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

        setSpeed: (speed) => { _battleSpeed = speed; },

        playActionAnimation: async (attacker, target, move, damage, typeMod) => {
            const strategy = getAnimationStrategy(attacker, target, move, damage, typeMod);
            await strategy.execute();
        },

        playPhysicalAOEAnimation: async (attacker, targets, move, damages) => {
            const strategy = new PhysicalAOEAnimationStrategy(attacker, targets, move, damages);
            await strategy.execute();
        },

        showDamageNumber: (targetEl, damage, offsetY = 0) => {
            if (!targetEl || damage === 0) return;
            const center = getElementCenter(targetEl);
            const numberEl = document.createElement('div');
            numberEl.className = 'damage-float-number' + (damage < 0 ? ' heal' : '');
            numberEl.textContent = damage < 0 ? `+${-damage}` : damage;
            numberEl.style.left = `${center.x}px`;
            numberEl.style.top = `${center.y + offsetY}px`;
            document.getElementById('scaler-view').appendChild(numberEl);
            setTimeout(() => numberEl.remove(), 1200);
        }
    };
})();
