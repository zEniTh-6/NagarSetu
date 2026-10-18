import { describe, it, expect } from "vitest";
import { categoryRules, getCategoryRules } from "../src/rules/categories.js";
import { DEPARTMENTS } from "../src/seed/seed.js";

describe("categories.json", () => {
  it("has the three prototype categories with the brief's duplicate radii", () => {
    expect(Object.keys(categoryRules).sort()).toEqual(["GARBAGE", "ROADS", "STREETLIGHT"]);
    expect(getCategoryRules("ROADS").duplicateRadiusM).toBe(15);
    expect(getCategoryRules("GARBAGE").duplicateRadiusM).toBe(30);
    expect(getCategoryRules("STREETLIGHT").duplicateRadiusM).toBe(10);
  });

  it("points every category to a seeded department", () => {
    const codes = DEPARTMENTS.map((d) => d.code);
    for (const rules of Object.values(categoryRules)) expect(codes).toContain(rules.department);
  });

  it("tells the AI to answer UNCERTAIN when unsure and to suggest another category", () => {
    for (const rules of Object.values(categoryRules)) {
      expect(rules.photoPrompt).toMatch(/UNCERTAIN/);
      expect(rules.photoPrompt).toMatch(/suggest that category/);
    }
  });

  it("throws for an unknown key", () => {
    expect(() => getCategoryRules("POTHOLES")).toThrow(/Unknown category/);
  });
});
