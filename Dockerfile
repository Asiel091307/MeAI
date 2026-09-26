FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack pnpm install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["corepack", "pnpm", "dev", "-H", "0.0.0.0"]
