"""
Agentic Commerce OS — Configuration
Pydantic Settings for environment variables, LLM providers, Redis/Celery config.
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # ── LLM Provider ──────────────────────────────────────────────
    # "nvidia" (default, cloud), "ollama" (local fallback), "vllm" (local GPU)
    llm_provider: str = "nvidia"

    # NVIDIA API (Default — maximum intelligence)
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_model_blueprint: str = "qwen/qwen3-coder-480b-a35b-instruct"
    nvidia_model_builder: str = "moonshotai/kimi-k2.6"
    nvidia_model_quality: str = "meta/llama-3.1-70b-instruct"

    # Ollama (Fallback — local inference)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5-coder:14b"

    # vLLM (Optional — local GPU server)
    vllm_base_url: str = "http://localhost:8080/v1"
    vllm_model: str = "Qwen/Qwen2.5-Coder-14B-Instruct"

    # ── LLM Parameters ────────────────────────────────────────────
    blueprint_temperature: float = 0.7
    blueprint_max_tokens: int = 8192
    builder_temperature: float = 0.6
    builder_max_tokens: int = 16384
    quality_temperature: float = 0.3
    quality_max_tokens: int = 4096

    # ── Redis / Celery ────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # ── Scout Crawler — Target URLs ──────────────────────────────
    # These are the 3 high-end reference sites the Scout crawls.
    # Configurable per industry, but defaults to iconic luxury.
    scout_urls_fashion: list[str] = [
        "https://www.prada.com/us/en.html",
        "https://us.louisvuitton.com/eng-us/homepage",
        "https://www.gucci.com/us/en/",
    ]
    scout_urls_automotive: list[str] = [
        "https://www.porsche.com/usa/",
        "https://www.ferrari.com/en-US",
        "https://www.tesla.com/",
    ]
    scout_urls_technology: list[str] = [
        "https://www.apple.com/",
        "https://www.dyson.com/",
        "https://www.bang-olufsen.com/en/us",
    ]
    scout_urls_beauty: list[str] = [
        "https://www.aesop.com/us/",
        "https://www.laprairie.com/en-us/",
        "https://www.diptyqueparis.com/en_us/",
    ]
    scout_urls_furniture: list[str] = [
        "https://www.vitra.com/en-us/",
        "https://www.cassina.com/en",
        "https://www.minotti.com/en",
    ]
    scout_urls_watches: list[str] = [
        "https://www.rolex.com/en-us",
        "https://www.cartier.com/en-us/",
        "https://www.iwc.com/us/en/home.html",
    ]
    scout_urls_jewelry: list[str] = [
        "https://www.tiffany.com/",
        "https://www.cartier.com/en-us/",
        "https://www.bulgari.com/en-us/",
    ]
    scout_urls_default: list[str] = [
        "https://www.apple.com/",
        "https://www.prada.com/us/en.html",
        "https://www.aesop.com/us/",
    ]

    # ── Output ────────────────────────────────────────────────────
    output_base_dir: str = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "outputs"
    )

    # ── Server ────────────────────────────────────────────────────
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    def get_scout_urls(self, industry: str) -> list[str]:
        """Return the 3 reference URLs for a given industry."""
        url_map = {
            "fashion": self.scout_urls_fashion,
            "automotive": self.scout_urls_automotive,
            "technology": self.scout_urls_technology,
            "beauty": self.scout_urls_beauty,
            "furniture": self.scout_urls_furniture,
            "watches": self.scout_urls_watches,
            "jewelry": self.scout_urls_jewelry,
        }
        return url_map.get(industry, self.scout_urls_default)


settings = Settings()
