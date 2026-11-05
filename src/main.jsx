import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { KopriProvider } from "./state/KopriContext.jsx";
import "./styles/app.css";
import { registerServiceWorker } from "./lib/pwa.js";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <KopriProvider>
        <App />
      </KopriProvider>
    </BrowserRouter>
  </React.StrictMode>
);