import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function Dashboard() {
  const [stats, setStats] = useState({ totalMateriales: 0, alertasStock: 0, totalDespachos: 0 })

  useEffect(() => {
    cargarEstadisticas()
  }, [])

  async function cargarEstadisticas() {
    // Calcular métricas de materiales
    const { data: mats } = await supabase.from('materiales').select('stock_actual, stock_minimo')
    let totalMat = 0
    let alertas = 0
    
    if (mats) {
      totalMat = mats.length
      alertas = mats.filter(m => m.stock_actual <= m.stock_minimo).length
    }

    // Contar total de salidas a obra
    const { count } = await supabase
      .from('movimientos')
      .select('*', { count: 'exact' })
      .eq('tipo_movimiento', 'SALIDA')

    setStats({ totalMateriales: totalMat, alertasStock: alertas, totalDespachos: count || 0 })
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui' }}>
      <h2>Panel de Control (Indicadores)</h2>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <div style={{ padding: '20px', background: '#f3f4f6', borderLeft: '5px solid #4b5563', borderRadius: '4px', flex: 1 }}>
          <h4 style={{ margin: 0, color: '#4b5563' }}>Materiales Registrados</h4>
          <p style={{ fontSize: '32px', margin: '10px 0 0 0', fontWeight: 'bold' }}>{stats.totalMateriales}</p>
        </div>
        
        <div style={{ padding: '20px', background: '#fee2e2', borderLeft: '5px solid #ef4444', borderRadius: '4px', flex: 1 }}>
          <h4 style={{ margin: 0, color: '#991b1b' }}>Alertas de Bajo Stock</h4>
          <p style={{ fontSize: '32px', margin: '10px 0 0 0', fontWeight: 'bold', color: '#b91c1c' }}>{stats.alertasStock}</p>
        </div>
        
        <div style={{ padding: '20px', background: '#e0f2fe', borderLeft: '5px solid #0ea5e9', borderRadius: '4px', flex: 1 }}>
          <h4 style={{ margin: 0, color: '#075985' }}>Despachos a Obra</h4>
          <p style={{ fontSize: '32px', margin: '10px 0 0 0', fontWeight: 'bold', color: '#0369a1' }}>{stats.totalDespachos}</p>
        </div>
      </div>
    </div>
  )
}