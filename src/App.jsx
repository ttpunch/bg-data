import { BrowserRouter as Router } from "react-router-dom";
import Layout from "./components/Layout";
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/sonner";

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <Router>
        <Layout />
        <Toaster />
      </Router>
    </ThemeProvider>
  );
}

export default App;
