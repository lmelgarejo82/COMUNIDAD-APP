require('dotenv').config();
const { pool } = require('./db');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Limpiando datos existentes...');
    await client.query('TRUNCATE notifications, ticket_replies, tickets, master_ticket_units, master_tickets, announcement_reads, announcements, unit_expenses, expenses, unit_ownerships, units, floors, buildings, admin_complexes, complexes, users, communities, organizations RESTART IDENTITY CASCADE');

    const hash = await bcrypt.hash('admin123', 10);

    // === Organización demo + 2 comunidades ===
    console.log('Creando organización...');
    const { rows: [org] } = await client.query(
      `INSERT INTO organizations (name, legal_name) VALUES ($1, $2) RETURNING *`,
      ['Administración Demo', 'Administración Demo']
    );

    console.log('Creando comunidades...');
    const { rows: [c1] } = await client.query(
      `INSERT INTO communities (name, address, access_code, organization_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      ['Torres del Parque', 'Av. Rivadavia 1500, CABA', 'TORRES2024', org.id]
    );
    const { rows: [c2] } = await client.query(
      `INSERT INTO communities (name, address, access_code, organization_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      ['Country Los Olivos', 'Ruta 8 Km 45, Pilar', 'OLIVOS2024', org.id]
    );

    // === Jerarquía (complejo 1: rico, complejo 2: simple) ===
    console.log('Creando jerarquía...');
    const unitMap = {};
    const complexesCreated = [];

    for (const c of [c1, c2]) {
      const { rows: [complex] } = await client.query(
        `INSERT INTO complexes (name, address, community_id) VALUES ($1, $2, $3) RETURNING *`,
        [c.name, c.address, c.id]
      );
      complexesCreated.push(complex);

      if (c.id === 1) {
        // Torres del Parque: 2 buildings
        for (const bName of ['Torre A', 'Torre B']) {
          const { rows: [building] } = await client.query(
            `INSERT INTO buildings (complex_id, name, building_type, sort_order) VALUES ($1, $2, 'torre', $3) RETURNING *`,
            [complex.id, bName, bName === 'Torre A' ? 1 : 2]
          );
          // 2 floors per building
          for (let fl = 1; fl <= 2; fl++) {
            const { rows: [floor] } = await client.query(
              `INSERT INTO floors (building_id, number, name, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
              [building.id, fl, `Piso ${fl}`, fl]
            );
            // 3 units per floor
            for (let u = 1; u <= 3; u++) {
              const unitCode = `${bName === 'Torre A' ? 'A' : 'B'}${fl}${String.fromCharCode(64 + u)}`;
              const { rows: [unit] } = await client.query(
                `INSERT INTO units (floor_id, unit_code, area_m2, coef_percent, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
                [floor.id, unitCode, 60 + u * 10, parseFloat((100 / 12).toFixed(2)), u]
              );
              unitMap[`${c.id}:${unitCode}`] = unit.id;
            }
          }
        }
      } else {
        // Country Los Olivos: 1 building
        const { rows: [building] } = await client.query(
          `INSERT INTO buildings (complex_id, name, building_type) VALUES ($1, 'Edificio Principal', 'edificio') RETURNING *`,
          [complex.id]
        );
        const { rows: [floor] } = await client.query(
          `INSERT INTO floors (building_id, number, name) VALUES ($1, 1, 'Piso 1') RETURNING *`,
          [building.id]
        );
        for (let i = 1; i <= 5; i++) {
          const unitCode = `O${i}${String.fromCharCode(64 + i)}`;
          const { rows: [unit] } = await client.query(
            `INSERT INTO units (floor_id, unit_code, area_m2) VALUES ($1, $2, $3) RETURNING *`,
            [floor.id, unitCode, 80 + i * 5]
          );
          unitMap[`${c.id}:${unitCode}`] = unit.id;
        }
      }
    }

    // === Admins ===
    console.log('Creando admins...');
    const { rows: [admin1] } = await client.query(
          `INSERT INTO users (email, password_hash, role, user_type, community_id, phone, is_super_admin) VALUES ($1, $2, 'admin', 'owner', $3, '+5491112345678', TRUE) RETURNING *`,
      ['admin1@comunidad.app', hash, c1.id]
    );
    const { rows: [admin2] } = await client.query(
          `INSERT INTO users (email, password_hash, role, user_type, community_id, phone) VALUES ($1, $2, 'admin', 'owner', $3, '+5491112345678') RETURNING *`,
      ['admin2@comunidad.app', hash, c2.id]
    );

    // admin1 manages both complexes (superadmin)
    if (complexesCreated.length >= 2) {
      await client.query(
        `INSERT INTO admin_complexes (user_id, complex_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [admin1.id, complexesCreated[0].id]
      );
      await client.query(
        `INSERT INTO admin_complexes (user_id, complex_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [admin1.id, complexesCreated[1].id]
      );
      console.log('  admin1 (superadmin) tiene acceso a ambos complejos');
    }

    // admin2 manages only its own complex
    await client.query(
      `INSERT INTO admin_complexes (user_id, complex_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [admin2.id, complexesCreated[1].id]
    );
    console.log('  admin2 tiene acceso a Country Los Olivos');

    // === Residentes (5 por comunidad) ===
    console.log('Creando residentes...');
    const residentes = [];
    for (const [c, admin] of [[c1, admin1], [c2, admin2]]) {
      const prefix = c.id === 1 ? 'T' : 'O';
      for (let i = 1; i <= 5; i++) {
        const unitCode = `${prefix}${i}${String.fromCharCode(64 + i)}`;
        const unitId = unitMap[`${c.id}:${unitCode}`] || null;
        const { rows: [r] } = await client.query(
          `INSERT INTO users (email, password_hash, role, user_type, unit_number, unit_id, community_id) VALUES ($1, $2, 'residente', 'owner', $3, $4, $5) RETURNING *`,
          [`vecino${c.id}${i}@comunidad.app`, hash, unitCode, unitId, c.id]
        );
        if (unitId) {
          await client.query(
            `INSERT INTO unit_ownerships (unit_id, user_id, ownership_type, is_primary, start_date) VALUES ($1, $2, 'owner', TRUE, NOW()) RETURNING *`,
            [unitId, r.id]
          );
        }
        residentes.push(r);
      }
    }

    // === Expensas (3 por comunidad, con unit_expenses) ===
    console.log('Creando expensas y unit_expenses...');
    const now = new Date();
    for (const [c, admin] of [[c1, admin1], [c2, admin2]]) {
      for (let i = 0; i < 3; i++) {
        const due = new Date(now.getFullYear(), now.getMonth() + i, 10);
        const amount = c.id === 1 ? 25000 : 18000;
        const fixed = c.id === 1 ? 20000 : 15000;
        const extra = amount - fixed;
        const desc = `Expensa ${due.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}`;
        const period = `${now.getFullYear()}-${String(now.getMonth() + i + 1).padStart(2, '0')}`;

        const { rows: [exp] } = await client.query(
          `INSERT INTO expenses (community_id, description, amount, fixed_amount, extra_amount, due_date, period, created_by, late_fee_percent, grace_days)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 5.00, 5) RETURNING *`,
          [c.id, desc, amount, fixed, extra, due.toISOString().split('T')[0], period, admin.id]
        );

        const units = await client.query(
          "SELECT DISTINCT unit_number FROM users WHERE community_id = $1 AND unit_number IS NOT NULL AND unit_number != ''",
          [c.id]
        );
        const amtPerUnit = parseFloat((amount / units.rows.length).toFixed(2));
        const fixedPerUnit = parseFloat((fixed / units.rows.length).toFixed(2));
        const extraPerUnit = parseFloat((extra / units.rows.length).toFixed(2));

        for (const u of units.rows) {
          const status = i < 2 ? 'paid' : 'pending';
          const now = new Date();
          await client.query(
            `INSERT INTO unit_expenses (expense_id, unit_number, amount_owed, fixed_part, extra_part, status, paid_at, confirmed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [exp.id, u.unit_number, amtPerUnit, fixedPerUnit, extraPerUnit, status, status === 'paid' ? now : null, status === 'paid' ? now : null]
          );
        }
      }
    }

    // === Anuncios (2 por comunidad) ===
    console.log('Creando anuncios...');
    for (const [c, admin] of [[c1, admin1], [c2, admin2]]) {
      await client.query(
        `INSERT INTO announcements (community_id, title, message, created_by)
         VALUES ($1, 'Bienvenidos a la comunidad', 'Les damos la bienvenida a todos los vecinos. Ante cualquier consulta, no duden en comunicarse con la administración.', $2)`,
        [c.id, admin.id]
      );
      await client.query(
        `INSERT INTO announcements (community_id, title, message, created_by)
         VALUES ($1, 'Mantenimiento de ascensores', 'Se realizará mantenimiento programado de ascensores el próximo sábado de 8 a 14 hs. Disculpen las molestias.', $2)`,
        [c.id, admin.id]
      );
    }

    // === Tickets con respuestas ===
    console.log('Creando tickets...');
    const statuses = ['sent', 'in_progress', 'resolved', 'in_progress', 'sent', 'sent'];
    for (let i = 0; i < 6; i++) {
      const r = residentes[i];
      const admin = r.community_id === 1 ? admin1 : admin2;
      const status = statuses[i];

      const { rows: [t] } = await client.query(
        `INSERT INTO tickets (community_id, user_id, unit_number, title, description, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [r.community_id, r.id, r.unit_number,
         `Problema en ${['baño', 'cocina', 'balcón', 'cochera', 'living', 'lavadero'][i]}`,
         'Necesito asistencia para resolver este problema a la brevedad.', status]
      );

      await client.query(
        `INSERT INTO ticket_replies (ticket_id, message, is_admin)
         VALUES ($1, 'Gracias por el reporte. Vamos a revisarlo y te respondemos pronto.', TRUE)`,
        [t.id]
      );
    }

    // === Notificaciones ===
    console.log('Creando notificaciones...');
    for (const r of residentes.slice(0, 4)) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, is_read)
         VALUES ($1, 'announcement', 'Bienvenidos a la comunidad', 'Hay un nuevo anuncio disponible para vos.', 1, FALSE)`,
        [r.id]
      );
    }

    await client.query('COMMIT');

    console.log('\n=== Seed completado ===');
    console.log('');
    console.log('  Comunidades:');
    console.log(`    Torres del Parque  (código: TORRES2024)`);
    console.log(`    Country Los Olivos  (código: OLIVOS2024)`);
    console.log('');
    console.log('  Admins (pass: admin123):');
    console.log(`    admin1@comunidad.app   [Torres del Parque]`);
    console.log(`    admin2@comunidad.app   [Country Los Olivos]`);
    console.log('');
    console.log('  Residentes (pass: admin123):');
    console.log(`    vecino11 .. vecino15@comunidad.app   [Torres del Parque]`);
    console.log(`    vecino21 .. vecino25@comunidad.app   [Country Los Olivos]`);
    console.log('');
    console.log('  6 expensas | 4 anuncios | 6 tickets con respuestas');
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
