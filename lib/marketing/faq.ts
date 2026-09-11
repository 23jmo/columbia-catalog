/**
 * Short FAQ answers for /faq and for FAQPage JSON-LD.
 *
 * Written so an answer engine can quote one paragraph. Live product
 * only: Columbia College, Columbia Engineering, Barnard College, and partial
 * General Studies coverage. No user counts. Stellic and Vergil
 * are companions, not things we replace.
 *
 * These answers get quoted verbatim by search engines and assistants,
 * which is exactly why a stale one is expensive: "Barnard is not live
 * yet" outlives the fix in somebody's index. Barnard went live on
 * 2026-08-30.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is LionPlan?",
    answer:
      "LionPlan is a course planner for Columbia College, Columbia Engineering, Barnard College, and selected General Studies programs. You tell it your school, major, and what you have taken. It works out what you should take next. A course card shows what a class satisfies and what it unlocks, plus the section time and instructor rating.",
  },
  {
    question: "Is LionPlan an official Columbia tool?",
    answer:
      "No. LionPlan is an unofficial student project. It is not affiliated with Columbia University or Barnard College. It is not a substitute for Stellic, Vergil, or advising at CSA or Barnard.",
  },
  {
    question: "Which schools does LionPlan support?",
    answer:
      "LionPlan is live for Columbia College, Columbia Engineering, and Barnard College. General Studies support has started with the GS Core and Medical Humanities major; other GS majors are still being added. Barnard support covers Foundations and eleven majors read from Barnard's own catalogue.",
  },
  {
    question: "How is this different from Stellic and Vergil?",
    answer:
      "Stellic is Columbia's degree audit. Vergil is the official catalog and registration system. LionPlan is a companion: it maps bulletin requirements and recommends the next course. It does not replace Stellic or Vergil, and it never registers, drops, or waitlists you.",
  },
  {
    question: "How is this different from the other project also called LionPlan?",
    answer:
      "A different student project is also called LionPlan. That one is an eight-semester visual planner. This site maps bulletin and catalogue requirements and recommends what to take next for Columbia College, Columbia Engineering, Barnard College, and selected General Studies programs.",
  },
  {
    question: "Do I need a Columbia email?",
    answer:
      "You can read the public pages and walk through setup without an account. Saving a plan requires signing in with a Columbia or Barnard Google account. Barnard onboarding is live: pick Barnard College and your major, and the audit runs against Foundations and your major's requirements.",
  },
  {
    question: "Does it replace my CSA adviser?",
    answer:
      "No. LionPlan does not replace your CSA adviser, or your Barnard adviser. Confirm requirements with your school before you register. A recommendation can be incomplete, and a seat count can be stale.",
  },
];
