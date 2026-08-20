import { createFileRoute } from "@tanstack/react-router";
import { RegistroAmostraStandalonePage } from "./registro-amostra";

export const Route = createFileRoute("/registro-chegada")({
  head: () => ({
    meta: [
      { title: "Registro de Chegada de Amostras — Suporte INFRA" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" },
    ],
  }),
  component: RegistroAmostraStandalonePage,
});
