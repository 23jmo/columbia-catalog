import {
  RiDownloadLine,
  RiFileCopyLine,
  RiSearchLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { WEEKDAY_SHORT } from "@/lib/constants";
import type { PlanAnalysisDetail } from "@/lib/schedule";
import { cx } from "@/utils/cx";
import { CalendarMiniMonth } from "./calendar-mini-month";
import { PlanSwitcher } from "./plan-switcher";
import { colorDotClass } from "./calendar-event";
import type { CalendarColor, CalendarLayer, CalendarLayers } from "./calendar-types";

/**
 * Left rail on desktop; compact control strip on mobile (stacked above the grid).
 */

const LAYER_META: {
  id: CalendarLayer;
  label: string;
  color: CalendarColor;
}[] = [
  { id: "class", label: "Classes", color: "blue" },
  { id: "commitment", label: "Other commitments", color: "lime" },
  { id: "historical", label: "Usual times", color: "purple" },
];

export interface CalendarRailPlan {
  planId: string;
  name: string;
  isPrimary: boolean;
}

export function CalendarRail({
  plans,
  selectedId,
  onSelectPlan,
  onCreatePlan,
  layers,
  onToggleLayer,
  showHistorical,
  query,
  onQuery,
  selectedDate,
  onSelectDate,
  onMonthChange,
  analysis,
  canExport,
  onExport,
  onDuplicate,
  className,
}: {
  plans: readonly CalendarRailPlan[];
  selectedId: string | null;
  onSelectPlan: (planId: string) => void;
  onCreatePlan: () => void;
  layers: CalendarLayers;
  onToggleLayer: (layer: CalendarLayer) => void;
  showHistorical: boolean;
  query: string;
  onQuery: (value: string) => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onMonthChange: (date: Date) => void;
  analysis: PlanAnalysisDetail | null;
  canExport: boolean;
  onExport: () => void;
  onDuplicate: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cx(
        "flex min-h-0 w-full shrink-0 flex-col gap-4 overflow-y-auto px-3 py-4",
        "max-lg:max-h-[min(42dvh,22rem)] max-lg:border-b max-lg:border-border-table",
        "lg:h-full lg:w-72 lg:border-r lg:border-border-table",
        className,
      )}
    >
      <label className="relative block w-full">
        <RiSearchLine
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-foreground-icon-tertiary"
          aria-hidden
        />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search"
          aria-label="Filter events"
          className="w-full rounded-2lg border border-border-button-default bg-background-primary-default py-2 pr-3 pl-8 text-body-regular text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-button-hover"
        />
      </label>

      <PlanSwitcher
        plans={plans}
        selectedId={selectedId}
        onSelectPlan={onSelectPlan}
        onCreatePlan={onCreatePlan}
        analysis={analysis}
      />

      <section className="w-full">
        <h2 className="mb-2 text-caption-1-semibold tracking-[0.08em] text-text-tertiary uppercase">
          Layers
        </h2>
        <ul className="flex flex-col gap-0.5">
          {LAYER_META.filter((layer) => layer.id !== "historical" || showHistorical).map((layer) => (
            <li key={layer.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg py-1.5 text-body-regular text-text-secondary hover:bg-background-secondary-hover">
                <input
                  type="checkbox"
                  checked={layers[layer.id]}
                  onChange={() => onToggleLayer(layer.id)}
                  className="sr-only"
                />
                <span
                  className={cx(
                    "size-2.5 shrink-0 rounded-full",
                    colorDotClass(layer.color),
                    !layers[layer.id] && "opacity-30",
                  )}
                />
                <span className={cx(!layers[layer.id] && "text-text-tertiary line-through")}>
                  {layer.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <CalendarMiniMonth
        cursor={selectedDate}
        selected={selectedDate}
        onSelect={onSelectDate}
        onMonthChange={onMonthChange}
      />

      {analysis ? <AnalysisBits analysis={analysis} /> : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Button size="small" variant="secondary" leadingIcon={RiDownloadLine} onClick={onExport} disabled={!canExport}>
          Export .ics
        </Button>
        <Button size="small" variant="secondary" leadingIcon={RiFileCopyLine} onClick={onDuplicate}>
          Duplicate
        </Button>
      </div>
    </aside>
  );
}

function AnalysisBits({ analysis }: { analysis: PlanAnalysisDetail }) {
  const hard = analysis.conflicts.filter((conflict) => conflict.severity === "hard").length;
  const credits =
    analysis.creditsMin === analysis.creditsMax
      ? `${analysis.creditsMax} credits`
      : `${analysis.creditsMin}–${analysis.creditsMax} credits`;

  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip variant="caption">{credits}</Chip>
      <Chip variant="caption" color={hard > 0 ? "rose" : "lime"}>
        {hard > 0 ? `${hard} hard conflict${hard === 1 ? "" : "s"}` : "Clear"}
      </Chip>
      {analysis.daysWithNoClasses.length > 0 ? (
        <Chip variant="caption" color="soft">
          Free {analysis.daysWithNoClasses.map((day) => WEEKDAY_SHORT[day]).join(" ")}
        </Chip>
      ) : null}
    </div>
  );
}
