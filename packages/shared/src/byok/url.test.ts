import { afterEach, describe, expect, it, vi } from "vitest";
import dns from "node:dns/promises";
import {
  assertPublicHost,
  assertPublicHttpsUrl,
  createSafeFetch,
  isPublicAddress,
} from "./url.js";

describe("assertPublicHttpsUrl", () => {
  it("accepts https URLs", () => {
    expect(assertPublicHttpsUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1"
    );
    expect(assertPublicHttpsUrl("  https://openrouter.ai/api/v1  ")).toBe(
      "https://openrouter.ai/api/v1"
    );
    expect(assertPublicHttpsUrl("https://openrouter.ai./api/v1")).toBe(
      "https://openrouter.ai./api/v1"
    );
  });

  it("rejects http", () => {
    expect(() => assertPublicHttpsUrl("http://api.example.com")).toThrow(
      /HTTPS/
    );
  });

  it("rejects localhost and special-use hostnames", () => {
    expect(() => assertPublicHttpsUrl("https://localhost/v1")).toThrow(
      /local or internal/
    );
    expect(() => assertPublicHttpsUrl("https://localhost./v1")).toThrow(
      /local or internal/
    );
    expect(() => assertPublicHttpsUrl("https://foo.localhost/v1")).toThrow(
      /local or internal/
    );
    expect(() => assertPublicHttpsUrl("https://svc.local/v1")).toThrow(
      /local or internal/
    );
    expect(() => assertPublicHttpsUrl("https://svc.internal/v1")).toThrow(
      /local or internal/
    );
    expect(() => assertPublicHttpsUrl("https://svc.internal./v1")).toThrow(
      /local or internal/
    );
    expect(() => assertPublicHttpsUrl("https://gw.lan/v1")).toThrow(
      /local or internal/
    );
  });

  it("rejects private / loopback / link-local / CGNAT / unspecified IP literals", () => {
    for (const host of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      expect(() => assertPublicHttpsUrl(`https://${host}/v1`)).toThrow(
        /private|loopback|reserved/
      );
    }
  });

  it("accepts a public IPv4 literal", () => {
    expect(assertPublicHttpsUrl("https://8.8.8.8/v1")).toBe(
      "https://8.8.8.8/v1"
    );
  });
});

describe("isPublicAddress", () => {
  it("rejects IPv6 loopback and documentation ranges", () => {
    expect(isPublicAddress("::1")).toBe(false);
    expect(isPublicAddress("2001:db8::1")).toBe(false);
  });

  it("accepts a public IPv6 address", () => {
    expect(isPublicAddress("2001:4860:4860::8888")).toBe(true);
  });

  it("rejects IPv4-mapped private addresses", () => {
    expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicAddress("::ffff:10.0.0.1")).toBe(false);
  });
});

describe("assertPublicHost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when DNS returns a private A record", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "10.0.0.1", family: 4 },
    ] as any);

    await expect(assertPublicHost("evil.example.com")).rejects.toThrow(
      /private|loopback|reserved/
    );
  });

  it("resolves when DNS returns a public A record", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
    ] as any);

    await expect(assertPublicHost("dns.google")).resolves.toBeUndefined();
  });

  it("rejects NXDOMAIN / ENOTFOUND", async () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND"), {
      code: "ENOTFOUND",
    });
    vi.spyOn(dns, "lookup").mockRejectedValue(err);

    await expect(assertPublicHost("missing.example")).rejects.toThrow(
      /could not be resolved/
    );
  });
});

describe("createSafeFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects 3xx redirects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 302,
        headers: new Headers({ Location: "https://evil.example/" }),
      }))
    );

    const safeFetch = createSafeFetch();
    await expect(safeFetch("https://api.example.com/v1")).rejects.toThrow(
      "Provider redirects are not allowed"
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/v1",
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("returns non-redirect responses", async () => {
    const ok = { status: 200, ok: true };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ok)
    );

    const safeFetch = createSafeFetch();
    await expect(safeFetch("https://api.example.com/v1")).resolves.toBe(ok);
  });
});
