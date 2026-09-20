import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  ChevronDown,
  Compass,
  Database,
  Layers3,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { CollabProvider, useCollab } from "../collab/CollabContext";
import { USING_FIXTURES } from "../api/client";
import { Avatar } from "./Avatar";

const NAV = [
  { to: "/", label: "Discover", icon: Compass },
  { to: "/network", label: "Database atlas", icon: Database },
  { to: "/search", label: "Find people", icon: Search },
  { to: "/view", label: "Your connections", icon: Users },
  { to: "/collaborations", label: "Collaborations", icon: Layers3 },
];
export function AppShell() {
  return (
    <CollabProvider>
      <Shell />
    </CollabProvider>
  );
}
function Shell() {
  const { actor, logout } = useAuth();
  const { unreadTotal, inviteCount } = useCollab();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    setMenu(false);
  }, [pathname]);
  const fullBleed = pathname.startsWith("/collaborations");
  const title =
    NAV.find((n) => n.to === pathname)?.label ??
    (pathname === "/import" ? "Build your profile" : "Your settings");
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {menu && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "is-open" : ""}`}>
        <Link
          to="/"
          className="brand"
          onClick={() => setMenu(false)}
          aria-label="Link home"
        >
          <svg
            className="link-brand-symbol"
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M25 8H8v18h17V15"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinejoin="round"
            />
            <path
              d="M15 32h17V14H15v11"
              stroke="currentColor"
              strokeWidth="3.4"
              strokeLinejoin="round"
            />
          </svg>
          <span className="link-wordmark">LINK</span>
          <span className="link-registration" aria-hidden="true" />
        </Link>
        <button
          className="mobile-close icon-button"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        >
          <X size={20} />
        </button>
        <div className="campus-switch">
          <span className="campus-symbol">
            <Compass size={19} strokeWidth={1.5} />
          </span>
          <div>
            <strong>Campus directory</strong>
            <span>
              {USING_FIXTURES ? "Sample profiles" : "Connected profiles"}
            </span>
          </div>
        </div>
        <div className="nav-label">Explore</div>
        <nav className="side-nav" aria-label="Main navigation">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMenu(false)}
              className={({ isActive }) =>
                `side-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{label}</span>
              {to === "/collaborations" && unreadTotal + inviteCount > 0 && (
                <small>{unreadTotal + inviteCount}</small>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="nav-label interests-label">
          Your interests
          <Link to="/settings" aria-label="Manage interests">
            <Plus size={16} />
          </Link>
        </div>
        <nav className="interest-nav" aria-label="Explore your interests">
          {actor?.topConcepts.slice(0, 4).map((c, i) => (
            <Link
              key={c.conceptId}
              to={`/?interest=${encodeURIComponent(c.conceptId)}`}
              onClick={() => setMenu(false)}
            >
              <span className={`interest-dot dot-${i}`} />
              {c.label.charAt(0).toUpperCase() + c.label.slice(1)}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link
            className="sidebar-atlas-entry"
            to="/network"
            onClick={() => setMenu(false)}
          >
            <span>Explore the whole campus</span>
            <ArrowUpRight size={16} aria-hidden="true" />
            <small>People, interests, and the connections between them.</small>
          </Link>
          <NavLink
            to="/settings"
            onClick={() => setMenu(false)}
            className="side-link settings-link"
          >
            <Settings2 size={18} />
            Settings
          </NavLink>
          <div className="sidebar-profile">
            <Link to="/settings">
              <Avatar name={actor?.displayName ?? "You"} size="sm" />
              <div>
                <strong>{actor?.displayName ?? "Your profile"}</strong>
                <span>Your profile</span>
              </div>
            </Link>
            <button
              className="icon-button"
              title="Log out"
              aria-label="Log out"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-location">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">Campus</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              {USING_FIXTURES ? "Sample campus" : "Connected to campus"}
            </span>
            <span className="topbar-divider" />
            <Link
              to="/settings"
              className="topbar-profile"
              aria-label="Open your profile"
            >
              <Avatar name={actor?.displayName ?? "You"} size="sm" />
              <ChevronDown size={14} />
            </Link>
          </div>
        </header>
        <main
          id="main-content"
          className={`main-content ${fullBleed ? "main-collaborations" : ""} ${pathname !== "/" ? "inner-page" : ""}`}
          key={pathname}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
