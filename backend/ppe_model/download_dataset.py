"""
download_dataset.py
Downloads real PPE / construction-worker images into backend/dataset/.
This script never generates synthetic placeholders.
"""

from __future__ import annotations

import hashlib
import io
from pathlib import Path

import requests
from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATASET_DIR = BACKEND_DIR / "dataset"
DATASET_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_URLS = [
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1280&q=80",
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1280&q=80",
    "https://images.unsplash.com/photo-1565008576549-47c2b858a37e?w=1280&q=80",
    "https://images.unsplash.com/photo-1574615150254-a8ff2c7b3b72?w=1280&q=80",
    "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1280&q=80",
    "https://images.unsplash.com/photo-1504933550-65a02a6cef16?w=1280&q=80",
    "https://images.unsplash.com/photo-1517976547714-720226b864c1?w=1280&q=80",
    "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1280&q=80",
    "https://images.unsplash.com/photo-1500989145603-8e7ef71d639e?w=1280&q=80",
    "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=1280&q=80",
    "https://images.unsplash.com/photo-1595524977631-5f73fa58d77a?w=1280&q=80",
    "https://images.unsplash.com/photo-1590330297626-d7aff25a0431?w=1280&q=80",
    "https://images.unsplash.com/photo-1565608528600-a1d8e614f7df?w=1280&q=80",
    "https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=1280&q=80",
    "https://images.pexels.com/photos/1094945/pexels-photo-1094945.jpeg?auto=compress&cs=tinysrgb&w=1280",
    "https://images.pexels.com/photos/159358/construction-site-build-construction-work-159358.jpeg?auto=compress&cs=tinysrgb&w=1280",
    "https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=1280",
    "https://images.pexels.com/photos/585419/pexels-photo-585419.jpeg?auto=compress&cs=tinysrgb&w=1280",
    "https://images.pexels.com/photos/1109541/pexels-photo-1109541.jpeg?auto=compress&cs=tinysrgb&w=1280",
    "https://images.pexels.com/photos/2219024/pexels-photo-2219024.jpeg?auto=compress&cs=tinysrgb&w=1280",
    "https://images.pexels.com/photos/3862132/pexels-photo-3862132.jpeg?auto=compress&cs=tinysrgb&w=1280",
    "https://images.pexels.com/photos/4491881/pexels-photo-4491881.jpeg?auto=compress&cs=tinysrgb&w=1280",
]


def clear_existing_dataset() -> None:
    for image_path in DATASET_DIR.glob("*"):
        if image_path.is_file():
            image_path.unlink()


def download_image(url: str) -> bytes:
    response = requests.get(url, timeout=30, headers={"User-Agent": "Hyperspark-PPE/1.0"})
    response.raise_for_status()
    if len(response.content) < 15_000:
        raise ValueError("downloaded file is unexpectedly small")
    return response.content


def normalize_image(content: bytes) -> bytes:
    with Image.open(io.BytesIO(content)) as image:
        rgb_image = image.convert("RGB")
        if rgb_image.width < 300 or rgb_image.height < 300:
            raise ValueError("image is too small for PPE detection")
        output = io.BytesIO()
        rgb_image.save(output, format="JPEG", quality=92)
        return output.getvalue()


def main(clear_existing: bool = True) -> int:
    print(f"\n{'=' * 60}")
    print("  Real PPE Dataset Downloader")
    print(f"  Source URL count: {len(IMAGE_URLS)}")
    print(f"  Output: {DATASET_DIR}")
    print(f"{'=' * 60}\n")

    if clear_existing:
        clear_existing_dataset()

    saved = 0
    seen_hashes: set[str] = set()

    for index, url in enumerate(IMAGE_URLS, start=1):
        print(f"  [{index}/{len(IMAGE_URLS)}] Downloading real image...")
        try:
            raw_content = download_image(url)
            normalized = normalize_image(raw_content)
            digest = hashlib.sha256(normalized).hexdigest()
            if digest in seen_hashes:
                print("    - duplicate image skipped")
                continue

            seen_hashes.add(digest)
            destination = DATASET_DIR / f"ppe_real_{saved + 1:04d}.jpg"
            destination.write_bytes(normalized)
            saved += 1
            print(f"    + saved {destination.name}")
        except Exception as exc:
            print(f"    - skipped: {exc}")

    if saved == 0:
        raise RuntimeError("No real dataset images were downloaded. Synthetic fallback is disabled.")

    print(f"\n[1/3] Dataset ready: {saved} real images\n")
    return saved


if __name__ == "__main__":
    main()
