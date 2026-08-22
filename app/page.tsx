import { Catalog } from "@/components/Catalog";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { loadCatalog, loadSubjects } from "@/lib/catalog";
import { formatFetchedAt } from "@/lib/format";

// ISR: refresh public HTML about every 10 minutes. Fetch failures render an empty state.
export const revalidate = 600;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const params = await searchParams;
  const [catalog, subjects] = await Promise.all([
    loadCatalog(params.subject),
    loadSubjects(),
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <Catalog catalog={catalog} subjects={subjects} />
      <SiteFooter fetchedAt={formatFetchedAt(catalog.fetchedAt)} />
    </div>
  );
}
