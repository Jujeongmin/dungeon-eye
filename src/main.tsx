import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameServerProvider } from "@agent8/gameserver";
import App from "./App";
import "./index.css";
import { installUiTheme } from "./ui/theme";

installUiTheme();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameServerProvider>
      <App />
    </GameServerProvider>
  </StrictMode>,
);
