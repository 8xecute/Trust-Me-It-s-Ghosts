from pathlib import Path
import base64
import zipfile

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
html = (OUT / 'player.template.html').read_text(encoding='utf-8')
for marker, name in [('__SCENE_IMAGE__', 'scenes/roadside-sala.jpg'), ('__NPC_IMAGE__', 'portraits/prasert.jpg')]:
    data = (ROOT / 'packages/client/src/assets/case-001' / name).read_bytes()
    html = html.replace(marker, 'data:image/jpeg;base64,' + base64.b64encode(data).decode())
for marker, name in [('__CLARITY_SCALE__', 'clarity'), ('__FREEDOM_SCALE__', 'freedom'), ('__CURIOSITY_SCALE__', 'curiosity')]:
    html = html.replace(marker, ''.join(f'<label><input type="radio" name="{name}" value="{i}" required>{i}</label>' for i in range(1, 6)))
(OUT / 'player.html').write_text(html, encoding='utf-8')
(OUT / 'public').mkdir(exist_ok=True)
(OUT / 'public/index.html').write_text(html, encoding='utf-8')
with zipfile.ZipFile(OUT / 'PLAYER-PACK.zip', 'w', zipfile.ZIP_DEFLATED) as pack:
    pack.write(OUT / 'player.html', 'player.html')
print('Built player page and player-only ZIP')
