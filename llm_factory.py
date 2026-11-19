# app/services/llm_factory.py
from langchain_ollama import ChatOllama
from app.config import settings


def get_ollama_llm(
    model_name: str,
    temperature: float,
    max_tokens: int,
) -> ChatOllama:
    base_url = (settings.OLLAMA_BASE_URL or "http://127.0.0.1:11434").rstrip("/")
    using_ngrok = "ngrok-free.dev" in base_url or "ngrok.io" in base_url

    client_kwargs = {}
    async_client_kwargs = {}
    sync_client_kwargs = {}

    if using_ngrok:
        ngrok_headers = {
            # Bypasses ngrok browser interstitial for programmatic API calls.
            "ngrok-skip-browser-warning": "true"
        }
        client_kwargs["headers"] = ngrok_headers
        async_client_kwargs["headers"] = ngrok_headers
        sync_client_kwargs["headers"] = ngrok_headers

    return ChatOllama(
        base_url=base_url,
        model=model_name,
        temperature=temperature,
        timeout=settings.OLLAMA_TIMEOUT,
        num_predict=max_tokens,
        num_ctx=settings.OLLAMA_NUM_CTX,
        repeat_penalty=1.2,
        client_kwargs=client_kwargs,
        async_client_kwargs=async_client_kwargs,
        sync_client_kwargs=sync_client_kwargs,
    )


def is_ollama_memory_error(exc: Exception) -> bool:
    """Detect Ollama out-of-memory style failures from exception text."""
    msg = str(exc).lower()
    return (
        "requires more system memory" in msg
        or "insufficient memory" in msg
        or "out of memory" in msg
    )


async def ainvoke_with_memory_fallback(
    primary_llm: ChatOllama,
    payload,
    fallback_model: str,
    temperature: float,
    max_tokens: int,
):
    """Call an LLM and retry with a smaller model when RAM is insufficient."""
    try:
        return await primary_llm.ainvoke(payload)
    except Exception as exc:
        if not is_ollama_memory_error(exc):
            raise

        print(f"⚠️ Memory pressure detected. Retrying with fallback model: {fallback_model}")
        fallback_llm = get_ollama_llm(
            model_name=fallback_model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return await fallback_llm.ainvoke(payload)