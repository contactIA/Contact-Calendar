<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Contact Calendar

Antes de escrever código, leia a [ADR 0001](docs/adr/0001-app-proprio-com-a-arquitetura-do-crm.md)
e o [plano da migração](docs/migracao-para-a-arquitetura-do-crm.md).

A agenda é um app próprio que segue a arquitetura do CRM ContactIA
(`contactIA/CRM-Contact-IA`). Na dúvida sobre um padrão, faça como o CRM faz.

## Código novo e código antigo

- **Código novo** mora em `src/modulos`, `src/api`, `src/infra`, `src/compartilhado`,
  `src/worker` e `src/composicao.ts`, e segue as regras abaixo.
- **Código antigo** (`src/lib`, `src/hooks`, `src/components`, `src/types` e as
  rotas e páginas que usam o supabase-js) sai fase a fase. Não acrescente nada
  nele: o que precisar mudar é reescrito no código novo.
- O código novo não importa o antigo. O dependency-cruiser recusa.

## Arquitetura (ADR 0001)

- Um app Next.js e um processo `worker` do mesmo código.
- Clean Architecture por módulo: `src/modulos/<modulo>/{dominio,aplicacao,infraestrutura}`.
- `dominio/` é puro: sem pacotes, sem Next, sem banco, sem relógio. O instante e o
  fuso entram por parâmetro.
- `aplicacao/` depende só do domínio e das portas que declara.
- `src/app` e `src/api` só traduzem HTTP e pedem os casos de uso a `src/composicao.ts`.
- Toda escrita passa por um caso de uso. A que mexe no funil grava, na mesma
  transação, o aviso que o worker entrega ao CRM.
- `npm run deps:check` verifica a regra de dependência, e o CI falha se ela quebrar.

## API

- Toda rota nasce de `novoRoteador()` e é declarada com `createRoute` e esquemas zod:
  o mesmo esquema valida e documenta. Rota sem esquema não entra.
- Erros no formato `{ erro, codigo }`. Regra de negócio lança `ErroDeDominio` (tipo,
  código, frase), e `src/api/erros.ts` traduz o tipo para o status.
- Campos em camelCase, rotas em `/api/v1`. A documentação fica em `/api/docs` e o
  contrato em `/api/openapi.json`. O CI envia o mesmo contrato ao ReadMe a cada
  push na `master` (`npm run docs:readme`).

## Dados

- Postgres do projeto Supabase do CRM ("Clinic Control"), esquema `agenda`, acesso
  direto com Drizzle. Toda tabela tem `clinica_id`. A agenda não lê as tabelas do
  CRM: o que precisa de lá vem pela API do CRM.
- `npm run db:gerar` gera a migração. Aplicar em produção só com OK explícito da
  equipe.
- Regra nova no banco (restrição, índice único, gatilho) ganha teste em
  `testes/banco/`, que aplica as migrações reais no PGlite.
- Segredos (`.env`) quem preenche é a equipe.

## Textos da interface

- White label: nenhum texto que a clínica vê cita o fornecedor da plataforma de
  mensagens.
- Sem travessão nos textos da interface.

## Deploy

- A `master` publica na Vercel a cada push, até o corte (fase 9). O código da
  migração fica em ramo até lá.
- Depois do corte, app e worker rodam em containers na VPS compartilhada, como o
  CRM. Mexer no nginx, no DNS ou em dados de produção só depois de mostrar o que
  vai rodar e ter OK.

## Antes de entregar

- `npm run verificar` (tipos, lint, testes e regra de dependência) e `npm run build`.
