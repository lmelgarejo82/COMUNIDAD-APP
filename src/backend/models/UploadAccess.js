const { pool } = require('../db');

const UploadAccess = {
  async isAuthorized(fileUrl, { communityId, userId, role }) {
    if (!communityId || !userId || !role) return false;

    const { rows } = await pool.query(
      `SELECT EXISTS (
         SELECT 1
         FROM (
           SELECT 1
           FROM documents d
           WHERE d.file_url = $1
             AND d.community_id = $2
             AND $4::text IN ('admin', 'residente')

           UNION ALL

           SELECT 1
           FROM announcements a
           WHERE a.file_url = $1
             AND a.community_id = $2
             AND a.deleted_at IS NULL
             AND $4::text IN ('admin', 'residente')

           UNION ALL

           SELECT 1
           FROM expenses e
           WHERE e.file_url = $1
             AND e.community_id = $2
             AND e.deleted_at IS NULL
             AND $4::text IN ('admin', 'residente')

           UNION ALL

           SELECT 1
           FROM tickets t
           WHERE t.file_url = $1
             AND t.community_id = $2
             AND t.deleted_at IS NULL
             AND t.master_ticket_id IS NULL
             AND (
               $4::text = 'admin'
               OR ($4::text = 'residente' AND t.user_id = $3)
             )

           UNION ALL

           SELECT 1
           FROM ticket_replies tr
           JOIN tickets t ON t.id = tr.ticket_id
           WHERE tr.file_url = $1
             AND t.community_id = $2
             AND t.deleted_at IS NULL
             AND (
               $4::text = 'admin'
               OR ($4::text = 'residente' AND t.user_id = $3)
             )

           UNION ALL

           SELECT 1
           FROM unit_expenses ue
           JOIN expenses e ON e.id = ue.expense_id
           JOIN units un ON un.id = ue.unit_id
           JOIN floors f ON f.id = un.floor_id
           JOIN buildings b ON b.id = f.building_id
           JOIN complexes cx ON cx.id = b.complex_id
           WHERE ue.payment_proof_url = $1
             AND e.community_id = $2
             AND cx.community_id = e.community_id
             AND e.deleted_at IS NULL
             AND (
               $4::text = 'admin'
               OR (
                 $4::text = 'residente'
                 AND COALESCE(un.is_active, TRUE) = TRUE
                 AND un.deleted_at IS NULL
                 AND f.deleted_at IS NULL
                 AND b.deleted_at IS NULL
                 AND cx.deleted_at IS NULL
                 AND EXISTS (
                   SELECT 1
                   FROM unit_ownerships uo
                   WHERE uo.unit_id = un.id
                     AND uo.user_id = $3
                     AND (uo.start_date IS NULL OR uo.start_date <= NOW())
                     AND (uo.end_date IS NULL OR uo.end_date > NOW())
                 )
               )
             )
         ) authorized_owner
       ) AS authorized
       FROM communities c
       WHERE c.id = $2
         AND c.deleted_at IS NULL`,
      [fileUrl, communityId, userId, role]
    );

    return Boolean(rows[0]?.authorized);
  },
};

module.exports = { UploadAccess };
