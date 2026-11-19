
import { useState } from 'react'
import Dashboard from './components/Dashboard'
import CatalogoMateriales from './components/CatalogoMateriales'
import EntradasAlmacen from './components/EntradasAlmacen'
import SalidasAlmacen from './components/SalidasAlmacen'
import UbicacionesAlmacen from './components/UbicacionesAlmacen'
import ReportesAlmacen from './components/ReportesAlmacen'
import PrediccionDemanda from './components/PrediccionDemanda'

const opcionesMenu = [
  {
    id: 'dashboard',
    label: 'Inicio',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5M5.25 9v10.5h13.5V9M9 19.5v-6h6v6" />
      </svg>
    )
  },
  {
    id: 'catalogo',
    label: 'Materiales',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L3.5 7.5 12 12l8.5-4.5L12 3ZM3.5 7.5v9L12 21l8.5-4.5v-9M12 12v9" />
      </svg>
    )
  },
  {
    id: 'ubicaciones',
    label: 'Ubicaciones',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10c0 5.25-7.5 11-7.5 11S4.5 15.25 4.5 10a7.5 7.5 0 1 1 15 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    )
  },
  {
    id: 'entradas',
    label: 'Entradas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M4.5 14.25v4.5A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25v-4.5" />
      </svg>
    )
  },
  {
    id: 'salidas',
    label: 'Salidas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4.5-4.5M12 15l-4.5-4.5M4.5 14.25v4.5A2.25 2.25 0 0 0 6.75 21h10.5a2.25 2.25 0 0 0 2.25-2.25v-4.5" />
      </svg>
    )
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5V11m5 8.5V5m5 14.5v-6m5 6V8" />
      </svg>
    )
  },
  {
    id: 'prediccion',
    label: 'Predicción IA',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17.5 9 11l4 4 8-9M15 6h6v6" />
      </svg>
    )
  }
]

const titulos: Record<string, string> = {
  dashboard: 'Inicio',
  catalogo: 'Materiales',
  ubicaciones: 'Ubicaciones',
  entradas: 'Entradas de almacén',
  salidas: 'Salidas de almacén',
  reportes: 'Reportes',
  prediccion: 'Predicción de demanda'
}

function App() {
  const [vistaActual, setVistaActual] = useState('dashboard')
  const [menuAbierto, setMenuAbierto] = useState(false)

  const cambiarVista = (id: string) => {
    setVistaActual(id)
    setMenuAbierto(false)
  }

  const renderizarVista = () => {
    switch (vistaActual) {
      case 'dashboard':
        return <Dashboard />
      case 'catalogo':
        return <CatalogoMateriales />
      case 'ubicaciones':
        return <UbicacionesAlmacen />
      case 'entradas':
        return <EntradasAlmacen />
      case 'salidas':
        return <SalidasAlmacen />
      case 'reportes':
        return <ReportesAlmacen />
      case 'prediccion':
        return <PrediccionDemanda />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-[#F7F8FA] text-slate-800">

      {/* Fondo para el menú móvil */}
      {menuAbierto && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setMenuAbierto(false)}
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform duration-300 lg:translate-x-0 ${
          menuAbierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >

        {/* Logo */}
        <div className="flex h-[82px] items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#172B4D] text-xl font-bold text-white shadow-sm">
            H
          </div>

          <div>
            <h1 className="text-xl font-bold tracking-[0.12em] text-[#172B4D]">
              HAKU
            </h1>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-400">
              Constructora
            </p>
          </div>

          <button
            onClick={() => setMenuAbierto(false)}
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto px-4 py-7">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Gestión de almacén
          </p>

          <div className="space-y-1">
            {opcionesMenu.map((opcion) => {
              const activo = vistaActual === opcion.id

              return (
                <button
                  key={opcion.id}
                  onClick={() => cambiarVista(opcion.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[13px] font-medium transition-all duration-200 ${
                    activo
                      ? 'bg-[#EEF2F8] text-[#172B4D]'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span
                    className={`h-5 w-5 shrink-0 ${
                      activo ? 'text-[#234675]' : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  >
                    {opcion.icon}
                  </span>

                  <span className="flex-1">{opcion.label}</span>

                  {activo && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#234675]" />
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Perfil */}
        <div className="border-t border-slate-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E5EAF2] text-sm font-bold text-[#234675]">
              P
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-800">
                Patrick Abanto
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Administrador
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <div className="flex h-full min-w-0 flex-col lg:pl-[260px]">

        {/* Cabecera superior */}
        <header className="z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">

          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuAbierto(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="Abrir menú"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div>
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:block">
                HAKU / Gestión de almacén
              </p>
              <h2 className="text-base font-semibold text-slate-800 sm:mt-0.5 sm:text-lg">
                {titulos[vistaActual]}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-slate-500">
                Panel de gestión
              </span>
            </div>

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2F8] text-xs font-bold text-[#234675]">
              P
            </div>
          </div>
        </header>

        {/* Contenido dinámico */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-7 sm:py-8 lg:px-9">
          <div className="mx-auto w-full max-w-[1500px] pb-8">
            {renderizarVista()}
          </div>
        </main>

      </div>
    </div>
  )
}

export default App
