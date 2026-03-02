# backend/ai_provider.py
import json
from typing import Generator

import anthropic
import openai


# ── System prompts ────────────────────────────────────────────────────────────

def build_system_prompt(context: dict) -> str:
    ctx_type = context.get("type")
    data     = context.get("data", {})

    if ctx_type == "fix-error":
        error    = data.get("error", "")
        services = json.dumps(data.get("services", []), indent=2)
        return f"""You are a Docker Compose configuration assistant. The user encountered this error deploying a template:

<error>{error}</error>

Here are the services in the template:
<services>{services}</services>

Diagnose the problem and propose exactly one concrete fix. When proposing a change to a service field, output an action block in this exact format (on its own line, nothing else on that line):

~~~action
{{"service_id": "...", "field": "...", "old": ..., "new": ...}}
~~~

Be concise. One issue, one fix."""

    if ctx_type == "configure-service":
        service = json.dumps(data.get("service", {}), indent=2)
        return f"""You are a Docker Compose configuration assistant. The user wants help configuring this service:

<service>{service}</service>

Help them configure it correctly. When proposing a change to a field, output an action block in this exact format (on its own line):

~~~action
{{"service_id": "...", "field": "...", "old": ..., "new": ...}}
~~~

Ask clarifying questions if needed. Be concise and friendly."""

    return "You are a Docker Compose configuration assistant. Help the user."


# ── Provider streaming ────────────────────────────────────────────────────────

def validate_and_get_config(settings: dict) -> tuple[str, dict]:
    """Eagerly validates AI settings. Raises ValueError before any streaming begins."""
    provider = settings.get("activeAiProvider")
    providers = settings.get("aiProviders", {})
    if not provider or provider not in providers:
        raise ValueError("No AI provider configured. Go to AI Settings.")
    cfg = providers[provider]
    key = cfg.get("key", "").strip()
    if not key:
        raise ValueError(f"No API key set for provider '{provider}'. Go to AI Settings.")
    if provider == "custom":
        url = cfg.get("url", "").strip()
        if not url:
            raise ValueError("Custom provider requires a URL. Go to AI Settings.")
    return provider, cfg


def stream_chat(settings: dict, context: dict, messages: list[dict]) -> Generator[str, None, None]:
    """
    Yield SSE-formatted lines: 'data: <token>\\n\\n'
    Terminates with 'data: [DONE]\\n\\n'
    Call validate_and_get_config() before passing this to StreamingResponse.
    """
    provider, cfg = validate_and_get_config(settings)
    key = cfg.get("key", "").strip()
    system_prompt = build_system_prompt(context)

    if provider == "claude":
        yield from _stream_anthropic(key, system_prompt, messages)
    elif provider == "gemini":
        yield from _stream_openai(
            key=key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            model="gemini-2.0-flash",
            system_prompt=system_prompt,
            messages=messages,
        )
    elif provider == "custom":
        url = cfg.get("url", "").strip()
        model = cfg.get("model", "").strip() or "gpt-4o"
        yield from _stream_openai(
            key=key,
            base_url=url,
            model=model,
            system_prompt=system_prompt,
            messages=messages,
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")


def _stream_anthropic(key: str, system_prompt: str, messages: list[dict]) -> Generator[str, None, None]:
    client = anthropic.Anthropic(api_key=key)
    with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield f"data: {json.dumps(text)}\n\n"
    yield "data: [DONE]\n\n"


def _stream_openai(
    key: str, base_url: str, model: str, system_prompt: str, messages: list[dict]
) -> Generator[str, None, None]:
    client = openai.OpenAI(api_key=key, base_url=base_url)
    all_messages = [{"role": "system", "content": system_prompt}] + messages
    with client.chat.completions.create(
        model=model,
        messages=all_messages,
        stream=True,
    ) as stream:
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps(delta)}\n\n"
    yield "data: [DONE]\n\n"
