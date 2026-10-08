# syntax=docker/dockerfile:1

# Build stage: install the pnpm workspace, build contracts + API, generate Prisma client.
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @opsdesk/contracts build \
  && pnpm --filter @opsdesk/api exec prisma generate \
  && pnpm --filter @opsdesk/api build

# Runtime stage: full workspace with generated client; start the API or worker.
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
