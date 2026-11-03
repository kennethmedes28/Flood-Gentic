"""Tests for how confident the document search is when the reranker is off (what production uses on a CPU-only host).

The bug these guard against: with the reranker off, chunks kept their rank-fusion scores (at most about 0.033), which are far below the
confidence thresholds written for reranker scores (0 to 1), so every question got the fixed "I could not find a reliable answer" reply.

Run from the backend folder:  python -m unittest tests.test_rag_confidence -v
"""

import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.modules.setdefault("bm25s", types.ModuleType("bm25s"))  # optional search library, not needed here

from agents import document_agents
from prompts.document_prompt import DOCUMENT_SYSTEM_PROMPT
from src.rag import vector_store
from src.rag.models import Chunk
from src.rag.reranking import NO_SIMILARITY_CONFIDENCE, rerank, similarity_confidence
from src.rag.retriever import SIMILARITY_KEY, HybridRetriever


def chunk(chunk_idx: int, similarity: float | None, score: float = 0.03, content: str = "Pack food, water and a flashlight.") -> Chunk:
    metadata = {"hazard": "flood", "trust_tier": "official"}
    if similarity is not None:
        metadata[SIMILARITY_KEY] = similarity
    return Chunk(doc_id="manual", chunk_idx=chunk_idx, content=content, metadata=metadata, score=score)


class FakeBM25:
    def __init__(self, results):
        self.results = results

    def search(self, query, k, search_filter):
        return self.results


class SimilarityConfidenceTests(unittest.TestCase):
    def test_the_measured_similarity_ranges_map_to_the_right_side_of_the_thresholds(self):
        # Measured with multilingual-e5-large: relevant questions 0.79 to 0.85.
        for similarity in (0.79, 0.80, 0.85):
            self.assertGreaterEqual(similarity_confidence(chunk(0, similarity)), document_agents.LOW_CONFIDENCE_SCORE)
        # A nearly unrelated match is below the "very low" line.
        self.assertLess(similarity_confidence(chunk(0, 0.70)), document_agents.VERY_LOW_CONFIDENCE_SCORE)

    def test_it_stays_between_zero_and_one(self):
        self.assertEqual(similarity_confidence(chunk(0, 0.2)), 0.0)
        self.assertEqual(similarity_confidence(chunk(0, 1.0)), 1.0)

    def test_a_chunk_found_only_by_keyword_search_goes_to_the_websites_not_the_model(self):
        confidence = similarity_confidence(chunk(0, None))
        self.assertEqual(confidence, NO_SIMILARITY_CONFIDENCE)
        self.assertTrue(document_agents.VERY_LOW_CONFIDENCE_SCORE < confidence < document_agents.LOW_CONFIDENCE_SCORE)


class RerankerOffTests(unittest.TestCase):
    def test_with_the_reranker_off_the_score_is_the_confidence_and_the_order_is_kept(self):
        chunks = [chunk(0, 0.82, score=0.032), chunk(1, 0.76, score=0.031), chunk(2, 0.71, score=0.016)]
        with mock.patch.dict(os.environ, {"RERANKER_MODEL": "none"}):
            result = rerank("go bag", chunks, top_n=2)
        self.assertEqual([c.chunk_idx for c in result], [0, 1])
        self.assertAlmostEqual(result[0].score, similarity_confidence(chunks[0]))
        self.assertGreater(result[0].score, 0.3)  # the old fusion score (0.032) would have been refused


class RetrieverKeepsSimilarityTests(unittest.TestCase):
    def test_search_keeps_the_vector_similarity_of_each_chunk(self):
        dense = [chunk(0, None, score=0.83), chunk(1, None, score=0.78)]  # the vector search returns cosine similarity as the score
        retriever = HybridRetriever(conn=object(), embed_query=lambda q: [0.0], bm25_index=FakeBM25([chunk(2, None, score=5.0)]))
        with mock.patch.object(vector_store, "search_dense", return_value=dense):
            found = retriever.search("what to pack")
        by_index = {c.chunk_idx: c for c in found}
        self.assertAlmostEqual(by_index[0].metadata[SIMILARITY_KEY], 0.83)
        self.assertAlmostEqual(by_index[1].metadata[SIMILARITY_KEY], 0.78)
        self.assertNotIn(SIMILARITY_KEY, by_index[2].metadata)  # found by keywords only


class DocumentAgentWithoutRerankerTests(unittest.TestCase):
    """The end-to-end regression: a relevant question must reach the chat model, not the fixed refusal."""

    def setUp(self):
        document_agents.answer_cache.clear()
        for patcher in (
            mock.patch.dict(os.environ, {"RERANKER_MODEL": "none"}),
            mock.patch.object(document_agents.model_budget, "try_use", return_value=True),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def run_agent(self, similarity):
        retriever = SimpleNamespace(search=lambda question, search_filter=None: [chunk(0, similarity, score=0.0325)])
        seen = {}

        class FakeChain:
            def __or__(self, other):
                return self

            def invoke(self, values):
                seen["sources"] = values["sources"]
                return "Pack food, water and a flashlight. [1]"

        with mock.patch.object(document_agents, "DOCUMENT_PROMPT", FakeChain()), mock.patch.object(document_agents, "StrOutputParser", lambda: FakeChain()):
            return document_agents.answer_document_question("What should I pack in a go-bag?", llm=FakeChain(), retriever=retriever), seen

    def test_a_relevant_question_is_answered_from_the_documents(self):
        reply, seen = self.run_agent(similarity=0.80)
        self.assertFalse(reply.safe_answer)
        self.assertIn("Pack food", reply.text)
        self.assertIn("flashlight", seen["sources"])

    def test_a_clearly_unrelated_match_still_gets_the_fixed_safe_answer(self):
        reply, _ = self.run_agent(similarity=0.70)
        self.assertTrue(reply.safe_answer)


class PromptTests(unittest.TestCase):
    def test_general_preparedness_advice_is_allowed_but_labelled(self):
        self.assertIn("General guidance (not from the official documents):", DOCUMENT_SYSTEM_PROMPT)
        self.assertIn("go-bag", DOCUMENT_SYSTEM_PROMPT)

    def test_time_sensitive_and_official_facts_stay_strictly_sourced(self):
        self.assertIn("Never answer from memory about anything that is time-sensitive", DOCUMENT_SYSTEM_PROMPT)
        for item in ("warnings and", "evacuation orders", "phone numbers"):
            self.assertIn(item, DOCUMENT_SYSTEM_PROMPT)


if __name__ == "__main__":
    unittest.main()
