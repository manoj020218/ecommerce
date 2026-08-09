import { useState } from "react";

export function FieldRow({ label, badge, children }) {
  return (
    <div className="reg-field-wrap">
      <div className="reg-label-row">
        <label className="reg-label">{label}</label>
        {badge && <span className="reg-badge-optional">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

export function RegInput({ type = "text", value, onChange, placeholder, required, inputMode }) {
  const [showPw, setShowPw] = useState(false);
  const isPw = type === "password";
  return (
    <div className="reg-input-wrap">
      <input
        className="reg-input"
        type={isPw ? (showPw ? "text" : "password") : type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        autoComplete={isPw ? "new-password" : undefined}
      />
      {isPw && (
        <button type="button" className="reg-pw-eye" onClick={() => setShowPw((v) => !v)} tabIndex={-1} aria-label="Toggle password visibility">
          {showPw ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          )}
        </button>
      )}
    </div>
  );
}
