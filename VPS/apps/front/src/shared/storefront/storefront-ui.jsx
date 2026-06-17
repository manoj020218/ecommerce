import { Link } from "react-router-dom";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function renderLinkedComponent({
  to,
  href,
  className,
  children,
  target,
  rel,
  ...props
}) {
  if (to) {
    return (
      <Link to={to} className={className} {...props}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        className={className}
        target={target}
        rel={rel}
        {...props}
      >
        {children}
      </a>
    );
  }

  return null;
}

export function StorefrontButton({
  to,
  href,
  variant = "primary",
  fullWidth = false,
  className,
  children,
  target,
  rel,
  ...props
}) {
  const classes = cx(
    "storefront-button",
    "proto-btn",
    `storefront-button-${variant}`,
    `proto-btn-${variant}`,
    fullWidth && "storefront-button-full proto-btn-full",
    className
  );

  const linked = renderLinkedComponent({
    to,
    href,
    className: classes,
    children,
    target,
    rel,
    ...props
  });

  if (linked) {
    return linked;
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function StorefrontCard({
  as: Component = "div",
  tone = "default",
  elevated = false,
  className,
  children,
  ...props
}) {
  return (
    <Component
      className={cx(
        "storefront-card",
        `storefront-card-${tone}`,
        elevated && "storefront-card-elevated",
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}

export function StorefrontField({
  label,
  hint,
  fieldClassName,
  children
}) {
  return (
    <label className={cx("storefront-field", fieldClassName)}>
      {label ? <span>{label}</span> : null}
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function StorefrontInput({
  label,
  hint,
  fieldClassName,
  className,
  ...props
}) {
  const control = (
    <input className={cx("storefront-input", className)} {...props} />
  );

  if (!label && !hint) {
    return control;
  }

  return (
    <StorefrontField label={label} hint={hint} fieldClassName={fieldClassName}>
      {control}
    </StorefrontField>
  );
}

export function StorefrontSelect({
  label,
  hint,
  fieldClassName,
  className,
  children,
  ...props
}) {
  const control = (
    <select className={cx("storefront-select", className)} {...props}>
      {children}
    </select>
  );

  if (!label && !hint) {
    return control;
  }

  return (
    <StorefrontField label={label} hint={hint} fieldClassName={fieldClassName}>
      {control}
    </StorefrontField>
  );
}

export function StorefrontTextArea({
  label,
  hint,
  fieldClassName,
  className,
  ...props
}) {
  const control = (
    <textarea className={cx("storefront-textarea", className)} {...props} />
  );

  if (!label && !hint) {
    return control;
  }

  return (
    <StorefrontField label={label} hint={hint} fieldClassName={fieldClassName}>
      {control}
    </StorefrontField>
  );
}

export function StorefrontFileInput({
  label,
  hint,
  fieldClassName,
  className,
  ...props
}) {
  const control = (
    <input className={cx("storefront-file-input", className)} {...props} />
  );

  if (!label && !hint) {
    return control;
  }

  return (
    <StorefrontField label={label} hint={hint} fieldClassName={fieldClassName}>
      {control}
    </StorefrontField>
  );
}

export function StorefrontBadge({
  tone = "neutral",
  className,
  children
}) {
  return (
    <span
      className={cx("storefront-badge", `storefront-badge-${tone}`, className)}
    >
      {children}
    </span>
  );
}

export function StorefrontChip({
  as,
  active = false,
  to,
  href,
  className,
  children,
  target,
  rel,
  ...props
}) {
  const classes = cx(
    "storefront-chip",
    active && "storefront-chip-active",
    className
  );

  const linked = renderLinkedComponent({
    to,
    href,
    className: classes,
    children,
    target,
    rel,
    ...props
  });

  if (linked) {
    return linked;
  }

  if (as === "span") {
    return <span className={classes}>{children}</span>;
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function StorefrontAlert({
  tone = "info",
  className,
  children
}) {
  return (
    <div
      className={cx(
        "storefront-alert",
        "state-box",
        `storefront-alert-${tone}`,
        tone === "error" && "error",
        tone === "warning" && "warning",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StorefrontEmptyState({
  title,
  description,
  action,
  className
}) {
  return (
    <StorefrontAlert tone="info" className={cx("storefront-state", className)}>
      {title ? <strong>{title}</strong> : null}
      {description ? <p>{description}</p> : null}
      {action ? <div className="storefront-state-action">{action}</div> : null}
    </StorefrontAlert>
  );
}

export function StorefrontLoadingState({
  label = "Loading...",
  className
}) {
  return <StorefrontAlert className={className}>{label}</StorefrontAlert>;
}

export function StorefrontErrorState({
  message,
  action,
  className
}) {
  return (
    <StorefrontAlert tone="error" className={cx("storefront-state", className)}>
      {message}
      {action ? <div className="storefront-state-action">{action}</div> : null}
    </StorefrontAlert>
  );
}

export function StorefrontPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className
}) {
  return (
    <header className={cx("storefront-page-header", className)}>
      <div className="storefront-page-header-copy">
        {eyebrow ? <p className="storefront-page-eyebrow">{eyebrow}</p> : null}
        {title ? <h1>{title}</h1> : null}
        {description ? <p className="storefront-page-description">{description}</p> : null}
        {meta ? <div className="storefront-page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="storefront-page-actions">{actions}</div> : null}
    </header>
  );
}

export function StorefrontSectionHeader({
  eyebrow,
  title,
  description,
  action,
  className
}) {
  return (
    <div className={cx("storefront-section-header", "proto-section-head", className)}>
      <div className="storefront-section-header-copy">
        {eyebrow ? <p className="storefront-page-eyebrow">{eyebrow}</p> : null}
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="storefront-section-header-action">{action}</div> : null}
    </div>
  );
}

export function StorefrontStickyActionBar({
  className,
  children
}) {
  return (
    <div className={cx("storefront-sticky-action-bar", className)}>
      {children}
    </div>
  );
}
