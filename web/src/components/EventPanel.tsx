import { useEffect, useRef } from "react";
import { CalendarDays, MapPin, X } from "lucide-react";
import type { EventSummary, Reason } from "../types/api";
export function EventPanel({
  event,
  reasons,
  demo,
  onClose,
}: {
  event: EventSummary;
  reasons: Reason[];
  demo: boolean;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        e.preventDefault();
        closeButton.current?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  const when = new Date(event.startsOn);
  const whenLabel = Number.isNaN(when.getTime())
    ? event.startsOn
    : when.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
  return (
    <div
      className="profile-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-title"
        className="profile-dialog"
      >
        <div className="profile-dialog-top">
          <span>{demo ? "Sample campus event" : "Around your campus"}</span>
          <button
            ref={closeButton}
            className="icon-button"
            onClick={onClose}
            aria-label="Close event"
          >
            <X size={21} />
          </button>
        </div>
        <div className="profile-dialog-heading">
          <span className="event-glyph" style={{ margin: "0 auto 25px" }}>
            <CalendarDays size={25} />
          </span>
          <h2 id="event-title">{event.title}</h2>
          <p>{whenLabel}</p>
          {event.venue && (
            <p>
              <MapPin size={12} /> {event.venue}
            </p>
          )}
        </div>
        <div className="profile-concepts">
          {event.topConcepts.map((c) => (
            <span key={c.conceptId}>{c.label}</span>
          ))}
        </div>
        <section className="profile-evidence">
          <h3>A good reason to be there</h3>
          {reasons.map((reason, i) => (
            <article key={i}>
              <p>{reason.prose ?? reason.summary}</p>
            </article>
          ))}
        </section>
        {demo && (
          <p className="local-demo-note">
            This event is part of the sample campus. Dates and locations are
            illustrative; registration is not available.
          </p>
        )}
      </aside>
    </div>
  );
}
