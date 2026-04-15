export const decimalTransformer = {
  to(value: number | string | null | undefined): number | string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? value : parsed;
    }

    return value;
  },
  from(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  },
};
