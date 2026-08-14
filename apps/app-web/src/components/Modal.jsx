import { useEffect } from "react";
import Icon from "./Icon.jsx";

// Minimal reusable popup — no existing modal pattern in this app to match
// (checked: nothing in src/components or app.css), so this is the first
// one. Closes on Escape or backdrop click; the caller owns open/closed
// state, same controlled shape as everything else in this app.
export default function Modal({ open, onClose, title, children }) {
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
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-title" style={{ marginBottom: 0 }}>
            {title}
          </div>
          <button type="button" className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
