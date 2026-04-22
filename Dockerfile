FROM node:20-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Avoid downloading Puppeteer's bundled Chromium during npm ci; runtime image uses system Chromium.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json ./
COPY package-lock.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM node:20-bookworm-slim AS production

# Chromium for Puppeteer (browser.service); libgomp1 helps @xenova/transformers / onnxruntime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    chromium \
    fonts-liberation \
    libgomp1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/transformers

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/.cache/huggingface /app/.cache/transformers

EXPOSE 3000
CMD ["node", "dist/main"]
