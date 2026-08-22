// Normalized catalog types. Directory HTML is the source of truth.
// Bulletin meeting times are optional enrichment.

export type EnrollmentStatus = "open" | "full" | "unknown";

export type Meeting = {
  days: string;
  start: string;
  end: string;
  location?: string;
};

export type Credits = {
  min: number;
  max: number;
};

export type Enrollment = {
  enrolled: number;
  capacity: number;
  status: EnrollmentStatus;
  asOf?: string;
};

export type Section = {
  courseIdentifier: string;
  classIdentifier: string;
  callNumber: string;
  title: string;
  subject: string;
  courseNumber: string;
  section: string;
  credits: Credits;
  instructors: string[];
  meetings: Meeting[];
  enrollment: Enrollment;
  term: string;
  source: "directory" | "directory+bulletin";
  fetchedAt: string;
  notes?: string;
  detailPath?: string;
};

export type SubjectOption = {
  code: string;
  name: string;
};

export type SectionDetail = Section & {
  description?: string;
  prerequisites?: string;
  type?: string;
  instructionMethod?: string;
  openTo?: string;
  gradingMode?: string;
};

export type CatalogResult = {
  ok: boolean;
  subject: string;
  subjectName?: string;
  term: string;
  sections: Section[];
  fetchedAt: string;
  error?: string;
  bulletinJoined: boolean;
};
