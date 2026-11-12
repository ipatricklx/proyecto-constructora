import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function CatalogoMateriales() {
  const [materiales, setMateriales] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [unidades, setUnidades] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [paginaActual, setPaginaActual] = useState(1)
  const [cargando, setCargando] = useState(true)
  
  const estadoInicial = {
    id: '',
    codigo: '',
    nombre: '',
    categoria_id: '',
    unidad_medida_id: '',
    marca: '',
    descripcion: '',
    stock_minimo: 0,
    precio_unitario: '', // Cadena vacía para permitir NULL
    estado: 'Activo'
  }
  const [formulario, setFormulario] = useState(estadoInicial)

  useEffect(() => { obtenerDatos() }, [])

  async function obtenerDatos() {
    setCargando(true)
    
    const [resCats, resUnds] = await Promise.all([
      supabase.from('categorias').select('id, nombre').order('nombre'),
      supabase.from('unidades_medida').select('*').order('nombre')
    ])
    
    if (resCats.error) console.error("Error categorías:", resCats.error)
    else setCategorias(resCats.data || [])

    if (resUnds.error) console.error("Error unidades:", resUnds.error)
    else setUnidades(resUnds.data || [])

    const { data: mats, error } = await supabase
      .from('materiales')
      .select('*, categorias(nombre), unidades_medida!materiales_unidad_medida_id_fkey(nombre, abreviatura)')
      .order('codigo', { ascending: true })
      
    if (error) {
      alert("Error al cargar materiales: " + error.message)
    } else if (mats) {
      setMateriales(mats)
    }
    
    setCargando(false)
  }

  const materialesFiltrados = materiales.filter(m => 
    m.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.categorias?.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  )

  const itemsPorPagina = 15
  const totalPaginas = Math.ceil(materialesFiltrados.length / itemsPorPagina) || 1
  const indiceUltimoItem = paginaActual * itemsPorPagina
  const indicePrimerItem = indiceUltimoItem - itemsPorPagina
  const materialesPaginados = materialesFiltrados.slice(indicePrimerItem, indiceUltimoItem)

  async function guardarMaterial(e: React.FormEvent) {
    e.preventDefault()
    const { id, codigo, ...datosGuardar } = formulario 
    
    const precio = parseFloat(datosGuardar.precio_unitario as string)
    
    const payload = {
      ...datosGuardar,
      precio_unitario: isNaN(precio) ? null : precio,
      stock_minimo: parseFloat(datosGuardar.stock_minimo as any) || 0,
      ...(codigo && { codigo }) 
    }

    if (id) {
      const { error } = await supabase.from('materiales').update(payload).eq('id', id)
      if (error) {
        // Validación de duplicados
        if (error.code === '23505') alert('Error: Ya existe un material registrado con ese mismo nombre y marca.')
        else alert('Error al actualizar: ' + error.message)
      } else { 
        obtenerDatos(); 
        setFormulario(estadoInicial); 
      }
    } else {
      const { error } = await supabase.from('materiales').insert([payload])
      if (error) {
        // Validación de duplicados
        if (error.code === '23505') alert('Error: Ya existe un material registrado con ese mismo nombre y marca.')
        else alert('Error al guardar: ' + error.message)
      } else { 
        obtenerDatos(); 
        setFormulario(estadoInicial); 
      }
    }
  }

  const editarMaterial = (mat: any) => {
    setFormulario({
      id: mat.id, 
      codigo: mat.codigo || '', 
      nombre: mat.nombre || '', 
      categoria_id: mat.categoria_id || '',
      unidad_medida_id: mat.unidad_medida_id || '', 
      marca: mat.marca || '', 
      descripcion: mat.descripcion || '',
      stock_minimo: mat.stock_minimo || 0, 
      precio_unitario: mat.precio_unitario !== null ? mat.precio_unitario : '',
      estado: mat.estado || 'Activo'
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const desactivarMaterial = async (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas dar de baja este material? No se borrará del historial.')) {
      const { error } = await supabase.from('materiales').update({ estado: 'Inactivo' }).eq('id', id)
      if (error) {
        alert('Error al desactivar: ' + error.message)
      } else {
        obtenerDatos()
      }
    }
  }

  return (
    <div className="space-y-6">
      
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shadow-sm border border-blue-100">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Catálogo de Materiales</h2>
            <p className="text-gray-500 text-sm mt-0.5">Gestión unificada de maestros e insumos de almacén.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => setFormulario(estadoInicial)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm flex items-center justify-center gap-2">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nuevo Material
          </button>
        </div>
      </div>
      
      {/* Formulario */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-700 flex items-center gap-2 bg-gray-50/50">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
          </svg>
          {formulario.id ? 'Editar Material' : 'Agregar Material al Catálogo'}
        </div>

        <form onSubmit={guardarMaterial} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Código</label>
            <input 
              className="w-full border border-gray-200 bg-gray-100 rounded-md p-2.5 text-sm text-gray-500 cursor-not-allowed" 
              placeholder="Autogenerado por BD" 
              readOnly 
              value={formulario.codigo} 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Nombre del Material <span className="text-red-500">*</span></label>
            <input className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="Ej. Cemento Portland Tipo I" required value={formulario.nombre} onChange={e => setFormulario({...formulario, nombre: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Categoría <span className="text-red-500">*</span></label>
            <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" required value={formulario.categoria_id} onChange={e => setFormulario({...formulario, categoria_id: e.target.value})}>
              <option value="">Seleccionar categoría</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Unidad de Medida <span className="text-red-500">*</span></label>
            <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" required value={formulario.unidad_medida_id} onChange={e => setFormulario({...formulario, unidad_medida_id: e.target.value})}>
              <option value="">Seleccionar unidad</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Marca</label>
            <input className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="Ej. Sol / Pacasmayo" value={formulario.marca} onChange={e => setFormulario({...formulario, marca: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Precio Ref. (S/.)</label>
            <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="Desconocido" value={formulario.precio_unitario} onChange={e => setFormulario({...formulario, precio_unitario: e.target.value})} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Stock Mínimo (Alerta)</label>
            <input type="number" min="0" className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value={formulario.stock_minimo} onChange={e => setFormulario({...formulario, stock_minimo: Number(e.target.value)})} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Estado Operativo</label>
            <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value={formulario.estado} onChange={e => setFormulario({...formulario, estado: e.target.value})}>
              <option value="Activo">🟢 Activo</option>
              <option value="En revisión">🟡 En revisión</option>
              <option value="Inactivo">🔴 Inactivo</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Descripción / Detalle Técnico</label>
            <input className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="Observaciones o especificidad del insumo..." value={formulario.descripcion} onChange={e => setFormulario({...formulario, descripcion: e.target.value})} />
          </div>

          <div className="md:col-span-4 flex justify-end items-center gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setFormulario(estadoInicial)} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center gap-2 transition-colors">
              Limpiar
            </button>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              {formulario.id ? 'Actualizar Material' : 'Guardar Material'}
            </button>
          </div>
        </form>
      </div>

      {/* Tabla y Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
          <div className="font-semibold text-gray-800 flex items-center gap-2">
            Materiales Registrados ({materialesFiltrados.length})
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 absolute left-3 top-3 text-gray-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
              </svg>
              <input 
                type="text" 
                placeholder="Buscar por código, nombre o categoría..." 
                className="pl-9 w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setPaginaActual(1) }}
              />
            </div>
          </div>
        </div>

        {cargando ? (
          <div className="p-10 flex justify-center items-center text-gray-500 gap-2">
            <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Cargando catálogo...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/80">
                <tr>
                  {['Código', 'Nombre', 'Categoría', 'Unidad', 'Precio Ref.', 'Stock', 'Estado Físico', 'Estado Reg.', 'Acciones'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {materialesPaginados.map((mat) => {
                  const esBajoStock = Number(mat.stock_actual) <= Number(mat.stock_minimo)
                  return (
                    <tr key={mat.id} className={`transition-colors ${mat.estado === 'Inactivo' ? 'bg-gray-50 opacity-60' : 'hover:bg-blue-50/50'}`}>
                      <td className="px-5 py-4 text-sm font-semibold text-gray-900 whitespace-nowrap">{mat.codigo}</td>
                      <td className="px-5 py-4 text-sm text-gray-700 font-medium">{mat.nombre}</td>
                      <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">{mat.categorias?.nombre || '-'}</td>
                      
                      <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {mat.unidades_medida ? mat.unidades_medida.abreviatura : (mat.unidad_medida || '-')}
                      </td>

                      <td className="px-5 py-4 text-sm font-medium text-gray-800 whitespace-nowrap">
                        {mat.precio_unitario !== null ? `S/. ${Number(mat.precio_unitario).toFixed(2)}` : '-'}
                      </td>
                      
                      <td className="px-5 py-4 text-sm whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className={`font-bold ${esBajoStock ? 'text-red-600' : 'text-gray-800'}`}>{mat.stock_actual}</span>
                          <span className="text-xs text-gray-400">Min: {mat.stock_minimo}</span>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          esBajoStock ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'
                        }`}>
                          {esBajoStock ? 'Stock Crítico' : 'Stock Normal'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          mat.estado === 'Activo' ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : mat.estado === 'Inactivo' ? 'bg-gray-100 text-gray-600 border-gray-300' 
                          : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}>
                          {mat.estado || 'Activo'}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm flex gap-1 items-center whitespace-nowrap">
                        <button onClick={() => editarMaterial(mat)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-100 p-1.5 rounded-md transition-colors" title="Editar">
                          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                        
                        {mat.estado !== 'Inactivo' && (
                          <button onClick={() => desactivarMaterial(mat.id)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors" title="Dar de baja">
                            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {materialesPaginados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-gray-500">
                      No se encontraron materiales que coincidan con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Paginador */}
        {!cargando && (
          <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50/50">
            <span className="text-sm text-gray-500 font-medium">
              Mostrando {materialesFiltrados.length === 0 ? 0 : indicePrimerItem + 1} a {Math.min(indiceUltimoItem, materialesFiltrados.length)} de {materialesFiltrados.length} materiales
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPaginaActual(prev => Math.max(prev - 1, 1))} disabled={paginaActual === 1} className="px-3.5 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors shadow-sm">
                Anterior
              </button>
              <span className="px-4 py-1.5 border border-blue-200 rounded-md bg-blue-50 text-blue-700 text-sm font-bold shadow-sm">
                {paginaActual} / {totalPaginas}
              </span>
              <button onClick={() => setPaginaActual(prev => Math.min(prev + 1, totalPaginas))} disabled={paginaActual === totalPaginas || totalPaginas === 0} className="px-3.5 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors shadow-sm">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}