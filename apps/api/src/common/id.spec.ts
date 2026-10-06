import { uuidv7 } from './id';

describe('uuidv7', () => {
  it('generates RFC 9562 version-7 UUIDs', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is lexicographically time-ordered', async () => {
    const a = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 3));
    const b = uuidv7();
    expect(a < b).toBe(true);
  });

  it('does not collide across a batch', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => uuidv7()));
    expect(ids.size).toBe(5000);
  });
});
