# API runtime image. Not a production deploy.
# Pin Node 22 to match .nvmrc / CI. Redis is not included; use Compose Redis 7.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json .npmrc ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate
RUN pnpm exec nx build api --skip-nx-cache

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
COPY --from=build /app/dist/apps/api ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY --from=build /app/package.json ./package.json
USER app
EXPOSE 4000
CMD ["node", "dist/main.js"]
