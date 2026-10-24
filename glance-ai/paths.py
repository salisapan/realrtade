"""Repo-relative locations for Glance's own model lab. No machine-specific absolute paths."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent


def engine_root() -> Path:
    env = os.environ.get("GLANCE_ENGINE_ROOT")
    if env:
        return Path(env).resolve()
    return REPO / "flow-trial-extension"


def eval_dir() -> Path:
    env = os.environ.get("GLANCE_EVAL_DATA")
    if env:
        return Path(env).resolve()
    return ROOT / "eval-data"


def eval_file(name: str) -> Path:
    return eval_dir() / name
