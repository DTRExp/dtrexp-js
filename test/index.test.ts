import { SPEC_DRAFT } from '../src/index.js';

describe('dtrexp-js', () => {
  it('targets DTRExp spec draft 2.1', () => {
    expect(SPEC_DRAFT).toBe(2.1);
  });
});
