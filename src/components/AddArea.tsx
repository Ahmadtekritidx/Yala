import { useState } from "react";

// Free-text "add a place" input so users aren't limited to our preset Lebanese areas.
export function AddArea({ onAdd, placeholder = "+ Any town or city" }: { onAdd: (area: string) => void; placeholder?: string }) {
  const [v, setV] = useState("");
  const add = () => {
    const a = v.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!a) return;
    onAdd(a);
    setV("");
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex min-h-11 items-center rounded-full border-2 border-dashed border-border bg-card pl-4 pr-1 focus-within:border-primary/60">
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={add} placeholder={placeholder} aria-label="Add a place"
        className="w-40 bg-transparent text-sm outline-none" />
      {v.trim() && <button type="submit" className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">Add</button>}
    </form>
  );
}
