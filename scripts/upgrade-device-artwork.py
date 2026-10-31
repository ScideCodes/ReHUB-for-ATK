"""Re-encode device artwork from the original sources at higher resolution (up to 1600 px) and quality.

apply-device-artwork.py once wrote every image at 800 px / WebP q88, which looks soft and grainy on large
cards and high-DPI screens. This re-materializes the same files (same names, so no data changes) from the
same sources: the extracted app's static images, or the manufacturer CDN URLs listed in sourceArtwork.json.
Needs ffmpeg (with libwebp) on PATH.
"""
import hashlib
import json
import os
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/devices/artwork'
MAX_SIDE = 1600
QUALITY = '92'
# Originals that are already small WebP files are kept byte for byte (no second lossy pass).
KEEP_ORIGINAL_BYTES = 400 * 1024


def webp_size(data):
    """(width, height) of a WebP file, or None."""
    if data[:4] != b'RIFF' or data[8:12] != b'WEBP':
        return None
    kind = data[12:16]
    if kind == b'VP8 ':
        return int.from_bytes(data[26:28], 'little') & 0x3FFF, int.from_bytes(data[28:30], 'little') & 0x3FFF
    if kind == b'VP8L':
        bits = int.from_bytes(data[21:25], 'little')
        return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if kind == b'VP8X':
        return int.from_bytes(data[24:27], 'little') + 1, int.from_bytes(data[27:30], 'little') + 1
    return None

records = json.loads((ROOT / 'src/devices/sourceArtwork.json').read_text())
def target_for(source):
    # Same naming as apply-device-artwork.py.
    name = re.sub(r'[^a-zA-Z0-9-]', '-', Path(source).stem).strip('-')[:55]
    return OUT / f'{name}-{hashlib.sha256(source.encode()).hexdigest()[:10]}.webp'


sources = sorted({skin['image'] for record in records for skin in record['skins'] if skin.get('image')})
# Optional: ONLY=<file listing artwork file names> retries just those (the CDN times out under load).
if os.environ.get('ONLY'):
    wanted = set(Path(os.environ['ONLY']).read_text().split())
    sources = [s for s in sources if target_for(s).name in wanted]


def upgrade(source):
    target = target_for(source)
    if not target.exists():
        return 'skipped (not used)'
    with tempfile.TemporaryDirectory() as tmp:
        if source.startswith('https://'):
            local = Path(tmp) / 'source'
            with urlopen(source, timeout=30) as response:
                local.write_bytes(response.read())
        else:
            local = Path(source)
            if not local.exists():
                local = ROOT.parent / source  # repo-relative "extracted/..." paths
            if not local.exists():
                return 'missing source'
        data = local.read_bytes()
        size = webp_size(data)
        if size and max(size) <= MAX_SIDE and len(data) <= KEEP_ORIGINAL_BYTES:
            target.write_bytes(data)
            return 'original'
        out = Path(tmp) / 'out.webp'
        scale = f"scale='if(gt(iw,ih),min(iw,{MAX_SIDE}),-2)':'if(gt(iw,ih),-2,min(ih,{MAX_SIDE}))':flags=lanczos"
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-i', str(local), '-vf', scale, '-c:v', 'libwebp', '-quality', QUALITY,
             '-compression_level', '6', '-frames:v', '1', str(out)],
            check=True,
        )
        target.write_bytes(out.read_bytes())
    return 'upgraded'


def _run(source):
    try:
        return source, upgrade(source)
    except Exception as error:  # keep the existing file when a source is unavailable
        return source, f'failed: {error}'


with ThreadPoolExecutor(max_workers=int(os.environ.get("WORKERS", "8"))) as workers:
    outcomes = dict(workers.map(_run, sources))
summary = {}
for outcome in outcomes.values():
    key = outcome.split(':')[0]
    summary[key] = summary.get(key, 0) + 1
print(summary)
for source, outcome in outcomes.items():
    if outcome.startswith('failed') or outcome == 'missing source':
        print(outcome, source)
