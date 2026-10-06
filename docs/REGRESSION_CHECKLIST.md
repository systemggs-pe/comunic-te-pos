# Regression Checklist

Usar en cada release. No marcar por compilar o inspeccionar código. Registrar entorno, commit, usuario/rol de prueba, resultado y evidencia; usar datos desechables para escrituras. Este checklist permanece sin marcar deliberadamente.

Fecha de creación: 2026-10-05. Rama: `chore/baseline-stabilization`.

## Autenticación
- [ ] Iniciar sesión con Google y correo autorizado; `/api/usuarios` devuelve JSON y perfil correcto.
- [ ] Cerrar sesión y bloquear las vistas operativas.
- [ ] Recargar y comprobar sesión persistente.
- [ ] Rechazar correo sin autorización y usuario desactivado, incluso con token existente.
- [ ] Confirmar permisos tanto en UI como en backend y reglas.

## Usuarios
- [ ] Crear autorización de usuario con cuenta Google de prueba existente (la UI gestiona roles; no crea una cuenta Auth).
- [ ] Editar usuario y persistir datos.
- [ ] Activar/desactivar usuario; comprobar rechazo directo de Firestore y API.
- [ ] Asignar usuario/admin/superadmin y comprobar cada privilegio.
- [ ] Bloquear modificación/eliminación del propio rol.

## Roles y permisos
- [ ] Crear asignación de uno de los tres roles fijos.
- [ ] Editar rol y comprobar cambio de permisos; roles personalizados no están implementados.
- [ ] Bloquear acceso cuando no existe permiso, incluyendo requests manipuladas.
- [ ] Revisar usuarios fijos desactivados o degradados (BUG-003).

## Empresa
- [ ] Visualizar configuración disponible (logo de tickets; no existe CompanySettings).
- [ ] Editar logo como admin y rechazar a usuario.
- [ ] Confirmar persistencia tras recargar y desde otro dispositivo.
- [ ] Registrar NO APLICA para campos de empresa que el producto aún no implementa.

## Plantillas
- [ ] Listar plantillas (actualmente no hay módulo CRUD; registrar NO APLICA).
- [ ] Crear plantilla (NO APLICA hasta implementar módulo).
- [ ] Editar plantilla (NO APLICA hasta implementar módulo).
- [ ] Eliminar plantilla (NO APLICA hasta implementar módulo).
- [ ] Seleccionar plantilla predeterminada (NO APLICA para CRUD; verificar formatos fijos disponibles).
- [ ] Generar utilizando cada formato fijo de PDF existente.

## Archivos
- [ ] Subir archivo permitido en el flujo disponible; registrar NO APLICA para gestor genérico ausente.
- [ ] Subir imagen PNG/JPEG/WebP y rechazar tipos incompatibles antes de guardar.
- [ ] Visualizar logo/evidencias sin pérdida de contenido.
- [ ] Eliminar/reemplazar logo o evidencia en entorno de prueba, respetando permisos.
- [ ] Recortar imagen y verificar resultado del modal.
- [ ] Comprobar cámara, galería y selección de imagen en móvil.
- [ ] Validar tamaños, MIME y fallo de red sin guardar parcialmente.

## Generación de documentos
- [ ] Seleccionar formato disponible; no existe gestor dinámico de plantillas.
- [ ] Completar campos mínimos y rechazar campos inválidos.
- [ ] Generar PDF de registro, evidencias y venta con datos sintéticos.
- [ ] Abrir previsualización y comprobar páginas visualmente.
- [ ] Descargar PDF y abrirlo en lector externo.
- [ ] Verificar imágenes/adjuntos, campos largos, fechas, importes y logo.
- [ ] Consultar comprobante Apple con autorización y fixture/control de consumo.

## Operación real del proyecto
- [ ] Crear/editar registro y comprobar cliente, equipo, número y locks IMEI coherentes.
- [ ] Verificar Samsung con dos IMEI, celulares distintos y persistencia atómica.
- [ ] Registrar venta y comprobar duplicados, precio, pago y equipo.
- [ ] Buscar historial antiguo por DNI/IMEI y probar paginación.
- [ ] Crear enlace público, completar formulario, revisar borrador y terminar registro.
- [ ] Rechazar enlace expirado, token inválido, solicitud duplicada y eliminación sin permiso.
- [ ] Descargar respaldo con más de 200 clientes/equipos y comprobar integridad (BUG-004).
- [ ] Confirmar auditoría cuando falla una operación intermedia (BUG-008).

## Seguridad
- [ ] Acceso sin sesión: API rechaza y Firestore deniega.
- [ ] Acceso con rol incorrecto: rechazar lectura/escritura según matriz real.
- [ ] Validación backend: tamaños, tipos, DNI, Luhn IMEI y campos extra.
- [ ] Rutas protegidas: URL directa, token revocado, usuario disabled y escalamiento.
- [ ] Ejecutar reglas con emulador para acceso permitido y denegado; Admin SDK no sustituye esta prueba.
- [ ] Revisar audit de dependencias y ausencia de valores secretos en artefactos.

## Responsive
- [ ] Verificar 375px: login, formularios, tablas, navegación y modales.
- [ ] Verificar 390px: login, formularios, tablas, navegación y modales.
- [ ] Verificar 430px: login, formularios, tablas, navegación y modales.
- [ ] Verificar 768px: navegación, filtros y PDFs.
- [ ] Verificar 1024px+: formularios, búsqueda global y tablas.
- [ ] Comprobar teclado, foco, zoom, errores y estados vacíos.

## Producción
- [ ] Frontend carga y los assets no fallan; comprobar UI en navegador.
- [ ] API responde JSON desde el backend real configurado.
- [ ] Healthcheck: diferenciar respuesta API de fallback SPA; actualmente no implementado.
- [ ] Autenticación completa con cuenta autorizada y dominio Google autorizado.
- [ ] Conexión a base de datos con prueba autorizada; separar Admin de reglas cliente.
- [ ] CORS desde frontend publicado y preview; origen ajeno sin allow-origin.
- [ ] Generación PDF y descarga en desktop/móvil.
- [ ] Verificar variables de proveedor por nombre, URL de backend, reglas e índices desplegados.
- [ ] Confirmar que el commit probado coincide con el deploy publicado.

## Evidencia ejecutada en estabilización (2026-10-06)

Estas marcas certifican solo el entorno indicado, no la release publicada. Commit de acceso 3839484, backup d9dc2f6, harness/dependencias 210b47c; logs en docs/stabilization-evidence/.

- [x] Emulador Firestore: usuario activo lee datos y no edita configuración sin rol admin.
- [x] Emulador Firestore: admin y superadmin respetan permisos y no pueden escribir roles directamente.
- [x] Emulador Firestore: desactivar correo antes privilegiado revoca acceso directo; degradarlo elimina privilegios admin.
- [x] Emulador Firestore/API: roles ausentes, inválidos o sin active se rechazan.
- [x] API: token ausente, inválido, expirado, revocado o cuenta desactivada se rechaza en tests de frontera.
- [x] Auth/Firestore emulados: login válido/inválido con identidad sintética, API protegida, expiración, cuenta desactivada y cierre de sesión.
- [x] Backup unitario: 1201 documentos por cada colección, sin depender de fecha ni estado UI.
- [x] Backup emulado: consultas reales paginadas exportan todos los documentos (>200 por colección) y verifican conteos.
- [x] Backup unitario: fallos parciales, duplicados y cambios de conteos impiden éxito.
- [x] API Netlify publicada: registros/RENIEC rechazan POST sin sesión con 401 JSON.
- [x] CORS Netlify publicado: dominio principal, Firebase y localhost admitidos; origen ajeno sin allow-origin.
- [x] npm run verify y npm run test:rules pasan tras actualizar dependencias.
- [ ] Crear/verificar autorizaciones explícitas antes de desplegar; no depender de antiguos correos fijos.
- [ ] Completar Google OAuth y cierre de sesión desde UI real con cuenta autorizada; no equivale al login de emulador con contraseña.
- [ ] Verificar preview real de Netlify y reglas/función usuarios publicadas en una release autorizada.
- [ ] Revisar las 7 alertas restantes de desarrollo y acordar migración compatible de Tailwind.
