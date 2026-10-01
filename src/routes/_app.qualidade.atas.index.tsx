import { createFileRoute } from "@tanstack/react-router";
import { ListaDeAtas } from "@/features/qualidade/ListaDeAtas";

// Acesso pela permissão "Qualidade - LAB" (lib/tab-permissions.ts) — o guarda de abas de _app confere.
export const Route = createFileRoute("/_app/qualidade/atas/")({
  ssr: false,
  component: ListaDeAtas,
  head: () => ({ meta: [{ title: "Atas de reunião — Qualidade - LAB" }] }),
});
