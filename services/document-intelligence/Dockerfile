FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOME=/home/terraqo \
    HF_HOME=/home/terraqo/.cache/huggingface
WORKDIR /service

RUN addgroup --system terraqo \
    && adduser --system --ingroup terraqo --home /home/terraqo terraqo \
    && mkdir -p /home/terraqo/.cache/huggingface \
    && chown -R terraqo:terraqo /home/terraqo
COPY requirements.txt .
# Docling only needs CPU inference in this worker. Install the explicit CPU
# wheels first so pip cannot pull multi-gigabyte CUDA runtimes into the image;
# Ollama remains responsible for accelerated language-model inference.
RUN pip install --no-cache-dir \
      --index-url https://download.pytorch.org/whl/cpu \
      torch==2.5.1 torchvision==0.20.1 \
    && pip install --no-cache-dir -r requirements.txt
RUN apt-get update \
    && apt-get install --no-install-recommends --yes antiword \
    && rm -rf /var/lib/apt/lists/*
COPY app ./app
USER terraqo

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--no-access-log"]
