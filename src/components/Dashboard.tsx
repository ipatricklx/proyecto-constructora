import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ totalMateriales: 0, valorInventario: 0, alertasStock: 0, entradasMes: 0, salidasMes: 0 })
  const [movimientosRecientes, setMovimientosRecientes] = useState<MovimientoReciente[]>([])
  const [topMateriales, setTopMateriales] = useState<MaterialDemanda[]>([])
  const [datosGrafico, setDatosGrafico] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarDatosDashboard()
  }, [])

  async function cargarDatosDashboard() {
    setCargando(true)
    try {
      const d = new Date()
      const primerDiaMes = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
      const ultimoDiaMes = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()

      // 1. Obtener Materiales (para Total, Alertas y Valor)
      // Nota: Asumo que tienes un campo de costo/precio en materiales o usamos 0 si no existe.
      const { data: mats } = await supabase.from('materiales').select('id, nombre, stock_actual, stock_minimo')
      
      let totalMat = 0
      let alertas = 0
      
      if (mats) {
        totalMat = mats.length
        alertas = mats.filter(m => m.stock_actual <= (m.stock_minimo || 0)).length
      }

      // 2. Obtener Movimientos del Mes actual (para Entradas/Salidas y Valor)
      const { data: movsMes } = await supabase
        .from('movimientos')
        .select('tipo_movimiento, detalle_movimientos(cantidad, precio_unitario)')
        .gte('fecha_registro', primerDiaMes)
        .lte('fecha_registro', ultimoDiaMes)
        .eq('estado', 'Completada')

      let entradasMes = 0
      let salidasMes = 0
      let valorInvertidoMes = 0

      if (movsMes) {
        movsMes.forEach(mov => {
          if (mov.tipo_movimiento === 'ENTRADA') {
            entradasMes++
            mov.detalle_movimientos?.forEach((det: any) => valorInvertidoMes += (det.cantidad * (det.precio_unitario || 0)))
          } else if (mov.tipo_movimiento === 'SALIDA') {
            salidasMes++
          }
        })
      }

      // 3. Obtener Últimos Movimientos (Tabla rápida)
      const { data: recientes } = await supabase
        .from('movimientos')
        .select('id, numero_movimiento, tipo_movimiento, fecha_registro, estado')
        .order('fecha_registro', { ascending: false })
        .limit(5)

      // 4. Calcular Materiales con Mayor Demanda (Histórico o Mensual)
      const { data: salidasDetalle } = await supabase
        .from('detalle_movimientos')
        .select('cantidad, material_id, materiales(nombre), movimientos!inner(tipo_movimiento, estado)')
        .eq('movimientos.tipo_movimiento', 'SALIDA')
        .eq('movimientos.estado', 'Completada')

      const demandaMap: Record<string, number> = {}
      if (salidasDetalle) {
        salidasDetalle.forEach((det: any) => {
          const nombre = det.materiales?.nombre || 'Desconocido'
          demandaMap[nombre] = (demandaMap[nombre] || 0) + det.cantidad
        })
      }
      
      const topMats = Object.entries(demandaMap)
        .map(([nombre, cantidad_total]) => ({ nombre, cantidad_total }))
        .sort((a, b) => b.cantidad_total - a.cantidad_total)
        .slice(0, 5)

      // 5. Preparar datos para el gráfico (Ejemplo últimos 3 meses, o puedes hacerlo fijo)
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
      const mesActual = d.getMonth()
      const mockGrafico = [
        { name: meses[mesActual - 2] || 'Mes -2', Entradas: Math.floor(entradasMes * 0.8), Salidas: Math.floor(salidasMes * 0.6) },
        { name: meses[mesActual - 1] || 'Mes -1', Entradas: Math.floor(entradasMes * 1.2), Salidas: Math.floor(salidasMes * 1.1) },
        { name: meses[mesActual], Entradas: entradasMes, Salidas: salidasMes },
      ]

      // Actualizar estados
      setStats({ 
        totalMateriales: totalMat, 
        valorInventario: valorInvertidoMes, // Si tienes una función en BD para el valor real, reemplázalo aquí
        alertasStock: alertas, 
        entradasMes, 
        salidasMes 
      })
      setMovimientosRecientes(recientes || [])
      setTopMateriales(topMats)
      setDatosGrafico(mockGrafico)

    } catch (error) {
      console.error("Error cargando dashboard:", error)
    } finally {
      setCargando(false)
    }
  }

  const formatearFecha = (fechaISO: string) => {
    if (!fechaISO) return '-'
    const d = new Date(fechaISO)
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (cargando) return <div className="p-10 text-center text-gray-500">Cargando indicadores...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Panel de Control</h2>
        <button onClick={cargarDatosDashboard} className="text-sm bg-white border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 flex items-center gap-2 transition-colors">
          Actualizar Datos
        </button>
      </div>

      {/* 1. KPIs SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-gray-600">
          <p className="text-sm font-medium text-gray-500">Materiales Registrados</p>
          <p className="text-3xl font-bold text-gray-800 mt-2">{stats.totalMateriales}</p>
        </div>
        
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-red-500 bg-red-50/30">
          <p className="text-sm font-medium text-red-600">Materiales en Riesgo (Stock)</p>
          <p className="text-3xl font-bold text-red-700 mt-2">{stats.alertasStock}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-emerald-500">
          <p className="text-sm font-medium text-gray-500">Entradas del Mes</p>
          <p className="text-3xl font-bold text-emerald-600 mt-2">{stats.entradasMes}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm border-l-4 border-l-blue-500">
          <p className="text-sm font-medium text-gray-500">Salidas / Despachos (Mes)</p>
          <p className="text-3xl font-bold text-blue-600 mt-2">{stats.salidasMes}</p>
        </div>
      </div>

      {/* 2. SECCIÓN MEDIA: Gráfico y Top Materiales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Gráfico */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-700 mb-4">Flujo de Movimientos (Últimos Meses)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosGrafico} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}} />
                <Bar dataKey="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                <Bar dataKey="Salidas" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Materiales */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="font-bold text-gray-700 mb-4">Materiales más solicitados</h3>
          {topMateriales.length > 0 ? (
            <div className="space-y-4">
              {topMateriales.map((mat, index) => (
                <div key={index} className="flex justify-between items-center border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">{index + 1}</span>
                    <span className="text-sm font-medium text-gray-700 truncate max-w-[150px]">{mat.nombre}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{mat.cantidad_total} und.</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-10">No hay datos suficientes</p>
          )}
        </div>
      </div>

      {/* 3. SECCIÓN INFERIOR: Últimos Movimientos */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <h3 className="font-bold text-gray-700">Últimos Movimientos Registrados</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {movimientosRecientes.map((mov) => (
                <tr key={mov.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-sm font-bold text-gray-700">{mov.numero_movimiento}</td>
                  <td className="px-6 py-3 text-sm">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${mov.tipo_movimiento === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      {mov.tipo_movimiento}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-500">{formatearFecha(mov.fecha_registro)}</td>
                  <td className="px-6 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${mov.estado === 'Anulada' ? 'text-red-600 bg-red-50' : 'text-gray-600 bg-gray-100'}`}>
                      {mov.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}