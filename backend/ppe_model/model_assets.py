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
LATEST_ARCHIVE_PATH = ROOT_DIR / "best (17).pt.zip"
SH17_ARCHIVE_PATH = ROOT_DIR / "sh17_best.pt.zip"
SH17_WEIGHTS_PATH = WEIGHTS_DIR / "sh17_best.pt"
LEGACY_WEIGHTS_PATH = WEIGHTS_DIR / "best.pt"


def normalize_label(label: str) -> str:
    return str(label).strip().lower().replace("_", "-")


def materialize_model_path(path: Path) -> str:
    if path.suffix.lower() != ".zip":
        return str(path)

    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    target_path = WEIGHTS_DIR / path.stem
    shutil.copyfile(path, target_path)
    return str(target_path)


def resolve_model_source() -> str:
    env_model_source = (os.getenv("PPE_MODEL_SOURCE") or os.getenv("MODEL_PATH") or "").strip()
    if env_model_source:
        env_path = Path(env_model_source)
        if env_path.exists():
            return materialize_model_path(env_path)
        return env_model_source

    if LATEST_ARCHIVE_PATH.exists():
        return materialize_model_path(LATEST_ARCHIVE_PATH)

    root_model_path = ROOT_DIR / "sh17_best.pt"
    if root_model_path.exists():
        return str(root_model_path)

    if SH17_WEIGHTS_PATH.exists():
        return str(SH17_WEIGHTS_PATH)

    if SH17_ARCHIVE_PATH.exists():
        return materialize_model_path(SH17_ARCHIVE_PATH)

    if LEGACY_WEIGHTS_PATH.exists():
        return str(LEGACY_WEIGHTS_PATH)

    raise FileNotFoundError(
        "No PPE model weights found. Expected PPE_MODEL_SOURCE, best (17).pt.zip, sh17_best.pt.zip, or weights/best.pt."
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
