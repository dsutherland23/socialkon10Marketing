import { Link } from "react-router-dom";
import { DEPARTMENTS, SERVICES } from "../lib/data";
import { useContent } from "../lib/content";

export function SiteFooter() {
  const { contact, socials } = useContent();
  return (
    <footer className="rule-t mt-0" style={{ background: "var(--ink)", color: "var(--bg)" }}>
      <div className="h-[3px] dept-bg" aria-hidden />
      <div className="wrap py-16">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-display-wide text-3xl font-bold uppercase leading-none">Social Kon10</p>
            <p className="font-meta text-[10px] mt-2 opacity-60">Marketing — Kingston, Jamaica</p>
            <p className="mt-6 max-w-sm text-sm opacity-80 leading-relaxed">
              Design that connects. Marketing that moves. Digital experiences that grow.
            </p>
            <div className="mt-8 flex flex-col gap-2 font-meta text-[11px]">
              <a className="u-line w-fit" href={`tel:${contact.phoneHref}`}>{contact.phone}</a>
              <a className="u-line w-fit" href={`mailto:${contact.email}`}>{contact.email}</a>
              <span className="opacity-60">{contact.location}</span>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-meta text-[10px]" aria-label="Social links">
              {socials.map((s) => (
                <li key={s.id}><a className="u-line opacity-70 hover:opacity-100 transition-opacity" href={s.href} target="_blank" rel="noreferrer">{s.label.toUpperCase()}</a></li>
              ))}
            </ul>
          </div>

          <nav className="lg:col-span-3" aria-label="Footer services">
            <p className="font-meta text-[10px] opacity-60 mb-4">Departments</p>
            <ul className="flex flex-col gap-2.5 text-sm">
              {DEPARTMENTS.map((d) => (
                <li key={d.id}>
                  <Link to={d.path} className="u-line"><span className="idx mr-2" style={{ color: "inherit", opacity: 0.6 }}>{d.index}</span>{d.name}</Link>
                </li>
              ))}
            </ul>
            <p className="font-meta text-[10px] opacity-60 mt-8 mb-4">Popular services</p>
            <ul className="flex flex-col gap-2.5 text-sm">
              {SERVICES.filter((s) => s.featured).slice(0, 5).map((s) => (
                <li key={s.id}><Link className="u-line" to={`/services/${s.slug}`}>{s.name}</Link></li>
              ))}
            </ul>
          </nav>

          <nav className="lg:col-span-2" aria-label="Footer site">
            <p className="font-meta text-[10px] opacity-60 mb-4">Studio</p>
            <ul className="flex flex-col gap-2.5 text-sm">
              {[["/work", "Work"], ["/packages", "Packages"], ["/about", "About"], ["/insights", "Insights"], ["/start", "Contact"], ["/checkout", "Checkout"]].map(([to, l]) => (
                <li key={to}><Link className="u-line" to={to}>{l}</Link></li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-2">
            <p className="font-meta text-[10px] opacity-60 mb-4">Start</p>
            <Link to="/start" className="btn !border-current hover:!border-[var(--dept)] hover:!text-[var(--dept)]" style={{ color: "inherit" }}>
              Start a project <span className="btn-arrow" aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <div className="mt-16 pt-6 flex flex-col sm:flex-row justify-between gap-3 font-meta text-[10px] opacity-50" style={{ borderTop: "1px solid rgba(128,128,128,0.3)" }}>
          <span>© {new Date().getFullYear()} Social Kon10 Marketing</span>
          <span>Design that connects · Marketing that moves · Digital that grows</span>
        </div>
      </div>
    </footer>
  );
}
