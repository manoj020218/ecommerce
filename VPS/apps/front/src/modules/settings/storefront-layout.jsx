import { useEffect, useMemo, useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate
} from "react-router-dom";
import { useCustomerSession } from "../../shared/auth/customer-session";
import { getCart, listCategories } from "../products/products.api";
import {
  STOREFRONT_CART_UPDATED_EVENT,
  buildCartContext
} from "../cart/cart.utils";
import { usePublicSettings } from "./public-settings-context";
import { useInstallPrompt } from "../../shared/hooks/use-install-prompt";

const SOCIAL_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X"
};

function FacebookSocialIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramSocialIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function LinkedInSocialIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function YouTubeSocialIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
    </svg>
  );
}

function XSocialIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const SOCIAL_ICONS = {
  facebook: <FacebookSocialIcon />,
  instagram: <InstagramSocialIcon />,
  linkedin: <LinkedInSocialIcon />,
  youtube: <YouTubeSocialIcon />,
  x: <XSocialIcon />
};

function buildWhatsAppLink(number, message) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
}

// Names the current page in plain language so the support team sees exactly
// what the visitor was looking at without asking — a product page uses the
// actual product name (already set as document.title by product-page.jsx),
// everything else gets a friendly label from the route. Falls back to
// whatever the browser tab title is for any page not explicitly listed.
function resolvePageContextLabel(pathname) {
  if (pathname === "/" || pathname === "") {
    return "the Home Page";
  }
  if (pathname.startsWith("/products/")) {
    return document.title ? `the product "${document.title}"` : "a product page";
  }
  if (pathname === "/products") {
    return "the Products listing page";
  }
  if (pathname.startsWith("/checkout")) {
    return "the Checkout page";
  }
  if (pathname.startsWith("/cart")) {
    return "the Cart page";
  }
  if (pathname.startsWith("/account")) {
    return "my Account page";
  }
  if (pathname.startsWith("/orders/")) {
    return "an Order page";
  }
  return document.title || "this page";
}

function buildContextualWhatsAppMessage() {
  const label = resolvePageContextLabel(window.location.pathname);
  return `Hi, I need help regarding ${label}.\n${window.location.href}\n\n(I've also saved a screenshot of this page on my device — attaching it here.)`;
}

// WhatsApp's click-to-chat link has no way to pre-attach a file — that's a
// platform limit, not something a website can work around. The closest
// honest equivalent: auto-capture what the visitor is currently looking at
// and auto-download it, so it's sitting ready in their gallery/downloads to
// manually attach in the chat that just opened. Best-effort only — capture
// failing (e.g. a cross-origin image tainting the canvas) never blocks or
// delays WhatsApp itself opening, since that call happens first and
// synchronously, before this even starts.
async function captureAndDownloadPageScreenshot() {
  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(document.documentElement, {
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      logging: false
    });
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `jenix-support-screenshot-${Date.now()}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
    }, "image/png");
  } catch (_error) {
    // Silently skip — the WhatsApp chat already opened either way.
  }
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 18L18 6M6 6l12 12"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-9 12a7 7 0 0114 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 2.3a1 1 0 00.7 1.7H17m0 0a2 2 0 110 4 2 2 0 010-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 12l2-2 7-7 7 7 2 2m-14-2v10h4v-5h4v5h4V10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 6.2A7.8 7.8 0 007.5 5 7.8 7.8 0 003 6.2v12A7.8 7.8 0 017.5 17c1.7 0 3.3.4 4.5 1.2m0-12c1.2-.8 2.8-1.2 4.5-1.2A7.8 7.8 0 0121 6.2v12A7.8 7.8 0 0016.5 17c-1.7 0-3.3.4-4.5 1.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function InstallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2a10 10 0 00-8.7 15l-1.2 5 5.1-1.3A10 10 0 1012 2zm5.1 13.4c-.2.6-1.2 1.2-1.7 1.3-.5.1-1.1.2-3.1-.6-2.4-1-4-3.5-4.1-3.7-.1-.2-1-1.4-1-2.7s.7-1.9.9-2.2c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.7.8 1.8.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.3.3-.5.5-.2.2-.3.4-.1.7.2.3 1 1.7 2.4 2.7 1.8 1.3 3.3 1.7 3.7 1.9.4.2.7.1.9-.1.3-.3 1-.9 1.2-1.2.2-.3.4-.3.7-.2l1.8.9c.3.2.5.3.6.5.1.2.1.9-.1 1.4z"
        fill="currentColor"
      />
    </svg>
  );
}

function StorefrontLogo({ branding, storeName }) {
  if (branding.brandLogoUrl) {
    return (
      <img
        src={branding.brandLogoUrl}
        alt={storeName}
        className="proto-logo-image"
        loading="lazy"
      />
    );
  }

  return <span className="proto-logo-wordmark">{storeName}</span>;
}

export function StorefrontLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { customer, isAuthenticated } = useCustomerSession();
  const { settings } = usePublicSettings();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [categories, setCategories] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const storeProfile = settings.storeProfile || {};
  const contactInformation = settings.contactInformation || {};
  const branding = settings.branding || {};

  const storeName = storeProfile.storeName || "Jenix India";
  const supportEmail =
    contactInformation.publicEmail || storeProfile.supportEmail || "";
  const supportPhone =
    contactInformation.publicPhone || storeProfile.supportMobile || "";
  const supportWhatsApp =
    contactInformation.publicWhatsApp || storeProfile.whatsappNumber || "917240226566";
  const publicAddress =
    contactInformation.publicAddress || storeProfile.address || "";
  const supportTiming =
    contactInformation.supportTiming || storeProfile.businessHours || "";
  const socialLinks = Object.entries(contactInformation.socialLinks || {}).filter(
    ([, value]) => Boolean(value)
  );

  const isCheckoutRoute = location.pathname.startsWith("/checkout");
  const accountHref = isAuthenticated ? "/account" : "/account/login";
  const accountLabel = isAuthenticated
    ? customer?.name
      ? String(customer.name).split(" ")[0]
      : "Account"
    : "Login";

  const topCategories = useMemo(() => categories.slice(0, 8), [categories]);
  const isOrderSuccessRoute =
    location.pathname.startsWith("/checkout/success") ||
    location.pathname.startsWith("/orders/guest/");
  const usesMinimalShell = isCheckoutRoute || isOrderSuccessRoute;
  const isCartRoute = location.pathname === "/cart";
  const isAccountRoute = location.pathname.startsWith("/account");

  // React Router doesn't reset scroll on navigation like a traditional site —
  // without this, switching bottom-nav tabs (or any link) keeps whatever
  // scroll position the previous page was at, so a new page can open already
  // scrolled partway or all the way down instead of showing its top content.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    listCategories()
      .then((rows) => {
        setCategories(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        setCategories([]);
      });
  }, []);

  useEffect(() => {
    const nextQuery = new URLSearchParams(location.search).get("q") || "";
    setSearchText(nextQuery);
  }, [location.search]);

  useEffect(() => {
    let active = true;

    const refreshCart = async () => {
      try {
        const cart = await getCart(buildCartContext(isAuthenticated));
        if (active) {
          setCartCount(Number(cart?.itemCount || 0));
        }
      } catch (_error) {
        if (active) {
          setCartCount(0);
        }
      }
    };

    refreshCart();
    window.addEventListener(STOREFRONT_CART_UPDATED_EVENT, refreshCart);

    return () => {
      active = false;
      window.removeEventListener(STOREFRONT_CART_UPDATED_EVENT, refreshCart);
    };
  }, [isAuthenticated]);

  // Opens WhatsApp first — synchronously, so it can never be popup-blocked —
  // then kicks off the screenshot capture/download as a non-blocking side
  // effect. The two don't need to be coordinated: the message text already
  // tells the visitor a screenshot was saved for them to attach themselves.
  function handleWhatsAppClick(event) {
    event.preventDefault();
    const link = buildWhatsAppLink(supportWhatsApp, buildContextualWhatsAppMessage());
    if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
    captureAndDownloadPageScreenshot();
  }

  if (usesMinimalShell) {
    return (
      <>
        <header className="proto-checkout-header">
          <div
            className={`proto-checkout-header-inner${
              isOrderSuccessRoute ? " proto-checkout-header-success" : ""
            }`}
          >
            <Link to="/" className="proto-logo-link" aria-label={storeName}>
              <StorefrontLogo branding={branding} storeName={storeName} />
            </Link>
            {!isOrderSuccessRoute ? (
              <div className="proto-checkout-badge">
                <span className="proto-checkout-badge-dot" />
                <span>Secure Checkout</span>
              </div>
            ) : null}
          </div>
        </header>
        <Outlet />
        <a
          className="proto-whatsapp-fab"
          href={buildWhatsAppLink(supportWhatsApp, `Need help from ${storeName}.`)}
          onClick={handleWhatsAppClick}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat on WhatsApp"
        >
          <WhatsAppIcon />
        </a>
      </>
    );
  }

  return (
    <>
      <div className="proto-announcement-bar">
        <div className="proto-announcement-inner">
          <div className="proto-announcement-track">
            <span>⚡ Same Day Dispatch</span>
            <span>·</span>
            <span>📄 GST Invoice Included</span>
            <span>·</span>
            <span>🛡️ 100% Genuine Products</span>
            <span>·</span>
            <span>🚚 Pan India Delivery</span>
            {supportWhatsApp ? <><span>·</span><span>📞 {supportWhatsApp}</span></> : null}
            {/* Duplicate for seamless loop */}
            <span aria-hidden="true">⚡ Same Day Dispatch</span>
            <span aria-hidden="true">·</span>
            <span aria-hidden="true">📄 GST Invoice Included</span>
            <span aria-hidden="true">·</span>
            <span aria-hidden="true">🛡️ 100% Genuine Products</span>
            <span aria-hidden="true">·</span>
            <span aria-hidden="true">🚚 Pan India Delivery</span>
            {supportWhatsApp ? <><span aria-hidden="true">·</span><span aria-hidden="true">📞 {supportWhatsApp}</span></> : null}
          </div>
        </div>
      </div>

      <header className="proto-header-shell">
        <div className="proto-header-main">
          <Link to="/" className="proto-logo-link" aria-label={storeName}>
            <StorefrontLogo branding={branding} storeName={storeName} />
          </Link>

          <form
            className="proto-header-search"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = searchText.trim();
              navigate(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : "/products");
            }}
          >
            <input
              id="storefront-search-input"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="Search cameras, smart locks, gate motors..."
            />
            {/* One icon, not two — it used to swap out for a Clear button
                whenever isSearchFocused was false, but tapping the search
                button itself blurs the input first, so the tap could land
                after the icon had already swapped, hitting Clear instead of
                Search. Keying the swap off searchText instead of focus
                avoids that race (typing doesn't change focus), and only
                ever renders a single button, so it no longer eats extra
                width in the search bar on mobile. */}
            <div className="proto-header-search-actions">
              {searchText ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="proto-search-clear-btn"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setSearchText("");
                  }}
                >
                  <ClearIcon />
                </button>
              ) : (
                <button type="submit" aria-label="Search storefront">
                  <SearchIcon />
                </button>
              )}
            </div>
          </form>

          <div className="proto-header-actions">
            {canInstall ? (
              <button
                type="button"
                className="proto-icon-action proto-install-action"
                onClick={promptInstall}
                aria-label="Install app"
              >
                <InstallIcon />
                <span className="proto-install-action-label">Install</span>
              </button>
            ) : null}
            <Link
              to={accountHref}
              className={`proto-icon-action${isAccountRoute ? " active" : ""}`}
              aria-label={accountLabel}
            >
              <UserIcon />
              <span className="proto-header-action-label">{accountLabel}</span>
            </Link>
            <Link
              to="/cart"
              className={`proto-icon-action${isCartRoute ? " active" : ""}`}
              aria-label="Cart"
            >
              <CartIcon />
              {cartCount > 0 ? <span className="proto-count-badge">{cartCount}</span> : null}
            </Link>
          </div>
        </div>

        <nav className="proto-category-nav">
          <div className="proto-category-nav-inner">
            <NavLink
              to="/products"
              className={({ isActive }) =>
                `proto-category-link${isActive && location.pathname === "/products" ? " active" : ""}`
              }
            >
              All Products
            </NavLink>
            {topCategories.map((category) => (
              <NavLink
                key={category.id}
                to={`/categories/${category.slug}`}
                className={({ isActive }) =>
                  `proto-category-link${isActive ? " active" : ""}`
                }
              >
                {category.name}
              </NavLink>
            ))}
            <NavLink
              to="/guides"
              className={({ isActive }) =>
                `proto-category-link${isActive ? " active" : ""}`
              }
            >
              Guides
            </NavLink>
          </div>
        </nav>
      </header>

      <Outlet />

      {supportWhatsApp ? (
        <a
          className="proto-whatsapp-fab"
          href={buildWhatsAppLink(
            supportWhatsApp,
            `Need help from ${storeName}.`
          )}
          onClick={handleWhatsAppClick}
          target="_blank"
          rel="noreferrer"
          aria-label="Chat on WhatsApp"
        >
          <WhatsAppIcon />
        </a>
      ) : null}

      <footer className="proto-footer-shell">
        <div className="proto-footer">
          <div className="proto-footer-brand">
            <Link to="/" className="proto-logo-link" aria-label={storeName}>
              <StorefrontLogo branding={branding} storeName={storeName} />
            </Link>
            <p>
              India's trusted partner for IoT security systems. CCTV, smart locks, gate automation &amp; more.
            </p>
            <div className="proto-footer-pills">
              {supportPhone ? <a href={`tel:${supportPhone}`}>Call Store</a> : null}
              {supportWhatsApp ? (
                <a
                  href={buildWhatsAppLink(
                    supportWhatsApp,
                    `Need support from ${storeName}.`
                  )}
                  onClick={handleWhatsAppClick}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp Support
                </a>
              ) : null}
            </div>
            {socialLinks.length > 0 ? (
              <div className="proto-footer-social">
                {socialLinks.map(([key, value]) => (
                  <a
                    key={key}
                    href={value}
                    target="_blank"
                    rel="noreferrer"
                    className="proto-footer-social-btn"
                    aria-label={SOCIAL_LABELS[key] || key}
                  >
                    {SOCIAL_ICONS[key] || null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div className="proto-footer-column">
            <h3>Products</h3>
            {topCategories.slice(0, 6).map((category) => (
              <Link key={category.id} to={`/categories/${category.slug}`}>
                {category.name}
              </Link>
            ))}
            <Link to="/products">All Products</Link>
          </div>

          <div className="proto-footer-column">
            <h3>Company</h3>
            <Link to="/guides">Guides &amp; Blog</Link>
            {supportEmail ? <a href={`mailto:${supportEmail}`}>Contact Us</a> : null}
            {socialLinks.length > 0
              ? socialLinks.map(([key, value]) => (
                  <a key={key} href={value} target="_blank" rel="noreferrer">
                    {SOCIAL_LABELS[key] || key}
                  </a>
                ))
              : null}
            {publicAddress ? <p>{publicAddress}</p> : null}
          </div>

          <div className="proto-footer-column">
            <h3>Help</h3>
            <Link to="/account">My Account</Link>
            <Link to="/account/orders">Track Order</Link>
            <Link to="/cart">View Cart</Link>
            {supportPhone ? <a href={`tel:${supportPhone}`}>{supportPhone}</a> : null}
            {supportTiming ? <p>{supportTiming}</p> : null}
            {storeProfile.gstNumber ? <p>GSTIN: {storeProfile.gstNumber}</p> : null}
          </div>

          <div className="proto-footer-column">
            <h3>Legal</h3>
            <Link to="/about-us">About Us</Link>
            <Link to="/contact-us">Contact Us</Link>
            <Link to="/privacy-policy">Privacy Policy</Link>
            <Link to="/terms-and-conditions">Terms &amp; Conditions</Link>
            <Link to="/refund-policy">Refund Policy</Link>
            <Link to="/shipping-policy">Shipping Policy</Link>
          </div>
        </div>
        <div className="proto-footer-bottom">
          <p>© {new Date().getFullYear()} {storeName}. All rights reserved.</p>
        </div>
      </footer>

      <nav className="proto-mobile-nav">
        <NavLink to="/" className={({ isActive }) => `proto-mobile-link${isActive ? " active" : ""}`}>
          <HomeIcon />
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/products"
          className={({ isActive }) =>
            `proto-mobile-link${isActive || location.pathname.startsWith("/categories") ? " active" : ""}`
          }
        >
          <GridIcon />
          <span>Categories</span>
        </NavLink>
        <button
          type="button"
          className="proto-mobile-link"
          onClick={() => {
            // Just focusing the header input wasn't a visible enough action on a
            // phone — a buyer tapping "Search" expects something to clearly
            // happen. Navigating to the product catalog (where the search bar
            // sits front and center) makes that obvious, then focuses the input
            // so they can start typing immediately.
            navigate("/products");
            window.scrollTo({ top: 0, behavior: "smooth" });
            document.getElementById("storefront-search-input")?.focus();
          }}
        >
          <SearchIcon />
          <span>Search</span>
        </button>
        <NavLink
          to="/cart"
          className={({ isActive }) => `proto-mobile-link${isActive ? " active" : ""}`}
        >
          <span className="proto-mobile-cart-icon">
            <CartIcon />
            {cartCount > 0 ? <span className="proto-count-badge">{cartCount}</span> : null}
          </span>
          <span>Cart</span>
        </NavLink>
        <NavLink
          to={accountHref}
          className={({ isActive }) => `proto-mobile-link${isActive ? " active" : ""}`}
        >
          <UserIcon />
          <span>Account</span>
        </NavLink>
      </nav>
    </>
  );
}
