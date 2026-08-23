import { isIP } from "node:net";
import dns from "node:dns/promises";

function normalizeHostname(hostname: string): string {
  let trimmed = hostname.trim().toLowerCase();
  if (trimmed.endsWith(".")) {
    trimmed = trimmed.replace(/\.+$/, "");
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function ipv4ToInt(octets: number[]): number {
  return (
    ((octets[0]! << 24) >>> 0) +
    ((octets[1]! << 16) >>> 0) +
    ((octets[2]! << 8) >>> 0) +
    (octets[3]! >>> 0)
  );
}

function inCidr(ip: number, prefix: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) === (prefix & mask);
}

function isPublicIpv4(address: string): boolean {
  const octets = parseIpv4(address);
  if (!octets) return false;
  const ip = ipv4ToInt(octets);

  // 0.0.0.0/8 unspecified (includes 0.0.0.0)
  if (inCidr(ip, ipv4ToInt([0, 0, 0, 0]), 8)) return false;
  // 10.0.0.0/8 private
  if (inCidr(ip, ipv4ToInt([10, 0, 0, 0]), 8)) return false;
  // 100.64.0.0/10 CGNAT
  if (inCidr(ip, ipv4ToInt([100, 64, 0, 0]), 10)) return false;
  // 127.0.0.0/8 loopback
  if (inCidr(ip, ipv4ToInt([127, 0, 0, 0]), 8)) return false;
  // 169.254.0.0/16 link-local
  if (inCidr(ip, ipv4ToInt([169, 254, 0, 0]), 16)) return false;
  // 172.16.0.0/12 private
  if (inCidr(ip, ipv4ToInt([172, 16, 0, 0]), 12)) return false;
  // 192.168.0.0/16 private
  if (inCidr(ip, ipv4ToInt([192, 168, 0, 0]), 16)) return false;
  // 224.0.0.0/4 multicast
  if (inCidr(ip, ipv4ToInt([224, 0, 0, 0]), 4)) return false;
  // 240.0.0.0/4 reserved
  if (inCidr(ip, ipv4ToInt([240, 0, 0, 0]), 4)) return false;

  return true;
}

function parseIpv6Hextets(address: string): number[] | null {
  const addr = address.toLowerCase();
  if (addr.startsWith("::ffff:")) {
    const mapped = addr.slice("::ffff:".length);
    if (mapped.includes(".")) {
      const octets = parseIpv4(mapped);
      if (!octets) return null;
      // Represent as ::ffff:x.x.x.x hextets for range checks below
      return [
        0,
        0,
        0,
        0,
        0,
        0xffff,
        (octets[0]! << 8) | octets[1]!,
        (octets[2]! << 8) | octets[3]!,
      ];
    }
  }

  const sides = addr.split("::");
  if (sides.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const parts = side.split(":");
    const out: number[] = [];
    for (const part of parts) {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      out.push(parseInt(part, 16));
    }
    return out;
  };

  if (sides.length === 1) {
    const hextets = parseSide(sides[0]!);
    if (!hextets || hextets.length !== 8) return null;
    return hextets;
  }

  const left = parseSide(sides[0]!);
  const right = parseSide(sides[1]!);
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

function isPublicIpv6(address: string): boolean {
  const hextets = parseIpv6Hextets(address);
  if (!hextets) return false;

  // IPv4-mapped ::ffff:0:0/96 — evaluate embedded IPv4
  if (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  ) {
    const a = (hextets[6]! >> 8) & 0xff;
    const b = hextets[6]! & 0xff;
    const c = (hextets[7]! >> 8) & 0xff;
    const d = hextets[7]! & 0xff;
    return isPublicIpv4(`${a}.${b}.${c}.${d}`);
  }

  // :: unspecified
  if (hextets.every((h) => h === 0)) return false;
  // ::1 loopback
  if (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0 &&
    hextets[6] === 0 &&
    hextets[7] === 1
  ) {
    return false;
  }
  // fe80::/10 link-local
  if ((hextets[0]! & 0xffc0) === 0xfe80) return false;
  // fc00::/7 unique local
  if ((hextets[0]! & 0xfe00) === 0xfc00) return false;
  // 2001:db8::/32 documentation
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return false;
  // ff00::/8 multicast
  if ((hextets[0]! & 0xff00) === 0xff00) return false;

  return true;
}

/**
 * Returns true when `address` is a public unicast IPv4/IPv6 address.
 * Rejects loopback, link-local, private, CGNAT, unspecified, multicast,
 * reserved, documentation, and IPv4-mapped forms of the same.
 */
export function isPublicAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const version = isIP(normalized);
  if (version === 4) return isPublicIpv4(normalized);
  if (version === 6) return isPublicIpv6(normalized);
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (host === "localhost") return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  if (host.endsWith(".internal")) return true;
  if (host.endsWith(".lan")) return true;
  return false;
}

/**
 * Synchronously validate that `raw` is an https URL targeting a non-blocked
 * hostname (and a public IP when the host is an IP literal).
 */
export function assertPublicHttpsUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("base_url must be a valid HTTPS URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("base_url must use the HTTPS protocol");
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new Error("base_url must include a hostname");
  }

  if (isBlockedHostname(hostname)) {
    throw new Error("base_url must not target a local or internal hostname");
  }

  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) {
      throw new Error(
        "base_url must not target a private, loopback, or reserved address"
      );
    }
  }

  return trimmed;
}

/**
 * Resolve `hostname` and reject if any A/AAAA record is non-public.
 * IP literals are checked without DNS.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = normalizeHostname(hostname);
  if (!host) {
    throw new Error("base_url must include a hostname");
  }

  if (isBlockedHostname(host)) {
    throw new Error("base_url must not target a local or internal hostname");
  }

  if (isIP(host)) {
    if (!isPublicAddress(host)) {
      throw new Error(
        "base_url must not target a private, loopback, or reserved address"
      );
    }
    return;
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("base_url hostname could not be resolved");
  }

  if (!records.length) {
    throw new Error("base_url hostname could not be resolved");
  }

  for (const record of records) {
    if (!isPublicAddress(record.address)) {
      throw new Error(
        "base_url resolves to a private, loopback, or reserved address"
      );
    }
  }
}

/**
 * fetch wrapper that refuses to follow redirects (SSRF via 3xx).
 */
export function createSafeFetch(): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, {
      ...init,
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Provider redirects are not allowed");
    }
    return response;
  };
}
