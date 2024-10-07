import { ToggleCardTypeScript } from "./card";
import { RegenradarEditor } from "./editor";

declare global {
  interface Window {
    customCards: Array<Object>;
  }
}

customElements.define("regenradar-card", ToggleCardTypeScript);
customElements.define(
  "regenradar-card-editor",
  RegenradarEditor
);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "regenradar-card",
  name: "Regen Radar",
  description: "Regen Radar card",
});
