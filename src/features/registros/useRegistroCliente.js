import {useCallback, useEffect, useRef, useState} from 'react';
import {consultarClienteParaRegistro, consultarReniecDni, obtenerMensajeErrorFuncion} from '../../services/functionsClient.js';
import {validarDocumento} from '../../utils/documentos.js';
import {mergeClienteEquipos} from '../../utils/clienteEquipos.js';

const empty = () => ({equipos: [], activeImeis: [], nextCursor: null, loading: false, error: '', registrationStatusComplete: true, cliente: null});

export function useRegistroCliente({dni, tipoDocumento, enabled, onCliente}) {
  const [state, setState] = useState(empty);
  const [attempt, setAttempt] = useState(0);
  const callback = useRef(onCliente);
  const request = useRef(null);
  useEffect(() => { callback.current = onCliente; }, [onCliente]);

  const fetchPage = useCallback(async (controller, cursor = null) => {
    try {
      const result = await consultarClienteParaRegistro({dni, tipoDocumento, cursor}, {signal: controller.signal});
      if (controller.signal.aborted || request.current !== controller) return;
      setState(prev => ({
        dni, tipoDocumento, loading: false, error: '', cliente: result.cliente || prev.cliente,
        equipos: mergeClienteEquipos(cursor ? prev.equipos : [], result.equipos),
        activeImeis: [...new Set([...(cursor ? prev.activeImeis : []), ...result.activeImeis])],
        nextCursor: result.nextCursor,
        registrationStatusComplete: result.registrationStatusComplete && (!cursor || prev.registrationStatusComplete),
      }));
      if (result.cliente) callback.current(result.cliente, 'db');
      else if (!cursor && tipoDocumento === 'DNI') {
        // Only query RENIEC after checking the full database, not the 200 local clients.
        try {
          const reniec = await consultarReniecDni(dni, {signal: controller.signal});
          if (!controller.signal.aborted && request.current === controller && reniec.success && reniec.result?.full_name) {
            callback.current({dni, nombre: reniec.result.full_name}, 'reniec');
          }
        } catch (error) {
          if (!controller.signal.aborted && request.current === controller) {
            setState(prev => ({...prev, contactError: obtenerMensajeErrorFuncion(error, 'No se pudo consultar RENIEC. Puedes escribir el nombre.')}));
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller) return;
      setState(prev => ({...prev, dni, tipoDocumento, loading: false, error: obtenerMensajeErrorFuncion(error, 'No se pudieron consultar los equipos del cliente.')}));
    }
  }, [dni, tipoDocumento]);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const valid = enabled && validarDocumento(tipoDocumento, dni);
    // Schedule state with the async lookup; stale results are hidden synchronously below.
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({...empty(), dni, tipoDocumento, loading: valid});
    });
    if (!valid) return () => controller.abort();
    const timer = setTimeout(() => fetchPage(controller), 350);
    return () => { clearTimeout(timer); controller.abort(); request.current?.abort(); };
  }, [dni, tipoDocumento, enabled, attempt, fetchPage]);

  const loadMore = () => {
    if (state.loading || !state.nextCursor) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState(prev => ({...prev, loading: true, error: ''}));
    void fetchPage(controller, state.nextCursor);
  };
  // Hide old-client results immediately, even before the cleanup effect runs.
  const current = state.dni === dni && state.tipoDocumento === tipoDocumento;
  return {...(current ? state : {...empty(), loading: enabled && validarDocumento(tipoDocumento, dni)}), loadMore, retry: () => setAttempt(value => value + 1)};
}
