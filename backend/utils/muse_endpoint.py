"""Where the chat-model and SAM calls go: straight to Meta, or through the Muse proxy on Render.

Meta's API refuses chat and SAM requests sent from Railway, while the same key works from Render (see the README,
"Meta's models are not available from Railway"). So on Railway these calls go through a small proxy on Render
(``render_proxy/``), which adds the Meta key itself. Voice is not affected: it still connects to Meta directly.

    MUSE_PROXY_URL      the proxy's address, for example https://muse-proxy.onrender.com (not set: call Meta directly)
    MUSE_PROXY_SECRET   the shared secret the proxy expects (required when MUSE_PROXY_URL is set)

Example:
    base_url, key = muse_endpoint(os.getenv("MUSE_API"))
"""

import os

META_API_URL = "https://api.meta.ai/v1"


def muse_endpoint(meta_key: str | None) -> tuple[str, str | None]:
    """The (base URL, key) for chat and SAM calls.

    Without MUSE_PROXY_URL it is Meta's API and the given Meta key. With it, it is the proxy and MUSE_PROXY_SECRET, so the
    Meta key is never sent from here. A proxy address without a secret is a setting mistake, so it fails loudly.
    """
    proxy_url = (os.getenv("MUSE_PROXY_URL") or "").strip().rstrip("/")
    if not proxy_url:
        return META_API_URL, meta_key

    secret = (os.getenv("MUSE_PROXY_SECRET") or "").strip()
    if not secret:
        raise RuntimeError("MUSE_PROXY_URL is set but MUSE_PROXY_SECRET is not; set both, or neither to call Meta directly.")
    return f"{proxy_url}/v1", secret
