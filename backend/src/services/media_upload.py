"""Save a photo sent with a chat message so the flood media check can read it, and remove it afterwards.

The browser sends the picture as base64 text inside the JSON body. It is checked here before anything uses it:

    * the text must be valid base64 and decode to at most ``MAX_IMAGE_BYTES``;
    * the first bytes must really be a JPEG, PNG or WebP picture (what the client claims is not trusted);
    * it is saved under a random name in the one folder the chat graph may read media from
      (``langgraph_orchestrator.graph.media_upload_dir``), so a user cannot point the check at another file.

The file only lives while the question is answered: ``delete_quietly`` removes it, and it is never kept in the conversation.
"""

import base64
import binascii
import logging
import os
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

from langgraph_orchestrator.graph import media_upload_dir

logger = logging.getLogger(__name__)

MAX_IMAGE_BYTES = 2_000_000  # the page sends a picture scaled to 640 px wide, which is far smaller
# base64 text is 4 characters for every 3 bytes; this is the longest text that can decode to MAX_IMAGE_BYTES.
MAX_IMAGE_BASE64_CHARS = 4 * ((MAX_IMAGE_BYTES + 2) // 3)

NOT_A_PICTURE = "That file is not a photo I can read. Please send a JPEG, PNG or WebP picture."
TOO_LARGE = "That picture is too large. Please send a smaller one."


class BadImage(ValueError):
    """The picture is not usable. The message is safe and friendly to show to the user."""


def picture_extension(data: bytes) -> str | None:
    """".jpg", ".png" or ".webp" from the first bytes of the data, or None when it is none of them."""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def save_base64_image(text: str) -> Path:
    """Decode and check the picture, save it in the upload folder and return its path. Raises ``BadImage``."""
    try:
        data = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        raise BadImage(NOT_A_PICTURE)
    if len(data) > MAX_IMAGE_BYTES:
        raise BadImage(TOO_LARGE)
    extension = picture_extension(data)
    if extension is None:
        raise BadImage(NOT_A_PICTURE)

    folder = media_upload_dir()
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{uuid4().hex}{extension}"
    # Only this server's user may read it: 0o600 from the start, not changed after writing.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as file:
        file.write(data)
    return path


def delete_quietly(path: Path | None) -> None:
    """Remove a saved picture. A failure is logged and never raised, so it cannot hide the answer."""
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError as error:
        logger.warning("Could not remove an uploaded picture: %s", error)


# ---------------------------------------------------------------- videos
#
# A video is too big for base64 inside JSON, so it is sent as the request body itself (see POST /chat/stream/video) and
# written to disk piece by piece. It is checked the same way as a photo: the first bytes must be a real video, and it is
# saved under a random name in the one folder the chat graph may read media from.

MAX_VIDEO_BYTES = 200 * 1024 * 1024  # generous on purpose: SAM can analyse a long video, and the limit only protects the disk

NOT_A_VIDEO = "That file is not a video I can read. Please send an MP4, MOV or WebM video."
VIDEO_TOO_LARGE = "That video is too large. Please send one under 200 MB."


class BadVideo(ValueError):
    """The video is not usable. The message is safe and friendly to show to the user."""


class VideoTooLarge(BadVideo):
    """The video is over ``MAX_VIDEO_BYTES``."""


def video_extension(head: bytes) -> str | None:
    """".mp4", ".mov" or ".webm" from the first bytes of the data, or None when it is none of them."""
    if head[4:8] == b"ftyp":  # MP4 and QuickTime files both start with a "ftyp" box; the brand tells them apart
        return ".mov" if head[8:12] == b"qt  " else ".mp4"
    if head.startswith(b"\x1a\x45\xdf\xa3"):  # the EBML header of WebM (and Matroska)
        return ".webm"
    return None


async def save_video_stream(chunks: AsyncIterator[bytes]) -> Path:
    """Write the video to the upload folder piece by piece and return its path. Raises ``BadVideo``.

    Nothing is kept in memory beyond one piece. The type is checked on the first bytes, so a wrong file is refused
    before it is saved, and a file that grows past ``MAX_VIDEO_BYTES`` is cut off and removed.
    """
    folder = media_upload_dir()
    folder.mkdir(parents=True, exist_ok=True)

    head = b""
    path: Path | None = None
    file = None
    total = 0
    try:
        async for chunk in chunks:
            total += len(chunk)
            if total > MAX_VIDEO_BYTES:
                raise VideoTooLarge(VIDEO_TOO_LARGE)
            if file is None:
                head += chunk
                if len(head) < 12:
                    continue  # the type needs the first 12 bytes; wait for more
                extension = video_extension(head)
                if extension is None:
                    raise BadVideo(NOT_A_VIDEO)
                path = folder / f"{uuid4().hex}{extension}"
                # Only this server's user may read it: 0o600 from the start, not changed after writing.
                file = os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb")
                file.write(head)
            else:
                file.write(chunk)
        if file is None:
            raise BadVideo(NOT_A_VIDEO)  # an empty body, or fewer than 12 bytes
    except BaseException:
        if file is not None:
            file.close()
            file = None
        delete_quietly(path)
        raise
    finally:
        if file is not None:
            file.close()
    return path
