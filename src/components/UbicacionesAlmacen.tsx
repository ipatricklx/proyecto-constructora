import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function UbicacionesAlmacen() {
  const [ubicaciones, setUbicaciones] = useState<any[]>([])
  const [paginaActual, setPaginaActual] = useState(1)
  
  const estadoInicial = { 
    id_ubicacion: '', 
    codigo: '', 
    nombre: '', 
    tipo_ubicacion: 'Estante', 
    descripcion: '', 
    activo: true 
  }
  const [formulario, setFormulario] = useState(estadoInicial)

  const itemsPorPagina = 10
  const indiceUltimoItem = paginaActual * itemsPorPagina
  const indicePrimerItem = indiceUltimoItem - itemsPorPagina
  const ubicacionesPaginadas = ubicaciones.slice(indicePrimerItem, indiceUltimoItem)
  const totalPaginas = Math.ceil(ubicaciones.length / itemsPorPagina)

  useEffect(() => { obtenerDatos() }, [])

  async function obtenerDatos() {
    const { data, error } = await supabase
      .from('ubicaciones')
      .select('*')
      .order('codigo', { ascending: true })
    
    if (error) console.error("Error obteniendo ubicaciones:", error.message)
    else if (data) setUbicaciones(data)
  }

  async function guardarUbicacion(e: React.FormEvent) {
    e.preventDefault()
    const { id_ubicacion, ...datosGuardar } = formulario 

    if (id_ubicacion) {
      // MODO EDICIÓN
      const { error } = await supabase.from('ubicaciones').update(datosGuardar).eq('id_ubicacion', id_ubicacion)
      if (error) alert('Error al actualizar: ' + error.message)
      else { 
        alert('Ubicación actualizada correctamente.');
        obtenerDatos(); 
        setFormulario(estadoInicial) 
      }
    } else {
      // MODO NUEVO
      const { error } = await supabase.from('ubicaciones').insert([datosGuardar])
      if (error) {
        if (error.code === '23505') alert('El código de ubicación ya existe. Usa uno diferente.')
        else alert('Error al guardar: ' + error.message)
      } else { 
        alert('Ubicación registrada correctamente.');
        obtenerDatos(); 
        setFormulario(estadoInicial) 
      }
    }
  }

  const editarUbicacion = (ubi: any) => {
    setFormulario({
      id_ubicacion: ubi.id_ubicacion, 
      codigo: ubi.codigo, 
      nombre: ubi.nombre, 
      tipo_ubicacion: ubi.tipo_ubicacion || 'Estante', 
      descripcion: ubi.descripcion || '',
      activo: ubi.activo
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const eliminarUbicacion = async (id: string) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar esta ubicación? Si ya tiene materiales asignados, podría generar un error de base de datos.')) {
      const { error } = await supabase.from('ubicaciones').delete().eq('id_ubicacion', id)
      if (error) alert('No se puede eliminar la ubicación porque ya está siendo utilizada por materiales o movimientos. Te recomendamos cambiar su estado a "Inactivo".')
      else obtenerDatos()
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shadow-sm border border-blue-100">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Gestión de Ubicaciones</h2>
            <p className="text-gray-500 text-sm mt-0.5">Administra los estantes, zonas y áreas de tu almacén.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => setFormulario(estadoInicial)} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-md font-medium text-sm transition-colors shadow-sm flex items-center justify-center gap-2">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nueva Ubicación
          </button>
        </div>
      </div>
      
      {/* Tarjeta de Formulario */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 font-semibold text-gray-700 flex items-center gap-2 bg-gray-50/50">
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          {formulario.id_ubicacion ? 'Editar Ubicación' : 'Agregar Ubicación'}
        </div>
        <form onSubmit={guardarUbicacion} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Código <span className="text-red-500">*</span></label>
            <input className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="Ej. EST-A1" required value={formulario.codigo} onChange={e => setFormulario({...formulario, codigo: e.target.value.toUpperCase()})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Nombre <span className="text-red-500">*</span></label>
            <input className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="Ej. Estante A1 - Ferretería" required value={formulario.nombre} onChange={e => setFormulario({...formulario, nombre: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Tipo <span className="text-red-500">*</span></label>
            <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" required value={formulario.tipo_ubicacion} onChange={e => setFormulario({...formulario, tipo_ubicacion: e.target.value})}>
              <option value="Estante">Estante</option>
              <option value="Patio">Patio Exterior</option>
              <option value="Cuarto">Cuarto Cerrado</option>
              <option value="Zona">Zona de Piso</option>
              <option value="Contenedor">Contenedor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Estado</label>
            <select className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value={formulario.activo ? 'true' : 'false'} onChange={e => setFormulario({...formulario, activo: e.target.value === 'true'})}>
              <option value="true">🟢 Activo (Disponible)</option>
              <option value="false">🔴 Inactivo (Bloqueado)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Descripción</label>
            <textarea className="w-full border border-gray-300 rounded-md p-2.5 text-sm h-[42px] focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="Detalles de lo que se guarda aquí..." value={formulario.descripcion} onChange={e => setFormulario({...formulario, descripcion: e.target.value})} />
          </div>
          
          <div className="md:col-span-2 flex justify-end items-end gap-3 pt-2">
            <button type="button" onClick={() => setFormulario(estadoInicial)} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 flex items-center gap-2 transition-colors">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Limpiar
            </button>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium flex items-center gap-2 transition-colors shadow-sm">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.875a3.375 3.375 0 003.375 3.375h1.875M16.5 7.5h3" />
              </svg>
              {formulario.id_ubicacion ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>

      {/* Tabla de Resultados */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white">
          <div className="font-semibold text-gray-800 flex items-center gap-2">
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Z" />
            </svg>
            Lista de Ubicaciones
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/80">
              <tr>
                {['Código', 'Nombre', 'Tipo', 'Descripción', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {ubicacionesPaginadas.map((ubi) => (
                <tr key={ubi.id_ubicacion} className="hover:bg-blue-50/50 transition-colors">
                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">{ubi.codigo}</td>
                  <td className="px-5 py-4 text-sm text-gray-700 font-medium">{ubi.nombre}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{ubi.tipo_ubicacion}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{ubi.descripcion || '-'}</td>
                  <td className="px-5 py-4 text-sm">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${ubi.activo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                      {ubi.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm flex gap-1 items-center">
                    <button onClick={() => editarUbicacion(ubi)} className="text-blue-500 hover:text-blue-700 hover:bg-blue-100 p-1.5 rounded-md transition-colors" title="Editar">
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                    </button>
                    <button onClick={() => eliminarUbicacion(ubi.id_ubicacion)} className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors" title="Eliminar">
                      <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Paginación */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50/50">
          <span className="text-sm text-gray-500 font-medium">
            Mostrando {ubicaciones.length === 0 ? 0 : indicePrimerItem + 1} - {Math.min(indiceUltimoItem, ubicaciones.length)} de {ubicaciones.length} ubicaciones
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPaginaActual(prev => Math.max(prev - 1, 1))} disabled={paginaActual === 1} className="px-3.5 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors shadow-sm">
              Anterior
            </button>
            <span className="px-4 py-1.5 border border-blue-200 rounded-md bg-blue-50 text-blue-700 text-sm font-bold shadow-sm">
              {paginaActual}
            </span>
            <button onClick={() => setPaginaActual(prev => Math.min(prev + 1, totalPaginas))} disabled={paginaActual === totalPaginas || totalPaginas === 0} className="px-3.5 py-1.5 border border-gray-300 rounded-md bg-white text-sm font-medium text-gray-700 disabled:opacity-50 hover:bg-gray-50 transition-colors shadow-sm">
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}