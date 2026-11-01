"""Make a video small enough for SAM's answer to be read in seconds instead of minutes.

SAM returns a mask for every frame, and the library that reads the answer decodes each mask in plain Python at about
one microsecond per pixel (a 12 second 1080p clip needed more than ten minutes, and the connection timed out).
Flood water covers large areas, so a small, low-frame-rate copy gives the same answer:

    * at most ``TARGET_WIDTH`` pixels wide (16 times fewer pixels than 1080p), and
    * at most ``TARGET_FPS`` frames per second (a clip of 30 frames per second is cut to 4),
    * without sound.

The copy is a temporary file next to the original; the caller removes it (see ``analyze_flood_media_async``).
If the video cannot be shrunk (no ffmpeg, an unreadable file) the original is used, which is slow but still correct.

Example:
    small = shrink_video(Path("/uploads/clip.mp4"))   # a new .mp4, or the same path when it could not be shrunk
"""

import logging
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

TARGET_WIDTH = 480
TARGET_FPS = 4
SHRINK_TIMEOUT_SECONDS = 600  # a long clip takes a while to read, even though the result is small


def ffmpeg_path() -> str | None:
    """The ffmpeg program that comes with the ``imageio-ffmpeg`` package, or None when it is not installed."""
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def shrink_video(path: Path) -> Path:
    """Write a small copy of the video next to it and return its path. Returns ``path`` itself if that fails."""
    ffmpeg = ffmpeg_path()
    if ffmpeg is None:
        logger.warning("ffmpeg is not available; the video is analysed at its original size, which can be very slow.")
        return path

    small = path.with_name(f"{path.stem}.small.mp4")
    command = [
        ffmpeg, "-y", "-loglevel", "error", "-i", str(path),
        # fps first, so frames that are not needed are dropped before they are scaled; -2 keeps the height even.
        "-vf", f"fps={TARGET_FPS},scale='min({TARGET_WIDTH},iw)':-2",
        "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-pix_fmt", "yuv420p", str(small),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, timeout=SHRINK_TIMEOUT_SECONDS)
    except (subprocess.SubprocessError, OSError) as error:
        detail = error.stderr.decode(errors="replace")[:200] if isinstance(error, subprocess.CalledProcessError) else type(error).__name__
        logger.warning("Could not shrink the video (%s); using the original.", detail)
        small.unlink(missing_ok=True)
        return path
    return small
