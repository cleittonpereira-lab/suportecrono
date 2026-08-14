import { useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { catalog, useCatalog } from "./catalog";
import { toast } from "sonner";

type Kind = "equipments" | "operators" | "typists" | "rings";

export function PickerWithCreate({
  kind,
  value,
  onChange,
  placeholder,
  createLabel,
}: {
  kind: Kind;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  createLabel: string;
}) {
  const items = useCatalog(kind);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    catalog.add(kind, v);
    onChange(v);
    setDraft("");
    setCreating(false);
    toast.success(`${createLabel} salvo`);
  };

  const del = () => {
    if (!value) return;
    if (!confirm(`Excluir "${value}" da lista?`)) return;
    catalog.remove(kind, value);
    onChange("");
    toast.success("Item removido");
  };

  if (creating) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setCreating(false); setDraft(""); }
          }}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commit} title="Salvar">
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setCreating(false); setDraft(""); }} title="Cancelar">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Select value={value || undefined} onValueChange={(v) => onChange(v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder ?? "Selecione…"} />
        </SelectTrigger>
        <SelectContent>
          {items.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum item cadastrado</div>
          ) : (
            items.map((it) => (
              <SelectItem key={it} value={it}>
                {it}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-8 w-8 shrink-0"
        onClick={() => setCreating(true)}
        title={createLabel}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-destructive"
        onClick={del}
        disabled={!value}
        title="Excluir da lista"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}