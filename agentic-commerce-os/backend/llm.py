"""
Agentic Commerce OS — Unified LLM Client
Abstracts NVIDIA API (default), Ollama (fallback), and vLLM (optional).
Every agent calls `llm.generate()` — the provider is transparent.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger("agentic.llm")

# ═══════════════════════════════════════════════════════════════
# TOKEN TRACKING — Global counters for cost estimation
# ═══════════════════════════════════════════════════════════════


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    @property
    def estimated_cost_usd(self) -> float:
        """NVIDIA API pricing estimate (varies by model)."""
        return (self.prompt_tokens / 1e6 * 0.075) + (
            self.completion_tokens / 1e6 * 0.30
        )

    def add(self, prompt: int, completion: int) -> None:
        self.prompt_tokens += prompt
        self.completion_tokens += completion

    def reset(self) -> None:
        self.prompt_tokens = 0
        self.completion_tokens = 0


token_usage = TokenUsage()


# ═══════════════════════════════════════════════════════════════
# LLM CLIENT — Async, provider-agnostic
# ═══════════════════════════════════════════════════════════════


async def generate(
    system_prompt: str,
    user_prompt: str,
    *,
    role: str = "builder",
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
    max_retries: int = 5,
) -> str:
    """Generate a completion from the configured LLM provider.

    Args:
        system_prompt: The system message defining agent behavior.
        user_prompt: The user/task message.
        role: One of "blueprint", "builder", "quality" — selects model + defaults.
        temperature: Override temperature (uses role default if None).
        max_tokens: Override max tokens (uses role default if None).
        max_retries: Number of retry attempts for transient failures.

    Returns:
        The raw completion text from the LLM.
    """
    provider = settings.llm_provider

    if provider == "nvidia":
        return await _call_nvidia(
            system_prompt, user_prompt, role, temperature, max_tokens, max_retries
        )
    elif provider == "ollama":
        return await _call_ollama(
            system_prompt, user_prompt, role, temperature, max_tokens, max_retries
        )
    elif provider == "vllm":
        return await _call_vllm(
            system_prompt, user_prompt, role, temperature, max_tokens, max_retries
        )
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


# ─── NVIDIA API (Default) ────────────────────────────────────


def _get_nvidia_model(role: str) -> str:
    """Select the NVIDIA model based on agent role."""
    model_map = {
        "blueprint": settings.nvidia_model_blueprint,
        "builder": settings.nvidia_model_builder,
        "quality": settings.nvidia_model_quality,
    }
    return model_map.get(role, settings.nvidia_model_builder)


def _get_defaults(role: str) -> tuple[float, int]:
    """Get default temperature and max_tokens for a role."""
    defaults = {
        "blueprint": (settings.blueprint_temperature, settings.blueprint_max_tokens),
        "builder": (settings.builder_temperature, settings.builder_max_tokens),
        "quality": (settings.quality_temperature, settings.quality_max_tokens),
    }
    return defaults.get(role, (0.6, 8192))


async def _call_nvidia(
    system_prompt: str,
    user_prompt: str,
    role: str,
    temperature: Optional[float],
    max_tokens: Optional[int],
    max_retries: int,
) -> str:
    """Call NVIDIA Inference API (OpenAI-compatible endpoint)."""
    model = _get_nvidia_model(role)
    default_temp, default_max = _get_defaults(role)
    temp = temperature if temperature is not None else default_temp
    mtok = max_tokens if max_tokens is not None else default_max

    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temp,
        "max_tokens": mtok,
    }

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(
                f"NVIDIA API → {model} (role={role}, attempt {attempt}/{max_retries})"
            )

            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{settings.nvidia_base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )

            if response.status_code == 429 or response.status_code >= 500:
                wait = 10 * (2 ** (attempt - 1))
                logger.warning(
                    f"NVIDIA API rate-limited ({response.status_code}). "
                    f"Waiting {wait}s..."
                )
                await asyncio.sleep(wait)
                continue

            response.raise_for_status()
            data = response.json()

            # Track token usage
            usage = data.get("usage", {})
            token_usage.add(
                usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
            )

            content = data["choices"][0]["message"]["content"]
            logger.info(
                f"NVIDIA API ✅ {model} → {len(content)} chars, "
                f"{usage.get('completion_tokens', 0)} tokens"
            )
            return content

        except httpx.HTTPStatusError as e:
            if attempt < max_retries and e.response.status_code in (429, 500, 502, 503):
                wait = 10 * (2 ** (attempt - 1))
                logger.warning(f"NVIDIA HTTP error {e.response.status_code}, retry in {wait}s")
                await asyncio.sleep(wait)
                continue
            logger.error(f"NVIDIA API failed after {attempt} attempts: {e}")
            raise

        except (httpx.ConnectError, httpx.ReadTimeout) as e:
            if attempt < max_retries:
                wait = 10 * (2 ** (attempt - 1))
                logger.warning(f"NVIDIA connection error, retry in {wait}s: {e}")
                await asyncio.sleep(wait)
                continue
            logger.error(f"NVIDIA API connection failed after {attempt} attempts: {e}")
            raise

    raise RuntimeError(f"NVIDIA API: All {max_retries} retries exhausted for {model}")


# ─── Ollama (Local Fallback) ─────────────────────────────────


async def _call_ollama(
    system_prompt: str,
    user_prompt: str,
    role: str,
    temperature: Optional[float],
    max_tokens: Optional[int],
    max_retries: int,
) -> str:
    """Call local Ollama instance."""
    default_temp, default_max = _get_defaults(role)
    temp = temperature if temperature is not None else default_temp

    payload = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": temp, "num_predict": max_tokens or default_max},
    }

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(
                f"Ollama → {settings.ollama_model} (attempt {attempt}/{max_retries})"
            )

            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(
                    f"{settings.ollama_base_url}/api/chat", json=payload
                )

            response.raise_for_status()
            data = response.json()
            content = data.get("message", {}).get("content", "")

            eval_count = data.get("eval_count", 0)
            prompt_count = data.get("prompt_eval_count", 0)
            token_usage.add(prompt_count, eval_count)

            logger.info(f"Ollama ✅ → {len(content)} chars, {eval_count} tokens")
            return content

        except Exception as e:
            if attempt < max_retries:
                wait = 5 * attempt
                logger.warning(f"Ollama error, retry in {wait}s: {e}")
                await asyncio.sleep(wait)
                continue
            logger.error(f"Ollama failed after {attempt} attempts: {e}")
            raise

    raise RuntimeError(f"Ollama: All {max_retries} retries exhausted")


# ─── vLLM (Optional Local GPU) ───────────────────────────────


async def _call_vllm(
    system_prompt: str,
    user_prompt: str,
    role: str,
    temperature: Optional[float],
    max_tokens: Optional[int],
    max_retries: int,
) -> str:
    """Call local vLLM server (OpenAI-compatible)."""
    default_temp, default_max = _get_defaults(role)
    temp = temperature if temperature is not None else default_temp
    mtok = max_tokens if max_tokens is not None else default_max

    payload = {
        "model": settings.vllm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": temp,
        "max_tokens": mtok,
    }

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(
                f"vLLM → {settings.vllm_model} (attempt {attempt}/{max_retries})"
            )

            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(
                    f"{settings.vllm_base_url}/chat/completions", json=payload
                )

            response.raise_for_status()
            data = response.json()

            usage = data.get("usage", {})
            token_usage.add(
                usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)
            )

            content = data["choices"][0]["message"]["content"]
            logger.info(f"vLLM ✅ → {len(content)} chars")
            return content

        except Exception as e:
            if attempt < max_retries:
                wait = 5 * attempt
                logger.warning(f"vLLM error, retry in {wait}s: {e}")
                await asyncio.sleep(wait)
                continue
            logger.error(f"vLLM failed after {attempt} attempts: {e}")
            raise

    raise RuntimeError(f"vLLM: All {max_retries} retries exhausted")


# ─── Utility: Extract JSON from LLM response ─────────────────


def extract_json(text: str) -> dict:
    """Extract JSON from an LLM response that may contain markdown fences."""
    cleaned = text.strip()

    # Try to find JSON in markdown code fences
    import re

    md_match = re.search(r"```(?:json)?\s*\n([\s\S]*?)```", cleaned)
    if md_match:
        cleaned = md_match.group(1).strip()

    # Try direct parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try to find the first { ... } block
    brace_start = cleaned.find("{")
    brace_end = cleaned.rfind("}")
    if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
        try:
            return json.loads(cleaned[brace_start : brace_end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON from LLM response:\n{text[:500]}")
