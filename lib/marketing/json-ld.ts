import { FAQ_ITEMS } from "./faq";
import { SITE_ORIGIN } from "./site";

export function organizationWebsiteGraph(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "LionPlan",
        url: SITE_ORIGIN,
      },
      {
        "@type": "WebSite",
        name: "LionPlan",
        url: SITE_ORIGIN,
      },
    ],
  };
}

export function softwareApplicationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "LionPlan",
    url: SITE_ORIGIN,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    description:
      "A Columbia course planner for Columbia College and Columbia Engineering. Tell it your school, major, and what you have taken, and it works out what you should take next.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

export function faqPageJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
