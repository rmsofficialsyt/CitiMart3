// plotly.js-dist-min ships the same runtime API as plotly.js but without
// its own type declarations; re-export the official plotly.js types for it.
declare module "plotly.js-dist-min" {
  import * as Plotly from "plotly.js";
  export = Plotly;
}
