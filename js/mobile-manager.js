const MobileManager = (() => {
    const DESIGN_WIDTH = 1280;
    const DESIGN_HEIGHT = 720;

    function detectMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
               (window.innerWidth <= 900);
    }

    function init() {
        const isMobile = detectMobile();
        
        if (isMobile) {
            document.body.classList.add('is-mobile');
            document.documentElement.classList.add('is-mobile');
            createMandatoryOverlay();
        }

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
        });
        document.addEventListener("webkitfullscreenchange", () => {
            if (isMobile) updateOverlayVisibility();
        });

        updateScaling();
        if (isMobile) updateOverlayVisibility();

        // Persistent interaction listener to re-catch fullscreen if lost
        // This is the "no concession" part
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
        const scaler = document.getElementById("scaler-view");
        if (!scaler) return;

        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const scaleX = winW / DESIGN_WIDTH;
        const scaleY = winH / DESIGN_HEIGHT;
        const finalScale = Math.min(scaleX, scaleY);

        scaler.style.position = "absolute";
        scaler.style.left = "50%";
        scaler.style.top = "50%";
        scaler.style.transform = `translate(-50%, -50%) scale(${finalScale})`;
        scaler.style.transformOrigin = "center center";
    }

    function createMandatoryOverlay() {
        if (document.getElementById("mandatory-fs-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "mandatory-fs-overlay";
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100dvh;
            background: #000;
            color: #fff;
            z-index: 10000;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            font-family: sans-serif;
            cursor: pointer;
        `;

        overlay.innerHTML = `
            <div style="padding: 20px;">
                <h1 style="margin-bottom: 20px; color: #f39c12; font-family: 'Verdana', sans-serif;">POKEROAD</h1>
                <div style="font-size: 20px; margin-bottom: 30px;">Cliquez pour démarrer<br><small style="font-size: 14px; opacity: 0.8;">(Mode plein écran obligatoire)</small></div>
                <div style="font-size: 60px; animation: bounce 1.5s infinite;">👆</div>
            </div>
            <style>
                @keyframes bounce { 0%, 20%, 50%, 80%, 100% {transform: translateY(0);} 40% {transform: translateY(-20px);} 60% {transform: translateY(-10px);} }
            </style>
        `;

        overlay.onclick = (e) => {
            e.stopPropagation();
            requestFullscreen();
        };

        document.body.appendChild(overlay);
    }

    function updateOverlayVisibility() {
        const overlay = document.getElementById("mandatory-fs-overlay");
        if (!overlay) return;

        if (!isFullscreenActive()) {
            overlay.style.display = "flex";
        } else {
            overlay.style.display = "none";
        }
    }

    function isFullscreenActive() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    }

    function requestFullscreen() {
        const docEl = document.documentElement;
        const fn = docEl.requestFullscreen || docEl.webkitRequestFullScreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;

        if (fn) {
            fn.call(docEl).then(() => {
                if (screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock("landscape").catch(() => {});
                }
                updateOverlayVisibility();
            }).catch(err => {
                console.warn("Fullscreen error", err);
            });
        }
    }

    return { init, requestFullscreen };
})();

document.addEventListener("DOMContentLoaded", MobileManager.init);
