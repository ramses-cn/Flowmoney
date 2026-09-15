/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * URL Safety Validator (F1 — SSRF Mitigation)
 *
 * Validates that a URL provided by the user is safe to fetch server-side.
 * Blocks: loopback, link-local, RFC1918 private ranges, cloud metadata IPs,
 * and any host not in the explicit allowlist.
 */

import { URL } from 'url';
import dns from 'dns';
import net from 'net';

export interface UrlSafetyResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

// Allowlist of hosts safe to fetch from for receipt scanning.
// Only Firebase Storage / Cloud Storage hosts by default.
const DEFAULT_ALLOWED_HOSTS = [
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
  'lh3.googleusercontent.com',
];

function isPrivateIp(ip: string): boolean {
  // Normalize IPv6-mapped IPv4
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  // Loopback
  if (v4 === '127.0.0.1' || v4 === '::1' || v4.startsWith('127.')) return true;
  // Link-local (169.254.x.x — incl. GCP metadata 169.254.169.254)
  if (v4.startsWith('169.254.')) return true;
  // RFC1918
  if (v4.startsWith('10.')) return true;
  if (v4.startsWith('192.168.')) return true;
  // 172.16.0.0/12
  if (v4.startsWith('172.')) {
    const parts = v4.split('.');
    const second = parseInt(parts[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // 100.64.0.0/10 (CGNAT)
  if (v4.startsWith('100.')) {
    const parts = v4.split('.');
    const second = parseInt(parts[1], 10);
    if (second >= 64 && second <= 127) return true;
  }
  // 0.0.0.0/8
  if (v4.startsWith('0.')) return true;
  // IPv6 link-local / unique-local
  if (v4.toLowerCase().startsWith('fe80:')) return true;
  if (v4.toLowerCase().startsWith('fc')) return true;
  if (v4.toLowerCase().startsWith('fd')) return true;
  return false;
}

/**
 * Validates a URL provided by the user for safe server-side fetching.
 * Returns { safe: true } only if:
 *   1. URL parses with protocol http: or https:
 *   2. Host is in the allowlist
 *   3. Resolved IPs are NOT in private/loopback/link-local ranges
 */
export async function isUrlSafeToFetch(
  rawUrl: string,
  allowedHosts: string[] = DEFAULT_ALLOWED_HOSTS
): Promise<UrlSafetyResult> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'URL vacía o inválida' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'URL malformada' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Protocolo no permitido: ${parsed.protocol}` };
  }

  const host = parsed.hostname.toLowerCase();

  // Check allowlist (host or *.suffix)
  const isAllowed = allowedHosts.some((allowed) => {
    if (allowed === host) return true;
    if (allowed.startsWith('*.')) {
      const suffix = allowed.slice(2);
      return host.endsWith(suffix);
    }
    return false;
  });

  if (!isAllowed) {
    return { safe: false, reason: `Host no permitido: ${host}` };
  }

  // If host is an IP literal, check directly
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      return { safe: false, reason: `IP interna bloqueada: ${host}` };
    }
    return { safe: true, resolvedIp: host };
  }

  // DNS resolve — check ALL A/AAAA records
  try {
    const addresses = await dns.promises.lookup(host, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return { safe: false, reason: `DNS resuelve a IP interna: ${addr.address}`, resolvedIp: addr.address };
      }
    }
    return { safe: true, resolvedIp: addresses[0]?.address };
  } catch (err: any) {
    return { safe: false, reason: `DNS lookup fallido: ${err.message}` };
  }
}
