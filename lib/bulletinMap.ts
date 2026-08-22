import { BULLETIN_ORIGIN } from "./constants";

// One bulletin page per subject when we know a public CC department URL.
// Unknown subjects skip this fetch and still render directory data.
const SLUGS: Record<string, string> = {
  COMS: "computer-science",
  CSEE: "computer-science",
  CSOR: "computer-science",
  MATH: "mathematics",
  STAT: "statistics",
  ECON: "economics",
  HIST: "history",
  ENGL: "english-comparative-literature",
  PHYS: "physics",
  CHEM: "chemistry",
  BIOL: "biological-sciences",
  PSYC: "psychology",
  POLS: "political-science",
  SOCI: "sociology",
  PHIL: "philosophy",
  RELI: "religion",
  AHIS: "art-history-archaeology",
  MUSI: "music",
  ANTH: "anthropology",
  ASTR: "astronomy",
};

export function bulletinUrlFor(subject: string): string | null {
  const slug = SLUGS[subject];
  if (!slug) return null;
  return `${BULLETIN_ORIGIN}/columbia-college/departments-instruction/${slug}/`;
}
