import type { Program } from "@/lib/requirements/types";

import { formatRule, ruleKindLabel } from "@/lib/marketing/format-rule";

/**
 * The authored groups, as a student can read them.
 *
 * Labels and notes come from the program file. The rule line is
 * `formatRule`, not a dump of the TypeScript object.
 */
export function ProgramGroups({ program }: { program: Program }) {
  return (
    <ol className="flex flex-col gap-6">
      {program.groups.map((group) => (
        <li key={group.id} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="text-title-3-semibold text-text-primary">{group.label}</h2>
            <span className="text-caption-1-medium text-text-tertiary">
              {ruleKindLabel(group.rule.kind)}
            </span>
          </div>
          <p className="text-headline-regular text-pretty text-text-secondary">
            {formatRule(group.rule)}
          </p>
          {group.note ? (
            <p className="text-body-regular text-pretty text-text-tertiary">{group.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
