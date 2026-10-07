# Imagens de produção para a VPS, como as do CRM (ADR 0001). O compose e o passo
# a passo do deploy entram na fase 8 do plano.
#
# Um código, dois processos, cada um no seu target:
#   · app: o Next em saída `standalone` (server.js e só as dependências rastreadas);
#   · worker: o mesmo TypeScript rodando pelo tsx, com as dependências de produção.
#
# SEGREDOS NÃO ENTRAM AQUI. Tudo é lido em runtime, do .env do servidor: o build
# não precisa de banco nem de segredo.

# Mesma major do CI.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS deps-producao
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION}-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
# Não roda como root.
RUN addgroup -S -g 1001 agenda && adduser -S -u 1001 -G agenda agenda
COPY --from=deps-producao --chown=agenda:agenda /app/node_modules ./node_modules
COPY --chown=agenda:agenda package.json tsconfig.json ./
COPY --chown=agenda:agenda src ./src
USER agenda
# Um processo só (sem o npm na frente): o SIGTERM do `docker stop` chega ao
# worker, que termina o que está fazendo antes de sair.
CMD ["node", "--import", "tsx", "src/worker/index.ts"]

FROM node:${NODE_VERSION}-alpine AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 agenda && adduser -S -u 1001 -G agenda agenda
COPY --from=build --chown=agenda:agenda /app/.next/standalone ./
COPY --from=build --chown=agenda:agenda /app/.next/static ./.next/static
COPY --from=build --chown=agenda:agenda /app/public ./public
USER agenda
EXPOSE 3000
CMD ["node", "server.js"]
