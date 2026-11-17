const PROFILE_GROUPS = [
  {
    requestTerms: ['hr', 'human resources', 'interview', 'recruitment', 'hiring', 'employment'],
    departments: ['hr', 'human resources', 'personnel'],
    roles: ['hr', 'human resources', 'recruiter', 'recruitment', 'personnel'],
  },
  {
    requestTerms: ['operations', 'delivery', 'logistics', 'site visit', 'inspection', 'field visit', 'farm visit'],
    departments: ['operations', 'logistics', 'field operations'],
    roles: ['operations', 'field', 'logistics', 'delivery', 'supervisor', 'site'],
  },
  {
    requestTerms: ['finance', 'accounting', 'account', 'accounts', 'invoice', 'payment', 'payroll', 'budget'],
    departments: ['finance', 'accounting', 'accounts'],
    roles: ['finance', 'account', 'accounting', 'payroll', 'cashier'],
  },
  {
    requestTerms: ['sales', 'sale', 'marketing', 'customer', 'client', 'order', 'produce'],
    departments: ['sales', 'marketing', 'commercial'],
    roles: ['sales', 'marketing', 'customer', 'client'],
  },
];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'visit', 'with',
]);

function words(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word));
}

function includesPhrase(text, phrase) {
  const textWords = new Set(words(text));
  const phraseWords = words(phrase);
  return phraseWords.length > 0 && phraseWords.every((word) => textWords.has(word));
}

function rankEmployee(employee, service, purpose) {
  const request = `${service.name || ''} ${service.description || ''} ${purpose || ''}`;
  const department = employee.department_name || '';
  const role = employee.role_name || '';
  const requestWords = new Set(words(request));
  const profileWords = new Set([...words(department), ...words(role)]);
  const sharedWords = [...requestWords].filter((word) => profileWords.has(word));
  let score = Math.min(sharedWords.length, 3) * 2;
  const reasons = sharedWords.length
    ? [`Profile keyword${sharedWords.length === 1 ? '' : 's'}: ${sharedWords.join(', ')}`]
    : [];

  if (
    service.department_id &&
    Number(employee.department_id) === Number(service.department_id)
  ) {
    score += 10;
    reasons.push(`Department match: ${department}`);
  }
  if (service.role_id && Number(employee.role_id) === Number(service.role_id)) {
    score += 8;
    reasons.push(`Role match: ${role}`);
  }
  const isServiceContact =
    Boolean(service.assigned_employee_id) &&
    Number(employee.id) === Number(service.assigned_employee_id);
  if (isServiceContact) {
    score += 12;
    reasons.push('Assigned service contact');
  }

  for (const group of PROFILE_GROUPS) {
    if (!group.requestTerms.some((term) => includesPhrase(request, term))) continue;

    if (group.departments.some((term) => includesPhrase(department, term))) {
      score += 8;
      reasons.push(`Department match: ${department}`);
    }
    if (group.roles.some((term) => includesPhrase(role, term))) {
      score += 6;
      reasons.push(`Role match: ${role}`);
    }
  }

  return {
    ...employee,
    open_guests_today: Number(employee.open_guests_today),
    match_score: score,
    profile_match:
      isServiceContact ||
      (Boolean(service.department_id) &&
        Number(employee.department_id) === Number(service.department_id)) ||
      (Boolean(service.role_id) &&
        Number(employee.role_id) === Number(service.role_id)) ||
      score > 0,
    is_service_contact: isServiceContact,
    match_reason: reasons.length ? [...new Set(reasons)].join(' · ') : 'No direct profile match',
  };
}

async function getEmployeeSuggestions(pool, serviceId, purpose = '') {
  const [svc] = await pool.query(
    `SELECT id, name, description, department_id, role_id, assigned_employee_id
     FROM services
     WHERE id = ?`,
    [serviceId]
  );
  if (!svc.length) return { service: null, employees: [] };

  const service = svc[0];
  const conditions = [];
  const params = [];
  if (service.department_id && service.role_id) {
    conditions.push('(e.department_id = ? AND e.role_id = ?)');
    params.push(service.department_id, service.role_id);
  } else if (service.department_id) {
    conditions.push('e.department_id = ?');
    params.push(service.department_id);
  } else if (service.role_id) {
    conditions.push('e.role_id = ?');
    params.push(service.role_id);
  }
  if (service.assigned_employee_id) {
    conditions.push('e.id = ?');
    params.push(service.assigned_employee_id);
  }
  const eligibilitySql = conditions.length
    ? `AND (${conditions.join(' OR ')})`
    : '';

  const [rows] = await pool.query(
    `SELECT e.id, e.full_name, e.employee_code, e.department_id, e.role_id,
            d.name AS department_name, r.name AS role_name,
            COUNT(g.id) AS open_guests_today
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN roles r ON r.id = e.role_id
     LEFT JOIN guests g
       ON g.assigned_employee_id = e.id
      AND g.assignment_status IN ('assigned','accepted')
      AND DATE(g.assigned_at) = CURDATE()
     WHERE e.is_active = 1
       AND e.is_approved = 1
       AND e.system_role = 'employee'
       ${eligibilitySql}
     GROUP BY e.id, e.full_name, e.employee_code, e.department_id, e.role_id,
              d.name, r.name`,
    params
  );

  const employees = rows.map((employee) => rankEmployee(employee, service, purpose));

  employees.sort(
    (a, b) =>
      b.match_score - a.match_score ||
      a.open_guests_today - b.open_guests_today ||
      a.full_name.localeCompare(b.full_name)
  );

  return { service, employees };
}

async function pickEmployeeForService(pool, serviceId) {
  const { employees } = await getEmployeeSuggestions(pool, serviceId);
  return employees.find((employee) => employee.profile_match)?.id || null;
}

module.exports = { getEmployeeSuggestions, pickEmployeeForService, rankEmployee };