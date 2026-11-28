FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ARG PYTORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
COPY requirements.txt ./
RUN pip install --no-cache-dir --index-url "${PYTORCH_INDEX_URL}" torch torchvision \
    && pip install --no-cache-dir -r requirements.txt

COPY run.py ./
COPY app/ ./app/
COPY model_code/ ./model_code/
RUN mkdir -p /app/weights

EXPOSE 8000
CMD ["python", "run.py"]
