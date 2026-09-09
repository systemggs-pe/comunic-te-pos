import React, {useEffect, useMemo, useState} from 'react';
import {AlertCircle, CheckCircle2, Search, ShieldCheck} from 'lucide-react';
import {PRODUCT_BRAND, SOFTWARE_BRAND} from '../../config/branding.js';
import {cargarSolicitudPublica, consultarImeiSolicitudPublica, enviarSolicitudPublica, obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';
import {luhn} from '../../utils/imei.js';
import {PUBLIC_SOLICITUD_INITIAL, sanitizePublicSolicitudField, validatePublicSolicitudForm} from './publicSolicitudModel.js';

function Field({label, children, hint}) {
  return (
    <label className="public-request-field">
      <span>{label}</span>
      {children}
      {hint && <span className="public-request-hintline">{hint}</span>}
    </label>
  );
}

function ImeiState({value, lookup, optional = false}) {
  const prefix = optional
    ? 'Opcional si tu equipo solo tiene un IMEI.'
    : 'Para ver el IMEI del celular, marca *#06#.';
  if (!value && optional) return <span>{prefix}</span>;
  if (value.length !== 15) return <span>{prefix} Debe tener 15 digitos.</span>;
  const valid = luhn(value);
  if (!valid) {
    return <span className="public-request-error">IMEI invalido</span>;
  }
  if (lookup?.loading) return <span>Verificando IMEI...</span>;
  if (lookup?.registered) return <span className="public-request-error">IMEI ya registrado</span>;
  if (lookup?.foreignOwner) return <span className="public-request-error">IMEI asociado a otro cliente</span>;
  if (lookup?.autofilled) return <span className="public-request-valid">Equipo encontrado, datos completados</span>;
  if (lookup?.checked) return <span className="public-request-valid">IMEI disponible</span>;
  return (
    <span className="public-request-valid">IMEI valido</span>
  );
}

export function PublicSolicitudRegistro({token}) {
  const [form, setForm] = useState(PUBLIC_SOLICITUD_INITIAL);
  const [dni, setDni] = useState('');
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [imeiLookup, setImeiLookup] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    cargarSolicitudPublica(token, {signal: controller.signal})
      .then(data => {
        setDni(data.dni || '');
        setForm(current => ({...current, nombres: data.nombres || current.nombres}));
        setStatus(data.submitted ? 'submitted' : 'ready');
      })
      .catch(error => {
        setMessage(obtenerMensajeErrorFuncion(error, 'No se pudo abrir la solicitud'));
        setStatus('error');
      });
    return () => controller.abort();
  }, [token]);

  const validationMessage = useMemo(() => validatePublicSolicitudForm(form), [form]);

  const updateField = event => {
    const {name, value} = event.target;
    const nextValue = sanitizePublicSolicitudField(name, value);
    setMessage('');
    setForm(current => {
      const next = {...current, [name]: nextValue};
      if ((name === 'imei1' || name === 'imei2') && current.imeiRegistrado === current[name]) {
        next.imeiRegistrado = nextValue || (name === 'imei2' ? current.imei1 : '');
      }
      if ((name === 'imei1' || name === 'imei2') && !current.imeiRegistrado && nextValue.length === 15 && luhn(nextValue)) {
        next.imeiRegistrado = nextValue;
      }
      if (name === 'imeiRegistrado') {
        next.imeiRegistradoBloqueado = Boolean(imeiLookup[nextValue]?.registered);
      }
      return next;
    });
  };

  const applyLookupResult = data => {
    const equipo = data.equipo || {};
    const statusMap = data.imeiStatuses || {};
    const normalizedLookup = Object.fromEntries(Object.entries(statusMap).map(([imei, statusData]) => [
      imei,
      {
        checked: true,
        registered: Boolean(statusData?.registered),
        estadoSolicitud: statusData?.estadoSolicitud || '',
        autofilled: Boolean(data.canAutofill),
        foreignOwner: data.found && !data.belongsToRequester,
      },
    ]));
    const sourceImei = data.imei;
    setImeiLookup(current => ({
      ...current,
      [sourceImei]: {
        checked: true,
        registered: Boolean(statusMap[sourceImei]?.registered),
        estadoSolicitud: statusMap[sourceImei]?.estadoSolicitud || '',
        autofilled: Boolean(data.canAutofill),
        foreignOwner: data.found && !data.belongsToRequester,
      },
      ...normalizedLookup,
    }));
    setForm(current => {
      const candidateImei1 = data.canAutofill && equipo.imei1 ? equipo.imei1 : current.imei1;
      const candidateImei2 = data.canAutofill && equipo.imei2 ? equipo.imei2 : current.imei2;
      const selectableImeis = [candidateImei1, candidateImei2].filter(Boolean);
      const currentSelected = selectableImeis.includes(current.imeiRegistrado) ? current.imeiRegistrado : '';
      const nextSelected = currentSelected || selectableImeis.find(imei => !statusMap[imei]?.registered) || sourceImei;
      return {
        ...current,
        imei1: candidateImei1,
        imei2: candidateImei2,
        imeiRegistrado: nextSelected,
        imeiRegistradoBloqueado: Boolean(statusMap[nextSelected]?.registered),
        ...(data.canAutofill ? {
          nombreEquipo: equipo.nombreEquipo || current.nombreEquipo,
          marca: equipo.marca || current.marca,
          modelo: equipo.modelo || current.modelo,
          ram: equipo.ram || current.ram,
          memoria: equipo.memoria || current.memoria,
          color: equipo.color || current.color,
        } : {}),
      };
    });
    if (data.found && !data.belongsToRequester) {
      setMessage('Ese IMEI existe, pero esta asociado a otro cliente. Revisa el dato antes de continuar.');
    }
  };

  const verifyImei = async name => {
    const imei = form[name];
    if (!luhn(imei)) return;
    setImeiLookup(current => ({...current, [imei]: {...(current[imei] || {}), loading: true}}));
    try {
      const data = await consultarImeiSolicitudPublica(token, imei);
      applyLookupResult(data);
    } catch (error) {
      setImeiLookup(current => ({...current, [imei]: {checked: false, loading: false}}));
      setMessage(obtenerMensajeErrorFuncion(error, 'No se pudo verificar el IMEI'));
    } finally {
      setImeiLookup(current => ({...current, [imei]: {...(current[imei] || {}), loading: false}}));
    }
  };

  const submit = async event => {
    event.preventDefault();
    const error = validatePublicSolicitudForm(form);
    if (error) {
      setMessage(error);
      return;
    }
    const acceptedPenalty = window.confirm('Confirma que la informacion enviada es correcta. Si la informacion enviada es erronea, se cobrara una penalidad de S/ 10.00 soles.');
    if (!acceptedPenalty) return;
    setSending(true);
    setMessage('');
    try {
      await enviarSolicitudPublica(token, form);
      setStatus('submitted');
    } catch (error) {
      setMessage(obtenerMensajeErrorFuncion(error, 'No se pudo enviar la solicitud'));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="public-request-shell">
      <section className="public-request-card" aria-labelledby="public-request-title">
        <header className="public-request-header">
          <span className="public-request-mark" aria-hidden="true">CM</span>
          <div>
            <p>{PRODUCT_BRAND} · {SOFTWARE_BRAND}</p>
            <h1 id="public-request-title">Solicitud de registro</h1>
          </div>
        </header>

        {status === 'loading' && (
          <div className="public-request-state" role="status">
            <span className="ui-button__spinner" aria-hidden="true" />
            Cargando solicitud...
          </div>
        )}

        {status === 'error' && (
          <div className="public-request-state public-request-state--error" role="alert">
            <AlertCircle size={22} aria-hidden="true" />
            <span>{message}</span>
          </div>
        )}

        {status === 'submitted' && (
          <div className="public-request-state public-request-state--success" role="status">
            <CheckCircle2 size={24} aria-hidden="true" />
            <h2>Datos enviados</h2>
            <p>Tu solicitud ya fue enviada. COMUNIC@TE revisara la informacion y terminara el registro.</p>
          </div>
        )}

        {status === 'ready' && (
          <form className="public-request-form" onSubmit={submit}>
            <div className="public-request-summary">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>DNI asignado: <strong>{dni}</strong></span>
            </div>

            {message && <p className="public-request-alert" role="alert">{message}</p>}

            <div className="public-request-grid">
              <Field label="Nombres y apellidos">
                <input name="nombres" value={form.nombres} onChange={updateField} autoComplete="name" />
              </Field>
              <Field label="Celular">
                <input name="celular" inputMode="numeric" value={form.celular} onChange={updateField} autoComplete="tel" />
              </Field>
              <Field label="Correo electronico">
                <input name="correo" type="email" value={form.correo} onChange={updateField} autoComplete="email" />
              </Field>
              <Field label="Direccion del DNI">
                <input name="direccion" value={form.direccion} onChange={updateField} autoComplete="street-address" />
              </Field>
              <Field label="Provincia">
                <input name="provincia" value={form.provincia} onChange={updateField} />
              </Field>
              <Field label="Tiene caja">
                <select name="tieneCaja" value={form.tieneCaja} onChange={updateField}>
                  <option value="NO">NO</option>
                  <option value="SI">SI</option>
                </select>
              </Field>
            </div>

            <div className="public-request-section">
              <h2>Datos del equipo</h2>
              <div className="public-request-grid">
                <Field label="IMEI 1" hint={<ImeiState value={form.imei1} lookup={imeiLookup[form.imei1]} />}>
                  <input name="imei1" inputMode="numeric" value={form.imei1} onChange={updateField} onBlur={() => verifyImei('imei1')} />
                </Field>
                <Field label="IMEI 2 (opcional)" hint={<ImeiState value={form.imei2} lookup={imeiLookup[form.imei2]} optional />}>
                  <input name="imei2" inputMode="numeric" value={form.imei2} onChange={updateField} onBlur={() => verifyImei('imei2')} />
                </Field>
              </div>
              <div className="public-request-imei-choice" role="radiogroup" aria-label="IMEI a registrar">
                <div>
                  <Search size={17} aria-hidden="true" />
                  <span>Elige el IMEI que deseas registrar</span>
                </div>
                {[['imei1', 'IMEI 1'], ['imei2', 'IMEI 2']].map(([key, label]) => {
                  const value = form[key];
                  const blocked = Boolean(value && imeiLookup[value]?.registered);
                  return (
                    <label key={key} data-disabled={!value || blocked}>
                      <input
                        type="radio"
                        name="imeiRegistrado"
                        value={value}
                        checked={Boolean(value) && form.imeiRegistrado === value}
                        onChange={updateField}
                        disabled={!value || blocked}
                      />
                      <span>{label}</span>
                      <strong>{value || 'Pendiente'}</strong>
                      {blocked && <small>Ya registrado</small>}
                    </label>
                  );
                })}
              </div>
              <div className="public-request-grid">
                <Field label="Nombre del equipo">
                  <input name="nombreEquipo" value={form.nombreEquipo} onChange={updateField} placeholder="EJ: GALAXY A56" />
                </Field>
                <Field label="Marca">
                  <input name="marca" value={form.marca} onChange={updateField} />
                </Field>
                <Field label="Modelo (opcional)">
                  <input name="modelo" value={form.modelo} onChange={updateField} />
                </Field>
                <Field label="RAM">
                  <input name="ram" value={form.ram} onChange={updateField} />
                </Field>
                <Field label="Memoria">
                  <input name="memoria" value={form.memoria} onChange={updateField} />
                </Field>
                <Field label="Color">
                  <input name="color" value={form.color} onChange={updateField} />
                </Field>
                <Field label="Precio aproximado de compra">
                  <input name="precioCompra" inputMode="decimal" value={form.precioCompra} onChange={updateField} />
                </Field>
                <Field label="Fecha aproximada de compra">
                  <input name="fechaCompra" type="date" value={form.fechaCompra} onChange={updateField} />
                </Field>
              </div>
            </div>

            <p className="public-request-warning" role="note">
              Si la informacion enviada es erronea, se cobrara una penalidad de S/ 10.00 soles.
            </p>

            <button className="public-request-submit" type="submit" disabled={sending || Boolean(validationMessage)}>
              {sending ? 'Enviando...' : 'Enviar datos'}
            </button>
            {validationMessage && <p className="public-request-hint">{validationMessage}</p>}
          </form>
        )}
      </section>
    </main>
  );
}
