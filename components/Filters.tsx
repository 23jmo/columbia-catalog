"use client";

import type { CatalogFilters } from "@/lib/filters";

const LEVELS: { id: CatalogFilters["level"]; label: string }[] = [
  { id: "all", label: "All levels" },
  { id: "1000", label: "1000" },
  { id: "2000", label: "2000" },
  { id: "3000", label: "3000" },
  { id: "4000", label: "4000+" },
];

const CREDITS: { id: CatalogFilters["credits"]; label: string }[] = [
  { id: "all", label: "Any pts" },
  { id: "0", label: "0" },
  { id: "1-2", label: "1–2" },
  { id: "3", label: "3" },
  { id: "4", label: "4+" },
];

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs tracking-wide ${
        active
          ? "bg-navy text-paper"
          : "border border-line bg-card text-ink-soft hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Filters({
  value,
  onChange,
}: {
  value: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-[11px] font-medium tracking-[0.16em] text-gold uppercase">
          Search
        </span>
        <input
          value={value.query}
          onChange={(event) => onChange({ ...value, query: event.target.value })}
          placeholder="Title, instructor, call number, course number"
          className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none ring-gold/30 focus:ring-2"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.openOnly}
          onChange={(event) => onChange({ ...value, openOnly: event.target.checked })}
          className="accent-[var(--gold)]"
        />
        Open seats only
      </label>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((level) => (
          <Pill
            key={level.id}
            active={value.level === level.id}
            onClick={() => onChange({ ...value, level: level.id })}
          >
            {level.label}
          </Pill>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {CREDITS.map((credit) => (
          <Pill
            key={credit.id}
            active={value.credits === credit.id}
            onClick={() => onChange({ ...value, credits: credit.id })}
          >
            {credit.label}
          </Pill>
        ))}
      </div>
    </div>
  );
}
