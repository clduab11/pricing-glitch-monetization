/**
 * URL validation to prevent SSRF attacks and enforce domain whitelist.
 *
 * Only allows scraping from trusted e-commerce domains to prevent:
 * - Internal network scanning
 * - Credential harvesting via file:// or internal IPs
 * - Malicious redirects
 */

const ALLOWED_DOMAINS = [
  'amazon.com',
  'walmart.com',
  'bestbuy.com',
  'target.com',
  'ebay.com',
  'costco.com',
  'homedepot.com',
  'lowes.com',
] as const;

export class URLValidationError extends Error {
  constructor(
    message: string,
    public readonly url: string
  ) {
    super(message);
    this.name = 'URLValidationError';
  }
}

/**
 * Validates that a product URL points to a whitelisted domain.
 *
 * @param url - The URL to validate (must include protocol)
 * @throws {URLValidationError} If URL is invalid or domain not whitelisted
 *
 * @example
 * validateProductUrl('https://amazon.com/product/123'); // OK
 * validateProductUrl('https://evil.com/steal-creds'); // Throws
 */
export function validateProductUrl(url: string): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new URLValidationError(
      `Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`,
      url
    );
  }

  // Reject non-HTTP(S) protocols (file://, ftp://, etc.)
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new URLValidationError(
      `Unsupported protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`,
      url
    );
  }

  // Check if hostname ends with any whitelisted domain
  const isWhitelisted = ALLOWED_DOMAINS.some(
    (domain) =>
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
  );

  if (!isWhitelisted) {
    throw new URLValidationError(
      `Domain not whitelisted: ${parsedUrl.hostname}. Allowed domains: ${ALLOWED_DOMAINS.join(', ')}`,
      url
    );
  }
}

/**
 * Check if a URL is valid without throwing.
 * Returns validation result with error message if invalid.
 */
export function isValidProductUrl(url: string): { valid: boolean; error?: string } {
  try {
    validateProductUrl(url);
    return { valid: true };
  } catch (error) {
    if (error instanceof URLValidationError) {
      return { valid: false, error: error.message };
    }
    return { valid: false, error: 'Unknown validation error' };
  }
}
