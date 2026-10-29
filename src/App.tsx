import { useState } from 'react'
import Dashboard from './components/Dashboard'
import CatalogoMateriales from './components/CatalogoMateriales'
import EntradasAlmacen from './components/EntradasAlmacen'
import SalidasAlmacen from './components/SalidasAlmacen'
import UbicacionesAlmacen from './components/UbicacionesAlmacen'
import ReportesAlmacen from './components/ReportesAlmacen' // <-- NUEVO MÓDULO IMPORTADO

function App() {
  const [vistaActual, setVistaActual] = useState('dashboard')

  // Opciones del menú para iterar fácilmente
  const opcionesMenu = [
    {
      id: 'dashboard',
      label: 'Inicio',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      )
    },
    {
      id: 'catalogo',
      label: 'Materiales',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
        </svg>
      )
    },
    {
      id: 'ubicaciones',
      label: 'Ubicaciones',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      )
    },
    {
      id: 'entradas',
      label: 'Entradas',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
        </svg>
      )
    },
    {
      id: 'salidas',
      label: 'Salidas',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
        </svg>
      )
    },
    {
      id: 'reportes',
      label: 'Reportes',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
      )
    }
  ]

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      
      {/* Sidebar Lateral */}
      <aside className="w-64 bg-[#141b2d] flex flex-col shadow-2xl relative z-10">
        
        {/* Cabecera / Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white text-xl tracking-tighter">
            H
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wider">HAKU</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">Constructora</p>
          </div>
        </div>
        
        {/* Navegación */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Almacén y Logística
          </div>
          
          {opcionesMenu.map((opcion) => (
            <button 
              key={opcion.id}
              onClick={() => setVistaActual(opcion.id)} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 font-medium text-sm ${
                vistaActual === opcion.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                  : "text-gray-400 hover:bg-[#1f2940] hover:text-gray-100"
              }`}
            >
              {opcion.icon}
              {opcion.label}
            </button>
          ))}
        </nav>

        {/* Footer del Sidebar - Perfil de Usuario */}
        <div className="p-4 border-t border-gray-800/60 bg-[#101625]">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-gray-300">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">Patrick Abanto</p>
              <p className="text-xs text-gray-500 truncate">Administrador</p>
            </div>
            <button className="text-gray-500 hover:text-white transition-colors">
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Área de Contenido Principal */}
      <main className="flex-1 p-6 lg:p-10 overflow-y-auto w-full">
        <div className="max-w-7xl mx-auto min-h-full pb-10">
          {vistaActual === 'dashboard' && <Dashboard />}
          {vistaActual === 'catalogo' && <CatalogoMateriales />}
          {vistaActual === 'ubicaciones' && <UbicacionesAlmacen />}
          {vistaActual === 'entradas' && <EntradasAlmacen />}
          {vistaActual === 'salidas' && <SalidasAlmacen />}
          {vistaActual === 'reportes' && <ReportesAlmacen />}
        </div>
      </main>

    </div>
  )
}

export default App