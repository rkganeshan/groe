import React from "react";
import { createRoot } from "react-dom/client";
import Popup from "./popup";
import "../shared/theme.css";
import "./popup.css";

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(<Popup />);
