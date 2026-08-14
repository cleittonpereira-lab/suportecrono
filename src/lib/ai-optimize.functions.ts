import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

const TarefaSchema = z.object({
  ensaioId: z.string(),
  os: z.string(),
  amostra: z.string(),
  tipoNome: z.string(),
  tipoId: z.string(),
  equiposCompat: z.array(z.string()), // ids
  dur: z.number(),
  deadline: z.string().nullable(),      // YYYY-MM-DD ou null
  alvo: z.string().nullable(),          // deadline - 3 úteis
});

const EquipSchema = z.object({
  id: z.string(),
  nome: z.string(),
  disponivelA: z.string(), // ISO
});

const InputSchema = z.object({
  hoje: z.string(),
  incluirFds: z.boolean(),
  tarefas: z.array(TarefaSchema).min(1).max(200),
  equipamentos: z.array(EquipSchema).min(1),
});

export const optimizeSchedule = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      // Retorna alocação determinística nos equipamentos compatíveis
      const plan = data.tarefas.map((t, i) => {
        const equipId = t.equiposCompat[0] || data.equipamentos[i % data.equipamentos.length]?.id || null;
        return {
          ensaioId: t.ensaioId,
          equipId,
          inicio: data.hoje,
          fim: data.hoje,
        };
      });
      return { plan };
    }
    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system = `Você é um planejador de laboratório geotécnico. Sua tarefa é montar uma programação ótima de ensaios em equipamentos, respeitando:
- cada ensaio SÓ pode ir em equipamento que esteja em "equiposCompat" (ids). Se lista vazia, qualquer equipamento serve.
- cada equipamento tem capacidade diária 1,0. Duração fracionária consome fração do dia: 0,25 = 25% do dia, então até 4 ensaios de 0,25 podem ser alocados no mesmo equipamento e na mesma data; 0,5 permite até 2 por dia.
- objetivo: terminar o ensaio até "alvo" (que já é deadline - 3 dias úteis). Se impossível, minimizar atraso vs deadline.
- priorizar OS mais urgentes; usar disponibilidade "disponivelA" de cada equipamento como piso.
- durações vêm em dias e aceitam fracionário; NÃO arredonde 0,25/0,5/0,75 para 1 dia exclusivo, some as frações até completar 1,0 de carga diária.
- se incluirFds=false, IGNORE sábados, domingos e feriados (não conte no cronograma).
- retorne APENAS JSON no formato: {"plan":[{"ensaioId":"...","equipId":"...","inicio":"YYYY-MM-DD","fim":"YYYY-MM-DD"}]}
- não invente ids que não estão nos dados. Não pule ensaios. Se realmente não houver equipamento compatível, use equipId=null.`;

    const prompt = `HOJE=${data.hoje} incluirFds=${data.incluirFds}
EQUIPAMENTOS=${JSON.stringify(data.equipamentos)}
TAREFAS=${JSON.stringify(data.tarefas)}
Responda somente o JSON.`;

    try {
      const { text } = await generateText({ model, system, prompt });
      const cleaned = text.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      const PlanSchema = z.object({
        plan: z.array(z.object({
          ensaioId: z.string(),
          equipId: z.string().nullable(),
          inicio: z.string(),
          fim: z.string(),
        })),
      });
      return PlanSchema.parse(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`IA não retornou plano válido: ${msg}`);
    }
  });