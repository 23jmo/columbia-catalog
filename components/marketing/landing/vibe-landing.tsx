"use client";

import Link from "next/link";
import { Sora } from "next/font/google";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const SEARCH_EXAMPLES = [
  "easy global core",
  "a math class like the one I took last semester",
  "whatever satisfies my grad requirement",
  "something with Fridays free",
];

const SEARCH_CHIPS = [
  "easy global core",
  "Fridays free",
  "like my last math class",
  "small seminar, great professor",
  "satisfies my science req",
];

const REVIEW_SOURCES = ["CULPA", "Reddit", "RateMyProfessor"];

const AUDIT_PROGRAMS = [
  { code: "CC", name: "Columbia College" },
  { code: "SEAS", name: "Engineering" },
  { code: "GS", name: "General Studies" },
  { code: "BC", name: "Barnard" },
];

const TRUST_ITEMS = [
  "Free, no catch",
  "Built by a Columbia student",
  "Not affiliated with Columbia University",
  "Transcript never leaves your browser",
];

const FAQ_ITEMS = [
  {
    q: "Is LionPlan actually free?",
    a: "Yes. Every feature — search, reviews, the advisor chat, degree audits — is free. No paywall, no trial.",
  },
  {
    q: "Does it see my Columbia login?",
    a: "No. LionPlan never touches SSOL or CUIT credentials. Your transcript is parsed locally in your browser and is never uploaded anywhere.",
  },
  {
    q: "Is this an official Columbia tool?",
    a: "No — it’s an independent project built by a Columbia student. It isn’t affiliated with or endorsed by Columbia University.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Drop in your transcript",
    body: "Any PDF from SSOL. Nothing leaves your device.",
  },
  {
    n: "2",
    title: "We parse it in your browser",
    body: "Completed courses and this term’s schedule fill in automatically.",
  },
  {
    n: "3",
    title: "Get a real degree audit",
    body: "CC, SEAS, GS, and Barnard requirements, mapped against what you’ve actually taken.",
  },
];

export function VibeLanding() {
  return (
    <div className={`vl-root ${sora.className}`}>
      <style>{`
        .vl-root {
          --vl-bg: #07070f;
          --vl-bg-2: #0c0c1c;
          --vl-ink: #f4f3fb;
          --vl-ink-dim: rgba(244, 243, 251, 0.68);
          --vl-ink-faint: rgba(244, 243, 251, 0.44);
          --vl-blue: #6ea8ff;
          --vl-violet: #b98cff;
          --vl-pink: #ff8fc7;
          --vl-gold: #ffd166;
          --vl-glass: rgba(255, 255, 255, 0.06);
          --vl-glass-border: rgba(255, 255, 255, 0.14);
          position: relative;
          isolation: isolate;
          background: var(--vl-bg);
          color: var(--vl-ink);
          overflow-x: clip;
          line-height: 1.4;
        }

        .vl-root * {
          box-sizing: border-box;
        }

        .vl-root a {
          color: inherit;
          text-decoration: none;
        }

        .vl-container {
          max-width: 1120px;
          margin: 0 auto;
          padding: 0 24px;
        }

        /* ---------- background ---------- */

        .vl-field {
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 70% 55% at 18% -8%, rgba(110, 168, 255, 0.28), transparent 60%),
            radial-gradient(ellipse 60% 50% at 88% 8%, rgba(185, 140, 255, 0.24), transparent 60%),
            radial-gradient(ellipse 70% 60% at 50% 100%, rgba(255, 143, 199, 0.14), transparent 65%),
            linear-gradient(180deg, var(--vl-bg) 0%, var(--vl-bg-2) 55%, var(--vl-bg) 100%);
        }

        .vl-grain {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          opacity: 0.5;
          mix-blend-mode: overlay;
          background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
          background-size: 3px 3px;
        }

        .vl-blob {
          position: absolute;
          border-radius: 999px;
          filter: blur(60px);
          opacity: 0.5;
          z-index: 0;
          pointer-events: none;
        }

        .vl-blob-a {
          top: -120px;
          left: -80px;
          width: 420px;
          height: 420px;
          background: radial-gradient(circle, var(--vl-blue), transparent 70%);
          animation: vlFloat 16s ease-in-out infinite;
        }

        .vl-blob-b {
          top: 220px;
          right: -140px;
          width: 460px;
          height: 460px;
          background: radial-gradient(circle, var(--vl-violet), transparent 70%);
          animation: vlFloat 20s ease-in-out infinite reverse;
        }

        .vl-blob-c {
          bottom: -160px;
          left: 30%;
          width: 380px;
          height: 380px;
          background: radial-gradient(circle, var(--vl-pink), transparent 70%);
          animation: vlFloat 18s ease-in-out infinite;
          animation-delay: -6s;
        }

        @keyframes vlFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(24px, -30px) scale(1.06); }
        }

        /* ---------- nav ---------- */

        .vl-nav {
          position: relative;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 24px;
          max-width: 1120px;
          margin: 0 auto;
        }

        .vl-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 1.05rem;
          letter-spacing: -0.01em;
        }

        .vl-brand-mark {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          font-size: 1.1rem;
          background: linear-gradient(135deg, var(--vl-blue), var(--vl-violet));
          box-shadow: 0 6px 18px rgba(110, 168, 255, 0.35);
        }

        .vl-nav-links {
          display: flex;
          align-items: center;
          gap: 20px;
          font-size: 0.92rem;
          color: var(--vl-ink-dim);
        }

        .vl-nav-links a:hover {
          color: var(--vl-ink);
        }

        .vl-nav a.vl-nav-cta,
        .vl-nav-cta {
          padding: 9px 18px;
          border-radius: 999px;
          background: var(--vl-ink);
          color: #0a0a14;
          font-weight: 600;
          font-size: 0.88rem;
        }

        /* ---------- hero ---------- */

        .vl-hero {
          position: relative;
          z-index: 2;
          padding: 64px 24px 96px;
        }

        .vl-hero-inner {
          max-width: 860px;
          margin: 0 auto;
          text-align: center;
        }

        .vl-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 7px 16px;
          border-radius: 999px;
          background: var(--vl-glass);
          border: 1px solid var(--vl-glass-border);
          font-size: 0.82rem;
          color: var(--vl-ink-dim);
          backdrop-filter: blur(12px);
          animation: vlFadeUp 0.7s ease both;
        }

        .vl-headline {
          margin: 26px 0 20px;
          font-size: clamp(2.4rem, 6vw, 4.4rem);
          line-height: 1.05;
          font-weight: 800;
          letter-spacing: -0.03em;
          animation: vlFadeUp 0.8s ease 0.05s both;
        }

        .vl-headline-grad {
          background: linear-gradient(100deg, var(--vl-blue), var(--vl-violet) 45%, var(--vl-pink) 85%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .vl-sub {
          max-width: 620px;
          margin: 0 auto;
          font-size: clamp(1.02rem, 2vw, 1.2rem);
          color: var(--vl-ink-dim);
          animation: vlFadeUp 0.8s ease 0.12s both;
        }

        .vl-cta-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-top: 34px;
          animation: vlFadeUp 0.8s ease 0.2s both;
        }

        .vl-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 26px;
          border-radius: 999px;
          font-weight: 600;
          font-size: 0.98rem;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .vl-btn:active {
          transform: scale(0.97);
        }

        .vl-btn-primary {
          color: #0a0a14;
          background: linear-gradient(100deg, var(--vl-blue), var(--vl-pink));
          box-shadow: 0 12px 30px rgba(185, 140, 255, 0.35);
        }

        .vl-btn-primary:hover {
          box-shadow: 0 16px 38px rgba(185, 140, 255, 0.5);
          transform: translateY(-2px);
        }

        .vl-btn-secondary {
          color: var(--vl-ink);
          background: var(--vl-glass);
          border: 1px solid var(--vl-glass-border);
          backdrop-filter: blur(12px);
        }

        .vl-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.11);
          transform: translateY(-2px);
        }

        .vl-chat-link {
          margin-top: 18px;
          font-size: 0.9rem;
          color: var(--vl-ink-faint);
          animation: vlFadeUp 0.8s ease 0.28s both;
        }

        .vl-chat-link a {
          color: var(--vl-blue);
          border-bottom: 1px solid rgba(110, 168, 255, 0.4);
          padding-bottom: 1px;
        }

        .vl-chat-link a:hover {
          color: var(--vl-pink);
          border-color: rgba(255, 143, 199, 0.5);
        }

        @keyframes vlFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ---------- sections ---------- */

        .vl-section {
          position: relative;
          z-index: 2;
          padding: 84px 24px;
        }

        .vl-section-alt {
          background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.02), transparent);
        }

        .vl-section-head {
          max-width: 620px;
          margin: 0 auto 44px;
          text-align: center;
        }

        .vl-eyebrow {
          display: inline-block;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--vl-gold);
          margin-bottom: 12px;
        }

        .vl-h2 {
          font-size: clamp(1.7rem, 3.6vw, 2.5rem);
          font-weight: 800;
          letter-spacing: -0.02em;
          margin: 0 0 12px;
        }

        .vl-p {
          color: var(--vl-ink-dim);
          font-size: 1.02rem;
          margin: 0;
        }

        .vl-glass-card {
          background: var(--vl-glass);
          border: 1px solid var(--vl-glass-border);
          border-radius: 22px;
          backdrop-filter: blur(16px);
        }

        /* ---------- search showcase ---------- */

        .vl-search-shell {
          max-width: 640px;
          margin: 0 auto;
          padding: 22px 24px;
        }

        .vl-search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .vl-search-icon {
          flex: none;
          opacity: 0.6;
        }

        .vl-search-track {
          position: relative;
          flex: 1;
          height: 1.4em;
          overflow: hidden;
        }

        .vl-search-item {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          color: var(--vl-ink-dim);
          font-size: 1rem;
          opacity: 0;
          animation: vlCycle 12s ease-in-out infinite;
          white-space: nowrap;
        }

        @keyframes vlCycle {
          0%, 2% { opacity: 0; transform: translateY(10px); }
          6%, 20% { opacity: 1; transform: translateY(0); }
          25%, 100% { opacity: 0; transform: translateY(-10px); }
        }

        .vl-chip-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-top: 22px;
        }

        .vl-chip {
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 0.86rem;
          color: var(--vl-ink-dim);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* ---------- reviews ---------- */

        .vl-reviews-wrap {
          max-width: 760px;
          margin: 0 auto;
        }

        .vl-source-row {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        }

        .vl-source-badge {
          padding: 7px 16px;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--vl-ink);
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid var(--vl-glass-border);
        }

        .vl-source-arrow {
          color: var(--vl-ink-faint);
          align-self: center;
        }

        .vl-review-card {
          padding: 28px;
          display: grid;
          gap: 20px;
        }

        .vl-review-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }

        .vl-review-course {
          font-weight: 700;
          font-size: 1.15rem;
        }

        .vl-review-prof {
          color: var(--vl-ink-faint);
          font-size: 0.92rem;
          margin-top: 2px;
        }

        .vl-review-stats {
          display: flex;
          gap: 22px;
        }

        .vl-stat {
          text-align: right;
        }

        .vl-stat-value {
          font-size: 1.3rem;
          font-weight: 800;
        }

        .vl-stat-value.vl-good {
          color: #7ee6a8;
        }

        .vl-stat-label {
          font-size: 0.72rem;
          color: var(--vl-ink-faint);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .vl-review-quote {
          font-size: 1rem;
          color: var(--vl-ink-dim);
          font-style: italic;
          border-left: 2px solid rgba(255, 209, 102, 0.6);
          padding-left: 16px;
        }

        /* ---------- advisor chat ---------- */

        .vl-chat-window {
          max-width: 560px;
          margin: 0 auto;
          overflow: hidden;
        }

        .vl-chat-topbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--vl-glass-border);
        }

        .vl-chat-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.2);
        }

        .vl-chat-title {
          margin-left: 6px;
          font-size: 0.86rem;
          color: var(--vl-ink-faint);
        }

        .vl-chat-body {
          padding: 22px;
          display: grid;
          gap: 14px;
        }

        .vl-bubble {
          max-width: 82%;
          padding: 12px 16px;
          border-radius: 16px;
          font-size: 0.94rem;
          line-height: 1.5;
        }

        .vl-bubble-user {
          justify-self: end;
          background: linear-gradient(100deg, var(--vl-blue), var(--vl-violet));
          color: #0a0a14;
          border-bottom-right-radius: 4px;
        }

        .vl-bubble-bot {
          justify-self: start;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid var(--vl-glass-border);
          border-bottom-left-radius: 4px;
        }

        .vl-bubble-bot strong {
          color: var(--vl-gold);
        }

        .vl-typing {
          justify-self: start;
          display: flex;
          gap: 4px;
          padding: 12px 16px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          border: 1px solid var(--vl-glass-border);
        }

        .vl-typing span {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--vl-ink-faint);
          animation: vlBlink 1.2s ease-in-out infinite;
        }

        .vl-typing span:nth-child(2) { animation-delay: 0.15s; }
        .vl-typing span:nth-child(3) { animation-delay: 0.3s; }

        @keyframes vlBlink {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }

        /* ---------- transcript / setup ---------- */

        .vl-steps {
          max-width: 900px;
          margin: 0 auto 48px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .vl-step {
          padding: 24px;
          border-radius: 18px;
        }

        .vl-step-num {
          display: inline-grid;
          place-items: center;
          width: 30px;
          height: 30px;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 700;
          background: linear-gradient(100deg, var(--vl-blue), var(--vl-pink));
          color: #0a0a14;
          margin-bottom: 14px;
        }

        .vl-step-title {
          font-weight: 700;
          margin-bottom: 6px;
          font-size: 1.02rem;
        }

        .vl-step-body {
          color: var(--vl-ink-dim);
          font-size: 0.92rem;
        }

        .vl-audit-grid {
          max-width: 760px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .vl-audit-card {
          padding: 18px 12px;
          text-align: center;
          border-radius: 16px;
        }

        .vl-audit-code {
          font-weight: 800;
          font-size: 1.1rem;
        }

        .vl-audit-name {
          font-size: 0.78rem;
          color: var(--vl-ink-faint);
          margin-top: 2px;
        }

        .vl-audit-check {
          margin-top: 10px;
          font-size: 0.76rem;
          color: #7ee6a8;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        /* ---------- trust strip ---------- */

        .vl-trust-strip {
          max-width: 960px;
          margin: 0 auto;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 14px 28px;
        }

        .vl-trust-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: var(--vl-ink-dim);
        }

        /* ---------- faq ---------- */

        .vl-faq {
          max-width: 660px;
          margin: 40px auto 0;
          display: grid;
          gap: 12px;
        }

        .vl-faq-item {
          padding: 4px 22px;
          border-radius: 16px;
        }

        .vl-faq-item summary {
          padding: 16px 0;
          cursor: pointer;
          font-weight: 600;
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .vl-faq-item summary::-webkit-details-marker {
          display: none;
        }

        .vl-faq-caret {
          transition: transform 0.2s ease;
          flex: none;
          color: var(--vl-ink-faint);
        }

        .vl-faq-item[open] .vl-faq-caret {
          transform: rotate(45deg);
        }

        .vl-faq-answer {
          color: var(--vl-ink-dim);
          font-size: 0.94rem;
          padding-bottom: 18px;
        }

        /* ---------- closing cta ---------- */

        .vl-cta-final {
          max-width: 720px;
          margin: 0 auto;
          text-align: center;
          padding: 64px 40px;
          border-radius: 32px;
          position: relative;
          overflow: hidden;
        }

        .vl-cta-final::before {
          content: "";
          position: absolute;
          inset: -40%;
          background: conic-gradient(from 0deg, var(--vl-blue), var(--vl-violet), var(--vl-pink), var(--vl-gold), var(--vl-blue));
          opacity: 0.16;
          animation: vlSpin 14s linear infinite;
          z-index: -1;
        }

        @keyframes vlSpin {
          to { transform: rotate(360deg); }
        }

        .vl-cta-final-note {
          margin-top: 16px;
          font-size: 0.86rem;
          color: var(--vl-ink-faint);
        }

        /* ---------- footer ---------- */

        .vl-footer {
          position: relative;
          z-index: 2;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          padding: 36px 24px 44px;
        }

        .vl-footer-inner {
          max-width: 1120px;
          margin: 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .vl-footer-links {
          display: flex;
          gap: 20px;
          font-size: 0.88rem;
          color: var(--vl-ink-dim);
        }

        .vl-footer-links a:hover {
          color: var(--vl-ink);
        }

        .vl-footer-tag {
          font-size: 0.82rem;
          color: var(--vl-ink-faint);
        }

        /* ---------- responsive ---------- */

        @media (max-width: 720px) {
          .vl-nav-links {
            display: none;
          }

          .vl-steps {
            grid-template-columns: 1fr;
          }

          .vl-audit-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .vl-review-top {
            flex-direction: column;
          }

          .vl-review-stats {
            gap: 18px;
          }

          .vl-cta-final {
            padding: 48px 24px;
          }

          .vl-footer-inner {
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .vl-root * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }

          .vl-search-item {
            position: static;
            opacity: 1 !important;
            display: none;
          }

          .vl-search-item:first-child {
            display: flex;
          }
        }
      `}</style>

      <div className="vl-field" aria-hidden="true" />
      <div className="vl-grain" aria-hidden="true" />

      <nav className="vl-nav">
        <div className="vl-brand">
          <span className="vl-brand-mark" aria-hidden="true">
            🦁
          </span>
          LionPlan
        </div>
        <div className="vl-nav-links">
          <a href="#search">Search</a>
          <a href="#reviews">Reviews</a>
          <a href="#advisor">Advisor</a>
          <a href="#setup">Setup</a>
          <Link href="/onboarding" className="vl-nav-cta">
            Get started
          </Link>
        </div>
      </nav>

      <header className="vl-hero">
        <div className="vl-blob vl-blob-a" aria-hidden="true" />
        <div className="vl-blob vl-blob-b" aria-hidden="true" />
        <div className="vl-blob vl-blob-c" aria-hidden="true" />
        <div className="vl-hero-inner">
          <span className="vl-badge">🦁 For Columbia College · SEAS · GS · Barnard</span>
          <h1 className="vl-headline">
            Plan Columbia like you
            <br />
            <span className="vl-headline-grad">actually know what you’re doing.</span>
          </h1>
          <p className="vl-sub">
            Search the whole catalog in plain English, see every review in one place, and chat
            with an advisor that knows your transcript. Free, and built by a Columbia student.
          </p>
          <div className="vl-cta-row">
            <Link href="/onboarding" className="vl-btn vl-btn-primary">
              Get started
            </Link>
            <Link href="/onboarding" className="vl-btn vl-btn-secondary">
              Sign in
            </Link>
          </div>
          <p className="vl-chat-link">
            Or skip ahead and <Link href="/chat">try the advisor chat</Link>
          </p>
        </div>
      </header>

      <section className="vl-section" id="search">
        <div className="vl-container">
          <div className="vl-section-head">
            <span className="vl-eyebrow">Search</span>
            <h2 className="vl-h2">Say what you actually mean</h2>
            <p className="vl-p">
              No dropdown filters, no requirement codes to memorize. Type it like you’d text a
              friend.
            </p>
          </div>
          <div className="vl-search-shell vl-glass-card">
            <div className="vl-search-bar">
              <svg
                className="vl-search-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="vl-search-track">
                {SEARCH_EXAMPLES.map((example, i) => (
                  <span
                    key={example}
                    className="vl-search-item"
                    style={{ animationDelay: `${i * -3}s` }}
                  >
                    “{example}”
                  </span>
                ))}
              </div>
            </div>
            <div className="vl-chip-row">
              {SEARCH_CHIPS.map((chip) => (
                <span key={chip} className="vl-chip">
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="vl-section vl-section-alt" id="reviews">
        <div className="vl-container">
          <div className="vl-section-head">
            <span className="vl-eyebrow">Reviews</span>
            <h2 className="vl-h2">Every review, finally in one place</h2>
            <p className="vl-p">
              CULPA, Reddit, and RateMyProfessor, summarized so you don’t have to open twelve
              tabs before adding a class.
            </p>
          </div>
          <div className="vl-reviews-wrap">
            <div className="vl-source-row">
              {REVIEW_SOURCES.map((source, i) => (
                <span key={source} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="vl-source-badge">{source}</span>
                  {i < REVIEW_SOURCES.length - 1 ? (
                    <span className="vl-source-arrow" aria-hidden="true">
                      +
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
            <div className="vl-review-card vl-glass-card">
              <div className="vl-review-top">
                <div>
                  <div className="vl-review-course">Intro to Comparative Politics</div>
                  <div className="vl-review-prof">Prof. A. Nguyen · POLS UN1201</div>
                </div>
                <div className="vl-review-stats">
                  <div className="vl-stat">
                    <div className="vl-stat-value vl-good">92%</div>
                    <div className="vl-stat-label">Would take again</div>
                  </div>
                  <div className="vl-stat">
                    <div className="vl-stat-value">Moderate</div>
                    <div className="vl-stat-label">Difficulty</div>
                  </div>
                </div>
              </div>
              <p className="vl-review-quote">
                “Explains everything twice: once for the syllabus and once for real.” — summarized
                from 40+ reviews across CULPA, Reddit, and RateMyProfessor.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="vl-section" id="advisor">
        <div className="vl-container">
          <div className="vl-section-head">
            <span className="vl-eyebrow">Advisor</span>
            <h2 className="vl-h2">Your academic advisor, available anytime</h2>
            <p className="vl-p">
              It knows your transcript, your degree requirements, your schedule, and the live
              catalog. It checks prerequisites and time conflicts before you sign up.
            </p>
          </div>
          <div className="vl-chat-window vl-glass-card">
            <div className="vl-chat-topbar">
              <span className="vl-chat-dot" aria-hidden="true" />
              <span className="vl-chat-dot" aria-hidden="true" />
              <span className="vl-chat-dot" aria-hidden="true" />
              <span className="vl-chat-title">LionPlan advisor</span>
            </div>
            <div className="vl-chat-body">
              <div className="vl-bubble vl-bubble-user">
                Can I still graduate on time if I add a CS minor this year?
              </div>
              <div className="vl-bubble vl-bubble-bot">
                Checked your transcript and remaining CC requirements — yes, if you take{" "}
                <strong>COMS 3134</strong> and <strong>COMS 3157</strong> next semester. Heads up:
                the section you’d want overlaps with a class already on your schedule.
              </div>
              <div className="vl-typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="vl-section vl-section-alt" id="setup">
        <div className="vl-container">
          <div className="vl-section-head">
            <span className="vl-eyebrow">Setup</span>
            <h2 className="vl-h2">Start from your actual transcript</h2>
            <p className="vl-p">
              Drop it in — parsed right in your browser, never uploaded — and LionPlan fills in
              what you’ve taken, what you’re taking now, and what’s left.
            </p>
          </div>
          <div className="vl-steps">
            {STEPS.map((step) => (
              <div key={step.n} className="vl-step vl-glass-card">
                <span className="vl-step-num">{step.n}</span>
                <div className="vl-step-title">{step.title}</div>
                <div className="vl-step-body">{step.body}</div>
              </div>
            ))}
          </div>
          <div className="vl-audit-grid">
            {AUDIT_PROGRAMS.map((program) => (
              <div key={program.code} className="vl-audit-card vl-glass-card">
                <div className="vl-audit-code">{program.code}</div>
                <div className="vl-audit-name">{program.name}</div>
                <div className="vl-audit-check">✓ Degree audit ready</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="vl-section">
        <div className="vl-container">
          <div className="vl-trust-strip">
            {TRUST_ITEMS.map((item) => (
              <span key={item} className="vl-trust-item">
                <span aria-hidden="true">✓</span>
                {item}
              </span>
            ))}
          </div>
          <div className="vl-faq">
            {FAQ_ITEMS.map((item) => (
              <details key={item.q} className="vl-faq-item vl-glass-card">
                <summary>
                  {item.q}
                  <span className="vl-faq-caret" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="vl-faq-answer">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="vl-section">
        <div className="vl-container">
          <div className="vl-cta-final vl-glass-card">
            <h2 className="vl-h2">Stop planning in six browser tabs.</h2>
            <p className="vl-p">Search, reviews, advisor, and your degree audit — one place.</p>
            <div className="vl-cta-row">
              <Link href="/onboarding" className="vl-btn vl-btn-primary">
                Get started
              </Link>
            </div>
            <p className="vl-cta-final-note">Free. Takes about two minutes.</p>
          </div>
        </div>
      </section>

      <footer className="vl-footer">
        <div className="vl-footer-inner">
          <div className="vl-brand">
            <span className="vl-brand-mark" aria-hidden="true">
              🦁
            </span>
            LionPlan
          </div>
          <div className="vl-footer-links">
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
          <span className="vl-footer-tag">Not affiliated with Columbia University.</span>
        </div>
      </footer>
    </div>
  );
}
