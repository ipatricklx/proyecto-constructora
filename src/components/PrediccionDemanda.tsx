import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

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
  tendencia: string;
  variacion_pct: number;
  meses_analizados: number;
  confiabilidad: string;
  mae: number | null;
  rmse: number | null;
  precision_pct: number | null;
}

interface PrediccionCompleta extends PrediccionAPI {
  stock_actual: number;
  sugerencia_compra: number;
  cobertura_pct: number;
}

export default function PrediccionDemanda() {
  const [predicciones, setPredicciones] = useState<PrediccionCompleta[]>([]);
  const [metricasModelo, setMetricasModelo] = useState<MetricasModelo | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'deficit' | 'suficiente'>('todos');
  const [busqueda, setBusqueda] = useState<string>('');

  const cargarDatosYPredecir = async () => {
    try {
      setCargando(true);
      setError(null);

      const { data: materialesDB, error: errorSupabase } = await supabase
        .from('materiales')
        .select('id, nombre, stock_actual');

      if (errorSupabase) throw errorSupabase;

      const respuesta = await fetch('http://127.0.0.1:8000/api/predict/demand');
      if (!respuesta.ok) {
        throw new Error('No se pudo conectar con la API de Machine Learning.');
      }
      const json = await respuesta.json();

      if (json.status !== 'success') {
        setError(json.message || 'No hay datos históricos suficientes.');
        setPredicciones([]);
        return;
      }

      setMetricasModelo(json.metricas_modelo || null);

      const datosCombinados: PrediccionCompleta[] = (json.data as PrediccionAPI[]).map((pred) => {
        const matInfo = materialesDB?.find((m) => m.id === pred.material_id);
        const stockActual = matInfo ? Number(matInfo.stock_actual) || 0 : 0;
        const faltante = pred.prediccion_proximo_mes - stockActual;
        const cobertura =
          pred.prediccion_proximo_mes > 0
            ? Math.min(100, Math.round((stockActual / pred.prediccion_proximo_mes) * 100))
            : 100;

        return {
          ...pred,
          stock_actual: stockActual,
          sugerencia_compra: faltante > 0 ? faltante : 0,
          cobertura_pct: cobertura,
        };
      });

      setPredicciones(datosCombinados);
    } catch {
      setError(
        'Error al conectar con el motor de IA. Verifica que el servidor Python (uvicorn) esté activo en el puerto 8000.'
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatosYPredecir();
  }, []);

  const exportarRequerimientoCSV = () => {
    const itemsComprar = predicciones.filter((p) => p.sugerencia_compra > 0);
    const listaExportar = itemsComprar.length > 0 ? itemsComprar : predicciones;

    const encabezados = [
      'Material',
      'Stock Actual',
      'Promedio Historico Mensual',
      'Demanda Proyectada IA',
      'Error Medio (MAE)',
      'Tendencia',
      'Cantidad Sugerida a Comprar',
      'Confiabilidad Modelo',
    ];

    const filas = listaExportar.map((item) => [
      `"${item.nombre}"`,
      item.stock_actual,
      item.promedio_mensual,
      item.prediccion_proximo_mes,
      item.mae !== null ? item.mae : 'En calibracion',
      `"${item.tendencia}"`,
      item.sugerencia_compra,
      `"${item.confiabilidad}"`,
    ]);

    const contenidoCSV =
      '\uFEFFsep=;\n' +
      encabezados.join(';') +
      '\n' +
      filas.map((f) => f.join(';')).join('\n');

    const blob = new Blob([contenidoCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    const fechaHoy = new Date().toISOString().split('T')[0];

    enlace.href = url;
    enlace.download = `Requerimiento_Compras_IA_${fechaHoy}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  const materialesConDeficit = predicciones.filter((p) => p.sugerencia_compra > 0).length;
  const totalUnidadesComprar = predicciones.reduce((acc, p) => acc + p.sugerencia_compra, 0);
  const totalDemandaEstimada = predicciones.reduce((acc, p) => acc + p.prediccion_proximo_mes, 0);
  const totalStockCubierto = predicciones.reduce(
    (acc, p) => acc + Math.min(p.stock_actual, p.prediccion_proximo_mes),
    0
  );
  const coberturaGlobalPct =
    totalDemandaEstimada > 0 ? Math.round((totalStockCubierto / totalDemandaEstimada) * 100) : 100;

  const prediccionesFiltradas = predicciones.filter((item) => {
    const coincideTexto = item.nombre.toLowerCase().includes(busqueda.toLowerCase());
    if (!coincideTexto) return false;
    if (filtroEstado === 'deficit') return item.sugerencia_compra > 0;
    if (filtroEstado === 'suficiente') return item.sugerencia_compra === 0;
    return true;
  });

  const valorMaximoGrafico = Math.max(
    1,
    ...predicciones.map((p) => Math.max(p.stock_actual, p.prediccion_proximo_mes))
  );

  return (
    <div className="space-y-6">
      {/* Encabezado Principal */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold text-gray-800">
              Predicción de Demanda y Abastecimiento
            </h2>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
              {metricasModelo?.algoritmo || 'Regresión Lineal'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Proyección de consumo mensual entrenada con salidas del Kardex y evaluación de error estadístico
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={exportarRequerimientoCSV}
            disabled={cargando || predicciones.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-emerald-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exportar Orden (Excel)
          </button>

          <button
            onClick={cargarDatosYPredecir}
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
            {cargando ? 'Entrenando...' : 'Recalcular Modelo'}
          </button>
        </div>
      </div>

      {/* Fila 1: KPIs Operativos de Logística y Compras */}
      {!cargando && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Materiales Evaluados</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{predicciones.length}</p>
            <p className="text-xs text-gray-400 mt-1">Con salidas registradas</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Riesgo de Quiebre</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{materialesConDeficit}</p>
            <p className="text-xs text-gray-400 mt-1">Materiales con déficit proyectado</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Compra Sugerida</p>
            <p className="text-2xl font-bold text-indigo-600 mt-1">{totalUnidadesComprar} und.</p>
            <p className="text-xs text-gray-400 mt-1">Unidades totales a reponer</p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Cobertura de Stock</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{coberturaGlobalPct}%</p>
            <p className="text-xs text-gray-400 mt-1">Respecto a demanda estimada</p>
          </div>
        </div>
      )}

      {/* Fila 2: Métricas Estadísticas del Modelo ML (Precisión, MAE, RMSE) */}
      {!cargando && !error && metricasModelo && (
        <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
              <h3 className="text-sm font-semibold tracking-wide uppercase text-slate-200">
                Métricas de Validación del Modelo (Data Science)
              </h3>
            </div>
            <span className="text-xs text-slate-400">
              {metricasModelo.calibrado
                ? 'Validado con series temporales históricas (≥ 3 meses)'
                : 'En fase de calibración — Se requieren ≥ 3 meses de historial para calcular error real'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            {/* Precisión Global */}
            <div className="bg-slate-800/70 rounded-lg p-4 border border-slate-700/60">
              <div className="flex justify-between items-start">
                <p className="text-xs font-medium text-slate-400 uppercase">
                  Precisión del Modelo (1 - WMAPE)
                </p>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                  Exactitud
                </span>
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                {metricasModelo.precision_global_pct !== null
                  ? `${metricasModelo.precision_global_pct}%`
                  : 'En calibración'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Porcentaje de acierto frente al consumo histórico real
              </p>
            </div>

            {/* MAE */}
            <div className="bg-slate-800/70 rounded-lg p-4 border border-slate-700/60">
              <div className="flex justify-between items-start">
                <p className="text-xs font-medium text-slate-400 uppercase">
                  Error Absoluto Medio (MAE)
                </p>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                  Desviación
                </span>
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                {metricasModelo.mae_global !== null
                  ? `± ${metricasModelo.mae_global} und.`
                  : 'Pendiente (≥ 3 meses)'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Margen de variación promedio por cada estimación
              </p>
            </div>

            {/* RMSE */}
            <div className="bg-slate-800/70 rounded-lg p-4 border border-slate-700/60">
              <div className="flex justify-between items-start">
                <p className="text-xs font-medium text-slate-400 uppercase">
                  Error Cuadrático (RMSE)
                </p>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                  Sensibilidad
                </span>
              </div>
              <p className="text-2xl font-bold text-white mt-2">
                {metricasModelo.rmse_global !== null
                  ? `${metricasModelo.rmse_global} und.`
                  : 'Pendiente (≥ 3 meses)'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Penaliza picos atípicos o variaciones bruscas de demanda
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gráfico Comparativo: Stock Actual vs. Demanda Estimada */}
      {!cargando && !error && predicciones.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
            <div>
              <h3 className="text-base font-bold text-gray-800">
                Comparativa: Stock Disponible vs. Proyección IA
              </h3>
              <p className="text-xs text-gray-500">
                Brecha visual entre existencia física en almacén y consumo estimado
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-slate-700 inline-block"></span>
                <span className="text-gray-600">Stock Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-indigo-500 inline-block"></span>
                <span className="text-gray-600">Demanda Estimada IA</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {predicciones.slice(0, 6).map((item) => {
              const anchoStock = Math.round((item.stock_actual / valorMaximoGrafico) * 100);
              const anchoDemanda = Math.round(
                (item.prediccion_proximo_mes / valorMaximoGrafico) * 100
              );

              return (
                <div key={item.material_id} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-gray-700">{item.nombre}</span>
                    <span className="text-gray-500">
                      Stock: <strong className="text-gray-800">{item.stock_actual}</strong> / Demanda:{' '}
                      <strong className="text-indigo-600">{item.prediccion_proximo_mes}</strong>
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-slate-700 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(anchoStock, 2)}%` }}
                      />
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(anchoDemanda, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabla Detallada de Predicciones y Requerimientos */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-gray-200/70 p-1 rounded-lg w-fit">
            <button
              onClick={() => setFiltroEstado('todos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filtroEstado === 'todos'
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Todos ({predicciones.length})
            </button>
            <button
              onClick={() => setFiltroEstado('deficit')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filtroEstado === 'deficit'
                  ? 'bg-white text-amber-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Requieren Compra ({materialesConDeficit})
            </button>
            <button
              onClick={() => setFiltroEstado('suficiente')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                filtroEstado === 'suficiente'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Abastecidos ({predicciones.length - materialesConDeficit})
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Buscar material..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <svg
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="w-4 h-4 text-gray-400 absolute left-3 top-2.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
        </div>

        {cargando && (
          <div className="p-10 text-center text-sm text-gray-500">
            Procesando salidas del Kardex y entrenando regresiones lineales...
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          </div>
        )}

        {!cargando && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                  <th className="py-3.5 px-6">Material</th>
                  <th className="py-3.5 px-4">Stock / Cobertura</th>
                  <th className="py-3.5 px-4">Prom. Histórico</th>
                  <th className="py-3.5 px-4">Predicción IA (Margen MAE)</th>
                  <th className="py-3.5 px-4">Tendencia</th>
                  <th className="py-3.5 px-4">Sugerencia Compra</th>
                  <th className="py-3.5 px-6">Confianza Modelo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {prediccionesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-400 text-sm">
                      No se encontraron materiales con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  prediccionesFiltradas.map((item) => (
                    <tr key={item.material_id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-4 px-6 font-semibold text-gray-800">{item.nombre}</td>

                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1 w-28">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-gray-700">{item.stock_actual} und.</span>
                            <span className="text-gray-400">{item.cobertura_pct}%</span>
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
                              style={{ width: `${item.cobertura_pct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-gray-500">{item.promedio_mensual} und./mes</td>

                      {/* Predicción + Margen de error MAE individual */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-indigo-600">
                            {item.prediccion_proximo_mes} und.
                          </span>
                          <span className="text-[11px] text-gray-400">
                            {item.mae !== null
                              ? `Error ±${item.mae} und. (${item.precision_pct}% prec.)`
                              : 'Calibrando error'}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
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

                      <td className="py-4 px-4">
                        {item.sugerencia_compra > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-800">
                            Comprar +{item.sugerencia_compra} und.
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                            Stock suficiente
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <span
                            className={`inline-flex w-fit items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.confiabilidad === 'Alta'
                                ? 'bg-green-100 text-green-700'
                                : item.confiabilidad === 'Media'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {item.confiabilidad}
                          </span>
                          <span className="text-[11px] text-gray-400 mt-0.5">
                            {item.meses_analizados}{' '}
                            {item.meses_analizados === 1 ? 'mes analizado' : 'meses analizados'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}