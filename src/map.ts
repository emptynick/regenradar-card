import { HomeAssistant } from 'custom-card-helpers';
import { CSSResultGroup, PropertyValues, ReactiveElement, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators';

import { Feature, Map, View } from 'ol';
import * as olStyles from 'bundle-text:ol/ol.css' with { type: 'css' };
import { Control, defaults } from 'ol/control';
import { Point } from 'ol/geom';
import { Tile, Image, Vector as LayerVector } from 'ol/layer';
import { fromLonLat, transform } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import { ImageStatic, OSM, Vector } from 'ol/source';
import { Icon, Style } from 'ol/style';

import {inflate} from 'pako';
import proj4 from 'proj4';
import { turbo } from './js-colormap';

const gridProjection = 'DE1200';
const gridProjStr = '+proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6378137 +b=6356752.3142451802 +no_defs +x_0=543196.83521776402 +y_0=3622588.8619310018';

class FrameControl extends Control {
    private frames: any;
    private layer: any;
    private slider: HTMLInputElement;
    private label: HTMLHeadingElement;
    private toggle: HTMLImageElement;
    private autoplayIntervalId: any;

    constructor(layer, frames=undefined) {
        const slider = document.createElement('input');
        slider.type = 'range';
        const label = document.createElement('h3');
        const toggle = document.createElement('img');
        toggle.src = new URL(
            'pause.svg',
            import.meta.url
        ).toString();
        const element = document.createElement('div');
        element.className = 'frame-selector ol-unselectable ol-control';
        element.appendChild(label);
        element.appendChild(toggle);
        element.appendChild(slider);

        super({
            element: element,
        });
        this.frames = frames;
        this.layer = layer;
        this.slider = slider;
        this.label = label;
        this.toggle = toggle;
        this.autoplayIntervalId = null;

        slider.addEventListener('input', () => {
            this.stopAutoplay();
            this.setFrame()
        }, false);
        toggle.addEventListener('click', () => this.toggleAutoplay(), false);
    }

    setFrames(frames) {
        this.frames = frames;
        this.slider.min = '0';
        this.slider.max = (frames.length - 1).toString();
        this.slider.value = '0';
        this.setFrame();
    }

    setFrame(idx = undefined) {
        idx = typeof idx !== 'undefined' ? idx : this.slider.value;
        this.label.textContent = this.frames[idx].label;
        this.layer.setSource(this.frames[idx].source);
    }

    nextFrame() {
        if (this.slider.value == this.slider.max) {
            this.slider.value = '0';
        } else {
            this.slider.stepUp();
        }
        this.setFrame();
    }

    startAutoplay() {
        this.autoplayIntervalId = setInterval(this.nextFrame.bind(this), 500);
        this.toggle.src = new URL('pause.svg', import.meta.url).toString();
    }

    stopAutoplay() {
        clearInterval(this.autoplayIntervalId);
        this.autoplayIntervalId = null;
        this.toggle.src = new URL('play.svg', import.meta.url).toString();
    }

    toggleAutoplay() {
        if (this.autoplayIntervalId !== null) {
            this.stopAutoplay();
        } else {
            this.startAutoplay();
        }
    }
}

function decompress(raw) {
    // Get raw (zlib-encoded) bytes from base64 string
    const compressed = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    // Decompress zlib-encoded bytes into original bytes
    const rawBytes = inflate(compressed).buffer;
    // Interpret decompressed bytes as 2-byte integers
    return new Uint16Array(rawBytes);
}

function precipitation_to_rgba(precip) {
    // Normalize, using 2.5 mm in 5 minutes as maximum
    const val = Math.min(precip, 250) / 250;
    // Convert to color using js-colormap's turbo colormap
    const rgb = turbo(val);
    // Make no rain fully transparent, use 50 - 204 alpha range (~0.2 - 0.8 opacity) for other values
    const alpha = Math.max(Math.min(val * 10, .8) * 255, precip ? 50 : 0);
    return [...rgb, alpha]
}

function makeSource(record, width, height, projection, extent) {
    // Create an OpenLayers source with PNG data URL from a given radar record
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; // Enable image smoothing
    canvas.width = width;
    canvas.height = height;
    const imageData = ctx.createImageData(width, height);

    for (const [idx, precip] of decompress(record.precipitation_5).entries()) {
        let rgba = precipitation_to_rgba(precip);
        imageData.data[idx * 4] = rgba[0];
        imageData.data[idx * 4 + 1] = rgba[1];
        imageData.data[idx * 4 + 2] = rgba[2];
        imageData.data[idx * 4 + 3] = rgba[3];
    }

    ctx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL();

    const source = new ImageStatic({
        url: url,
        projection: projection,
        imageExtent: extent,
        interpolate: true,
        attributions: '© <a href="https://www.dwd.de/">DWD</a>',
    });

    return {
        label: record.timestamp.substring(11, 16),
        source: source,
    }
}

@customElement('regenradar-card-map')
export class RegenRadarMap extends ReactiveElement {
    @state() private _loaded = false;

    @property({attribute: false, type: Number}) public lat = 0;
    @property({attribute: false, type: Number}) public lon = 0;
    @property({type: Number}) public zoom = 9;

    private _loading = false;
    private map: Map;
    private frameControl: FrameControl;
    private interval: ReturnType<typeof setInterval>;

    public connectedCallback(): void {
        super.connectedCallback();
        console.log('connected', this.lat, this.lon, this.zoom);
        this._loadMap();
        /*
        this._attachObserver();*/
    }

    public disconnectedCallback(): void {
        super.disconnectedCallback();

        if (this.map) {
            this.map.dispose();
            this.map = undefined;
        }
        if (this.interval) {
            clearInterval(this.interval);
        }

        this._loaded = false;
        /*
        if (this._resizeObserver) {
            this._resizeObserver.unobserve(this);
        }*/
    }

    private async _loadMap(): Promise<void> {
        if (this._loading) return;
        let map = this.shadowRoot!.getElementById('map');
        if (!map) {

            map = document.createElement('div');
            map.id = 'map';
            this.shadowRoot!.append(map);
        }
        this._loading = true;
        try {
            const imageLayer = new Image();
            this.frameControl = new FrameControl(imageLayer);

            proj4.defs(gridProjection, gridProjStr);
            register(proj4);

            const tile = new Tile({
                source: new OSM(),
            });

            tile.on('prerender', (evt) => {
                if (evt.context) {
                    const context = evt.context as CanvasRenderingContext2D;
                    context.filter = 'grayscale(80%) invert(100%) ';
                    context.globalCompositeOperation = 'source-over';
                }
                });

            tile.on('postrender', (evt) => {
                if (evt.context) {
                    const context = evt.context as CanvasRenderingContext2D;
                    context.filter = 'none';
                }
            });

            this.map = new Map({
                target: map,
                layers: [
                    tile,
                    imageLayer,
                ],
                view: new View({
                    center: fromLonLat([this.lon, this.lat]),
                    //center: ol.proj.transform(ol.extent.getCenter(gridExtent), gridProjection, 'EPSG:3857'),
                    zoom: this.zoom,
                }),
                controls: defaults().extend([ this.frameControl ]),
            });

            // home marker
            const marker = new Feature({
                geometry: new Point(fromLonLat([this.lon, this.lat])), // Replace with your desired coordinates
            });
            const iconStyle = new Style({
                image: new Icon({
                    anchor: [0.5, 46], // Anchor point in the icon
                    anchorXUnits: 'fraction',
                    anchorYUnits: 'pixels',
                    src: new URL(
                        'home.png',
                        import.meta.url
                    ).toString(), // Path to the icon image
                    scale: 0.1,
                }),
            });
            marker.setStyle(iconStyle);

            // Step 3: Add the marker to a vector source
            const vectorSource = new Vector({
                features: [marker],
            });

            // Step 4: Create a vector layer with the vector source
            const vectorLayer = new LayerVector({
                source: vectorSource,
            });

            // Step 5: Add the vector layer to the map
            this.map.addLayer(vectorLayer);
            this.updateData(true);
            this.interval = setInterval(() => this.updateData(), 1000 * 60 * 15); // Update every 15 minutes

            this._loaded = true;
        } finally {
            this._loading = false;
        }
    }

    protected update(changedProps: PropertyValues) {
        super.update(changedProps);

        if (!this._loaded) {
            return;
        }
        console.log('update', changedProps);

        let autoFitRequired = false;
        const oldHass = changedProps.get('hass') as HomeAssistant | undefined;

        if (changedProps.has('_loaded') || changedProps.has('latitude') || changedProps.has('longitude')) {
            this._draw();
            autoFitRequired = true;
        }
    }

    static get styles(): CSSResultGroup {
        return [unsafeCSS(olStyles), css`
            
            :host {
                display: block;
                height: 300px;
            }

            #map {
                height: 100%;
            }
            @keyframes spinner {
                to {
                    transform: rotate(360deg);
                }
            }

            .spinner {
                opacity: .5;
            }

            .spinner:after {
                content: "";
                box-sizing: border-box;
                position: absolute;
                top: 50%;
                left: 50%;
                width: 80px;
                height: 80px;
                margin-top: -40px;
                margin-left: -40px;
                border-radius: 50%;
                border: 10px solid rgba(180, 180, 180, 1);
                border-top-color: rgba(0, 0, 0, 1);
                animation: spinner 0.6s linear infinite;
            }

            .frame-selector {
                left: 25px;
                bottom: 25px;
                background-color: #000000aa;
                padding: 6px;
            }

            .frame-selector h3 {
                color: #eeeeee;
                font-size: 24px;
                font-family: system-ui, sans-serif;
                margin: 0;
                margin-top: .125rem;
                margin-bottom: .25rem;
                text-align: center;
            }

            .frame-selector img {
                height: 24px;
                margin-right: .5rem;
                margin-left: .25rem;
            }
        `];
    }

    private _draw() {
    }

    private updateData(first=false): void {
        const start = new Date();
        const endDate = new Date(start.getTime() + 1000 * 60 * 60 * 3);

        fetch(
            `https://api.brightsky.dev/radar?tz=Europe/Berlin&lat=${this.lat}&lon=${this.lon}&distance=100000&date=${start.toISOString()}&last_date=${endDate.toISOString()}`
        ).then((resp) => resp.json(),
        ).then((data) => {
            const topLeft = transform(data.geometry.coordinates[0], 'EPSG:4326', 'DE1200');
            const bottomRight = transform(data.geometry.coordinates[2], 'EPSG:4326', 'DE1200');
            const gridExtent = [ Math.round(topLeft[0]), Math.round(bottomRight[1]), Math.round(bottomRight[0]), Math.round(topLeft[1]) ];
            const [ top, left, bottom, right ] = data.bbox;
            const gridWidth = right + 1 - left;
            const gridHeight = bottom + 1 - top;
            const frames = data.radar.map((record) => makeSource(record, gridWidth, gridHeight, gridProjection, gridExtent));
            this.frameControl.setFrames(frames);
            if (first) {
                this.frameControl.startAutoplay();
                this.map.getTargetElement().classList.remove('spinner');
            }
        });
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'regenradar-card-map': RegenRadarMap;
    }
}