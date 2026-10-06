export const EMAILS_PERMITIDOS = [
  'brand050103@gmail.com',
  'lauryruyz50@gmail.com',
];

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
  return (ROLE_RANK[user?.role] || 0) >= (ROLE_RANK[minimumRole] || 0);
}
