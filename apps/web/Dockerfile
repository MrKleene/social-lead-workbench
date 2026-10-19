FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY . .
RUN npm ci --foreground-scripts --loglevel=info --fetch-retries=1 --fetch-timeout=60000 && npm run build -w @crm/web
FROM nginx:1.28-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
