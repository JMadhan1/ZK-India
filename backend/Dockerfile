FROM python:3.12-slim

WORKDIR /app

# py_ecc is pure Python, so no build toolchain is needed — keep the image slim.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Circuit verification keys are mounted at /app/circuits/keys by docker-compose
# (read-only). CIRCUIT_KEYS_DIR points the verifier at them.
ENV CIRCUIT_KEYS_DIR=/app/circuits/keys \
    PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
