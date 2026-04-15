FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk update && apk upgrade && \
    apk add --no-cache libc6-compat && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM base AS builder
WORKDIR /app
COPY . .

# Bake version info at build time
ARG GIT_HASH=unknown
ARG GIT_DATE=unknown
ARG GIT_BRANCH=main
ARG APP_VERSION=0.0.0
RUN echo "{\"version\":\"${APP_VERSION}\",\"commitHash\":\"${GIT_HASH}\",\"commitDate\":\"${GIT_DATE}\",\"branch\":\"${GIT_BRANCH}\"}" > version.json

RUN pnpm dlx turbo@latest prune --scope=@wacrm/api --docker

FROM base AS installer
WORKDIR /app

# Copy pruned workspace
COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Copy pruned source and build
COPY --from=builder /app/out/full/ .
COPY --from=builder /app/version.json ./version.json
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm db:generate
RUN pnpm turbo build --filter=@wacrm/api

FROM node:22-alpine AS runner
RUN apk update && apk upgrade && \
    apk add --no-cache libc6-compat git docker-cli docker-cli-compose curl bash
WORKDIR /app

RUN npm install -g prisma@7.7.0

COPY --from=installer /app ./
# Run as root — the update system needs docker.sock + git write access,
# and docker.sock access is root-equivalent anyway (no security benefit
# from dropping privileges when the socket is mounted).
EXPOSE 3000
CMD ["node", "apps/api/dist/apps/api/src/main.js"]
