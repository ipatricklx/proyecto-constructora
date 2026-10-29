import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function ReportesAlmacen() {
  const [pestañaActiva, setPestañaActiva] = useState('kardex')
  const [cargando, setCargando] = useState(false)

  // Estados para Kardex
  const [materiales, setMateriales] = useState<any[]>([])
  const [materialSeleccionado, setMaterialSeleccionado] = useState('')
  const [datosKardex, setDatosKardex] = useState<any[]>([])

  // Estados para Stock Crítico
  const [datosStock, setDatosStock] = useState<any[]>([])

  // Estados para Consumo por Proyecto
  const [proyectos, setProyectos] = useState<any[]>([])
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState('')
  const [fechaInicio, setFechaInicio] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().split('T')[0])
  const [datosConsumo, setDatosConsumo] = useState<any[]>([])
  const [costoTotalConsumo, setCostoTotalConsumo] = useState(0)

  useEffect(() => {
    cargarListasBase()
    if (pestañaActiva === 'stock') cargarStockCritico()
  }, [pestañaActiva])

  async function cargarListasBase() {
    const { data: mats } = await supabase.from('materiales').select('id, nombre, codigo').eq('estado', 'Activo')
    if (mats) setMateriales(mats)
    
    const { data: proys } = await supabase.from('proyectos').select('id, nombre')
    if (proys) setProyectos(proys)
  }

  // --- 1. KARDEX CON SALDO ACUMULADO PROGRESIVO ---
  async function cargarKardex() {
    if (!materialSeleccionado) return
    setCargando(true)

    // Consulta en orden ASCENDENTE para poder calcular el saldo contable
    const { data, error } = await supabase
      .from('movimientos')
      .select(`
        id, fecha_registro, tipo_movimiento, guia_remision, usuario_responsable,
        proyectos(nombre),
        detalle_movimientos!inner(cantidad, precio_unitario)
      `)
      .eq('detalle_movimientos.material_id', materialSeleccionado)
      .order('fecha_registro', { ascending: true })

    if (error) {
      console.error(error)
      setCargando(false)
      return
    }

    // Algoritmo de Saldo Acumulado
    let saldoMatematico = 0
    const kardexCalculado = (data || []).map((mov: any) => {
      const cant = Number(mov.detalle_movimientos[0]?.cantidad) || 0
      if (mov.tipo_movimiento === 'ENTRADA') {
        saldoMatematico += cant
      } else {
        saldoMatematico -= cant
      }
      return {
        ...mov,
        cantidadMovida: cant,
        saldoAcumulado: saldoMatematico
      }
    })

    // Invertimos la lista para presentar el registro más reciente arriba
    setDatosKardex(kardexCalculado.reverse())
    setCargando(false)
  }

  // --- 2. GESTIÓN DINÁMICA DE STOCK CRÍTICO ---
  async function cargarStockCritico() {
    setCargando(true)
    const { data } = await supabase
      .from('materiales')
      .select('id, codigo, nombre, stock_actual, stock_minimo, unidad_medida, categorias(nombre)')
      .eq('estado', 'Activo')

    if (data) {
      // Filtrar dinámicamente comparando stock_actual vs stock_minimo
      const criticos = data
        .filter((m: any) => Number(m.stock_actual) <= Number(m.stock_minimo || 0))
        .map((m: any) => ({
          ...m,
          deficit: Number(m.stock_minimo || 0) - Number(m.stock_actual)
        }))
        // Ordenar por mayor nivel de déficit
        .sort((a: any, b: any) => b.deficit - a.deficit)

      setDatosStock(criticos)
    }
    setCargando(false)
  }

  // --- 3. VALORIZACIÓN ECONÓMICA DEL CONSUMO POR PROYECTO ---
  async function cargarConsumo() {
    if (!proyectoSeleccionado || !fechaInicio || !fechaFin) return
    setCargando(true)
    
    const { data } = await supabase
      .from('movimientos')
      .select(`
        id, fecha_registro, guia_remision, usuario_responsable,
        detalle_movimientos(
          cantidad, 
          precio_unitario, 
          materiales(nombre, unidad_medida, codigo)
        )
      `)
      .eq('tipo_movimiento', 'SALIDA')
      .eq('proyecto_id', proyectoSeleccionado)
      .gte('fecha_registro', fechaInicio)
      .lte('fecha_registro', fechaFin)
      .order('fecha_registro', { ascending: false })

    if (data) {
      let acumuladoTotalPeriodo = 0

      const consumosProcesados = data.map((mov: any) => {
        let subtotalVale = 0
        const detallesValorizados = mov.detalle_movimientos.map((det: any) => {
          const cant = Number(det.cantidad) || 0
          const precio = Number(det.precio_unitario) || 0
          const totalLinea = cant * precio
          subtotalVale += totalLinea
          return { ...det, totalLinea }
        })

        acumuladoTotalPeriodo += subtotalVale

        return {
          ...mov,
          detalle_movimientos: detallesValorizados,
          subtotalVale
        }
      })

      setDatosConsumo(consumosProcesados)
      setCostoTotalConsumo(acumuladoTotalPeriodo)
    }
    setCargando(false)
  }

  // --- 4. EXPORTACIÓN DE DATOS A CSV/EXCEL (UTF-8) ---
  const exportarAExcel = () => {
    let csvContent = ''
    let filename = `reporte_${pestañaActiva}_${new Date().toISOString().split('T')[0]}.csv`

    if (pestañaActiva === 'kardex') {
      if (datosKardex.length === 0) return alert('No hay datos para exportar.')
      csvContent = 'Fecha,Tipo,Documento,Origen/Destino,Responsable,Cantidad Movida,Saldo Acumulado\n'
      datosKardex.forEach(row => {
        const dest = row.tipo_movimiento === 'ENTRADA' ? 'Almacen' : (row.proyectos?.nombre || '-')
        csvContent += `"${formatearFecha(row.fecha_registro)}","${row.tipo_movimiento}","${row.guia_remision || '-'}","${dest}","${row.usuario_responsable}",${row.cantidadMovida},${row.saldoAcumulado}\n`
      })
    } else if (pestañaActiva === 'stock') {
      if (datosStock.length === 0) return alert('No hay datos para exportar.')
      csvContent = 'Codigo,Material,Categoria,Stock Actual,Stock Minimo,Deficit,Unidad\n'
      datosStock.forEach(m => {
        csvContent += `"${m.codigo}","${m.nombre}","${m.categorias?.nombre || '-'} font",${m.stock_actual},${m.stock_minimo || 0},${m.deficit},"${m.unidad_medida}"\n`
      })
    } else if (pestañaActiva === 'consumo') {
      if (datosConsumo.length === 0) return alert('No hay datos para exportar.')
      csvContent = 'Fecha,Documento,Responsable,Material,Cantidad,Unidad,Precio Unitario (S/.),Subtotal (S/.)\n'
      datosConsumo.forEach(c => {
        c.detalle_movimientos.forEach((det: any) => {
          csvContent += `"${formatearFecha(c.fecha_registro)}","${c.guia_remision || '-'}","${c.usuario_responsable}","${det.materiales?.nombre}",${det.cantidad},"${det.materiales?.unidad_medida}",${det.precio_unitario || 0},${det.totalLinea.toFixed(2)}\n`
        })
      })
    }

    // Bom UTF-8 (\uFEFF) para garantizar correcta lectura de caracteres en español (tildes, ñ) en Excel
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const formatearFecha = (fecha: string) => new Date(fecha).toLocaleDateString('es-PE')
  const pestañaClases = (id: string) => `px-4 py-3 text-sm font-medium border-b-2 transition-colors ${pestañaActiva === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`

  return (
    <div className="space-y-6">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg shadow-sm border border-indigo-100">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Reportes y Consultas</h2>
            <p className="text-gray-500 text-sm">Analiza el movimiento, consumo y estado crítico de tu inventario.</p>
          </div>
        </div>

        {/* Botón Exportar CSV */}
        <button 
          onClick={exportarAExcel}
          className="bg-white border border-gray-300 text-gray-700 hover:bg-green-50 hover:text-green-700 hover:border-green-300 px-4 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm flex items-center gap-2"
        >
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-green-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Exportar CSV / Excel
        </button>
      </div>

      {/* Navegación de Pestañas */}
      <div className="bg-white border-b border-gray-200 shadow-sm rounded-t-xl px-4 pt-2">
        <nav className="flex space-x-6">
          <button onClick={() => setPestañaActiva('kardex')} className={pestañaClases('kardex')}>Kardex de Material</button>
          <button onClick={() => setPestañaActiva('stock')} className={pestañaClases('stock')}>Stock Crítico</button>
          <button onClick={() => setPestañaActiva('consumo')} className={pestañaClases('consumo')}>Consumo por Proyecto</button>
        </nav>
      </div>

      <div className="bg-white border border-gray-200 rounded-b-xl shadow-sm p-6 -mt-6">
        
        {/* PESTAÑA: KARDEX */}
        {pestañaActiva === 'kardex' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="w-full sm:w-1/2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Seleccionar Material</label>
                <select className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 bg-white" value={materialSeleccionado} onChange={e => setMaterialSeleccionado(e.target.value)}>
                  <option value="">Buscar material...</option>
                  {materiales.map(m => <option key={m.id} value={m.id}>{m.codigo} - {m.nombre}</option>)}
                </select>
              </div>
              <button onClick={cargarKardex} disabled={!materialSeleccionado || cargando} className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors">
                Generar Kardex
              </button>
            </div>

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Documento / Vale</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Origen / Destino</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Responsable</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-600">Cantidad</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-800 bg-gray-200/60">Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {datosKardex.map(k => (
                    <tr key={k.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatearFecha(k.fecha_registro)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${k.tipo_movimiento === 'ENTRADA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {k.tipo_movimiento}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800">{k.guia_remision || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{k.tipo_movimiento === 'ENTRADA' ? 'Almacén' : k.proyectos?.nombre || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{k.usuario_responsable}</td>
                      <td className={`px-4 py-3 text-right font-bold ${k.tipo_movimiento === 'ENTRADA' ? 'text-green-600' : 'text-red-600'}`}>
                        {k.tipo_movimiento === 'ENTRADA' ? '+' : '-'}{k.cantidadMovida}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-900 bg-blue-50/30">
                        {k.saldoAcumulado}
                      </td>
                    </tr>
                  ))}
                  {datosKardex.length === 0 && !cargando && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Selecciona un material para ver su historial con saldo acumulado.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PESTAÑA: STOCK CRÍTICO */}
        {pestañaActiva === 'stock' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center pb-2">
              <h3 className="text-gray-700 font-medium">Materiales con stock actual por debajo del límite mínimo</h3>
              <button onClick={cargarStockCritico} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                Actualizar
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {datosStock.map(m => (
                <div key={m.id} className="border border-red-200 bg-red-50/50 rounded-lg p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-bl-lg tracking-wider">
                    DÉFICIT: -{m.deficit}
                  </div>
                  <div className="text-xs text-red-500 font-mono mb-1 mt-1">{m.codigo}</div>
                  <div className="font-semibold text-gray-800 line-clamp-1" title={m.nombre}>{m.nombre}</div>
                  <div className="text-xs text-gray-500 mb-3">{m.categorias?.nombre}</div>
                  
                  <div className="flex justify-between items-end border-t border-red-100 pt-2">
                    <div>
                      <span className="block text-[10px] text-gray-400 font-semibold uppercase">Stock Mínimo</span>
                      <span className="text-xs font-bold text-gray-600">{m.stock_minimo || 0} {m.unidad_medida}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-red-500 font-semibold uppercase">Stock Actual</span>
                      <span className="text-xl font-black text-red-600 leading-none">{m.stock_actual}</span>
                    </div>
                  </div>
                </div>
              ))}
              {datosStock.length === 0 && !cargando && <div className="col-span-full py-8 text-center text-gray-500 border border-dashed border-gray-300 rounded-lg">No hay insumos en estado crítico en este momento.</div>}
            </div>
          </div>
        )}

        {/* PESTAÑA: CONSUMO POR PROYECTO */}
        {pestañaActiva === 'consumo' && (
          <div className="space-y-4">
             <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Proyecto</label>
                <select className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500 bg-white" value={proyectoSeleccionado} onChange={e => setProyectoSeleccionado(e.target.value)}>
                  <option value="">Seleccionar proyecto...</option>
                  {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Desde</label>
                <input type="date" className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Hasta</label>
                <input type="date" className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-blue-500" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
              </div>
              <div className="sm:col-span-4 flex justify-end mt-2">
                <button onClick={cargarConsumo} disabled={!proyectoSeleccionado || cargando} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-md transition-colors">
                  Generar Reporte
                </button>
              </div>
            </div>

            {/* Tarjeta Resumen Económico */}
            {datosConsumo.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">Costo Total Acumulado en el Periodo</span>
                  <span className="text-2xl font-black text-emerald-800">S/. {costoTotalConsumo.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="text-right text-xs text-emerald-600 font-medium">
                  {datosConsumo.length} {datosConsumo.length === 1 ? 'Vale de salida' : 'Vales de salida'}
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Documento</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Responsable</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-600">Materiales Extraídos</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-800">Costo Vale (S/.)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {datosConsumo.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-gray-600 align-top">{formatearFecha(c.fecha_registro)}</td>
                      <td className="px-4 py-4 text-gray-800 align-top">{c.guia_remision || 'Sin documento'}</td>
                      <td className="px-4 py-4 text-gray-600 align-top">{c.usuario_responsable}</td>
                      <td className="px-4 py-4">
                        <ul className="space-y-1">
                          {c.detalle_movimientos.map((det: any, idx: number) => (
                            <li key={idx} className="flex justify-between items-center text-xs border-b border-gray-100 pb-1">
                              <span className="text-gray-700 font-medium">{det.cantidad} {det.materiales?.unidad_medida} de {det.materiales?.nombre}</span>
                              <span className="text-gray-500 ml-4">(S/. {det.totalLinea.toFixed(2)})</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-700 align-top">
                        S/. {c.subtotalVale.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {datosConsumo.length === 0 && !cargando && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No hay retiros registrados para este proyecto en el rango de fechas.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}