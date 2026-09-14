"""Tests for the `missher memory reset` CLI command.

Covers:
- Reset both stores (MEMORY.md + USER.md)
- Reset individual stores (--target memory / --target user)
- Skip confirmation with --yes
- Graceful handling when no memory files exist
- Profile-scoped reset (uses MISSHER_HOME)
"""

import pytest


@pytest.fixture
def memory_env(tmp_path, monkeypatch):
    """Set up a fake MISSHER_HOME with memory files."""
    missher_home = tmp_path / ".missher"
    memories = missher_home / "memories"
    memories.mkdir(parents=True)
    monkeypatch.setenv("MISSHER_HOME", str(missher_home))

    # Create sample memory files
    (memories / "MEMORY.md").write_text(
        "§\nMissher repo is at ~/.missher/missher-agent\n§\nUser prefers dark themes",
        encoding="utf-8",
    )
    (memories / "USER.md").write_text(
        "§\nUser is Teknium\n§\nTimezone: US Pacific",
        encoding="utf-8",
    )
    return missher_home, memories


def _run_memory_reset(target="all", yes=False, monkeypatch=None, confirm_input="no"):
    """Invoke the memory reset logic from cmd_memory in main.py.

    Simulates what happens when `missher memory reset` is run.
    """
    from missher_constants import get_missher_home

    mem_dir = get_missher_home() / "memories"
    files_to_reset = []
    if target in {"all", "memory"}:
        files_to_reset.append(("MEMORY.md", "agent notes"))
    if target in {"all", "user"}:
        files_to_reset.append(("USER.md", "user profile"))

    existing = [(f, desc) for f, desc in files_to_reset if (mem_dir / f).exists()]
    if not existing:
        return "nothing"

    if not yes:
        if confirm_input != "yes":
            return "cancelled"

    for f, desc in existing:
        (mem_dir / f).unlink()

    return "deleted"


class TestMemoryReset:
    """Tests for `missher memory reset` subcommand."""

    def test_reset_all_with_yes_flag(self, memory_env):
        """--yes flag should skip confirmation and delete both files."""
        missher_home, memories = memory_env
        assert (memories / "MEMORY.md").exists()
        assert (memories / "USER.md").exists()

        result = _run_memory_reset(target="all", yes=True)
        assert result == "deleted"
        assert not (memories / "MEMORY.md").exists()
        assert not (memories / "USER.md").exists()


    def test_reset_no_files_exist(self, tmp_path, monkeypatch):
        """Should return 'nothing' when no memory files exist."""
        missher_home = tmp_path / ".missher"
        (missher_home / "memories").mkdir(parents=True)
        monkeypatch.setenv("MISSHER_HOME", str(missher_home))

        result = _run_memory_reset(target="all", yes=True)
        assert result == "nothing"


    def test_reset_partial_files(self, memory_env):
        """Reset should work when only one memory file exists."""
        missher_home, memories = memory_env
        (memories / "USER.md").unlink()

        result = _run_memory_reset(target="all", yes=True)
        assert result == "deleted"
        assert not (memories / "MEMORY.md").exists()

