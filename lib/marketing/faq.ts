/**
 * Short FAQ answers for /faq and for FAQPage JSON-LD.
 *
 * Written so an answer engine can quote one paragraph. Live product
 * only: Columbia College and Columbia Engineering. Barnard and General
 * Studies are coming soon. No user counts. Stellic and Vergil are
 * companions, not things we replace.
 */

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is LionPlan?",
    answer:
      "LionPlan is a Columbia course planner for Columbia College and Columbia Engineering. You tell it your school, major, and what you have taken. It works out what you should take next. A course card shows what a class satisfies and what it unlocks, plus the section time and instructor rating.",
  },
  {
    question: "Is LionPlan an official Columbia tool?",
    answer:
      "No. LionPlan is an unofficial student project. It is not affiliated with Columbia University. It is not a substitute for Stellic, Vergil, or CSA advising.",
  },
  {
    question: "Which schools does LionPlan support?",
    answer:
      "LionPlan is live for Columbia College and Columbia Engineering. Barnard College and General Studies are coming soon. They appear on the school list, but they are not available yet.",
  },
  {
    question: "How is this different from Stellic and Vergil?",
    answer:
      "Stellic is Columbia's degree audit. Vergil is the official catalog and registration system. LionPlan is a companion: it maps bulletin requirements and recommends the next course. It does not replace Stellic or Vergil, and it never registers, drops, or waitlists you.",
  },
  {
    question: "How is this different from the other project also called LionPlan?",
    answer:
      "A different student project is also called LionPlan. That one is an eight-semester visual planner. This site maps bulletin requirements and recommends what to take next for Columbia College and Columbia Engineering.",
  },
  {
    question: "Do I need a Columbia email?",
    answer:
      "You can read the public pages and walk through setup without an account. Saving a plan requires signing in with a Columbia or Barnard Google account. Barnard onboarding is not live yet.",
  },
  {
    question: "Does it replace my CSA adviser?",
    answer:
      "No. LionPlan does not replace your CSA adviser. Confirm requirements with your school before you register. A recommendation can be incomplete, and a seat count can be stale.",
  },
];
