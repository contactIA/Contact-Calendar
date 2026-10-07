# Migração para a arquitetura do CRM

Plano da [ADR 0001](adr/0001-app-proprio-com-a-arquitetura-do-crm.md). A agenda
quase não tem uso (em 2026-10-07: 11 contas de teste, nenhuma consulta futura,
e o login de pessoa não funciona em produção), então a migração é uma reescrita
incremental sem convivência com dados vivos.

## Fases

| Fase | O que entra | Tamanho |
|---|---|---|
| 0 | Limpeza: sai a camada do painel nativo e o código morto | feita |
| 1 | Decisão e plano (ADR 0001 e este documento) | feita |
| 2 | Esqueleto: Hono com zod e OpenAPI, Drizzle, pg-boss, vitest com PGlite, dependency-cruiser, CI no GitHub Actions, Dockerfile, `npm run verificar` | médio |
| 3 | Esquema `agenda`: migração base tirada do banco real, testes de banco (sobreposição por profissional e por cadeira, telefone repetido, mesma clínica nas chaves) | médio |
| 4 | Domínio e casos de uso: horários livres, conflito, prioridade dos profissionais, consultas, pacientes. Os cenários do README viram testes sem banco | grande |
| 5 | API: rotas da tela e do agente com `createRoute`, documentação em `/api/docs` | médio |
| 6 | Telas: agenda (dia, semana, lista), pacientes e configurações sobre a API nova | grande |
| 7 | Ligação com o CRM: caixa de saída, worker, webhooks de entrada; no CRM, `POST /cards` aceitar a data da consulta numa chamada só | médio |
| 8 | Acesso e deploy: login pelo item de menu, domínio próprio na VPS, item de menu na plataforma | médio |
| 9 | Corte: recriar as clínicas reais, desligar a Vercel, pausar o Supabase antigo | pequeno |

## Regras da migração

- **Horários livres saem do SQL** (`get_available_slots`) para o domínio em
  TypeScript, testável sem banco. O fuso entra por parâmetro: a remarcação já
  teve um erro de 3 horas por fuso.
- **As restrições que impedem duas consultas no mesmo horário ficam no banco**,
  como garantia final contra pedidos simultâneos. O domínio confere antes, para
  dar a frase certa. O Drizzle não descreve essas restrições: elas entram como
  SQL escrito à mão na migração.
- **A busca sem acento fica no SQL**, numa consulta dedicada.
- **O telefone segue a regra do CRM** (E.164, com o nono dígito no celular
  antigo). Hoje a busca compara só os dígitos finais: a troca é uma mudança de
  comportamento, não um porte.
- **Enquanto a migração não termina**, o código novo fica num ramo. A `master`
  publica na Vercel a cada push.

## Em aberto

1. **Quem entra e como.** O dentista tem usuário na plataforma? Se não tiver,
   o profissional vira um cadastro próprio, ligado a um usuário quando houver.
2. **Recomeçar vazio** e recriar à mão as configurações das clínicas reais?
3. **A API do agente** fica em `/api/agent/*` como hoje, ou segue o padrão do CRM
   (`/api/v1/...`)? A única chave da IA nunca foi usada.
4. **O domínio** (por exemplo, `agenda.contactia.com.br`).
5. **Quem manda o lembrete da consulta:** a agenda ou o Agendados do CRM. Nunca
   os dois.
