import { color, cubehelix } from "d3-color";
import { interpolateViridis as colorRamp } from "d3-scale-chromatic";
import isEqual from "lodash.isequal";
import { Map, View } from "ol";
import { defaults as defaultControls } from "ol/control";
import { containsExtent } from "ol/extent";
import VectorTile from "ol/VectorTile";
import MVT from "ol/format/MVT";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import * as proj from "ol/proj";
import VectorTileSource from "ol/source/VectorTile";
import XYZ from "ol/source/XYZ";
import { Style } from "ol/style";
import { createXYZ } from "ol/tilegrid";
import Colorize from "ol-ext/filter/Colorize";
import { Component, createElement, createRef } from "react";

import "ol/ol.css";

import SelectExtentControl from "./SelectExtentControl";
import SelectFacetControl from "./SelectFacetControl";

const TRUE_PREDICATE = () => true;

class Cache {
  constructor({ maxZoom = 22, minZoom = 0, onChange }) {
    this.onChange = onChange;
    this.tileGrid = createXYZ({
      maxZoom,
      minZoom
    });

    this._cache = {};
    this.filter = TRUE_PREDICATE;
    this.maxZoom = maxZoom;
    this.minZoom = minZoom;
  }

  addFeatures(tileCoord, features) {
    this._cache[tileCoord.join("/")] = features;
    this.onChange();
  }

  clearFilter() {
    this.filter = TRUE_PREDICATE;
  }

  getFilter() {
    return this.filter;
  }

  setFilter(filter) {
    this.filter = filter;
  }

  clear(tileCoord) {
    delete this._cache[tileCoord.join("/")];
    this.onChange();
  }

  query(extent, zoom) {
    const features = [];

    // adjust zoom to account for tileSize difference between vector + raster sources
    this.tileGrid.forEachTileCoord(
      extent,
      Math.min(this.maxZoom, Math.round(zoom) - 1),
      tileCoord => {
        Array.prototype.push.apply(features, this._cache[tileCoord.join("/")]);
      }
    );

    return features
      .filter(this.filter)
      .filter(f => containsExtent(extent, f.getGeometry().getExtent()));
  }
}

class FilterableVectorTileSource extends VectorTileSource {
  constructor(options) {
    super(options);

    this.filter_ = options.filter;
  }

  getFilter() {
    return this.filter_;
  }

  setFilter(filter) {
    this.filter_ = filter;

    // apply the filter (and fire "change" events)
    this.refresh();
  }

  getTile(z, x, y, pixelRatio, projection) {
    const tile = super.getTile(z, x, y, pixelRatio, projection);

    // NOTE: this uses a private API (sourceTiles_)
    Object.values(tile.sourceTiles_).forEach(t => t.setFilter(this.filter_));

    return tile;
  }
}

export default class OLMap extends Component {
  constructor(props) {
    super(props);

    const { dates, onLoad } = props;

    const cache = (this._cache = new Cache({
      maxZoom: 10,
      minZoom: 0,
      onChange: onLoad
    }));

    class FeatureCacheableVectorTile extends VectorTile {
      getFeatures() {
        if (this.filter_ != null) {
          return super.getFeatures().filter(this.filter_);
        }

        return super.getFeatures();
      }

      setFeatures(features) {
        super.setFeatures(features);

        cache.addFeatures(this.getTileCoord(), features);
      }

      getFilter() {
        return this.filter_;
      }

      setFilter(filter) {
        this.filter_ = filter;
      }

      disposeInternal() {
        cache.clear(this.getTileCoord());

        super.disposeInternal();
      }
    }

    this.source = new FilterableVectorTileSource({
      crossOrigin: "use-credentials",
      format: new MVT({
        layers: ["edits"]
      }),
      overlaps: false,
      // TODO configure this
      maxZoom: 10,
      minZoom: 0,
      tileClass: FeatureCacheableVectorTile,
      url:
        process.env.REACT_APP_RECENCY_TILE_URL ||
        "https://mojodna-temp.s3.amazonaws.com/detroit-edits/{z}/{x}/{y}.mvt"
    });

    this.source.on("change", onLoad);

    this.vtLayer = new VectorTileLayer({
      source: this.source,
      renderBuffer: 10,
      style: this.makeStyle(dates)
    });

    this.tileLayer = new TileLayer({
      opacity: 0.9,
      source: new XYZ({
        maxZoom: 19,
        url:
          process.env.REACT_APP_BASE_TILE_URL ||
          "https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      })
    });

    const filters = [new Colorize("grayscale"), new Colorize("invert")];

    filters.forEach(f => this.tileLayer.addFilter(f));
  }

  componentDidMount() {
    const {
      dates,
      facets,
      height,
      latitude,
      longitude,
      maxZoom,
      minZoom,
      onExtentSelected,
      onFacetChange,
      onViewChange,
      selectedFacet,
      width,
      zoom
    } = this.props;

    const view = new View({
      center: proj.fromLonLat([longitude, latitude]),
      maxZoom,
      minZoom,
      zoom
    });

    const filter = this.makeFilter(selectedFacet);

    this._cache.setFilter(filter);
    this.source.setFilter(filter);

    this.vtLayer.setStyle(this.makeStyle(dates));

    const controls = defaultControls().extend([
      new SelectExtentControl({ onExtentSelected })
    ]);

    if (process.env.REACT_APP_ENABLE_FACETS) {
      controls.push(
        new SelectFacetControl({ onChange: onFacetChange, facets })
      );
    }

    this._map = new Map({
      controls,
      layers: [this.tileLayer, this.vtLayer],
      target: this._mapRef.current,
      view
    });

    this._map.getView().on("change", evt => onViewChange(evt.target));

    this._map.setSize([width, height]);
  }

  componentDidUpdate(prevProps) {
    const { dates, maxValue, selectedFacet, height, width } = this.props;

    if (!isEqual(dates, prevProps.dates) || maxValue !== prevProps.maxValue) {
      this.vtLayer.setStyle(this.makeStyle(dates));
    }

    if (selectedFacet !== prevProps.selectedFacet) {
      const filter = this.makeFilter(selectedFacet);

      this._cache.setFilter(filter);
      this.source.setFilter(filter);
    }

    if (height !== prevProps.height || width !== prevProps.width) {
      this._map.setSize([width, height]);
    }
  }

  componentWillUnmount() {
    this._map.dispose();
    this._map = null;
  }

  _map = null;
  _mapRef = createRef();

  getCache = () => this._cache;

  getMap = () => this._map;

  makeFilter = selectedFacet => {
    const { firstDate, lastDate } = this.props;

    return f =>
      Object.keys(f.getProperties()).some(k => {
        const [date, facet] = k.split(":");
        return (
          !k.startsWith("__") &&
          firstDate <= date &&
          date <= lastDate &&
          // eslint-disable-next-line eqeqeq
          facet == selectedFacet
        );
      });
  };

  makeStyle = dates => {
    const { lastDate, maxValue, selectedFacet } = this.props;
    const toShow = dates.length;
    const colors = dates.reduce(
      (acc, date, idx) => ({
        ...acc,
        [date.value]: colorRamp(toShow - 1 === 0 ? 1 : idx / (toShow - 1))
      }),
      {}
    );

    return new Style({
      renderer: (geom, context) => {
        const {
          context: ctx,
          feature,
          geometry,
          pixelRatio,
          resolution
        } = context;

        const scaleFactor =
          Math.max(
            resolution,
            this._map.getView().getResolutionForZoom(10 + 1)
          ) / this._map.getView().getResolution();

        const lastEditKey = selectedFacet
          ? `__lastEdit:${selectedFacet}`
          : "__lastEdit";
        const lastEdit = Math.min(
          lastDate,
          feature.getProperties()[lastEditKey]
        );

        const totalKey = selectedFacet ? `__total:${selectedFacet}` : "__total";
        const total = feature.getProperties()[totalKey];

        try {
          if (lastEdit != null && colors[lastEdit] != null) {
            ctx.fillStyle = colors[lastEdit];

            if (maxValue != null) {
              const ch = cubehelix(color(colors[lastEdit]));
              // adjust saturation according to relative volume
              ch.s = Math.log(total) / Math.log(maxValue);

              ctx.fillStyle = ch.rgb();
            }

            switch (geometry.getType()) {
              case "Point": {
                const cellWidth = 4 * pixelRatio * scaleFactor;
                const size = Math.max(
                  1 * pixelRatio * scaleFactor,
                  (cellWidth * Math.log(total)) / Math.log(maxValue)
                );

                ctx.beginPath();

                ctx.arc(
                  geom[0] + cellWidth / 2,
                  geom[1] + cellWidth / 2,
                  size / 2,
                  0,
                  2 * Math.PI
                );

                ctx.closePath();
                ctx.fill();

                return;
              }

              default:
                throw new Error(
                  `Unsupported geometry type: ${geometry.getType()}`
                );
            }
          }
        } finally {
          ctx.globalAlpha = 1;
        }
      }
    });
  };

  render() {
    const { className, width, height, style } = this.props;

    const mapContainerStyle = {
      position: "relative",
      ...style,
      width,
      height
    };
    return createElement("div", {
      key: "map-container",
      style: mapContainerStyle,
      children: [
        createElement("div", {
          key: "map-ol",
          ref: this._mapRef,
          className
        })
      ]
    });
  }
}
