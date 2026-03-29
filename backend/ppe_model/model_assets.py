from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Any

import yaml

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
WEIGHTS_DIR = ROOT_DIR / "weights"

SH17_CONFIG_PATH = ROOT_DIR / "sh17.yaml"
SH17_ARCHIVE_PATH = ROOT_DIR / "sh17_best.pt.zip"
SH17_WEIGHTS_PATH = WEIGHTS_DIR / "sh17_best.pt"
LEGACY_WEIGHTS_PATH = WEIGHTS_DIR / "best.pt"


def normalize_label(label: str) -> str:
    return str(label).strip().lower().replace("_", "-")


def resolve_model_source() -> str:
    env_model_source = (os.getenv("PPE_MODEL_SOURCE") or os.getenv("MODEL_PATH") or "").strip()
    if env_model_source:
        return env_model_source

    root_model_path = ROOT_DIR / "sh17_best.pt"
    if root_model_path.exists():
        return str(root_model_path)

    if SH17_WEIGHTS_PATH.exists():
        return str(SH17_WEIGHTS_PATH)

    if SH17_ARCHIVE_PATH.exists():
        WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SH17_ARCHIVE_PATH, SH17_WEIGHTS_PATH)
        return str(SH17_WEIGHTS_PATH)

    if LEGACY_WEIGHTS_PATH.exists():
        return str(LEGACY_WEIGHTS_PATH)

    raise FileNotFoundError(
        "No PPE model weights found. Expected PPE_MODEL_SOURCE, sh17_best.pt.zip, or weights/best.pt."
    )


def load_model_class_names() -> dict[int, str]:
    if not SH17_CONFIG_PATH.exists():
        return {}

    with SH17_CONFIG_PATH.open("r", encoding="utf-8") as file_obj:
        config: dict[str, Any] = yaml.safe_load(file_obj) or {}

    names = config.get("names") or {}
    if isinstance(names, list):
        return {index: normalize_label(name) for index, name in enumerate(names)}

    if isinstance(names, dict):
        normalized: dict[int, str] = {}
        for raw_index, raw_name in names.items():
            try:
                normalized[int(raw_index)] = normalize_label(raw_name)
            except (TypeError, ValueError):
                continue
        return normalized

    return {}
