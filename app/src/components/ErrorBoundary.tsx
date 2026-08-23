import { Component, type ReactNode } from "react";
import { Link } from "react-router-dom";

/* ------------------------------------------------------------------
   ERROR BOUNDARY (2026 resilience baseline)
   A rendering failure on any route degrades to a recoverable
   screen instead of a white page. Errors are logged for triage.
------------------------------------------------------------------- */

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[error-boundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="wrap pt-24 pb-32 min-h-[60vh]">
          <span className="idx">/error</span>
          <h1 className="display-section mt-4">Something snapped.</h1>
          <p className="mt-4 text-[var(--muted)] max-w-md">
            The page hit an unexpected error. Your cart and project data are safe — try reloading.
          </p>
          <div className="mt-8 flex gap-4">
            <button className="btn btn-fill" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>Reload page</button>
            <Link to="/" className="btn btn-ghost">Back home</Link>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
