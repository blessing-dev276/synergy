import { useState } from "react";
import Icon from "./Icon.jsx";

// Presentational add/remove-one-at-a-time list — no persistence opinion of
// its own. Backs both the Why's list (each add/remove is an immediate
// member_whys insert/delete, see Profile.jsx) and the Goals reward-tools
// field (edited locally, saved together with the rest of the Goals form).
export default function TagListInput({ items, onAdd, onRemove, max, placeholder = "Add an item…", disabled = false }) {
  const [value, setValue] = useState("");

  const atMax = Boolean(max) && items.length >= max;

  const submit = () => {
    const text = value.trim();
    if (!text || disabled || atMax) return;
    onAdd(text);
    setValue("");
  };

  return (
    <div>
      {items.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {items.map((item, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 10px",
                border: "1px solid var(--line)",
                borderRadius: "8px",
                fontSize: "13.5px",
              }}
            >
              <span style={{ flex: 1 }}>{item}</span>
              <button type="button" className="icon-btn icon-btn-danger" onClick={() => onRemove(i)} disabled={disabled} title="Remove">
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!atMax && (
        <div style={{ display: "flex", gap: "8px" }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-secondary" onClick={submit} disabled={disabled || !value.trim()}>
            Add
          </button>
        </div>
      )}
      {max && (
        <div style={{ fontSize: "12px", color: "var(--slate)", marginTop: "6px" }}>
          {items.length} / {max}
        </div>
      )}
    </div>
  );
}
