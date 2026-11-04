"""What the page draws over a checked photo, like the SAM playground: a box with a label and confidence for every object SAM
found, and the flood water as a see-through overlay (a box around water would say little).

The result is sent with the assistant's reply as ``annotations``:

    {
        "width": 640, "height": 480,                      # the photo's size as SAM saw it; boxes are in these pixels
        "boxes": [{"label": "person", "confidence": 0.87, "box": [left, top, right, bottom]}, ...],
        "water": {"rows": 144, "columns": 192, "cells": "<base64>"} or None,
    }

``water.cells`` is the flood check's water grid (one cell per few pixels, row by row), one bit per cell, packed with the
first cell in the highest bit of the first byte (numpy's ``packbits``) and base64-encoded: a few kilobytes, not a picture.
"""

import base64

import numpy as np

MAX_BOXES = 60  # a crowded photo can have many matches; more boxes than this would hide the picture


def box_entry(label: str, box: tuple[float, float, float, float], confidence: float | None) -> dict:
    """One box for the page: the name, SAM's confidence (0 to 1, or None when SAM gave none) and its corners in pixels."""
    left, top, right, bottom = box
    return {
        "label": label,
        "confidence": None if confidence is None else round(float(confidence), 3),
        "box": [round(float(left), 1), round(float(top), 1), round(float(right), 1), round(float(bottom), 1)],
    }


def water_overlay(grid: np.ndarray | None) -> dict | None:
    """The water grid packed for the page, or None when there is no water to show."""
    if grid is None or not grid.any():
        return None
    rows, columns = grid.shape
    packed = np.packbits(grid.astype(np.uint8).ravel())
    return {"rows": int(rows), "columns": int(columns), "cells": base64.b64encode(packed.tobytes()).decode("ascii")}


def make_annotations(
    frame_size: tuple[int, int] | None, boxes: list[dict], water_grid: np.ndarray | None = None
) -> dict | None:
    """The annotations for one photo, or None when SAM gave no picture size (then nothing can be placed on it).

    ``boxes`` are ``box_entry`` dicts; the most confident are kept first, up to ``MAX_BOXES``.
    """
    if frame_size is None:
        return None
    width, height = frame_size
    ranked = sorted(boxes, key=lambda entry: entry["confidence"] if entry["confidence"] is not None else 0.0, reverse=True)
    return {"width": int(width), "height": int(height), "boxes": ranked[:MAX_BOXES], "water": water_overlay(water_grid)}
