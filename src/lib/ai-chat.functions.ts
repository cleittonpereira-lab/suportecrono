import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const RowSchema = z.object({
  os: z.string().optional().default(""),
  tomador: z.string().optional().default(""),
  setor: z.string().optional().default(""),
  laboratorio: z.string().optional().default(""),
  dataPostagem: z.string().optional().default(""),
  dataEntrega: z.string().optional().default(""),
  delta: z.string().optional().default(""),
  volumeComp: z.string().optional().default(""),
  volumeCaract: z.string().optional().default(""),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  rows: z.array(RowSchema).max(2000),
});

function buildContext(rows: z.infer<typeof RowSchema>[]) {
  const header =
    "OS | Tomador | Setor | Laboratorio | Postagem | Entrega | Delta | VolComp | VolCaract";
  const lines = rows.map(
    (r) =>
      `${r.os} | ${r.tomador} | ${r.setor} | ${r.laboratorio} | ${r.dataPostagem} | ${r.dataEntrega} | ${r.delta} | ${r.volumeComp} | ${r.volumeCaract}`,
  );
  return [header, ...lines].join("\n");
}

export const askAssistant = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      return {
        text: "💡 Para ativar o Assistente de IA, configure as variáveis de ambiente `LOVABLE_API_KEY` ou `GEMINI_API_KEY` na Vercel.",
      };
    }

    const { createLovableAiGatewayProvider } = await import(
      "./ai-gateway.server"
    );
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const today = new Date().toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    const system = `Você é o Assistente do laboratório Suporte Engenharia. Responda em português do Brasil, de forma direta e profissional, usando markdown quando útil (listas, tabelas, negrito).

Hoje é ${today} (fuso America/Sao_Paulo).

Você tem acesso ao Cronograma do Laboratório abaixo (cada linha é uma OS):
- "Delta" indica dias de atraso/folga em relação à data de entrega.
- Datas estão no formato DD/MM/AAAA.
- VolComp = volume de Compactação, VolCaract = volume de Caracterização.
- Se a data de entrega for anterior a hoje, a OS está atrasada.
- Se não houver data de entrega, considere a OS como pendente.

Use apenas os dados fornecidos. Se a informação não estiver disponível, diga claramente. Não invente OS.

=== DADOS ===
${buildContext(data.rows)}
=== FIM DOS DADOS ===`;

    try {
      const { text } = await generateText({
        model,
        system,
        messages: data.messages,
      });
      return { text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429/.test(msg)) {
        return {
          text: "⚠️ Limite de requisições atingido. Tente novamente em alguns instantes.",
        };
      }
      if (/402/.test(msg)) {
        return {
          text: "⚠️ Créditos de IA esgotados nesse workspace. Adicione créditos para continuar usando o assistente.",
        };
      }
      return { text: `⚠️ Erro ao consultar a IA: ${msg}` };
    }
  });