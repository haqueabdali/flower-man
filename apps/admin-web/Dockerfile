# Flower Man admin web: production image (Next.js standalone). Build from the repository root:
#   docker build -f apps/admin-web/Dockerfile -t flower-man-admin .
# Server-only setting at runtime: ADMIN_API_URL (https in production).
FROM node:24.7.0-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile && pnpm build:admin

FROM node:24.7.0-alpine
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/admin-web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin-web/.next/static ./apps/admin-web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/admin-web/server.js"]
