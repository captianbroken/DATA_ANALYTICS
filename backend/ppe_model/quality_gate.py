"""
quality_gate.py
Prevents DB seeding unless a validated model metric passes a minimum threshold.
"""

from __future__ import annotations

import json
from pathlib import Path


def load_metrics(metrics_path: str | Path) -> dict:
    path = Path(metrics_path)
    if not path.exists():
        raise FileNotFoundError(f"Metrics file not found: {path}")

    with open(path, encoding="utf-8") as file_obj:
        payload = json.load(file_obj)

    if not isinstance(payload, dict):
        raise ValueError("Metrics file must contain a JSON object")
    return payload


def resolve_metric(metrics: dict, metric_name: str) -> float:
    value = metrics.get(metric_name)
    if value is None:
        raise KeyError(f"Metric '{metric_name}' was not found in metrics JSON")
    return float(value)


def assert_metric_threshold(metrics_path: str | Path, metric_name: str, minimum_value: float) -> float:
    metrics = load_metrics(metrics_path)
    actual_value = resolve_metric(metrics, metric_name)
    if actual_value < minimum_value:
        raise RuntimeError(
            f"Quality gate failed: {metric_name}={actual_value:.4f} is below required threshold {minimum_value:.4f}"
        )
    return actual_value
