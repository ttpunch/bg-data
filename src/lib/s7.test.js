import { describe, it, expect } from "vitest";
import { isErr, parseNumber, toSigned, toUnsigned, formatHex } from "./s7";

describe("isErr", () => {
  it("recognises an error object", () => {
    expect(isErr({ error: "nope" })).toBe(true);
  });
  it("does not treat plain values as errors", () => {
    expect(isErr(0)).toBe(false);
    expect(isErr(null)).toBe(false);
    expect(isErr({ value: 1 })).toBe(false);
  });
});

describe("parseNumber", () => {
  it("parses Siemens hex", () => {
    expect(parseNumber("16#FF")).toEqual({ value: 255, radix: 16 });
  });
  it("parses Siemens typed hex constants", () => {
    expect(parseNumber("W#16#FF")).toEqual({ value: 255, radix: 16 });
    expect(parseNumber("DW#16#FFFF")).toEqual({ value: 65535, radix: 16 });
  });
  it("parses C-style and suffix hex", () => {
    expect(parseNumber("0xFF")).toEqual({ value: 255, radix: 16 });
    expect(parseNumber("FFh")).toEqual({ value: 255, radix: 16 });
  });
  it("parses Siemens binary", () => {
    expect(parseNumber("2#1010")).toEqual({ value: 10, radix: 2 });
  });
  it("parses decimal", () => {
    expect(parseNumber("255")).toEqual({ value: 255, radix: 10 });
  });
  it("is case and whitespace insensitive", () => {
    expect(parseNumber("  16#ff  ")).toEqual({ value: 255, radix: 16 });
  });
  it("rejects a bare hex string with no radix marker", () => {
    expect(isErr(parseNumber("FF"))).toBe(true);
  });
  it("rejects empty input", () => {
    expect(isErr(parseNumber(""))).toBe(true);
  });
  it("rejects an invalid binary digit", () => {
    expect(isErr(parseNumber("2#1012"))).toBe(true);
  });
});

describe("toSigned", () => {
  it("reads 16#FFFF as -1 (the INT vs WORD trap)", () => {
    expect(toSigned(0xffff, 16)).toBe(-1);
  });
  it("reads the most negative INT", () => {
    expect(toSigned(0x8000, 16)).toBe(-32768);
  });
  it("reads the most positive INT", () => {
    expect(toSigned(0x7fff, 16)).toBe(32767);
  });
  it("handles BYTE width", () => {
    expect(toSigned(0xff, 8)).toBe(-1);
    expect(toSigned(0x7f, 8)).toBe(127);
  });
  it("handles DWORD width without 32-bit overflow", () => {
    expect(toSigned(0xffffffff, 32)).toBe(-1);
    expect(toSigned(0x80000000, 32)).toBe(-2147483648);
  });
});

describe("toUnsigned", () => {
  it("keeps DWORD values positive", () => {
    expect(toUnsigned(0xffffffff, 32)).toBe(4294967295);
  });
  it("wraps a negative value into range", () => {
    expect(toUnsigned(-1, 16)).toBe(65535);
  });
});

describe("formatHex", () => {
  it("zero-pads to the byte width", () => {
    expect(formatHex(255, 2)).toBe("16#00FF");
    expect(formatHex(255, 1)).toBe("16#FF");
    expect(formatHex(255, 4)).toBe("16#000000FF");
  });
  it("formats a full DWORD", () => {
    expect(formatHex(0xffffffff, 4)).toBe("16#FFFFFFFF");
  });
});
