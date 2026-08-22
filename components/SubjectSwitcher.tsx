"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SubjectOption } from "@/lib/types";

export function SubjectSwitcher({
  subjects,
  current,
}: {
  subjects: SubjectOption[];
  current: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const currentName =
    subjects.find((row) => row.code === current)?.name ?? "Computer Science";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subjects.slice(0, 12);
    return subjects
      .filter(
        (row) =>
          row.code.toLowerCase().includes(q) ||
          row.name.toLowerCase().includes(q),
      )
      .slice(0, 16);
  }, [query, subjects]);

  function pick(code: string) {
    setOpen(false);
    setQuery("");
    router.push(code === "COMS" ? "/" : `/?subject=${code}`);
  }

  return (
    <div className="relative min-w-[220px] flex-1">
      <label className="text-[11px] font-medium tracking-[0.16em] text-gold uppercase">
        Subject
      </label>
      <input
        value={open ? query : `${current} · ${currentName}`}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="Search subjects from the directory index"
        className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none ring-gold/30 focus:ring-2"
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-paper-2 p-1 shadow-[var(--shadow)]">
          {filtered.map((row) => (
            <li key={row.code}>
              <button
                type="button"
                onMouseDown={() => pick(row.code)}
                className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-paper"
              >
                <span>{row.name}</span>
                <span className="font-mono text-xs text-ink-soft">{row.code}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-soft">No Fall 2026 subject match</li>
          )}
        </ul>
      )}
    </div>
  );
}
