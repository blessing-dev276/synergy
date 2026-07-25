export default function Steps({ items }) {
  return (
    <div className="steps">
      {items.map((item, i) => (
        <div className="step" key={item.title}>
          <div className="step-num mono">{String(i + 1).padStart(2, "0")}</div>
          <div>
            <h4>{item.title}</h4>
            <p>{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
