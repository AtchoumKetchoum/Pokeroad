/**
 * mobile-manager.js
 * Gère l'orientation, le mode plein écran et le remplissage total de l'écran.
 */

const MobileManager = (() => {
  let overlayCreated = false;
  let hasBeenShown = localStorage.getItem('pokerode_mobile_overlay_shown') === 'true';
  
  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;

  function init() {
    if (!document.getElementById("orientation-overlay")) {
      createOverlay();
    }

    window.addEventListener("resize", () => {
        checkOrientation();
        updateScaling();
    });
    window.addEventListener("orientationchange", () => {
        checkOrientation();
        updateScaling();
    });

    checkOrientation();
    updateScaling();
    overlayCreated = true;
  }

  function updateScaling() {
      const scaler = document.getElementById("scaler-view");
      if (!scaler) return;

      // On définit la taille interne fixe
      scaler.style.width = DESIGN_WIDTH + "px";
      scaler.style.height = DESIGN_HEIGHT + "px";

      const winW = window.innerWidth;
      const winH = window.innerHeight;
      
      // Calcul du scale pour REMPLIR 100% (étirement si nécessaire pour supprimer les bordures)
      const scaleX = winW / DESIGN_WIDTH;
      const scaleY = winH / DESIGN_HEIGHT;
      
      // On applique un scale indépendant sur X et Y pour ne laisser AUCUNE bordure noire
      scaler.style.position = "absolute";
      scaler.style.left = "50%";
      scaler.style.top = "50%";
      scaler.style.transform = `translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
      scaler.style.transformOrigin = "center center";
  }

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "orientation-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:#000;z-index:99999;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:white;font-family:sans-serif;padding:20px;box-sizing:border-box;";
    
    overlay.innerHTML = `
            <div style="font-size: 50px; margin-bottom: 20px;">🎮</div>
            <h2 style="color: #ffc107; text-transform: uppercase; margin-bottom: 10px;">PokeRoad Fullscreen</h2>
            <p style="margin-bottom: 30px; line-height: 1.5;">Pour une immersion totale et supprimer les barres de navigation, passez en plein écran.</p>
            <div style="display: flex; flex-direction: column; gap: 15px; width: 100%; max-width: 300px;">
                <button onclick="MobileManager.requestFullscreen()" style="background: #3498db; color: white; border: none; padding: 15px; border-radius: 10px; cursor: pointer; font-weight: bold; font-size: 16px; box-shadow: 0 4px 0 #2980b9;">ACTIVER LE PLEIN ÉCRAN</button>
                <button onclick="MobileManager.hideOverlay()" style="background: #444; color: white; border: none; padding: 12px; border-radius: 10px; cursor: pointer; font-size: 14px;">JOUER DANS LE NAVIGATEUR</button>
            </div>
            <p id="orientation-warning" style="margin-top: 30px; color: #ff5252; font-weight: bold; display: none;">
                🔄 VEUILLEZ PIVOTER EN MODE PAYSAGE
            </p>
        `;
    document.body.appendChild(overlay);
  }

  function checkOrientation() {
    const overlay = document.getElementById("orientation-overlay");
    const warning = document.getElementById("orientation-warning");
    if (!overlay) return;

    const isPortrait = window.innerHeight > window.innerWidth;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isPortrait && isMobile) {
        overlay.style.display = "flex";
        warning.style.display = "block";
    } else if (!hasBeenShown) {
        overlay.style.display = "flex";
        warning.style.display = "none";
    } else {
        overlay.style.display = "none";
    }
  }

  function requestFullscreen() {
    const docEl = document.documentElement;
    const fn = docEl.requestFullscreen || docEl.mozRequestFullScreen || docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;
    
    if (fn) {
      fn.call(docEl).then(() => {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock("landscape").catch(() => {});
        }
        hideOverlay();
      }).catch(hideOverlay);
    } else {
      hideOverlay();
    }
  }

  function hideOverlay() {
    const overlay = document.getElementById("orientation-overlay");
    if (overlay) overlay.style.display = "none";
    hasBeenShown = true;
    localStorage.setItem('pokerode_mobile_overlay_shown', 'true');
  }

  return { init, requestFullscreen, hideOverlay };
})();

document.addEventListener("DOMContentLoaded", MobileManager.init);
