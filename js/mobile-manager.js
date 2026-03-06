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
    const overlay = document.createElement("div");
    overlay.id = "orientation-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;background:#1a1a1a;z-index:99999;display:none;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:white;font-family:sans-serif;padding:20px;box-sizing:border-box;";

    overlay.innerHTML = `
            <div style="font-size: 60px; margin-bottom: 20px; animation: bounce 2s infinite;">🎮</div>
            <h2 style="color: #ffc107; text-transform: uppercase; margin-bottom: 10px; font-size: 24px; letter-spacing: 2px;">PokeRoad Mobile</h2>
            <p style="margin-bottom: 30px; line-height: 1.5; font-size: 16px; max-width: 400px; color: #ddd;">Pour une meilleure expérience, utilisez le mode plein écran et le mode paysage.</p>
            <div style="display: flex; flex-direction: column; gap: 15px; width: 100%; max-width: 320px;">
                <button onclick="MobileManager.requestFullscreen()" style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; border: none; padding: 18px; border-radius: 15px; cursor: pointer; font-weight: bold; font-size: 18px; box-shadow: 0 6px 0 #1c5980; transition: transform 0.1s;">ACTIVER LE PLEIN ÉCRAN</button>
                <button onclick="MobileManager.hideOverlay()" style="background: #444; color: white; border: none; padding: 14px; border-radius: 12px; cursor: pointer; font-size: 14px; opacity: 0.8;">JOUER AINSI</button>
            </div>
            <p id="orientation-warning" style="margin-top: 30px; color: #ff5252; font-weight: bold; font-size: 18px; animation: pulse 1s infinite;">
                🔄 PIVOTEZ VOTRE APPAREIL
            </p>
            <style>
                @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
            </style>
        `;
    document.body.appendChild(overlay);
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

  function updateMiniBtnVisibility() {
    const btn = document.getElementById("fullscreen-mini-btn");
    if (!btn) return;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

    // Si on est sur mobile et qu'on n'est pas en plein écran, on montre le bouton
    // On le montre toujours si wantsFullscreen était vrai, comme rappel
    if (isMobile && !isFullscreen) {
      btn.style.display = "flex";
    } else {
      btn.style.display = "none";
    }
  }

  function checkOrientation() {
    const overlay = document.getElementById("orientation-overlay");
    const warning = document.getElementById("orientation-warning");
    if (!overlay) return;

    const isPortrait = window.innerHeight > window.innerWidth;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
        if (isPortrait) {
            overlay.style.display = "flex";
            warning.style.display = "block";
        } else if (!hasBeenShown) {
            overlay.style.display = "flex";
            warning.style.display = "none";
        } else {
            overlay.style.display = "none";
        }
    } else {
        overlay.style.display = "none";
    }
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
