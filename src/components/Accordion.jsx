import { useRef, useState } from "react";

function AccordionItem({ q, a, isOpen, onToggle }) {
  const panelRef = useRef(null);

  return (
    <div className={`accordion-item ${isOpen ? "open" : ""}`}>
      <button
        className="accordion-trigger"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span>{q}</span>
        <span className="plus" aria-hidden="true" />
      </button>
      <div
        className="accordion-panel"
        style={{ maxHeight: isOpen ? panelRef.current?.scrollHeight : 0 }}
      >
        <div className="accordion-panel-inner" ref={panelRef}>
          {a}
        </div>
      </div>
    </div>
  );
}

export default function Accordion({ items, defaultOpenIndex = -1 }) {
  const [openIndex, setOpenIndex] = useState(defaultOpenIndex);

  return (
    <div className="accordion">
      {items.map((item, i) => (
        <AccordionItem
          key={item.q}
          q={item.q}
          a={item.a}
          isOpen={openIndex === i}
          onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
        />
      ))}
    </div>
  );
}
