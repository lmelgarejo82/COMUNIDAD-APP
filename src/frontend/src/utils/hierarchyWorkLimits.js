export const HIERARCHY_WORK_LIMITS = Object.freeze({
  totalLots: 200,
  bulkFloors: 50,
  unitsPerFloor: 100,
});

export function parseHierarchyCount(value, { label, max }) {
  let parsed;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    parsed = Number(value);
  } else {
    throw new RangeError(`${label} debe ser un entero entre 1 y ${max}`);
  }

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new RangeError(`${label} debe ser un entero entre 1 y ${max}`);
  }
  return parsed;
}
