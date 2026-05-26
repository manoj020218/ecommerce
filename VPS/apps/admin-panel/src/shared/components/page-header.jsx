export function PageHeader({ title, description, actions, children }) {
  return (
    <section className="page-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
      {children}
    </section>
  );
}
