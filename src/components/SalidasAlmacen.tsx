import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../supabaseClient'

const obtenerFechaLocal = () => {
  const hoy = new Date()
  hoy.setMinutes(hoy.getMinutes() - hoy.getTimezoneOffset())
  return hoy.toISOString().split('T')[0]
}

export default function SalidasAlmacen() {
  const [materiales, setMateriales] = useState<any[]>([])
  const [proyectos, setProyectos] = useState<any[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  
  // Filtros
  const [filtros, setFiltros] = useState({ busqueda: '', estado: 'Todos', fecha: '' })
  
  const [guardando, setGuardando] = useState(false)
  const [modalDetalle, setModalDetalle] = useState<any | null>(null)
  
  const [cabecera, setCabecera] = useState({
    fecha_movimiento: obtenerFechaLocal(),
    proyecto_id: '',
    usuario_responsable: '',
    guia_remision: '',
    observaciones: ''
  })
  
  const [detalles, setDetalles] = useState([{ material_id: '', cantidad: '' }])

  useEffect(() => { obtenerDatos() }, [])

  async function obtenerDatos() {
    const { data: mats, error: errorMats } = await supabase
      .from('materiales')
      .select('id, nombre, stock_actual, precio_unitario, categorias(nombre), unidades_medida(nombre), estado')
    
    if (errorMats) console.error('Error al cargar materiales:', errorMats.message)
    else setMateriales(mats?.filter(m => m.estado === 'Activo' || m.estado === 'ACTIVO') || [])
      
    const { data: proys } = await supabase.from('proyectos').select('id, nombre')
    if (proys) setProyectos(proys)

    const { data: movs } = await supabase
      .from('movimientos')
      .select(`
        id, codigo_correlativo, fecha_movimiento, usuario_responsable, guia_remision, estado,
        proyectos(nombre),
        detalle_movimientos(id, cantidad, precio_unitario, materiales(nombre, codigo, unidades_medida(nombre)))
      `)
      .eq('tipo_movimiento', 'SALIDA')
      .order('fecha_movimiento', { ascending: false })
      .limit(100)
    
    if (movs) setHistorial(movs)
  }

  // 1.1 Validar filas vacías
  const agregarFila = () => {
    const ultimaFila = detalles[detalles.length - 1]
    if (!ultimaFila.material_id) return alert('Selecciona un material en la última fila antes de agregar otra.')
    setDetalles([...detalles, { material_id: '', cantidad: '' }])
  }

  const eliminarFila = (index: number) => setDetalles(detalles.filter((_, i) => i !== index))

  const actualizarFila = (index: number, campo: string, valor: string) => {
    const nuevosDetalles = [...detalles]
    nuevosDetalles[index] = { ...nuevosDetalles[index], [campo]: valor }
    setDetalles(nuevosDetalles)
  }

  const materialesSeleccionados = detalles.map(d => d.material_id).filter(id => id !== '')

  // Resumen del despacho
  const detallesValidos = detalles.filter(d => d.material_id && d.cantidad !== '')
  const totalCantidades = detallesValidos.reduce((sum, d) => sum + Number(d.cantidad || 0), 0)

  async function registrarSalida(e: React.FormEvent) {
    e.preventDefault()
    if (guardando) return

    if (detallesValidos.length === 0) return alert('Agrega al menos un material con cantidad válida.')
    if (detallesValidos.some(d => isNaN(Number(d.cantidad)) || Number(d.cantidad) <= 0)) {
      return alert('Todas las cantidades deben ser números mayores a 0.')
    }

    setGuardando(true)

    const detallesParaSQL = detallesValidos.map(d => {
      const mat = materiales.find(m => m.id === d.material_id)
      return { material_id: d.material_id, cantidad: Number(d.cantidad), precio_unitario: mat?.precio_unitario || 0 }
    })

    const { error } = await supabase.rpc('gestionar_salida', {
      p_proyecto_id: cabecera.proyecto_id,
      p_usuario_responsable: cabecera.usuario_responsable,
      p_guia_remision: cabecera.guia_remision,
      p_observaciones: cabecera.observaciones,
      p_fecha_movimiento: cabecera.fecha_movimiento,
      p_detalles: detallesParaSQL
    })

    setGuardando(false)

    if (error) return alert('Error del servidor: ' + error.message)

    alert('Salida registrada con éxito')
    // 1.3 Restablecer con fecha actual dinámica
    setCabecera({ ...cabecera, fecha_movimiento: obtenerFechaLocal(), proyecto_id: '', usuario_responsable: '', guia_remision: '', observaciones: '' })
    setDetalles([{ material_id: '', cantidad: '' }])
    // 1.4 Await en la actualización
    await obtenerDatos()
  }

  async function anularMovimiento(id: string) {
    if (!confirm('¿Estás seguro de anular esta salida? El stock será devuelto al almacén inmediatamente.')) return
    
    const { error } = await supabase.rpc('anular_salida', { p_movimiento_id: id })
    if (error) alert('Error al anular: ' + error.message)
    else {
      alert('Movimiento anulado y stock repuesto.')
      await obtenerDatos()
      setModalDetalle(null)
    }
  }

  // Filtrado seguro de Historial
  const historialFiltrado = useMemo(() => {
    return historial.filter(m => {
      const cumpleBusqueda = filtros.busqueda === '' || 
        m.usuario_responsable?.toLowerCase().includes(filtros.busqueda.toLowerCase()) ||
        m.proyectos?.nombre?.toLowerCase().includes(filtros.busqueda.toLowerCase()) ||
        m.codigo_correlativo?.toLowerCase().includes(filtros.busqueda.toLowerCase())
      
      const cumpleEstado = filtros.estado === 'Todos' || m.estado === filtros.estado
      
      // Validación protegiendo contra valores null o undefined
      const cumpleFecha = filtros.fecha === '' || 
        (Boolean(m.fecha_movimiento) && String(m.fecha_movimiento).startsWith(filtros.fecha))

      return cumpleBusqueda && cumpleEstado && cumpleFecha
    })
  }, [historial, filtros])

  // KPIs
  const salidasCompletadas = historial.filter(m => m.estado === 'Completada')
  const totalProyectosAtendidos = new Set(salidasCompletadas.map(m => m.proyectos?.nombre)).size
  const totalMaterialesEntregados = salidasCompletadas.reduce((sum, m) => sum + (m.detalle_movimientos?.length || 0), 0)

  return (
    <div className="space-y-6">
      
      {/* TARJETAS DE INDICADORES (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm font-semibold text-gray-500">Salidas Completadas (Histórico)</p>
          <p className="text-2xl font-bold text-gray-800">{salidasCompletadas.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm font-semibold text-gray-500">Total Materiales Despachados</p>
          <p className="text-2xl font-bold text-blue-600">{totalMaterialesEntregados}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm font-semibold text-gray-500">Proyectos Atendidos</p>
          <p className="text-2xl font-bold text-green-600">{totalProyectosAtendidos}</p>
        </div>
      </div>

      {/* FORMULARIO DE REGISTRO */}
      <form onSubmit={registrarSalida} className="bg-white border shadow-sm rounded-xl p-6">
        <h3 className="font-bold text-lg border-b pb-2 mb-4">Nueva Salida de Almacén</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div><label className="block text-xs font-semibold mb-1">FECHA DE SALIDA</label><input type="date" required className="border p-2 w-full rounded" value={cabecera.fecha_movimiento} onChange={e => setCabecera({...cabecera, fecha_movimiento: e.target.value})} /></div>
          <div className="md:col-span-2"><label className="block text-xs font-semibold mb-1">PROYECTO DESTINO</label><select required className="border p-2 w-full rounded" value={cabecera.proyecto_id} onChange={e => setCabecera({...cabecera, proyecto_id: e.target.value})}><option value="">Selecciona...</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div><label className="block text-xs font-semibold mb-1">RESPONSABLE</label><input type="text" required className="border p-2 w-full rounded" value={cabecera.usuario_responsable} onChange={e => setCabecera({...cabecera, usuario_responsable: e.target.value})} /></div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg border">
          <h3 className="font-semibold mb-3">Materiales a Despachar</h3>
          {detalles.map((detalle, index) => {
            const matSeleccionado = materiales.find(m => m.id === detalle.material_id)
            const unidad = matSeleccionado?.unidades_medida?.nombre || 'U.M.'
            const stock = matSeleccionado ? matSeleccionado.stock_actual : 0
            // 1.2 Validación visual de stock
            const excedeStock = detalle.cantidad !== '' && Number(detalle.cantidad) > stock

            return (
              <div key={index} className="flex flex-wrap md:flex-nowrap gap-3 mb-3 items-center">
                <select 
                  className="border p-2 rounded flex-1 min-w-[200px]" 
                  value={detalle.material_id} 
                  onChange={e => actualizarFila(index, 'material_id', e.target.value)} required
                >
                  <option value="">Buscar material...</option>
                  {materiales.map(m => {
                    const yaSeleccionado = materialesSeleccionados.includes(m.id) && detalle.material_id !== m.id
                    return (
                      <option key={m.id} value={m.id} disabled={m.stock_actual <= 0 || yaSeleccionado}>
                        {m.nombre} | Disp: {m.stock_actual} {m.unidades_medida?.nombre} {yaSeleccionado ? '(En uso)' : ''}
                      </option>
                    )
                  })}
                </select>

                <div className="flex items-center gap-2">
                  <input 
                    type="number" min="0.1" step="0.1" required 
                    className={`border p-2 rounded w-28 text-right outline-none ${excedeStock ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-500' : 'focus:ring-blue-500'}`} 
                    value={detalle.cantidad} 
                    onChange={e => actualizarFila(index, 'cantidad', e.target.value)} 
                  />
                  <span className="text-sm font-medium w-12">{unidad}</span>
                </div>
                {excedeStock && <span className="text-xs text-red-600 font-semibold mt-1 md:mt-0">¡Excede stock!</span>}
                
                {detalles.length > 1 && (
                  <button type="button" onClick={() => eliminarFila(index)} className="text-red-500 font-bold p-2 ml-auto">X</button>
                )}
              </div>
            )
          })}
          <button type="button" onClick={agregarFila} className="text-blue-600 font-medium text-sm mt-2">+ Añadir fila</button>
        </div>

        {/* Resumen antes de confirmar */}
        <div className="mt-4 flex flex-col md:flex-row justify-between items-center gap-4 border-t pt-4">
          <div className="text-sm text-gray-600">
            <span className="font-semibold">Resumen:</span> {detallesValidos.length} material(es) | {totalCantidades.toFixed(2)} unidades en total.
          </div>
          <button type="submit" disabled={guardando} className="px-6 py-2.5 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 w-full md:w-auto">
            {guardando ? 'Guardando...' : 'Confirmar Salida'}
          </button>
        </div>
      </form>

      {/* SECCIÓN 2: HISTORIAL Y FILTROS AVANZADOS */}
      <div className="bg-white border shadow-sm rounded-xl overflow-hidden">
        <div className="p-5 border-b bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="font-bold text-lg">Historial de Salidas</h3>
          <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
            <input type="text" placeholder="Buscar texto, código..." className="border p-2 rounded text-sm w-48" value={filtros.busqueda} onChange={e => setFiltros({...filtros, busqueda: e.target.value})} />
            <input type="date" className="border p-2 rounded text-sm" value={filtros.fecha} onChange={e => setFiltros({...filtros, fecha: e.target.value})} />
            <select className="border p-2 rounded text-sm" value={filtros.estado} onChange={e => setFiltros({...filtros, estado: e.target.value})}>
              <option value="Todos">Todos los estados</option>
              <option value="Completada">Completadas</option>
              <option value="Anulada">Anuladas</option>
            </select>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3">Proyecto</th>
                <th className="px-5 py-3">Responsable</th>
                <th className="px-5 py-3">Materiales</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {historialFiltrado.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-500">No se encontraron movimientos.</td></tr>
              ) : (
                historialFiltrado.map(mov => (
                  <tr key={mov.id} className={`hover:bg-gray-50 ${mov.estado === 'Anulada' ? 'opacity-60 bg-gray-50' : ''}`}>
                    <td className="px-5 py-3 font-bold text-gray-700">{mov.codigo_correlativo || mov.id.slice(0, 8)}</td>
                    <td className="px-5 py-3">{new Date(mov.fecha_movimiento).toLocaleDateString()}</td>
                    <td className="px-5 py-3">{mov.proyectos?.nombre}</td>
                    <td className="px-5 py-3">{mov.usuario_responsable}</td>
                    <td className="px-5 py-3 text-center">{mov.detalle_movimientos?.length || 0}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${mov.estado === 'Completada' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {mov.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => setModalDetalle(mov)} className="text-blue-600 hover:underline font-medium">Detalle</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE DETALLE (Se mantiene igual que el anterior, mostrando modalDetalle.codigo_correlativo en lugar del ID abreviado) */}
      {modalDetalle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl overflow-hidden">
            <div className="p-5 border-b flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg">Detalle de {modalDetalle.codigo_correlativo || `Salida #${modalDetalle.id.slice(0, 8)}`}</h3>
              <button onClick={() => setModalDetalle(null)} className="text-gray-500 font-bold text-xl">&times;</button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                <p><span className="font-bold block text-xs text-gray-500">PROYECTO:</span> {modalDetalle.proyectos?.nombre}</p>
                <p><span className="font-bold block text-xs text-gray-500">RESPONSABLE:</span> {modalDetalle.usuario_responsable}</p>
                <p><span className="font-bold block text-xs text-gray-500">FECHA:</span> {new Date(modalDetalle.fecha_movimiento).toLocaleDateString()}</p>
                <p><span className="font-bold block text-xs text-gray-500">ESTADO:</span> {modalDetalle.estado}</p>
              </div>

              <h4 className="font-bold border-b pb-2 mb-3">Materiales Entregados</h4>
              <ul className="space-y-3">
                {modalDetalle.detalle_movimientos?.map((det: any) => (
                  <li key={det.id} className="flex justify-between bg-gray-50 p-3 rounded border">
                    <div>
                      <p className="font-semibold">{det.materiales?.nombre}</p>
                      <p className="text-xs text-gray-500">Cód: {det.materiales?.codigo || 'N/A'}</p>
                    </div>
                    <div className="font-bold text-lg">
                      {det.cantidad} <span className="text-sm font-normal text-gray-500">{det.materiales?.unidades_medida?.nombre}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-5 border-t bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setModalDetalle(null)} className="px-4 py-2 border rounded font-medium hover:bg-gray-100">Cerrar</button>
              {modalDetalle.estado !== 'Anulada' && (
                <button onClick={() => anularMovimiento(modalDetalle.id)} className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700">
                  Anular Salida
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}