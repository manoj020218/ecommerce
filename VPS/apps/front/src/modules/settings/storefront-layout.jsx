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

const SOCIAL_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X"
};

function buildWhatsAppLink(number, message) {
  const digits = String(number || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${query}`;
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
  const [categories, setCategories] = useState([]);
  const [cartCount, setCartCount] = useState(0);
  const [searchText, setSearchText] = useState("");

  const storeProfile = settings.storeProfile || {};
  const contactInformation = settings.contactInformation || {};
  const branding = settings.branding || {};

  const storeName = storeProfile.storeName || "Jenix India";
  const supportEmail =
    contactInformation.publicEmail || storeProfile.supportEmail || "";
  const supportPhone =
    contactInformation.publicPhone || storeProfile.supportMobile || "";
  const supportWhatsApp =
    contactInformation.publicWhatsApp || storeProfile.whatsappNumber || "";
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
      </>
    );
  }

  return (
    <>
      <div className="proto-announcement-bar">
        <div className="proto-announcement-inner">
          <span>Free shipping on orders above ₹999</span>
          <span>GST Invoice Available</span>
          {supportWhatsApp ? <span>WhatsApp: {supportWhatsApp}</span> : null}
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
              placeholder="Search cameras, smart locks, gate motors..."
            />
            <button type="submit" aria-label="Search storefront">
              <SearchIcon />
            </button>
          </form>

          <div className="proto-header-actions">
            <Link
              to={accountHref}
              className={`proto-header-action proto-desktop-only${isAccountRoute ? " active" : ""}`}
            >
              <UserIcon />
              <span>{accountLabel}</span>
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
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp Support
                </a>
              ) : null}
            </div>
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
