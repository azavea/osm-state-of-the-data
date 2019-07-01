import { interpolateViridis as colorRamp } from "d3-scale-chromatic";
import { color, cubehelix } from "d3-color";
import React, { Component } from "react";

class ScaleRamp extends Component {
  constructor(props) {
    super(props);

    const ctx = document.createElement("canvas").getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const bsr =
      ctx.webkitBackingStorePixelRatio ||
      ctx.mozBackingStorePixelRatio ||
      ctx.msBackingStorePixelRatio ||
      ctx.oBackingStorePixelRatio ||
      ctx.backingStorePixelRatio ||
      1;

    this.pixelRatio = dpr / bsr;
  }

  componentDidMount() {
    this.updateCanvas();
  }

  componentDidUpdate() {
    this.updateCanvas();
  }

  updateCanvas() {
    const { n = 512, begin, end, width, height = 40 } = this.props;
    const context = this.refs.canvas.getContext("2d");

    for (let i = 0; i < n; ++i) {
      for (let y = 0; y < this.pixelRatio * height; y++) {
        const c = colorRamp(n - 1 === 0 ? 1 : i / (n - 1));
        const ch = cubehelix(color(c));
        ch.s = 1 - (y / (this.pixelRatio * height));

        context.fillStyle = ch.rgb();
        context.fillRect(
          Math.floor(this.pixelRatio * i * (width / n)),
          y,
          Math.ceil(this.pixelRatio * (i + 1) * (width / n)),
          y + 1
        );
      }
    }

    context.font = `${14 * this.pixelRatio}px Menlo, Consolas, monospace`;
    context.textBaseline = "middle";

    if (begin != null) {
      if (n === 1) {
        context.fillStyle = "#333";
      } else {
        context.fillStyle = "#eee";
      }
      context.textAlign = "left";
      context.fillText(begin, this.pixelRatio * 20, this.pixelRatio * 20);
    }

    if (end != null) {
      context.fillStyle = "#333";
      context.textAlign = "right";
      context.fillText(
        end,
        this.pixelRatio * (width - 20),
        this.pixelRatio * 20
      );
    }
  }

  render() {
    const { width, height = 40 } = this.props;

    return (
      <canvas
        ref="canvas"
        width={width * this.pixelRatio}
        height={height * this.pixelRatio}
        style={{ height: "40px" }}
      />
    );
  }
}

export default ScaleRamp;
