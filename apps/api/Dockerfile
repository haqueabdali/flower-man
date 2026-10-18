# Flower Man API: production image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t flower-man-api .
# Runs as a non-root user. Configuration comes only from environment variables (.env.production.example).
FROM node:24.7.0-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build:api
# Production dependencies only, for the API and the workspace packages it uses (links stay relative).
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
 && pnpm install --frozen-lockfile --prod --filter "@flower-man/api..."

FROM node:24.7.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages ./packages
COPY --from=build --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /repo/infra/database/migrations ./migrations
WORKDIR /app/apps/api
USER node
EXPOSE 4000
# Migrations: docker run --rm --env-file .env.production flower-man-api node dist/database/migrate.js up --dir /app/migrations
# Owner bootstrap: docker run --rm --env-file .env.production flower-man-api node dist/cli/bootstrap-platform-owner.js
CMD ["node", "dist/main.js"]
