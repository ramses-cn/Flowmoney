import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore.ts';
import {
  ShieldAlert,
  Users,
  Link,
  Copy,
  Check,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  X,
  Lock,
  UserCheck,
  Sparkles,
  Calendar,
  Clock,
  Ban,
  AlertTriangle,
  Infinity,
  CheckCircle2,
  CalendarDays,
} from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  default_currency: string;
  created_at: string;
  is_master_admin: boolean;
  is_suspended?: boolean;
  suspended_reason?: string | null;
  access_expires_at?: string | null;
  access_status?: 'active' | 'suspended' | 'expired';
  days_remaining?: number | null;
  stats: {
    groups_count: number;
    expenses_count: number;
    total_spent: number;
    accounts_count: number;
    total_balance: number;
  };
}

interface AdminInvite {
  id: string;
  group_id: string;
  group_name: string;
  group_type: string;
  email: string;
  role: string;
  status: string;
  invite_code: string;
  invite_link: string;
  invited_by_name: string;
  created_at: string;
}

interface AdminGroup {
  id: string;
  name: string;
  type: string;
  currency: string;
  members_count: number;
}

interface MasterAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MasterAdminModal: React.FC<MasterAdminModalProps> = ({ isOpen, onClose }) => {
  const { token, profile } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'users' | 'invites'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [summaryStats, setSummaryStats] = useState({ total: 0, active: 0, suspended: 0, expired: 0 });
  const [invitations, setInvitations] = useState<AdminInvite[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filtro de usuarios
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended' | 'expired'>('all');

  // Modales de acciones de usuario
  const [userForValidity, setUserForValidity] = useState<AdminUser | null>(null);
  const [validityMode, setValidityMode] = useState<'presets' | 'custom' | 'permanent'>('presets');
  const [customValidityDate, setCustomValidityDate] = useState('');
  const [isSavingValidity, setIsSavingValidity] = useState(false);

  const [userForSuspend, setUserForSuspend] = useState<AdminUser | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isSavingSuspend, setIsSavingSuspend] = useState(false);

  const [userForDelete, setUserForDelete] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Formulario de nueva invitación/código
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteGroupId, setNewInviteGroupId] = useState('');
  const [newInviteRole, setNewInviteRole] = useState<'member' | 'admin'>('member');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [usersRes, invitesRes, groupsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/invitations', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/groups', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData.users || []);
        if (uData.summary) {
          setSummaryStats(uData.summary);
        }
      }
      if (invitesRes.ok) {
        const iData = await invitesRes.json();
        setInvitations(iData.invitations || []);
      }
      if (groupsRes.ok) {
        const gData = await groupsRes.json();
        setGroups(gData.groups || []);
        if (gData.groups && gData.groups.length > 0 && !newInviteGroupId) {
          setNewInviteGroupId(gData.groups[0].id);
        }
      }
    } catch (err) {
      console.error('Error cargando datos de Master Admin:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Guardar vigencia de acceso
  const handleSaveValidity = async (days?: number) => {
    if (!userForValidity) return;
    setIsSavingValidity(true);
    setActionFeedback(null);
    setActionError(null);

    try {
      let expiresAt: string | null = null;
      if (days !== undefined) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        expiresAt = d.toISOString();
      } else if (validityMode === 'custom' && customValidityDate) {
        const [year, month, day] = customValidityDate.split('-').map(Number);
        const d = new Date(year, month - 1, day, 23, 59, 59);
        expiresAt = d.toISOString();
      } else if (validityMode === 'permanent') {
        expiresAt = null;
      }

      const res = await fetch(`/api/admin/users/${userForValidity.id}/access`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          access_expires_at: expiresAt,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar vigencia');

      setActionFeedback(
        expiresAt
          ? `Vigencia de ${userForValidity.full_name || userForValidity.email} establecida hasta el ${new Date(expiresAt).toLocaleDateString('es-PE')}`
          : `Acceso permanente concedido a ${userForValidity.full_name || userForValidity.email}`
      );
      setUserForValidity(null);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Error al actualizar vigencia');
    } finally {
      setIsSavingValidity(false);
    }
  };

  // Cambiar estado de suspensión
  const handleToggleSuspend = async (targetUser: AdminUser, shouldSuspend: boolean, reason?: string) => {
    setIsSavingSuspend(true);
    setActionFeedback(null);
    setActionError(null);

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/access`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_suspended: shouldSuspend,
          suspended_reason: shouldSuspend ? reason || 'Suspendido por el Administrador Master' : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar estado');

      setActionFeedback(
        shouldSuspend
          ? `El usuario ${targetUser.full_name || targetUser.email} ha sido suspendido.`
          : `El acceso de ${targetUser.full_name || targetUser.email} ha sido reactivado.`
      );
      setUserForSuspend(null);
      setSuspendReason('');
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Error al modificar suspensión');
    } finally {
      setIsSavingSuspend(false);
    }
  };

  // Eliminar permanentemente un usuario
  const handleConfirmDeleteUser = async () => {
    if (!userForDelete) return;
    setIsDeletingUser(true);
    setActionFeedback(null);
    setActionError(null);

    try {
      const res = await fetch(`/api/admin/users/${userForDelete.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario');

      setActionFeedback(data.message || `Usuario ${userForDelete.full_name} eliminado correctamente.`);
      setUserForDelete(null);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Error al eliminar usuario');
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleGenerateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInviteEmail || !newInviteGroupId) return;
    setIsSubmittingInvite(true);
    setActionFeedback(null);
    setActionError(null);

    try {
      const res = await fetch('/api/admin/generate-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: newInviteEmail.trim(),
          group_id: newInviteGroupId,
          role: newInviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al generar código/enlace');
      }

      setActionFeedback(`Código generado con éxito: ${data.invitation.invite_code}`);
      setNewInviteEmail('');
      setShowCreateInvite(false);
      await loadData();
    } catch (err: any) {
      setActionError(err.message || 'Error al generar código');
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    try {
      const res = await fetch(`/api/admin/invitations/${inviteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== inviteId));
        setActionFeedback('Invitación eliminada correctamente.');
      }
    } catch (err) {
      console.error('Error al eliminar invitación:', err);
    }
  };

  if (!isOpen) return null;

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      u.email.toLowerCase().includes(q) ||
      u.full_name.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (userStatusFilter === 'active') return u.access_status === 'active' && !u.is_suspended;
    if (userStatusFilter === 'suspended') return !!u.is_suspended;
    if (userStatusFilter === 'expired') return u.access_status === 'expired';

    return true;
  });

  return (
    <div
      id="master-admin-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 animate-fade-in"
      style={{
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        id="master-admin-modal-container"
        className="w-full max-w-5xl h-[92vh] max-h-[860px] rounded-[24px] overflow-hidden flex flex-col shadow-2xl border transition-all"
        style={{
          background: 'var(--ios-bg-elevated)',
          borderColor: 'var(--ios-separator)',
          color: 'var(--ios-label)',
        }}
      >
        {/* Cabecera Master Admin */}
        <div
          className="p-5 sm:p-6 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--ios-separator)', background: 'var(--ios-bg-secondary)' }}
        >
          <div className="flex items-center space-x-3">
            <div
              className="w-11 h-11 rounded-[14px] flex items-center justify-center shadow-md text-white"
              style={{ background: 'linear-gradient(135deg, #FF9500, #FF3B30)' }}
            >
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-[19px] font-bold tracking-tight">Panel Master Admin</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  Exclusivo
                </span>
              </div>
              <p className="text-[13px]" style={{ color: 'var(--ios-label-secondary)' }}>
                Control integral de vigencia, suspensión, eliminación y enlaces de vinculación
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadData}
              title="Actualizar datos"
              className="p-2 rounded-xl border transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
              style={{ borderColor: 'var(--ios-separator)', color: 'var(--ios-label-secondary)' }}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl border transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
              style={{ borderColor: 'var(--ios-separator)', color: 'var(--ios-label)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notificaciones y feedback */}
        {actionFeedback && (
          <div className="px-6 py-2.5 bg-emerald-500/15 border-b border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>{actionFeedback}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {actionError && (
          <div className="px-6 py-2.5 bg-rose-500/15 border-b border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{actionError}</span>
            </div>
            <button onClick={() => setActionError(null)} className="opacity-70 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Selector de pestañas */}
        <div
          className="px-6 pt-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--ios-separator)' }}
        >
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('users')}
              className={`pb-3 px-3 text-[14px] font-semibold border-b-2 flex items-center space-x-2 transition-all ${
                activeTab === 'users'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Administración de Usuarios ({users.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('invites')}
              className={`pb-3 px-3 text-[14px] font-semibold border-b-2 flex items-center space-x-2 transition-all ${
                activeTab === 'invites'
                  ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Link className="w-4 h-4" />
              <span>Enlaces y Códigos ({invitations.length})</span>
            </button>
          </div>

          {activeTab === 'invites' && (
            <button
              type="button"
              onClick={() => setShowCreateInvite(!showCreateInvite)}
              className="mb-2 py-1.5 px-3 rounded-[10px] text-xs font-semibold flex items-center space-x-1.5 transition-all text-white active:scale-95 shadow-sm"
              style={{ background: 'var(--ios-blue)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nuevo Enlace / Código</span>
            </button>
          )}
        </div>

        {/* Formulario desplegable para generar código / invitación */}
        {showCreateInvite && activeTab === 'invites' && (
          <form
            onSubmit={handleGenerateInvite}
            className="p-4 mx-6 mt-4 rounded-[16px] border space-y-3 animate-fade-in"
            style={{
              background: 'var(--ios-bg-secondary)',
              borderColor: 'var(--ios-separator)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Generar Código y Enlace de Vinculación
              </span>
              <button
                type="button"
                onClick={() => setShowCreateInvite(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium block mb-1 opacity-70">Email del Usuario</label>
                <input
                  type="email"
                  required
                  placeholder="usuario@ejemplo.com"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-[10px] text-xs border outline-none transition-all"
                  style={{
                    background: 'var(--ios-bg-primary)',
                    borderColor: 'var(--ios-separator)',
                    color: 'var(--ios-label)',
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] font-medium block mb-1 opacity-70">Grupo a Vincular</label>
                <select
                  value={newInviteGroupId}
                  onChange={(e) => setNewInviteGroupId(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-[10px] text-xs border outline-none"
                  style={{
                    background: 'var(--ios-bg-primary)',
                    borderColor: 'var(--ios-separator)',
                    color: 'var(--ios-label)',
                  }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.members_count} miembros)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium block mb-1 opacity-70">Rol en Grupo</label>
                <select
                  value={newInviteRole}
                  onChange={(e) => setNewInviteRole(e.target.value as any)}
                  className="w-full h-9 px-2.5 rounded-[10px] text-xs border outline-none"
                  style={{
                    background: 'var(--ios-bg-primary)',
                    borderColor: 'var(--ios-separator)',
                    color: 'var(--ios-label)',
                  }}
                >
                  <option value="member">Miembro Estándar</option>
                  <option value="admin">Co-Administrador</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={isSubmittingInvite}
                className="py-1.5 px-4 rounded-[10px] text-xs font-semibold text-white transition-transform active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #FF9500, #FF3B30)' }}
              >
                {isSubmittingInvite ? 'Generando...' : 'Crear Código y Enlace'}
              </button>
            </div>
          </form>
        )}

        {/* Contenido principal scrollable */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {/* VISTA 1: GESTIÓN DE USUARIOS CON VIGENCIA, SUSPENSIÓN Y ELIMINACIÓN */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Tarjetas resumen de estado */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  onClick={() => setUserStatusFilter('all')}
                  className={`p-3.5 rounded-[16px] border cursor-pointer transition-all ${
                    userStatusFilter === 'all' ? 'ring-2 ring-amber-500 shadow-sm' : 'hover:opacity-90'
                  }`}
                  style={{ background: 'var(--ios-bg-secondary)', borderColor: 'var(--ios-separator)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium opacity-70">Total Usuarios</span>
                    <Users className="w-4 h-4 text-amber-500" />
                  </div>
                  <p className="text-xl font-bold">{summaryStats.total || users.length}</p>
                </div>

                <div
                  onClick={() => setUserStatusFilter('active')}
                  className={`p-3.5 rounded-[16px] border cursor-pointer transition-all ${
                    userStatusFilter === 'active' ? 'ring-2 ring-emerald-500 shadow-sm' : 'hover:opacity-90'
                  }`}
                  style={{ background: 'var(--ios-bg-secondary)', borderColor: 'var(--ios-separator)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium opacity-70">Activos / Vigentes</span>
                    <UserCheck className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {summaryStats.active}
                  </p>
                </div>

                <div
                  onClick={() => setUserStatusFilter('suspended')}
                  className={`p-3.5 rounded-[16px] border cursor-pointer transition-all ${
                    userStatusFilter === 'suspended' ? 'ring-2 ring-rose-500 shadow-sm' : 'hover:opacity-90'
                  }`}
                  style={{ background: 'var(--ios-bg-secondary)', borderColor: 'var(--ios-separator)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium opacity-70">Suspendidos</span>
                    <Ban className="w-4 h-4 text-rose-500" />
                  </div>
                  <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
                    {summaryStats.suspended}
                  </p>
                </div>

                <div
                  onClick={() => setUserStatusFilter('expired')}
                  className={`p-3.5 rounded-[16px] border cursor-pointer transition-all ${
                    userStatusFilter === 'expired' ? 'ring-2 ring-orange-500 shadow-sm' : 'hover:opacity-90'
                  }`}
                  style={{ background: 'var(--ios-bg-secondary)', borderColor: 'var(--ios-separator)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium opacity-70">Vencidos / Expirados</span>
                    <Clock className="w-4 h-4 text-orange-500" />
                  </div>
                  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    {summaryStats.expired}
                  </p>
                </div>
              </div>

              {/* Barra de búsqueda y selector de filtros */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div
                  className="flex items-center px-3.5 py-2 rounded-[12px] border w-full sm:max-w-md"
                  style={{
                    background: 'var(--ios-bg-secondary)',
                    borderColor: 'var(--ios-separator)',
                  }}
                >
                  <Search className="w-4 h-4 opacity-50 mr-2.5 shrink-0" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, correo electrónico o UID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent border-none outline-none text-xs w-full"
                    style={{ color: 'var(--ios-label)' }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="opacity-50 hover:opacity-100">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filtros rápidos */}
                <div className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setUserStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      userStatusFilter === 'all'
                        ? 'bg-amber-500 text-white'
                        : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                    }`}
                  >
                    Todos ({users.length})
                  </button>
                  <button
                    onClick={() => setUserStatusFilter('active')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      userStatusFilter === 'active'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                    }`}
                  >
                    Activos ({summaryStats.active})
                  </button>
                  <button
                    onClick={() => setUserStatusFilter('suspended')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      userStatusFilter === 'suspended'
                        ? 'bg-rose-500 text-white'
                        : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                    }`}
                  >
                    Suspendidos ({summaryStats.suspended})
                  </button>
                  <button
                    onClick={() => setUserStatusFilter('expired')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      userStatusFilter === 'expired'
                        ? 'bg-orange-500 text-white'
                        : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                    }`}
                  >
                    Vencidos ({summaryStats.expired})
                  </button>
                </div>
              </div>

              {/* Lista de tarjetas de usuarios enriquecidas */}
              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center rounded-[18px] border" style={{ borderColor: 'var(--ios-separator)' }}>
                  <Users className="w-10 h-10 mx-auto mb-2 text-slate-400 opacity-50" />
                  <p className="text-sm font-semibold">No se encontraron usuarios con ese criterio</p>
                  <p className="text-xs text-slate-400 mt-1">Prueba cambiando el filtro o la búsqueda</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === profile?.id;
                    const isSuspended = !!u.is_suspended;
                    const isExpired = u.access_status === 'expired';
                    const daysRemaining = typeof u.days_remaining === 'number' ? u.days_remaining : null;

                    return (
                      <div
                        key={u.id}
                        className={`p-4 rounded-[20px] border space-y-3.5 transition-all hover:shadow-md ${
                          isSuspended
                            ? 'border-rose-500/40 bg-rose-500/5'
                            : isExpired
                            ? 'border-orange-500/40 bg-orange-500/5'
                            : ''
                        }`}
                        style={{
                          background: isSuspended || isExpired ? undefined : 'var(--ios-bg-secondary)',
                          borderColor: isSuspended || isExpired ? undefined : 'var(--ios-separator)',
                        }}
                      >
                        {/* Cabecera del usuario */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3 min-w-0">
                            <div
                              className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 overflow-hidden shadow-sm"
                              style={{
                                background: u.is_master_admin
                                  ? 'linear-gradient(135deg, #FF9500, #FF3B30)'
                                  : isSuspended
                                  ? '#E11D48'
                                  : isExpired
                                  ? '#EA580C'
                                  : 'linear-gradient(135deg, var(--ios-blue), var(--ios-indigo))',
                              }}
                            >
                              {u.avatar_url ? (
                                <img src={u.avatar_url} alt={u.full_name} className="w-full h-full object-cover" />
                              ) : (
                                u.full_name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                <h4 className="text-sm font-bold truncate">{u.full_name}</h4>
                                {u.is_master_admin && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-600 dark:text-amber-400">
                                    Master
                                  </span>
                                )}
                                {isSelf && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <p className="text-xs truncate opacity-70">{u.email}</p>
                            </div>
                          </div>

                          {/* Badge de Estado del usuario */}
                          <div className="flex items-center space-x-1.5">
                            {isSuspended ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-500/20 text-rose-600 dark:text-rose-400">
                                <Ban className="w-3 h-3" />
                                <span>Suspendido</span>
                              </span>
                            ) : isExpired ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-500/20 text-orange-600 dark:text-orange-400">
                                <Clock className="w-3 h-3" />
                                <span>Vencido</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Activo</span>
                              </span>
                            )}

                            <button
                              onClick={() => handleCopy(u.id, u.id)}
                              title="Copiar UID de Firebase"
                              className="p-1 rounded-lg border text-xs flex items-center transition-colors hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                              style={{ borderColor: 'var(--ios-separator)' }}
                            >
                              {copiedId === u.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Bloque de Vigencia de Acceso */}
                        <div
                          className="p-2.5 rounded-[12px] border flex items-center justify-between"
                          style={{
                            background: 'var(--ios-bg-primary)',
                            borderColor: 'var(--ios-separator)',
                          }}
                        >
                          <div className="min-w-0 flex items-center space-x-2">
                            <CalendarDays className="w-4 h-4 text-amber-500 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-[10px] font-semibold opacity-60 block uppercase">
                                Vigencia de Acceso
                              </span>
                              <div className="flex items-center space-x-1.5 text-xs font-bold truncate">
                                {u.access_expires_at ? (
                                  <>
                                    <span>
                                      {new Date(u.access_expires_at).toLocaleDateString('es-PE', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                      })}
                                    </span>
                                    {daysRemaining !== null && (
                                      <span
                                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                          daysRemaining > 5
                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                            : daysRemaining > 0
                                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                        }`}
                                      >
                                        {daysRemaining > 0
                                          ? `(en ${daysRemaining} d)`
                                          : `(venció hace ${Math.abs(daysRemaining)} d)`}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                                    <Infinity className="w-3.5 h-3.5 mr-1" />
                                    <span>Permanente (Sin límite)</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {!u.is_master_admin && (
                            <button
                              type="button"
                              onClick={() => {
                                setUserForValidity(u);
                                if (u.access_expires_at) {
                                  setCustomValidityDate(u.access_expires_at.split('T')[0]);
                                  setValidityMode('custom');
                                } else {
                                  setValidityMode('presets');
                                }
                              }}
                              className="py-1 px-2.5 rounded-[8px] text-[11px] font-semibold border flex items-center space-x-1 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all text-amber-600 dark:text-amber-400 shrink-0"
                              style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
                            >
                              <Calendar className="w-3 h-3" />
                              <span>Vigencia</span>
                            </button>
                          )}
                        </div>

                        {/* Motivo de suspensión si existe */}
                        {isSuspended && u.suspended_reason && (
                          <div className="p-2 rounded-[10px] bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-700 dark:text-rose-300">
                            <span className="font-semibold">Motivo de suspensión: </span>
                            {u.suspended_reason}
                          </div>
                        )}

                        {/* Estadísticas de actividad del usuario */}
                        <div
                          className="grid grid-cols-3 gap-2 p-2.5 rounded-[12px] text-center"
                          style={{ background: 'var(--ios-bg-primary)' }}
                        >
                          <div>
                            <p className="text-[10px] opacity-60">Grupos</p>
                            <p className="text-xs font-bold">{u.stats.groups_count}</p>
                          </div>
                          <div>
                            <p className="text-[10px] opacity-60">Gastos Reg.</p>
                            <p className="text-xs font-bold">{u.stats.expenses_count}</p>
                          </div>
                          <div>
                            <p className="text-[10px] opacity-60">Total Gastado</p>
                            <p className="text-xs font-bold truncate">
                              {u.default_currency} {u.stats.total_spent.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        {/* Barra de Acciones Administrativas */}
                        <div className="flex items-center justify-between pt-1 border-t" style={{ borderColor: 'var(--ios-separator)' }}>
                          <span className="text-[11px] opacity-60">
                            Reg: {new Date(u.created_at).toLocaleDateString('es-PE')}
                          </span>

                          <div className="flex items-center space-x-1.5">
                            {/* Botón Suspender / Reactivar */}
                            {!u.is_master_admin ? (
                              isSuspended ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSuspend(u, false)}
                                  className="py-1 px-2.5 rounded-[8px] text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 transition-all flex items-center space-x-1 active:scale-95"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  <span>Reactivar</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserForSuspend(u);
                                    setSuspendReason('');
                                  }}
                                  className="py-1 px-2.5 rounded-[8px] text-[11px] font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 transition-all flex items-center space-x-1 active:scale-95"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>Suspender</span>
                                </button>
                              )
                            ) : null}

                            {/* Botón Eliminar Usuario */}
                            {!u.is_master_admin && !isSelf && (
                              <button
                                type="button"
                                onClick={() => setUserForDelete(u)}
                                title="Eliminar permanentemente usuario del sistema"
                                className="py-1 px-2 rounded-[8px] text-[11px] font-semibold text-rose-500 hover:bg-rose-500/15 transition-all flex items-center space-x-1 active:scale-95"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VISTA 2: ENLACES Y CÓDIGOS DE VINCULACIÓN */}
          {activeTab === 'invites' && (
            <div className="space-y-4">
              <div
                className="p-4 rounded-[16px] border flex items-center justify-between"
                style={{
                  background: 'rgba(255, 149, 0, 0.08)',
                  borderColor: 'rgba(255, 149, 0, 0.25)',
                }}
              >
                <div className="flex items-center space-x-3">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <div className="text-xs">
                    <span className="font-bold text-amber-700 dark:text-amber-400 block">
                      Vinculación instantánea
                    </span>
                    <span className="opacity-80">
                      Copia el código o enlace directo para enviárselo a los usuarios principales y unirlos a sus grupos.
                    </span>
                  </div>
                </div>
              </div>

              {invitations.length === 0 ? (
                <div className="p-8 text-center rounded-[18px] border" style={{ borderColor: 'var(--ios-separator)' }}>
                  <Link className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-semibold">No hay enlaces ni códigos activos</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pulsa en "Nuevo Enlace / Código" arriba para generar uno
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invitations.map((inv) => {
                    const fullInviteLink = `${window.location.origin}${inv.invite_link}`;
                    return (
                      <div
                        key={inv.id}
                        className="p-4 rounded-[18px] border space-y-3 transition-all hover:shadow-sm"
                        style={{
                          background: 'var(--ios-bg-secondary)',
                          borderColor: 'var(--ios-separator)',
                        }}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm">{inv.email}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/15 text-blue-600 dark:text-blue-400">
                                Rol: {inv.role}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                {inv.status}
                              </span>
                            </div>
                            <p className="text-xs opacity-70 mt-0.5">
                              Asignado al grupo: <span className="font-semibold">{inv.group_name}</span>
                            </p>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteInvite(inv.id)}
                              title="Cancelar y eliminar invitación"
                              className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Códigos y Enlace Copiable */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {/* Código alfanumérico */}
                          <div
                            className="p-2.5 rounded-[12px] flex items-center justify-between"
                            style={{ background: 'var(--ios-bg-primary)' }}
                          >
                            <div className="min-w-0">
                              <span className="text-[10px] opacity-60 block">CÓDIGO DE ACCESO</span>
                              <span className="font-mono text-xs font-bold tracking-wider text-amber-600 dark:text-amber-400">
                                {inv.invite_code}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(inv.invite_code, `code-${inv.id}`)}
                              className="p-1.5 rounded-lg border text-xs flex items-center space-x-1 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                              style={{ borderColor: 'var(--ios-separator)' }}
                            >
                              {copiedId === `code-${inv.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </div>

                          {/* Enlace directo */}
                          <div
                            className="p-2.5 rounded-[12px] flex items-center justify-between"
                            style={{ background: 'var(--ios-bg-primary)' }}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="text-[10px] opacity-60 block">ENLACE DIRECTO</span>
                              <span className="text-xs truncate block opacity-80" title={fullInviteLink}>
                                {fullInviteLink}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopy(fullInviteLink, `link-${inv.id}`)}
                              className="p-1.5 rounded-lg border text-xs flex items-center space-x-1 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 shrink-0"
                              style={{ borderColor: 'var(--ios-separator)' }}
                            >
                              {copiedId === `link-${inv.id}` ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* SUBMODAL 1: GESTIÓN DE VIGENCIA */}
        {userForValidity && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          >
            <div
              className="w-full max-w-md rounded-[20px] p-5 shadow-2xl border space-y-4"
              style={{
                background: 'var(--ios-bg-elevated)',
                borderColor: 'var(--ios-separator)',
                color: 'var(--ios-label)',
              }}
            >
              <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--ios-separator)' }}>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-amber-500" />
                  <h3 className="font-bold text-base">Administrar Vigencia de Acceso</h3>
                </div>
                <button
                  onClick={() => setUserForValidity(null)}
                  className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs opacity-75">
                Modificando el tiempo de vigencia para:{' '}
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {userForValidity.full_name} ({userForValidity.email})
                </span>
              </div>

              {/* Botones de Presets Rápidos */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-2 opacity-70">
                  Opciones Rápidas (+ Días a partir de hoy)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isSavingValidity}
                    onClick={() => handleSaveValidity(7)}
                    className="p-2 rounded-[10px] text-xs font-semibold border hover:bg-amber-500/10 hover:border-amber-500 active:scale-95 transition-all text-center"
                    style={{ borderColor: 'var(--ios-separator)' }}
                  >
                    +7 Días
                  </button>
                  <button
                    type="button"
                    disabled={isSavingValidity}
                    onClick={() => handleSaveValidity(15)}
                    className="p-2 rounded-[10px] text-xs font-semibold border hover:bg-amber-500/10 hover:border-amber-500 active:scale-95 transition-all text-center"
                    style={{ borderColor: 'var(--ios-separator)' }}
                  >
                    +15 Días
                  </button>
                  <button
                    type="button"
                    disabled={isSavingValidity}
                    onClick={() => handleSaveValidity(30)}
                    className="p-2 rounded-[10px] text-xs font-semibold border hover:bg-amber-500/10 hover:border-amber-500 active:scale-95 transition-all text-center bg-amber-500/5 text-amber-600 dark:text-amber-400"
                    style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}
                  >
                    +30 Días (1 mes)
                  </button>
                  <button
                    type="button"
                    disabled={isSavingValidity}
                    onClick={() => handleSaveValidity(90)}
                    className="p-2 rounded-[10px] text-xs font-semibold border hover:bg-amber-500/10 hover:border-amber-500 active:scale-95 transition-all text-center"
                    style={{ borderColor: 'var(--ios-separator)' }}
                  >
                    +90 Días (3 meses)
                  </button>
                  <button
                    type="button"
                    disabled={isSavingValidity}
                    onClick={() => handleSaveValidity(180)}
                    className="p-2 rounded-[10px] text-xs font-semibold border hover:bg-amber-500/10 hover:border-amber-500 active:scale-95 transition-all text-center"
                    style={{ borderColor: 'var(--ios-separator)' }}
                  >
                    +6 Meses
                  </button>
                  <button
                    type="button"
                    disabled={isSavingValidity}
                    onClick={() => handleSaveValidity(365)}
                    className="p-2 rounded-[10px] text-xs font-semibold border hover:bg-amber-500/10 hover:border-amber-500 active:scale-95 transition-all text-center"
                    style={{ borderColor: 'var(--ios-separator)' }}
                  >
                    +1 Año
                  </button>
                </div>
              </div>

              {/* Opción Permanente */}
              <div className="pt-1">
                <button
                  type="button"
                  disabled={isSavingValidity}
                  onClick={() => handleSaveValidity(undefined)}
                  className="w-full py-2 px-3 rounded-[12px] border text-xs font-semibold flex items-center justify-center space-x-2 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 transition-all"
                  style={{ borderColor: 'rgba(16, 185, 129, 0.3)' }}
                >
                  <Infinity className="w-4 h-4" />
                  <span>Conceder Acceso Permanente (Sin Expiración)</span>
                </button>
              </div>

              {/* Selector de fecha personalizada */}
              <div className="pt-2 border-t" style={{ borderColor: 'var(--ios-separator)' }}>
                <label className="text-[11px] font-bold uppercase tracking-wider block mb-1.5 opacity-70">
                  O fijar fecha exacta de vencimiento:
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={customValidityDate}
                    onChange={(e) => {
                      setCustomValidityDate(e.target.value);
                      setValidityMode('custom');
                    }}
                    className="flex-1 h-9 px-3 rounded-[10px] text-xs border outline-none"
                    style={{
                      background: 'var(--ios-bg-primary)',
                      borderColor: 'var(--ios-separator)',
                      color: 'var(--ios-label)',
                    }}
                  />
                  <button
                    type="button"
                    disabled={!customValidityDate || isSavingValidity}
                    onClick={() => handleSaveValidity()}
                    className="h-9 px-4 rounded-[10px] text-xs font-semibold text-white transition-all disabled:opacity-50"
                    style={{ background: 'var(--ios-blue)' }}
                  >
                    {isSavingValidity ? 'Guardando...' : 'Aplicar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBMODAL 2: SUSPENDER ACCESO */}
        {userForSuspend && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div
              className="w-full max-w-md rounded-[20px] p-5 shadow-2xl border space-y-4"
              style={{
                background: 'var(--ios-bg-elevated)',
                borderColor: 'var(--ios-separator)',
                color: 'var(--ios-label)',
              }}
            >
              <div className="flex items-center space-x-3 text-rose-500">
                <div className="p-2.5 rounded-full bg-rose-500/15">
                  <Ban className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-rose-600 dark:text-rose-400">
                    Suspender Acceso de Usuario
                  </h3>
                  <p className="text-xs opacity-70">Bloqueará el uso de la aplicación temporalmente</p>
                </div>
              </div>

              <p className="text-xs leading-relaxed">
                ¿Estás seguro de suspender a{' '}
                <span className="font-bold">{userForSuspend.full_name} ({userForSuspend.email})</span>? El
                usuario no podrá registrar gastos ni interactuar con los grupos hasta que lo reactives.
              </p>

              <div>
                <label className="text-[11px] font-medium block mb-1 opacity-70">
                  Motivo de la suspensión (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Membresía pendiente, verificación requerida..."
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full h-9 px-3 rounded-[10px] text-xs border outline-none"
                  style={{
                    background: 'var(--ios-bg-primary)',
                    borderColor: 'var(--ios-separator)',
                    color: 'var(--ios-label)',
                  }}
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserForSuspend(null)}
                  className="px-4 py-2 rounded-[10px] text-xs font-semibold border hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ borderColor: 'var(--ios-separator)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSavingSuspend}
                  onClick={() => handleToggleSuspend(userForSuspend, true, suspendReason)}
                  className="px-4 py-2 rounded-[10px] text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSavingSuspend ? 'Suspendiendo...' : 'Confirmar Suspensión'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUBMODAL 3: ELIMINAR USUARIO PERMANENTEMENTE */}
        {userForDelete && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div
              className="w-full max-w-md rounded-[20px] p-5 shadow-2xl border space-y-4"
              style={{
                background: 'var(--ios-bg-elevated)',
                borderColor: 'var(--ios-separator)',
                color: 'var(--ios-label)',
              }}
            >
              <div className="flex items-center space-x-3 text-rose-500">
                <div className="p-2.5 rounded-full bg-rose-500/15">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-rose-600 dark:text-rose-400">
                    Eliminación Definitiva de Usuario
                  </h3>
                  <p className="text-xs opacity-70">Operación irreversible de administración master</p>
                </div>
              </div>

              <div className="p-3 rounded-[12px] bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 space-y-1">
                <p className="font-bold">¡Advertencia crítica de seguridad!</p>
                <p>
                  Esta acción eliminará de forma permanente el perfil de{' '}
                  <span className="font-semibold">{userForDelete.full_name} ({userForDelete.email})</span>,
                  desvinculándolo de todos sus grupos y borrando sus transacciones y cuentas registradas.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserForDelete(null)}
                  className="px-4 py-2 rounded-[10px] text-xs font-semibold border hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ borderColor: 'var(--ios-separator)' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeletingUser}
                  onClick={handleConfirmDeleteUser}
                  className="px-4 py-2 rounded-[10px] text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isDeletingUser ? 'Eliminando...' : 'Sí, Eliminar Usuario'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pie del modal con advertencia de seguridad */}
        <div
          className="p-4 px-6 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-xs"
          style={{ borderColor: 'var(--ios-separator)', background: 'var(--ios-bg-secondary)' }}
        >
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
            <Lock className="w-3.5 h-3.5" />
            <span>Acceso auditado de Master Admin para {profile?.email}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 rounded-[12px] font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{ color: 'var(--ios-label)' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
