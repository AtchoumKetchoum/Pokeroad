/**
 * scaler.js - Moteur de mise à l'échelle dynamique
 * Permet de maintenir un ratio et une résolution interne fixe (1280x720)
 * quelle que soit la résolution de l'écran ou le niveau de zoom du navigateur.
 */

function initViewportScaler(id = 'scaler-view') {
    const scalerView = document.getElementById(id);
    if (!scalerView) return;

    const updateScale = () => {
        // Dimensions de la fenêtre (viewport visible)
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        
        // Résolution cible interne
        const targetW = 1280;
        const targetH = 720;

        // Calcul du ratio de mise à l'échelle pour remplir l'écran (math.min pour 'contain')
        const scale = Math.min(screenW / targetW, screenH / targetH);
        
        // Application de la transformation
        scalerView.style.transform = `scale(${scale})`;
    };

    // Écoute des redimensionnements et changements de zoom
    window.addEventListener('resize', updateScale);
    
    // Appel initial
    updateScale();
    
    // Force un recalcul après un court délai pour s'assurer que le layout est stable
    setTimeout(updateScale, 100);
}

// Initialisation automatique au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
    initViewportScaler();
});
