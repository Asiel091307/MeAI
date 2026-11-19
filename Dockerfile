# Production image for MeAI. Stages: deps -> build, prod-deps, ocr-data -> runner.
ARG NODE_IMAGE=node:20-bookworm-slim

# 1. All dependencies (dev included) to build the app.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2. Production build (`next build`); output goes to .next.
FROM deps AS build
COPY . .
RUN pnpm build

# 3. Runtime dependencies only.
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# 4. OCR language data, so OCR works without network access at runtime.
# tesseract.js 7 (LSTM-only mode) downloads <lang>.traineddata.gz from this CDN path and
# caches it uncompressed as <cachePath>/<lang>.traineddata; we pre-fill that cache.
FROM ${NODE_IMAGE} AS ocr-data
WORKDIR /ocr
RUN node -e "const z=require('node:zlib'),fs=require('node:fs');(async()=>{for(const l of ['spa','eng']){const u='https://cdn.jsdelivr.net/npm/@tesseract.js-data/'+l+'/4.0.0_best_int/'+l+'.traineddata.gz';const r=await fetch(u);if(!r.ok)throw new Error(u+' '+r.status);fs.writeFileSync(l+'.traineddata',z.gunzipSync(Buffer.from(await r.arrayBuffer())))}})().catch(e=>{console.error(e);process.exit(1)})"

# 5. Runtime image: no build tools, non-root user.
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --chown=node:node package.json pnpm-lock.yaml next.config.mjs ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
# Migrations are read from db/migrations (relative to the working directory) at startup.
COPY --chown=node:node db/migrations ./db/migrations
# OCR cache is resolved as .cache/tesseract relative to the working directory.
COPY --chown=node:node --from=ocr-data /ocr ./.cache/tesseract
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
