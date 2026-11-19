
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'

interface Stats {
  totalMateriales: number
  valorInventario: number
  alertasStock: number
  entradasMes: number
  salidasMes: number
}

interface MovimientoReciente {
  id: string
  numero_movimiento: string
  tipo_movimiento: string
  fecha_registro: string
  estado: string
}

interface MaterialDemanda {
  nombre: string
  cantidad_total: number
}

const Icono = ({ tipo }: { tipo: string }) => {
  const paths: Record<string, string> = {
    materiales: 'M12 3L3.5 7.5 12 12l8.5-4.5L12 3ZM3.5 7.5v9L12 21l8.5-4.5v-9M12 12v9',
    alerta: 'M12 9v4m0 4h.01M10.3 3.9 2.7 17.1a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    entrada: 'M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4.5 14.25v4.5A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25v-4.5',
    salida: 'M12 3v12m0 0l4.5-4.5M12 15l-4.5-4.5M4.5 14.25v4.5A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25v-4.5',
    actualizar: 'M20 7v5h-5M4 17v-5h5m-4.5-3a8 8 0 0 1 13.3-2.9L20 12M4 12l2.2 5.9A8 8 0 0 0 19.5 15'
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d={paths[tipo] || paths.materiales} />
    </svg>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalMateriales: 0,
    valorInventario: 0,
    alertasStock: 0,
    entradasMes: 0,
    salidasMes: 0
  })

  const [movimientosRecientes, setMovimientosRecientes] =
    useState<MovimientoReciente[]>([])

  const [topMateriales, setTopMateriales] =
    useState<MaterialDemanda[]>([])

  const [datosGrafico, setDatosGrafico] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarDatosDashboard()
  }, [])

  async function cargarDatosDashboard() {
    setCargando(true)

    try {
      const d = new Date()
      const primerDiaMes = new Date(
        d.getFullYear(),
        d.getMonth(),
        1
      ).toISOString()

      const ultimoDiaMes = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59
      ).toISOString()

      // 1. Materiales
      const { data: mats, error: errorMats } = await supabase
        .from('materiales')
        .select('id, nombre, stock_actual, stock_minimo')

      if (errorMats) throw errorMats

      let totalMat = 0
      let alertas = 0

      if (mats) {
        totalMat = mats.length
        alertas = mats.filter(
          m => Number(m.stock_actual || 0) <= Number(m.stock_minimo || 0)
        ).length
      }

      // 2. Movimientos del mes
      const { data: movsMes, error: errorMovs } = await supabase
        .from('movimientos')
        .select('tipo_movimiento, detalle_movimientos(cantidad, precio_unitario)')
        .gte('fecha_registro', primerDiaMes)
        .lte('fecha_registro', ultimoDiaMes)
        .eq('estado', 'Completada')

      if (errorMovs) throw errorMovs

      let entradasMes = 0
      let salidasMes = 0
      let valorInvertidoMes = 0

      if (movsMes) {
        movsMes.forEach(mov => {
          if (mov.tipo_movimiento === 'ENTRADA') {
            entradasMes++

            mov.detalle_movimientos?.forEach((det: any) => {
              valorInvertidoMes +=
                Number(det.cantidad || 0) *
                Number(det.precio_unitario || 0)
            })
          } else if (mov.tipo_movimiento === 'SALIDA') {
            salidasMes++
          }
        })
      }

      // 3. Movimientos recientes
      const { data: recientes, error: errorRecientes } = await supabase
        .from('movimientos')
        .select('id, numero_movimiento, tipo_movimiento, fecha_registro, estado')
        .order('fecha_registro', { ascending: false })
        .limit(5)

      if (errorRecientes) throw errorRecientes

      // 4. Materiales con mayor demanda
      const { data: salidasDetalle, error: errorSalidas } = await supabase
        .from('detalle_movimientos')
        .select('cantidad, material_id, materiales(nombre), movimientos!inner(tipo_movimiento, estado)')
        .eq('movimientos.tipo_movimiento', 'SALIDA')
        .eq('movimientos.estado', 'Completada')

      if (errorSalidas) throw errorSalidas

      const demandaMap: Record<string, number> = {}

      if (salidasDetalle) {
        salidasDetalle.forEach((det: any) => {
          const nombre = det.materiales?.nombre || 'Desconocido'

          demandaMap[nombre] =
            (demandaMap[nombre] || 0) + Number(det.cantidad || 0)
        })
      }

      const topMats = Object.entries(demandaMap)
        .map(([nombre, cantidad_total]) => ({
          nombre,
          cantidad_total
        }))
        .sort((a, b) => b.cantidad_total - a.cantidad_total)
        .slice(0, 5)

      // 5. Gráfico referencial de los últimos meses
      const meses = [
        'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
        'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
      ]

      const mesActual = d.getMonth()

      const mockGrafico = [
        {
          name: meses[mesActual - 2] || 'Mes -2',
          Entradas: Math.floor(entradasMes * 0.8),
          Salidas: Math.floor(salidasMes * 0.6)
        },
        {
          name: meses[mesActual - 1] || 'Mes -1',
          Entradas: Math.floor(entradasMes * 1.2),
          Salidas: Math.floor(salidasMes * 1.1)
        },
        {
          name: meses[mesActual],
          Entradas: entradasMes,
          Salidas: salidasMes
        }
      ]

      setStats({
        totalMateriales: totalMat,
        valorInventario: valorInvertidoMes,
        alertasStock: alertas,
        entradasMes,
        salidasMes
      })

      setMovimientosRecientes(recientes || [])
      setTopMateriales(topMats)
      setDatosGrafico(mockGrafico)

    } catch (error) {
      console.error('Error cargando dashboard:', error)
    } finally {
      setCargando(false)
    }
  }

  const formatearFecha = (fechaISO: string) => {
    if (!fechaISO) return '-'

    return new Date(fechaISO).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const tarjetas = [
    {
      titulo: 'Materiales registrados',
      valor: stats.totalMateriales,
      icono: 'materiales',
      color: 'blue',
      descripcion: 'Materiales en catálogo'
    },
    {
      titulo: 'Alertas de stock',
      valor: stats.alertasStock,
      icono: 'alerta',
      color: 'red',
      descripcion: 'En nivel mínimo o inferior'
    },
    {
      titulo: 'Entradas del mes',
      valor: stats.entradasMes,
      icono: 'entrada',
      color: 'green',
      descripcion: 'Movimientos completados'
    },
    {
      titulo: 'Salidas del mes',
      valor: stats.salidasMes,
      icono: 'salida',
      color: 'indigo',
      descripcion: 'Despachos completados'
    }
  ]

  const colores: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-700',
    indigo: 'bg-indigo-50 text-indigo-700'
  }

  if (cargando) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#234675]" />
          <p className="mt-4 text-sm text-slate-500">
            Cargando información del almacén...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-7">

      {/* Bienvenida */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-400">
            Resumen general
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Panel de control
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Supervisa el estado y la actividad de tu almacén.
          </p>
        </div>

        <button
          onClick={cargarDatosDashboard}
          disabled={cargando}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          <Icono tipo="actualizar" />
          Actualizar datos
        </button>
      </section>

      {/* Indicadores */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tarjetas.map((tarjeta) => (
          <div
            key={tarjeta.titulo}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  {tarjeta.titulo}
                </p>

                <p className="mt-3 text-3xl font-bold tracking-tight text-slate-800">
                  {tarjeta.valor.toLocaleString('es-PE')}
                </p>
              </div>

              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${colores[tarjeta.color]}`}>
                <Icono tipo={tarjeta.icono} />
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              {tarjeta.descripcion}
            </p>
          </div>
        ))}
      </section>

      {/* Gráfico y ranking */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">

        {/* Gráfico */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-6">
            <h3 className="font-semibold text-slate-800">
              Flujo de movimientos
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Comparación referencial de entradas y salidas
            </p>
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={datosGrafico}
                margin={{ top: 10, right: 5, left: -20, bottom: 0 }}
                barGap={8}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E9EEF4"
                />

                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94A3B8', fontSize: 12 }}
                  dy={10}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                />

                <Tooltip
                  cursor={{ fill: '#F8FAFC' }}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 8px 20px rgba(15,23,42,0.06)',
                    fontSize: '12px'
                  }}
                />

                <Legend
                  iconType="circle"
                  wrapperStyle={{
                    fontSize: '12px',
                    paddingTop: '12px'
                  }}
                />

                <Bar
                  dataKey="Entradas"
                  fill="#16A34A"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={42}
                />

                <Bar
                  dataKey="Salidas"
                  fill="#315A8A"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={42}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top materiales */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-6">
            <h3 className="font-semibold text-slate-800">
              Materiales más solicitados
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Según las salidas registradas
            </p>
          </div>

          {topMateriales.length > 0 ? (
            <div className="space-y-5">
              {topMateriales.map((mat, index) => {
                const maximo = topMateriales[0].cantidad_total
                const porcentaje =
                  maximo > 0 ? (mat.cantidad_total / maximo) * 100 : 0

                return (
                  <div key={mat.nombre}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                          {index + 1}
                        </span>

                        <span
                          title={mat.nombre}
                          className="truncate text-xs font-semibold text-slate-700"
                        >
                          {mat.nombre}
                        </span>
                      </div>

                      <span className="shrink-0 text-xs font-bold text-slate-800">
                        {mat.cantidad_total.toLocaleString('es-PE')} und.
                      </span>
                    </div>

                    <div className="ml-9 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#315A8A] transition-all"
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex h-[230px] items-center justify-center text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                  <Icono tipo="materiales" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600">
                  Sin movimientos registrados
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Aquí aparecerán los materiales más solicitados.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Últimos movimientos */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-semibold text-slate-800">
              Últimos movimientos
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Actividad reciente del almacén
            </p>
          </div>

          <span className="w-fit rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
            Últimos 5 registros
          </span>
        </div>

        {movimientosRecientes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/70">
                <tr>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Código
                  </th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Tipo de movimiento
                  </th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Fecha
                  </th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Estado
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {movimientosRecientes.map((mov) => (
                  <tr
                    key={mov.id}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-semibold text-slate-700">
                      {mov.numero_movimiento || 'Sin código'}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                        mov.tipo_movimiento === 'ENTRADA'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          mov.tipo_movimiento === 'ENTRADA'
                            ? 'bg-emerald-500'
                            : 'bg-blue-500'
                        }`} />
                        {mov.tipo_movimiento}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">
                      {formatearFecha(mov.fecha_registro)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        mov.estado === 'Anulada'
                          ? 'bg-red-50 text-red-600'
                          : mov.estado === 'Completada'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}>
                        {mov.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            No hay movimientos registrados.
          </div>
        )}
      </section>

    </div>
  )
}
