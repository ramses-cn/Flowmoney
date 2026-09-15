import fs from 'fs';
import path from 'path';
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from './firebase-admin.ts';
import { query } from '../db/cloudsql.ts';

export interface RealtimeEventPayload {
  type: 'expense_created' | 'expense_updated' | 'expense_deleted' | 'settlement_created' | 'members_changed' | 'group_updated';
  group_id: string;
  actor_uid: string;
  created_at?: string;
}

let firestoreDb: any = null;

function getDbInstance() {
  if (!firestoreDb) {
    try {
      initFirebaseAdmin();
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const dbId = config.firestoreDatabaseId || '(default)';
        firestoreDb = getFirestore(dbId);
      } else {
        firestoreDb = getFirestore();
      }
    } catch (err) {
      console.warn('[Realtime Server] Error al instanciar Firestore Admin:', err);
    }
  }
  return firestoreDb;
}

/**
 * Corregido (F7): obtiene los UIDs de los miembros actuales del grupo
 * para popular el campo `visible_to` del evento. Esto permite que las
 * Firestore Rules filtren eventos por membresía de grupo.
 */
async function getGroupMemberUids(groupId: string): Promise<string[]> {
  try {
    const result = await query(
      'SELECT user_id FROM public.group_members WHERE group_id = $1',
      [groupId]
    );
    return result.rows.map((r: any) => r.user_id);
  } catch (err: any) {
    console.warn('[Realtime Event] No se pudo obtener lista de miembros:', err.message);
    return [];
  }
}

/**
 * Emite un evento ligero en la colección /events de Firestore para señalización en tiempo real.
 * No bloquea la respuesta HTTP si falla, garantizando resiliencia.
 *
 * Corregido (F7): popula `visible_to` con los UIDs de los miembros del grupo
 * para que Firestore Rules pueda filtrar por membresía.
 */
export async function emitRealtimeEvent(
  event: RealtimeEventPayload,
  userToken?: string
): Promise<boolean> {
  // F7 — obtener miembros del grupo para visible_to
  const visibleTo = await getGroupMemberUids(event.group_id);
  // Asegurar que el actor siempre está incluido
  if (!visibleTo.includes(event.actor_uid)) {
    visibleTo.push(event.actor_uid);
  }

  const payload = {
    type: event.type,
    group_id: event.group_id,
    actor_uid: event.actor_uid,
    visible_to: visibleTo,  // F7 — array de UIDs miembros del grupo
    created_at: event.created_at || new Date().toISOString(),
  };

  // 1. Intentar con Firebase Admin SDK
  try {
    const adminDb = getDbInstance();
    if (adminDb) {
      await adminDb.collection('events').add(payload);
      console.log(`[Realtime Event Emitted (Admin)] ${event.type} en grupo ${event.group_id} (${visibleTo.length} miembros)`);
      return true;
    }
  } catch (adminErr: any) {
    console.warn('[Realtime Event Admin]:', adminErr.message);
  }

  // 2. Fallback con Firestore REST API
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const projectId = config.projectId;
      const dbId = config.firestoreDatabaseId || '(default)';

      const cleanToken = userToken?.startsWith('Bearer ') ? userToken.slice(7).trim() : userToken;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (cleanToken && !cleanToken.startsWith('demo-token-')) {
        headers['Authorization'] = `Bearer ${cleanToken}`;
      }

      const restUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/events?key=${config.apiKey}`;
      const restBody = {
        fields: {
          type: { stringValue: payload.type },
          group_id: { stringValue: payload.group_id },
          actor_uid: { stringValue: payload.actor_uid },
          visible_to: { arrayValue: { values: visibleTo.map((uid) => ({ stringValue: uid })) } },
          created_at: { stringValue: payload.created_at },
        },
      };

      const resp = await fetch(restUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(restBody),
      });

      if (resp.ok) {
        console.log(`[Realtime Event Emitted (REST)] ${event.type} en grupo ${event.group_id} (${visibleTo.length} miembros)`);
        return true;
      }
    }
  } catch (restErr: any) {
    console.warn('[Realtime Event REST error]:', restErr.message);
  }

  return false;
}

