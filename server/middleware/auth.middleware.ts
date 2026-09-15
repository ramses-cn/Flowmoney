import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken, VerifiedUser } from '../lib/firebase-admin.ts';

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
    next();
  } catch (error: any) {
    return res.status(401).json({
      error: 'Sesión no autorizada',
      message: error.message || 'Token inválido o expirado',
    });
  }
}
