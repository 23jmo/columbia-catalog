import { formatEnrollment, remainingSeats } from "@/lib/format";
import type { Enrollment } from "@/lib/types";

export function EnrollmentMeter({ enrollment }: { enrollment: Enrollment }) {
  const cap = Math.max(enrollment.capacity, 1);
  const filled = Math.min(100, (enrollment.enrolled / cap) * 100);
  const open = enrollment.status === "open";
  const left = remainingSeats(enrollment);

  return (
    <div className="min-w-[7.5rem]">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular-nums">{formatEnrollment(enrollment)}</span>
        <span className={open ? "text-open" : "text-brick"}>
          {open ? `${left} open` : enrollment.status === "full" ? "Full" : "—"}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
        <div
          className={`h-full ${open ? "bg-open" : "bg-brick"}`}
          style={{ width: `${filled}%` }}
        />
      </div>
    </div>
  );
}
