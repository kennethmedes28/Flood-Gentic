"""Re-order candidate chunks by reading each one together with the question.

Vector search and BM25 are fast but rough. A cross-encoder reads the question
and a chunk side by side and scores how well the chunk answers it, which is
more accurate (see section 4 of docs/ingestion_details.md).

The model is large, so the library is optional and loaded on first use:

    uv sync --extra rag

Set RERANKER_MODEL=none to skip reranking entirely (cheapest option, and what production uses on a CPU-only host):
candidates then keep their fusion order, and their score becomes a 0..1 confidence worked out from the vector similarity
(``similarity_confidence``), so the same confidence thresholds still mean something.
"""

import math
import os
from dataclasses import replace
from typing import Callable

from src.rag.models import Chunk
from src.rag.retriever import SIMILARITY_KEY

DEFAULT_MODEL = "BAAI/bge-reranker-v2-m3"

_model = None  # loaded once, on first use


def get_cross_encoder():
    """Load the reranking model the first time it is needed."""
    global _model
    if _model is None:
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as error:
            raise RuntimeError(
                "sentence-transformers is not installed. Run: uv sync --extra rag"
            ) from error
        _model = CrossEncoder(os.getenv("RERANKER_MODEL", DEFAULT_MODEL))
    return _model


# Without the reranker the only absolute signal is the vector search's cosine similarity. For the multilingual-e5-large model (which
# squeezes all similarities into roughly 0.70 to 0.88) it was measured on the stored documents:
#     questions the documents answer (go-bag, preparing for a typhoon, relief goods, signal numbers ...)   0.79 to 0.85
#     questions they do not (a joke, cooking rice, a basketball score, the capital of France ...)           0.74 to 0.78
# Rank fusion scores cannot tell these apart (they top out near 0.033 for everything), which is why a fixed threshold on them refused every
# question. The line below maps similarity to a 0..1 confidence: 0.71 -> 0.1 (the "very low confidence" line in
# agents/document_agents.py) and 0.75 -> 0.3 (the "confident enough" line). The line is placed generously on purpose: a weakly related
# question still reaches the chat model, whose prompt makes it say politely that it only helps with floods when the sources do not apply.
SIMILARITY_ZERO_AT = 0.69
SIMILARITY_SLOPE = 5.0
NO_SIMILARITY_CONFIDENCE = 0.2  # a chunk found only by keyword search has no similarity: send the question on to the websites, not to the model


def similarity_confidence(chunk: Chunk) -> float:
    """A 0..1 confidence for a chunk from its vector similarity, for use when the reranker is off."""
    similarity = chunk.metadata.get(SIMILARITY_KEY)
    if similarity is None:
        return NO_SIMILARITY_CONFIDENCE
    return max(0.0, min(1.0, SIMILARITY_SLOPE * (float(similarity) - SIMILARITY_ZERO_AT)))


def _sigmoid(value: float) -> float:
    """Squash a raw model score into 0..1, so a fixed threshold makes sense."""
    value = max(-30.0, min(30.0, float(value)))
    return 1.0 / (1.0 + math.exp(-value))


def score_pairs(query: str, texts: list[str]) -> list[float]:
    """Score how well each text answers the query (0..1, higher is better)."""
    raw_scores = get_cross_encoder().predict([(query, text) for text in texts])
    return [_sigmoid(score) for score in raw_scores]


def rerank(
    query: str,
    chunks: list[Chunk],
    top_n: int = 8,
    scorer: Callable[[str, list[str]], list[float]] | None = None,
) -> list[Chunk]:
    """Return the ``top_n`` chunks that best answer the query, best first.

    ``scorer`` is only passed in by tests; by default the cross-encoder is used.
    """
    if not chunks:
        return []

    if scorer is None and os.getenv("RERANKER_MODEL", "").lower() == "none":
        return [replace(chunk, score=similarity_confidence(chunk)) for chunk in chunks[:top_n]]

    scores = (scorer or score_pairs)(query, [chunk.content for chunk in chunks])
    ranked = sorted(zip(chunks, scores), key=lambda pair: pair[1], reverse=True)
    return [replace(chunk, score=float(score)) for chunk, score in ranked[:top_n]]
