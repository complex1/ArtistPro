FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM python:3.13-slim-bookworm
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 studio
COPY backend ./backend
COPY apps ./apps
COPY scripts/container-entry.py ./container-entry.py
COPY --from=web /app/dist ./dist
RUN mkdir /data && chown studio:studio /data
ENV ARTIST_DATA_ROOT=/data ARTIST_REPO_ROOT=/app PYTHONUNBUFFERED=1
USER studio
EXPOSE 8080 8765
CMD ["python", "container-entry.py"]
