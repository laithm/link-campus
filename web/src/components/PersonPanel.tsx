import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Link2, Send, X } from "lucide-react";
import type { ActorSummary, Reason } from "../types/api";
import { collabApi } from "../api/collab";
import { USING_FIXTURES } from "../api/client";
import { Avatar } from "./Avatar";
import { AiSummary } from "./AiSummary";

export function PersonPanel({
  actor,
  reasons,
  onClose,
}: {
  actor: ActorSummary;
  reasons: Reason[];
  onClose: () => void;
}) {
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<{ id: string; state: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const beforeOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const els = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input, textarea, select, [tabindex="0"]',
          ) ?? []),
        ].filter((el) => el.getClientRects().length > 0);
        const first = els[0],
          last = els[els.length - 1];
        if (!dialog.current?.contains(document.activeElement)) {
          e.preventDefault();
          first?.focus();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = beforeOverflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (sent)
      dialog.current?.querySelector<HTMLElement>(".request-success a")?.focus();
  }, [sent]);
  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await collabApi.start(actor.id, text.trim());
      setSent({ id: r.conversationId, state: r.state });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="profile-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        ref={dialog}
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-name"
      >
        <div className="profile-dialog-top">
          <span>A little common ground</span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close profile"
          >
            <X size={21} />
          </button>
        </div>
        <div className="profile-dialog-heading">
          <Avatar name={actor.displayName} size="lg" />
          <h2 id="profile-name">{actor.displayName}</h2>
          <p>
            {[actor.homeUnit?.name, actor.personKind ?? actor.kind]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="profile-concepts">
          {actor.topConcepts.map((c) => (
            <span key={c.conceptId}>{c.label}</span>
          ))}
        </div>
        <section className="profile-evidence">
          <h3>Why you two connect</h3>
          {reasons.length ? (
            reasons.map((reason, i) => (
              <article key={i}>
                <div>
                  <Link2 size={14} />
                  {reason.kind === "shared_concept"
                    ? "A shared interest"
                    : reason.kind === "shared_context"
                      ? "Common ground"
                      : "A mutual connection"}
                </div>
                <p>{reason.prose ?? reason.summary}</p>
                {reason.evidence.length > 0 && (
                  <small>
                    Based on: {reason.evidence.map((e) => e.label).join(" · ")}
                  </small>
                )}
              </article>
            ))
          ) : (
            <p>Explore their interests and see what starts a conversation.</p>
          )}
        </section>
        {actor.kind === "person" && !USING_FIXTURES && (
          <AiSummary actorId={actor.id} name={actor.displayName} />
        )}
        <section className="profile-contact">
          {sent ? (
            <div className="request-success" role="status">
              <Check size={23} />
              <strong>
                {USING_FIXTURES
                  ? "Your demo request is saved."
                  : sent.state === "accepted"
                    ? "Message sent."
                    : "Connection request sent."}
              </strong>
              <p>
                {USING_FIXTURES
                  ? "Saved on this device for the preview. No message was sent."
                  : `${actor.displayName.split(" ")[0]} can choose whether to accept your request.`}
              </p>
              <Link
                to={`/collaborations?tab=messages&c=${sent.id}`}
                onClick={onClose}
              >
                View conversation <ArrowUpRight size={15} />
              </Link>
            </div>
          ) : composing ? (
            <form onSubmit={handleSend}>
              <label htmlFor="connection-message">
                Start with something you share.
              </label>
              <textarea
                id="connection-message"
                autoFocus
                rows={5}
                maxLength={4000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Hi ${actor.displayName.split(" ")[0]}, I noticed we’re both interested in ${actor.topConcepts[0]?.label ?? "similar things"}…`}
              />
              <p>
                {USING_FIXTURES
                  ? "This is a local preview. Your request stays on this device."
                  : "Your first message is a request. They decide whether to connect."}
              </p>
              {error && (
                <p className="profile-error" role="alert">
                  {error}
                </p>
              )}
              <div className="profile-contact-actions">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy || !text.trim()}
                >
                  {busy
                    ? "Saving…"
                    : USING_FIXTURES
                      ? "Save demo request"
                      : "Send connection request"}
                  <Send size={15} />
                </button>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => setComposing(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              {(actor.contact.hasAccount || USING_FIXTURES) &&
              actor.kind === "person" ? (
                <button
                  className="primary-button"
                  onClick={() => setComposing(true)}
                >
                  Say hello to {actor.displayName.split(" ")[0]}
                  <ArrowUpRight size={17} />
                </button>
              ) : actor.contact.methods.length > 0 ? (
                actor.contact.methods.map((m, i) => (
                  <p className="profile-contact-method" key={i}>
                    <small>{m.label ?? m.kind}</small>
                    {m.value}
                  </p>
                ))
              ) : (
                <p>No contact details shared yet.</p>
              )}
              <p className="local-demo-note">
                {USING_FIXTURES
                  ? "Sample profile · Local demo · No real messages"
                  : "A shared interest is the beginning. You decide what comes next."}
              </p>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
