import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken, VerifiedUser } from '../lib/firebase-admin.ts';
import { isMasterAdmin } from './admin.middleware.ts';
import { query } from '../db/cloudsql.ts';

// Extender el tipo de Request para incluir el usuario verificado
export interface AuthenticatedRequest extends Request {
  user?: VerifiedUser;
}

export async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No autorizado: Falta el header Authorization con formato Bearer <token>',
      });
    }

    const idToken = authHeader.split('Bearer ')[1].trim();
    if (!idToken) {
      return res.status(401).json({ error: 'No autorizado: Token vacío' });
    }

    const verifiedUser = await verifyFirebaseToken(idToken);
    req.user = verifiedUser;

    // Verificar si el usuario está suspendido o su vigencia ha expirado (excepto Master Admins)
    const isMaster = isMasterAdmin(verifiedUser);
    if (!isMaster) {
      const profRes = await query('SELECT * FROM public.profiles WHERE id = $1', [verifiedUser.uid]);
      if (profRes.rows.length > 0) {
        const userProfile = profRes.rows[0];

        // Permitir /api/profile/me para que la interfaz pueda consultar el estado y mostrar la pantalla de bloqueo
        const isSelfProfileCheck =
          req.path === '/profile/me' ||
          req.originalUrl === '/api/profile/me' ||
          req.path === '/me';

        // 1. Verificar suspensión
        if (userProfile.is_suspended && !isSelfProfileCheck) {
          return res.status(403).json({
            error: 'Acceso suspendido',
            access_status: 'suspended',
            reason:
              userProfile.suspended_reason ||
              'Tu cuenta ha sido suspendida temporalmente por el Administrador Master.',
          });
        }

        // 2. Verificar vencimiento de vigencia
        if (userProfile.access_expires_at && !isSelfProfileCheck) {
          const expTime = new Date(userProfile.access_expires_at).getTime();
          if (!isNaN(expTime) && expTime < Date.now()) {
            return res.status(403).json({
              error: 'Vigencia de acceso expirada',
              access_status: 'expired',
              access_expires_at: userProfile.access_expires_at,
              reason:
                'El periodo de vigencia de tu cuenta ha concluido. Contacta al Administrador Master para renovar tu membresía.',
            });
          }
        }
      }
    }

    next();
  } catch (error: any) {
    return res.status(401).json({
      error: 'Sesión no autorizada',
      message: error.message || 'Token inválido o expirado',
    });
  }
}
