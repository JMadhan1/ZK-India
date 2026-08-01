# Mirrors backend/Dockerfile exactly. Some hosts (e.g. Render's "New Web
# Service" flow, as opposed to its Blueprint flow) default to a root-level
# `Dockerfile` with the repo root as build context, ignoring render.yaml's
# `dockerfilePath`. Keeping an identical copy here means the backend builds
# correctly either way. If you edit one, edit both — they must stay in sync.
FROM python:3.12-slim

WORKDIR /app

# py_ecc is pure Python, so no build toolchain is needed — keep the image slim.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Only the small, git-tracked verification keys + signal_layout.json are
# needed here — the backend verifies proofs, it never generates them, so the
# large gitignored proving keys (*.zkey, *.ptau) that circuits/keys also
# holds locally are irrelevant to this image and never copied in.
COPY circuits/keys/*_verification_key.json circuits/keys/signal_layout.json circuits/keys/

ENV CIRCUIT_KEYS_DIR=/app/circuits/keys \
    PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
