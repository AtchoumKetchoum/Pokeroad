const MobileManager = (() => {
    // Scène portrait (téléphone tenu à la verticale), centrée et mise à l'échelle sur PC
    const DESIGN_WIDTH = 720;
    const DESIGN_HEIGHT = 1280;
    const MAX_FLUID_HEIGHT = 1640; // au-delà (écran très étroit), bandes en haut et en bas

    function detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               (window.innerWidth <= 900);
    }

    // L'écran titre disparaît au premier toucher, que le plein écran soit disponible ou non
    // (Safari sur iPhone ne permet pas le plein écran d'une page web).
    let started = false;
    let isMobile = false;

    function init() {
        isMobile = detectMobile();
        
        if (isMobile) {
            document.body.classList.add('is-mobile');
            document.documentElement.classList.add('is-mobile');
        }
        createMandatoryOverlay();
        updateOverlayVisibility();

        window.addEventListener("resize", () => {
            updateScaling();
            if (isMobile) updateOverlayVisibility();
        });
        
        window.addEventListener("orientationchange", () => {
            updateScaling();
            if (isMobile) updateOverlayVisibility();
        });

        document.addEventListener("fullscreenchange", () => {
            if (isMobile) updateOverlayVisibility();
            updateScaling();
        });
        document.addEventListener("webkitfullscreenchange", () => {
            if (isMobile) updateOverlayVisibility();
            updateScaling();
        });

        updateScaling();
        if (isMobile) updateOverlayVisibility();

        document.addEventListener("touchstart", (e) => {
            if (isMobile && !isFullscreenActive()) {
                requestFullscreen();
            }
        }, { capture: true, passive: false });
        
        document.addEventListener("click", (e) => {
            if (isMobile && !isFullscreenActive()) {
                requestFullscreen();
            }
        }, { capture: true, passive: false });
    }

    function updateScaling() {
        // Target all scalers (multi-view support)
        const scalers = document.querySelectorAll(".scaler-view, #scaler-view");
        if (scalers.length === 0) return;

        const winW = window.innerWidth;
        const winH = window.innerHeight;

        // Scène fixe 720x1280 (combat) : contenue dans la fenêtre, bandes sur les côtés
        const fixedScale = Math.min(winW / DESIGN_WIDTH, winH / DESIGN_HEIGHT);

        // Scène souple (bourg, cartes, intérieurs) : largeur 720, hauteur qui suit l'écran
        // (téléphones allongés sans bandes), mises en page en flexbox
        let fluidScale = winW / DESIGN_WIDTH;
        let fluidHeight = winH / fluidScale;
        if (fluidHeight < DESIGN_HEIGHT) { fluidScale = fixedScale; fluidHeight = DESIGN_HEIGHT; }
        fluidHeight = Math.round(Math.min(fluidHeight, MAX_FLUID_HEIGHT));

        // Les fenêtres (.modal) sont hors de la scène : elles lisent la même échelle
        const root = document.documentElement.style;
        root.setProperty('--stage-scale', fluidScale.toFixed(4));
        root.setProperty('--stage-h', `${fluidHeight}px`);

        scalers.forEach(scaler => {
            const fixed = scaler.classList.contains('stage-fixed');
            const scale = fixed ? fixedScale : fluidScale;
            scaler.style.position = "absolute";
            scaler.style.setProperty('width', `${DESIGN_WIDTH}px`, 'important');
            scaler.style.setProperty('height', `${fixed ? DESIGN_HEIGHT : fluidHeight}px`, 'important');
            scaler.style.left = "50%";
            scaler.style.top = "50%";
            scaler.style.transform = `translate(-50%, -50%) scale(${scale})`;
            scaler.style.transformOrigin = "center center";
        });
    }

    function createMandatoryOverlay() {
        if (document.getElementById("mandatory-fs-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "mandatory-fs-overlay";
        overlay.className = "title-screen";
        overlay.style.display = "none";
        overlay.innerHTML = `
            <div class="title-scene" data-scene="plains" data-path="1"></div>
            <div class="title-content">
                <div class="title-ball">${Art.pokeball(120)}</div>
                <h1 class="title-logo">Poké<span>Road</span></h1>
                <div class="title-tap">Touche l'écran pour jouer</div>
                <small class="title-hint">Le jeu passe en plein écran</small>
            </div>
        `;
        Art.hydrate(overlay);

        overlay.onclick = (e) => {
            e.stopPropagation();
            started = true;
            updateOverlayVisibility();
            if (isMobile) requestFullscreen();
        };

        document.body.appendChild(overlay);
    }

    function updateOverlayVisibility() {
        const overlay = document.getElementById("mandatory-fs-overlay");
        if (!overlay) return;

        overlay.style.display = started ? "none" : "flex";
    }

    function isFullscreenActive() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }

    function requestFullscreen() {
        const docEl = document.documentElement;
        const fn = docEl.requestFullscreen || docEl.webkitRequestFullScreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;

        if (fn) {
            Promise.resolve(fn.call(docEl)).then(() => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock("portrait").catch(() => {});
                }
                updateOverlayVisibility();
                setTimeout(updateScaling, 100);
            }).catch(err => {
                console.warn("Fullscreen error", err);
            });
        }
    }

    return { init, requestFullscreen, updateScaling };
})();

document.addEventListener("DOMContentLoaded", MobileManager.init);
window.MobileManager = MobileManager;
