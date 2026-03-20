"""
download_labeled_dataset.py
Downloads a labeled PPE YOLO dataset and extracts it for training.
"""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
DATA_DIR = BACKEND_DIR / "training_data"
ZIP_PATH = DATA_DIR / "PPE.zip"
EXTRACT_DIR = DATA_DIR / "PPE"
DEFAULT_DATASET_URL = "https://huggingface.co/datasets/51ddhesh/PPE_Detection/resolve/main/PPE.zip?download=true"


def download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=120, headers={"User-Agent": "Hyperspark-PPE/1.0"}) as response:
        response.raise_for_status()
        with open(destination, "wb") as file_obj:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file_obj.write(chunk)


def extract_zip(zip_path: Path, destination: Path) -> None:
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(destination)


def resolve_data_yaml(root: Path) -> Path:
    matches = list(root.rglob("data.yaml"))
    if not matches:
        raise FileNotFoundError("No data.yaml found after dataset extraction")
    return matches[0]


def main(dataset_url: str = DEFAULT_DATASET_URL) -> Path:
    print(f"Downloading labeled PPE dataset from: {dataset_url}")
    download_file(dataset_url, ZIP_PATH)
    print(f"Saved archive to: {ZIP_PATH}")
    extract_zip(ZIP_PATH, EXTRACT_DIR)
    data_yaml = resolve_data_yaml(EXTRACT_DIR)
    print(f"Dataset extracted. data.yaml: {data_yaml}")
    return data_yaml


if __name__ == "__main__":
    main()
