import { point } from "@m/std";
import { describe, expect, it } from "vitest";
import { boxCenter, routeWaypoints } from "../../src/core/route.js";

describe("routeWaypoints", () => {
  it("passes a full route through unchanged (≥2 points)", () => {
    const route = routeWaypoints(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      point(99, 99),
      point(88, 88),
    );
    expect(route).toEqual([point(0, 0), point(10, 0), point(10, 10)]);
  });

  it("falls back to a straight line between the endpoint centres for a degenerate (<2) route", () => {
    const fromC = point(5, 5);
    const toC = point(50, 5);
    expect(routeWaypoints([], fromC, toC)).toEqual([fromC, toC]);
    expect(routeWaypoints([{ x: 1, y: 1 }], fromC, toC)).toEqual([fromC, toC]);
  });
});

describe("boxCenter", () => {
  it("is the origin plus half the extent", () => {
    expect(boxCenter(10, 20, 40, 60)).toEqual(point(30, 50));
  });
});
