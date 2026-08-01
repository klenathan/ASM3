import { describe, expect, it } from "vitest";

import { deriveUsername, isValidRmitEmail } from "./registration";

describe("deriveUsername", () => {
  it.each([
    ["s1234567@student.rmit.edu.au", "s1234567"],
    ["S1234567@STUDENT.RMIT.EDU.AU", "s1234567"],
    ["s1234567@rmit.edu.au", "s1234567"],
    ["s1234567@student.rmit.edu.vn", "s1234567"],
    ["s12345@my.rmit.edu.vn", "s12345"],
    ["s123456789012@student.rmit.eu", "s123456789012"],
  ])("derives %s -> %s", (email, expected) => {
    expect(deriveUsername(email)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "alex@student.rmit.edu.au",
    "alex+tag@student.rmit.edu.au",
    "s1234567",
    "s1234567@example.com",
    "s1234567@rmit.example",
    "s1234567@rmit.edu.au.example.com",
    "s1234567@notrmit.edu.au",
    "s1234567@rmit.evil.edu.au",
    "s123@rmit.edu.au",
  ])("rejects %s", (email) => {
    expect(deriveUsername(email)).toBeNull();
    expect(isValidRmitEmail(email)).toBe(false);
  });

  it("accepts valid email via isValidRmitEmail", () => {
    expect(isValidRmitEmail("s1234567@student.rmit.edu.au")).toBe(true);
  });
});
