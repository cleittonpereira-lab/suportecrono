import React from "react";
import { X } from "lucide-react";
import type { CDSpecimen } from "../types";
import { BRAND } from "../constants";

export function CDCpSelector({
  specimens,
  selectedId,
  onSelect,
  onRemove,
  canRemove,
}: {
  specimens: CDSpecimen[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  canRemove?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border pb-1">
      {specimens.map((c) => {
        const active = selectedId === c.id;
        return (
          <div
            key={c.id}
            className={`group relative flex items-center gap-1 rounded-t-md px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
              active ? "ring-primary" : "ring-border hover:ring-primary/50"
            }`}
            style={{
              background: active ? c.color ?? BRAND : "transparent",
              color: active ? "#fff" : c.color ?? BRAND,
            }}
          >
            <button type="button" onClick={() => onSelect(c.id)}>
              {c.displayId ?? c.id} — σn={c.normalStressTarget} kPa
            </button>
            {onRemove && canRemove && (
              <button
                type="button"
                title={`Remover ${c.displayId ?? c.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(c.id);
                }}
                className={`ml-1 rounded p-0.5 ${
                  active ? "hover:bg-white/20" : "hover:bg-destructive/10"
                }`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
