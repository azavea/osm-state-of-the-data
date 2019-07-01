import { Control } from "ol/control";
import { platformModifierKeyOnly } from "ol/events/condition";
import ExtentInteraction from "ol/interaction/Extent";

export default class SelectExtentControl extends Control {
  constructor(options = {}) {
    const button = document.createElement("button");

    const element = document.createElement("div");
    element.className = "select-extent ol-unselectable ol-control";
    element.appendChild(button);

    super({ element, target: options.target });

    this.active = false;
    this.button = button;
    this.onExtentSelected = options.onExtentSelected;
    this.updateButton(this.active);

    button.addEventListener("click", this.toggle, false);
  }

  getExtentInteraction() {
    if (this.extentInteraction == null) {
      this.extentInteraction = new ExtentInteraction({
        condition: platformModifierKeyOnly,
        pointerStyle: []
      });

      this.extentInteraction.setActive(this.active);

      this.getMap().addInteraction(this.extentInteraction);

      this.extentInteraction.on("extentchanged", ({ extent }) =>
        this.onExtentSelected(extent)
      );
    }

    return this.extentInteraction;
  }

  toggle = () => {
    this.active = !this.active;
    this.getExtentInteraction().setActive(this.active);

    if (!this.active) {
      this.getExtentInteraction().setExtent(null);
    }

    this.updateButton(this.active);
  };

  updateButton(active) {
    if (active) {
      this.button.innerHTML = "■";
    } else {
      this.button.innerHTML = "□";
    }
  }
}
