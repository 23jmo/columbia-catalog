/* eslint-disable @next/next/no-img-element */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt =
  "LionPlan — personalized course recommendations for Columbia and Barnard";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const assetData = Promise.all([
  readFile(join(process.cwd(), "app/icon.png")),
  readFile(join(process.cwd(), "public/art/campus-plate.png")),
]);

interface SocialCourse {
  code: string;
  section: string;
  credits: number;
  title: string;
  school?: "Barnard";
  ratings: readonly string[];
  days: readonly boolean[];
  time: string;
  instructor: string;
  location: string;
  seatsLabel: string;
  enrolled: number;
  capacity: number;
  fill: number;
  tone: "open" | "tight" | "full";
}

const courses: readonly SocialCourse[] = [
  {
    code: "ENGL 1010",
    section: "338",
    credits: 3,
    title: "University Writing",
    ratings: ["Professor 4.5/5 · CULPA"],
    days: [false, true, false, true, false],
    time: "11:40am–12:55pm",
    instructor: "Emily M Suazo",
    location: "Lerner Hall",
    seatsLabel: "Full",
    enrolled: 16,
    capacity: 16,
    fill: 100,
    tone: "full",
  },
  {
    code: "HUMA 1001",
    section: "042",
    credits: 4,
    title: "Literature Humanities I",
    ratings: ["Very heavy workload", "Professor 4.3/5 · CULPA"],
    days: [false, true, false, true, false],
    time: "10:10am–12:00pm",
    instructor: "Molly Murray",
    location: "Hamilton 301",
    seatsLabel: "1 seat left",
    enrolled: 19,
    capacity: 20,
    fill: 95,
    tone: "tight",
  },
  {
    code: "ECON 1003",
    section: "003",
    credits: 4,
    title: "Intro to Economic Reasoning",
    school: "Barnard",
    ratings: ["Hard difficulty", "Professor 3.9/5 · CULPA"],
    days: [false, true, false, true, false],
    time: "11:40am–12:55pm",
    instructor: "Rajiv Sethi",
    location: "R&D Science Center",
    seatsLabel: "3 seats left",
    enrolled: 57,
    capacity: 60,
    fill: 95,
    tone: "tight",
  },
];

const seatTone = {
  open: { fill: "#d1fadf", text: "#067647" },
  tight: { fill: "#fef0c7", text: "#b54708" },
  full: { fill: "#fee4e2", text: "#b42318" },
} as const;

function WeekStrip({ days }: { days: readonly boolean[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {["M", "T", "W", "T", "F"].map((day, index) => (
        <div
          key={`${day}-${index}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 19,
            height: 19,
            borderRadius: 6,
            background: days[index] ? "#2b7fff" : "#f2f4f7",
            color: days[index] ? "#ffffff" : "#98a2b3",
            fontSize: 9.5,
            fontWeight: 700,
          }}
        >
          {day}
        </div>
      ))}
    </div>
  );
}

function CourseCard({ course }: { course: SocialCourse }) {
  const tone = seatTone[course.tone];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        width: "100%",
        padding: "13px 15px 11px",
        borderRadius: 18,
        border: "1px solid #dfe3e8",
        background: "rgba(255,255,255,0.98)",
        boxShadow: "0 12px 34px rgba(16,24,40,0.10)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#667085",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.45,
        }}
      >
        <div style={{ display: "flex" }}>
          {course.school ? `${course.school} · ` : ""}SEC {course.section} · FALL 2026
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, letterSpacing: 0 }}>
          <div
            style={{
              display: "flex",
              padding: "2px 6px",
              borderRadius: 999,
              background: "#f2f4f7",
              color: "#475467",
              fontSize: 10,
            }}
          >
            {course.credits} PTS
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              padding: "2px 7px",
              borderRadius: 999,
              background: "#eff8ff",
              color: "#175cd3",
              fontSize: 10,
            }}
          >
            Open in Vergil
            <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M3 9 9 3M4.5 3H9v4.5"
                fill="none"
                stroke="#2b7fff"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div style={{ color: "#101828", fontSize: 21, fontWeight: 700, letterSpacing: -0.45 }}>
        {course.title}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#475467", fontSize: 10.5 }}>
        {course.ratings.map((rating) => (
          <div key={rating} style={{ display: "flex" }}>
            ({rating})
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <WeekStrip days={course.days} />
        <div style={{ display: "flex", color: "#344054", fontSize: 12.5, fontWeight: 600 }}>
          {course.time}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#667085",
          fontSize: 11.5,
        }}
      >
        <div style={{ display: "flex" }}>
          {course.instructor} · {course.location}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 23,
            overflow: "hidden",
            padding: "0 9px",
            borderRadius: 8,
            border: "1px solid #e4e7ec",
            background: "#f9fafb",
            fontSize: 10.5,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "0 auto 0 0",
              display: "flex",
              width: `${course.fill}%`,
              background: tone.fill,
            }}
          />
          <div style={{ position: "relative", display: "flex", color: tone.text, fontWeight: 700 }}>
            {course.seatsLabel}
          </div>
          <div style={{ position: "relative", display: "flex", color: "#667085" }}>
            {course.enrolled} / {course.capacity} · Aug 22, 9 PM
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function OpenGraphImage() {
  const [appIcon, campusPlate] = await assetData;
  const appIconUrl = `data:image/png;base64,${appIcon.toString("base64")}`;
  const campusPlateUrl = `data:image/png;base64,${campusPlate.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#f8fafc",
          color: "#101828",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -190,
            left: -120,
            width: 560,
            height: 560,
            borderRadius: 999,
            background: "radial-gradient(circle, #d9ecff 0%, rgba(239,247,255,0) 72%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -70,
            bottom: -36,
            display: "flex",
            width: 760,
            height: 321,
            opacity: 0.14,
          }}
        >
          <img
            src={campusPlateUrl}
            alt=""
            width={760}
            height={321}
            style={{ width: "760px", height: "321px" }}
          />
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            padding: "64px 68px",
            gap: 54,
          }}
        >
          <div
            style={{
              display: "flex",
            flexDirection: "column",
              width: 570,
              height: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  overflow: "hidden",
                  boxShadow: "0 10px 24px rgba(0, 36, 92, 0.22)",
                }}
              >
                <img
                  src={appIconUrl}
                  alt=""
                  width={58}
                  height={58}
                  style={{ width: "58px", height: "58px", borderRadius: 999 }}
                />
              </div>
              <div style={{ fontSize: 33, fontWeight: 700, letterSpacing: -1 }}>LionPlan</div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 62,
                gap: 22,
              }}
            >
              <div
                style={{
                  maxWidth: 590,
                  fontSize: 70,
                  fontWeight: 760,
                  letterSpacing: -3.7,
                  lineHeight: 1.02,
                }}
              >
                Know what to take next.
              </div>
              <div
                style={{
                  maxWidth: 540,
                  color: "#475467",
                  fontSize: 27,
                  lineHeight: 1.35,
                }}
              >
                Personalized course recommendations for Columbia and Barnard students.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: "auto",
                color: "#175cd3",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: -0.45,
              }}
            >
              lionplan.org
              <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 17 17 7M9 7h8v8"
                  fill="none"
                  stroke="#2b7fff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div
            style={{
              alignSelf: "center",
              display: "flex",
              flexDirection: "column",
              width: 462,
              gap: 8,
            }}
          >
            {courses.map((course, index) => (
              <div
                key={`${course.code}-${course.section}`}
                style={{
                  position: "relative",
                  display: "flex",
                  width: "100%",
                  marginTop: index === 0 ? 0 : -16,
                  zIndex: index + 1,
                  transform:
                    index === 0
                      ? "translateX(-5px) rotate(-1.8deg)"
                      : index === 1
                        ? "translateX(4px) rotate(0.6deg)"
                        : "translateX(-1px) rotate(1.8deg)",
                }}
              >
                <CourseCard course={course} />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
