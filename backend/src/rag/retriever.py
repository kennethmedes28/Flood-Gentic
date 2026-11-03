"""Hybrid search: vector search and BM25 run on the same query, then are fused.

    query -> embed -> vector search (top k) --+
                                              +--> RRF fusion --> candidates
    query -> BM25 search (top k) -------------+

The candidates then go to ``reranking.py`` and ``rules.py``.
"""

from dataclasses import replace
from typing import Callable

from src.rag import vector_store
from src.rag.bm25 import BM25Index
from src.rag.fusion import bm25_weight_for, reciprocal_rank_fusion
from src.rag.models import Chunk, SearchFilter

SIMILARITY_KEY = "vector_similarity"  # metadata key: the vector search's cosine similarity of a chunk to the question (0 to 1)

DEFAULT_K_EACH = 30  # results taken from each search
DEFAULT_K_FUSED = 40  # candidates passed on to the reranker


class HybridRetriever:
    """Finds candidate chunks for a question using vector search plus BM25."""

    def __init__(self, conn, embed_query: Callable[[str], list[float]], bm25_index: BM25Index):
        """
        Args:
            conn: open psycopg connection to the database holding the chunks.
            embed_query: turns a question into an embedding (see ``embeddings.py``).
            bm25_index: keyword index; rebuild it after each ingestion run.
        """
        self.conn = conn
        self.embed_query = embed_query
        self.bm25_index = bm25_index

    @classmethod
    def from_database(cls, conn, embed_query: Callable[[str], list[float]]) -> "HybridRetriever":
        """Build the BM25 index from the chunks currently stored in the database."""
        return cls(conn, embed_query, BM25Index(vector_store.load_all_chunks(conn)))

    def search(
        self,
        query: str,
        search_filter: SearchFilter | None = None,
        k_each: int = DEFAULT_K_EACH,
        k_fused: int = DEFAULT_K_FUSED,
    ) -> list[Chunk]:
        """Return up to ``k_fused`` candidate chunks, best first."""
        dense_results = vector_store.search_dense(
            self.conn, self.embed_query(query), k_each, search_filter
        )
        keyword_results = self.bm25_index.search(query, k_each, search_filter)

        fused = reciprocal_rank_fusion(
            [dense_results, keyword_results],
            weights=[1.0, bm25_weight_for(query)],
            top_n=k_fused,
        )
        # The fusion score only says how the ranks agree. Keep the vector search's cosine similarity as well: it is an absolute
        # measure of how close a chunk is to the question, which ``rerank`` needs when the reranker is off.
        similarity = {chunk.id: chunk.score for chunk in dense_results}
        return [
            replace(chunk, metadata={**chunk.metadata, SIMILARITY_KEY: similarity[chunk.id]}) if chunk.id in similarity else chunk
            for chunk in fused
        ]
