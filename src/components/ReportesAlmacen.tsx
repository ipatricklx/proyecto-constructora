
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

// FECHAS
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

interface AtributoNombre {
  nombre: string
}

const getNombreAtributo = (
  relacion?: AtributoNombre | AtributoNombre[]
) => {
  if (!relacion) return '-'
  return Array.isArray(relacion)
    ? relacion[0]?.nombre || '-'
    : relacion?.nombre || '-'
}

const escaparCSV = (val: any) => {
  if (val === null || val === undefined) return '""'
  return `"${String(val).replace(/"/g, '""')}"`
}

type Pestaña = 'kardex' | 'stock' | 'consumo'

export default function ReportesAlmacen() {
  const [pestañaActiva, setPestañaActiva] = useState<Pestaña>('kardex')
  const [cargando, setCargando] = useState(false)

  // LISTAS BASE
  const [materiales, setMateriales] = useState<any[]>([])
  const [proyectos, setProyectos] = useState<any[]>([])

  // KARDEX
  const [materialSeleccionado, setMaterialSeleccionado] = useState('')
  const [datosKardex, setDatosKardex] = useState<any[]>([])
  const [resumenKardex, setResumenKardex] = useState({
    totalEntradas: 0,
    totalSalidas: 0,
    saldoFinal: 0
  })

  // STOCK CRÍTICO
  const [datosStock, setDatosStock] = useState<any[]>([])
  const [materialesSinMinimo, setMaterialesSinMinimo] = useState<any[]>([])

  // CONSUMO POR PROYECTO
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState('')
  const [fechaInicio, setFechaInicio] = useState(getFechaPrimerDiaMes())
  const [fechaFin, setFechaFin] = useState(getFechaLocalHoy())
  const [datosConsumo, setDatosConsumo] = useState<any[]>([])
  const [costoTotalConsumo, setCostoTotalConsumo] = useState(0)

  useEffect(() => {
    cargarListasBase()
  }, [])

  useEffect(() => {
    if (pestañaActiva === 'stock') cargarStockCritico()
  }, [pestañaActiva])

  const handleMaterialKardexChange = (id: string) => {
    setMaterialSeleccionado(id)
    setDatosKardex([])
    setResumenKardex({
      totalEntradas: 0,
      totalSalidas: 0,
      saldoFinal: 0
    })
  }

  const handleProyectoConsumoChange = (id: string) => {
    setProyectoSeleccionado(id)
    setDatosConsumo([])
    setCostoTotalConsumo(0)
  }

  // LISTAS BASE
  async function cargarListasBase() {
    try {
      const [resMats, resProys] = await Promise.all([
        supabase
          .from('materiales')
          .select('id, nombre, codigo, stock_actual, unidades_medida(nombre)')
          .or('estado.eq.Activo,estado.eq.ACTIVO')
          .order('nombre', { ascending: true }),

        supabase
          .from('proyectos')
          .select('id, nombre')
          .order('nombre', { ascending: true })
      ])

      if (resMats.error) throw resMats.error
      if (resProys.error) throw resProys.error

      setMateriales(resMats.data || [])
      setProyectos(resProys.data || [])
    } catch (err: any) {
      alert('Error al cargar listas base: ' + err.message)
    }
  }

  // 1. KARDEX
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

        if (row.tipo_movimiento === 'ENTRADA') {
          entradasSum += cant
        } else if (row.tipo_movimiento === 'SALIDA') {
          salidasSum += cant
        }

        return {
          id: row.detalle_id,
          movimiento_id: row.movimiento_id,
          codigo_correlativo: row.codigo_correlativo,
          fecha: row.fecha_movimiento || row.fecha_registro?.split('T')[0],
          tipo_movimiento: row.tipo_movimiento,
          documento: row.documento,
          destino: row.origen_destino,
          responsable: row.responsable,
          cantidadMovida: cant,
          saldoAcumulado: Number(row.saldo_acumulado)
        }
      })

      const saldoFinalReal = calculados.length > 0
        ? calculados[calculados.length - 1].saldoAcumulado
        : 0

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

  // 2. STOCK CRÍTICO
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
          .filter((m: any) =>
            m.stock_minimo !== null &&
            m.stock_minimo !== undefined &&
            Number(m.stock_actual) <= Number(m.stock_minimo)
          )
          .map((m: any) => ({
            ...m,
            deficit: Number(m.stock_minimo) - Number(m.stock_actual)
          }))
          .sort((a: any, b: any) => b.deficit - a.deficit)

        const sinMinimo = data.filter(
          (m: any) =>
            m.stock_minimo === null ||
            m.stock_minimo === undefined
        )

        setDatosStock(criticos)
        setMaterialesSinMinimo(sinMinimo)
      }
    } catch (err: any) {
      alert('Error al cargar stock crítico: ' + err.message)
    } finally {
      setCargando(false)
    }
  }

  // 3. CONSUMO POR PROYECTO
  async function cargarConsumo() {
    if (!proyectoSeleccionado) {
      return alert('Selecciona un proyecto.')
    }

    if (fechaInicio > fechaFin) {
      return alert('La fecha inicial no puede ser posterior a la fecha final.')
    }

    setCargando(true)

    try {
      const { data, error } = await supabase
        .from('movimientos')
        .select(`
          id, codigo_correlativo, fecha_movimiento, fecha_registro,
          guia_remision, usuario_responsable,
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

          const detallesValorizados = (
            mov.detalle_movimientos || []
          ).map((det: any) => {
            const cant = Number(det.cantidad) || 0
            const precio = Number(det.precio_unitario) || 0
            const totalLinea = cant * precio

            subtotalVale += totalLinea

            return {
              ...det,
              cant,
              precio,
              totalLinea
            }
          })

          acumuladoPeriodo += subtotalVale

          return {
            ...mov,
            fecha: mov.fecha_movimiento || mov.fecha_registro?.split('T')[0],
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

  // EXPORTAR CSV
  const exportarAExcel = () => {
    let csvContent = ''
    const fechaHoyStr = getFechaLocalHoy()
    const filename = `reporte_${pestañaActiva}_${fechaHoyStr}.csv`

    if (pestañaActiva === 'kardex') {
      if (datosKardex.length === 0) {
        return alert('No hay datos en Kardex para exportar.')
      }

      const mat = materiales.find(
        m => m.id === materialSeleccionado
      )

      csvContent = `Reporte Kardex Material: ${escaparCSV(mat?.nombre)}\n`
      csvContent += 'Codigo Movimiento,Fecha,Tipo,Documento,Origen/Destino,Responsable,Cantidad Movida,Saldo Acumulado\n'

      datosKardex.forEach(row => {
        csvContent += `${escaparCSV(row.codigo_correlativo)},${escaparCSV(formatearFechaLocal(row.fecha))},${escaparCSV(row.tipo_movimiento)},${escaparCSV(row.documento)},${escaparCSV(row.destino)},${escaparCSV(row.responsable)},${row.cantidadMovida},${row.saldoAcumulado}\n`
      })

    } else if (pestañaActiva === 'stock') {
      if (datosStock.length === 0) {
        return alert('No hay datos de Stock Crítico para exportar.')
      }

      csvContent = 'Codigo,Material,Categoria,Stock Actual,Stock Minimo,Deficit,Unidad Medida\n'

      datosStock.forEach(m => {
        csvContent += `${escaparCSV(m.codigo)},${escaparCSV(m.nombre)},${escaparCSV(getNombreAtributo(m.categorias))},${m.stock_actual},${m.stock_minimo},${m.deficit},${escaparCSV(getNombreAtributo(m.unidades_medida))}\n`
      })

    } else if (pestañaActiva === 'consumo') {
      if (datosConsumo.length === 0) {
        return alert('No hay datos de consumo para exportar.')
      }

      const proy = proyectos.find(
        p => p.id === proyectoSeleccionado
      )

      csvContent = `Reporte Consumo Proyecto: ${escaparCSV(proy?.nombre)} (Desde: ${fechaInicio} Hasta: ${fechaFin})\n`
      csvContent += 'Codigo Movimiento,Fecha,Documento,Responsable,Codigo Material,Material,Cantidad,Unidad,Precio Unitario (S/),Subtotal (S/)\n'

      datosConsumo.forEach(c => {
        c.detalle_movimientos.forEach((det: any) => {
          csvContent += `${escaparCSV(c.codigo_correlativo)},${escaparCSV(formatearFechaLocal(c.fecha))},${escaparCSV(c.guia_remision)},${escaparCSV(c.usuario_responsable)},${escaparCSV(det.materiales?.codigo)},${escaparCSV(det.materiales?.nombre)},${det.cant},${escaparCSV(getNombreAtributo(det.materiales?.unidades_medida))},${det.precio.toFixed(2)},${det.totalLinea.toFixed(2)}\n`
        })
      })
    }

    const blob = new Blob(
      ['\uFEFF' + csvContent],
      { type: 'text/csv;charset=utf-8;' }
    )

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.setAttribute('download', filename)

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
  }

  const materialActualObj = materiales.find(
    m => m.id === materialSeleccionado
  )

  const pestañaClases = (id: Pestaña) =>
    `whitespace-nowrap flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-all ${
      pestañaActiva === id
        ? 'bg-white text-[#234675] shadow-sm'
        : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'
    }`

  return (
    <div className="space-y-7">

      {/* ENCABEZADO */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-slate-400">
            Gestión y seguimiento
          </p>

          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-800 sm:text-3xl">
            Reportes y analítica
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Consulta los movimientos, controla el inventario y analiza el consumo de materiales.
          </p>
        </div>

        <button
          onClick={exportarAExcel}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Exportar reporte
        </button>
      </section>

      {/* PESTAÑAS */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="border-b border-slate-100 bg-slate-50/80 p-3">
          <nav className="flex flex-wrap gap-2">
            <button
              onClick={() => setPestañaActiva('kardex')}
              className={pestañaClases('kardex')}
            >
              <span className="text-lg">▤</span>
              Kardex de material
            </button>

            <button
              onClick={() => setPestañaActiva('stock')}
              className={pestañaClases('stock')}
            >
              <span className="text-lg">◈</span>
              Stock crítico
            </button>

            <button
              onClick={() => setPestañaActiva('consumo')}
              className={pestañaClases('consumo')}
            >
              <span className="text-lg">▥</span>
              Consumo por proyecto
            </button>
          </nav>
        </div>

        <div className="p-5 sm:p-6">

          {/* KARDEX */}
          {pestañaActiva === 'kardex' && (
            <div className="space-y-6">

              <div className="flex flex-col items-end gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row">
                <div className="w-full flex-1">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                    Seleccionar material
                  </label>

                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    value={materialSeleccionado}
                    onChange={e => handleMaterialKardexChange(e.target.value)}
                  >
                    <option value="">Buscar material...</option>

                    {materiales.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.codigo ? `[${m.codigo}] ` : ''}
                        {m.nombre} (Stock: {m.stock_actual} {getNombreAtributo(m.unidades_medida)})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={cargarKardex}
                  disabled={!materialSeleccionado || cargando}
                  className="w-full rounded-xl bg-[#234675] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#19375c] disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                >
                  {cargando ? 'Calculando...' : 'Generar Kardex'}
                </button>
              </div>

              {datosKardex.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Total entradas
                    </p>
                    <p className="mt-2 text-2xl font-bold text-emerald-800">
                      +{resumenKardex.totalEntradas}
                    </p>
                    <p className="mt-1 text-xs text-emerald-600">
                      {getNombreAtributo(materialActualObj?.unidades_medida)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-red-100 bg-red-50/60 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-700">
                      Total salidas
                    </p>
                    <p className="mt-2 text-2xl font-bold text-red-800">
                      -{resumenKardex.totalSalidas}
                    </p>
                    <p className="mt-1 text-xs text-red-600">
                      {getNombreAtributo(materialActualObj?.unidades_medida)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
                      Saldo calculado
                    </p>
                    <p className="mt-2 text-2xl font-bold text-blue-900">
                      {resumenKardex.saldoFinal}
                    </p>
                    <p className="mt-1 text-xs text-blue-600">
                      {getNombreAtributo(materialActualObj?.unidades_medida)}
                    </p>
                  </div>

                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {[
                          'Código',
                          'Fecha',
                          'Tipo',
                          'Documento',
                          'Origen / Destino',
                          'Responsable',
                          'Cantidad',
                          'Saldo acum.'
                        ].map((titulo, i) => (
                          <th
                            key={titulo}
                            className={`whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 ${i >= 6 ? 'text-right' : 'text-left'} ${i === 7 ? 'bg-blue-50 text-blue-800' : ''}`}
                          >
                            {titulo}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 bg-white">
                      {datosKardex.map(k => (
                        <tr key={k.id} className="transition hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                            {k.codigo_correlativo}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                            {formatearFechaLocal(k.fecha)}
                          </td>

                          <td className="px-4 py-3">
                            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              k.tipo_movimiento === 'ENTRADA'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}>
                              {k.tipo_movimiento}
                            </span>
                          </td>

                          <td className="px-4 py-3 text-slate-700">
                            {k.documento || '-'}
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {k.destino || '-'}
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {k.responsable || '-'}
                          </td>

                          <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                            k.tipo_movimiento === 'ENTRADA'
                              ? 'text-emerald-600'
                              : 'text-red-600'
                          }`}>
                            {k.tipo_movimiento === 'ENTRADA' ? '+' : '-'}
                            {k.cantidadMovida}
                          </td>

                          <td className="whitespace-nowrap bg-blue-50/50 px-4 py-3 text-right font-bold text-blue-900">
                            {k.saldoAcumulado}
                          </td>
                        </tr>
                      ))}

                      {datosKardex.length === 0 && !cargando && (
                        <tr>
                          <td colSpan={8} className="px-4 py-14 text-center">
                            <p className="font-medium text-slate-600">
                              Selecciona un material para consultar su Kardex.
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Aquí aparecerá su historial de entradas y salidas.
                            </p>
                          </td>
                        </tr>
                      )}

                      {cargando && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                            Generando Kardex...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STOCK CRÍTICO */}
          {pestañaActiva === 'stock' && (
            <div className="space-y-6">

              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-semibold text-slate-800">
                    Alertas de reposición
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Materiales con stock actual igual o inferior al mínimo.
                  </p>
                </div>

                <button
                  onClick={cargarStockCritico}
                  disabled={cargando}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-[#234675] transition hover:bg-blue-50 disabled:opacity-50"
                >
                  {cargando ? 'Actualizando...' : '↻ Actualizar lista'}
                </button>
              </div>

              {cargando ? (
                <div className="py-14 text-center text-sm text-slate-400">
                  Cargando inventario...
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {datosStock.map(m => (
                      <div
                        key={m.id}
                        className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-red-100 bg-white p-5 shadow-sm"
                      >
                        <div className="absolute right-0 top-0 rounded-bl-xl bg-red-600 px-3 py-1.5 text-[10px] font-bold text-white">
                          DÉFICIT: -{m.deficit}
                        </div>

                        <div>
                          <p className="mb-2 font-mono text-xs font-semibold text-slate-400">
                            {m.codigo || 'SIN CÓDIGO'}
                          </p>

                          <h4
                            className="max-w-[85%] font-bold text-slate-800"
                            title={m.nombre}
                          >
                            {m.nombre}
                          </h4>

                          <p className="mt-1 text-xs text-slate-400">
                            {getNombreAtributo(m.categorias)}
                          </p>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                          <div>
                            <p className="text-[10px] font-bold uppercase text-slate-400">
                              Stock mínimo
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                              {m.stock_minimo} {getNombreAtributo(m.unidades_medida)}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase text-red-500">
                              Stock actual
                            </p>
                            <p className="mt-1 text-2xl font-bold text-red-600">
                              {m.stock_actual}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {datosStock.length === 0 && (
                      <div className="col-span-full rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-5 py-12 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                          ✓
                        </div>
                        <p className="mt-3 font-semibold text-slate-700">
                          No hay alertas de stock crítico
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Los materiales con stock mínimo configurado están dentro de sus niveles.
                        </p>
                      </div>
                    )}
                  </div>

                  {materialesSinMinimo.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                          !
                        </span>

                        <div>
                          <h4 className="text-sm font-bold text-amber-800">
                            Materiales sin stock mínimo ({materialesSinMinimo.length})
                          </h4>
                          <p className="mt-1 text-xs text-amber-700">
                            Configura un stock mínimo para activar las alertas de estos materiales.
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {materialesSinMinimo.map(m => (
                          <span
                            key={m.id}
                            className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                          >
                            {m.nombre}
                            <span className="ml-2 text-slate-400">
                              Stock: {m.stock_actual}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* CONSUMO POR PROYECTO */}
          {pestañaActiva === 'consumo' && (
            <div className="space-y-6">

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="mb-4">
                  <h3 className="font-semibold text-slate-800">
                    Parámetros de consulta
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Selecciona el proyecto y el periodo que deseas analizar.
                  </p>
                </div>

                <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="xl:col-span-2">
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Proyecto destino
                    </label>

                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={proyectoSeleccionado}
                      onChange={e => handleProyectoConsumoChange(e.target.value)}
                    >
                      <option value="">Seleccionar proyecto...</option>
                      {proyectos.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Desde
                    </label>

                    <input
                      type="date"
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={fechaInicio}
                      onChange={e => setFechaInicio(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-600">
                      Hasta
                    </label>

                    <input
                      type="date"
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                      value={fechaFin}
                      onChange={e => setFechaFin(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    onClick={cargarConsumo}
                    disabled={!proyectoSeleccionado || cargando}
                    className="w-full rounded-xl bg-[#234675] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#19375c] disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
                  >
                    {cargando ? 'Consultando...' : 'Consultar consumo'}
                  </button>
                </div>
              </div>

              {datosConsumo.length > 0 && (
                <div className="flex flex-col justify-between gap-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                      Costo total despachado
                    </p>

                    <p className="mt-2 text-3xl font-bold text-emerald-900">
                      S/ {costoTotalConsumo.toLocaleString('es-PE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </p>
                  </div>

                  <span className="w-fit rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700">
                    {datosConsumo.length} {datosConsumo.length === 1 ? 'salida registrada' : 'salidas registradas'}
                  </span>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                          Código / Documento
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                          Responsable
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                          Materiales despachados
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-emerald-700">
                          Total vale
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 bg-white">
                      {datosConsumo.map(c => (
                        <tr key={c.id} className="transition hover:bg-slate-50">
                          <td className="whitespace-nowrap px-4 py-4 align-top">
                            <p className="font-semibold text-slate-700">
                              {c.codigo_correlativo || c.id.slice(0, 8)}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {c.guia_remision || 'Sin documento'}
                            </p>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 align-top text-slate-500">
                            {formatearFechaLocal(c.fecha)}
                          </td>

                          <td className="px-4 py-4 align-top font-medium text-slate-600">
                            {c.usuario_responsable || '-'}
                          </td>

                          <td className="min-w-[260px] px-4 py-4">
                            <div className="space-y-2">
                              {c.detalle_movimientos.map((det: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                                >
                                  <span className="text-xs text-slate-700">
                                    <strong>{det.cant}</strong>{' '}
                                    {getNombreAtributo(det.materiales?.unidades_medida)}
                                    {' — '}
                                    {det.materiales?.nombre}
                                  </span>

                                  <span className="whitespace-nowrap text-xs font-medium text-slate-400">
                                    S/ {det.totalLinea.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-right align-top text-base font-bold text-emerald-700">
                            S/ {c.subtotalVale.toFixed(2)}
                          </td>
                        </tr>
                      ))}

                      {datosConsumo.length === 0 && !cargando && (
                        <tr>
                          <td colSpan={5} className="px-4 py-14 text-center">
                            <p className="font-medium text-slate-600">
                              No hay resultados para mostrar.
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Selecciona un proyecto y consulta el periodo deseado.
                            </p>
                          </td>
                        </tr>
                      )}

                      {cargando && (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                            Consultando consumo...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>
    </div>
  )
}
