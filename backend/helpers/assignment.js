// Fair-pick: among active + approved employees whose department/role
// matches the service (via services.department_id / services.role_id),
// pick the one with the fewest pending/accepted guests today.
async function pickEmployeeForService(pool, serviceId) {
  const [svc] = await pool.query(
    'SELECT department_id, role_id FROM services WHERE id = ?',
    [serviceId]
  );
  if (!svc.length) return null;

  const { department_id, role_id } = svc[0];
  if (!department_id && !role_id) return null;

  const conditions = [];
  const params = [];
  if (department_id) {
    conditions.push('e.department_id = ?');
    params.push(department_id);
  }
  if (role_id) {
    conditions.push('e.role_id = ?');
    params.push(role_id);
  }

  const [rows] = await pool.query(
    `SELECT e.id,
            COUNT(g.id) AS pending_today
     FROM employees e
     LEFT JOIN guests g
       ON g.assigned_employee_id = e.id
      AND g.assignment_status IN ('pending','accepted')
      AND DATE(g.assigned_at) = CURDATE()
     WHERE e.is_active = 1
       AND e.is_approved = 1
       AND (${conditions.join(' OR ')})
     GROUP BY e.id
     ORDER BY pending_today ASC, e.id ASC
     LIMIT 1`,
    params
  );
  return rows[0]?.id || null;
}

module.exports = { pickEmployeeForService };