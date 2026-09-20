import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Eye,
  Fingerprint,
  Leaf,
  Network,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, USING_FIXTURES } from "../api/client";
import { Avatar } from "../components/Avatar";
import { InterestEditor } from "../components/InterestEditor";
import type { ActorSummary, InterestRow, Visibility } from "../types/api";
const VISIBILITY_OPTIONS: Visibility[] = ["public", "institution", "private"];
export function Settings() {
  const [actor, setActor] = useState<
    (ActorSummary & { discoverable: boolean }) | null
  >(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const [settings, list] = await Promise.all([
        api.getActorSettings(),
        api.listInterests(),
      ]);
      setActor(settings);
      setInterests(list);
    } catch {
      setError("Your settings could not be loaded. Please try again.");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function handleDiscoverableChange(discoverable: boolean) {
    setBusy(true);
    setError("");
    try {
      await api.setDiscoverable(discoverable);
      setActor((a) => (a ? { ...a, discoverable } : a));
      setStatus("Visibility updated.");
    } catch {
      setError("Your visibility could not be saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function handleVisibilityChange(
    interestId: string,
    visibility: Visibility,
  ) {
    setBusy(true);
    setError("");
    try {
      await api.setInterestVisibility(interestId, visibility);
      setInterests((list) =>
        list.map((i) => (i.id === interestId ? { ...i, visibility } : i)),
      );
      setStatus("Interest visibility updated.");
    } catch {
      setError("Your interest visibility could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page">
      <div className="eyebrow">YOUR SPACE, YOUR CHOICE</div>
      <h1>A little more about you.</h1>
      <p className="settings-intro">
        The best connections start with the things that make you, you.
      </p>
      <Link className="settings-backend-link" to="/settings/backend">
        <span className="settings-backend-icon">
          <Network size={28} strokeWidth={1.4} />
        </span>
        <span>
          <small>HACKATHON TOOLS</small>
          <strong>Visualise backend</strong>
          <span>
            Explore the people, clubs, activities and interests behind every
            connection.
          </span>
        </span>
        <ArrowUpRight size={22} aria-hidden="true" />
      </Link>
      {error && (
        <div className="settings-error" role="alert">
          {error}
          <button className="text-link" onClick={refresh}>
            Try again
          </button>
        </div>
      )}
      <div className="settings-grid">
        <div>
          <section className="settings-card settings-profile">
            <Avatar name={actor?.displayName ?? "Your profile"} size="lg" />
            <div>
              <h2>{actor?.displayName ?? "Loading your profile…"}</h2>
              <p>{actor?.homeUnit?.name ?? "Your campus community"}</p>
              <span>
                <Leaf size={12} />A curious mind in the making.
              </span>
            </div>
          </section>
          <section className="settings-card">
            <div className="settings-section-title">
              <Sparkles size={19} />
              <h2>Follow your interests</h2>
            </div>
            <p className="settings-description">
              What do you know? What would you love to explore?
            </p>
            <InterestEditor
              defaultStance="established"
              showStanceSelector
              onSubmitted={() => {
                void refresh();
                setStatus("Interest added.");
              }}
            />
            <div className="settings-interest-list">
              {interests.map((interest) => (
                <div key={interest.id} className="settings-interest-row">
                  <div>
                    <strong>{interest.conceptLabel ?? interest.rawText}</strong>
                    <span>
                      {interest.stance}
                      {!interest.resolved ? " · Awaiting matching" : ""}
                    </span>
                  </div>
                  <select
                    aria-label={`Visibility for ${interest.conceptLabel ?? interest.rawText}`}
                    value={interest.visibility}
                    disabled={busy}
                    onChange={(e) =>
                      handleVisibilityChange(
                        interest.id,
                        e.target.value as Visibility,
                      )
                    }
                  >
                    {VISIBILITY_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v === "institution"
                          ? "Campus"
                          : v === "public"
                            ? "Public"
                            : "Only me"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside>
          <section className="settings-card settings-privacy">
            <ShieldCheck size={26} />
            <h2>You choose what to share.</h2>
            <p>Your interests tell a story. You control who gets to see it.</p>
            <label className="settings-visibility">
              <span>
                <strong>Let people find me</strong>
                <small>Appear in connection suggestions</small>
              </span>
              <input
                type="checkbox"
                checked={actor?.discoverable ?? false}
                disabled={busy || !actor}
                onChange={(e) => handleDiscoverableChange(e.target.checked)}
              />
            </label>
            <div className="privacy-legend">
              <p>
                <Eye size={14} />
                <span>
                  <strong>Public</strong>Visible beyond your campus
                </span>
              </p>
              <p>
                <Fingerprint size={14} />
                <span>
                  <strong>Campus</strong>Shared with your community
                </span>
              </p>
              <p>
                <ShieldCheck size={14} />
                <span>
                  <strong>Only me</strong>Kept private on your profile
                </span>
              </p>
            </div>
          </section>
          {USING_FIXTURES && (
            <p className="settings-demo-note">
              You’re exploring a demo campus. Settings are saved on this device;
              matching uses the sample interests already in the atlas.
            </p>
          )}
        </aside>
      </div>
      <div className="settings-status" role="status">
        {status}
      </div>
    </div>
  );
}
