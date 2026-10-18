"""Génère les icônes de l'appli PokéRoad (Poké Ball, palette douce du jeu).
Usage : python tools/make-app-icons.py  ->  assets/icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
"""
import os
from PIL import Image, ImageDraw

INK = (43, 36, 51)
RED = (201, 72, 62)
RED_DARK = (150, 52, 46)
CREAM = (247, 236, 220)
BG = (143, 192, 160)  # vert doux du bourg

def ball(size, scale=0.78, background=BG, rounded=True):
    k = 4  # dessin en grand puis réduction lissée
    S = size * k
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        if rounded:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=background)
        else:
            d.rectangle([0, 0, S, S], fill=background)
    r = S * scale / 2
    cx = cy = S / 2
    w = max(2, int(S * 0.045))
    box = [cx - r, cy - r, cx + r, cy + r]
    d.ellipse(box, fill=CREAM, outline=INK, width=w)
    d.pieslice(box, 180, 360, fill=RED, outline=INK, width=w)
    d.arc([cx - r * .72, cy - r * .72, cx + r * .72, cy + r * .72], 205, 245, fill=(236, 150, 140), width=int(w * 1.1))  # reflet
    d.rectangle([cx - r, cy - w * .9, cx + r, cy + w * .9], fill=INK)
    d.ellipse([cx - r * .34, cy - r * .34, cx + r * .34, cy + r * .34], fill=CREAM, outline=INK, width=w)
    d.ellipse([cx - r * .16, cy - r * .16, cx + r * .16, cy + r * .16], fill=(230, 214, 194), outline=INK, width=max(2, w // 2))
    return img.resize((size, size), Image.LANCZOS)

out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
os.makedirs(out, exist_ok=True)
ball(192).save(os.path.join(out, 'icon-192.png'), optimize=True)
ball(512).save(os.path.join(out, 'icon-512.png'), optimize=True)
# Masquable (Android découpe un cercle ou une goutte) : fond plein, balle dans la zone sûre de 80 %
ball(512, scale=0.6, rounded=False).save(os.path.join(out, 'icon-maskable-512.png'), optimize=True)
# iPhone : fond plein, coins arrondis par iOS
ball(180, scale=0.74, rounded=False).save(os.path.join(out, 'apple-touch-icon.png'), optimize=True)
print('icônes générées dans', os.path.abspath(out))
