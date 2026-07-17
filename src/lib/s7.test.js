import { describe, it, expect } from "vitest";
import { isErr, parseNumber, toSigned, toUnsigned, formatHex, assembleBE, splitBE, parseAddress, formatAddress, bytesForAddress, overlaps, bcdToDec, decToBcd, bitsToReal, realToBits, explainReal, interpret } from "./s7";

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

describe("assembleBE", () => {
  it("assembles MSB first, not LSB first", () => {
    expect(assembleBE([0x12, 0x34])).toBe(0x1234);
  });
  it("assembles a DWORD without going negative", () => {
    expect(assembleBE([0xff, 0xff, 0xff, 0xff])).toBe(4294967295);
  });
  it("assembles a single byte", () => {
    expect(assembleBE([0xab])).toBe(0xab);
  });
});

describe("splitBE", () => {
  it("splits MSB first", () => {
    expect(splitBE(0x1234, 2)).toEqual([0x12, 0x34]);
  });
  it("splits a DWORD", () => {
    expect(splitBE(0x12345678, 4)).toEqual([0x12, 0x34, 0x56, 0x78]);
  });
  it("round-trips with assembleBE", () => {
    expect(assembleBE(splitBE(0xdeadbeef, 4))).toBe(0xdeadbeef);
  });
});

describe("parseAddress", () => {
  it("parses a word address", () => {
    expect(parseAddress("DB10.DBW20")).toEqual({
      db: 10, type: "WORD", byte: 20, bit: null, widthBytes: 2,
    });
  });
  it("parses a byte address", () => {
    expect(parseAddress("DB10.DBB20")).toEqual({
      db: 10, type: "BYTE", byte: 20, bit: null, widthBytes: 1,
    });
  });
  it("parses a dword address", () => {
    expect(parseAddress("DB10.DBD20")).toEqual({
      db: 10, type: "DWORD", byte: 20, bit: null, widthBytes: 4,
    });
  });
  it("parses a bit address", () => {
    expect(parseAddress("DB31.DBX60.4")).toEqual({
      db: 31, type: "BOOL", byte: 60, bit: 4, widthBytes: 1,
    });
  });
  it("is case and whitespace insensitive", () => {
    expect(parseAddress(" db10.dbw20 ").type).toBe("WORD");
  });
  it("rejects a bit number above 7", () => {
    expect(isErr(parseAddress("DB10.DBX20.8"))).toBe(true);
  });
  it("rejects DBX without a bit number", () => {
    expect(isErr(parseAddress("DB10.DBX20"))).toBe(true);
  });
  it("rejects a bit number on a word address", () => {
    expect(isErr(parseAddress("DB10.DBW20.1"))).toBe(true);
  });
  it("rejects DB0", () => {
    expect(isErr(parseAddress("DB0.DBW20"))).toBe(true);
  });
  it("rejects gibberish", () => {
    expect(isErr(parseAddress("hello"))).toBe(true);
  });
});

describe("formatAddress", () => {
  it("round-trips a word address", () => {
    expect(formatAddress(parseAddress("DB10.DBW20"))).toBe("DB10.DBW20");
  });
  it("round-trips a bit address", () => {
    expect(formatAddress(parseAddress("DB31.DBX60.4"))).toBe("DB31.DBX60.4");
  });
});

describe("bytesForAddress", () => {
  it("reports the two bytes a word occupies", () => {
    expect(bytesForAddress(parseAddress("DB10.DBW20"))).toEqual([20, 21]);
  });
  it("reports the four bytes a dword occupies", () => {
    expect(bytesForAddress(parseAddress("DB10.DBD20"))).toEqual([20, 21, 22, 23]);
  });
  it("reports the single byte a bit lives in", () => {
    expect(bytesForAddress(parseAddress("DB31.DBX60.4"))).toEqual([60]);
  });
  it("returns an error instead of [] when given an errored address", () => {
    expect(isErr(bytesForAddress(parseAddress("hello")))).toBe(true);
  });
  it("returns an error when given an object with no numeric widthBytes", () => {
    expect(isErr(bytesForAddress({ db: 10, type: "WORD", byte: 20, bit: null }))).toBe(true);
  });
});

describe("overlaps", () => {
  it("detects the classic DBW20 / DBW21 overlap", () => {
    expect(overlaps(parseAddress("DB10.DBW20"), parseAddress("DB10.DBW21"))).toBe(true);
  });
  it("detects the DBW19 / DBW20 overlap", () => {
    expect(overlaps(parseAddress("DB10.DBW19"), parseAddress("DB10.DBW20"))).toBe(true);
  });
  it("reports no overlap for adjacent non-overlapping words", () => {
    expect(overlaps(parseAddress("DB10.DBW20"), parseAddress("DB10.DBW22"))).toBe(false);
  });
  it("reports no overlap across different DBs", () => {
    expect(overlaps(parseAddress("DB10.DBW20"), parseAddress("DB11.DBW20"))).toBe(false);
  });
  it("detects a dword swallowing a word", () => {
    expect(overlaps(parseAddress("DB10.DBD20"), parseAddress("DB10.DBW22"))).toBe(true);
  });
  it("returns an error instead of false when the first address is errored", () => {
    expect(isErr(overlaps(parseAddress("hello"), parseAddress("DB10.DBW20")))).toBe(true);
  });
  it("returns an error instead of false when the second address is errored", () => {
    expect(isErr(overlaps(parseAddress("DB10.DBW20"), parseAddress("hello")))).toBe(true);
  });
});

describe("bcdToDec", () => {
  it("decodes packed BCD", () => {
    expect(bcdToDec(0x99)).toBe(99);
    expect(bcdToDec(0x1234)).toBe(1234);
  });
  it("decodes zero", () => {
    expect(bcdToDec(0)).toBe(0);
  });
  it("rejects a nibble above 9", () => {
    expect(isErr(bcdToDec(0x9a))).toBe(true);
  });
  it("rejects a negative value", () => {
    expect(isErr(bcdToDec(-1))).toBe(true);
  });
});

describe("decToBcd", () => {
  it("encodes packed BCD", () => {
    expect(decToBcd(99)).toBe(0x99);
    expect(decToBcd(1234)).toBe(0x1234);
  });
  it("encodes zero", () => {
    expect(decToBcd(0)).toBe(0);
  });
  it("round-trips with bcdToDec", () => {
    expect(bcdToDec(decToBcd(4095))).toBe(4095);
  });
  it("rejects a negative number", () => {
    expect(isErr(decToBcd(-1))).toBe(true);
  });
});

describe("bitsToReal / realToBits", () => {
  it("decodes 1.0", () => {
    expect(bitsToReal(0x3f800000)).toBe(1.0);
  });
  it("decodes -2.0", () => {
    expect(bitsToReal(0xc0000000)).toBe(-2.0);
  });
  it("encodes 1.0", () => {
    expect(realToBits(1.0)).toBe(0x3f800000);
  });
  it("round-trips a representable value", () => {
    expect(bitsToReal(realToBits(0.5))).toBe(0.5);
  });
});

describe("explainReal", () => {
  it("breaks down 1.0", () => {
    const r = explainReal(0x3f800000);
    expect(r.sign).toBe(0);
    expect(r.exponent).toBe(127);
    expect(r.mantissa).toBe(0);
    expect(r.value).toBe(1.0);
    expect(r.special).toBe(null);
  });
  it("identifies positive zero", () => {
    expect(explainReal(0x00000000).special).toBe("+0");
  });
  it("identifies negative zero", () => {
    expect(explainReal(0x80000000).special).toBe("-0");
  });
  it("identifies positive infinity", () => {
    expect(explainReal(0x7f800000).special).toBe("+Infinity");
  });
  it("identifies negative infinity", () => {
    expect(explainReal(0xff800000).special).toBe("-Infinity");
  });
  it("identifies NaN", () => {
    expect(explainReal(0xffc00000).special).toBe("NaN");
  });
  it("identifies a denormal", () => {
    expect(explainReal(0x00000001).special).toBe("denormal");
  });
  it("reports the sign bit of a negative number", () => {
    expect(explainReal(0xc0000000).sign).toBe(1);
  });
});

describe("interpret", () => {
  it("reads a WORD both ways", () => {
    const r = interpret(0xffff, 2);
    expect(r.hex).toBe("16#FFFF");
    expect(r.unsigned).toBe(65535);
    expect(r.signed).toBe(-1);
    expect(r.binary).toBe("1111111111111111");
    expect(r.bytes).toEqual([0xff, 0xff]);
  });
  it("labels the WORD types", () => {
    expect(interpret(0, 2).type).toBe("WORD / INT");
  });
  it("adds REAL for a DWORD", () => {
    const r = interpret(0x3f800000, 4);
    expect(r.real).toBe(1.0);
    expect(r.realExplain.exponent).toBe(127);
    expect(r.type).toBe("DWORD / DINT / REAL");
  });
  it("omits REAL for a WORD", () => {
    expect(interpret(0, 2).real).toBeUndefined();
  });
  it("surfaces a BCD error rather than a wrong number", () => {
    expect(isErr(interpret(0x9a, 1).bcd)).toBe(true);
  });
  it("reports valid BCD", () => {
    expect(interpret(0x99, 1).bcd).toBe(99);
  });
});
