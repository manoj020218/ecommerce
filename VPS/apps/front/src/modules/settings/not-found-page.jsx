import {
  StorefrontButton,
  StorefrontPageHeader
} from "../../shared/storefront/storefront-ui";

export function NotFoundPage() {
  return (
    <main className="proto-main-shell">
      <div className="proto-page-hero">
        <StorefrontPageHeader
          eyebrow="404"
          title="This storefront page does not exist"
          description="The link may be outdated, the page may have moved, or the URL may be incorrect. Use one of the primary storefront paths below."
          actions={
            <StorefrontButton to="/products" variant="light">
              Browse Products
            </StorefrontButton>
          }
        />
        <div className="action-row">
          <StorefrontButton to="/">Go to Home</StorefrontButton>
          <StorefrontButton to="/guides" variant="light">
            Open Guides
          </StorefrontButton>
          <StorefrontButton to="/account/login" variant="light">
            Customer Login
          </StorefrontButton>
        </div>
      </div>
    </main>
  );
}
