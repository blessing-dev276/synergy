import { Link } from "react-router-dom";
import PageMeta from "../components/PageMeta.jsx";

export default function NotFound() {
  return (
    <>
      <PageMeta title="Page not found" />
      <section className="wrap notfound">
        <div className="code mono">404</div>
        <h1>That page doesn't exist.</h1>
        <p>The link might be broken, or the page may have moved.</p>
        <Link to="/" className="btn btn-primary">
          Back to Home
        </Link>
      </section>
    </>
  );
}
