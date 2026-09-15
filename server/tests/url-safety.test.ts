import { describe, it, expect } from 'vitest';
import { isUrlSafeToFetch } from '../lib/url-safety.ts';

describe('isUrlSafeToFetch (F1 — SSRF mitigation)', () => {
  it('acepta URLs HTTPS en allowlist', async () => {
    const r = await isUrlSafeToFetch('https://firebasestorage.googleapis.com/v0/b/bucket/o/photo.jpg');
    expect(r.safe).toBe(true);
  });

  it('rechaza URLs que no son http/https', async () => {
    const r = await isUrlSafeToFetch('file:///etc/passwd');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('Protocolo no permitido');
  });

  it('rechaza hosts no incluidos en allowlist', async () => {
    const r = await isUrlSafeToFetch('https://evil.com/photo.jpg');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('Host no permitido');
  });

  it('rechaza URLs malformadas', async () => {
    const r = await isUrlSafeToFetch('not a url');
    expect(r.safe).toBe(false);
    expect(r.reason).toContain('URL malformada');
  });

  it('rechaza URLs vacías', async () => {
    const r = await isUrlSafeToFetch('');
    expect(r.safe).toBe(false);
  });

  it('rechaza metadata service de GCP (169.254.169.254)', async () => {
    // 169.254.x.x es link-local — bloqueado por isPrivateIp
    const r = await isUrlSafeToFetch('http://169.254.169.254/computeMetadata/v1/');
    expect(r.safe).toBe(false);
    // Como es IP directa (no en allowlist), primero falla allowlist
    expect(r.reason).toBeTruthy();
  });

  it('acepta hosts con wildcard allowlist', async () => {
    const r = await isUrlSafeToFetch(
      'https://sub.firebasestorage.googleapis.com/photo.jpg',
      ['*.firebasestorage.googleapis.com']
    );
    expect(r.safe).toBe(true);
  });
});
