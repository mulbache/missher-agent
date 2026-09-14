"""Resolve MISSHER_HOME for standalone skill scripts.

Skill scripts may run outside the Missher process (e.g. system Python,
nix env, CI) where ``missher_constants`` is not importable.  This module
provides the same ``get_missher_home()`` and ``display_missher_home()``
contracts as ``missher_constants`` without requiring it on ``sys.path``.

When ``missher_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``missher_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``MISSHER_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from missher_constants import display_missher_home as display_missher_home
    from missher_constants import get_missher_home as get_missher_home
except (ModuleNotFoundError, ImportError):

    def get_missher_home() -> Path:
        """Return the Missher home directory (default: ~/.missher).

        Mirrors ``missher_constants.get_missher_home()``."""
        val = os.environ.get("MISSHER_HOME", "").strip()
        return Path(val) if val else Path.home() / ".missher"

    def display_missher_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``missher_constants.display_missher_home()``."""
        home = get_missher_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
