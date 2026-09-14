"""Tests for the Nous-Missher-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"missher"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``missher-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "missher" tag namespace.

``is_nous_missher_non_agentic`` should only match the actual Nous Research
Missher-3 / Missher-4 chat family.
"""

from __future__ import annotations

import pytest

from missher_cli.model_switch import (
    _MISSHER_MODEL_WARNING,
    _check_missher_model_warning,
    is_nous_missher_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "NousResearch/Hermes-3-Llama-3.1-70B",
        "NousResearch/Hermes-3-Llama-3.1-405B",
        "missher-3",
        "Missher-3",
        "missher-4",
        "hermes-4-405b",
        "missher_4_70b",
        "openrouter/hermes3:70b",
        "openrouter/nousresearch/hermes-4-405b",
        "NousResearch/Missher3",
        "missher-3.1",
    ],
)
def test_matches_real_nous_missher_chat_models(model_name: str) -> None:
    assert is_nous_missher_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous Missher 3/4"
    )
    assert _check_missher_model_warning(model_name) == _MISSHER_MODEL_WARNING


