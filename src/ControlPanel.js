import { interpolateViridis as colorRamp } from "d3-scale-chromatic";
import { Range } from "rc-slider";
import "rc-slider/assets/index.css";
import { AutoSizer } from "react-virtualized";
import React, { PureComponent } from "react";
import { XYPlot, Highlight, Hint, VerticalBarSeries } from "react-vis";

import ScaleRamp from "./ScaleRamp";

export default class ControlPanel extends PureComponent {
  constructor(props) {
    super(props);

    const { dates, startIndex, endIndex } = props;

    this.marks = {
      0: {
        style: {
          width: "initial",
          marginLeft: "initial",
          left: 0,
          transform: "initial"
        },
        label: dates[0].label
      },
      [endIndex]: {
        style: {
          width: "initial",
          marginLeft: "initial",
          left: "initial",
          right: 0,
          transform: "initial"
        },
        label: dates[endIndex - 1].label
      }
    };

    // track startIndex and endIndex in state, as prop changes are debounced
    this.state = {
      startIndex,
      endIndex,
      highlightOpacity: 0,
      log10: true
    };

    props.onChange([startIndex, endIndex]);
  }

  _onChange = ([startIndex, endIndex]) => {
    const { onChange } = this.props;

    this.setState({
      startIndex,
      endIndex
    });

    onChange([startIndex, endIndex]);
  };

  _onScaleChange = ({ target: { checked: log10 } }) =>
    this.setState({
      log10
    });

  _onRangeChange = ([startIndex, endIndex]) => {
    this.setState({
      highlightOpacity: 0
    });

    this._onChange([startIndex, endIndex]);
  };

  _onBrushEnd = evt => {
    if (evt == null) {
      return;
    }

    const { dates } = this.props;

    this.setState({
      highlightOpacity: 0.3
    });

    this._onChange([
      Math.max(0, Math.round(evt.left)),
      Math.min(dates.length, Math.round(evt.right) + 1)
    ]);
  };

  _getColor = ({ x }) => {
    const { startIndex, endIndex } = this.state;

    if (startIndex <= x && x < endIndex) {
      const n = endIndex - startIndex;

      if (n === 1) {
        return colorRamp(1);
      }

      const i = x - startIndex;

      return colorRamp(i / (n - 1));
    }

    return "#ddd";
  };

  render() {
    const {
      dates,
      facets,
      features,
      histogram,
      marginTop,
      selectedFacet,
      totalEdits
    } = this.props;
    const {
      highlightedValue,
      highlightOpacity,
      startIndex,
      endIndex,
      log10
    } = this.state;

    const startDate = dates[startIndex].label;
    const endDate = dates[endIndex - 1].label;

    const data = dates.map(({ label, value }, x) => ({
      x,
      y: log10 ? Math.log10(histogram[value]) || 0 : histogram[value] || 0,
      label
    }));

    const description =
      facets[selectedFacet] != null
        ? facets[selectedFacet].description
        : "edits were made";

    return (
      <AutoSizer
        disableHeight
        className="control-panel"
        style={{ marginTop, width: "initial" }}
      >
        {({ width }) => (
          <>
            <h3>OSM Edit Recency</h3>
            <p>Map shows the most recent day in which {description}.</p>
            <p>
              Currently displaying {features.length.toLocaleString()} cell(s)
              representing {totalEdits.toLocaleString()} edit(s) between{" "}
              {startDate} and {endDate}.
            </p>

            <XYPlot
              height={100}
              width={width - 34 * 2}
              margin={{ left: 0, right: 0, top: 0, bottom: 5 }}
              colorType="literal"
            >
              <VerticalBarSeries
                data={data}
                getColor={this._getColor}
                onValueMouseOver={datapoint =>
                  this.setState({
                    highlightedValue: datapoint
                  })
                }
                onValueMouseOut={() =>
                  this.setState({
                    highlightedValue: null
                  })
                }
              />
              {highlightedValue ? (
                <Hint
                  align={{
                    horizontal: "left",
                    vertical: "top"
                  }}
                  value={highlightedValue}
                  format={p => [
                    { title: p.label, value: `${p.y.toLocaleString()} edits` }
                  ]}
                  style={{
                    backgroundColor: "#666",
                    borderRadius: 5,
                    color: "white",
                    padding: "5px 7px",
                    title: {
                      fontWeight: "bold"
                    }
                  }}
                />
              ) : null}
              <Highlight
                drag
                enableY={false}
                onBrushEnd={this._onBrushEnd}
                onDragEnd={this._onBrushEnd}
                opacity={highlightOpacity}
              />
            </XYPlot>
            <Range
              style={{ width: width - 34 * 2 }}
              min={0}
              max={dates.length}
              value={[startIndex, endIndex]}
              pushable={1}
              onChange={this._onRangeChange}
              marks={this.marks}
            />

            <ScaleRamp
              width={width - 34 * 2} // account for padding + margin
              begin={startDate}
              end={endDate}
              n={endIndex - startIndex}
            />

            <p align="right" className="log10">
              <small>
                <label>
                  <input
                    type="checkbox"
                    checked={log10}
                    onChange={this._onScaleChange}
                  />
                  Use a{" "}
                  <code>
                    log<sub>10</sub>
                  </code>{" "}
                  scale for edit counts.
                </label>
              </small>
            </p>

            <p align="left">
              <small>
                Larger cells indicate a high volume of edits relative to other
                visible cells. Smaller cells indicate lower volume.
              </small>
            </p>
          </>
        )}
      </AutoSizer>
    );
  }
}
