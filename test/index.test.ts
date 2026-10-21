import { SPEC_DRAFT } from '../src/index.js';

describe('dtrexp-js', () => {
  it('targets DTRExp spec draft 3', () => {
    expect(SPEC_DRAFT).toBe(3);
  });
});
