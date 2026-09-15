import { createFileRoute } from "@tanstack/react-router";
import { PainelCoordenador } from "@/features/gestao/PainelCoordenador";

// Acesso pela permissão "Painel do coordenador" (lib/tab-permissions.ts) — o guarda de abas de _app confere.
export const Route = createFileRoute("/_app/coordenacao")({
  ssr: false,
  component: PainelCoordenador,
  head: () => ({
    meta: [{ title: "Painel do coordenador — Suporte INFRA" }],
  }),
});
