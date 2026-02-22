import type { Component } from "solid-js";
import { LayoutProvider } from "./components/layout/LayoutContext";
import AppShell from "./components/layout/AppShell";

const App: Component = () => {
  return (
    <LayoutProvider>
      <AppShell />
    </LayoutProvider>
  );
};

export default App;
