export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card px-6 py-14 text-center shadow-[var(--shadow)]">
      <p className="font-display text-2xl text-navy-deep">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-soft">{body}</p>
    </div>
  );
}
