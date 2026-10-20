import type { NextConfig } from "next";

// A agenda agora mora no CRM (ADR 0016 do CRM): este app ficou sem uso, e a
// plataforma ainda pode ter o item de menu antigo, que abre
// /{companyId}?userId={userId} aqui e não autentica. Esses endereços vão para a
// agenda do CRM, com o mesmo companyId; o userId segue na query (o Next passa a
// query de origem adiante).
const AGENDA_NO_CRM = "https://crm.contactia.com.br/?companyId=:accountId&app=agenda";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:accountId([0-9a-fA-F-]{36})/:resto*",
        destination: AGENDA_NO_CRM,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
