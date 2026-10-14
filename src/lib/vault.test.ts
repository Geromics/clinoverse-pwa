import { describe, expect, it } from 'vitest';
import { open, seal } from './vault';

describe('vault', () => {
  it('seals and opens with the right PIN, fails on a wrong one', async () => {
    const v = await seal('rural list erase', '123456');
    expect(v.ct).not.toContain('rural');
    expect(await open(v, '123456')).toBe('rural list erase');
    await expect(open(v, '123457')).rejects.toThrow();
    const v2 = await seal('rural list erase', '123456');
    expect(v2.salt).not.toBe(v.salt);
  });
});
