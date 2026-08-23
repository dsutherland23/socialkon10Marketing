import { Link } from "react-router-dom";
import { useDepartment } from "../lib/dept";
import { useSEO } from "../lib/seo";

export default function NotFound() {
  useDepartment(null);
  useSEO({ title: "404 — File not found | Social Kon10", description: "This page doesn't exist in the archive." });
  return (
    <section className="wrap py-32 md:py-44 text-center">
      <span className="idx">/error</span>
      <h1 className="display-hero mt-4">404 — File not found.</h1>
      <p className="mt-6 text-[var(--muted)]">This file isn't in the archive. It may have moved, or never existed.</p>
      <div className="mt-10 flex justify-center gap-4">
        <Link to="/" className="btn btn-fill">Back home</Link>
        <Link to="/work" className="btn btn-ghost">Open the archive</Link>
      </div>
    </section>
  );
}
