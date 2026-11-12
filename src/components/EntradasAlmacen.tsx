import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// --- OBTENER FECHA LOCAL ---
const getFechaLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// --- INTERFACES ---
interface AtributoNombre { nombre: string }

interface Material {
  id: string
  nombre: string
  stock_actual: number
  categorias?: AtributoNombre | AtributoNombre[]
  unidades_medida?: AtributoNombre | AtributoNombre[]
}

interface DetalleMovimiento {
  id: string
  material_id: string
  cantidad: number
  precio_unitario: number
  materiales?: Material
}

interface Movimiento {
  id: string
  numero_movimiento: string
  fecha_movimiento: string
  fecha_registro: string
  proveedor: string
  guia_remision: string
  tipo_comprobante: string
  observaciones: string
  estado: string
  detalle_movimientos?: DetalleMovimiento[]
}

interface FormDetalle {
  material_id: string
  cantidad: string
  precio_unitario: string
  unidad: string
  stock_actual: number // Para mostrar el stock proyectado
}

export default function EntradasAlmacen() {
  const [materiales, setMateriales] = useState<Material[]>([])
  const [entradas, setEntradas] = useState<Movimiento[]>([])
  
  const getEstadoInicial = () => ({
    id: '', 
    fecha: getFechaLocal(), 
    proveedor: '', 
    documento: '', 
    tipo_comprobante: 'Factura',
    observaciones: '',
    detalles: [{ material_id: '', cantidad: '', precio_unitario: '', unidad: '', stock_actual: 0 }] as FormDetalle[]
  })

  const [formulario, setFormulario] = useState(getEstadoInicial())
  const [movimientoSeleccionado, setMovimientoSeleccionado] = useState<Movimiento | null>(null) // Para el Modal
  
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)

  useEffect(() => { obtenerDatos() }, [])

  async function obtenerDatos() {
    setCargando(true)
    try {
      const [resMats, resMovs] = await Promise.all([
        supabase.from('materiales').select('id, nombre, stock_actual, categorias(nombre), unidades_medida(nombre)'),
        supabase.from('movimientos')
          .select('*, detalle_movimientos(*, materiales(nombre, categorias(nombre), unidades_medida(nombre)))')
          .eq('tipo_movimiento', 'ENTRADA')
          .order('fecha_movimiento', { ascending: false })
      ])

      if (resMats.error) throw resMats.error
      if (resMovs.error) throw resMovs.error

      setMateriales((resMats.data as Material[]) || [])
      setEntradas((resMovs.data as Movimiento[]) || [])
    } catch (error: any) {
      alert("Error al cargar datos: " + error.message)
    } finally {
      setCargando(false)
    }
  }

  const getNombreAtributo = (relacion?: AtributoNombre | AtributoNombre[]) => {
    return Array.isArray(relacion) ? relacion[0]?.nombre : relacion?.nombre
  }

  // --- MANEJO DE MÚLTIPLES MATERIALES ---
  const agregarFila = () => {
    setFormulario({
      ...formulario,
      detalles: [...formulario.detalles, { material_id: '', cantidad: '', precio_unitario: '', unidad: '', stock_actual: 0 }]
    })
  }

  const removerFila = (index: number) => {
    const nuevosDetalles = formulario.detalles.filter((_, i) => i !== index)
    setFormulario({ ...formulario, detalles: nuevosDetalles })
  }

  const handleDetalleChange = (index: number, campo: keyof FormDetalle, valor: string) => {
    const nuevosDetalles = [...formulario.detalles]
    nuevosDetalles[index] = { ...nuevosDetalles[index], [campo]: valor }

    // Autocompletar unidad y obtener stock actual al seleccionar material
    if (campo === 'material_id') {
      const mat = materiales.find(m => m.id === valor)
      nuevosDetalles[index].unidad = getNombreAtributo(mat?.unidades_medida) || ''
      nuevosDetalles[index].stock_actual = mat?.stock_actual || 0
    }

    setFormulario({ ...formulario, detalles: nuevosDetalles })
  }

  // --- GUARDAR, EDITAR Y ANULAR ---
  async function guardarEntrada(e: React.FormEvent) {
    e.preventDefault()
    
    // 1. Validaciones Robustas
    const materialIds = formulario.detalles.map(d => d.material_id)
    
    if (materialIds.some(id => !id)) {
      return alert("Todos los detalles deben tener un material seleccionado.")
    }
    
    if (new Set(materialIds).size !== materialIds.length) {
      return alert("No puedes agregar el mismo material más de una vez. Suma las cantidades en una sola fila.")
    }

    if (formulario.detalles.some(d => {
      const qty = parseFloat(d.cantidad)
      return isNaN(qty) || qty <= 0
    })) {
      return alert("Todas las cantidades deben ser números mayores a 0.")
    }

    setGuardando(true)
    
    try {
      const usuarioTemporal = '239de726-7bfe-4b39-99d7-309c771d66ae' // Cambiar cuando tengas Auth
      
      const payload = {
        p_movimiento_id: formulario.id || null,
        p_fecha_movimiento: formulario.fecha,
        p_proveedor: formulario.proveedor,
        p_guia_remision: formulario.documento,
        p_tipo_comprobante: formulario.tipo_comprobante,
        p_observaciones: formulario.observaciones,
        p_detalles: formulario.detalles.map(d => ({
          material_id: d.material_id,
          cantidad: parseFloat(d.cantidad),
          precio_unitario: parseFloat(d.precio_unitario) || 0
        })),
        p_usuario_responsable: usuarioTemporal
      }

      const { error } = await supabase.rpc('gestionar_entrada', payload)
      if (error) throw error

      // 4. Esperar a que los datos se actualicen antes de limpiar
      await obtenerDatos()
      setFormulario(getEstadoInicial())
      alert(formulario.id ? "Entrada actualizada correctamente." : "Entrada registrada con éxito.")
    } catch (error: any) {
      alert('Error al guardar: ' + error.message)
    } finally {
      setGuardando(false)
    }
  }

  const editarEntrada = (mov: Movimiento) => {
    setFormulario({
      id: mov.id,
      fecha: mov.fecha_movimiento || mov.fecha_registro.split('T')[0],
      proveedor: mov.proveedor || '',
      documento: mov.guia_remision || '',
      tipo_comprobante: mov.tipo_comprobante || 'Factura',
      observaciones: mov.observaciones || '',
      detalles: (mov.detalle_movimientos || []).map(d => ({
        material_id: d.material_id,
        cantidad: d.cantidad.toString(),
        precio_unitario: d.precio_unitario.toString(),
        unidad: getNombreAtributo(d.materiales?.unidades_medida) || '',
        stock_actual: d.materiales?.stock_actual || 0
      }))
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const anularEntrada = async (mov: Movimiento) => {
    if (mov.estado === 'Anulada') return alert('Esta entrada ya está anulada.')
    if (!window.confirm('¿Estás seguro de anular esta entrada? El stock se revertirá.')) return

    try {
      const { error } = await supabase.rpc('anular_movimiento', { p_movimiento_id: mov.id })
      if (error) throw error
      await obtenerDatos()
      alert('Entrada anulada y stock revertido correctamente.')
    } catch (error: any) {
      alert('Error al anular: ' + error.message)
    }
  }

  // --- CÁLCULOS Y KPIs (Corregidos con extracción segura) ---
  const d = new Date()
  const mesActualStr = String(d.getMonth() + 1).padStart(2, '0')
  const añoActualStr = String(d.getFullYear())

  const entradasValidas = entradas.filter(e => e.estado !== 'Anulada')
  
  const entradasDelMes = entradasValidas.filter(e => {
    const fechaString = e.fecha_movimiento || e.fecha_registro.split('T')[0]
    const [year, month] = fechaString.split('-')
    return year === añoActualStr && month === mesActualStr
  })

  const totalMovimientosMes = entradasDelMes.length
  const totalItemsMes = entradasDelMes.reduce((acc, mov) => acc + (mov.detalle_movimientos?.length || 0), 0)
  const valorTotalMes = entradasDelMes.reduce((acc, mov) => {
    const totalMov = (mov.detalle_movimientos || []).reduce((sum, det) => sum + (det.cantidad * det.precio_unitario), 0)
    return acc + totalMov
  }, 0)

  // --- FILTROS Y PAGINACIÓN ---
  const term = busqueda.toLowerCase()
  const entradasFiltradas = entradas.filter(m => 
    (m.proveedor?.toLowerCase() || '').includes(term) ||
    (m.guia_remision?.toLowerCase() || '').includes(term) ||
    (m.numero_movimiento?.toLowerCase() || '').includes(term)
  )

  const itemsPorPagina = 10
  const totalPaginas = Math.ceil(entradasFiltradas.length / itemsPorPagina) || 1
  const entradasPaginadas = entradasFiltradas.slice((paginaActual - 1) * itemsPorPagina, paginaActual * itemsPorPagina)

  const formatearFechaLocal = (fechaISO: string) => {
    if (!fechaISO) return '-'
    const [year, month, day] = fechaISO.split('T')[0].split('-')
    return `${day}/${month}/${year}`
  }

  return (
    <div className="space-y-6 relative">
      
      {/* 1. TARJETAS DE RESUMEN (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <span className="text-sm font-medium text-gray-500">Total Histórico</span>
          <span className="text-2xl font-bold text-gray-800">{entradasValidas.length}</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <span className="text-sm font-medium text-gray-500">Entradas (Este Mes)</span>
          <span className="text-2xl font-bold text-blue-600">{totalMovimientosMes}</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <span className="text-sm font-medium text-gray-500">Ítems Registrados (Mes)</span>
          <span className="text-2xl font-bold text-green-600">{totalItemsMes}</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-center">
          <span className="text-sm font-medium text-gray-500">Inversión (Mes)</span>
          <span className="text-2xl font-bold text-indigo-600">S/ {valorTotalMes.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* 2. FORMULARIO REDISEÑADO */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-800 bg-gray-50/50 flex justify-between items-center">
          <span>{formulario.id ? `Editando: ${entradas.find(e=>e.id === formulario.id)?.numero_movimiento}` : 'Registrar Nueva Entrada'}</span>
          <button type="button" onClick={() => setFormulario(getEstadoInicial())} className="text-sm text-blue-600 hover:underline font-medium">Limpiar Formulario</button>
        </div>
        
        <form onSubmit={guardarEntrada} className="p-6">
          <h3 className="text-sm font-bold text-gray-500 uppercase mb-4 tracking-wider">1. Datos del Documento</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de ingreso *</label>
              <input type="date" required className="w-full border border-gray-300 rounded-md p-2 text-sm" value={formulario.fecha} onChange={e => setFormulario({...formulario, fecha: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Proveedor *</label>
              <input required placeholder="Ej. Cemento Andino" className="w-full border border-gray-300 rounded-md p-2 text-sm" value={formulario.proveedor} onChange={e => setFormulario({...formulario, proveedor: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Documento *</label>
              <input required placeholder="FACT-001" className="w-full border border-gray-300 rounded-md p-2 text-sm" value={formulario.documento} onChange={e => setFormulario({...formulario, documento: e.target.value})} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Comprobante *</label>
              <select className="w-full border border-gray-300 rounded-md p-2 text-sm bg-white" value={formulario.tipo_comprobante} onChange={e => setFormulario({...formulario, tipo_comprobante: e.target.value})}>
                <option value="Factura">Factura</option>
                <option value="Boleta">Boleta</option>
                <option value="Guía de Remisión">Guía de Remisión</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">2. Materiales Recibidos</h3>
            <button type="button" onClick={agregarFila} className="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md font-medium hover:bg-blue-100 transition-colors">+ Agregar Material</button>
          </div>
          
          <div className="space-y-4 mb-6">
            {formulario.detalles.map((det, index) => {
              const cantidadIngresada = parseFloat(det.cantidad) || 0
              const precioUnitario = parseFloat(det.precio_unitario) || 0
              
              return (
                <div key={index} className="flex flex-col md:flex-row gap-3 items-start p-4 border border-gray-100 bg-gray-50/30 rounded-lg relative group">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Material *</label>
                    <select required className="w-full border border-gray-300 rounded-md p-2 text-sm bg-white" value={det.material_id} onChange={(e) => handleDetalleChange(index, 'material_id', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                    {/* Visualización de Stock Proyectado */}
                    {det.material_id && (
                      <div className="mt-1.5 text-[11px] font-medium">
                        <span className="text-gray-500">Stock actual: {det.stock_actual} {det.unidad}</span>
                        <span className="mx-2 text-gray-300">|</span>
                        <span className="text-blue-600">Proyectado: {det.stock_actual + cantidadIngresada} {det.unidad}</span>
                      </div>
                    )}
                  </div>
                  <div className="w-full md:w-28">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cantidad *</label>
                    <input type="number" step="0.01" min="0.01" required className="w-full border border-gray-300 rounded-md p-2 text-sm" value={det.cantidad} onChange={(e) => handleDetalleChange(index, 'cantidad', e.target.value)} />
                  </div>
                  <div className="w-full md:w-24">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Unidad</label>
                    <input disabled className="w-full border border-gray-200 bg-gray-100 rounded-md p-2 text-sm text-gray-500" value={det.unidad || '-'} />
                  </div>
                  <div className="w-full md:w-28">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Precio Unit. (S/)</label>
                    <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-md p-2 text-sm" value={det.precio_unitario} onChange={(e) => handleDetalleChange(index, 'precio_unitario', e.target.value)} />
                  </div>
                  <div className="w-full md:w-28">
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Total (S/)</label>
                    <input disabled className="w-full border border-gray-200 bg-gray-100 rounded-md p-2 text-sm text-gray-500 font-semibold" value={(cantidadIngresada * precioUnitario).toFixed(2)} />
                  </div>
                  {formulario.detalles.length > 1 && (
                    <button type="button" onClick={() => removerFila(index)} className="mt-6 p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Eliminar fila">
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Observaciones Generales</label>
              <input className="w-full border border-gray-300 rounded-md p-2 text-sm" value={formulario.observaciones} onChange={e => setFormulario({...formulario, observaciones: e.target.value})} placeholder="Notas sobre la entrega..." />
            </div>
            <div className="flex justify-end gap-3">
              <button type="submit" disabled={guardando} className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium disabled:opacity-70 flex items-center gap-2">
                {guardando ? 'Guardando...' : (formulario.id ? 'Actualizar Entrada' : 'Confirmar y Guardar')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 3. HISTORIAL */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b flex justify-between items-center bg-gray-50/50">
          <div className="font-semibold text-gray-800">Historial de Entradas</div>
          <input type="text" placeholder="Buscar documento o proveedor..." className="border border-gray-300 rounded-md p-2 text-sm w-full sm:w-72" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPaginaActual(1); }} />
        </div>
        
        {cargando ? (
          <div className="p-10 text-center text-gray-500">Cargando movimientos...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-white">
                <tr>
                  {['Código', 'Fecha', 'Proveedor', 'Documento', 'Materiales', 'Valor Total', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {entradasPaginadas.map((mov) => {
                  const anulada = mov.estado === 'Anulada'
                  const numMateriales = mov.detalle_movimientos?.length || 0
                  const valorTotal = (mov.detalle_movimientos || []).reduce((sum, d) => sum + (d.cantidad * d.precio_unitario), 0)
                  
                  return (
                    <tr key={mov.id} className={`hover:bg-blue-50/30 transition-colors ${anulada ? 'opacity-50 bg-gray-50' : ''}`}>
                      <td className="px-5 py-4 text-sm font-bold text-blue-600">{mov.numero_movimiento}</td>
                      <td className="px-5 py-4 text-sm text-gray-600">{formatearFechaLocal(mov.fecha_movimiento || mov.fecha_registro)}</td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-800">{mov.proveedor}</td>
                      <td className="px-5 py-4 text-sm text-gray-500">{mov.tipo_comprobante} {mov.guia_remision}</td>
                      <td className="px-5 py-4 text-sm text-gray-600">
                        {numMateriales === 1 ? mov.detalle_movimientos?.[0]?.materiales?.nombre : `${numMateriales} ítems distintos`}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-700">S/ {valorTotal.toFixed(2)}</td>
                      <td className="px-5 py-4 text-sm">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${anulada ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {mov.estado}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm flex gap-1 items-center">
                        {/* Botón Ver Detalles */}
                        <button onClick={() => setMovimientoSeleccionado(mov)} className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-md transition-colors" title="Ver Detalles">
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                        </button>
                        <button disabled={anulada} onClick={() => editarEntrada(mov)} className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-md transition-colors disabled:opacity-0" title="Editar">
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                        </button>
                        <button disabled={anulada} onClick={() => anularEntrada(mov)} className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors disabled:opacity-0" title="Anular">
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        
        <div className="p-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          <span className="text-sm text-gray-500 font-medium">Mostrando pág {paginaActual} de {totalPaginas}</span>
          <div className="flex gap-2">
            <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1} className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50">Anterior</button>
            <button onClick={() => setPaginaActual(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas} className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50">Siguiente</button>
          </div>
        </div>
      </div>

      {/* 4. MODAL DE DETALLES */}
      {movimientoSeleccionado && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">Detalle de Entrada: {movimientoSeleccionado.numero_movimiento}</h3>
              <button onClick={() => setMovimientoSeleccionado(null)} className="text-gray-400 hover:text-gray-700">
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div><span className="block text-xs font-semibold text-gray-500">Fecha</span><span className="text-sm">{formatearFechaLocal(movimientoSeleccionado.fecha_movimiento || movimientoSeleccionado.fecha_registro)}</span></div>
                <div><span className="block text-xs font-semibold text-gray-500">Proveedor</span><span className="text-sm font-medium">{movimientoSeleccionado.proveedor}</span></div>
                <div><span className="block text-xs font-semibold text-gray-500">Documento</span><span className="text-sm">{movimientoSeleccionado.tipo_comprobante} {movimientoSeleccionado.guia_remision}</span></div>
                <div><span className="block text-xs font-semibold text-gray-500">Estado</span>
                  <span className={`text-sm font-semibold ${movimientoSeleccionado.estado === 'Anulada' ? 'text-red-600' : 'text-emerald-600'}`}>{movimientoSeleccionado.estado}</span>
                </div>
              </div>
              
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Ítems Recibidos</h4>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-bold text-gray-500">Material</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">Cantidad</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">P. Unitario</th>
                      <th className="px-4 py-2 text-right text-xs font-bold text-gray-500">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {(movimientoSeleccionado.detalle_movimientos || []).map(det => (
                      <tr key={det.id}>
                        <td className="px-4 py-2 text-sm text-gray-800">{det.materiales?.nombre}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 text-right">{det.cantidad} {getNombreAtributo(det.materiales?.unidades_medida)}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 text-right">S/ {det.precio_unitario.toFixed(2)}</td>
                        <td className="px-4 py-2 text-sm font-medium text-gray-700 text-right">S/ {(det.cantidad * det.precio_unitario).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-2 text-right text-xs font-bold text-gray-500 uppercase">Total</td>
                      <td className="px-4 py-2 text-right text-sm font-bold text-indigo-600">
                        S/ {(movimientoSeleccionado.detalle_movimientos || []).reduce((sum, d) => sum + (d.cantidad * d.precio_unitario), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              {movimientoSeleccionado.observaciones && (
                <div className="mt-4">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Observaciones</span>
                  <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md border border-gray-100">{movimientoSeleccionado.observaciones}</p>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button onClick={() => setMovimientoSeleccionado(null)} className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}