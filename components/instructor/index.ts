/**
 * Instructor profile lane — public surface.
 *
 * NOTE ON BUNDLING: `ClassroomLoadCard` pulls Recharts in. A surface that wants
 * it split out should import that file directly and wrap it in `next/dynamic`
 * rather than reaching through this barrel.
 */

export { InstructorProfileCard } from "./profile-card";
export type { InstructorProfileCardProps } from "./profile-card";

export { ActivityHeatmap, heatmapSummary } from "./activity-heatmap";
export type { ActivityHeatmapProps, ActivityMetric } from "./activity-heatmap";

export { TeachingRhythmCard } from "./teaching-rhythm";
export type { TeachingRhythmCardProps } from "./teaching-rhythm";

export { ClassroomLoadCard } from "./classroom-load";
export type { ClassroomLoadCardProps } from "./classroom-load";

export { CoursesTaught } from "./courses-taught";
export type { CoursesTaughtProps } from "./courses-taught";

export { InstructorDetailsCard } from "./details-card";
export type { InstructorDetailsCardProps } from "./details-card";

export { InstructorReviewsCard } from "./reviews-card";
export type { InstructorReviewsCardProps } from "./reviews-card";

export { InstructorLink, InstructorLinks, isLinkableInstructor } from "./instructor-link";
export type { InstructorLinkProps } from "./instructor-link";

export { ProfileCover } from "./cover";
export {
  accentForSubject,
  countLabel,
  compactLabel,
  durationLabel,
  percentLabel,
  shortDateLabel,
  stableHash,
  tierFor,
  weekdayListLabel,
} from "./format";
export type { HeatmapAccent } from "./format";
