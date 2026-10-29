import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function SalidasAlmacen() {
  const [materiales, setMateriales] = useState<any[]>([])
  const [proyectos, setProyectos] = useState<any[]>([])
  const [salidas, setSalidas] = useState<any[]>([])
  const [modalDetalle, setModalDetalle] = useState<any | null>(null)
  
  // Estado de cabecera
  const [cabecera, setCabecera] = useState({
    fecha: new Date().toISOString().split('T')[0],
    proyecto_id: '',
    usuario: '',
    documento: '', // Ej. Vale de salida 001
    observaciones: ''
  })

  // Estado del detalle dinámico (se agrega precio_unitario)
  const [detalles, setDetalles] = useState([{ material_id: '', cantidad: '', stock_actual: 0, unidad: '', precio_unitario: 0 }])

  useEffect(() => { obtenerDatos() }, [])

  async function obtenerDatos() {
    // Cargar materiales con stock > 0 incluyendo precio_unitario
    const { data: mats } = await supabase
      .from('materiales')
      .select('id, nombre, codigo, stock_actual, unidad_medida, precio_unitario')
      .eq('estado', 'Activo')
    if (mats) setMateriales(mats)
      
    // Cargar proyectos
    const { data: proys } = await supabase.from('proyectos').select('id, nombre')
    if (proys) setProyectos(proys)

    // Cargar historial de salidas
    const { data: movs } = await supabase.from('movimientos')
      .select('*, proyectos(nombre), detalle_movimientos(*, materiales(nombre, unidad_medida, codigo))')
      .eq('tipo_movimiento', 'SALIDA')
      .order('fecha_registro', { ascending: false })
    if (movs) setSalidas(movs)
  }

  // --- Lógica de Filas Dinámicas ---
  const agregarFila = () => setDetalles([...detalles, { material_id: '', cantidad: '', stock_actual: 0, unidad: '', precio_unitario: 0 }])
  
  const eliminarFila = (index: number) => {
    if (detalles.length === 1) return; // Obligar a tener al menos una fila
    const nuevosDetalles = detalles.filter((_, i) => i !== index)
    setDetalles(nuevosDetalles)
  }

  const actualizarFila = (index: number, campo: string, valor: any) => {
    const nuevosDetalles = [...detalles]
    
    if (campo === 'material_id') {
      const mat = materiales.find(m => m.id === valor)
      nuevosDetalles[index] = { 
        ...nuevosDetalles[index], 
        material_id: valor, 
        stock_actual: mat ? mat.stock_actual : 0,
        unidad: mat ? mat.unidad_medida : '',
        precio_unitario: mat ? (mat.precio_unitario || 0) : 0
      }
    } else {
      nuevosDetalles[index] = { ...nuevosDetalles[index], [campo]: valor }
    }
    
    setDetalles(nuevosDetalles)
  }

  // --- Guardar Salida ---
  async function registrarSalida(e: React.FormEvent) {
    e.preventDefault()

    // 1. Validaciones previas
    const detallesValidos = detalles.filter(d => d.material_id && Number(d.cantidad) > 0)
    if (detallesValidos.length === 0) return alert('Debes agregar al menos un material con cantidad válida.')

    for (const det of detallesValidos) {
      if (Number(det.cantidad) > det.stock_actual) {
        const mat = materiales.find(m => m.id === det.material_id)
        return alert(`Stock insuficiente para ${mat?.nombre}. Solicitas: ${det.cantidad}, Disponible: ${det.stock_actual}`)
      }
    }
    
    // 2. Insertar Cabecera
    const { data: movData, error: movError } = await supabase.from('movimientos').insert([{ 
      tipo_movimiento: 'SALIDA', 
      proyecto_id: cabecera.proyecto_id, 
      usuario_responsable: cabecera.usuario,
      guia_remision: cabecera.documento,
      observaciones: cabecera.observaciones,
      estado: 'Completada',
      fecha_registro: cabecera.fecha
    }]).select().single()

    if (movError) return alert('Error al crear cabecera: ' + movError.message)

    // 3. Insertar Detalles (incluyendo precio_unitario)
    const lineas = detallesValidos.map(d => ({ 
      movimiento_id: movData.id, 
      material_id: d.material_id, 
      cantidad: parseFloat(d.cantidad as string),
      precio_unitario: d.precio_unitario || 0
    }))
    
    const { error: detError } = await supabase.from('detalle_movimientos').insert(lineas)
    
    if (detError) {
      alert('Error al guardar detalles: ' + detError.message)
    } else { 
      alert('Salida registrada exitosamente.')
      // Resetear formulario
      setCabecera({ ...cabecera, proyecto_id: '', usuario: '', documento: '', observaciones: '' })
      setDetalles([{ material_id: '', cantidad: '', stock_actual: 0, unidad: '', precio_unitario: 0 }])
      obtenerDatos() 
    }
  }

  const formatearFecha = (fechaString: string) => {
    if (!fechaString) return '-'
    return new Date(fechaString).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      
      {/* Cabecera de Página */}
      <div className="flex items-center gap-4">
        <div className="p-2.5 bg-red-50 text-red-600 rounded-lg shadow-sm border border-red-100">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15M12 9l3 3m0 0-3 3m3-3H2.25" /></svg>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Despacho y Salidas</h2>
          <p className="text-gray-500 text-sm">Registra la entrega de materiales a frentes de obra o trabajadores.</p>
        </div>
      </div>
      
      {/* Formulario de Salida */}
      <form onSubmit={registrarSalida} className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-700 bg-gray-50/50">
          Información del Despacho
        </div>
        
        <div className="p-6">
          {/* Fila 1: Cabecera */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha <span className="text-red-500">*</span></label>
              <input type="date" required className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500" value={cabecera.fecha} onChange={e => setCabecera({...cabecera, fecha: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Vale / Documento</label>
              <input placeholder="Ej. Vale-001" className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500" value={cabecera.documento} onChange={e => setCabecera({...cabecera, documento: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Proyecto / Obra Destino <span className="text-red-500">*</span></label>
              <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500 bg-white" required value={cabecera.proyecto_id} onChange={e => setCabecera({...cabecera, proyecto_id: e.target.value})}>
                <option value="">Seleccione Proyecto...</option>
                {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Responsable / Solicitante <span className="text-red-500">*</span></label>
              <input placeholder="Nombre de quien retira" className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500" required value={cabecera.usuario} onChange={e => setCabecera({...cabecera, usuario: e.target.value})} />
            </div>
          </div>

          {/* Fila 2: Detalles dinámicos */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Materiales a Despachar</h4>
            </div>
            
            <div className="space-y-3">
              {detalles.map((detalle, index) => (
                <div key={index} className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                  <div className="flex-1 w-full">
                    <select className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-red-500 bg-white" required value={detalle.material_id} onChange={e => actualizarFila(index, 'material_id', e.target.value)}>
                      <option value="">Seleccione un material...</option>
                      {materiales.map(m => (
                        <option key={m.id} value={m.id} disabled={m.stock_actual <= 0}>
                          {m.codigo} - {m.nombre} (Stock: {m.stock_actual})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-full md:w-48 flex items-center gap-2">
                    <input type="number" min="0.1" step="0.1" max={detalle.stock_actual} className={`w-24 border rounded-md p-2 text-sm focus:ring-2 focus:outline-none ${Number(detalle.cantidad) > detalle.stock_actual ? 'border-red-500 focus:ring-red-500 bg-red-50' : 'border-gray-300 focus:ring-red-500'}`} required placeholder="Cant." value={detalle.cantidad} onChange={e => actualizarFila(index, 'cantidad', e.target.value)} />
                    <span className="text-sm text-gray-500 font-medium truncate w-16">{detalle.unidad || 'U.M.'}</span>
                    
                    <button type="button" onClick={() => eliminarFila(index)} disabled={detalles.length === 1} className="text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors p-1">
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            <button type="button" onClick={agregarFila} className="mt-3 text-sm text-red-600 hover:text-red-800 font-medium flex items-center gap-1">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Agregar otra línea
            </button>
          </div>

          <div className="mt-6 flex justify-end">
            <button type="submit" className="w-full md:w-auto bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-6 rounded-md transition-colors flex justify-center items-center gap-2 shadow-sm">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              Confirmar Salida
            </button>
          </div>
        </div>
      </form>

      {/* Historial de Salidas */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-white">
          <div className="font-semibold text-gray-800">Últimas Salidas Registradas</div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/80">
              <tr>
                {['Fecha', 'Documento', 'Proyecto', 'Responsable', 'Materiales', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {salidas.map((mov) => (
                <tr key={mov.id} className="hover:bg-red-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatearFecha(mov.fecha_registro)}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">{mov.guia_remision || '-'}</td>
                  <td className="px-4 py-3 text-sm text-red-700 font-medium whitespace-nowrap">{mov.proyectos?.nombre || 'Sin Asignar'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{mov.usuario_responsable}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                    {mov.detalle_movimientos?.length} {mov.detalle_movimientos?.length === 1 ? 'ítem' : 'ítems'}
                  </td>
                  <td className="px-4 py-3 text-sm flex gap-1 items-center whitespace-nowrap">
                    <button onClick={() => setModalDetalle(mov)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors border border-blue-100 text-xs font-medium">
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
              {salidas.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No hay salidas registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle */}
      {modalDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Detalle de Salida</h3>
              <button onClick={() => setModalDetalle(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 text-sm mb-6 border-b pb-4">
                <div><span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Proyecto</span> <span className="font-semibold">{modalDetalle.proyectos?.nombre}</span></div>
                <div><span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Responsable</span> <span className="font-medium">{modalDetalle.usuario_responsable}</span></div>
                <div><span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Documento</span> <span>{modalDetalle.guia_remision || '-'}</span></div>
                <div><span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Fecha</span> <span>{formatearFecha(modalDetalle.fecha_registro)}</span></div>
              </div>

              <h4 className="font-semibold text-gray-700 text-sm mb-3">Materiales Despachados</h4>
              <ul className="space-y-2">
                {modalDetalle.detalle_movimientos?.map((det: any) => (
                  <li key={det.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-gray-800">{det.materiales?.nombre}</span>
                      <span className="text-xs text-gray-500">Cód: {det.materiales?.codigo}</span>
                    </div>
                    <div className="text-sm font-bold text-gray-700 bg-white px-3 py-1 rounded-md shadow-sm border border-gray-200">
                      {det.cantidad} <span className="font-normal text-gray-500">{det.materiales?.unidad_medida}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}