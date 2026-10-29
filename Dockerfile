# Toolchain for building the site and running tests: Python, headless Chromium, pngquant.
# Used by the justfile and by CI, nothing from here is deployed.
FROM python:3.13-slim-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-core fonts-noto-color-emoji pngquant \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium \
    HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app
