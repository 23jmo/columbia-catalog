/**
 * The profile screen's public surface.
 *
 * `app/profile/page.tsx` is the only intended consumer. Everything is exported
 * from here rather than reached for by path so the route never depends on the
 * internal file layout of this lane.
 */

export { AttestToggle } from "./attest-toggle";
export { AuditTree } from "./audit-tree";
export { CandidateChips } from "./candidate-chips";
export { CoursePicker, type CourseSuggestion } from "./course-picker";
export { CourseworkCard } from "./coursework-card";
export { ProfileCover } from "./cover";
export { DataCard } from "./data-card";
export { DegreeSetup, type ProgramOption } from "./degree-setup";
export { OutstandingCard } from "./outstanding-card";
export { ProfileHero } from "./profile-hero";
export { ProfileModal } from "./profile-modal";
export { RecommendedCourses } from "./recommended-courses";
export { RecordControls } from "./record-controls";
export { RemoveCourseButton } from "./remove-course-button";
export { SignInNotice } from "./sign-in-notice";
export { TranscriptImport } from "./transcript-import";

export {
  STATUS_LABEL,
  VERIFICATION_CHIP_COLOR,
  VERIFICATION_LABEL,
  VERIFICATION_NOTE,
  initialsOf,
  outstandingLabel,
  percentLabel,
  progressLabel,
  stableHash,
  statusFillClass,
  statusToneClass,
  verificationLabelFor,
  verificationNoteFor,
} from "./format";
