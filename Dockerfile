# syntax=docker/dockerfile:1.7
# Toiletpaper web — Next.js 15 pnpm monorepo build
# Build context: ~/repos/donto (parent of toiletpaper/ and donto/)

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app/toiletpaper

# Copy the donto client that toiletpaper references via file:
COPY donto/packages/donto-client /app/donto/packages/donto-client

# Copy full toiletpaper source
COPY toiletpaper/ .

RUN pnpm install --frozen-lockfile || pnpm install --no-frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm --filter @toiletpaper/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup -g 1001 -S app && adduser -S app -u 1001

# Claude CLI for OAuth-based simulation codegen
RUN npm install -g @anthropic-ai/claude-code

COPY --from=build /app/toiletpaper/apps/web/.next/standalone ./
COPY --from=build /app/toiletpaper/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/toiletpaper/apps/web/public ./apps/web/public 2>/dev/null || true

USER app
RUN mkdir -p /home/app/.claude
EXPOSE 3001
CMD sh -c 'if [ -n "$CLAUDE_CREDENTIALS" ]; then echo "$CLAUDE_CREDENTIALS" > /home/app/.claude/.credentials.json; fi && node apps/web/server.js'
