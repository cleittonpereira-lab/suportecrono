import { createFileRoute } from "@tanstack/react-router";
import { AiAssistant } from "@/components/ai-assistant";

export const Route = createFileRoute("/_app/assistente")({
  head: () => ({ meta: [{ title: "Assistente IA | LabFlow" }] }),
  component: Page,
});

function Page() {
  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistente IA</h1>
        <p className="text-sm text-muted-foreground">
          Faça perguntas em linguagem natural sobre o cronograma do laboratório.
        </p>
      </div>
      <AiAssistant />
    </div>
  );
}