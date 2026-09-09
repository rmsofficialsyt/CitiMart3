import Plotly from "plotly.js-dist-min";
// react-plotly.js's default export bundles the *full* plotly.js. The
// factory entrypoint lets us pair it with the lighter plotly.js-dist-min
// build instead, same trick the old frontend used vendoring plotly.min.js.
import createPlotlyComponent from "react-plotly.js/factory";

const Plot = createPlotlyComponent(Plotly);
export default Plot;
