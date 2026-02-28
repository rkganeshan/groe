import React from "react";
import { createRoot } from "react-dom/client";
import OptionsApp from "./OptionsApp";
import "../shared/theme.css";
import "./options.css";

const container = document.getElementById("root")!;
const root = createRoot(container);
root.render(<OptionsApp />);
