/* ------------------------------------------------------------------
   AGENCY SERVICES CATALOG PROVIDER
   Merges Firestore overrides over the SERVICES[] seed data from
   data.ts. Same merge-by-id pattern as DesignCatalogProvider.
   Admin writes to Firestore collection 'agencyServices'.
   Components call useAgencyServices() to get live data.
------------------------------------------------------------------- */

import { createContext, useContext, useEffect, useState } from "react";
import { SERVICES, type ServiceProduct } from "./data";
import { listManaged, type ManagedItem } from "./backend";

interface AgencyServicesCatalog {
  services: ServiceProduct[];
  ready: boolean;
}

const Ctx = createContext<AgencyServicesCatalog>({ services: SERVICES, ready: false });

/** Merge Firestore overrides over the seed array by slug. */
function mergeServices(seeds: ServiceProduct[], overrides: ManagedItem[]): ServiceProduct[] {
  const map = new Map(seeds.map((s) => [s.slug, s]));
  for (const doc of overrides) {
    const slug = (doc as unknown as ServiceProduct).slug;
    if (slug && map.has(slug)) {
      map.set(slug, { ...map.get(slug)!, ...(doc as unknown as Partial<ServiceProduct>) });
    }
  }
  return Array.from(map.values());
}

export function AgencyServicesProvider({ children }: { children: React.ReactNode }) {
  const [services, setServices] = useState<ServiceProduct[]>(SERVICES);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const overrides = await listManaged("agencyServices");
        if (!cancelled) {
          setServices(mergeServices(SERVICES, overrides));
        }
      } catch {
        // Firestore unavailable — fall back to seeds silently
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    load();

    // Re-sync when admin makes a change
    const handler = () => load();
    window.addEventListener("sk-content-changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("sk-content-changed", handler);
    };
  }, []);

  return <Ctx.Provider value={{ services, ready }}>{children}</Ctx.Provider>;
}

export function useAgencyServices(): AgencyServicesCatalog {
  return useContext(Ctx);
}
