import type { RemixiconComponentType } from "@remixicon/react";
import {
  RiBarChartLine,
  RiBook2Line,
  RiBrainLine,
  RiBriefcaseLine,
  RiCalculatorLine,
  RiCodeLine,
  RiFlaskLine,
  RiGlobalLine,
  RiGovernmentLine,
  RiHeartPulseLine,
  RiLeafLine,
  RiLightbulbLine,
  RiMoneyDollarCircleLine,
  RiMusic2Line,
  RiPaletteLine,
  RiPlanetLine,
  RiQuillPenLine,
  RiRunLine,
  RiTranslate2,
} from "@remixicon/react";

import { cx } from "@/utils/cx";

/**
 * Pick a glyph for a Columbia subject code. Exact hits first, then prefix rules,
 * then a neutral book fallback — courses without a mapping still get an icon.
 */
export function resolveSubjectIcon(subjectCode: string): RemixiconComponentType {
  const code = subjectCode.trim().toUpperCase();

  const exact: Record<string, RemixiconComponentType> = {
    COMS: RiCodeLine,
    CSEE: RiCodeLine,
    BMCS: RiCodeLine,
    EECS: RiCodeLine,
    CHEM: RiFlaskLine,
    CHMP: RiFlaskLine,
    BIOL: RiLeafLine,
    BC: RiLeafLine,
    PHYS: RiPlanetLine,
    MATH: RiCalculatorLine,
    STAT: RiBarChartLine,
    ECON: RiMoneyDollarCircleLine,
    POLS: RiGovernmentLine,
    PSYC: RiBrainLine,
    SOCI: RiGlobalLine,
    HIST: RiBook2Line,
    ENGL: RiQuillPenLine,
    CLEN: RiQuillPenLine,
    PHIL: RiLightbulbLine,
    AHUM: RiPaletteLine,
    AHIS: RiPaletteLine,
    MUSI: RiMusic2Line,
    THTR: RiMusic2Line,
    DRAM: RiMusic2Line,
    PHED: RiRunLine,
    NURS: RiHeartPulseLine,
    BUSI: RiBriefcaseLine,
    FIN: RiBriefcaseLine,
    IEOR: RiBarChartLine,
    ENGR: RiCalculatorLine,
  };

  if (exact[code]) return exact[code];

  const prefixes: Array<[string, RemixiconComponentType]> = [
    ["COMS", RiCodeLine],
    ["CSEE", RiCodeLine],
    ["BMCS", RiCodeLine],
    ["CHEM", RiFlaskLine],
    ["CHMP", RiFlaskLine],
    ["BIOL", RiLeafLine],
    ["PHYS", RiPlanetLine],
    ["MATH", RiCalculatorLine],
    ["STAT", RiBarChartLine],
    ["ECON", RiMoneyDollarCircleLine],
    ["POLS", RiGovernmentLine],
    ["PSYC", RiBrainLine],
    ["SOCI", RiGlobalLine],
    ["HIST", RiBook2Line],
    ["ENGL", RiQuillPenLine],
    ["PHIL", RiLightbulbLine],
    ["AH", RiPaletteLine],
    ["MUS", RiMusic2Line],
    ["PHED", RiRunLine],
    ["NURS", RiHeartPulseLine],
    ["BUS", RiBriefcaseLine],
    ["FIN", RiBriefcaseLine],
    ["IEOR", RiBarChartLine],
    ["MECE", RiCalculatorLine],
    ["BMEN", RiHeartPulseLine],
    ["SPAN", RiTranslate2],
    ["FREN", RiTranslate2],
    ["GERM", RiTranslate2],
    ["ITAL", RiTranslate2],
    ["CHIN", RiTranslate2],
    ["JAPN", RiTranslate2],
    ["KORE", RiTranslate2],
    ["ARAB", RiTranslate2],
    ["HEBR", RiTranslate2],
    ["LATN", RiTranslate2],
    ["GREK", RiTranslate2],
  ];

  for (const [prefix, icon] of prefixes) {
    if (code.startsWith(prefix)) return icon;
  }

  return RiBook2Line;
}

export interface CourseSubjectIconProps {
  subjectCode: string;
  /** Hero straddles the cover band; inline sits beside the title row. */
  variant?: "hero" | "inline";
  className?: string;
}

export function CourseSubjectIcon({
  subjectCode,
  variant = "hero",
  className,
}: CourseSubjectIconProps) {
  const Icon = resolveSubjectIcon(subjectCode);
  const isHero = variant === "hero";

  return (
    <span
      role="img"
      aria-label={`${subjectCode} subject`}
      className={cx(
        "flex shrink-0 items-center justify-center bg-background-secondary-default",
        isHero
          ? "size-20 rounded-full ring-4 ring-background-primary-default"
          : "size-9 rounded-xl ring-1 ring-border-table",
        className,
      )}
    >
      <Icon aria-hidden className={cx("text-text-secondary", isHero ? "size-8" : "size-4")} />
    </span>
  );
}
