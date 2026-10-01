/**
 * Escolha de pessoas (responsáveis, participantes): marca quem tem conta no
 * app e deixa digitar um nome de fora, que entra como "externo".
 */
import { useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type PessoaOpcao = { nome: string; cargo?: string };

const mesmo = (a: string, b: string) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");

export function PessoasPicker({
  value,
  opcoes,
  onChange,
  children,
  placeholder = "Buscar ou digitar um nome…",
  unico = false,
}: {
  value: string[];
  opcoes: readonly PessoaOpcao[];
  onChange: (nomes: string[]) => void;
  /** O gatilho (o que a pessoa clica para abrir). */
  children: ReactNode;
  placeholder?: string;
  /** Escolher uma pessoa só (fecha ao escolher). */
  unico?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const nomes = new Map<string, PessoaOpcao>();
  for (const o of opcoes) nomes.set(o.nome.toLocaleLowerCase("pt-BR"), o);
  // Quem já está escolhido mas não tem conta (nome de fora) continua na lista.
  for (const v of value) if (!nomes.has(v.toLocaleLowerCase("pt-BR"))) nomes.set(v.toLocaleLowerCase("pt-BR"), { nome: v });
  const lista = [...nomes.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const marcado = (nome: string) => value.some((v) => mesmo(v, nome));
  const alternar = (nome: string) => {
    if (unico) {
      onChange([nome]);
      setAberto(false);
    } else {
      onChange(marcado(nome) ? value.filter((v) => !mesmo(v, nome)) : [...value, nome]);
    }
    setBusca("");
  };
  const textoNovo = busca.trim().replace(/\s+/g, " ");
  const podeCriar = textoNovo.length > 0 && !lista.some((p) => mesmo(p.nome, textoNovo));

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} value={busca} onValueChange={setBusca} />
          <CommandList>
            <CommandEmpty>Ninguém encontrado.</CommandEmpty>
            <CommandGroup>
              {lista.map((p) => (
                <CommandItem key={p.nome} value={p.nome} onSelect={() => alternar(p.nome)}>
                  <Check className={cn("mr-2 h-4 w-4", marcado(p.nome) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{p.nome}</span>
                  {p.cargo ? <span className="ml-2 truncate text-xs text-muted-foreground">{p.cargo}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
            {podeCriar && (
              <CommandGroup heading="Pessoa de fora do app">
                <CommandItem value={`__novo__${textoNovo}`} onSelect={() => alternar(textoNovo)}>
                  <Plus className="mr-2 h-4 w-4" /> Adicionar “{textoNovo}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
