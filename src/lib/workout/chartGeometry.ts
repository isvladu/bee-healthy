/**
 * Geometry for the hand-rolled Insights charts. The prototype draws straight
 * SVG rather than pulling in a chart library, and at four data points that is
 * both smaller and sharper than recharts — so this keeps recharts out of the
 * desktop bundle. Kept pure and separate from the components so the scaling
 * (the part that is easy to get subtly wrong) is testable.
 *
 * All coordinates are in the charts' shared 520×200 viewBox.
 */

export const CHART = {
  width: 520,
  height: 200,
  left: 44,
  right: 508,
  top: 20,
  bottom: 168,
} as const;

export interface PlotPoint {
  x: number;
  y: number;
  value: number;
}

export interface Scale {
  min: number;
  max: number;
  points: PlotPoint[];
  /** `polyline`-ready "x,y x,y …". */
  polyline: string;
}

/** Evenly spaced slot centres, one per data point. */
export function slotCentres(count: number): number[] {
  if (count <= 0) return [];
  const span = (CHART.right - CHART.left) / count;
  return Array.from(
    { length: count },
    (_, i) => Math.round((CHART.left + (i + 0.5) * span) * 10) / 10,
  );
}

/**
 * Scale a series into the plot box. `pad` widens the value range beyond the
 * data so a near-flat line doesn't render as a full-height zigzag — the 1RM
 * chart uses min−6/max+6 per the handoff. A series with no spread is centred.
 */
export function scaleSeries(values: number[], pad = 0): Scale {
  const xs = slotCentres(values.length);
  if (values.length === 0) return { min: 0, max: 0, points: [], polyline: '' };

  let min = Math.min(...values) - pad;
  let max = Math.max(...values) + pad;
  if (max - min <= 0) {
    // Flat (or single-point) series: give it an arbitrary band so the division
    // below is safe and the line lands mid-chart.
    min -= 1;
    max += 1;
  }

  const height = CHART.bottom - CHART.top;
  const points = values.map((value, i) => ({
    x: xs[i],
    y: Math.round(CHART.bottom - ((value - min) / (max - min)) * height),
    value,
  }));

  return {
    min,
    max,
    points,
    polyline: points.map((p) => `${p.x},${p.y}`).join(' '),
  };
}

export interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

/**
 * Bars sized against the series' own maximum and baselined at the axis, so the
 * tallest bar always fills the plot regardless of the units involved.
 */
export function scaleBars(values: number[]): Bar[] {
  const xs = slotCentres(values.length);
  if (values.length === 0) return [];
  const max = Math.max(...values, 0);
  const slot = (CHART.right - CHART.left) / values.length;
  const width = Math.min(46, slot * 0.4);
  const plotHeight = CHART.bottom - CHART.top;

  return values.map((value, i) => {
    const height = max > 0 ? Math.round((value / max) * plotHeight) : 0;
    return {
      x: Math.round(xs[i] - width / 2),
      y: CHART.bottom - height,
      width: Math.round(width),
      height,
      value,
    };
  });
}
