import { css, html, LitElement } from "lit";
import { state } from "lit/decorators/state";

export class RegenradarEditor extends LitElement {
  @state() _config;

  setConfig(config) {
    this._config = config;
  }

  static styles = css`
    .table {
      display: table;
    }
    .row {
      display: table-row;
    }
    .cell {
      display: table-cell;
      padding: 0.5em;
    }
  `;

  render() {
    return html`
            <form class="table">
                <div class="row">
                    <label class="label cell" for="lat">Latitude:</label>
                    <input
                        @change="${this.handleChangedEvent}"
                        class="value cell" id="lat" value="${this._config.lat}">
                </div>
                <div class="row">
                    <label class="label cell" for="lon">Longitude:</label>
                    <input
                        @change="${this.handleChangedEvent}"
                        class="value cell" id="lon" value="${this._config.lon}">
                </div>
                <div class="row">
                    <label class="label cell" for="zoom">Zoom:</label>
                    <input
                        @change="${this.handleChangedEvent}"
                        class="value cell" id="zoom" value="${this._config.zoom}" type="number">
                </div>
            </form>
        `;
  }

  handleChangedEvent(changedEvent: Event) {
    const target = changedEvent.target as HTMLInputElement;
    // this._config is readonly, copy needed
    const newConfig = Object.assign({}, this._config);
    if (target.id == "lat") {
      newConfig.lat = parseFloat(target.value);
    } else if (target.id == "lon") {
      newConfig.lon = parseFloat(target.value);
    } else if (target.id == "zoom") {
      newConfig.zoom = parseInt(target.value);
    }
    const messageEvent = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(messageEvent);
  }
}
