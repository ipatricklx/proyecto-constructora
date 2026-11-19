
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

// ==========================================
// INTERFACES
// ==========================================

interface MetricasModelo {
  calibrado: boolean;
  precision_global_pct: number | null;
  mae_global: number | null;
  rmse_global: number | null;
  algoritmo: string;
}

interface PrediccionAPI {
  material_id: string;
  nombre: string;
  promedio_mensual: number;
  prediccion_proximo_mes: number;
  prediccion_mes_seleccionado?: number;
  tendencia: string;
  variacion_pct: number;
  meses_analizados: number;
  confiabilidad: string;
  mae: number | null;
  rmse: number | null;
  precision_pct: number | null;
  algoritmo_seleccionado: string;
  evaluacion_disponible: boolean;
}

interface PrediccionCompleta extends PrediccionAPI {
  demanda_proyectada: number;
  stock_actual: number;
  sugerencia_compra: number;
  cobertura_pct: number;
}

interface RespuestaAPI {
  status: string;
  message?: string;
  mes_objetivo?: string;
  mes_base?: string;
  meses_hasta_prediccion?: number;
  metricas_modelo?: MetricasModelo;
  data?: PrediccionAPI[];
}

// ==========================================
// CONFIGURACIÓN
// ==========================================

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const ELEMENTOS_POR_PAGINA = 10;

const formatearNumero = (valor: number | null, decimales = 2) => {
  if (valor === null || !Number.isFinite(valor)) return 'No disponible';
  return valor.toFixed(decimales);
};

const obtenerMesSiguiente = () => {
  const fecha = new Date();
  fecha.setDate(1);
  fecha.setMonth(fecha.getMonth() + 1);

  return `${fecha.getFullYear()}-${String(
    fecha.getMonth() + 1
  ).padStart(2, '0')}`;
};

const obtenerFechaLocal = () => {
  const fecha = new Date();

  return [
    fecha.getFullYear(),
    String(fecha.getMonth() + 1).padStart(2, '0'),
    String(fecha.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatearMes = (mes: string) => {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return mes;

  const [anio, numeroMes] = mes.split('-').map(Number);

  const fecha = new Date(anio, numeroMes - 1, 1);

  return fecha.toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  });
};

const escaparCSV = (valor: string | number) => {
  return `"${String(valor).replace(/"/g, '""')}"`;
};

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function PrediccionDemanda() {
  const [predicciones, setPredicciones] = useState<PrediccionCompleta[]>([]);
  const [metricasModelo, setMetricasModelo] =
    useState<MetricasModelo | null>(null);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mesSeleccionado, setMesSeleccionado] =
    useState(obtenerMesSiguiente);

  const [mesBase, setMesBase] = useState('');
  const [mesesHastaPrediccion, setMesesHastaPrediccion] = useState(1);

  const [filtroEstado, setFiltroEstado] = useState<
    'todos' | 'deficit' | 'suficiente'
  >('todos');

  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);

  // ==========================================
  // CONSULTAR DATOS Y GENERAR PREDICCIONES
  // ==========================================

  const cargarDatosYPredecir = async (mes: string) => {
    try {
      setCargando(true);
      setError(null);

      if (!API_URL) {
        throw new Error('No se encuentra configurada la URL de la API.');
      }

      // Obtener materiales y stock desde Supabase
      const { data: materialesDB, error: errorSupabase } = await supabase
        .from('materiales')
        .select('id, nombre, stock_actual');

      if (errorSupabase) throw errorSupabase;

      // Consultar predicción para el mes seleccionado
      const respuesta = await fetch(
        `${API_URL}/api/predict/demand?mes=${encodeURIComponent(mes)}`
      );

      if (!respuesta.ok) {
        let mensaje = 'No se pudo conectar con la API de Machine Learning.';

        try {
          const errorJSON = await respuesta.json();
          mensaje = errorJSON.detail || errorJSON.message || mensaje;
        } catch {
          // Mantener mensaje predeterminado
        }

        throw new Error(mensaje);
      }

      const json: RespuestaAPI = await respuesta.json();

      if (json.status !== 'success' || !json.data) {
        throw new Error(
          json.message || 'No hay datos históricos suficientes.'
        );
      }

      setMetricasModelo(json.metricas_modelo || null);
      setMesBase(json.mes_base || '');
      setMesesHastaPrediccion(json.meses_hasta_prediccion || 1);

      // Combinar predicciones con stock de Supabase
      const datosCombinados: PrediccionCompleta[] = json.data.map((pred) => {
        const matInfo = materialesDB?.find(
          (m) => m.id === pred.material_id
        );

        const stockActual = matInfo
          ? Number(matInfo.stock_actual) || 0
          : 0;

        const demandaProyectada = Math.max(
          0,
          Number(
            pred.prediccion_mes_seleccionado ??
              pred.prediccion_proximo_mes
          ) || 0
        );

        const faltante = demandaProyectada - stockActual;

        const cobertura =
          demandaProyectada > 0
            ? Math.min(
                100,
                Math.round((stockActual / demandaProyectada) * 100)
              )
            : 100;

        return {
          ...pred,
          demanda_proyectada: demandaProyectada,
          stock_actual: stockActual,
          sugerencia_compra: faltante > 0 ? Math.ceil(faltante) : 0,
          cobertura_pct: cobertura,
        };
      });

      setPredicciones(datosCombinados);
      setPaginaActual(1);

    } catch (err) {
      console.error('Error al obtener predicciones:', err);

      setPredicciones([]);
      setMetricasModelo(null);

      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servicio de predicción.'
      );

    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatosYPredecir(mesSeleccionado);
  }, []);

  // ==========================================
  // CAMBIAR MES DE PREDICCIÓN
  // ==========================================

  const cambiarMes = (nuevoMes: string) => {
    if (!nuevoMes || nuevoMes === mesSeleccionado) return;

    setMesSeleccionado(nuevoMes);
    setPaginaActual(1);

    cargarDatosYPredecir(nuevoMes);
  };

  // ==========================================
  // EXPORTAR CSV
  // ==========================================

  const exportarRequerimientoCSV = () => {
    const itemsComprar = predicciones.filter(
      (p) => p.sugerencia_compra > 0
    );

    const listaExportar =
      itemsComprar.length > 0 ? itemsComprar : predicciones;

    const encabezados = [
      'Mes de Proyeccion',
      'Material',
      'Stock Actual',
      'Promedio Historico Mensual',
      'Demanda Proyectada',
      'Precision (%)',
      'MAE',
      'RMSE',
      'Tendencia',
      'Algoritmo Seleccionado',
      'Cantidad Sugerida a Comprar',
      'Confiabilidad',
      'Meses Analizados',
    ];

    const filas = listaExportar.map((item) => [
      escaparCSV(mesSeleccionado),
      escaparCSV(item.nombre),
      item.stock_actual,
      item.promedio_mensual,
      item.demanda_proyectada,
      item.precision_pct ?? 'No disponible',
      item.mae ?? 'No disponible',
      item.rmse ?? 'No disponible',
      escaparCSV(item.tendencia),
      escaparCSV(item.algoritmo_seleccionado),
      item.sugerencia_compra,
      escaparCSV(item.confiabilidad),
      item.meses_analizados,
    ]);

    const contenidoCSV =
      '\uFEFFsep=;\n' +
      encabezados.join(';') +
      '\n' +
      filas.map((fila) => fila.join(';')).join('\n');

    const blob = new Blob([contenidoCSV], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');

    enlace.href = url;
    enlace.download = `Requerimiento_Compras_${mesSeleccionado}_${obtenerFechaLocal()}.csv`;

    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);

    URL.revokeObjectURL(url);
  };

  // ==========================================
  // INDICADORES OPERATIVOS
  // ==========================================

  const materialesConDeficit = predicciones.filter(
    (p) => p.sugerencia_compra > 0
  ).length;

  const totalUnidadesComprar = predicciones.reduce(
    (acc, p) => acc + p.sugerencia_compra,
    0
  );

  const totalDemandaEstimada = predicciones.reduce(
    (acc, p) => acc + p.demanda_proyectada,
    0
  );

  const totalStockCubierto = predicciones.reduce(
    (acc, p) =>
      acc + Math.min(p.stock_actual, p.demanda_proyectada),
    0
  );

  const coberturaGlobalPct =
    totalDemandaEstimada > 0
      ? Math.round(
          (totalStockCubierto / totalDemandaEstimada) * 100
        )
      : 100;

  // ==========================================
  // FILTROS
  // ==========================================

  const prediccionesFiltradas = useMemo(() => {
    return predicciones.filter((item) => {
      const coincideTexto = item.nombre
        .toLowerCase()
        .includes(busqueda.toLowerCase().trim());

      if (!coincideTexto) return false;

      if (filtroEstado === 'deficit') {
        return item.sugerencia_compra > 0;
      }

      if (filtroEstado === 'suficiente') {
        return item.sugerencia_compra === 0;
      }

      return true;
    });
  }, [predicciones, busqueda, filtroEstado]);

  // ==========================================
  // PAGINACIÓN
  // ==========================================

  const totalPaginas = Math.max(
    1,
    Math.ceil(prediccionesFiltradas.length / ELEMENTOS_POR_PAGINA)
  );

  const indiceInicial = (paginaActual - 1) * ELEMENTOS_POR_PAGINA;

  const materialesPagina = prediccionesFiltradas.slice(
    indiceInicial,
    indiceInicial + ELEMENTOS_POR_PAGINA
  );

  const cambiarPagina = (pagina: number) => {
    setPaginaActual(
      Math.min(Math.max(1, pagina), totalPaginas)
    );
  };

  // ==========================================
  // GRÁFICO COMPARATIVO
  // ==========================================

  const datosGrafico = [...predicciones]
    .sort((a, b) => b.demanda_proyectada - a.demanda_proyectada)
    .slice(0, 6);

  const valorMaximoGrafico = Math.max(
    1,
    ...datosGrafico.map((p) =>
      Math.max(p.stock_actual, p.demanda_proyectada)
    )
  );

  // ==========================================
  // INTERFAZ
  // ==========================================

  return (
    <div className="space-y-6">

      {/* ENCABEZADO */}

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">

        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-800">
              Predicción de Demanda
            </h2>

            {metricasModelo && (
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                <span className="inline-block w-1.5 h-1.5 bg-indigo-500 rounded-full mr-1.5" />
                Machine Learning
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500 mt-1">
            Proyección de consumo y planificación de abastecimiento de materiales.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">

          {/* SELECTOR DE MES */}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500">
              Mes de predicción
            </label>

            <input
              type="month"
              min={obtenerMesSiguiente()}
              value={mesSeleccionado}
              onChange={(e) => cambiarMes(e.target.value)}
              disabled={cargando}
              className="px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* EXPORTAR */}

          <button
            onClick={exportarRequerimientoCSV}
            disabled={cargando || predicciones.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4 text-emerald-600"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Exportar CSV
          </button>

          {/* ACTUALIZAR */}

          <button
            onClick={() => cargarDatosYPredecir(mesSeleccionado)}
            disabled={cargando}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <svg
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>

            {cargando ? 'Calculando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* PERIODO SELECCIONADO */}

      {!error && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-indigo-50/70 border border-indigo-100 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-white rounded-lg border border-indigo-100">
              <svg
                className="w-5 h-5 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14H4V6a1 1 0 011-1z"
                />
              </svg>
            </div>

            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase">
                Periodo proyectado
              </p>
              <p className="text-sm font-bold text-indigo-900 capitalize">
                {formatearMes(mesSeleccionado)}
              </p>
            </div>
          </div>

          {mesBase && (
            <div className="text-xs text-indigo-700">
              Último mes histórico completo:{' '}
              <strong className="capitalize">
                {formatearMes(mesBase)}
              </strong>
              <span className="mx-2 text-indigo-300">|</span>
              Horizonte: {mesesHastaPrediccion}{' '}
              {mesesHastaPrediccion === 1 ? 'mes' : 'meses'}
            </div>
          )}
        </div>
      )}

      {/* CARGA Y ERROR */}

      {cargando && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-sm font-medium text-gray-700 mt-4">
            Calculando predicciones...
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Procesando movimientos históricos y evaluando los algoritmos.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>

            <div>
              <p className="text-sm font-semibold text-red-800">
                No se pudieron generar las predicciones
              </p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL */}

      {!cargando && !error && (
        <>

          {/* INDICADORES OPERATIVOS */}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Materiales evaluados
                </p>
                <span className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-800 mt-3">
                {predicciones.length}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Materiales con historial de salidas
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Riesgo de quiebre
                </p>
                <span className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-bold text-amber-600 mt-3">
                {materialesConDeficit}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Materiales con déficit proyectado
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Compra sugerida
                </p>
                <span className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l2.4 12.2a2 2 0 002 1.6h8.8a2 2 0 002-1.6L22 7H6m4 14h.01M18 21h.01" />
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-bold text-indigo-600 mt-3">
                {formatearNumero(totalUnidadesComprar, 0)} und.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Cantidad total estimada para reponer
              </p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Cobertura de stock
                </p>
                <span className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 3c-2.755 0-5.29.93-7.298 2.49L4 12l.702 6.51A11.955 11.955 0 0012 21c2.755 0 5.29-.93 7.298-2.49L20 12l-.382-4.016z" />
                  </svg>
                </span>
              </div>
              <p className="text-2xl font-bold text-emerald-600 mt-3">
                {coberturaGlobalPct}%
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Stock disponible frente a demanda estimada
              </p>
            </div>

          </div>

          {/* MÉTRICAS DEL MODELO */}

          {metricasModelo && (
            <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm">

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-200">
                    Evaluación del modelo
                  </h3>
                </div>

                <span className="text-xs text-slate-400">
                  {metricasModelo.calibrado
                    ? 'Modelo calibrado'
                    : 'Evaluación estadística disponible'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">

                <div className="bg-slate-800/70 rounded-lg p-4 border border-slate-700/60">
                  <p className="text-xs font-medium text-slate-400 uppercase">
                    Precisión global
                  </p>
                  <p className="text-2xl font-bold text-white mt-2">
                    {metricasModelo.precision_global_pct !== null
                      ? `${formatearNumero(metricasModelo.precision_global_pct, 1)}%`
                      : 'No disponible'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Indicador derivado de 100% menos el WMAPE.
                  </p>
                </div>

                <div className="bg-slate-800/70 rounded-lg p-4 border border-slate-700/60">
                  <p className="text-xs font-medium text-slate-400 uppercase">
                    Error absoluto medio (MAE)
                  </p>
                  <p className="text-2xl font-bold text-white mt-2">
                    {metricasModelo.mae_global !== null
                      ? `± ${formatearNumero(metricasModelo.mae_global)} und.`
                      : 'No disponible'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Diferencia absoluta promedio entre demanda real y estimada.
                  </p>
                </div>

                <div className="bg-slate-800/70 rounded-lg p-4 border border-slate-700/60">
                  <p className="text-xs font-medium text-slate-400 uppercase">
                    Raíz del error cuadrático (RMSE)
                  </p>
                  <p className="text-2xl font-bold text-white mt-2">
                    {metricasModelo.rmse_global !== null
                      ? `${formatearNumero(metricasModelo.rmse_global)} und.`
                      : 'No disponible'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Penaliza con mayor intensidad los errores elevados.
                  </p>
                </div>

              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:justify-between gap-2">
                <p className="text-xs text-slate-400">
                  Método: {metricasModelo.algoritmo}
                </p>
                <p className="text-xs text-slate-500">
                  Evaluación basada en el comportamiento histórico del modelo.
                </p>
              </div>
            </div>
          )}

          {/* GRÁFICO COMPARATIVO */}

          {predicciones.length > 0 && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-base font-bold text-gray-800">
                    Stock disponible vs. demanda proyectada
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 capitalize">
                    Comparación para {formatearMes(mesSeleccionado)}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-slate-700 inline-block" />
                    <span className="text-gray-600">Stock actual</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block" />
                    <span className="text-gray-600">Demanda estimada</span>
                  </div>
                </div>
              </div>

              <div className="space-y-5">

                {datosGrafico.map((item) => {
                  const anchoStock = Math.min(
                    100,
                    (item.stock_actual / valorMaximoGrafico) * 100
                  );

                  const anchoDemanda = Math.min(
                    100,
                    (item.demanda_proyectada / valorMaximoGrafico) * 100
                  );

                  return (
                    <div key={item.material_id} className="space-y-2">

                      <div className="flex justify-between items-center text-xs gap-3">
                        <span className="font-semibold text-gray-700 truncate">
                          {item.nombre}
                        </span>

                        <span className="text-gray-500 whitespace-nowrap">
                          {item.stock_actual} / {item.demanda_proyectada} und.
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-slate-700 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${anchoStock}%` }}
                          />
                        </div>

                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                            style={{ width: `${anchoDemanda}%` }}
                          />
                        </div>
                      </div>

                    </div>
                  );
                })}

              </div>

              <p className="text-[11px] text-gray-400 mt-5">
                Se muestran los seis materiales con mayor demanda proyectada.
              </p>
            </div>
          )}

          {/* TABLA DE PREDICCIONES */}

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

            {/* CABECERA DE TABLA */}

            <div className="p-5 border-b border-gray-200">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                <div>
                  <h3 className="text-base font-bold text-gray-800">
                    Detalle de predicciones
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 capitalize">
                    Resultados para {formatearMes(mesSeleccionado)}
                  </p>
                </div>

                <div className="relative w-full lg:w-72">
                  <input
                    type="text"
                    placeholder="Buscar material..."
                    value={busqueda}
                    onChange={(e) => {
                      setBusqueda(e.target.value);
                      setPaginaActual(1);
                    }}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />

                  <svg
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4 text-gray-400 absolute left-3 top-2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </div>
              </div>

              {/* FILTROS */}

              <div className="flex flex-wrap items-center gap-2 mt-4">

                <button
                  onClick={() => {
                    setFiltroEstado('todos');
                    setPaginaActual(1);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    filtroEstado === 'todos'
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Todos ({predicciones.length})
                </button>

                <button
                  onClick={() => {
                    setFiltroEstado('deficit');
                    setPaginaActual(1);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    filtroEstado === 'deficit'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Requieren compra ({materialesConDeficit})
                </button>

                <button
                  onClick={() => {
                    setFiltroEstado('suficiente');
                    setPaginaActual(1);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    filtroEstado === 'suficiente'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Stock suficiente ({predicciones.length - materialesConDeficit})
                </button>

              </div>
            </div>

            {/* TABLA */}

            <div className="overflow-x-auto">

              <table className="w-full text-left border-collapse">

                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">

                    <th className="py-3.5 px-5">Material</th>
                    <th className="py-3.5 px-4">Stock / Cobertura</th>
                    <th className="py-3.5 px-4">Prom. histórico</th>
                    <th className="py-3.5 px-4">Demanda proyectada</th>
                    <th className="py-3.5 px-4">Tendencia</th>
                    <th className="py-3.5 px-4">Compra sugerida</th>
                    <th className="py-3.5 px-4">Métricas</th>
                    <th className="py-3.5 px-4">Algoritmo</th>
                    <th className="py-3.5 px-5">Confiabilidad</th>

                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 text-sm">

                  {materialesPagina.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="py-12 text-center text-gray-400 text-sm"
                      >
                        No se encontraron materiales con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    materialesPagina.map((item) => (
                      <tr
                        key={item.material_id}
                        className="hover:bg-gray-50/80 transition-colors"
                      >

                        {/* MATERIAL */}

                        <td className="py-4 px-5">
                          <span className="font-semibold text-gray-800">
                            {item.nombre}
                          </span>
                        </td>

                        {/* STOCK Y COBERTURA */}

                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1.5 w-28">

                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-gray-700">
                                {item.stock_actual} und.
                              </span>
                              <span className="text-gray-400">
                                {item.cobertura_pct}%
                              </span>
                            </div>

                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  item.cobertura_pct >= 100
                                    ? 'bg-emerald-500'
                                    : item.cobertura_pct >= 50
                                    ? 'bg-amber-500'
                                    : 'bg-red-500'
                                }`}
                                style={{
                                  width: `${item.cobertura_pct}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* PROMEDIO HISTÓRICO */}

                        <td className="py-4 px-4 text-gray-500 whitespace-nowrap">
                          {formatearNumero(item.promedio_mensual)} und./mes
                        </td>

                        {/* DEMANDA PROYECTADA */}

                        <td className="py-4 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-indigo-600">
                              {formatearNumero(item.demanda_proyectada, 0)} und.
                            </span>
                            <span className="text-[11px] text-gray-400 capitalize">
                              {formatearMes(mesSeleccionado)}
                            </span>
                          </div>
                        </td>

                        {/* TENDENCIA */}

                        <td className="py-4 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap ${
                              item.tendencia === 'En alza'
                                ? 'bg-rose-50 text-rose-700'
                                : item.tendencia === 'A la baja'
                                ? 'bg-sky-50 text-sky-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {item.tendencia === 'En alza' && '↑'}
                            {item.tendencia === 'A la baja' && '↓'}
                            {item.tendencia}

                            {item.variacion_pct !== 0 &&
                              ` (${item.variacion_pct > 0 ? '+' : ''}${item.variacion_pct}%)`}
                          </span>
                        </td>

                        {/* COMPRA SUGERIDA */}

                        <td className="py-4 px-4">
                          {item.sugerencia_compra > 0 ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-100 whitespace-nowrap">
                              Comprar +{item.sugerencia_compra} und.
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap">
                              Stock suficiente
                            </span>
                          )}
                        </td>

                        {/* MÉTRICAS */}

                        <td className="py-4 px-4">
                          {item.evaluacion_disponible ? (
                            <div className="flex flex-col gap-1 text-xs whitespace-nowrap">
                              <span className="text-indigo-700 font-semibold">
                                Precisión: {formatearNumero(item.precision_pct, 1)}%
                              </span>
                              <span className="text-gray-500">
                                MAE: {formatearNumero(item.mae)}
                              </span>
                              <span className="text-gray-500">
                                RMSE: {formatearNumero(item.rmse)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              Sin evaluación
                            </span>
                          )}
                        </td>

                        {/* ALGORITMO */}

                        <td className="py-4 px-4">
                          <span className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium whitespace-nowrap">
                            {item.algoritmo_seleccionado}
                          </span>
                        </td>

                        {/* CONFIABILIDAD */}

                        <td className="py-4 px-5">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex w-fit items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                item.confiabilidad === 'Alta'
                                  ? 'bg-green-100 text-green-700'
                                  : item.confiabilidad === 'Media'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {item.confiabilidad}
                            </span>

                            <span className="text-[11px] text-gray-400">
                              {item.meses_analizados}{' '}
                              {item.meses_analizados === 1
                                ? 'mes analizado'
                                : 'meses analizados'}
                            </span>
                          </div>
                        </td>

                      </tr>
                    ))
                  )}

                </tbody>
              </table>
            </div>

            {/* PAGINACIÓN */}

            {prediccionesFiltradas.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t border-gray-200">

                <p className="text-xs text-gray-500">
                  Mostrando{' '}
                  <strong className="text-gray-700">
                    {indiceInicial + 1}
                  </strong>
                  {' - '}
                  <strong className="text-gray-700">
                    {Math.min(
                      indiceInicial + ELEMENTOS_POR_PAGINA,
                      prediccionesFiltradas.length
                    )}
                  </strong>
                  {' de '}
                  <strong className="text-gray-700">
                    {prediccionesFiltradas.length}
                  </strong>
                  {' materiales'}
                </p>

                <div className="flex items-center gap-1">

                  <button
                    onClick={() => cambiarPagina(paginaActual - 1)}
                    disabled={paginaActual === 1}
                    className="px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Anterior
                  </button>

                  {Array.from(
                    { length: totalPaginas },
                    (_, index) => index + 1
                  ).map((pagina) => (
                    <button
                      key={pagina}
                      onClick={() => cambiarPagina(pagina)}
                      className={`min-w-9 px-3 py-2 text-xs font-semibold rounded-lg border cursor-pointer transition-colors ${
                        paginaActual === pagina
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {pagina}
                    </button>
                  ))}

                  <button
                    onClick={() => cambiarPagina(paginaActual + 1)}
                    disabled={paginaActual === totalPaginas}
                    className="px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Siguiente
                  </button>

                </div>
              </div>
            )}

          </div>

          {/* NOTA INFORMATIVA */}

          <div className="flex items-start gap-2 px-1">
            <svg
              className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9h.01M11 12h1v4h1m-1-13a9 9 0 100 18 9 9 0 000-18z"
              />
            </svg>

            <p className="text-xs text-gray-400 leading-relaxed">
              Las predicciones son estimaciones basadas en el historial de salidas.
              La precisión mostrada se calcula a partir del WMAPE de la evaluación
              histórica y no representa una probabilidad de acierto futuro.
              La compra sugerida corresponde a la diferencia entre la demanda
              proyectada y el stock actual, sin considerar entradas futuras.
            </p>
          </div>

        </>
      )}

    </div>
  );
}
