from pathlib import Path


def test_windows_native_install_path_docs_match_installer() -> None:
    doc = Path("website/docs/user-guide/windows-native.md").read_text()
    install = Path("scripts/install.ps1").read_text()

    # The launchers live in the managed binary dir OUTSIDE the git checkout
    # (MISSHER_HOME\bin, next to the managed uv) — NOT the whole venv\Scripts
    # (which would shadow the user's python, #83797) and NOT a dir inside
    # the checkout (which `missher update`'s autostash swept off disk).
    assert "%LOCALAPPDATA%\\missher\\bin" in doc
    assert (
        "Get-Command missher        # should print "
        "C:\\Users\\<you>\\AppData\\Local\\missher\\bin\\missher.exe"
    ) in doc
    # Installer exposes $MissherHome\bin, and must copy the launchers into it.
    assert '$missherBin = "$MissherHome\\bin"' in install
    assert "missher.exe" in install and "missher-acp.exe" in install
    # Guard against regressions to either legacy layout.
    assert '$missherBin = "$InstallDir\\venv\\Scripts"' not in install
    assert '$missherBin = "$InstallDir\\bin"' not in install
