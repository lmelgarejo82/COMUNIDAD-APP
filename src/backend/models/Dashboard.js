const { pool } = require('../db');
const { cacheOrFetch, CACHE_TTL } = require('../cache');

const USE_HIERARCHY = process.env.USE_HIERARCHY === 'true';

const BUILDING_COLLECTION_SQL = `
WITH building_units AS (
  SELECT b.id AS building_id, b.name AS building_name,
         u.id AS unit_id
  FROM buildings b
  JOIN floors f ON f.building_id = b.id
  JOIN units u ON u.floor_id = f.id
  JOIN complexes cx ON b.complex_id = cx.id
  WHERE cx.community_id = $1
),
paid AS (
  SELECT bu.building_id,
         COALESCE(SUM(ue.amount_owed), 0) AS total_paid
  FROM building_units bu
  LEFT JOIN unit_expenses ue ON ue.unit_id = bu.unit_id AND ue.status = 'paid'
  GROUP BY bu.building_id
),
delinquent AS (
  SELECT bu.building_id,
         COUNT(DISTINCT bu.unit_id) AS total_units,
         COUNT(DISTINCT bu.unit_id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM unit_expenses ue2
             JOIN expenses e2 ON ue2.expense_id = e2.id
             WHERE ue2.unit_id = bu.unit_id
               AND ue2.status IN ('pending', 'in_review')
               AND e2.deleted_at IS NULL
           )
         ) AS delinquent_units
  FROM building_units bu
  GROUP BY bu.building_id
)
SELECT bu.building_name,
       p.total_paid,
       d.total_units,
       d.delinquent_units,
       CASE WHEN d.total_units > 0
         THEN ROUND(d.delinquent_units::decimal / d.total_units * 100, 1)
         ELSE 0
       END AS pct_morosos
FROM building_units bu
JOIN paid p ON p.building_id = bu.building_id
JOIN delinquent d ON d.building_id = bu.building_id
GROUP BY bu.building_id, bu.building_name, p.total_paid, d.total_units, d.delinquent_units
ORDER BY bu.building_name
`;

const DELINQUENCY_BY_TYPE_SQL = `
SELECT uo.ownership_type,
       COUNT(DISTINCT uo.unit_id) AS total_units,
       COUNT(DISTINCT uo.unit_id) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM unit_expenses ue2
           JOIN expenses e2 ON ue2.expense_id = e2.id
           WHERE ue2.unit_id = uo.unit_id
             AND ue2.status IN ('pending', 'in_review')
             AND e2.deleted_at IS NULL
         )
       ) AS delinquent_units,
       CASE WHEN COUNT(DISTINCT uo.unit_id) > 0
         THEN ROUND(
           COUNT(DISTINCT uo.unit_id) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM unit_expenses ue2
               JOIN expenses e2 ON ue2.expense_id = e2.id
               WHERE ue2.unit_id = uo.unit_id
                 AND ue2.status IN ('pending', 'in_review')
                 AND e2.deleted_at IS NULL
             )
           )::decimal / COUNT(DISTINCT uo.unit_id) * 100, 1
         )
         ELSE 0
       END AS pct_morosidad
FROM unit_ownerships uo
JOIN units u ON uo.unit_id = u.id
JOIN floors f ON u.floor_id = f.id
JOIN buildings b ON f.building_id = b.id
JOIN complexes cx ON b.complex_id = cx.id
WHERE cx.community_id = $1
  AND (uo.end_date IS NULL OR uo.end_date > NOW())
GROUP BY uo.ownership_type
ORDER BY uo.ownership_type
`;

const MONTHLY_EVOLUTION_SQL = `
SELECT TO_CHAR(ue.confirmed_at, 'YYYY-MM') AS month,
       EXTRACT(YEAR FROM ue.confirmed_at)::int AS year,
       EXTRACT(MONTH FROM ue.confirmed_at)::int AS month_num,
       COALESCE(SUM(ue.amount_owed), 0) AS total_paid
FROM unit_expenses ue
JOIN expenses e ON ue.expense_id = e.id
JOIN complexes cx ON cx.community_id = e.community_id
WHERE cx.community_id = $1
  AND ue.status = 'paid'
  AND ue.confirmed_at >= $2
GROUP BY TO_CHAR(ue.confirmed_at, 'YYYY-MM'),
         EXTRACT(YEAR FROM ue.confirmed_at),
         EXTRACT(MONTH FROM ue.confirmed_at)
ORDER BY year, month_num
`;

const Dashboard = {
  async residente(userId, communityId) {
    const userQuery = await pool.query(
      'SELECT unit_number, community_id FROM users WHERE id = $1',
      [userId]
    );
    const user = userQuery.rows[0];
    if (!user || !user.unit_number || user.community_id !== communityId) {
      return { saldo_pendiente: 0, fecha_vencimiento: null, anuncios: [] };
    }

    const saldoQuery = await pool.query(
      `SELECT COALESCE(SUM(ue.amount_owed), 0) AS saldo_pendiente
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.unit_number = $1
         AND e.community_id = $2
         AND ue.status IN ('pending', 'in_review')`,
      [user.unit_number, communityId]
    );

    const vencimientoQuery = await pool.query(
      `SELECT e.due_date
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       WHERE ue.unit_number = $1
         AND e.community_id = $2
         AND ue.status IN ('pending', 'in_review')
       ORDER BY e.due_date ASC
       LIMIT 1`,
      [user.unit_number, communityId]
    );

    const anunciosQuery = await pool.query(
      `SELECT a.title, a.message AS content, a.created_at
       FROM announcements a
       WHERE a.community_id = $1
       ORDER BY a.created_at DESC
       LIMIT 2`,
      [communityId]
    );

    return {
      saldo_pendiente: parseFloat(saldoQuery.rows[0].saldo_pendiente),
      fecha_vencimiento: vencimientoQuery.rows[0]?.due_date || null,
      anuncios: anunciosQuery.rows,
    };
  },

  async admin(communityId) {
    if (!communityId) {
      return {
        total_recaudado: 0, porcentaje_morosidad: 0, tickets_pendientes: 0,
        total_recaudado_por_edificio: [],
        morosidad_por_tipo_unidad: [],
        evolucion_mensual: [],
      };
    }

    return cacheOrFetch(`dashboard:admin:${communityId}`, CACHE_TTL.MEDIUM, () => computeAdmin(communityId));
  }
};

async function computeAdmin(communityId) {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const baseQueries = [
    pool.query(
      `SELECT COALESCE(SUM(ue.amount_owed), 0) AS total_recaudado
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       WHERE e.community_id = $1
         AND ue.status = 'paid'
         AND ue.confirmed_at >= $2`,
      [communityId, firstDayOfMonth]
    ),
    pool.query(
      `SELECT COUNT(*) AS total
       FROM users
       WHERE community_id = $1 AND role = 'residente'`,
      [communityId]
    ),
    pool.query(
      `SELECT COUNT(DISTINCT ue.unit_number) AS total
       FROM unit_expenses ue
       JOIN expenses e ON ue.expense_id = e.id
       WHERE e.community_id = $1
         AND ue.status IN ('pending', 'in_review')`,
      [communityId]
    ),
    pool.query(
      `SELECT COUNT(*) AS total
       FROM tickets
       WHERE community_id = $1
         AND status IN ('sent', 'in_progress')`,
      [communityId]
    ),
  ];

  const hierarchyQueries = USE_HIERARCHY
    ? [
        pool.query(BUILDING_COLLECTION_SQL, [communityId]),
        pool.query(DELINQUENCY_BY_TYPE_SQL, [communityId]),
        pool.query(MONTHLY_EVOLUTION_SQL, [communityId, sixMonthsAgo]),
      ]
    : [
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
        Promise.resolve({ rows: [] }),
      ];

  const [recaudadoQuery, totalResidentesQuery, deudoresQuery, ticketsQuery,
         recaudadoEdificios, morosidadTipo, evolucion] =
    await Promise.all([...baseQueries, ...hierarchyQueries]);

  const totalResidentes = parseInt(totalResidentesQuery.rows[0].total) || 1;
  const deudores = parseInt(deudoresQuery.rows[0].total) || 0;

  return {
    total_recaudado: parseFloat(recaudadoQuery.rows[0].total_recaudado),
    porcentaje_morosidad: Math.round((deudores / totalResidentes) * 100),
    tickets_pendientes: parseInt(ticketsQuery.rows[0].total),
    total_recaudado_por_edificio: recaudadoEdificios.rows,
    morosidad_por_tipo_unidad: morosidadTipo.rows,
    evolucion_mensual: evolucion.rows,
  };
}

module.exports = { Dashboard };
