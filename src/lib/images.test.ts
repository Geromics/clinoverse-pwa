import { describe, expect, it } from 'vitest';

globalThis.localStorage = { getItem: () => 'http://clino.test/', setItem() {}, removeItem() {} } as unknown as Storage;
const { initialOf, providerImageUrl } = await import('./images');

describe('provider images', () => {
  it('builds the clino image URL', () => {
    expect(providerImageUrl('site-marmite.svg')).toBe('http://clino.test/images/site-marmite.svg');
    expect(providerImageUrl(undefined)).toBeNull();
  });
  it('falls back to an initial', () => {
    expect(initialOf('GenoPro · Lactase')).toBe('G');
    expect(initialOf('  émile')).toBe('É');
    expect(initialOf('')).toBe('?');
    expect(initialOf(undefined)).toBe('?');
  });
});
