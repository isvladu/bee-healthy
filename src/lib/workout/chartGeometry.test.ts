import { describe, expect, it } from 'vitest';
import { CHART, scaleBars, scaleSeries, slotCentres } from './chartGeometry';

describe('slotCentres', () => {
  it('spreads points evenly across the plot area', () => {
    const xs = slotCentres(4);
    expect(xs).toHaveLength(4);
    expect(xs[0]).toBeGreaterThan(CHART.left);
    expect(xs[3]).toBeLessThan(CHART.right);
    // Even spacing.
    expect(xs[1] - xs[0]).toBeCloseTo(xs[3] - xs[2], 5);
  });

  it('handles an empty series', () => {
    expect(slotCentres(0)).toEqual([]);
  });
});

describe('scaleSeries', () => {
  it('puts the smallest value on the baseline and the largest at the top', () => {
    const { points } = scaleSeries([10, 20, 30]);
    expect(points[0].y).toBe(CHART.bottom);
    expect(points[2].y).toBe(CHART.top);
  });

  it('pads the range so a near-flat series is not drawn as a cliff', () => {
    const padded = scaleSeries([128, 132, 138, 142], 6);
    expect(padded.min).toBe(122);
    expect(padded.max).toBe(148);
    // Nothing touches the frame once padded.
    for (const point of padded.points) {
      expect(point.y).toBeGreaterThan(CHART.top);
      expect(point.y).toBeLessThan(CHART.bottom);
    }
  });

  it('centres a flat series instead of dividing by zero', () => {
    const { points } = scaleSeries([100, 100, 100]);
    const mid = (CHART.top + CHART.bottom) / 2;
    for (const point of points) {
      expect(point.y).toBe(mid);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it('handles a single point', () => {
    const { points } = scaleSeries([42], 6);
    expect(points).toHaveLength(1);
    expect(Number.isFinite(points[0].y)).toBe(true);
  });

  it('emits a polyline string matching its points', () => {
    const { points, polyline } = scaleSeries([1, 2]);
    expect(polyline).toBe(
      `${points[0].x},${points[0].y} ${points[1].x},${points[1].y}`,
    );
  });

  it('is empty for an empty series', () => {
    expect(scaleSeries([])).toEqual({ min: 0, max: 0, points: [], polyline: '' });
  });
});

describe('scaleBars', () => {
  it('baselines every bar on the axis and fills the plot with the tallest', () => {
    const bars = scaleBars([16200, 19200, 17800, 21400]);
    for (const bar of bars) {
      expect(bar.y + bar.height).toBe(CHART.bottom);
    }
    expect(bars[3].height).toBe(CHART.bottom - CHART.top);
    expect(bars[0].height).toBeLessThan(bars[3].height);
  });

  it('draws nothing when every value is zero rather than dividing by zero', () => {
    const bars = scaleBars([0, 0]);
    expect(bars.map((bar) => bar.height)).toEqual([0, 0]);
  });

  it('shares its slot centres with the line chart, so dots sit over bars', () => {
    const bars = scaleBars([1, 2, 3, 4]);
    const line = scaleSeries([4, 3, 2, 1]);
    bars.forEach((bar, index) => {
      expect(bar.x + bar.width / 2).toBeCloseTo(line.points[index].x, 0);
    });
  });
});
