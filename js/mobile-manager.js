/**
 * mobile-manager.js
 * Gère l'orientation, le mode plein écran et la mise à l'échelle automatique.
 */

const MobileManager = (() => {
  let overlayCreated = false;
  let hasBeenShown = false;
  // Résolution de référence (format 16:9 standard)
  const DESIGN_WIDTH = 1280;
  const DESIGN_HEIGHT = 720;

  function init() {
    if (overlayCreated) {
        updateScaling();
        return;
    }

    // Créer l'overlay s'il n'existe pas
    if (!document.getElementById("orientation-overlay")) {
      createOverlay();
    }

    // Écouter les changements d'orientation et de taille
    window.addEventListener("resize", () => {
        checkOrientation();
        updateScaling();
    });
    window.addEventListener("orientationchange", () => {
        checkOrientation();
        updateScaling();
    });

    // Vérification initiale
    checkOrientation();
    updateScaling();
    overlayCreated = true;
  }

  function updateScaling() {
      const scaler = document.getElementById("scaler-view");
      if (!scaler) return;

      // On définit une taille fixe pour l'espace de travail interne
      scaler.style.width = DESIGN_WIDTH + "px";
      scaler.style.height = DESIGN_HEIGHT + "px";

      const winW = window.innerWidth;
      const winH = window.innerHeight;
      
      // Calcul du scale pour faire tenir le 1280x720 dans l'écran actuel
      const scaleX = winW / DESIGN_WIDTH;
      const scaleY = winH / DESIGN_HEIGHT;
      const scale = Math.min(scaleX, scaleY);
      
      // Centrage et scaling
      scaler.style.position = "absolute";
      scaler.style.left = "50%";
      scaler.style.top = "50%";
      scaler.style.transform = `translate(-50%, -50%) scale(${scale})`;
      scaler.style.transformOrigin = "center center";
  }

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "orientation-overlay";
    overlay.innerHTML = `
            <div class="icon">📱</div>
            <h2>Expérience Mobile</h2>
            <p>Ce jeu est conçu pour être joué en <b>mode paysage</b> pour une meilleure expérience.</p>
            <div style="display: flex; flex-direction: column; gap: 10px; width: 100%; max-width: 300px;">
                <button class="fullscreen-btn" onclick="MobileManager.requestFullscreen()">Passer en Plein Écran</button>
                <button class="fullscreen-btn" style="background: #666; box-shadow: 0 4px 0 #444;" onclick="MobileManager.hideOverlay()">Jouer</button>
            </div>
            <p style="margin-top: 20px; font-size: 10px; color: #ffc107;" id="orientation-warning">
                ⚠️ Veuillez faire pivoter votre appareil
            </p>
        `;
    document.body.appendChild(overlay);
  }

  function checkOrientation() {
    const overlay = document.getElementById("orientation-overlay");
    const warning = document.getElementById("orientation-warning");
    if (!overlay) return;

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );

    if (!isMobile) {
        overlay.style.display = "none";
        return;
    }

    const isPortrait = window.innerHeight > window.innerWidth;

    // Si on est en portrait, on force l'overlay
    if (isPortrait) {
      overlay.style.display = "flex";
      if (warning) warning.style.display = "block";
    } else {
      // Si on est en paysage
      if (!hasBeenShown) {
          // Si c'est la première fois, on montre quand même pour le plein écran
          overlay.style.display = "flex";
          if (warning) warning.style.display = "none";
      } else {
          overlay.style.display = "none";
      }
    }
  }

  function requestFullscreen() {
    const doc = window.document;
    const docEl = doc.documentElement;

    const requestFullScreen =
      docEl.requestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.webkitRequestFullScreen ||
      docEl.msRequestFullscreen;

    if (requestFullScreen) {
      requestFullScreen
        .call(docEl)
        .then(() => {
          hasBeenShown = true;
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation
              .lock("landscape")
              .catch((e) => console.log("Lock orientation failed:", e));
          }
          hideOverlay();
        })
        .catch((err) => {
          console.error(`Error attempting to enable full-screen mode: ${err.message}`);
          hasBeenShown = true;
          hideOverlay();
        });
    } else {
        hasBeenShown = true;
        hideOverlay();
    }
  }

  function hideOverlay() {
    const overlay = document.getElementById("orientation-overlay");
    if (overlay) overlay.style.display = "none";
    hasBeenShown = true;
  }

  return {
    init,
    requestFullscreen,
    hideOverlay,
  };
})();

// Auto-initialisation au chargement
document.addEventListener("DOMContentLoaded", MobileManager.init);
