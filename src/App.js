import debounce from "debounce";
import isEqual from "lodash.isequal";
import * as proj from "ol/proj";
import React, { Component } from "react";

import "ol/ol.css";

import ControlPanel from "./ControlPanel";
import OLMap from "./OLMap";

const FIRST_DATE = Number(process.env.REACT_APP_FIRST_DATE || 200701);
const now = new Date();
const LAST_DATE = Number(
  process.env.REACT_APP_LAST_DATE ||
    now.getFullYear() * 1000 +
      Math.ceil((now - new Date(now.getFullYear(), 0, 0)) / 86400e3)
);

const INITIAL_DAYS_TO_SHOW = 90;

const FACETS = {
  created: {
    description: "nodes were created",
    label: "created nodes"
  },
  modified: {
    description: "features were modified",
    label: "modified features"
  },
  deleted: {
    description: "nodes were deleted",
    label: "deleted features"
  },
  building: {
    description: "buildings were edited",
    label: "buildings"
  },
  road: {
    description: "roads were edited",
    label: "roads"
  },
  waterway: {
    description: "waterways were edited",
    label: "waterways"
  },
  poi: {
    description: "POIs were edited",
    label: "POIs"
  },
  coastline: {
    description: "coastlines were edited",
    label: "coastline"
  },
  metadataOnly: {
    description: "metadata-only changes were made",
    label: "metadata-only"
  }
};

const DATES = [...Array(20).keys()]
  .map(value => value + 2005)
  .flatMap(year => {
    return (
      [...Array(366).keys()]
        // filter out leap days
        .map(dayOfYear => dayOfYear + 1)
        .filter(
          dayOfYear =>
            dayOfYear <= 365 ||
            (year % 4 === 0 && year % 100 !== 0) ||
            year % 400 === 0
        )
        .map(dayOfYear => {
          const date = new Date(year, 0);
          date.setDate(dayOfYear);

          return {
            label: date.toLocaleDateString(),
            value: year * 1000 + dayOfYear
          };
        })
        .filter(({ value }) => value <= LAST_DATE && value >= FIRST_DATE)
    );
  });

class App extends Component {
  debouncedSetState = debounce(newState => this.setState(newState), 40);

  constructor(props) {
    super(props);

    this.mapRef = React.createRef();

    const endIndex = DATES.length;
    const startIndex = Math.max(0, endIndex - INITIAL_DAYS_TO_SHOW);

    this.state = {
      dates: DATES.slice(startIndex, endIndex),
      startIndex,
      endIndex,
      histogram: {},
      selectedFacet: null,
      totalEdits: 0,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight - 375,
        longitude: 0,
        latitude: 45,
        zoom: 2,
        // Detroit
        // longitude: -83.0611,
        // latitude: 42.3395,
        // zoom: 10,
        minZoom: 0,
        maxZoom: 18
      },
      visibleFeatures: []
    };
  }

  componentDidMount() {
    window.addEventListener("resize", this._resize);
    this._resize();
  }

  componentDidUpdate(
    prevProps,
    {
      dates: prevDates,
      histogram: prevHistogram,
      visibleFeatures: previouslyVisibleFeatures
    }
  ) {
    const { dates, histogram, visibleFeatures } = this.state;

    if (
      !isEqual(dates, prevDates) ||
      !isEqual(visibleFeatures, previouslyVisibleFeatures) ||
      !isEqual(histogram, prevHistogram)
    ) {
      this._updateVisibleAggregates();
    }
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this._resize);
  }

  _resize = () => {
    this.debouncedSetState({
      viewport: {
        ...this.state.viewport,
        width: window.innerWidth,
        height: window.innerHeight - 375
      }
    });
  };

  _onExtentSelected = selectedExtent => {
    this.debouncedSetState({
      selectedExtent
    });

    this._updateFeatures();
  };

  _onFacetChange = selectedFacet =>
    this.setState({
      selectedFacet
    });

  _onViewChange = view => {
    const [longitude, latitude] = proj.toLonLat(view.getCenter());

    this.setState({
      viewport: {
        ...this.state.viewport,
        longitude,
        latitude,
        zoom: view.getZoom()
      }
    });

    this._updateFeatures();
  };

  _updateVisibleAggregates = debounce(() => {
    const { dates, histogram, selectedFacet, visibleFeatures } = this.state;

    const totalKey =
      selectedFacet != null ? `__total:${selectedFacet}` : "__total";
    const maxValue = Math.max(
      ...visibleFeatures
        .filter(f =>
          Object.keys(f.getProperties()).some(k => {
            const [date, facet] = k.split(":");

            return (
              // ignore aggregate keys
              !k.startsWith("__") &&
              // ensure that dates are within the (configured) target date range
              dates[0].value <= Number(date) &&
              Number(date) <= dates[dates.length - 1].value &&
              // only include the requested facet (may be null)
              // eslint-disable-next-line eqeqeq
              facet == selectedFacet
            );
          })
        )
        .map(f => f.getProperties()[totalKey])
    );

    const totalEdits = Object.entries(histogram)
      .filter(
        ([k, v]) =>
          dates[0].value <= Number(k) &&
          Number(k) <= dates[dates.length - 1].value
      )
      .reduce((acc, [k, v]) => (acc += v), 0);

    this.debouncedSetState({
      maxValue,
      totalEdits
    });
  });

  _updateFeatures = debounce(() => {
    if (this.mapRef.current != null) {
      const { selectedExtent, selectedFacet } = this.state;

      const map = this.mapRef.current.getMap();
      const cache = this.mapRef.current.getCache();

      const extent =
        selectedExtent || map.getView().calculateExtent(map.getSize());

      const visibleFeatures = cache
        .query(extent, map.getView().getZoom())
        .filter(f =>
          Object.keys(f.getProperties()).some(k => {
            const [date] = k.split(":");
            return (
              !k.startsWith("__") &&
              FIRST_DATE <= Number(date) &&
              Number(date) <= LAST_DATE
            );
          })
        );

      const histogram = visibleFeatures.reduce((acc, f) => {
        Object.entries(f.getProperties())
          .filter(([k]) => {
            const [date, facet] = k.split(":");
            return (
              // ignore aggregate keys
              !k.startsWith("__") &&
              // ensure that dates are within the (configured) target date range
              FIRST_DATE <= Number(date) &&
              Number(date) <= LAST_DATE &&
              // only include the requested facet (may be null)
              // eslint-disable-next-line eqeqeq
              facet == selectedFacet
            );
          })
          .forEach(([k, props]) => {
            // strip facet names when producing a histogram
            const [date] = k.split(":");
            acc[date] = (acc[date] || 0) + props;
          });

        return acc;
      }, {});

      this.debouncedSetState({
        histogram,
        visibleFeatures
      });
    }
  }, 500);

  _updateDateRange = ([startIndex, endIndex]) => {
    this.debouncedSetState({
      dates: DATES.slice(startIndex, endIndex),
      startIndex,
      endIndex
    });
  };

  render() {
    const {
      dates,
      startIndex,
      endIndex,
      histogram,
      maxValue,
      selectedFacet,
      totalEdits,
      viewport,
      visibleFeatures
    } = this.state;

    return (
      <div>
        <OLMap
          {...viewport}
          facets={FACETS}
          firstDate={FIRST_DATE}
          lastDate={LAST_DATE}
          dates={dates}
          maxValue={maxValue}
          onLoad={this._updateFeatures}
          onExtentSelected={this._onExtentSelected}
          onFacetChange={this._onFacetChange}
          onViewChange={this._onViewChange}
          ref={this.mapRef}
          selectedFacet={selectedFacet}
          transformRequest={this._transformRequest}
        />
        <ControlPanel
          onChange={this._updateDateRange}
          dates={DATES}
          startIndex={startIndex}
          endIndex={endIndex}
          features={visibleFeatures}
          histogram={histogram}
          marginTop={viewport.height}
          totalEdits={totalEdits}
          selectedFacet={selectedFacet}
          facets={FACETS}
        />
      </div>
    );
  }
}

export default App;
