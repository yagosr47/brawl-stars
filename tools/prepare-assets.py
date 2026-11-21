"""Normalize the upstream mask atlases. Requires Pillow (build-time only).
Run: python tools/prepare-assets.py
Original assets and attribution: see NOTICE.md. No network requests are made.
"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'frontend/public/assets'
SOURCE = ROOT / 'source'
WIDTH, HEIGHT, COLUMNS = 192, 240, 8
frames = [Image.open(SOURCE / 'idle.png').convert('RGBA')]

def atlas_frames(png, meta, prefix, suffix=''):
    atlas = Image.open(SOURCE / png).convert('RGBA')
    data = json.loads((SOURCE / meta).read_text())['textures'][0]['frames']
    result = []
    for frame in sorted(data, key=lambda frame: frame['filename']):
        if not frame['filename'].startswith(prefix):
            continue
        box = frame['frame']
        sprite = atlas.crop((box['x'], box['y'], box['x'] + box['w'], box['y'] + box['h']))
        size = frame['sourceSize']
        normalized = Image.new('RGBA', (size['w'], size['h']))
        trim = frame.get('spriteSourceSize', {'x': 0, 'y': 0})
        normalized.alpha_composite(sprite, (trim['x'], trim['y']))
        result.append(normalized)
    return result

frames += atlas_frames('texture.png', 'texture.json', 'Walk')
walk_count = len(frames) - 1
frames += atlas_frames('death.png', 'death.json', 'Dead')
sheet = Image.new('RGBA', (WIDTH * COLUMNS, HEIGHT * ((len(frames) + COLUMNS - 1) // COLUMNS)))
for index, frame in enumerate(frames):
    ratio = min(180 / frame.width, 225 / frame.height, 1)
    frame = frame.resize((round(frame.width * ratio), round(frame.height * ratio)), Image.Resampling.LANCZOS)
    x = (index % COLUMNS) * WIDTH + (WIDTH - frame.width) // 2
    y = (index // COLUMNS) * HEIGHT + HEIGHT - frame.height - 6
    sheet.alpha_composite(frame, (x, y))
sheet.save(ROOT / 'crew-sheet.png', optimize=True)
(ROOT / 'crew-sheet.json').write_text(json.dumps({'frameWidth': WIDTH, 'frameHeight': HEIGHT, 'count': len(frames), 'walkStart': 1, 'walkEnd': walk_count, 'deathStart': walk_count + 1, 'deathEnd': len(frames) - 1}, indent=2) + '\n')
print(f'Packed {len(frames)} original frames into crew-sheet.png')
