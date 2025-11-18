import { type ReactNode, type WheelEvent, useCallback, useEffect, useMemo, useState } from "react";

import "./App.css";

import Account from "./pages/Account";
import AdminDashboard from "./pages/AdminDashboard";
import AdminMarova from "./pages/AdminMarova";
import AdminMemories from "./pages/AdminMemories";
import AdminPayments from "./pages/AdminPayments";
import AdminRequests from "./pages/AdminRequests";
import AdminSupport from "./pages/AdminSupport";
import AdminTokens from "./pages/AdminTokens";
import AdminUsers from "./pages/AdminUsers";
import AdminPricing from "./pages/AdminPricing";
import AdminCreateAdmin from "./pages/AdminCreateAdmin";
import Home from "./pages/Home";
import Login from "./pages/Login";
import MemoryForge from "./pages/MemoryForge";
import HealthProfile from "./pages/HealthProfile";
import SupportCare from "./pages/SupportCare";
import UserJourney from "./pages/UserJourney";
import InsuranceEnrollment from "./pages/InsuranceEnrollment";

type Role = "guest" | "human" | "admin";

type AdminSession = {
  id: string;
  email: string;
  name: string;
};

type AuthState =
  | { role: "guest" }
  | { role: "human"; userId: string; email: string; name: string }
  | { role: "admin"; admin: AdminSession };

type NavEntry = { label: string; path?: string; action?: () => void };

const AUTH_STORAGE_KEY = "etinuxe-auth";
const THEME_STORAGE_KEY = "etinuxe-theme";

type ThemeMode = "light" | "dark";

function getInitialPath(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return window.location.pathname || "/";
}

function loadAuthState(): AuthState {
  if (typeof window === "undefined") {
    return { role: "guest" };
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return { role: "guest" };
    }
    const parsed = JSON.parse(raw) as AuthState;
    if (parsed.role === "human" && parsed.userId && parsed.email) {
      return parsed;
    }
    if (parsed.role === "admin" && parsed.admin?.id) {
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to parse auth state", err);
  }
  return { role: "guest" };
}

function persistAuthState(state: AuthState): void {
  if (typeof window === "undefined") {
    return;
  }
  if (state.role === "guest") {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  return "light";
}

export default function App(): JSX.Element {
  const [path, setPath] = useState<string>(getInitialPath);
  const [auth, setAuth] = useState<AuthState>(loadAuthState);
  const [theme, setTheme] = useState<ThemeMode>(getStoredTheme);
  const [navExpanded, setNavExpanded] = useState(false);

  const navigate = useCallback((nextPath: string) => {
    if (nextPath === path) {
      return;
    }
    if (typeof window !== "undefined") {
      window.history.pushState({}, "", nextPath);
    }
    setPath(nextPath);
  }, [path]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const listener = () => {
      setPath(window.location.pathname || "/");
    };
    window.addEventListener("popstate", listener);
    return () => {
      window.removeEventListener("popstate", listener);
    };
  }, []);

  useEffect(() => {
    persistAuthState(auth);
  }, [auth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const root = window.document.documentElement;
    root.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (path === "/journey") {
      navigate("/signup");
    }
  }, [navigate, path]);

  const handleHumanLogin = useCallback((payload: { userId: string; email: string; name: string }) => {
    setAuth({ role: "human", ...payload });
    navigate("/account");
  }, [navigate]);

  const handleAdminLogin = useCallback((admin: AdminSession) => {
    setAuth({ role: "admin", admin });
    navigate("/admin");
  }, [navigate]);

  const handleLogout = useCallback(() => {
    setAuth({ role: "guest" });
    navigate("/");
  }, [navigate]);

  const navEntries = useMemo<NavEntry[]>(() => {
    const items: NavEntry[] = [{ label: "Home", path: "/" }];
    if (auth.role === "guest") {
      items.push({ label: "Sign Up", path: "/signup" });
      items.push({ label: "Login", path: "/login" });
      return items;
    }
    if (auth.role === "human") {
      items.push({ label: "My Account", path: "/account" });
      items.push({ label: "Insurance", path: "/account/insurance" });
      items.push({ label: "Memory Forge", path: "/account/memory" });
      items.push({ label: "Health Profile", path: "/account/health" });
      items.push({ label: "Support & Care", path: "/account/support" });
      items.push({ label: "Log Out", action: handleLogout });
      return items;
    }
    items.push({ label: "Admin Deck", path: "/admin" });
    items.push({ label: "Registry", path: "/admin/users" });
    items.push({ label: "Requests", path: "/admin/requests" });
    items.push({ label: "Tokens", path: "/admin/tokens" });
    items.push({ label: "Memories", path: "/admin/memories" });
    items.push({ label: "Payments", path: "/admin/payments" });
    items.push({ label: "Pricing", path: "/admin/pricing" });
    items.push({ label: "Support Desk", path: "/admin/support" });
    items.push({ label: "Marova Vault", path: "/admin/marova" });
    items.push({ label: "Log Out", action: handleLogout });
    return items;
  }, [auth.role, handleLogout]);

  const navId = "app-primary-nav";
  const navClassName = "app__nav";

  const toggleTheme = useCallback(() => {
    setTheme(current => (current === "light" ? "dark" : "light"));
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.IntersectionObserver === "undefined" ||
      typeof window.MutationObserver === "undefined"
    ) {
      return;
    }

    const { document } = window;
    const body = document.body;

    if (!body.classList.contains("scroll-animations-enabled")) {
      body.classList.add("scroll-animations-enabled");
    }

    const registered = new WeakSet<HTMLElement>();
    const autoSelectors = [".surface-card", ".account__panel"];

    const ensureAutoFadeAttribute = (scope: ParentNode) => {
      if (!("querySelectorAll" in scope)) {
        return;
      }
      if (autoSelectors.length === 0) {
        return;
      }
      scope.querySelectorAll<HTMLElement>(autoSelectors.join(", ")).forEach(element => {
        const preference = element.getAttribute("data-scroll-fade");
        if (preference === "off") {
          return;
        }
        if (!element.hasAttribute("data-scroll-fade")) {
          element.setAttribute("data-scroll-fade", "");
        }
      });
    };

    const intersectionObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const element = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            window.requestAnimationFrame(() => {
              element.classList.add("is-visible");
            });
          } else if (entry.boundingClientRect.top > window.innerHeight) {
            element.classList.remove("is-visible");
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -15% 0px",
      }
    );

    const registerElement = (element: HTMLElement | null) => {
      if (!element || registered.has(element) || element.dataset.scrollFade === "off") {
        return;
      }
      element.classList.remove("is-visible");
      const { top } = element.getBoundingClientRect();
      if (top < window.innerHeight) {
        window.requestAnimationFrame(() => {
          element.classList.add("is-visible");
        });
      }
      intersectionObserver.observe(element);
      registered.add(element);
    };

    const scan = () => {
      ensureAutoFadeAttribute(document);
      document
        .querySelectorAll<HTMLElement>("[data-scroll-fade]")
        .forEach(registerElement);
    };

    scan();

    const mutationObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) {
            return;
          }
          ensureAutoFadeAttribute(node);
          if (node.hasAttribute("data-scroll-fade")) {
            registerElement(node);
          }
          node
            .querySelectorAll<HTMLElement>("[data-scroll-fade]")
            .forEach(registerElement);
        });
      });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      intersectionObserver.disconnect();
      body.classList.remove("scroll-animations-enabled");
    };
  }, []);

  const content: ReactNode = useMemo(() => {
    switch (path) {
      case "/":
        return <Home onNavigate={navigate} auth={auth} />;
      case "/signup":
        return auth.role === "guest"
          ? <UserJourney />
          : <AccessDenied currentRole={auth.role} required="guest" onNavigate={navigate} />;
      case "/admin":
        return auth.role === "admin"
          ? <AdminDashboard onNavigate={navigate} />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/users":
        return auth.role === "admin"
          ? <AdminUsers />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/admins/create":
        return auth.role === "admin"
          ? <AdminCreateAdmin />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/requests":
        return auth.role === "admin"
          ? <AdminRequests />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/tokens":
        return auth.role === "admin"
          ? <AdminTokens />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/memories":
        return auth.role === "admin"
          ? <AdminMemories />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/payments":
        return auth.role === "admin"
          ? <AdminPayments />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/pricing":
        return auth.role === "admin"
          ? <AdminPricing />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/support":
        return auth.role === "admin"
          ? <AdminSupport adminId={auth.admin.id} adminName={auth.admin.name} />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/admin/marova":
        return auth.role === "admin"
          ? <AdminMarova />
          : <AccessDenied currentRole={auth.role} required="admin" onNavigate={navigate} />;
      case "/account":
        return auth.role === "human"
          ? (
            <Account
              userId={auth.userId}
              email={auth.email}
              name={auth.name}
              onLogout={handleLogout}
              onNavigate={navigate}
            />
          ) : (
            <AccessDenied currentRole={auth.role} required="human" onNavigate={navigate} />
          );
      case "/account/memory":
        return auth.role === "human"
          ? <MemoryForge userId={auth.userId} onNavigate={navigate} />
          : <AccessDenied currentRole={auth.role} required="human" onNavigate={navigate} />;
      case "/account/insurance":
        return auth.role === "human"
          ? <InsuranceEnrollment userId={auth.userId} onNavigate={navigate} />
          : <AccessDenied currentRole={auth.role} required="human" onNavigate={navigate} />;
      case "/account/health":
        return auth.role === "human"
          ? <HealthProfile userId={auth.userId} onNavigate={navigate} />
          : <AccessDenied currentRole={auth.role} required="human" onNavigate={navigate} />;
      case "/account/support":
        return auth.role === "human"
          ? <SupportCare userId={auth.userId} userName={auth.name} onNavigate={navigate} />
          : <AccessDenied currentRole={auth.role} required="human" onNavigate={navigate} />;
      case "/login":
        return (
          <Login
            role={auth.role}
            onHumanLogin={handleHumanLogin}
            onAdminLogin={handleAdminLogin}
            onNavigate={navigate}
          />
        );
      default:
        return <NotFound onNavigate={navigate} />;
    }
  }, [auth, handleAdminLogin, handleHumanLogin, handleLogout, navigate, path]);

  useEffect(() => {
    setNavExpanded(false);
  }, [path]);

  const toggleNavVisibility = useCallback(() => {
    setNavExpanded(previous => !previous);
  }, []);

  const handleNavItemActivate = useCallback(() => {
    setNavExpanded(false);
  }, []);

  const handleNavWheel = useCallback((event: WheelEvent<HTMLElement>) => {
    // Forward vertical wheel movement so the page scrolls instead of the navbar.
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }
    const target = event.currentTarget;
    if (target.scrollWidth <= target.clientWidth) {
      return;
    }
    if (typeof window !== "undefined") {
      window.scrollBy({ top: event.deltaY, left: 0 });
    }
    event.preventDefault();
  }, []);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title-wrapper">
          <h1 className="app__title">
            <button
              type="button"
              className="app__title-link"
              onClick={() => navigate("/")}
            >
              EtinuxE
            </button>
          </h1>
        </div>
        <button
          type="button"
          className="nav-toggle"
          onClick={toggleNavVisibility}
          aria-controls={navId}
          aria-expanded={navExpanded}
          aria-label={`${navExpanded ? "Collapse" : "Expand"} navigation`}
        >
          {navExpanded ? "✕" : "☰"}
        </button>
        <nav
          id={navId}
          className={`${navClassName}${navExpanded ? " app__nav--expanded" : ""}`}
          aria-label="Primary navigation"
          onWheel={handleNavWheel}
        >
          {navEntries.map(entry => (
            <NavItem
              key={entry.label}
              entry={entry}
              currentPath={path}
              onNavigate={navigate}
              onActivate={handleNavItemActivate}
            />
          ))}
        </nav>
        <div className="app__header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </header>
      <main className="app__main">{content}</main>
      <footer className="app__footer">
        © {new Date().getFullYear()} EtinuxE · Osmo-Vault Directorate · Spectral clearance only
      </footer>
    </div>
  );
}

function NavItem({
  entry,
  currentPath,
  onNavigate,
  onActivate,
}: {
  entry: NavEntry;
  currentPath: string;
  onNavigate: (path: string) => void;
  onActivate?: () => void;
}): JSX.Element {
  const active = entry.path ? currentPath === entry.path : false;
  const className = `nav-item${active ? " is-active" : ""}`;

  if (entry.path) {
    const entryPath = entry.path;
    return (
      <a
        href={entryPath}
        className={className}
        onClick={event => {
          event.preventDefault();
          onNavigate(entryPath);
          onActivate?.();
        }}
      >
        <span>{entry.label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        entry.action?.();
        onActivate?.();
      }}
    >
      <span>{entry.label}</span>
    </button>
  );
}

function NotFound({ onNavigate }: { onNavigate: (path: string) => void }): JSX.Element {
  return (
    <section className="section section--narrow">
      <h2>Signal Lost</h2>
      <p>The requested console segment could not be found. Return to the primary navigation to resume.</p>
      <button
        type="button"
        className="pill-button pill-button--spaced"
        onClick={() => onNavigate("/")}
      >
        Return Home
      </button>
    </section>
  );
}

function AccessDenied({
  currentRole,
  required,
  onNavigate,
}: {
  currentRole: Role;
  required: "guest" | "human" | "admin";
  onNavigate: (path: string) => void;
}): JSX.Element {
  const headingMap: Record<typeof required, string> = {
    guest: "Guest access only",
    human: "Candidate portal only",
    admin: "Administrator clearance required",
  };

  const descriptionMap: Record<typeof required, string> = {
    guest: "This intake console is reserved for unregistered guests. Sign out to begin a new signup sequence.",
    human: "Sign in as a registered human candidate to access personalized dossier controls.",
    admin: "This console segment is reserved for vault custodians. Authenticate with administrator credentials to proceed.",
  };

  let primaryAction = "/";
  let primaryLabel = "Return Home";

  if (required === "admin" || required === "human") {
    primaryAction = "/login";
    primaryLabel = "Go to Login";
  } else if (required === "guest") {
    if (currentRole === "human") {
      primaryAction = "/account";
      primaryLabel = "Go to My Account";
    } else if (currentRole === "admin") {
      primaryAction = "/admin";
      primaryLabel = "Open Admin Deck";
    }
  }

  return (
    <section className="surface-card surface-card--access-denied">
      <h2 className="surface-card__title">{headingMap[required]}</h2>
      <p className="surface-card__description">{descriptionMap[required]}</p>
      <div className="button-row">
        <button type="button" className="pill-button" onClick={() => onNavigate(primaryAction)}>
          {primaryLabel}
        </button>
        {primaryAction !== "/" ? (
          <button
            type="button"
            className="pill-button pill-button--ghost"
            onClick={() => onNavigate("/")}
          >
            Return Home
          </button>
        ) : null}
      </div>
    </section>
  );
}
