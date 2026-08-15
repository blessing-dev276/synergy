import { useEffect } from "react";
import Icon from "./Icon.jsx";

// Minimal reusable popup — no existing modal pattern in this app to match
// (checked: nothing in src/components or app.css), so this is the first
// one. Closes on Escape or backdrop click; the caller owns open/closed
// state, same controlled shape as everything else in this app.
export default function Modal({ open, onClose, title, size = "sm", children }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card modal-card-${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {/* When title is omitted, the wrapped content supplies its own
              heading (reused whole pages, e.g. Milestones/Promotions,
              already render their own <h1>) — the close button still needs
              a row of its own so it doesn't overlap that heading. */}
          {title ? (
            <div className="card-title" style={{ marginBottom: 0 }}>
              {title}
            </div>
          ) : (
            <span />
          )}
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
