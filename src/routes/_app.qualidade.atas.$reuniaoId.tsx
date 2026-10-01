import { createFileRoute } from "@tanstack/react-router";
import { ReuniaoAoVivo } from "@/features/qualidade/ReuniaoAoVivo";

export const Route = createFileRoute("/_app/qualidade/atas/$reuniaoId")({
  ssr: false,
  component: Pagina,
  head: () => ({ meta: [{ title: "Reunião — Qualidade - LAB" }] }),
});

function Pagina() {
  const { reuniaoId } = Route.useParams();
  return <ReuniaoAoVivo reuniaoId={reuniaoId} />;
}
