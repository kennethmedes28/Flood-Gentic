"""Client for Meta's SAM 3.1 model: finds every object that matches a short phrase in a photo.

SAM answers with a box and a pixel mask for each match. Use it for "where is the flood water?" or "how many people
are in the picture?", not for reading text or describing a scene.

    async with SamClient(api_key) as sam:
        result = await sam.segment("flood water", ImageInput(path="street.jpg"))
        for record in result.records:        # boxes and masks, see meta_sam_parser
            ...

One request looks for ONE phrase (SAM's own rule), so ask once per kind of object.
API notes (https://dev.meta.ai/docs/sam/segmenting): ``POST /v1/responses``, model ``sam-3.1``, the
answer is streamed as text that ``meta_sam_parser`` turns into typed records.
"""

import base64
import json
import mimetypes
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

import httpx
from meta_sam_parser import (
    ImageSegmentationResult,
    image_segmentation_format,
    parse_responses_stream,
)

from src.services.usage_meter import add_sam_request
from utils.muse_endpoint import META_API_URL, muse_endpoint

BASE_URL = META_API_URL  # used when MUSE_PROXY_URL is not set (see utils/muse_endpoint.py)
MODEL = "sam-3.1"
REQUEST_TIMEOUT_SECONDS = 300.0  # a request streams for a while
MAX_IMAGE_BYTES = 20 * 1024 * 1024  # guard for what we are willing to base64-encode ourselves


@dataclass(frozen=True)
class ImageInput:
    """A photo: a public ``url``, a local ``path`` or raw ``data`` bytes (give exactly one)."""

    url: str | None = None
    path: str | Path | None = None
    data: bytes | None = None
    mime_type: str = "image/jpeg"  # only used with ``data``

    def read_bytes(self) -> bytes:
        """The picture's bytes, whichever way it was given (a URL is downloaded)."""
        given = [value for value in (self.url, self.path, self.data) if value is not None]
        if len(given) != 1:
            raise ValueError("Give exactly one of url, path or data.")
        if self.data is not None:
            return self.data
        if self.path is not None:
            return Path(self.path).read_bytes()
        response = httpx.get(self.url, timeout=30.0, follow_redirects=True)
        response.raise_for_status()
        return response.content

    def image_url(self) -> str:
        """The value SAM expects: the public URL, or the file as a base64 data URL."""
        given = [value for value in (self.url, self.path, self.data) if value is not None]
        if len(given) != 1:
            raise ValueError("Give exactly one of url, path or data.")
        if self.url is not None:
            return self.url

        if self.path is not None:
            raw = Path(self.path).read_bytes()
            mime_type = mimetypes.guess_type(str(self.path))[0] or "image/jpeg"
        else:
            raw, mime_type = self.data, self.mime_type
        if len(raw) > MAX_IMAGE_BYTES:
            raise ValueError("Image is too large; resize it first.")
        return f"data:{mime_type};base64,{base64.b64encode(raw).decode('ascii')}"


class SamError(RuntimeError):
    """SAM refused the request or the stream failed."""


class SamClient:
    """Async client for ``sam-3.1``. Use it in an ``async with`` block."""

    def __init__(self, api_key: str, base_url: str | None = None):
        """``api_key`` is the Meta key. Without ``base_url`` the calls go to Meta, or to the Muse proxy on Render when
        MUSE_PROXY_URL is set (then the proxy's shared secret is sent instead of the key; see utils/muse_endpoint.py)."""
        if base_url is None:
            base_url, api_key = muse_endpoint(api_key)
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._http = httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS)

    async def __aenter__(self) -> "SamClient":
        return self

    async def __aexit__(self, *exc_info) -> None:
        await self._http.aclose()

    async def segment(self, concept: str, media: ImageInput) -> ImageSegmentationResult:
        """Find every ``concept`` (a short noun phrase such as "flood water") in the photo."""
        add_sam_request()  # counted against the signed-in user's usage (see src/services/usage_meter.py)
        media_part = {"type": "input_image", "image_url": media.image_url()}
        parser_format = image_segmentation_format()

        body = {
            "model": MODEL,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": concept}, media_part],
                }
            ],
            "stream": True,
            # Confidence lets callers ignore weak matches. Sent as strings, as the API requires.
            "metadata": {"include_confidence": "true", "mask_encoding": "one_bit"},
        }
        parsed = parse_responses_stream(self._stream_events(body), parser_format)
        async for _snapshot in parsed:  # reading to the end is what finishes the parse
            pass
        return await parsed.final_result()

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._api_key}"}

    async def _stream_events(self, body: dict) -> AsyncIterator[dict]:
        """Yield the server-sent events of one ``/responses`` request as dictionaries."""
        headers = {**self._headers(), "Content-Type": "application/json", "Accept": "text/event-stream"}
        async with self._http.stream("POST", f"{self._base_url}/responses", headers=headers, json=body) as response:
            if response.status_code != 200:
                detail = (await response.aread()).decode("utf-8", errors="replace")[:300]
                raise SamError(f"SAM request failed ({response.status_code}): {detail}")
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line.removeprefix("data: ")
                if data == "[DONE]":
                    break
                yield json.loads(data)
