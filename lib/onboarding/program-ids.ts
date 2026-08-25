/**
 * Onboarding-only program id helpers.
 *
 * Kept in a leaf module so server actions can import them without pulling
 * `state.ts` through Turbopack's RSC graph (which was resolving
 * `declaredProgramIds` as undefined at runtime).
 */

/** Guest-only sentinel for "no minors"; never migrated or audited. */
export const NO_MINORS_PROGRAM_ID = "__onboarding-no-minors__";

/** Program ids that name real degree programs — strips onboarding-only sentinels. */
export function declaredProgramIds(programIds: readonly string[]): string[] {
  return programIds.filter((id) => id !== NO_MINORS_PROGRAM_ID);
}

export function hasDeclinedMinors(programIds: readonly string[]): boolean {
  return programIds.includes(NO_MINORS_PROGRAM_ID);
}
