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
  reason: string;
  days: readonly boolean[];
  time: string;
  instructor: string;
  location: string;
  rating?: string;
  reviews?: number;
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
    reason: "Clears University Writing · Columbia Core",
    days: [false, true, false, true, false],
    time: "11:40am–12:55pm",
    instructor: "Emily M Suazo",
    location: "Lerner Hall",
    rating: "4.5",
    reviews: 9,
    seatsLabel: "Full",
    enrolled: 16,
    capacity: 16,
    fill: 100,
    tone: "full",
  },
  {
    code: "HUMA 1001",
    section: "001",
    credits: 4,
    title: "Literature Humanities I",
    reason: "Clears Literature Humanities · Columbia Core",
    days: [true, false, true, false, false],
    time: "8:10am–10:00am",
    instructor: "Jilian A Pizzi",
    location: "Hamilton 302",
    seatsLabel: "2 seats left",
    enrolled: 19,
    capacity: 21,
    fill: 90,
    tone: "tight",
  },
  {
    code: "ECON 1105",
    section: "002",
    credits: 4,
    title: "Principles of Economics",
    reason: "Clears Principles of Economics · SEAS Core",
    days: [true, false, true, false, false],
    time: "2:40pm–3:55pm",
    instructor: "Prajit K Dutta",
    location: "Schermerhorn 501",
    rating: "4.2",
    reviews: 22,
    seatsLabel: "50 seats left",
    enrolled: 139,
    capacity: 189,
    fill: 74,
    tone: "open",
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
            width: 20,
            height: 20,
            borderRadius: 6,
            background: days[index] ? "#2b7fff" : "#f2f4f7",
            color: days[index] ? "#ffffff" : "#98a2b3",
            fontSize: 10,
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
        gap: 6,
        width: "100%",
        padding: "13px 14px 11px",
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
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.45,
        }}
      >
        <div style={{ display: "flex" }}>
          {course.code} · SEC {course.section} · FALL 2026
        </div>
        <div
          style={{
            display: "flex",
            padding: "3px 7px",
            borderRadius: 999,
            background: "#f2f4f7",
            color: "#475467",
            fontSize: 10,
            letterSpacing: 0,
          }}
        >
          {course.credits} PTS
        </div>
      </div>

      <div style={{ color: "#101828", fontSize: 21, fontWeight: 700, letterSpacing: -0.45 }}>
        {course.title}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#175cd3", fontSize: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 15,
            height: 15,
            borderRadius: 999,
            background: "#eff8ff",
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          ✓
        </div>
        {course.reason}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <WeekStrip days={course.days} />
        <div style={{ display: "flex", color: "#344054", fontSize: 13, fontWeight: 600 }}>
          {course.time}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#667085",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex" }}>
          {course.instructor} · {course.location}
        </div>
        {course.rating ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#344054" }}>
            <span style={{ color: "#f79009" }}>★</span>
            <span style={{ fontWeight: 700 }}>{course.rating}/5</span>
            <span style={{ color: "#98a2b3" }}>({course.reviews})</span>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
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
            fontSize: 11,
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
            {course.enrolled} / {course.capacity} enrolled
          </div>
        </div>
        <div style={{ display: "flex", paddingLeft: 2, color: "#98a2b3", fontSize: 9.5 }}>
          Directory as of Aug 22, 9:00 PM
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
                gap: 10,
                marginTop: "auto",
                color: "#344054",
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: "#2b7fff",
                }}
              />
              lionplan.org
            </div>
          </div>

          <div
            style={{
              alignSelf: "center",
              display: "flex",
              flexDirection: "column",
              width: 450,
              gap: 9,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 4px 2px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ color: "#667085", fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>
                  YOUR NEXT TERM
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
                  Recommended for you
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "#ecfdf3",
                  color: "#027a48",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                LIVE
              </div>
            </div>

            {courses.map((course) => (
              <CourseCard key={`${course.code}-${course.section}`} course={course} />
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
