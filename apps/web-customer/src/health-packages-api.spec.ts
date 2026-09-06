import { formatPackageRupees } from './health-packages-api';

describe('formatPackageRupees', () => {
  it('formats rupee list prices, not minor units', () => {
    const label = formatPackageRupees(1499);
    expect(label.startsWith('₹')).toBe(true);
    expect(label.replace(/[^\d]/g, '')).toBe('1499');
  });
});
