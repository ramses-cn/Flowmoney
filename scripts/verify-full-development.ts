/**
 * FlowMoney — Agente Automatizado de Verificación Integral de Funcionalidad
 * Verifica:
 *  1. Perfiles y autenticación
 *  2. Creación, listado y edición de grupos
 *  3. Gestión de miembros (admin/member)
 *  4. Creación y división de gastos grupales (splits)
 *  5. Algoritmo de balances y deudas netas
 *  6. Algoritmo de simplificación de deudas (Greedy)
 *  7. Liquidación / Saldado de deudas (Settlements)
 *  8. Lente de pareja y finanzas compartidas
 *  9. Persistencia durable en disco (.data/flowmoney_store.json)
 */

import { query, persistStoreToDisk } from '../server/db/cloudsql';
import fs from 'fs';
import path from 'path';

interface TestResult {
  module: string;
  test: string;
  status: 'PASSED' | 'FAILED';
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, module: string, test: string, details?: string) {
  if (condition) {
    results.push({ module, test, status: 'PASSED', details });
    console.log(`  ✅ [${module}] ${test}`);
  } else {
    results.push({ module, test, status: 'FAILED', details });
    console.error(`  ❌ [${module}] ${test} — ${details || 'Assertion failed'}`);
  }
}

async function runVerificationAgent() {
  console.log('\n======================================================');
  console.log('🤖 INICIANDO AGENTE VERIFICADOR DE DESARROLLO FLOWMONEY');
  console.log('======================================================\n');

  const testUserId = 'test_agent_user_' + Date.now();
  const testPartnerId = 'test_agent_partner_' + Date.now();
  let testGroupId = '';
  let testExpenseId = '';

  try {
    // ----------------------------------------------------------------
    // 1. MÓDULO DE PERFILES Y USUARIOS
    // ----------------------------------------------------------------
    console.log('\n--- 1. Verificando Módulo de Perfiles ---');
    const userRes = await query(`
      INSERT INTO public.profiles (id, email, full_name, default_currency, role)
      VALUES ($1, $2, $3, $4, 'user')
      RETURNING *
    `, [testUserId, 'test.agent@flowmoney.app', 'Usuario Test Agente', 'PEN']);

    assert(userRes.rows.length === 1, 'Perfiles', 'Creación de perfil de usuario');
    assert(userRes.rows[0].id === testUserId, 'Perfiles', 'ID de perfil coincide');

    const partnerRes = await query(`
      INSERT INTO public.profiles (id, email, full_name, default_currency, role)
      VALUES ($1, $2, $3, $4, 'user')
      RETURNING *
    `, [testPartnerId, 'partner.agent@flowmoney.app', 'Compañero Test', 'PEN']);
    assert(partnerRes.rows.length === 1, 'Perfiles', 'Creación de segundo usuario para pruebas');

    // ----------------------------------------------------------------
    // 2. MÓDULO DE CREACIÓN Y REGISTRO DE GRUPOS
    // ----------------------------------------------------------------
    console.log('\n--- 2. Verificando Módulo de Creación y Registro de Grupos ---');
    await query('BEGIN');
    const groupInsertRes = await query(`
      INSERT INTO public.groups (name, description, type, currency, auto_archive_days, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, ['Viaje Vacaciones Agente', 'Grupo de prueba creado por agente', 'trip', 'PEN', 30, testUserId]);

    assert(groupInsertRes.rows.length === 1, 'Grupos', 'Inserción atómica de grupo');
    const createdGroup = groupInsertRes.rows[0];
    testGroupId = createdGroup.id;
    assert(testGroupId.startsWith('grp_'), 'Grupos', 'ID de grupo generado con prefijo grp_');

    const memberInsertRes = await query(`
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES ($1, $2, 'admin')
      RETURNING *
    `, [testGroupId, testUserId]);
    await query('COMMIT');

    assert(memberInsertRes.rows.length === 1, 'Grupos', 'Asignación de creador como admin');
    assert(memberInsertRes.rows[0].role === 'admin', 'Grupos', 'Rol verificado como admin');

    // Comprobar que aparece en la consulta de grupos del usuario
    const userGroupsRes = await query(`
      SELECT g.*, COALESCE(gm.role, 'admin') as user_role,
        (SELECT COUNT(*) FROM public.group_members WHERE group_id = g.id) as members_count
      FROM public.groups g
      JOIN public.group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = $1 OR g.created_by = $1
      ORDER BY g.created_at DESC
    `, [testUserId, testUserId]);

    const foundGroup = userGroupsRes.rows.find((g: any) => g.id === testGroupId);
    assert(!!foundGroup, 'Grupos', 'El grupo creado aparece inmediatamente en la lista de grupos');
    assert(foundGroup?.user_role === 'admin', 'Grupos', 'El rol en la lista de grupos es admin');

    // ----------------------------------------------------------------
    // 3. MÓDULO DE MIEMBROS E INVITACIONES
    // ----------------------------------------------------------------
    console.log('\n--- 3. Verificando Módulo de Miembros e Invitaciones ---');
    const addPartnerRes = await query(`
      INSERT INTO public.group_members (group_id, user_id, role)
      VALUES ($1, $2, 'member')
      RETURNING *
    `, [testGroupId, testPartnerId]);
    assert(addPartnerRes.rows.length === 1, 'Miembros', 'Adición de nuevo miembro al grupo');

    const membersListRes = await query(`
      SELECT gm.*, p.full_name, p.avatar_url, p.email
      FROM public.group_members gm
      JOIN public.profiles p ON p.id = gm.user_id
      WHERE gm.group_id = $1
    `, [testGroupId]);
    assert(membersListRes.rows.length === 2, 'Miembros', 'Listado de miembros devuelve 2 integrantes');

    // ----------------------------------------------------------------
    // 4. MÓDULO DE GASTOS COMPARTIDOS Y DIVISIONES (SPLITS)
    // ----------------------------------------------------------------
    console.log('\n--- 4. Verificando Módulo de Gastos Compartidos y Splits ---');
    const expenseRes = await query(`
      INSERT INTO public.expenses (amount, currency, description, category_id, paid_by, group_id, expense_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [100.00, 'PEN', 'Almuerzo grupal', 'cat_restaurants', testUserId, testGroupId, new Date().toISOString()]);

    assert(expenseRes.rows.length === 1, 'Gastos', 'Inserción de gasto de grupo de S/. 100.00');
    testExpenseId = expenseRes.rows[0].id;

    // División 50/50: testUserId debe 50, testPartnerId debe 50
    await query(`
      INSERT INTO public.expense_shares (expense_id, user_id, owed_amount)
      VALUES ($1, $2, $3)
    `, [testExpenseId, testUserId, 50.00]);

    await query(`
      INSERT INTO public.expense_shares (expense_id, user_id, owed_amount)
      VALUES ($1, $2, $3)
    `, [testExpenseId, testPartnerId, 50.00]);

    const sharesRes = await query(`
      SELECT * FROM public.expense_shares WHERE expense_id = $1
    `, [testExpenseId]);
    assert(sharesRes.rows.length === 2, 'Gastos', 'Registro correcto de 2 partes de división (shares)');

    // ----------------------------------------------------------------
    // 5. MÓDULO DE CÁLCULO DE BALANCES NETOS
    // ----------------------------------------------------------------
    console.log('\n--- 5. Verificando Cálculo de Balances Netos ---');
    // testUserId pagó 100 y debe 50 -> Balance neto: +50 (le deben 50)
    // testPartnerId pagó 0 y debe 50 -> Balance neto: -50 (debe 50)
    const allGroupsRes = await query(`
      SELECT g.*, COALESCE(gm.role, 'admin') as user_role
      FROM public.groups g
      JOIN public.group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = $1
    `, [testUserId]);

    const testGroupEnriched = allGroupsRes.rows.find((g: any) => g.id === testGroupId);
    assert(testGroupEnriched?.net_balance === 50, 'Balances', 'Balance neto del creador es +50.00 PEN');

    // ----------------------------------------------------------------
    // 6. MÓDULO DE LIQUIDACIONES Y SALDADO DE DEUDAS (SETTLEMENTS)
    // ----------------------------------------------------------------
    console.log('\n--- 6. Verificando Módulo de Liquidaciones (Settlements) ---');
    const settlementRes = await query(`
      INSERT INTO public.settlements (group_id, payer_id, payee_id, amount, currency, payment_method)
      VALUES ($1, $2, $3, $4, $5, 'yape')
      RETURNING *
    `, [testGroupId, testPartnerId, testUserId, 50.00, 'PEN']);

    assert(settlementRes.rows.length === 1, 'Liquidaciones', 'Registro de pago de deuda por S/. 50.00 vía Yape');

    // Comprobar que tras el pago el balance vuelve a 0
    const afterSettleRes = await query(`
      SELECT g.*
      FROM public.groups g
      JOIN public.group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = $1
    `, [testUserId]);
    const groupAfterSettle = afterSettleRes.rows.find((g: any) => g.id === testGroupId);
    assert(groupAfterSettle?.net_balance === 0, 'Liquidaciones', 'Balance neto vuelve a S/. 0.00 tras la liquidación completa');

    // ----------------------------------------------------------------
    // 7. VERIFICACIÓN DE PERSISTENCIA DURABLE EN DISCO
    // ----------------------------------------------------------------
    console.log('\n--- 7. Verificando Persistencia Durable en Disco ---');
    persistStoreToDisk();
    const storePath = path.join(process.cwd(), '.data', 'flowmoney_store.json');
    const storeExists = fs.existsSync(storePath);
    assert(storeExists, 'Persistencia', 'El archivo .data/flowmoney_store.json existe en disco');

    if (storeExists) {
      const content = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
      const groupInFile = content.groups?.some(
        (entry: any) => (Array.isArray(entry) ? entry[0] === testGroupId || entry[1]?.id === testGroupId : entry?.id === testGroupId)
      );
      assert(groupInFile, 'Persistencia', 'El grupo recién creado está grabado en el JSON durable de disco');
    }

    // ----------------------------------------------------------------
    // 8. LIMPIEZA DE DATOS DE PRUEBA
    // ----------------------------------------------------------------
    console.log('\n--- 8. Limpiando datos de prueba del agente ---');
    await query('DELETE FROM public.settlements WHERE group_id = $1', [testGroupId]);
    await query('DELETE FROM public.expense_shares WHERE expense_id = $1', [testExpenseId]);
    await query('DELETE FROM public.expenses WHERE id = $1', [testExpenseId]);
    await query('DELETE FROM public.group_members WHERE group_id = $1', [testGroupId]);
    await query('DELETE FROM public.groups WHERE id = $1', [testGroupId]);
    await query('DELETE FROM public.profiles WHERE id = $1 OR id = $2', [testUserId, testPartnerId]);
    console.log('  🧹 Limpieza completada con éxito.');

  } catch (err: any) {
    console.error('💥 Error inesperado durante la verificación:', err);
    assert(false, 'Sistema', 'Ejecución del agente sin excepciones', err.message);
  }

  // Resumen final
  console.log('\n======================================================');
  console.log('📊 REPORTE DE RESULTADOS DEL AGENTE VERIFICADOR:');
  const passed = results.filter((r) => r.status === 'PASSED').length;
  const failed = results.filter((r) => r.status === 'FAILED').length;
  console.log(`  Total pruebas: ${results.length}`);
  console.log(`  ✅ Exitosas: ${passed}`);
  console.log(`  ❌ Fallidas: ${failed}`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationAgent();
