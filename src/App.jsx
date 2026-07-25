import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Freelancing from "./pages/Freelancing.jsx";
import NetworkMarketing from "./pages/NetworkMarketing.jsx";
import Leadership from "./pages/Leadership.jsx";
import Gallery from "./pages/Gallery.jsx";
import GalleryAdmin from "./pages/GalleryAdmin.jsx";
import Stories from "./pages/Stories.jsx";
import Join from "./pages/Join.jsx";
import FAQ from "./pages/FAQ.jsx";
import Disclaimer from "./pages/Disclaimer.jsx";
import Privacy from "./pages/Privacy.jsx";
import NotFound from "./pages/NotFound.jsx";

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/freelancing" element={<Freelancing />} />
        <Route path="/network-marketing" element={<NetworkMarketing />} />
        <Route path="/leadership" element={<Leadership />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery-admin" element={<GalleryAdmin />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/join" element={<Join />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/disclaimer" element={<Disclaimer />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
