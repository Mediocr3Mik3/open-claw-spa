/**
 * openclaw-spa — Desktop Renderer Entry Point
 *
 * ⚠️  UNTESTED — included for ease of use. See README for details.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
