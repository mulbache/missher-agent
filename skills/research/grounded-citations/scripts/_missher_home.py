"""Resolve MISSHER_HOME for standalone skill scripts.

Skill scripts may run outside the Missher process (system Python, nix env,
CI) where ``missher_constants`` is not importable.  This module provides the
same ``get_missher_home()`` contract without requiring it on ``sys.path``.

When ``missher_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from missher_constants import get_missher_home as get_missher_home
except (ModuleNotFoundError, ImportError):

    def get_missher_home() -> Path:
        """Return the Missher home directory (default: ``~/.missher``)."""
        val = os.environ.get("MISSHER_HOME", "").strip()
        return Path(val) if val else Path.home() / ".missher"
