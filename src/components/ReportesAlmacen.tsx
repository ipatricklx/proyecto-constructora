import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// --- FUNCIONES AUXILIARES ---
const getFechaLocalHoy = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().split('T')[0]
}

const getFechaPrimerDiaMes = () => {
  const d = new Date()
  d.setDate(1)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().split('T')[0]
}

const formatearFechaLocal = (fechaISO: string) => {
  if (!fechaISO) return '-'
  const [year, month, day] = fechaISO.split('T')[0].split('-')
  return `${day}/${month}/${year}`
}

interface AtributoNombre { nombre: string }
const getNombreAtributo = (relacion?: AtributoNombre | AtributoNombre[]) => {
  if (!relacion) return '-'
  return Array.isArray(relacion) ? relacion[0]?.nombre || '-' : relacion?.nombre || '-'
}

const escaparCSV = (val: any) => {
  if (val === null || val === undefined) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

export default function ReportesAlmacen() {
  const [pestañaActiva, setPestañaActiva] = useState<'kardex' | 'stock' | 'consumo' | 'ml_demanda'>('kardex')
  const [cargando, setCargando] = useState(false)

  // Listas Base
  const [materiales, setMateriales] = useState<any[]>([])
  const [proyectos, setProyectos] = useState<any[]>([])

  // Kardex
  const [materialSeleccionado, setMaterialSeleccionado] = useState('')
  const [datosKardex, setDatosKardex] = useState<any[]>([])
  const [resumenKardex, setResumenKardex] = useState({ totalEntradas: 0, totalSalidas: 0, saldoFinal: 0 })

  // Stock Crítico
  const [datosStock, setDatosStock] = useState<any[]>([])
  const [materialesSinMinimo, setMaterialesSinMinimo] = useState<any[]>([])

  // Consumo por Proyecto
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState('')
  const [fechaInicio, setFechaInicio] = useState(getFechaPrimerDiaMes())
  const [fechaFin, setFechaFin] = useState(getFechaLocalHoy())
  const [datosConsumo, setDatosConsumo] = useState<any[]>([])
  const [costoTotalConsumo, setCostoTotalConsumo] = useState(0)

  // Demanda Histórica para ML
  const [datosML, setDatosML] = useState<any[]>([])
  const [filtroAñoML, setFiltroAñoML] = useState<string>(new Date().getFullYear().toString())

  useEffect(() => {
    cargarListasBase()
    if (pestañaActiva === 'stock') cargarStockCritico()
    if (pestañaActiva === 'ml_demanda') cargarDemandaHistoricaML()
  }, [pestañaActiva])

  const handleMaterialKardexChange = (id: string) => {
    setMaterialSeleccionado(id)
    setDatosKardex([])
    setResumenKardex({ totalEntradas: 0, totalSalidas: 0, saldoFinal: 0 })
  }

  const handleProyectoConsumoChange = (id: string) => {
    setProyectoSeleccionado(id)
    setDatosConsumo([])
    setCostoTotalConsumo(0)
  }

  async function cargarListasBase() {
    try {
      const [resMats, resProys] = await Promise.all([
        supabase.from('materiales').select('id, nombre, codigo, stock_actual, unidades_medida(nombre)').or('estado.eq.Activo,estado.eq.ACTIVO').order('nombre', { ascending: true }),
        supabase.from('proyectos').select('id, nombre').order('nombre', { ascending: true })
      ])

      if (resMats.error) throw resMats.error
      if (resProys.error) throw resProys.error

      setMateriales(resMats.data || [])
      setProyectos(resProys.data || [])
    } catch (err: any) {
      alert('Error al cargar listas base: ' + err.message)
    }
  }

  // --- 1. KARDEX CONSULTANDO VISTA SQL PRE-ORDENADA ---
  async function cargarKardex() {
    if (!materialSeleccionado) return
    setCargando(true)

    try {
      const { data, error } = await supabase
        .from('vista_kardex')
        .select('*')
        .eq('material_id', materialSeleccionado)
        .order('fecha_movimiento', { ascending: true })
        .order('fecha_registro', { ascending: true })
        .order('detalle_id', { ascending: true })

      if (error) throw error

      let entradasSum = 0
      let salidasSum = 0

      const calculados = (data || []).map((row: any) => {
        const cant = Number(row.cantidad) || 0
        if (row.tipo_movimiento === 'ENTRADA') entradasSum += cant
        else if (row.tipo_movimiento === 'SALIDA') salidasSum += cant

        return {
          id: row.detalle_id,
          movimiento_id: row.movimiento_id,
          codigo_correlativo: row.codigo_correlativo,
          fecha: row.fecha_movimiento || row.fecha_registro.split('T')[0],
          tipo_movimiento: row.tipo_movimiento,
          documento: row.documento,
          destino: row.origen_destino,
          responsable: row.responsable,
          cantidadMovida: cant,
          saldoAcumulado: Number(row.saldo_acumulado) // Calculado con precisión NUMERIC en PostgreSQL
        }
      })

      const saldoFinalReal = calculados.length > 0 ? calculados[calculados.length - 1].saldoAcumulado : 0

      setResumenKardex({
        totalEntradas: Number(entradasSum.toFixed(4)),
        totalSalidas: Number(salidasSum.toFixed(4)),
        saldoFinal: saldoFinalReal
      })
      
      setDatosKardex(calculados.reverse())
    } catch (err: any) {
      alert('Error al generar Kardex: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  // --- 2. GESTIÓN DE STOCK CRÍTICO ---
  async function cargarStockCritico() {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('materiales')
        .select('id, codigo, nombre, stock_actual, stock_minimo, categorias(nombre), unidades_medida(nombre)')
        .or('estado.eq.Activo,estado.eq.ACTIVO')

      if (error) throw error

      if (data) {
        const criticos = data
          .filter((m: any) => m.stock_minimo !== null && m.stock_minimo !== undefined && Number(m.stock_actual) <= Number(m.stock_minimo))
          .map((m: any) => ({ ...m, deficit: Number(m.stock_minimo) - Number(m.stock_actual) }))
          .sort((a: any, b: any) => b.deficit - a.deficit)

        const sinMinimo = data.filter((m: any) => m.stock_minimo === null || m.stock_minimo === undefined)

        setDatosStock(criticos)
        setMaterialesSinMinimo(sinMinimo)
      }
    } catch (err: any) {
      alert('Error al cargar stock crítico: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  // --- 3. CONSUMO CON VALIDACIÓN STRICT DE FECHAS ---
  async function cargarConsumo() {
    if (!proyectoSeleccionado) return alert('Selecciona un proyecto.')
    if (fechaInicio > fechaFin) return alert('La fecha inicial no puede ser posterior a la fecha final.')
    
    setCargando(true)

    try {
      const { data, error } = await supabase
        .from('movimientos')
        .select(`
          id, codigo_correlativo, fecha_movimiento, fecha_registro, guia_remision, usuario_responsable,
          detalle_movimientos (
            cantidad, precio_unitario,
            materiales(nombre, codigo, unidades_medida(nombre))
          )
        `)
        .eq('tipo_movimiento', 'SALIDA')
        .eq('estado', 'Completada')
        .eq('proyecto_id', proyectoSeleccionado)
        .gte('fecha_movimiento', fechaInicio)
        .lte('fecha_movimiento', fechaFin)
        .order('fecha_movimiento', { ascending: false })

      if (error) throw error

      if (data) {
        let acumuladoPeriodo = 0
        const procesados = data.map((mov: any) => {
          let subtotalVale = 0
          const detallesValorizados = (mov.detalle_movimientos || []).map((det: any) => {
            const cant = Number(det.cantidad) || 0
            const precio = Number(det.precio_unitario) || 0
            const totalLinea = cant * precio
            subtotalVale += totalLinea
            return { ...det, cant, precio, totalLinea }
          })

          acumuladoPeriodo += subtotalVale

          return {
            ...mov,
            fecha: mov.fecha_movimiento || mov.fecha_registro.split('T')[0],
            detalle_movimientos: detallesValorizados,
            subtotalVale
          }
        })

        setDatosConsumo(procesados)
        setCostoTotalConsumo(acumuladoPeriodo)
      }
    } catch (err: any) {
      alert('Error al consultar consumo: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  // --- 4. DATASET ML CONSULTANDO VISTA SQL (ZERO-FILLED) ---
  async function cargarDemandaHistoricaML() {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('vista_demanda_mensual_ml')
        .select('*')

      if (error) throw error
      setDatosML(data || [])
    } catch (err: any) {
      alert('Error al obtener dataset para ML: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  // --- EXPORTACIÓN CSV ESCAPADA CON URL REVOKE ---
  const exportarAExcel = () => {
    let csvContent = ''
    const fechaHoyStr = getFechaLocalHoy()
    const filename = `reporte_${pestañaActiva}_${fechaHoyStr}.csv`

    if (pestañaActiva === 'kardex') {
      if (datosKardex.length === 0) return alert('No hay datos en Kardex para exportar.')
      const mat = materiales.find(m => m.id === materialSeleccionado)
      csvContent = `Reporte Kardex Material: ${escaparCSV(mat?.nombre)}\n`
      csvContent += 'Codigo Movimiento,Fecha,Tipo,Documento,Origen/Destino,Responsable,Cantidad Movida,Saldo Acumulado\n'
      datosKardex.forEach(row => {
        csvContent += `${escaparCSV(row.codigo_correlativo)},${escaparCSV(formatearFechaLocal(row.fecha))},${escaparCSV(row.tipo_movimiento)},${escaparCSV(row.documento)},${escaparCSV(row.destino)},${escaparCSV(row.responsable)},${row.cantidadMovida},${row.saldoAcumulado}\n`
      })
    } else if (pestañaActiva === 'stock') {
      if (datosStock.length === 0) return alert('No hay datos de Stock Crítico para exportar.')
      csvContent = 'Codigo,Material,Categoria,Stock Actual,Stock Minimo,Deficit,Unidad Medida\n'
      datosStock.forEach(m => {
        csvContent += `${escaparCSV(m.codigo)},${escaparCSV(m.nombre)},${escaparCSV(getNombreAtributo(m.categorias))},${m.stock_actual},${m.stock_minimo},${m.deficit},${escaparCSV(getNombreAtributo(m.unidades_medida))}\n`
      })
    } else if (pestañaActiva === 'consumo') {
      if (datosConsumo.length === 0) return alert('No hay datos de consumo para exportar.')
      const proy = proyectos.find(p => p.id === proyectoSeleccionado)
      csvContent = `Reporte Consumo Proyecto: ${escaparCSV(proy?.nombre)} (Desde: ${fechaInicio} Hasta: ${fechaFin})\n`
      csvContent += 'Codigo Movimiento,Fecha,Documento,Responsable,Codigo Material,Material,Cantidad,Unidad,Precio Unitario (S/),Subtotal (S/)\n'
      datosConsumo.forEach(c => {
        c.detalle_movimientos.forEach((det: any) => {
          csvContent += `${escaparCSV(c.codigo_correlativo)},${escaparCSV(formatearFechaLocal(c.fecha))},${escaparCSV(c.guia_remision)},${escaparCSV(c.usuario_responsable)},${escaparCSV(det.materiales?.codigo)},${escaparCSV(det.materiales?.nombre)},${det.cant},${escaparCSV(getNombreAtributo(det.materiales?.unidades_medida))},${det.precio.toFixed(2)},${det.totalLinea.toFixed(2)}\n`
        })
      })
    } else if (pestañaActiva === 'ml_demanda') {
      if (datosML.length === 0) return alert('No hay datos de demanda histórica para exportar.')
      csvContent = 'Periodo (YYYY-MM),Codigo Material,Nombre Material,Unidad Medida,Total Demandado,Nro Despachos\n'
      datosMLFiltrados.forEach(row => {
        csvContent += `${escaparCSV(row.periodo)},${escaparCSV(row.codigo)},${escaparCSV(row.nombre)},${escaparCSV(row.unidad_medida)},${row.total_demandado},${row.nro_despachos}\n`
      })
    }

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const pestañaClases = (id: string) => `px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${pestañaActiva === id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`
  const materialActualObj = materiales.find(m => m.id === materialSeleccionado)

  const datosMLFiltrados = datosML.filter(row => !filtroAñoML || row.periodo.startsWith(filtroAñoML))

  return (
    <div className="space-y-6">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Reportes y Analítica</h2>
            <p className="text-gray-500 text-sm">Consultas de Kardex, alertas de reabastecimiento, consumo y preparación de datos para ML.</p>
          </div>
        </div>

        <button 
          onClick={exportarAExcel}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm flex items-center gap-2"
        >
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Exportar CSV / Excel
        </button>
      </div>

      {/* PESTAÑAS DE NAVEGACIÓN */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50/50 px-4 pt-2 overflow-x-auto">
          <nav className="flex space-x-2">
            <button onClick={() => setPestañaActiva('kardex')} className={pestañaClases('kardex')}>Kardex de Material</button>
            <button onClick={() => setPestañaActiva('stock')} className={pestañaClases('stock')}>Stock Crítico</button>
            <button onClick={() => setPestañaActiva('consumo')} className={pestañaClases('consumo')}>Consumo por Proyecto</button>
            <button onClick={() => setPestañaActiva('ml_demanda')} className={pestañaClases('ml_demanda')}>
              <span className="bg-indigo-100 text-indigo-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded">ML</span>
              Demanda Histórica (Zero-filled)
            </button>
          </nav>
        </div>

        <div className="p-6">
          
          {/* PESTAÑA 1: KARDEX */}
          {pestañaActiva === 'kardex' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 items-end bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="w-full sm:w-2/3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Seleccionar Material *</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500" 
                    value={materialSeleccionado} 
                    onChange={e => handleMaterialKardexChange(e.target.value)}
                  >
                    <option value="">Buscar material...</option>
                    {materiales.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.codigo ? `[${m.codigo}] ` : ''}{m.nombre} (Stock actual: {m.stock_actual} {getNombreAtributo(m.unidades_medida)})
                      </option>
                    ))}
                  </select>
                </div>
                <button 
                  onClick={cargarKardex} 
                  disabled={!materialSeleccionado || cargando} 
                  className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                  {cargando ? 'Calculando...' : 'Generar Kardex'}
                </button>
              </div>

              {datosKardex.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-green-50/60 border border-green-200 p-4 rounded-xl">
                    <span className="text-xs font-semibold text-green-700 uppercase">Total Entradas</span>
                    <p className="text-2xl font-bold text-green-800">+{resumenKardex.totalEntradas} {getNombreAtributo(materialActualObj?.unidades_medida)}</p>
                  </div>
                  <div className="bg-red-50/60 border border-red-200 p-4 rounded-xl">
                    <span className="text-xs font-semibold text-red-700 uppercase">Total Salidas</span>
                    <p className="text-2xl font-bold text-red-800">-{resumenKardex.totalSalidas} {getNombreAtributo(materialActualObj?.unidades_medida)}</p>
                  </div>
                  <div className="bg-blue-50/60 border border-blue-200 p-4 rounded-xl">
                    <span className="text-xs font-semibold text-blue-700 uppercase">Saldo Calculado</span>
                    <p className="text-2xl font-bold text-blue-900">{resumenKardex.saldoFinal} {getNombreAtributo(materialActualObj?.unidades_medida)}</p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Código</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Fecha Mov.</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Tipo</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Documento</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Origen / Destino</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Responsable</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-600 uppercase text-xs">Cantidad</th>
                      <th className="px-4 py-3 text-right font-bold text-blue-900 bg-blue-100/50 uppercase text-xs">Saldo Acum.</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {datosKardex.map(k => (
                      <tr key={k.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-700">{k.codigo_correlativo}</td>
                        <td className="px-4 py-3 text-gray-600">{formatearFechaLocal(k.fecha)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${k.tipo_movimiento === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {k.tipo_movimiento}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-800 font-medium">{k.documento}</td>
                        <td className="px-4 py-3 text-gray-600">{k.destino}</td>
                        <td className="px-4 py-3 text-gray-600">{k.responsable}</td>
                        <td className={`px-4 py-3 text-right font-bold ${k.tipo_movimiento === 'ENTRADA' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {k.tipo_movimiento === 'ENTRADA' ? '+' : '-'}{k.cantidadMovida}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-blue-900 bg-blue-50/50">
                          {k.saldoAcumulado}
                        </td>
                      </tr>
                    ))}
                    {datosKardex.length === 0 && !cargando && (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">Selecciona un material y presiona "Generar Kardex".</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PESTAÑA 2: STOCK CRÍTICO */}
          {pestañaActiva === 'stock' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-2 border-b">
                <h3 className="text-gray-700 font-semibold text-sm uppercase tracking-wider">Alertas de Reposición (Stock actual ≤ Stock mínimo)</h3>
                <button onClick={cargarStockCritico} disabled={cargando} className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1">
                  {cargando ? 'Actualizando...' : 'Actualizar Lista'}
                </button>
              </div>

              {cargando ? (
                <div className="py-12 text-center text-gray-500">Cargando datos de inventario...</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {datosStock.map(m => (
                      <div key={m.id} className="border border-red-200 bg-red-50/40 rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between">
                        <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">
                          DÉFICIT: -{m.deficit}
                        </div>
                        <div>
                          <span className="text-xs text-red-500 font-mono font-bold block mb-1">{m.codigo || 'SIN-CÓDIGO'}</span>
                          <h4 className="font-bold text-gray-800 line-clamp-2" title={m.nombre}>{m.nombre}</h4>
                          <span className="text-xs text-gray-500 block mb-3">{getNombreAtributo(m.categorias)}</span>
                        </div>
                        
                        <div className="flex justify-between items-end border-t border-red-100 pt-3">
                          <div>
                            <span className="block text-[10px] text-gray-500 font-bold uppercase">Stock Mínimo</span>
                            <span className="text-xs font-bold text-gray-700">{m.stock_minimo} {getNombreAtributo(m.unidades_medida)}</span>
                          </div>
                          <div className="text-right">
                            <span className="block text-[10px] text-red-600 font-bold uppercase">Stock Actual</span>
                            <span className="text-2xl font-extrabold text-red-600 leading-none">{m.stock_actual}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {datosStock.length === 0 && (
                      <div className="col-span-full py-10 text-center text-gray-500 border border-dashed border-gray-300 rounded-xl">
                        No hay materiales en stock crítico con mínimo configurado.
                      </div>
                    )}
                  </div>

                  {materialesSinMinimo.length > 0 && (
                    <div className="mt-8 border-t pt-4">
                      <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">
                        ⚠️ Materiales sin Stock Mínimo Configurado ({materialesSinMinimo.length})
                      </h4>
                      <p className="text-xs text-gray-500 mb-3">Asigna un valor en la tabla de materiales para activar las alertas automáticas de estos insumos.</p>
                      <div className="flex flex-wrap gap-2">
                        {materialesSinMinimo.map(m => (
                          <span key={m.id} className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-2.5 py-1 rounded-md font-medium">
                            {m.nombre} (Stock: {m.stock_actual})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* PESTAÑA 3: CONSUMO POR PROYECTO */}
          {pestañaActiva === 'consumo' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end bg-gray-50 p-4 rounded-xl border border-gray-200">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Proyecto Destino *</label>
                  <select 
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500" 
                    value={proyectoSeleccionado} 
                    onChange={e => handleProyectoConsumoChange(e.target.value)}
                  >
                    <option value="">Seleccionar proyecto...</option>
                    {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Desde *</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Hasta *</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
                </div>
                <div className="sm:col-span-4 flex justify-end">
                  <button 
                    onClick={cargarConsumo} 
                    disabled={!proyectoSeleccionado || cargando} 
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    {cargando ? 'Generando...' : 'Consultar Consumo'}
                  </button>
                </div>
              </div>

              {datosConsumo.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider block">Costo Total Despachado</span>
                    <span className="text-3xl font-extrabold text-emerald-900">S/ {costoTotalConsumo.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="text-sm font-semibold text-emerald-700 bg-emerald-100/60 px-3 py-1.5 rounded-lg border border-emerald-200">
                    {datosConsumo.length} {datosConsumo.length === 1 ? 'Salida Registrada' : 'Salidas Registradas'}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Código / Documento</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Fecha Mov.</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Responsable</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Materiales Despachados</th>
                      <th className="px-4 py-3 text-right font-bold text-emerald-800 uppercase text-xs">Total Vale (S/)</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {datosConsumo.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-4 align-top">
                          <div className="font-bold text-gray-800">{c.codigo_correlativo || c.id.slice(0,8)}</div>
                          <div className="text-xs text-gray-500">{c.guia_remision || 'Sin documento'}</div>
                        </td>
                        <td className="px-4 py-4 text-gray-600 align-top">{formatearFechaLocal(c.fecha)}</td>
                        <td className="px-4 py-4 text-gray-700 font-medium align-top">{c.usuario_responsable}</td>
                        <td className="px-4 py-4">
                          <div className="space-y-1.5">
                            {c.detalle_movimientos.map((det: any, idx: number) => (
                              <div key={idx} className="flex justify-between items-center text-xs border-b border-gray-100 pb-1">
                                <span className="text-gray-800 font-medium">
                                  {det.cant} {getNombreAtributo(det.materiales?.unidades_medida)} — <span className="text-gray-600">{det.materiales?.nombre}</span>
                                </span>
                                <span className="text-gray-500 ml-4 font-mono">(S/ {det.totalLinea.toFixed(2)})</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-emerald-700 align-top text-base">
                          S/ {c.subtotalVale.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {datosConsumo.length === 0 && !cargando && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">Selecciona un proyecto y presiona "Consultar Consumo".</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PESTAÑA 4: DEMANDA HISTÓRICA AGRUPADA (DATASET ML) */}
          {pestañaActiva === 'ml_demanda' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-indigo-50/60 border border-indigo-200 p-4 rounded-xl">
                <div>
                  <h3 className="font-bold text-indigo-900 text-base">Consumo Histórico Agrupado (Dataset ML)</h3>
                  <p className="text-xs text-indigo-700">Demanda real mensual basada en Vistas SQL con relleno automático de meses sin consumo ($0$).</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-indigo-900 uppercase">Filtrar Año:</label>
                  <input 
                    type="number" placeholder="Ej. 2026" className="border border-indigo-300 rounded-lg p-2 text-sm w-28 bg-white font-bold" 
                    value={filtroAñoML} onChange={e => setFiltroAñoML(e.target.value)} 
                  />
                  <button onClick={cargarDemandaHistoricaML} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors">
                    Recargar
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Periodo (Mes-Año)</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Código Material</th>
                      <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase text-xs">Nombre del Material</th>
                      <th className="px-4 py-3 text-right font-bold text-indigo-900 uppercase text-xs">Demanda Total</th>
                      <th className="px-4 py-3 text-right font-bold text-gray-600 uppercase text-xs">Despachos</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {datosMLFiltrados.map((row, idx) => (
                      <tr key={idx} className={`hover:bg-indigo-50/30 transition-colors ${row.total_demandado === 0 ? 'bg-gray-50/50 opacity-60' : ''}`}>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700">{row.periodo}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.codigo}</td>
                        <td className="px-4 py-3 font-semibold text-gray-800">{row.nombre}</td>
                        <td className={`px-4 py-3 text-right font-extrabold text-base ${row.total_demandado === 0 ? 'text-gray-400' : 'text-indigo-900'}`}>
                          {row.total_demandado} <span className="text-xs font-normal text-gray-500">{row.unidad_medida}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-600">{row.nro_despachos} vales</td>
                      </tr>
                    ))}
                    {datosMLFiltrados.length === 0 && !cargando && (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">No hay registros de demanda para el filtro seleccionado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}