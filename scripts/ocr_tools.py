"""OCR helpers for the NDRRMC IRR re-ingestion notebook (notebooks/ingestion/ndrrmc_irr_reingest.ipynb).

Two readers are used, and their texts are merged:

    tesseract   the reader the ingestion pipeline uses today (backend/src/rag/loaders.py), here run on the
                page with the stamp removed
    got_ocr     GOT-OCR-2.0, a small OCR model (stepfun-ai/GOT-OCR-2.0-hf, 560M parameters, runs on the GPU),
                run on the original page in bands

Neither is best everywhere. Tesseract is steady but stumbles where the stamp touches text; GOT-OCR reads text under
the stamp well but sometimes drops a line. ``vote_readings`` aligns the two texts word by word and, where they
differ, keeps the version made of words found in a dictionary built from other documents of the corpus.

The scan has a blue "CERTIFIED TRUE COPY" stamp printed over the black text, on a yellow page.
``remove_colour_ink`` paints every coloured pixel (the stamp, logos) in the paper's colour before
reading, so the stamp no longer hides words.

GOT-OCR squeezes every image into a 1024 x 1024 square. A whole A4 page is squashed far more in height
than in width, which makes the text tiny and distorted: words split apart ("pri or it iz ation") and a dense
page can come out as junk. So each page is cut into horizontal bands at the blank gaps between paragraphs,
every band is padded to a square (no distortion), and the bands are read one by one (``GotOcr.read_page``).

Results are cached next to the notebook, in ``notebooks/ingestion/_cache/ocr_results.json`` (key
``"<reader>:<page>"``), so re-running the notebook does not repeat the slow GPU step. Run this file directly
to fill the cache:

    cd backend && uv run python ../scripts/ocr_tools.py
"""

import io
import json
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image

SCRIPTS_DIR = Path(__file__).resolve().parent
REPO_DIR = SCRIPTS_DIR.parent
NOTEBOOK_DIR = REPO_DIR / "notebooks" / "ingestion"  # the notebook keeps its cache and backup in _cache/ here
PDF_PATH = REPO_DIR / "corpus" / "20260914-NDRRMC-IRR-RA12287.pdf"
CACHE_FILE = NOTEBOOK_DIR / "_cache" / "ocr_results.json"

RENDER_DPI = 200
GOT_MODEL = "stepfun-ai/GOT-OCR-2.0-hf"
GOT_MAX_NEW_TOKENS = 4096  # a dense page is about 1,000 tokens

BAND_HEIGHT = 800  # pixels at 200 dpi: about a third of an A4 page (roughly 20 lines of text)

# Pixels whose strongest and weakest colour channel differ by more than this are ink or print in a
# colour (the blue stamp, the logos). Black text and its grey edges are well below it.
CHROMA_LIMIT = 45


def render_page(pdf: pymupdf.Document, page_number: int, dpi: int = RENDER_DPI) -> Image.Image:
    """Draw one PDF page as an image."""
    return Image.open(io.BytesIO(pdf[page_number].get_pixmap(dpi=dpi).tobytes("png"))).convert("RGB")


def remove_colour_ink(image: Image.Image, chroma_limit: int = CHROMA_LIMIT) -> Image.Image:
    """Paint coloured pixels (stamps, logos) in the paper's colour. Black text and its grey edges are not touched."""
    rgb = np.asarray(image.convert("RGB")).astype(np.int16)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    paper_colour = np.median(rgb.reshape(-1, 3), axis=0)  # the yellow of the paper
    cleaned = rgb.copy()
    cleaned[chroma > chroma_limit] = paper_colour
    return Image.fromarray(cleaned.astype(np.uint8))


def split_into_bands(image: Image.Image, target_height: int = BAND_HEIGHT) -> list[Image.Image]:
    """Cut a page into horizontal bands of about ``target_height`` pixels, cutting only in blank gaps between lines.

    A cut is made in the blank row nearest the target height (but not above 60 % of it). If a stretch has no blank
    row at all, it is cut at the target height.
    """
    gray = np.asarray(image.convert("L"))
    ink_per_row = (gray < 140).sum(axis=1)
    blank_rows = ink_per_row <= 1

    bands, top, height = [], 0, gray.shape[0]
    while top < height:
        if height - top <= target_height * 1.15:
            bands.append(image.crop((0, top, image.width, height)))
            break
        window = np.arange(top + int(target_height * 0.6), top + target_height)
        blanks = window[blank_rows[window]]
        cut = int(blanks.max()) if len(blanks) else top + target_height
        bands.append(image.crop((0, top, image.width, cut)))
        top = cut
    return [band for band in bands if (np.asarray(band.convert("L")) < 140).sum() > 50]  # skip empty bands


def pad_to_square(image: Image.Image) -> Image.Image:
    """Put the image on a white square, so the model's squeeze to a square does not distort the text."""
    side = max(image.size)
    square = Image.new("RGB", (side, side), "white")
    square.paste(image.convert("RGB"), (0, 0))
    return square


def tesseract_read(image: Image.Image) -> str:
    """Read an image with the Tesseract program (the same call the ingestion pipeline makes)."""
    with tempfile.TemporaryDirectory() as folder:
        image_path = Path(folder) / "page.png"
        image.save(image_path)
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "-l", "eng"], capture_output=True, text=True, check=True
        )
    return result.stdout


class GotOcr:
    """GOT-OCR-2.0 loaded on the GPU the first time it is used."""

    def __init__(self):
        self.model = None
        self.processor = None

    def load(self) -> None:
        import torch
        from transformers import AutoModelForImageTextToText, AutoProcessor

        self.model = AutoModelForImageTextToText.from_pretrained(GOT_MODEL, device_map="cuda", dtype=torch.bfloat16)
        self.processor = AutoProcessor.from_pretrained(GOT_MODEL)

    def read(self, image: Image.Image) -> str:
        """Plain-text OCR of one page image."""
        import torch

        if self.model is None:
            self.load()
        inputs = self.processor(image.convert("RGB"), return_tensors="pt").to("cuda", torch.bfloat16)
        with torch.no_grad():
            generated = self.model.generate(
                **inputs,
                do_sample=False,
                tokenizer=self.processor.tokenizer,
                stop_strings="<|im_end|>",
                max_new_tokens=GOT_MAX_NEW_TOKENS,
            )
        return self.processor.decode(generated[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    def read_page(self, image: Image.Image) -> str:
        """Read a whole page: it is cut into bands, each band is padded to a square and read, and the texts are joined."""
        return "\n".join(self.read(pad_to_square(band)).strip() for band in split_into_bands(image))

    def free(self) -> None:
        """Give the GPU memory back (the embedding model needs it later)."""
        import gc

        import torch

        self.model = self.processor = None
        gc.collect()
        torch.cuda.empty_cache()


# ---------------------------------------------------------------- scoring against hand-checked text

# Text typed out by reading the page images (page number starting at 1). "start" and "end" are patterns that mark
# where the matching part of an OCR text begins and ends; everything the reader printed in between counts, including
# stamp words, because stamp noise is a real error. Three pages are checked: page 1 (the stamp covers sentences b. and c.),
# page 16 (the stamp covers Section 3) and page 17 (the signature block).
REFERENCES = {
    1: {
        "start": r"implementing\s+rules\s+and\s+regulations\s+of\s+republic",
        "end": r"page\s*1\s*of",
        "text": """
IMPLEMENTING RULES AND REGULATIONS OF REPUBLIC ACT NO. 12287 OR THE "DECLARATION OF STATE OF IMMINENT DISASTER ACT"
RULE I GENERAL PROVISIONS
Section 1. Title. These Rules and Regulations shall be known and cited as the "Implementing Rules and Regulations (IRR) of Republic Act (R.A.) No. 12287, otherwise known as the Declaration of State of Imminent Disaster Act."
Section 2. Purpose. These Rules are hereby promulgated and adopted to prescribe the manner, procedures, and guidelines for the implementation of R.A. No. 12287, approved on September 12, 2025, to achieve its intentions and objectives.
Section 3. Declaration of Policy. This IRR adheres to the policy of the State to uphold the constitutional right of the people to the protection of their life and property and the promotion of the general welfare. Towards this end, the State shall establish a mechanism that enables the government to implement anticipatory action measures based on forecasts and risk assessments, thereby empowering communities to take early action to protect lives and livelihoods before disasters strike.
Section 4. Construction and Interpretation. This IRR shall be construed and interpreted liberally in the context of the Declaration of Policy under Section 2 of R.A. NO. 12287. Any doubt in the interpretation of this IRR shall be resolved in a manner consistent with the said policy and the promotion of general welfare.
Section 5. Definition of Terms
a. Anticipatory Actions refer to actions taken to reduce the adverse humanitarian and other impacts of a forecasted hazard before it occurs, or before its most acute impacts are felt;
b. Cascading Hazards refer to hazards with a systematic causal relationship and expressed in a sequence of secondary events in natural and human systems that lead to physical, environmental, societal, or economic disruption;
c. Catastrophic Event refers to any natural phenomenon or occurrence, which, by reason of its magnitude, severity, or scope, produces substantial and adverse effects upon ecological systems and human communities, and which is reasonably anticipated to result in widespread disruption, systematic failure of
""",
    },
    16: {
        "start": r"rule\s+vii\b",
        "end": r"page\s*16\s*of",
        "text": """
RULE VII CAPACITY DEVELOPMENT
The NDRRMC shall develop and implement a capacity development program for the concerned agencies and organizations under this IRR.
For this purpose, the National AA TWG shall lead and coordinate the implementation of the capacity development activities under this IRR.
All concerned NGAs, LGUs, CSOs, basic sectors, and other relevant stakeholders shall actively participate in the development of capacity development initiatives. These entities shall designate focal persons and allocate resources, as necessary, to support the implementation of the program within their respective jurisdictions.
Social preparation measures, such as, but not limited to, community-based early warning systems and early action mechanisms, shall likewise be considered in the design and implementation of capacity development initiatives.
RULE VIII FINAL AND TRANSITORY PROVISIONS
Section 1. Transitory Arrangements for Ongoing Declarations. All declarations and actions issued prior to the effectivity of this IRR shall remain in force until completed or duly amended. Ongoing programs and activities shall be aligned with the provisions of this IRR within a designated transition period, during which concerned agencies and LGUs shall undertake the necessary administrative and operational adjustments to ensure compliance.
Section 2. Review of the IRR. A review of the Implementing Rules and Regulations (IRR) shall be conducted three (3) years after its effectivity to assess its effectiveness, practicality, and coherence with the provisions of the law. The review shall utilize the learning, evidence, and evaluation results generated during the implementation period.
Based on the findings of the review, the IRR may be amended or updated as necessary, upon the recommendation of the National AA TWG and endorsement by the NDRRMC for approval through the prescribed process.
Section 3. Separability Clause. If any provision of this IRR is declared unconstitutional by a tribunal of competent authority, the remainder thereof not otherwise affected shall remain in full force and effect.
""",
    },
    17: {
        "start": r"section\s+4\.?\s+repealing",
        "end": r"department\s+of\s+national\s+defense",
        "text": """
Section 4. Repealing Clause. All administrative issuances by the NDRRMC member-agencies that are inconsistent with the provisions of this IRR are hereby repealed, amended, or modified accordingly.
Section 5. Effectivity. This Act shall take effect immediately following its publication in the Official Gazette or any newspaper of general circulation in the Philippines and filing with the UP Office of the National Administrative Register.
GILBERTO C. TEODORO, JR. Chairperson, NDRRMC and Secretary, Department of National Defense
""",
    },
}


def normalise_unicode(text):
    """Turn ligature characters back into letters ("ﬁ" -> "fi", "ﬃ" -> "ffi") and fullwidth forms into plain ones.

    GOT-OCR prints the ligatures a font uses; a search for "office" would never match "oﬃce".
    """
    return unicodedata.normalize("NFKC", text)


def to_words(text):
    """Lower-case words and numbers only: punctuation and line breaks do not count as errors."""
    return re.findall(r"[a-z0-9]+", normalise_unicode(text).lower())


def edit_distance(reference, hypothesis):
    """Smallest number of insertions, deletions and replacements that turns one sequence into the other."""
    previous = list(range(len(hypothesis) + 1))
    for i, ref_item in enumerate(reference, start=1):
        current = [i]
        for j, hyp_item in enumerate(hypothesis, start=1):
            cost = 0 if ref_item == hyp_item else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1]


def compared_part(page_number, ocr_text):
    """The part of an OCR text that matches the reference: from its start marker to its end marker."""
    markers = REFERENCES[page_number]
    start = re.search(markers["start"], ocr_text, re.I)
    begin = start.start() if start else 0
    end = re.search(markers["end"], ocr_text[begin:], re.I)
    return ocr_text[begin : begin + end.end()] if end else ocr_text[begin:]


def score(page_number, ocr_text):
    """Return (WER, CER) in percent of an OCR text against the reference of that page."""
    reference_words = to_words(REFERENCES[page_number]["text"])
    hypothesis_words = to_words(compared_part(page_number, ocr_text))
    reference_chars, hypothesis_chars = " ".join(reference_words), " ".join(hypothesis_words)
    wer = edit_distance(reference_words, hypothesis_words) / len(reference_words)
    cer = edit_distance(reference_chars, hypothesis_chars) / len(reference_chars)
    return round(100 * wer, 1), round(100 * cer, 1)


# ---------------------------------------------------------------- combining the two readers

VOCABULARY_FILE = NOTEBOOK_DIR / "_cache" / "vocabulary.json"
VOCABULARY_SOURCES = ("MMFMP.pdf", "DISASTER PREPAREDNESS MANUAL.pdf")  # clean text-layer PDFs of the corpus


def load_vocabulary() -> set[str]:
    """Words of two clean, text-layer PDFs of the corpus: a rough dictionary of the words a flood document uses.

    The scanned document itself is NOT used, so its own (possibly misread) words cannot vouch for themselves.
    """
    if VOCABULARY_FILE.exists():
        return set(json.loads(VOCABULARY_FILE.read_text()))
    from pypdf import PdfReader

    vocabulary = set()
    for name in VOCABULARY_SOURCES:
        for page in PdfReader(str(REPO_DIR / "corpus" / name)).pages:
            vocabulary.update(to_words(page.extract_text() or ""))
    VOCABULARY_FILE.parent.mkdir(exist_ok=True)
    VOCABULARY_FILE.write_text(json.dumps(sorted(vocabulary)))
    return vocabulary


MAX_LENGTH_RATIO = 1.4  # GOT-OCR text more than 1.4 times as long as Tesseract's is repeating itself


def looks_like_a_loop(text_a: str, text_b: str, max_ratio: float = MAX_LENGTH_RATIO) -> bool:
    """True when reading B has far more words than reading A.

    GOT-OCR sometimes gets stuck and prints the same passage again and again (on page 9 it printed 2,500 words
    for a page of 330). The repeated words are real words, so no dictionary check catches it; only the length does.
    """
    return len(text_b.split()) > max_ratio * max(len(text_a.split()), 1)


def vote_readings(text_a: str, text_b: str, vocabulary: set[str], min_known_for_insert: float = 0.8) -> str:
    """Merge two readings of one page: ``text_a`` is the steadier reader (Tesseract), ``text_b`` the other (GOT-OCR).

    The words are aligned. Then, block by block:

        same in both                  keep it
        only in A                     keep it (A rarely invents text)
        only in B                     keep it only if at least 80 % of its words are in the dictionary,
                                      so a line GOT-OCR found and Tesseract missed is added, but junk is not
        different words in A and B    keep the one with more dictionary words; on a tie keep A

    If B looks like a loop (``looks_like_a_loop``), only A is used. The text is returned on one line
    (line breaks are not kept).
    """
    import difflib

    if looks_like_a_loop(text_a, text_b):
        return " ".join(normalise_unicode(text_a).split())

    def key(token):
        return "".join(to_words(token))

    def known_share(tokens):
        return sum(key(token) in vocabulary for token in tokens) / max(len(tokens), 1)

    a, b = normalise_unicode(text_a).split(), normalise_unicode(text_b).split()
    merged = []
    matcher = difflib.SequenceMatcher(a=[key(t) for t in a], b=[key(t) for t in b], autojunk=False)
    for opcode, a1, a2, b1, b2 in matcher.get_opcodes():
        piece_a, piece_b = a[a1:a2], b[b1:b2]
        if opcode in ("equal", "delete"):
            merged += piece_a
        elif opcode == "insert":
            merged += piece_b if known_share(piece_b) >= min_known_for_insert else []
        else:
            merged += piece_b if known_share(piece_b) > known_share(piece_a) else piece_a
    return " ".join(merged)


# ---------------------------------------------------------------- cache


def load_cache() -> dict:
    return json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}


def save_cache(cache: dict) -> None:
    CACHE_FILE.parent.mkdir(exist_ok=True)
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")


def cached_read(cache: dict, reader: str, page_number: int, read_function) -> str:
    """Return the cached text of ``reader`` for a page, or read it now and remember it."""
    key = f"{reader}:{page_number}"
    if key not in cache:
        started = time.time()
        cache[key] = read_function()
        save_cache(cache)
        print(f"  {key}: {len(cache[key])} characters in {time.time() - started:.0f}s", flush=True)
    return cache[key]


READERS = ("tesseract_raw", "tesseract_clean", "got_bands_raw")


def read_all_pages(readers: tuple[str, ...] = READERS, pages: range | None = None) -> dict:
    """Fill the cache for every page.

    tesseract_raw     the current pipeline (original page)
    tesseract_clean   Tesseract on the page with the stamp removed
    got_bands_raw     GOT-OCR on the original page, read in bands
    """
    sys.path.insert(0, str(REPO_DIR / "backend"))
    from src.rag.loaders import ocr_pdf_page

    cache, got, pdf = load_cache(), GotOcr(), pymupdf.open(str(PDF_PATH))
    functions = {
        "tesseract_raw": lambda n: ocr_pdf_page(PDF_PATH, n),
        "tesseract_clean": lambda n: tesseract_read(remove_colour_ink(render_page(pdf, n))),
        "got_bands_raw": lambda n: got.read_page(render_page(pdf, n)),
    }
    for page_number in pages or range(len(pdf)):
        for reader in readers:
            cached_read(cache, reader, page_number, lambda: functions[reader](page_number))
    got.free()
    return cache


if __name__ == "__main__":
    read_all_pages()
    print("done")
