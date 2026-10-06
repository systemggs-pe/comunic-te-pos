export const ROLES_USUARIO = {
  USUARIO: 'usuario',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
};

const ROLE_RANK = {
  [ROLES_USUARIO.USUARIO]: 1,
  [ROLES_USUARIO.ADMIN]: 2,
  [ROLES_USUARIO.SUPERADMIN]: 3,
};

export function puedeUsuario(user, minimumRole = ROLES_USUARIO.USUARIO) {
  return user?.status === 'active' && Boolean(ROLE_RANK[minimumRole])
    && (ROLE_RANK[user?.role] || 0) >= ROLE_RANK[minimumRole];
}
