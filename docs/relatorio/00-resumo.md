# Resumo — cadência/duração de slots

**O quê:** a agenda passou a ter cadência de grade configurável; a duração real do
procedimento já era respeitada.

**Em uma frase:** o "30 min fixo" da tarefa não era bug de duração (isso já funcionava) —
era só a cadência da grade, que agora é configurável por clínica.

**Entregue:**
- Novo Supabase `Contact-Calendar` com o schema replicado + correção.
- Cadência configurável (`accounts.slot_interval_minutes` + override).
- Endpoint e aba "Geral" no admin.
- Commit publicado em `contactIA/Contact-Calendar`.

**Detalhes nos arquivos:**
- [01-descoberta.md](01-descoberta.md) — o que foi descoberto
- [02-o-que-foi-feito.md](02-o-que-foi-feito.md) — o que foi feito
- [03-como-foi-feito.md](03-como-foi-feito.md) — como foi feito (técnico)
- [04-como-testar.md](04-como-testar.md) — como testar
