FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/agent/package.json apps/agent/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY prisma prisma
RUN npm ci --foreground-scripts --loglevel=info --fetch-retries=1 --fetch-timeout=60000
COPY . .
RUN npm run db:generate && npm run build
USER node
CMD ["node","apps/api/dist/main.js"]
