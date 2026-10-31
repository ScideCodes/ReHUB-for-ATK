"""Cache exact variant photos published by the manufacturer for retired X3 CDN URLs."""
import json
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen
from PIL import Image

root = Path(__file__).resolve().parent.parent
product_url = 'https://www.atk.store/products/vxe-dragonfly-x3-series-lightweight-wireless-mouse'
with urlopen(product_url + '.js', timeout=30) as response:
    product = json.load(response)
records = []
for variant in product['variants']:
    model, color = variant['title'].split(' / ')
    photo = variant.get('featured_image')
    if not photo:
        continue
    color_id = color.lower().replace('metallic', 'metal').replace(' ', '-')
    folder = root / 'public/devices' / ('vxe-' + model.lower().replace(' ', '-'))
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / (color_id + '.webp')
    if not target.exists():
        with urlopen(photo['src'], timeout=30) as response:
            with Image.open(BytesIO(response.read())) as image:
                image.thumbnail((1600, 1600))
                image.save(target, 'WEBP', quality=92)
    records.append({'deviceName': 'VXE ' + model, 'color': color_id, 'image': '/' + target.relative_to(root / 'public').as_posix(), 'source': product_url, 'sourceImage': photo['src']})
(root / 'src/devices/vendorArtwork.json').write_text(json.dumps(records, indent=2) + '\n')
print(f'Cached {len(records)} exact manufacturer variant photos.')
