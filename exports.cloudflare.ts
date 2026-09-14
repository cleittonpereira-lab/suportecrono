// Exportações extras do Worker — o nitro junta com a entrada padrão
// (`cloudflare.exports` em vite.config.ts). A sala de tempo real (Fase 3) é um
// Durable Object e precisa ser exportada pelo módulo principal.
export { SalaTempoReal } from "./src/server/sala-tempo-real";
