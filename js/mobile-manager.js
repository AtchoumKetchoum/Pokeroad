/**
 * mobile-manager.js
 * Gère l'orientation, le mode plein écran et le remplissage total de l'écran.
 */

const MobileManager = (() => {
  let overlayCreated = false;
  let hasBeenShown =
    localStorage.getItem("pokerode_mobile_overlay_shown") === "true";
  let wantsFullscreen =
    localStorage.getItem("pokerode_wants_fullscreen") === "true";

  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;

  function init() {
    if (!document.getElementById("orientation-overlay")) {
      createOverlay();
    }
    if (!document.getElementById("fullscreen-mini-btn")) {
      createMiniBtn();
    }

    window.addEventListener("resize", () => {
      checkOrientation();
      updateScaling();
      updateMiniBtnVisibility();
    });
    window.addEventListener("orientationchange", () => {
      checkOrientation();
      updateScaling();
      updateMiniBtnVisibility();
    });

    // Détecter les changements de plein écran
    document.addEventListener("fullscreenchange", updateMiniBtnVisibility);
    document.addEventListener(
      "webkitfullscreenchange",
      updateMiniBtnVisibility,
    );

    checkOrientation();
    updateScaling();
    
    // Si l'utilisateur voulait le plein écran, on montre le bouton mini s'il ne l'est pas
    updateMiniBtnVisibility();
    
    // Marquer le body si on est sur mobile pour les styles CSS
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('is-mobile');
        
        // Force native fullscreen on first interaction and try to keep it locked
        const tryFullscreen = (e) => {
             // Let the click happen naturally but request fullscreen
             requestFullscreen();
             
             // If this is a link or a button that navigates via location.href, we can try to intercept
             let current = e.target;
             while (current && current !== document.body) {
                 if (current.tagName === 'A' && current.href) {
                     e.preventDefault();
                     const target = current.href;
                     // Give the browser 50ms to trigger the fullscreen before leaving
                     setTimeout(() => window.location.href = target, 50);
                     return;
                 }
                 if (current.onclick && current.onclick.toString().includes('location.href')) {
                     // Very hard to intercept inline onclick safely, but requestFullscreen will fire.
                 }
                 current = current.parentElement;
             }
        };
        
        document.addEventListener("touchstart", tryFullscreen, { capture: true, passive: false });
        document.addEventListener("click", tryFullscreen, { capture: true, passive: false });
        
        // Auto-attempt if we know user previously accepted fullscreen
        if (wantsFullscreen && document.visibilityState === 'visible') {
            // Note: browser might block this if no user gesture, but we try anyway
            setTimeout(requestFullscreen, 100);
        }
        
        // Also re-trigger if visibility changes (e.g., locking and unlocking phone)
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === 'visible' && !isFullscreenActive()) {
                // Cannot auto-trigger without interaction reliably, but we try mini-btn
                updateMiniBtnVisibility();
            }
        });
    }
    
    overlayCreated = true;
  }

  function updateScaling() {
    const scaler = document.getElementById("scaler-view");
    if (!scaler) return;

    scaler.style.width = DESIGN_WIDTH + "px";
    scaler.style.height = DESIGN_HEIGHT + "px";

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // Calculer l'échelle en maintenant le ratio
    const scaleX = winW / DESIGN_WIDTH;
    const scaleY = winH / DESIGN_HEIGHT;
    
    let finalScale = Math.min(scaleX, scaleY);
    
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Sur mobile très petit, on augmente un peu l'échelle quitte à déborder un tout petit peu sur les côtés
    // pour que les boutons soient plus cliquables (Maximum 15% de zoom bonus)
    if (isMobile && finalScale < 0.7) {
        // finalScale = Math.max(finalScale, Math.min(scaleX, scaleY * 1.15));
    }

    scaler.style.position = "absolute";
    scaler.style.left = "50%";
    scaler.style.top = "50%";
    scaler.style.transform = `translate(-50%, -50%) scale(${finalScale})`;
    scaler.style.transformOrigin = "center center";
    
    // Mettre à jour les classes d'orientation sur le body
    const isPortrait = winH > winW;
    document.body.classList.toggle('orientation-portrait', isPortrait);
    document.body.classList.toggle('orientation-landscape', !isPortrait);
  }

  function createOverlay() {
    // Overlay désactivé, passage en plein écran natif forcé
  }

  function createMiniBtn() {
    const btn = document.createElement("button");
    btn.id = "fullscreen-mini-btn";
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
        <span style="font-size: 10px; font-weight: bold; margin-top: 2px;">FULL</span>
    `;
    btn.style.cssText =
      "position:fixed;top:15px;left:15px;z-index:9999;background:rgba(52, 152, 219, 0.9);color:white;border:none;width:54px;height:54px;border-radius:15px;display:none;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;box-shadow: 0 4px 10px rgba(0,0,0,0.3);";
    btn.onclick = () => requestFullscreen();
    document.body.appendChild(btn);
  }

  function isFullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }

  function updateMiniBtnVisibility() {
    const btn = document.getElementById("fullscreen-mini-btn");
    if (!btn) return;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile && !isFullscreenActive()) {
      btn.style.display = "flex";
      // Pulse animation to draw attention
      btn.style.animation = "pulse-fs 2s infinite";
      if (!document.getElementById("fs-style")) {
        const style = document.createElement("style");
        style.id = "fs-style";
        style.innerHTML = `@keyframes pulse-fs { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 152, 219, 0.7); } 70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(52, 152, 219, 0); } 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 152, 219, 0); } }`;
        document.head.appendChild(style);
      }
    } else {
      btn.style.display = "none";
    }
  }

  function checkOrientation() {
    // Plus d'overlay à afficher
  }

  function requestFullscreen() {
    const docEl = document.documentElement;
    const fn =
      docEl.requestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.webkitRequestFullScreen ||
      docEl.msRequestFullscreen;

    if (fn) {
      fn.call(docEl)
        .then(() => {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock("landscape").catch(() => {});
          }
          wantsFullscreen = true;
          localStorage.setItem("pokerode_wants_fullscreen", "true");
          hideOverlay();
          updateMiniBtnVisibility();
        })
        .catch(err => {
            console.error("Fullscreen error", err);
            hideOverlay();
        });
    } else {
      hideOverlay();
    }
  }

  function hideOverlay() {
    const overlay = document.getElementById("orientation-overlay");
    if (overlay) overlay.style.display = "none";
    hasBeenShown = true;
    localStorage.setItem("pokerode_mobile_overlay_shown", "true");
  }

  return { init, requestFullscreen, hideOverlay };
})();

document.addEventListener("DOMContentLoaded", MobileManager.init);
