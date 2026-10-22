import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function EntradasAlmacen() {
  const [materiales, setMateriales] = useState<any[]>([])
  const [entradas, setEntradas] = useState<any[]>([])
  const [modalDetalle, setModalDetalle] = useState<any | null>(null)
  
  const estadoInicial = {
    id: '', detalle_id: '',
    fecha: new Date().toISOString().split('T')[0], proveedor: '', documento: '', tipo_comprobante: 'Factura',
    material_id: '', categoria: '', cantidad: '', unidad: '', precio_unitario: '', total: 0, ubicacion: '', observaciones: ''
  }
  const [formulario, setFormulario] = useState(estadoInicial)

  useEffect(() => { obtenerDatos() }, [])

  async function obtenerDatos() {
    // 1. Agregamos ubicaciones(nombre) a la consulta de materiales
    const { data: mats } = await supabase.from('materiales').select('*, categorias(nombre), ubicaciones(nombre)')
    if (mats) setMateriales(mats)
    
    // 2. Agregamos ubicaciones(nombre) al join de detalle_movimientos -> materiales
    const { data: movs } = await supabase.from('movimientos')
      .select('*, detalle_movimientos(*, materiales(*, categorias(nombre), ubicaciones(nombre)))')
      .eq('tipo_movimiento', 'ENTRADA')
      .order('fecha_registro', { ascending: false })
    if (movs) setEntradas(movs)
  }

  const handleMaterialChange = (e: any) => {
    const matId = e.target.value
    const mat = materiales.find(m => m.id === matId)
    setFormulario({
      ...formulario, 
      material_id: matId, 
      categoria: mat?.categorias?.nombre || '', 
      unidad: mat?.unidad_medida || '',
      ubicacion: mat?.ubicaciones?.nombre || '' // Actualizado aquí
    })
  }

  const calcularTotal = (cant: string | number, precio: string | number) => {
    const c = parseFloat(cant as string) || 0
    const p = parseFloat(precio as string) || 0
    return (c * p).toFixed(2)
  }

  async function guardarEntrada(e: React.FormEvent) {
    e.preventDefault()
    
    if (formulario.id) {
      const { error: errMov } = await supabase.from('movimientos').update({
        guia_remision: formulario.documento, 
        proveedor: formulario.proveedor,
        tipo_comprobante: formulario.tipo_comprobante, 
        observaciones: formulario.observaciones
      }).eq('id', formulario.id)

      if (errMov) return alert('Error al actualizar cabecera: ' + errMov.message)

      if (formulario.detalle_id) {
        const { error: errDet } = await supabase.from('detalle_movimientos').update({
          material_id: formulario.material_id, 
          cantidad: parseFloat(formulario.cantidad), 
          precio_unitario: parseFloat(formulario.precio_unitario) || 0
        }).eq('id', formulario.detalle_id)
        
        if (errDet) return alert('Error al actualizar detalle: ' + errDet.message)
      }
      
      alert('Entrada actualizada exitosamente.')
    } else {
      const { data: mov, error: errMov } = await supabase.from('movimientos').insert([{
        tipo_movimiento: 'ENTRADA', 
        guia_remision: formulario.documento, 
        proveedor: formulario.proveedor,
        tipo_comprobante: formulario.tipo_comprobante, 
        observaciones: formulario.observaciones, 
        estado: 'Completada',
        usuario_responsable: 'Patrick Abanto',
        numero_entrada: `ENT-${Math.floor(1000 + Math.random() * 9000)}` 
      }]).select().single()

      if (errMov) return alert('Error al crear cabecera: ' + errMov.message)

      const { error: errDet } = await supabase.from('detalle_movimientos').insert([{
        movimiento_id: mov.id, 
        material_id: formulario.material_id, 
        cantidad: parseFloat(formulario.cantidad), 
        precio_unitario: parseFloat(formulario.precio_unitario) || 0
      }])

      if (errDet) return alert('Error en el detalle: ' + errDet.message)
      else alert('Entrada registrada exitosamente.')
    }

    obtenerDatos()
    setFormulario(estadoInicial)
  }

  const editarEntrada = (mov: any) => {
    const detalle = mov.detalle_movimientos && mov.detalle_movimientos[0]
    const material = detalle?.materiales

    setFormulario({
      id: mov.id,
      detalle_id: detalle?.id || '',
      fecha: mov.fecha_registro ? mov.fecha_registro.split('T')[0] : '',
      proveedor: mov.proveedor || '',
      documento: mov.guia_remision || '',
      tipo_comprobante: mov.tipo_comprobante || 'Factura',
      material_id: detalle?.material_id || '',
      categoria: material?.categorias?.nombre || '',
      cantidad: detalle?.cantidad || '',
      unidad: material?.unidad_medida || '',
      precio_unitario: detalle?.precio_unitario || '',
      total: parseFloat(calcularTotal(detalle?.cantidad, detalle?.precio_unitario)),
      ubicacion: material?.ubicaciones?.nombre || '', // Actualizado aquí
      observaciones: mov.observaciones || ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const eliminarEntrada = async (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este registro de entrada?')) {
      const { error } = await supabase.from('movimientos').delete().eq('id', id)
      if (error) alert('Error al eliminar: ' + error.message)
      else obtenerDatos()
    }
  }

  const formatearFecha = (fechaString: string) => {
    if (!fechaString) return '-'
    const fecha = new Date(fechaString)
    return fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="space-y-6 relative">
      
      {/* Modal de Detalle */}
      {modalDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-800">Detalle de Entrada {modalDetalle.numero_entrada}</h3>
              <button onClick={() => setModalDetalle(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <p><span className="font-semibold text-gray-600">Proveedor:</span> {modalDetalle.proveedor}</p>
              <p><span className="font-semibold text-gray-600">Documento:</span> {modalDetalle.guia_remision} ({modalDetalle.tipo_comprobante})</p>
              <p><span className="font-semibold text-gray-600">Material:</span> {modalDetalle.detalle_movimientos?.[0]?.materiales?.nombre}</p>
              <p><span className="font-semibold text-gray-600">Cantidad:</span> {modalDetalle.detalle_movimientos?.[0]?.cantidad} {modalDetalle.detalle_movimientos?.[0]?.materiales?.unidad_medida}</p>
              <p><span className="font-semibold text-gray-600">Observaciones:</span> {modalDetalle.observaciones || 'Ninguna'}</p>
              <p><span className="font-semibold text-gray-600">Registrado por:</span> {modalDetalle.usuario_responsable}</p>
            </div>
            <button onClick={() => setModalDetalle(null)} className="mt-6 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium py-2 rounded-md transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Cabecera Principal */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shadow-sm border border-blue-100">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.118v0H5.622c-1.085-.082-1.872-1.024-1.872-2.118v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z" /></svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Registro de Entradas</h2>
            <p className="text-gray-500 text-sm">Registra los ingresos de materiales al almacén. Asegúrate de completar todos los campos.</p>
          </div>
        </div>
        <button onClick={() => setFormulario(estadoInicial)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-md font-medium text-sm flex items-center gap-2 shadow-sm transition-colors">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Nueva Entrada
        </button>
      </div>

      {/* Tarjeta de Formulario */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-700 flex items-center gap-2 bg-gray-50/50">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
          {formulario.id ? 'Editar Entrada' : 'Información de la Entrada'}
        </div>
        <form onSubmit={guardarEntrada} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-5">
          {/* Fila 1 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Fecha de ingreso <span className="text-red-500">*</span></label>
            <input type="date" required disabled={!!formulario.id} className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-shadow disabled:bg-gray-50 disabled:text-gray-500" value={formulario.fecha} onChange={e => setFormulario({...formulario, fecha: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Proveedor <span className="text-red-500">*</span></label>
            <input required placeholder="Ej. Cemento Andino S.A." className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" value={formulario.proveedor} onChange={e => setFormulario({...formulario, proveedor: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Documento de ingreso <span className="text-red-500">*</span></label>
            <input required placeholder="FACT-001245" className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" value={formulario.documento} onChange={e => setFormulario({...formulario, documento: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Tipo de comprobante <span className="text-red-500">*</span></label>
            <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" value={formulario.tipo_comprobante} onChange={e => setFormulario({...formulario, tipo_comprobante: e.target.value})}>
              <option value="Factura">Factura</option>
              <option value="Boleta">Boleta</option>
              <option value="Guía de Remisión">Guía de Remisión</option>
            </select>
          </div>

          {/* Fila 2 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Material <span className="text-red-500">*</span></label>
            <select required className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" value={formulario.material_id} onChange={handleMaterialChange}>
              <option value="">Seleccionar material</option>
              {materiales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Categoría</label>
            <input disabled className="w-full border border-gray-200 bg-gray-50 rounded-md p-2.5 text-sm text-gray-500 cursor-not-allowed" value={formulario.categoria} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Cantidad ingresada <span className="text-red-500">*</span></label>
            <input type="number" step="0.1" required className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" value={formulario.cantidad} onChange={e => setFormulario({...formulario, cantidad: e.target.value, total: parseFloat(calcularTotal(e.target.value, formulario.precio_unitario))})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Unidad de medida <span className="text-red-500">*</span></label>
            <input disabled className="w-full border border-gray-200 bg-gray-50 rounded-md p-2.5 text-sm text-gray-500 cursor-not-allowed" value={formulario.unidad} />
          </div>

          {/* Fila 3 */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Precio unitario (S/.)</label>
            <input type="number" step="0.01" className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-shadow" value={formulario.precio_unitario} onChange={e => setFormulario({...formulario, precio_unitario: e.target.value, total: parseFloat(calcularTotal(formulario.cantidad, e.target.value))})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Total (S/.)</label>
            <input disabled className="w-full border border-gray-200 bg-gray-50 rounded-md p-2.5 text-sm font-semibold text-gray-700 cursor-not-allowed" value={Number(formulario.total).toFixed(2)} />
          </div>
          <div>
  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Ubicación en almacén</label>
  <input 
    disabled 
    className="w-full border border-gray-200 bg-gray-50 rounded-md p-2.5 text-sm text-gray-500 cursor-not-allowed" 
    value={formulario.ubicacion || 'Se asigna según el material'} 
  />
</div>
          <div className="row-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Observaciones</label>
            <textarea className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 h-[108px] transition-shadow resize-none" placeholder="Material entregado según orden..." value={formulario.observaciones} onChange={e => setFormulario({...formulario, observaciones: e.target.value})} />
          </div>

          <div className="md:col-span-3 flex justify-end items-end gap-3 pt-2">
            <button type="button" onClick={() => setFormulario(estadoInicial)} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center gap-2 transition-colors">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
              Limpiar
            </button>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.875a3.375 3.375 0 003.375 3.375h1.875M16.5 7.5h3" /></svg>
              {formulario.id ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      {/* Tabla de Entradas Registradas */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
          <div className="font-semibold text-gray-800 flex items-center gap-2">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Z" />
            </svg>
            Entradas Registradas
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 absolute left-3 top-2.5 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
              </svg>
              <input type="text" placeholder="Buscar por proveedor, material, documento..." className="pl-9 w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" />
            </div>
            <button className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors font-medium shadow-sm">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Filtros
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/80">
              <tr>
                {['Nº Entrada', 'Fecha', 'Proveedor', 'Documento', 'Material', 'Categoría', 'Cantidad', 'Unidad', 'Total (S/.)', 'Ubicación', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {entradas.map((mov) => {
                const detalle = mov.detalle_movimientos && mov.detalle_movimientos[0];
                const material = detalle?.materiales;
                const categoria = material?.categorias;
                const total = detalle ? (parseFloat(detalle.cantidad) * parseFloat(detalle.precio_unitario)).toFixed(2) : '0.00';

                return (
                  <tr key={mov.id} className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3.5 text-sm font-semibold text-blue-600 whitespace-nowrap">{mov.numero_entrada || 'ENT-0000'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{formatearFecha(mov.fecha_registro)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 font-medium whitespace-nowrap">{mov.proveedor || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{mov.guia_remision || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-blue-700 font-medium whitespace-nowrap">{material?.nombre || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">{categoria?.nombre || '-'}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-gray-800 whitespace-nowrap">{detalle?.cantidad || '0'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">{material?.unidad_medida || '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{total}</td>
                    {/* Actualizado para mostrar ubicaciones.nombre */}
                    <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">{material?.ubicaciones?.nombre || '-'}</td>
                    <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${mov.estado === 'Completada' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                        {mov.estado || 'Completada'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm flex gap-1 items-center whitespace-nowrap">
                      <button onClick={() => setModalDetalle(mov)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded-md transition-colors" title="Ver detalle">
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                      <button onClick={() => editarEntrada(mov)} className="text-gray-500 hover:text-gray-700 hover:bg-gray-100 p-1.5 rounded-md transition-colors" title="Editar">
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                      </button>
                      <button onClick={() => eliminarEntrada(mov.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors" title="Eliminar">
                        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        
        {/* Paginación */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50/50">
          <span className="text-sm text-gray-500 font-medium">
            Mostrando 1 - {entradas.length} de {entradas.length} entradas
          </span>
          <div className="flex gap-2">
            <button disabled className="px-3.5 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-400 opacity-50 cursor-not-allowed shadow-sm">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <span className="px-4 py-1.5 border border-blue-600 rounded-md bg-blue-600 text-white text-sm font-bold shadow-sm">1</span>
            <button disabled className="px-3.5 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-400 opacity-50 cursor-not-allowed shadow-sm">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}