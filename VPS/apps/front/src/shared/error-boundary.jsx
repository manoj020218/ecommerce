import React from "react";

const FALLBACK_STYLE = {
  minHeight: "60vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  padding: "48px 24px",
  textAlign: "center",
  fontFamily: "Inter, sans-serif"
};

const BUTTON_STYLE = {
  marginTop: "8px",
  padding: "10px 20px",
  borderRadius: "6px",
  border: "none",
  background: "#E8231A",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer"
};

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Storefront render error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div style={FALLBACK_STYLE}>
        <h2>Something went wrong</h2>
        <p>This page hit an unexpected error. Your cart and account are safe.</p>
        <button type="button" style={BUTTON_STYLE} onClick={() => window.location.assign("/")}>
          Back to Home
        </button>
      </div>
    );
  }
}
