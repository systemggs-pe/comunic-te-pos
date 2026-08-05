import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Ban,
  Check,
  Clock3,
  Copy,
  Eye,
  FileCheck2,
  Link2,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import {ConfirmModal} from '../../components/ui/ConfirmModal.jsx';
import {
  crearInvitacionAutoRegistro,
  eliminarInvitacionAutoRegistro,
  iniciarRevisionAutoRegistro,
  listarInvitacionesAutoRegistro,
  obtenerMensajeErrorFuncion,
  obtenerSolicitudAutoRegistro,
  revocarInvitacionAutoRegistro,
} from '../../services/functionsClient.js';

const DNI_RE = /^\d{8}$/;
const evidenceLabels = {
  dniFrente: 'DNI frontal',
  dniReverso: 'DNI reverso',
  reciboCompra: 'Recibo de compra',
  cajaEquipo: 'Caja del equipo',
  imeiLogico: 'IMEI lógico',
};

const statusConfig = {
  ACTIVA: {label: 'Activo', className: 'border-blue-100 bg-blue-50 text-blue-700'},
  COMPLETADA: {label: 'Recibido', className: 'border-emerald-100 bg-emerald-50 text-emerald-700'},
  BLOQUEADA: {label: 'Bloqueado', className: 'border-red-100 bg-red-50 text-red-700'},
  REVOCADA: {label: 'Revocado', className: 'border-slate-200 bg-slate-100 text-slate-600'},
  VENCIDA: {label: 'Vencido', className: 'border-amber-100 bg-amber-50 text-amber-700'},
  ELIMINADA: {label: 'Eliminado', className: 'border-slate-200 bg-slate-100 text-slate-500'},
};

const registrationStatusConfig = {
  PENDIENTE: {label: 'Datos recibidos', className: 'border-amber-200 bg-amber-50 text-amber-800'},
  EN_REVISION: {label: 'En revisión', className: 'border-blue-200 bg-blue-50 text-blue-700'},
  REGISTRADO: {label: 'Registrado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700'},
};

function registrationDraft(data) {
  const request = data?.submission || {};
  const evidences = data?.evidencias || {};
  return {
    autoRegistroSubmissionId: request.id,
    autoRegistroEvidencias: {
      ...evidences,
      boletaVenta: evidences.reciboCompra || null,
    },
    source: 'AUTO_REGISTRO',
    tipoDocumentoCliente: 'DNI',
    dniCliente: request.dni || '',
    nombreCliente: request.nombres || '',
    celularCliente: request.celular || '',
    celularRef: request.celular || '',
    correoCliente: request.correo || '',
    direccionCliente: request.direccion || '',
    departamentoCliente: request.ciudad || '',
    imeiEquipo: request.imei || '',
    imeiRegistrado: request.imei || '',
    nombreComercialEquipo: request.nombreEquipo || '',
    colorEquipo: request.color || '',
    memoriaEquipo: request.memoria || '',
    ramEquipo: request.ram || '',
    estado: 'NO BLOQUEADO',
    estadoSolicitud: 'PENDIENTE',
    operador: 'BITEL',
    tipo: 'EXTERNO',
    tieneCaja: Boolean(evidences.cajaEquipo),
    precio: '',
    fecha: new Date().toISOString(),
  };
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('es-PE', {style: 'currency', currency: 'PEN'}).format(amount);
}

function DetailField({label, value, mono = false}) {
  return (
    <div>
      <dt className="text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value || 'No indicado'}</dd>
    </div>
  );
}

export function AutoRegistrosPage({showToast, onContinueRegistration}) {
  const [dni, setDni] = useState('');
  const [expiresDays, setExpiresDays] = useState('7');
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState('');

  const activeCount = useMemo(
    () => invitations.filter(item => item.status === 'ACTIVA').length,
    [invitations],
  );

  const refresh = useCallback(async ({silent = false} = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await listarInvitacionesAutoRegistro({force: true});
      setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
    } catch (error) {
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudieron cargar los enlaces'), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    let active = true;
    listarInvitacionesAutoRegistro()
      .then(data => {
        if (active) setInvitations(Array.isArray(data.invitations) ? data.invitations : []);
      })
      .catch(error => {
        if (active) showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudieron cargar los enlaces'), 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  const createLink = async event => {
    event.preventDefault();
    if (!DNI_RE.test(dni)) {
      showToast?.('Ingresa un DNI válido de 8 dígitos', 'error');
      return;
    }
    setCreating(true);
    try {
      const data = await crearInvitacionAutoRegistro(dni, Number(expiresDays));
      const url = `${window.location.origin}/registro-cliente/${data.token}`;
      setGeneratedLink(url);
      setCopied(false);
      setDni('');
      await refresh({silent: true});
      showToast?.('Enlace autorizado y listo para compartir');
    } catch (error) {
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudo generar el enlace'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      showToast?.('Enlace copiado');
    } catch {
      showToast?.('No se pudo copiar el enlace', 'error');
    }
  };

  const shareLink = async () => {
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({title: 'Registro de equipo', text: 'Completa los datos de tu equipo en este enlace:', url: generatedLink});
    } catch (error) {
      if (error?.name !== 'AbortError') showToast?.('No se pudo compartir el enlace', 'error');
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    try {
      await revocarInvitacionAutoRegistro(revokeTarget.id);
      setRevokeTarget(null);
      await refresh({silent: true});
      showToast?.('Enlace revocado');
    } catch (error) {
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudo revocar el enlace'), 'error');
    }
  };

  const openSubmission = async invitation => {
    if (!invitation.submissionId) return;
    setDetailLoading(invitation.submissionId);
    try {
      const data = await obtenerSolicitudAutoRegistro(invitation.submissionId);
      setDetail(data);
    } catch (error) {
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudo abrir la solicitud'), 'error');
    } finally {
      setDetailLoading('');
    }
  };

  const copySummary = async () => {
    const request = detail?.submission;
    if (!request) return;
    const summary = [
      `DNI: ${request.dni}`,
      `Cliente: ${request.nombres}`,
      `Celular: ${request.celular}`,
      `Correo: ${request.correo}`,
      `Dirección: ${request.direccion}, ${request.ciudad}`,
      `Equipo: ${request.nombreEquipo}`,
      `IMEI: ${request.imei}`,
      `Compra: ${request.fechaCompra} | ${formatMoney(request.precioCompra)}`,
      `Color: ${request.color} | Memoria: ${request.memoria} | RAM: ${request.ram}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      showToast?.('Datos de la solicitud copiados');
    } catch {
      showToast?.('No se pudieron copiar los datos', 'error');
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await eliminarInvitacionAutoRegistro(deleteTarget.id);
      setDeleteTarget(null);
      await refresh({silent: true});
      showToast?.('Enlace eliminado');
    } catch (error) {
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudo eliminar el enlace'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const continueRegistration = async submissionId => {
    if (!submissionId) return;
    setDetailLoading(submissionId);
    try {
      const data = await iniciarRevisionAutoRegistro(submissionId);
      setDetail(data);
      setInvitations(current => current.map(invitation => (
        invitation.submissionId === submissionId
          ? {...invitation, registrationStatus: 'EN_REVISION'}
          : invitation
      )));
      onContinueRegistration?.(registrationDraft(data));
    } catch (error) {
      showToast?.(obtenerMensajeErrorFuncion(error, 'No se pudo iniciar el registro'), 'error');
    } finally {
      setDetailLoading('');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <ConfirmModal
        open={Boolean(revokeTarget)}
        title="Revocar enlace"
        message={`El cliente con DNI ${revokeTarget?.dni || ''} ya no podrá usar este enlace.`}
        confirmLabel="Revocar"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={revoke}
        onCancel={() => setRevokeTarget(null)}
      />
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Eliminar enlace"
        message={`El enlace del DNI ${deleteTarget?.dni || ''} dejará de aparecer y ya no podrá utilizarse. Los datos de una solicitud recibida no se eliminarán.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />

      <section className="saas-list-shell max-w-none">
        <div className="saas-page-header">
          <div>
            <p className="saas-page-kicker">Autoservicio seguro</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="saas-page-title">Enlaces de registro para clientes</h1>
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">BETA</span>
            </div>
            <p className="saas-page-desc">Autoriza un DNI y comparte un enlace de un solo uso. Dos verificaciones incorrectas bloquean el acceso.</p>
            <p className="mt-1 text-xs font-semibold text-amber-700">Esta función está en BETA y puede presentar errores. Verifica la información antes de confirmar.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="saas-chip"><ShieldCheck size={14} /> {activeCount} activos</span>
            <button type="button" onClick={() => refresh()} disabled={loading} className="saas-icon-button" aria-label="Actualizar enlaces">
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <form onSubmit={createLink} className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[minmax(220px,1fr)_180px_auto] md:items-end">
          <label className="grid gap-1.5 text-xs font-extrabold text-slate-500">
            DNI autorizado
            <input
              value={dni}
              onChange={event => setDni(event.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              maxLength={8}
              placeholder="8 dígitos"
              className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-extrabold text-slate-500">
            Vigencia
            <select value={expiresDays} onChange={event => setExpiresDays(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              <option value="1">1 día</option>
              <option value="3">3 días</option>
              <option value="7">7 días</option>
              <option value="14">14 días</option>
              <option value="30">30 días</option>
            </select>
          </label>
          <button type="submit" disabled={creating || !DNI_RE.test(dni)} className="saas-primary min-h-11 disabled:cursor-not-allowed disabled:opacity-60">
            <Link2 size={17} /> {creating ? 'Generando...' : 'Generar enlace'}
          </button>
        </form>

        {generatedLink && (
          <div className="border-b border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-700"><FileCheck2 size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-emerald-900">Enlace listo para compartir</p>
                <p className="mt-1 text-xs text-emerald-700">Por seguridad, el token completo solo se muestra al generarlo.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input readOnly value={generatedLink} className="min-h-10 min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 font-mono text-xs text-slate-700" />
                  <button type="button" onClick={copyLink} className="saas-secondary border-emerald-200 bg-white text-emerald-800">
                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar'}
                  </button>
                  <button type="button" onClick={shareLink} className="saas-secondary border-emerald-200 bg-white text-emerald-800"><Send size={16} /> Compartir</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <div className="saas-empty"><RefreshCw size={26} className="animate-spin" /><p className="text-sm font-semibold">Cargando enlaces...</p></div>
          ) : invitations.length === 0 ? (
            <div className="saas-empty"><Link2 size={30} /><p className="text-sm font-semibold">Todavía no has generado enlaces.</p><p className="text-xs">Autoriza el primer DNI desde el formulario superior.</p></div>
          ) : (
            <table className="saas-table min-w-[760px]">
              <thead><tr><th className="text-left">Cliente</th><th className="text-left">Estado</th><th className="text-left">Intentos</th><th className="text-left">Vigencia</th><th className="text-right">Acciones</th></tr></thead>
              <tbody>
                {invitations.map(invitation => {
                  const status = statusConfig[invitation.status] || statusConfig.REVOCADA;
                  const registrationStatus = registrationStatusConfig[invitation.registrationStatus];
                  return (
                    <tr key={invitation.id}>
                      <td><p className="font-mono font-bold text-slate-800">DNI {invitation.dni}</p><p className="mt-1 text-xs text-slate-400">Creado {formatDate(invitation.createdAt)}</p></td>
                      <td>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[0.7rem] font-extrabold ${(registrationStatus || status).className}`}>{(registrationStatus || status).label}</span>
                        {invitation.nRegistro && <p className="mt-1 font-mono text-xs font-bold text-slate-500">{invitation.nRegistro}</p>}
                      </td>
                      <td><span className="font-semibold text-slate-700">{Math.max(invitation.maxAttempts - invitation.failedAttempts, 0)} de {invitation.maxAttempts}</span><p className="mt-1 text-xs text-slate-400">restantes</p></td>
                      <td><div className="flex items-center gap-1.5 text-sm text-slate-600"><Clock3 size={14} /> {formatDate(invitation.expiresAt)}</div></td>
                      <td>
                        <div className="flex justify-end gap-2">
                          {invitation.submissionId && (
                            <button type="button" onClick={() => openSubmission(invitation)} disabled={detailLoading === invitation.submissionId} className="saas-secondary">
                              <Eye size={15} /> {detailLoading === invitation.submissionId ? 'Abriendo...' : 'Ver datos'}
                            </button>
                          )}
                          {invitation.submissionId && invitation.registrationStatus !== 'REGISTRADO' && (
                            <button type="button" onClick={() => continueRegistration(invitation.submissionId)} disabled={detailLoading === invitation.submissionId} className="saas-primary">
                              <Workflow size={15} /> Seguir con el registro
                            </button>
                          )}
                          {invitation.status === 'ACTIVA' && (
                            <button type="button" onClick={() => setRevokeTarget(invitation)} className="saas-icon-button text-red-600" aria-label={`Revocar enlace de DNI ${invitation.dni}`}><Ban size={16} /></button>
                          )}
                          <button type="button" onClick={() => setDeleteTarget(invitation)} disabled={deleting && deleteTarget?.id === invitation.id} className="saas-icon-button text-red-700" aria-label={`Eliminar enlace de DNI ${invitation.dni}`}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {detail?.submission && (
        <section className="saas-list-shell max-w-none">
          <div className="saas-page-header">
            <div>
              <p className="saas-page-kicker">Solicitud recibida</p>
              <h2 className="saas-page-title">{detail.submission.nombres}</h2>
              <p className="saas-page-desc">Enviado el {formatDate(detail.submission.createdAt)}. Revisa los datos antes de crear el registro operativo.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={copySummary} className="saas-secondary"><Copy size={15} /> Copiar datos</button>
              {detail.submission.status !== 'REGISTRADO' && (
                <button type="button" onClick={() => continueRegistration(detail.submission.id)} disabled={detailLoading === detail.submission.id} className="saas-primary">
                  <Workflow size={15} /> {detailLoading === detail.submission.id ? 'Preparando...' : 'Seguir con el registro'}
                </button>
              )}
              <button type="button" onClick={() => setDetail(null)} className="saas-icon-button" aria-label="Cerrar detalle"><X size={18} /></button>
            </div>
          </div>
          <div className="grid gap-6 p-4 lg:grid-cols-[1fr_1fr] lg:p-5">
            <div className="space-y-5">
              <div>
                <h3 className="saas-form-section-title">Cliente</h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DetailField label="DNI" value={detail.submission.dni} mono />
                  <DetailField label="Celular" value={detail.submission.celular} />
                  <DetailField label="Correo" value={detail.submission.correo} />
                  <DetailField label="Ciudad" value={detail.submission.ciudad} />
                  <div className="sm:col-span-2"><DetailField label="Dirección" value={detail.submission.direccion} /></div>
                </dl>
              </div>
              <div>
                <h3 className="saas-form-section-title">Equipo y compra</h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <DetailField label="Equipo" value={detail.submission.nombreEquipo} />
                  <DetailField label="IMEI" value={detail.submission.imei} mono />
                  <DetailField label="Fecha de compra" value={detail.submission.fechaCompra} />
                  <DetailField label="Precio de compra" value={formatMoney(detail.submission.precioCompra)} />
                  <DetailField label="Color" value={detail.submission.color} />
                  <DetailField label="Memoria" value={detail.submission.memoria} />
                  <DetailField label="RAM" value={detail.submission.ram} />
                </dl>
              </div>
            </div>
            <div>
              <h3 className="saas-form-section-title">Evidencias</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(detail.evidencias || {}).map(([key, evidence]) => (
                  <figure key={key} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <figcaption className="border-b border-slate-200 px-3 py-2 text-xs font-extrabold text-slate-600">{evidenceLabels[key] || key}</figcaption>
                    <a href={evidence.dataUrl} target="_blank" rel="noreferrer" className="block bg-white">
                      <img src={evidence.dataUrl} alt={evidenceLabels[key] || key} className="h-48 w-full object-contain" loading="lazy" />
                    </a>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
