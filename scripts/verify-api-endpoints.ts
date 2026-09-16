/**
 * FlowMoney — Agente Verificador de Endpoints HTTP y Flujos REST
 * Realiza peticiones HTTP reales contra el servidor local en puerto 3000
 */

interface HttpTestResult {
  endpoint: string;
  method: string;
  status: 'PASSED' | 'FAILED';
  httpStatus: number;
  message?: string;
}

const httpResults: HttpTestResult[] = [];

function recordResult(endpoint: string, method: string, passed: boolean, httpStatus: number, message?: string) {
  const status = passed ? 'PASSED' : 'FAILED';
  httpResults.push({ endpoint, method, status, httpStatus, message });
  if (passed) {
    console.log(`  ✅ [${method}] ${endpoint} (Status ${httpStatus}) — ${message || 'OK'}`);
  } else {
    console.error(`  ❌ [${method}] ${endpoint} (Status ${httpStatus}) — ${message || 'Fallo de verificación'}`);
  }
}

async function runHttpApiVerification() {
  console.log('\n======================================================');
  console.log('🌐 AGENTE DE VERIFICACIÓN DE ENDPOINTS HTTP REST (PORT 3000)');
  console.log('======================================================\n');

  const baseUrl = 'http://127.0.0.1:3000';
  const testAgentUid = `agente_ci_${Date.now()}`;
  const authToken = `demo-token-${testAgentUid}`;
  let createdGroupId = '';
  let createdExpenseId = '';

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };

  try {
    // 1. Health Check
    console.log('--- 1. Health Check ---');
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthJson = await healthRes.json().catch(() => ({}));
    recordResult('/api/health', 'GET', healthRes.status === 200 && healthJson.status === 'ok', healthRes.status);

    // 2. Registro de Usuario y Generación de Token
    console.log('\n--- 2. Autenticación & Perfil ---');
    const profileRes = await fetch(`${baseUrl}/api/profile/upsert`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        full_name: 'Agente Verificador FlowMoney',
        default_currency: 'PEN',
      }),
    });
    const profileData = await profileRes.json();
    recordResult('/api/profile/upsert', 'POST', profileRes.ok && profileData.success, profileRes.status, `Perfil sincronizado con éxito`);

    // 3. Crear Grupo vía POST /api/groups
    console.log('\n--- 3. Creación y Consulta de Grupos ---');
    const createGrpRes = await fetch(`${baseUrl}/api/groups`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Grupo Agente Finanzas',
        type: 'trip',
        currency: 'PEN',
        description: 'Grupo creado por el agente de verificación',
      }),
    });
    const createGrpData = await createGrpRes.json();
    createdGroupId = createGrpData.group?.id;
    recordResult('/api/groups', 'POST', createGrpRes.ok && !!createdGroupId, createGrpRes.status, `Grupo creado: ${createdGroupId}`);

    // 4. Listar Grupos vía GET /api/groups
    const listGrpRes = await fetch(`${baseUrl}/api/groups`, { headers: authHeaders });
    const listGrpData = await listGrpRes.json();
    const groupFound = Array.isArray(listGrpData.groups) && listGrpData.groups.some((g: any) => g.id === createdGroupId);
    recordResult('/api/groups', 'GET', listGrpRes.ok && groupFound, listGrpRes.status, `Grupo reconocido en listado con rol: ${listGrpData.groups?.[0]?.user_role}`);

    // 5. Invitar Miembro vía POST /api/groups/:id/invite
    console.log('\n--- 4. Gestión de Miembros e Invitaciones ---');
    const inviteRes = await fetch(`${baseUrl}/api/groups/${createdGroupId}/invite`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Amigo Invitado',
        email: `invitado_${Date.now()}@gmail.com`,
        role: 'member',
      }),
    });
    const inviteData = await inviteRes.json();
    recordResult(`/api/groups/${createdGroupId}/invite`, 'POST', inviteRes.ok, inviteRes.status, inviteData.message);

    // 6. Consultar Miembros vía GET /api/groups/:id/members
    const membersRes = await fetch(`${baseUrl}/api/groups/${createdGroupId}/members`, { headers: authHeaders });
    const membersData = await membersRes.json();
    recordResult(`/api/groups/${createdGroupId}/members`, 'GET', membersRes.ok && membersData.members?.length >= 1, membersRes.status, `Total miembros/participantes: ${membersData.members?.length}`);

    // 7. Crear Gasto Grupal vía POST /api/expenses
    console.log('\n--- 5. Gastos y División de Cuentas ---');
    const createExpRes = await fetch(`${baseUrl}/api/expenses`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        amount: 80.00,
        currency: 'PEN',
        description: 'Cena de equipo agente',
        categoryId: 'cat_restaurants',
        groupId: createdGroupId,
        lens: 'group',
        expenseDate: new Date().toISOString().slice(0, 10),
      }),
    });
    const createExpData = await createExpRes.json();
    createdExpenseId = createExpData.expense?.id;
    recordResult('/api/expenses', 'POST', createExpRes.ok && !!createdExpenseId, createExpRes.status, `Gasto registrado: S/. 80.00`);

    // 8. Consultar Balances del Grupo vía GET /api/groups/:id/balances
    console.log('\n--- 6. Balances y Simplificación ---');
    const balancesRes = await fetch(`${baseUrl}/api/groups/${createdGroupId}/balances`, { headers: authHeaders });
    const balancesData = await balancesRes.json();
    recordResult(`/api/groups/${createdGroupId}/balances`, 'GET', balancesRes.ok && Array.isArray(balancesData.balances), balancesRes.status, `Balances calculados exitosamente`);

    // 9. Endpoint Greedy de Simplificación de Deudas
    const simplifyRes = await fetch(`${baseUrl}/api/groups/${createdGroupId}/simplify-debts`, {
      method: 'POST',
      headers: authHeaders,
    });
    const simplifyData = await simplifyRes.json();
    recordResult(`/api/groups/${createdGroupId}/simplify-debts`, 'POST', simplifyRes.ok, simplifyRes.status, `Transacciones mínimas calculadas: ${simplifyData.simplified_transactions?.length ?? 0}`);

    // 10. Dashboard Lenses (Personal, Grupos, Pareja)
    console.log('\n--- 7. Lentes del Dashboard (Personal, Grupos, Pareja) ---');
    const dashPersonalRes = await fetch(`${baseUrl}/api/dashboard?lens=personal`, { headers: authHeaders });
    recordResult('/api/dashboard?lens=personal', 'GET', dashPersonalRes.ok, dashPersonalRes.status, 'Lente personal cargado');

    const dashGroupsRes = await fetch(`${baseUrl}/api/dashboard?lens=groups`, { headers: authHeaders });
    recordResult('/api/dashboard?lens=groups', 'GET', dashGroupsRes.ok, dashGroupsRes.status, 'Lente de grupos cargado');

    const dashCoupleRes = await fetch(`${baseUrl}/api/dashboard?lens=couple`, { headers: authHeaders });
    recordResult('/api/dashboard?lens=couple', 'GET', dashCoupleRes.ok, dashCoupleRes.status, 'Lente de pareja cargado');

  } catch (err: any) {
    console.error('💥 Excepción en llamada HTTP:', err);
    recordResult('HTTP Exception', 'NET', false, 500, err.message);
  }

  // Resumen
  console.log('\n======================================================');
  console.log('📊 REPORTE DE VERIFICACIÓN DE ENDPOINTS HTTP:');
  const passed = httpResults.filter((r) => r.status === 'PASSED').length;
  const failed = httpResults.filter((r) => r.status === 'FAILED').length;
  console.log(`  Total endpoints probados: ${httpResults.length}`);
  console.log(`  ✅ Exitosos: ${passed}`);
  console.log(`  ❌ Fallidos: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHttpApiVerification();
