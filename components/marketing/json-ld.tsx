/**
 * One JSON-LD script tag. Data is authored in `lib/marketing`, never
 * from a query string, so stringifying it is safe.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
