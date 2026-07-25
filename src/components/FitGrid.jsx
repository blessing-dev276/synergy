export default function FitGrid({ yes, no }) {
  return (
    <div className="fit-grid">
      <div className="fit-card yes">
        <h4>This track is for you if…</h4>
        <ul>
          {yes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="fit-card no">
        <h4>Look elsewhere if…</h4>
        <ul>
          {no.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
