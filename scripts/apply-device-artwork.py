"""Repair local artwork from literal references in the extracted app; no runtime network."""
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
records = json.loads((ROOT / 'src/devices/sourceArtwork.json').read_text())
normalize = lambda text: re.sub(r'[^a-z0-9]', '', text.lower())

def source_for(device):
    exact = [r for r in records if r['vendorId'] == int(device['VID'], 16) and r['productId'] == int(device['PID'], 16)]
    named = [r for r in exact if normalize(r['name']) == normalize(device['name'])]
    if exact:
        return (named or exact)[0]
    named = [r for r in records if normalize(r['name']) == normalize(device['name'])]
    signatures = {json.dumps(r['skins'], sort_keys=True) for r in named}
    if len(signatures) == 1:
        return named[0]
    if named:
        skins = {}
        for record in named:
            for skin in record['skins']:
                skins.setdefault(skin['value'], []).append(skin)
        unique = [group[0] for group in skins.values() if len({s.get('image') for s in group}) == 1]
        if unique:
            return {**named[0], 'skins': unique}
    return None

files = {name: json.loads((ROOT / 'src/devices' / name).read_text()) for name in ['devices.json', 'mice.json']}
sources = {source['image'] for data in files.values() for device in data if (entry := source_for(device)) for source in entry['skins'] if source.get('image')}
out = ROOT / 'public/devices/artwork'
out.mkdir(parents=True, exist_ok=True)

def materialize(source):
    name = re.sub(r'[^a-zA-Z0-9-]', '-', Path(source).stem).strip('-')[:55]
    target = out / f'{name}-{hashlib.sha256(source.encode()).hexdigest()[:10]}.webp'
    try:
        if not target.exists():
            if source.startswith('https://bpcdn.atkgear.com/device/ossAssets/'):
                with urlopen(source, timeout=25) as response:
                    data = BytesIO(response.read())
            else:
                data = source
            with Image.open(data) as image:
                image.thumbnail((800, 800))
                image.save(target, 'WEBP', quality=88)
        return source, '/' + target.relative_to(ROOT / 'public').as_posix()
    except Exception as error:
        print(f'Unavailable: {source}: {error}')
        return source, None

with ThreadPoolExecutor(max_workers=8) as workers:
    images = dict(workers.map(materialize, sorted(sources)))

count = 0
override_file = ROOT / 'src/devices/vendorArtwork.json'
overrides = json.loads(override_file.read_text()) if override_file.exists() else []
for filename, devices in files.items():
    for device in devices:
        entry = source_for(device)
        previous = device.get('colorways', [])
        if not entry:
            # No verified artwork: an honest empty preview beats another model's photo.
            for color in previous:
                color.pop('image', None)
            device['images'] = []
            continue
        display_name = {'EDGE 60HE ULTIMATE': 'ATK EDGE 60'}.get(entry['name'], entry['name'])
        if normalize(display_name) != normalize(device['name']):
            device['name'] = display_name
        colors = []
        for skin in entry['skins']:
            if not skin.get('value'):
                continue
            identifier = re.sub(r'[^a-z0-9]+', '-', re.sub(r'([a-z])([A-Z])', r'\1-\2', skin['value']).lower()).strip('-')
            old = next((c for c in previous if normalize(c.get('id', c['name'])) == normalize(skin['value'])), None)
            label = old['name'] if old else re.sub(r'([a-z])([A-Z])', r'\1 \2', skin['value']).replace('-', ' ').title()
            color = {'id': identifier, 'name': label, 'hex': (skin.get('hex') or (old or {}).get('hex', '#808080')).upper()}
            if images.get(skin.get('image')):
                color['image'] = images[skin['image']]
            colors.append(color)
        device['colorways'] = colors
        device['images'] = [c['image'] for c in colors if c.get('image')]
        for color in colors:
            lookup_color = color['id'].removeprefix('metal-') if device['name'] == 'VXE X3' else color['id']
            replacement = next((r for r in overrides if r['deviceName'] == device['name'] and r['color'] == lookup_color), None)
            if replacement:
                color['image'] = replacement['image']
                if device['name'] == 'VXE X3':
                    color['id'] = replacement['color']
                    color['name'] = replacement['color'].title()
        device['images'] = [c['image'] for c in colors if c.get('image')]
        count += 1
    (ROOT / 'src/devices' / filename).write_text(json.dumps(devices, indent=2) + '\n')
print(f'Repaired {count} device definitions; {sum(bool(p) for p in images.values())}/{len(images)} local source images.')
