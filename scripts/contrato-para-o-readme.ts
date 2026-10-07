import { writeFileSync } from 'node:fs'
import { criarApi } from '@/api/app'

// O contrato que vai para a documentação no ReadMe, no mesmo projeto da do CRM.
// É o mesmo de /api/openapi.json, mais o que só o ReadMe precisa:
//   - o endereço de produção, para o "Try It" saber para onde mandar;
//   - o "Try It" indo direto do navegador para a API, sem o proxy do ReadMe, para
//     a chave da clínica não passar pelo servidor deles (a API libera o CORS só
//     para a origem da documentação, em src/api/app.ts);
//   - sem as métricas do ReadMe, que mandariam as requisições para fora;
//   - a ordem das seções e das rotas seguindo a do contrato a cada envio.
//
// Rodar: `npm run docs:readme -- <arquivo>`. O CI gera, valida com a CLI `rdme` e,
// na master, envia.

const PRODUCAO = 'https://agenda.contactia.com.br'

async function main() {
  const destino = process.argv[2] ?? 'openapi.json'
  const api = criarApi(() => {
    throw new Error('o contrato não usa os casos de uso')
  })
  const contrato = (await (await api.request('/api/openapi.json')).json()) as Record<string, unknown>

  const paraOReadme = {
    ...contrato,
    servers: [{ url: PRODUCAO, description: 'Produção' }],
    'x-readme': {
      'proxy-enabled': false,
      'metrics-enabled': false,
      'apply-tag-changes': true,
      'apply-endpoint-order': true,
    },
  }
  writeFileSync(destino, JSON.stringify(paraOReadme, null, 2) + '\n')
  console.log(`Contrato para o ReadMe em ${destino}`)
}

main().catch((erro: unknown) => {
  console.error('Não foi possível gerar o contrato para o ReadMe:', erro instanceof Error ? erro.message : erro)
  process.exit(2)
})
