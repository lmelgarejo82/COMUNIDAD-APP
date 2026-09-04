const HIERARCHY_WORK_LIMITS = Object.freeze({
  totalLots: 200,
  bulkFloors: 50,
  unitsPerFloor: 100,
  reorganizeEntries: 100,
});

function boundedInteger(value, { field, max, defaultValue }) {
  if (value === undefined || value === null) return { value: defaultValue };

  let parsed;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    parsed = Number(value);
  } else {
    return { error: `${field} debe ser un entero entre 1 y ${max}` };
  }

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    return { error: `${field} debe ser un entero entre 1 y ${max}` };
  }
  return { value: parsed };
}

function validateTotalLots(value) {
  return boundedInteger(value, {
    field: 'total_lots',
    max: HIERARCHY_WORK_LIMITS.totalLots,
    defaultValue: 1,
  });
}

function validateTowerBatch(floors) {
  if (!Array.isArray(floors) || floors.length === 0) {
    return { error: 'floors[] es requerido para tipo tower' };
  }
  if (floors.length > HIERARCHY_WORK_LIMITS.bulkFloors) {
    return { error: `floors admite entre 1 y ${HIERARCHY_WORK_LIMITS.bulkFloors} elementos` };
  }

  for (const floor of floors) {
    if (!floor || typeof floor !== 'object' || Array.isArray(floor)) {
      return { error: 'cada piso debe ser un objeto válido' };
    }
    if (floor.units !== undefined && floor.units !== null && !Array.isArray(floor.units)) {
      return { error: 'floor.units debe ser un array' };
    }
    if (floor.units?.length > HIERARCHY_WORK_LIMITS.unitsPerFloor) {
      return { error: `cada piso admite hasta ${HIERARCHY_WORK_LIMITS.unitsPerFloor} unidades` };
    }
  }

  return { value: floors };
}

function validateReorganizationEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: 'entries debe ser un array no vacío' };
  }
  if (entries.length > HIERARCHY_WORK_LIMITS.reorganizeEntries) {
    return { error: `entries admite hasta ${HIERARCHY_WORK_LIMITS.reorganizeEntries} elementos` };
  }
  return { value: entries };
}

module.exports = {
  HIERARCHY_WORK_LIMITS,
  validateReorganizationEntries,
  validateTotalLots,
  validateTowerBatch,
};
