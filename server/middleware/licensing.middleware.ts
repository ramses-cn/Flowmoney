import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware.ts';
import { query } from '../db/cloudsql.ts';

export type RequiredFeature =
  | 'scheduled_reports'
  | 'custom_alerts'
  | 'email_delivery'
  | 'excel_export'
  | 'unlimited_categories'
  | 'cloud_backup';

// Corregido (F4): Lista de features que requiere plan Pro.
// Cualquier feature en esta lista se deniega por defecto si el usuario no tiene licencia activa.
const PRO_ONLY_FEATURES: RequiredFeature[] = [
  'scheduled_reports',
  'email_delivery',
  'excel_export',
  'cloud_backup',
  'custom_alerts',
];

/**
 * Middleware para validar permisos por licencia en el backend.
 * Previene el acceso no autorizado si la cuenta no cuenta con el plan o feature requerido.
 *
 * Corregido (F4): el fallback "fail-open" original otorgaba plan Pro gratis a cualquier
 * usuario sin registro en `user_licenses`. Ahora:
 *   - Si NO hay registro de licencia: deniega features Pro, permite features free.
 *   - Si hay licencia y está activa: permite todas las features del plan.
 *   - Si hay licencia pero está expirada/suspendida: deniega todas las features Pro.
 */
export function requireFeature(feature: RequiredFeature) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) {
        return res.status(401).json({ error: 'Usuario no autenticado' });
      }

      // Consultar licencia y features asignadas al usuario
      const licRes = await query(
        'SELECT * FROM public.user_licenses WHERE user_id = $1',
        [uid]
      );

      const license = licRes.rows[0];

      // Caso 1: usuario sin registro de licencia → plan FREE por defecto
      if (!license) {
        if (PRO_ONLY_FEATURES.includes(feature)) {
          return res.status(403).json({
            error: 'Función no incluida en el plan Free',
            feature,
            message: `La característica '${feature}' requiere un plan Pro. Actualiza tu cuenta para acceder.`,
            upgrade_required: true,
          });
        }
        // Features free (unlimited_categories en Free permite hasta 20 categorías custom)
        return next();
      }

      // Caso 2: licencia expirada o suspendida
      if (license.status === 'expired' || license.status === 'suspended' || license.status === 'cancelled') {
        if (PRO_ONLY_FEATURES.includes(feature)) {
          return res.status(403).json({
            error: 'Licencia inactiva o expirada',
            message: 'Tu plan actual no permite el uso de esta función. Consulta con el administrador.',
          });
        }
        return next();
      }

      // Caso 3: licencia activa — verificar overrides por feature
      const customFeatures = license.custom_features || {};
      if (customFeatures[feature] === false) {
        return res.status(403).json({
          error: 'Función no incluida en tu licencia',
          feature,
          message: `La característica '${feature}' no está activa en tu plan actual.`,
        });
      }

      next();
    } catch (err: any) {
      console.error('[Licensing Middleware] Error validando permisos:', err);
      // Corregido (F4): en caso de error de BD, denegar por defecto en producción
      if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({
          error: 'Error verificando estado de licencia en el servidor',
          message: 'Por seguridad, se deniega el acceso hasta verificar la licencia.',
        });
      }
      // Sólo en desarrollo: permitir features free, denegar Pro
      if (PRO_ONLY_FEATURES.includes(feature)) {
        return res.status(503).json({
          error: 'No se pudo verificar la licencia (modo desarrollo)',
          feature,
        });
      }
      next();
    }
  };
}

