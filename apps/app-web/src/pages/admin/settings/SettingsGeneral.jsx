import Icon from "../../../components/Icon.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

export default function SettingsGeneral() {
  return (
    <div>
      <div className="section-heading">
        <h1>General</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Organization-wide preferences — name, branding, and defaults — will live here.
      </p>

      <EmptyState icon={<Icon name="briefcase" size={26} />} title="Coming soon" />
    </div>
  );
}
