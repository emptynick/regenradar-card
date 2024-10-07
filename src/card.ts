import { html, LitElement, TemplateResult, nothing } from "lit";
import { styles } from "./card.styles";
import { state } from "lit/decorators/state";
import "./map";

import { HassEntity } from "home-assistant-js-websocket";
import { HomeAssistant, LovelaceCardConfig } from "custom-card-helpers";

interface Config extends LovelaceCardConfig {
    header: string;
    lat: number;
    lon: number;
    zoom: number;

}

export class ToggleCardTypeScript extends LitElement {
  // internal reactive states
  @state() private _header: string | typeof nothing;
  @state() private _entity: string;
  @state() private _name: string;
  @state() private _state: HassEntity;
  @state() private _status: string;

  // private property
  private _hass;

  // lifecycle interface
  private _lat: number;
  private _lon: number;
  setConfig(config: Config) {
    this._header = config.header === "" ? nothing : config.header;
    this._lat = config.lat;
    this._lon = config.lon;
    // call set hass() to immediately adjust to a changed entity
    // while editing the entity in the card editor
    if (this._hass) {
      this.hass = this._hass;
    }
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
  }

  // declarative part
  static styles = styles;

  render() {
    let content: TemplateResult;


    return html`
      <ha-card>
        <div class="card-content">
          <regenradar-card-map
              .lat=${this._lat} 
              .lon=${this._lon}>
            
          </regenradar-card-map>
        </div>
      </ha-card>
    `;
  }

  // event handling
  doToggle() {
    this._hass.callService("input_boolean", "toggle", {
      entity_id: this._entity,
    });
  }

  // card configuration
  static getConfigElement() {
    return document.createElement("regenradar-card-editor");
  }

  static getStubConfig() {
    return {
      lat: 1.123,
      lon: 2.345,
      zoom: 9,
    };
  }
}

