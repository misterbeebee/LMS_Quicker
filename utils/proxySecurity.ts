const PRIVATE_OR_LOCAL_IPV4_RE = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const DOTTED_IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const NUMERIC_OR_HEX_HOST_RE = /^(0x[0-9a-f]+|\d+)$/i;
const OBFUSCATED_IPV4_RE = /^(0[0-7]+|0x[0-9a-f]+|\d+)\.(0[0-7]+|0x[0-9a-f]+|\d+)(\.(0[0-7]+|0x[0-9a-f]+|\d+)){0,2}$/i;

export interface ProxyUrlValidationResult {
  valid: boolean;
  reason?: string;
}

function isPrivateOrLocalIpv4(ip: string): boolean {
  if (PRIVATE_OR_LOCAL_IPV4_RE.test(ip)) return true;
  const match = ip.match(DOTTED_IPV4_RE);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  if (a === 100 && b >= 64 && b <= 127) return true; // Carrier-grade NAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // Benchmark testing 198.18.0.0/15
  if (a >= 224) return true; // Multicast / reserved
  return false;
}

function parseMappedIpv4FromHexGroups(highHex: string, lowHex: string): string | null {
  const high = parseInt(highHex, 16);
  const low = parseInt(lowHex, 16);
  if (isNaN(high) || isNaN(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) {
    return null;
  }
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

/**
 * Validates target URLs for /api/proxy to prevent SSRF attacks against
 * loopback, cloud metadata, or private internal network addresses.
 */
export function validateProxyTargetUrl(targetUrl: string): ProxyUrlValidationResult {
  if (!targetUrl || typeof targetUrl !== 'string') {
    return { valid: false, reason: 'Missing target URL' };
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl.trim());
  } catch {
    return { valid: false, reason: 'Malformed target URL' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: 'Target URL must begin with http:// or https://' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Proxy URLs with embedded credentials are not permitted' };
  }

  // Strip IPv6 brackets and trailing DNS root dots (e.g. "localhost.")
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (!host) {
    return { valid: false, reason: 'Target URL is missing a hostname' };
  }

  if (
    host === 'localhost' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return { valid: false, reason: 'Proxy requests to local or internal hostnames are blocked' };
  }

  // Block integer/hex/octal obfuscated IPv4 hostnames (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (NUMERIC_OR_HEX_HOST_RE.test(host)) {
    return { valid: false, reason: 'Proxy requests to numeric or hex IP hostnames are blocked' };
  }
  if (OBFUSCATED_IPV4_RE.test(host) && !DOTTED_IPV4_RE.test(host)) {
    return { valid: false, reason: 'Proxy requests to non-standard IPv4 notations are blocked' };
  }
  if (DOTTED_IPV4_RE.test(host) && host.split('.').some(seg => seg.length > 1 && seg.startsWith('0'))) {
    return { valid: false, reason: 'Proxy requests to octal-prefixed IPv4 addresses are blocked' };
  }

  if (isPrivateOrLocalIpv4(host)) {
    return { valid: false, reason: 'Proxy requests to private or link-local IPv4 addresses are blocked' };
  }

  // Block common IPv6 loopback / unique-local / link-local / NAT64 / IPv4-mapped ranges
  if (
    host === '::1' ||
    host === '::' ||
    host.startsWith('fe80:') ||
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('64:ff9b:') ||
    host.startsWith('::ffff:')
  ) {
    if (host.startsWith('::ffff:')) {
      const suffix = host.slice('::ffff:'.length);
      if (DOTTED_IPV4_RE.test(suffix) && !isPrivateOrLocalIpv4(suffix)) {
        return { valid: true };
      }
      const hexMatch = suffix.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
      if (hexMatch) {
        const mappedIp = parseMappedIpv4FromHexGroups(hexMatch[1], hexMatch[2]);
        if (mappedIp && !isPrivateOrLocalIpv4(mappedIp)) {
          return { valid: true };
        }
      }
    }
    return { valid: false, reason: 'Proxy requests to private or loopback IPv6 addresses are blocked' };
  }

  return { valid: true };
}
