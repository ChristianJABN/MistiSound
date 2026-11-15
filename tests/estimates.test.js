import { describe, it, expect } from 'vitest';
import { ozoneDeficit, depletionShape, estimateOzone, cellOrNeighbors, projectTemperature, projectCo2 } from '../src/data/estimates.js';

describe('ozone estimate', () => {
  it('deficit by latitude (WMO 2022)', () => {
    expect(ozoneDeficit(0, 8)).toBe(0.01);
    expect(ozoneDeficit(45, 8)).toBe(0.04);
    expect(ozoneDeficit(-45, 8)).toBe(0.05);
    expect(ozoneDeficit(-27.5, 8)).toBeCloseTo(0.03, 5);
    expect(ozoneDeficit(-75, 10)).toBeNull(); // agujero de ozono
    expect(ozoneDeficit(-75, 2)).toBe(0.06);
  });

  it('depletion shape ramps 1979 -> 1995', () => {
    expect(depletionShape(1950)).toBe(0);
    expect(depletionShape(1979)).toBe(0);
    expect(depletionShape(1987)).toBe(0.5);
    expect(depletionShape(2003)).toBe(1);
  });

  it('1950 is higher than OMI base; 2000 equals it', () => {
    expect(estimateOzone(260, { lat: -16.4, month: 8, year: 1950 })).toBe(Math.round(260 / (1 - ozoneDeficit(-16.4, 8))));
    expect(estimateOzone(260, { lat: -16.4, month: 8, year: 2000 })).toBe(260);
    expect(estimateOzone(null, { lat: 0, month: 1, year: 1950 })).toBeNull();
    expect(estimateOzone(200, { lat: -80, month: 10, year: 1950 })).toBeNull();
  });
});

describe('temperature fill and projection', () => {
  const ds = (values) => ({ axes: { lat_centers: [-2, 0, 2], lon_centers: [-2, 0, 2] }, values });

  it('uses own value when present', () => {
    expect(cellOrNeighbors(ds([0, 0, 0, 0, 1.5, 0, 0, 0, 0]), 1, 1)).toEqual({ value: 1.5, estimated: false });
  });

  it('averages neighbors when the cell is empty', () => {
    const r = cellOrNeighbors(ds([null, 1, null, null, null, 3, null, null, null]), 1, 1);
    expect(r).toMatchObject({ value: 2, estimated: true, ring: 1 });
  });

  it('returns null when nothing is near', () => {
    expect(cellOrNeighbors(ds(Array(9).fill(null)), 1, 1).value).toBeNull();
  });

  it('projects along the 1950s -> recent line', () => {
    const v = projectTemperature({ pastMean: 0, pastCenter: 1954.5, recentMean: 1.4, recentCenter: 2024 }, 2026);
    expect(v).toBeCloseTo(1.4 + (1.4 / 69.5) * 2, 6);
    expect(projectTemperature({ pastMean: null, pastCenter: 1954.5, recentMean: 1, recentCenter: 2024 }, 2026)).toBeNull();
  });
});

describe('co2 projection', () => {
  it('adds mean growth to last year same month', () => {
    const monthly = { '2022-10': 415.0, '2023-10': 418.0, '2024-10': 421.0, '2025-10': 424.0 };
    expect(projectCo2(monthly, 2026, 10)).toBe(427);
  });
  it('null without base', () => {
    expect(projectCo2({}, 2026, 10)).toBeNull();
  });
});
