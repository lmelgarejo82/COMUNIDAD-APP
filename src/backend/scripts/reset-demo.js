const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEMO_ACCESS_CODE = 'TAVALINK_DEMO_ONLY';
const DEMO_EMAILS = Object.freeze({
  admin: 'demo.admin@tavalink.com.py',
  resident: 'demo.residente@tavalink.com.py',
  guard: 'demo.guardia@tavalink.com.py',
  access: 'demo.accesos@tavalink.com.py',
});

function assertDemoTarget(env = process.env) {
  if (env.DEMO_ENV !== 'true') throw new Error('ABORT: DEMO_ENV=true is required');
  let databaseName = '';
  try {
    databaseName = new URL(env.DATABASE_URL || '').pathname.slice(1);
  } catch {
    throw new Error('ABORT: DATABASE_URL must identify a demo database');
  }
  if (!databaseName || !databaseName.toLowerCase().includes('demo')) {
    throw new Error('ABORT: database name must contain demo');
  }
}

function readDemoCredentials(env = process.env) {
  const names = {
    admin: 'DEMO_ADMIN_PASSWORD',
    resident: 'DEMO_RESIDENT_PASSWORD',
    guard: 'DEMO_GUARD_PASSWORD',
    access: 'DEMO_ACCESS_PASSWORD',
  };
  return Object.fromEntries(Object.entries(names).map(([role, name]) => {
    const value = typeof env[name] === 'string' ? env[name] : '';
    if (value.length < 16) throw new Error(`ABORT: ${name} must contain at least 16 characters`);
    return [role, value];
  }));
}

function createDemoPdf() {
  const stream = [
    'BT',
    '/F1 18 Tf',
    '72 760 Td',
    '(Residencial Los Lapachos) Tj',
    '0 -28 Td',
    '/F1 11 Tf',
    '(Reglamento de convivencia - documento ficticio de demostracion.) Tj',
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, 'ascii');
  body += 'xref\n0 6\n0000000000 65535 f \n';
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
}

async function resetDemo(client, credentials, uploadDir) {
  const hashes = Object.fromEntries(await Promise.all(
    Object.entries(credentials).map(async ([key, value]) => [key, await bcrypt.hash(value, 12)])
  ));
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 12);

  await client.query('BEGIN');
  try {
    await client.query('DELETE FROM communities WHERE access_code IN ($1, $2)', [DEMO_ACCESS_CODE, 'DEMO2024']);
    await client.query(`DELETE FROM organizations o WHERE o.name IN ('Residencial Los Lapachos', 'Comunidad Demo')
      AND NOT EXISTS (SELECT 1 FROM communities c WHERE c.organization_id = o.id)`);

    const { rows: [organization] } = await client.query(
      'INSERT INTO organizations (name, legal_name) VALUES ($1, $2) RETURNING id',
      ['Residencial Los Lapachos', 'Consorcio ficticio para demostraciones']
    );
    const { rows: [community] } = await client.query(
      `INSERT INTO communities (name, address, access_code, organization_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['Residencial Los Lapachos', 'Avenida de los Lapachos 1200, Asunción', DEMO_ACCESS_CODE, organization.id]
    );
    const { rows: [complex] } = await client.query(
      'INSERT INTO complexes (name, address, community_id) VALUES ($1, $2, $3) RETURNING id',
      ['Conjunto Los Lapachos', 'Avenida de los Lapachos 1200', community.id]
    );
    const { rows: [building] } = await client.query(
      `INSERT INTO buildings (complex_id, name, building_type, sort_order)
       VALUES ($1, 'Torre Lapacho', 'torre', 1) RETURNING id`, [complex.id]
    );

    const units = [];
    for (let floorNumber = 1; floorNumber <= 3; floorNumber += 1) {
      const { rows: [floor] } = await client.query(
        'INSERT INTO floors (building_id, number, name, sort_order) VALUES ($1, $2, $3, $2) RETURNING id',
        [building.id, floorNumber, `Piso ${floorNumber}`]
      );
      for (const suffix of ['A', 'B']) {
        const code = `${floorNumber}0${suffix === 'A' ? '1' : '2'}`;
        const { rows: [unit] } = await client.query(
          `INSERT INTO units (floor_id, unit_code, unit_type, area_m2, coef_percent, sort_order)
           VALUES ($1, $2, 'departamento', $3, $4, $5) RETURNING id, unit_code`,
          [floor.id, code, suffix === 'A' ? 82 : 74, 16.67, suffix === 'A' ? 1 : 2]
        );
        units.push(unit);
      }
    }

    async function createUser(email, hash, role, unit = null, userType = 'owner') {
      const { rows: [user] } = await client.query(
        `INSERT INTO users (email, password_hash, role, user_type, unit_number, unit_id, community_id, phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL) RETURNING id`,
        [email, hash, role, userType, unit?.unit_code || null, unit?.id || null, community.id]
      );
      if (unit) {
        await client.query(
          `INSERT INTO unit_ownerships (unit_id, user_id, ownership_type, is_primary, start_date)
           VALUES ($1, $2, $3, TRUE, NOW())`, [unit.id, user.id, userType]
        );
      }
      return user;
    }

    const admin = await createUser(DEMO_EMAILS.admin, hashes.admin, 'admin');
    const resident = await createUser(DEMO_EMAILS.resident, hashes.resident, 'residente', units[0]);
    await createUser(DEMO_EMAILS.guard, hashes.guard, 'access_operator');
    await createUser(DEMO_EMAILS.access, hashes.access, 'access_operator');
    await createUser('sofia.vera@example.invalid', unusableHash, 'residente', units[1], 'tenant');
    await createUser('martin.rojas@example.invalid', unusableHash, 'residente', units[2]);
    await createUser('ana.gimenez@example.invalid', unusableHash, 'residente', units[3]);
    await client.query('INSERT INTO admin_complexes (user_id, complex_id) VALUES ($1, $2)', [admin.id, complex.id]);

    await client.query(
      `INSERT INTO announcements (community_id, title, message, created_by) VALUES
       ($1, 'Mantenimiento preventivo del ascensor', 'El jueves de 09:00 a 11:00 se realizará una revisión programada.', $2),
       ($1, 'Asamblea ordinaria', 'La próxima asamblea será el 28 de septiembre a las 19:00 en el SUM.', $2),
       ($1, 'Mejoras en el acceso principal', 'Finalizó la instalación del nuevo sistema de control de visitas.', $2)`,
      [community.id, admin.id]
    );

    const { rows: [ticket] } = await client.query(
      `INSERT INTO tickets (community_id, user_id, unit_number, unit_id, title, description, status, category, priority, location_label)
       VALUES ($1, $2, $3, $4, 'Luz intermitente en pasillo', 'La luminaria del segundo piso funciona de manera intermitente.',
       'in_progress', 'maintenance', 'medium', 'Torre Lapacho · Piso 2') RETURNING id`,
      [community.id, resident.id, units[0].unit_code, units[0].id]
    );
    await client.query(
      `INSERT INTO ticket_replies (ticket_id, message, is_admin) VALUES
       ($1, 'Gracias por el aviso. El electricista realizará la revisión mañana.', TRUE)`, [ticket.id]
    );

    const { rows: amenities } = await client.query(
      `INSERT INTO amenities (community_id, name, description, capacity, rules) VALUES
       ($1, 'Quincho', 'Parrilla y galería cubierta', 20, '{"max_hours":4,"advance_hours":24,"deposit":250000}'),
       ($1, 'Salón multiuso', 'Salón climatizado con cocina', 45, '{"max_hours":6,"advance_hours":48,"deposit":400000}')
       RETURNING id, name`, [community.id]
    );
    await client.query(
      `INSERT INTO bookings (amenity_id, user_id, unit_number, unit_id, date_from, date_to, status, deposit_amount, notes)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days', NOW() + INTERVAL '7 days 4 hours', 'pending', 250000, 'Cumpleaños familiar')`,
      [amenities[0].id, resident.id, units[0].unit_code, units[0].id]
    );

    const { rows: [expense] } = await client.query(
      `INSERT INTO expenses (community_id, description, amount, fixed_amount, extra_amount, due_date, period, created_by, late_fee_percent, grace_days)
       VALUES ($1, 'Expensas septiembre 2026', 2700000, 2400000, 300000, DATE '2026-09-20', '2026-09', $2, 3, 5)
       RETURNING id`, [community.id, admin.id]
    );
    for (let index = 0; index < units.length; index += 1) {
      const paid = index === 1;
      await client.query(
        `INSERT INTO unit_expenses
         (expense_id, unit_number, unit_id, amount_owed, fixed_part, extra_part, status, paid_at, confirmed_at)
         VALUES ($1, $2, $3, 450000, 400000, 50000, $4::varchar,
          CASE WHEN $4::varchar = 'paid' THEN NOW() - INTERVAL '2 days' END,
          CASE WHEN $4::varchar = 'paid' THEN NOW() - INTERVAL '2 days' END)`,
        [expense.id, units[index].unit_code, units[index].id, paid ? 'paid' : 'pending']
      );
    }

    await client.query(
      `INSERT INTO polls (community_id, title, description, options, created_by, expires_at)
       VALUES ($1, 'Horario de uso del quincho', 'Elegí el horario preferido para fines de semana.',
       '["10:00 a 16:00", "16:00 a 22:00", "Sin cambios"]', $2, NOW() + INTERVAL '20 days')`,
      [community.id, admin.id]
    );

    await client.query(
      `INSERT INTO visitor_preauthorizations
       (community_id, complex_id, unit_id, visitor_name, visitor_document, visit_type, destination_label,
        authorized_by, expected_from, expected_until, status, created_by)
       VALUES ($1, $2, $3, 'Visitante de demostración', 'DOC-DEMO-001', 'visita', $4,
        'Residente demo', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 3 hours', 'pending', $5)`,
      [community.id, complex.id, units[0].id, `Unidad ${units[0].unit_code}`, resident.id]
    );
    await client.query(
      `INSERT INTO visitor_access_logs
       (community_id, complex_id, unit_id, visitor_name, visitor_document, visit_type, destination_label,
        authorized_by, entry_at, exit_at, status, created_by, exited_by)
       VALUES ($1, $2, $3, 'Proveedor ficticio', 'RUC-DEMO-002', 'proveedor', $4,
        'Administración', NOW() - INTERVAL '2 days 2 hours', NOW() - INTERVAL '2 days', 'exited', $5, $5)`,
      [community.id, complex.id, units[2].id, `Unidad ${units[2].unit_code}`, admin.id]
    );

    const documentFile = '1726000000000-reglamento-demo.pdf';
    await client.query(
      `INSERT INTO documents (community_id, title, description, file_url, uploaded_by)
       VALUES ($1, 'Reglamento de convivencia', 'Documento ficticio para la presentación.', $2, $3)`,
      [community.id, `/uploads/${documentFile}`, admin.id]
    );
    await client.query('COMMIT');

    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, documentFile), createDemoPdf());
    return { communityId: community.id, users: DEMO_EMAILS };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  assertDemoTarget();
  const credentials = readDemoCredentials();
  const { pool } = require('../db');
  const client = await pool.connect();
  try {
    const result = await resetDemo(client, credentials, process.env.UPLOAD_DIR || path.resolve(__dirname, '..', 'uploads'));
    console.log(`Demo reset complete for community ${result.communityId}; credentials were not printed.`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { assertDemoTarget, createDemoPdf, readDemoCredentials, resetDemo, DEMO_EMAILS };
