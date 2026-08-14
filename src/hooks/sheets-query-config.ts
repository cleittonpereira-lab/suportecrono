/**
 * Configuração compartilhada de polling para hooks que leem Google Sheets.
 * Antes cada hook tinha `refetchInterval: 60_000` + `refetchIntervalInBackground: true`,
 * o que multiplicava chamadas à API do Sheets por aba aberta, mesmo em background.
 *
 * Regras:
 * - `staleTime` de 60s evita refetch a cada remontagem/troca de rota.
 * - `refetchInterval` de 5min mantém frescor sem estourar cota.
 * - `refetchIntervalInBackground: false` pausa polling quando a aba não está visível.
 */
export const SHEETS_QUERY_CONFIG = {
  staleTime: 0,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
} as const;