# 0001: App próprio, com a arquitetura do CRM, ligado ao CRM pela API

- **Status:** Aceito
- **Data:** 2026-10-07

## Contexto

O CRM ContactIA (repositório `contactIA/CRM-Contact-IA`) virou o funil de leads
das clínicas, com os painéis CRC1 e CRC2. A agenda precisa conversar com ele:
uma consulta marcada, remarcada, cancelada, com falta ou com comparecimento
move o card do paciente.

A agenda de hoje não está pronta para isso:

- **A regra mora nas rotas.** Cada `route.ts` valida, decide e grava. A mesma
  lógica aparece repetida entre as rotas da tela e as do agente (`agendar` e
  `POST /appointments`, `remarcar` e `PATCH /appointments/{id}`).
- **Não há transação entre passos.** A consulta é gravada e os efeitos
  (confirmação, lembrete, etiquetas) rodam soltos depois. Se algo cai no meio,
  um efeito se perde sem aviso.
- **Não há testes nem CI.** As migrações do repositório não recriam o banco
  (ver o README).
- A ligação antiga com o painel nativo da plataforma nunca entregou em produção
  e saiu na limpeza de outubro de 2026.

A equipe quer a agenda como **um app à parte dentro da plataforma**: item de
menu próprio, endereço próprio e o código neste repositório.

## Alternativas consideradas

| Opção | Por que não |
|---|---|
| **Módulo dentro do CRM** (mesmo repositório e deploy, a consulta e o card na mesma transação) | Tecnicamente o mais simples para a ligação, e um app só pode servir dois endereços e dois itens de menu. Mas tira a agenda deste repositório e faz um defeito dela subir junto com o CRM, que já está em produção. A equipe preferiu os dois separados. |
| **App separado com a arquitetura atual** | Mantém os problemas do contexto: regra em rota, sem transação, sem testes. A ligação com o CRM ficaria frágil do mesmo jeito que a antiga. |
| **Manter o Supabase próprio** | Possível, mas o projeto "Contact-Calendar" é mais um para operar, e o cadastro único de clínicas e unidades (setup unificado, em discussão) fica no projeto do CRM. |

## Decisão

**A agenda continua um app próprio**, neste repositório, num domínio próprio e
com o item de menu dela na plataforma. Ela adota a **mesma arquitetura do CRM**
(ADRs 0006, 0007 e 0002 de lá):

- **Clean Architecture por módulo:** `src/modulos/<modulo>/{dominio,aplicacao,infraestrutura}`,
  com `src/composicao.ts` ligando portas e adaptadores e a regra de dependência
  verificada no CI pelo dependency-cruiser. O domínio é puro, e o instante entra
  por parâmetro.
- **API em Hono** com `createRoute` e esquemas zod que validam e documentam
  (`/api/docs`, `/api/openapi.json`). Erros no formato `{ erro, codigo }`.
- **Postgres direto pelo Drizzle**, com transação, no projeto Supabase do CRM
  ("Clinic Control"), num esquema `agenda` só nosso: fora da API REST do Supabase,
  RLS ligado sem políticas, `clinica_id` em toda tabela. A agenda **não lê as
  tabelas do CRM**: o cadastro de clínicas e unidades vem pela API do CRM ou
  pelas visões só de leitura do cadastro único, quando ele existir.
- **Processo worker** do mesmo código, com a fila no próprio Postgres (pg-boss).
- **Testes** com vitest, e os do banco no PGlite, aplicando as migrações reais.
- **Login pelo item de menu**, como no CRM: `?companyId={{companyId}}&userId={{userId}}`,
  com a origem conferida e só para quem o setup vinculou.
- **Deploy** em containers na VPS, como o CRM (app e worker), atrás do nginx
  compartilhado.

### Como a agenda conversa com o CRM

- **Saída, com caixa de saída na mesma transação.** Toda escrita que mexe no
  funil grava, junto com a consulta, um aviso para o CRM. O worker entrega pela
  API do CRM, com novas tentativas. A API do CRM ignora o pedido repetido, então
  a entrega pode repetir sem duplicar nada.

  | Na agenda | No CRM |
  |---|---|
  | Consulta criada | Acha ou cria o card pelo telefone e move para Agendados, com a data da consulta |
  | Remarcada | Agendados de novo, com a data nova (o CRM marca a remarcação) |
  | Cancelada | Cancelados |
  | Falta | Faltosos |
  | Compareceu | Saída Compareceu (o card vai para o CRC2) |

- **Entrada, pelos webhooks da clínica no CRM** (`card.movido`), com a assinatura
  conferida. A agenda ignora os avisos das ações dela mesma (pelo `ator.id`), para
  não entrar em laço.

## Consequências

- **O esqueleto do CRM é copiado, não compartilhado.** Acesso, cliente da
  plataforma, telefone, erros e testes de banco começam como cópia. Se as duas
  cópias começarem a divergir, vale extrair um pacote comum.
- **O card acompanha em segundos, não no mesmo instante.** Se o CRM estiver fora
  do ar, a agenda continua funcionando e entrega depois.
- **Uma chave da API do CRM por clínica** (tipo `integracao`) fica guardada
  cifrada na agenda, ou uma chave da equipe com `X-Clinica`.
- **O banco do CRM ganha o esquema `agenda`** e as extensões `btree_gist` (para as
  restrições que impedem duas consultas no mesmo horário) e `unaccent`. Criar
  as duas no projeto compartilhado só com o OK da equipe.
- **Deploy na VPS:** domínio, nginx e certificado só depois de mostrar o que vai
  rodar e ter OK. A Vercel sai no corte.
- **A migração é uma reescrita incremental**, fase a fase, descrita em
  [docs/migracao-para-a-arquitetura-do-crm.md](../migracao-para-a-arquitetura-do-crm.md).
