FROM node:20-alpine AS builder
WORKDIR /app
RUN mkdir -p apps/api/dist
RUN echo "console.log('hello')" > apps/api/dist/main.js

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
RUN ls -la dist/
