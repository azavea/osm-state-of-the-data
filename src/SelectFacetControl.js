import { Control } from "ol/control";

export default class SelectFacetControl extends Control {
  constructor(options = {}) {
    const { facets } = options;

    const select = document.createElement("select");
    select.innerHTML = `
    <option value="">all edits</option>
    ${Object.entries(facets).map(
      ([k, { label }]) => `<option value="${k}">${label}</option>`
    )}`;

    const element = document.createElement("div");
    element.className = "select-facet ol-unselectable ol-control";
    element.appendChild(select);

    super({ element, target: options.target });

    select.addEventListener(
      "change",
      ({ target: { value } }) => options.onChange(value || null),
      false
    );
  }
}
