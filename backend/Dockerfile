# Flood-Gentic backend image, for Railway (CPU only: Railway has no GPU).
#
#   docker build -t flood-gentic-backend backend/
#   docker run --rm -p 8000:8000 --env-file backend/.env -e REQUIRE_AUTH=false flood-gentic-backend
#
# Only the packages the running API needs are installed (uv sync --no-dev). torch comes from PyTorch's CPU-only wheels
# (see pyproject.toml), which keeps the image far smaller than the CUDA build.
#
# Models are NOT baked into the image: the embedding model downloads on the first start into HF_HOME, which on Railway is
# the persistent volume mounted at /data, so a new deploy reuses it instead of downloading it again.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH" \
    HF_HOME=/data/huggingface \
    RERANKER_MODEL=none \
    MEDIA_UPLOAD_DIR=/tmp/flood_gentic_uploads

COPY --from=ghcr.io/astral-sh/uv:0.11.10 /uv /usr/local/bin/uv

WORKDIR /app

# The packages first, so this layer is reused when only the code changes.
COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project

COPY . .

EXPOSE 8000

# Railway sets PORT. Behind its proxy the client address is in X-Forwarded-For (set TRUST_PROXY_HEADERS=true there).
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
