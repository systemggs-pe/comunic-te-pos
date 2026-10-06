import React, {useEffect, useMemo, useState} from 'react';
import {ShieldCheck, Trash2, UserCog} from 'lucide-react';
import {Button, IconButton} from '../../components/ui/Button.jsx';
import {PageHeader} from '../../components/ui/PageHeader.jsx';
import {
  eliminarUsuarioSistema,
  guardarUsuarioSistema,
  listarUsuariosSistema,
  obtenerMensajeErrorFuncion,
} from '../../services/functionsClient.js';

const EMPTY_FORM = {email: '', displayName: '', role: 'usuario', status: 'active'};

const ROLE_LABELS = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  usuario: 'Usuario',
};

const ROLE_DESCRIPTIONS = {
  superadmin: 'Control total, usuarios, configuracion y datos.',
  admin: 'Operacion completa sin gestionar usuarios.',
  usuario: 'Operacion diaria sin eliminaciones ni configuracion.',
};

export function UsuariosSistema({currentUser, showToast}) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const currentEmail = String(currentUser?.email || '').toLowerCase();

  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.email.localeCompare(b.email)), [users]);

  useEffect(() => {
    let active = true;
    listarUsuariosSistema()
      .then(data => {
        if (active) setUsers(Array.isArray(data.users) ? data.users : []);
      })
      .catch(error => {
        if (active) showToast(obtenerMensajeErrorFuncion(error, 'No se pudieron cargar los usuarios'), 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [showToast]);

  const updateField = event => {
    const {name, value} = event.target;
    setForm(current => ({...current, [name]: name === 'email' ? value.trim().toLowerCase() : value}));
  };

  const editUser = user => {
    setForm({
      email: user.email || '',
      displayName: user.displayName || '',
      role: user.role || 'usuario',
      status: user.status || 'active',
    });
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await guardarUsuarioSistema(form);
      setUsers(current => {
        const next = new Map(current.map(item => [item.email, item]));
        next.set(result.user.email, result.user);
        return [...next.values()];
      });
      setForm(EMPTY_FORM);
      showToast('Usuario actualizado');
    } catch (error) {
      showToast(obtenerMensajeErrorFuncion(error, 'No se pudo guardar el usuario'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async user => {
    if (user.email === currentEmail) {
      showToast('No puedes eliminar tu propio acceso', 'error');
      return;
    }
    const ok = window.confirm(`Eliminar el acceso de ${user.email}?`);
    if (!ok) return;
    try {
      await eliminarUsuarioSistema(user.email);
      setUsers(current => current.filter(item => item.email !== user.email));
      showToast('Usuario eliminado');
    } catch (error) {
      showToast(obtenerMensajeErrorFuncion(error, 'No se pudo eliminar el usuario'), 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="ui-page-surface">
        <PageHeader eyebrow="Seguridad" title="Usuarios y roles" description="Autoriza accesos de Google y define la jerarquia operativa del sistema." icon={UserCog} />

        <div className="grid gap-6 p-6 lg:grid-cols-[22rem_1fr]">
          <form className="ui-card h-fit space-y-4 p-4" onSubmit={save}>
            <div>
              <h2 className="text-base font-semibold text-[var(--ui-text)]">Asignar acceso</h2>
              <p className="mt-1 text-sm text-[var(--ui-text-tertiary)]">El usuario debe entrar con este correo Google.</p>
            </div>
            <label className="block text-sm font-semibold text-[var(--ui-text-secondary)]">
              Correo
              <input name="email" type="email" value={form.email} onChange={updateField} className="mt-1 w-full rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)]" required />
            </label>
            <label className="block text-sm font-semibold text-[var(--ui-text-secondary)]">
              Nombre visible
              <input name="displayName" value={form.displayName} onChange={updateField} className="mt-1 w-full rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)]" />
            </label>
            <label className="block text-sm font-semibold text-[var(--ui-text-secondary)]">
              Rol
              <select name="role" value={form.role} onChange={updateField} className="mt-1 w-full rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)]">
                <option value="usuario">Usuario</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-[var(--ui-text-secondary)]">
              Estado
              <select name="status" value={form.status} onChange={updateField} className="mt-1 w-full rounded-lg border border-[var(--ui-border-strong)] bg-[var(--ui-surface)] px-3 py-2 text-sm text-[var(--ui-text)]">
                <option value="active">Activo</option>
                <option value="disabled">Deshabilitado</option>
              </select>
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
              <Button type="button" onClick={() => setForm(EMPTY_FORM)} disabled={saving}>Limpiar</Button>
            </div>
          </form>

          <section className="space-y-3">
            {loading ? (
              <div className="ui-skeleton-list" role="status" aria-label="Cargando usuarios"><span /><span /><span /></div>
            ) : sortedUsers.length === 0 ? (
              <div className="ui-state-view">
                <ShieldCheck size={26} />
                <h2>Sin usuarios configurados</h2>
                <p>Los accesos por fallback siguen activos. Agrega usuarios para gestionarlos desde la app.</p>
              </div>
            ) : sortedUsers.map(user => (
              <article key={user.email} className="ui-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--ui-text)]">{user.displayName || user.email}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--ui-text-tertiary)]">{user.email}</p>
                  <p className="mt-2 text-xs text-[var(--ui-text-secondary)]">{ROLE_DESCRIPTIONS[user.role] || ROLE_DESCRIPTIONS.usuario}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-[var(--ui-border)] bg-[var(--ui-surface-muted)] px-3 py-1 text-xs font-bold text-[var(--ui-text-secondary)]">{ROLE_LABELS[user.role] || 'Usuario'}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${user.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{user.status === 'active' ? 'Activo' : 'Deshabilitado'}</span>
                  <Button type="button" onClick={() => editUser(user)}>Editar</Button>
                  <IconButton label="Eliminar usuario" onClick={() => remove(user)} disabled={user.email === currentEmail}><Trash2 size={17} /></IconButton>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
