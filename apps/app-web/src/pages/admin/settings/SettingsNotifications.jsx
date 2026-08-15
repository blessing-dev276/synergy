import Icon from "../../../components/Icon.jsx";
import EmptyState from "../../../components/state/EmptyState.jsx";

export default function SettingsNotifications() {
  return (
    <div>
      <div className="section-heading">
        <h1>Notifications</h1>
      </div>
      <p style={{ color: "var(--slate)", marginTop: "-10px", marginBottom: "24px" }}>
        Controls for which admin notifications go out, and to whom, will live here.
      </p>

      <EmptyState icon={<Icon name="bell" size={26} />} title="Coming soon" />
    </div>
  );
}
