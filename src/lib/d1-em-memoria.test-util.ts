/**
 * D1 de teste: SQLite de verdade (node:sqlite, em memória) atrás da mesma API
 * que o Worker recebe no binding `DB`, com as migrações de migrations/d1.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { D1Banco, D1Comando } from "./documentos-d1.server";

const PASTA_MIGRACOES = join(process.cwd(), "migrations", "d1");

export function d1EmMemoria(): D1Banco & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  for (const arquivo of readdirSync(PASTA_MIGRACOES).filter((f) => f.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(join(PASTA_MIGRACOES, arquivo), "utf8"));
  }
  return {
    sqlite,
    prepare(sql: string): D1Comando {
      let valores: unknown[] = [];
      const comando: D1Comando = {
        bind(...v: unknown[]) {
          valores = v;
          return comando;
        },
        async first<T>() {
          return (sqlite.prepare(sql).get(...(valores as never[])) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: sqlite.prepare(sql).all(...(valores as never[])) as T[] };
        },
        async run() {
          const r = sqlite.prepare(sql).run(...(valores as never[]));
          return { meta: { changes: Number(r.changes) } };
        },
      };
      return comando;
    },
  };
}
