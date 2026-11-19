import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error


def predecir_demanda(metodo, historial):

    historial = np.array(historial, dtype=float)

    if metodo == "Regresión Lineal (OLS)":
        X = np.arange(len(historial)).reshape(-1, 1)
        modelo = LinearRegression()
        modelo.fit(X, historial)

        siguiente_mes = np.array([[len(historial)]])
        prediccion = modelo.predict(siguiente_mes)[0]

    elif metodo == "Promedio móvil":
        prediccion = np.mean(historial[-3:])

    elif metodo == "Último valor":
        prediccion = historial[-1]

    return max(0, float(prediccion))

def evaluar_metodo(metodo, historial, meses_prueba=3):
    reales = []
    predicciones = []

    for i in range(len(historial) - meses_prueba, len(historial)):
        datos_entrenamiento = historial[:i]

        prediccion = predecir_demanda(
            metodo,
            datos_entrenamiento
        )

        reales.append(float(historial[i]))
        predicciones.append(float(prediccion))

    reales = np.array(reales)
    predicciones = np.array(predicciones)

    mae = mean_absolute_error(reales, predicciones)

    rmse = np.sqrt(
        mean_squared_error(reales, predicciones)
    )

    suma_real = np.sum(reales)

    wmape = (
        np.sum(np.abs(reales - predicciones)) / suma_real * 100
        if suma_real > 0 else None
    )

    precision = (
        max(0.0, 100.0 - wmape)
        if wmape is not None else None
    )

    return {
        "mae": round(float(mae), 2),
        "rmse": round(float(rmse), 2),
        "wmape": round(float(wmape), 2) if wmape is not None else None,
        "precision_pct": round(float(precision), 1) if precision is not None else None,
        "reales": reales.tolist(),
        "predicciones": predicciones.tolist()
    }

load_dotenv()
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

app = FastAPI(title="ML Almacén API - HAKU")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://proyecto-constructora-sable.vercel.app"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def health_check():
    return {"status": "online", "mensaje": "API de Machine Learning activa"}


@app.get("/api/predict/demand")
def predict_demand():

    # 1. Consultar movimientos normales completados
    response = supabase.table("detalle_movimientos").select(
        "cantidad, material_id, materiales(nombre), movimientos!inner(fecha_movimiento, tipo_movimiento, estado)"
    ).eq("movimientos.tipo_movimiento", "SALIDA").eq(
        "movimientos.estado", "Completada"
    ).execute()

    # 2. Consultar salidas del historial simulado
    historical_response = supabase.table(
        "movimientos_historicos_ml"
    ).select(
        "cantidad, material_id, fecha_movimiento, materiales(nombre)"
    ).eq("tipo_movimiento", "SALIDA").execute()

    # 3. Combinar los registros de ambas fuentes
    records = []

    # Movimientos normales
    for row in response.data:
        records.append({
            "material_id": row["material_id"],
            "nombre": row["materiales"]["nombre"] if row.get("materiales") else "Sin nombre",
            "cantidad": float(row["cantidad"]),
            "fecha": row["movimientos"]["fecha_movimiento"]
        })

    # Historial simulado
    for row in historical_response.data:
        records.append({
            "material_id": row["material_id"],
            "nombre": row["materiales"]["nombre"] if row.get("materiales") else "Sin nombre",
            "cantidad": float(row["cantidad"]),
            "fecha": row["fecha_movimiento"]
        })

    # 4. Validar que existan registros
    if not records:
        return {
            "status": "error",
            "message": "No hay datos históricos suficientes para predecir."
        }

    # 5. Preparar los datos para Machine Learning
    df = pd.DataFrame(records)
    df['fecha'] = pd.to_datetime(df['fecha'], format='ISO8601')

    # Identificar el primer día del mes actual
    ahora_peru = pd.Timestamp.now(tz="America/Lima").tz_localize(None)

    inicio_mes_actual = ahora_peru.to_period("M").start_time
    mes_actual_idx = ahora_peru.to_period("M").ordinal
    
    # Excluir movimientos del mes actual, todavía incompleto
    df = df[df['fecha'].dt.tz_localize(None) < inicio_mes_actual].copy()

    # Obtener el índice mensual
    df['mes_idx'] = df['fecha'].dt.tz_localize(None).dt.to_period('M').astype(int)


    resultados = []
    materiales_unicos = df['material_id'].unique()

    # Listas para métricas globales del modelo (solo materiales con >= 3 meses)
    y_reales_global = []
    y_pred_global = []

    for mat_id in materiales_unicos:
        df_mat = df[df['material_id'] == mat_id]
        nombre_mat = df_mat['nombre'].iloc[0]
        
        demanda_mensual = (
        df_mat.groupby('mes_idx')['cantidad']
        .sum()
        .sort_index()
    )       
    # Completar los meses sin despachos con demanda cero
        todos_los_meses = range(
        demanda_mensual.index.min(),
        demanda_mensual.index.max() + 1
    )   
        demanda_mensual = (
        demanda_mensual
        .reindex(todos_los_meses, fill_value=0)
        .rename_axis('mes_idx')
        .reset_index(name='cantidad')
    )   
        meses_analizados = int(len(demanda_mensual))
        promedio_historico = round(float(demanda_mensual['cantidad'].mean()), 1)
        
        if meses_analizados < 2:
            prediccion_final = max(0, round(promedio_historico))
            resultados.append({
                "material_id": mat_id,
                "nombre": nombre_mat,
                "promedio_mensual": promedio_historico,
                "prediccion_proximo_mes": prediccion_final,
                "tendencia": "Base inicial",
                "variacion_pct": 0.0,
                "meses_analizados": meses_analizados,
                "confiabilidad": "Baja",
                "mae": None,
                "rmse": None,
                "precision_pct": None,
                "algoritmo_seleccionado": "Promedio móvil",
                "evaluacion_disponible": False
            })
            continue

        y = demanda_mensual['cantidad']

        # Evaluación sobre historial (solo válido matemáticamente desde 3 meses)
        # Evaluación temporal de varios meses
        mae_mat = None
        rmse_mat = None
        precision_mat = None
        algoritmo_seleccionado = "Sin evaluación"

        metodos = [
            "Regresión Lineal (OLS)",
            "Promedio móvil",
            "Último valor"
        ]

        if meses_analizados >= 6:
            evaluaciones = {}

            for metodo in metodos:
                evaluaciones[metodo] = evaluar_metodo(
                    metodo,
                    y.values,
                    meses_prueba=3
                )

            # Seleccionar el método con menor WMAPE
            metodos_validos = {
                nombre: resultado
                for nombre, resultado in evaluaciones.items()
                if resultado["wmape"] is not None
            }

            if metodos_validos:
                algoritmo_seleccionado = min(
                    metodos_validos,
                    key=lambda nombre: metodos_validos[nombre]["wmape"]
                )

                mejor_resultado = evaluaciones[algoritmo_seleccionado]

                mae_mat = mejor_resultado["mae"]
                rmse_mat = mejor_resultado["rmse"]
                precision_mat = mejor_resultado["precision_pct"]
                y_reales_global.extend(
                    mejor_resultado["reales"]
                )

                y_pred_global.extend(
                    mejor_resultado["predicciones"]
                )
        # Predicción del próximo mes usando todo el historial
        # Predicción del próximo mes usando el método seleccionado
        metodo_final = algoritmo_seleccionado

        if metodo_final == "Sin evaluación":
            metodo_final = "Promedio móvil"

        prediccion = predecir_demanda(
            metodo_final,
            y.values
        )

        prediccion_final = max(0, round(float(prediccion)))

        # Tendencia basada en la evolución del historial
        # Variación de la predicción respecto al promedio histórico
        variacion_pct = (
            round(
                ((prediccion_final - promedio_historico)
                / promedio_historico) * 100, 1
            )
            if promedio_historico > 0 else 0.0
        )

        # Tendencia coherente con la variación proyectada
        if variacion_pct > 5:
            tendencia = "En alza"
        elif variacion_pct < -5:
            tendencia = "A la baja"
        else:
            tendencia = "Estable"

        resultados.append({
            "material_id": mat_id,
            "nombre": nombre_mat,
            "promedio_mensual": promedio_historico,
            "prediccion_proximo_mes": prediccion_final,
            "tendencia": tendencia,
            "variacion_pct": variacion_pct,
            "meses_analizados": meses_analizados,
            "confiabilidad": (
                "Alta" if meses_analizados >= 12 and precision_mat is not None and precision_mat >= 75
                else "Media" if meses_analizados >= 9 and precision_mat is not None and precision_mat >= 50
                else "Baja"
            ),
            "mae": mae_mat,
            "rmse": rmse_mat,
            "precision_pct": precision_mat,
            "algoritmo_seleccionado": metodo_final,
            "evaluacion_disponible": meses_analizados >= 6 and precision_mat is not None
            
        })


    # Calcular métricas globales del modelo
    if len(y_reales_global) >= 1:
        y_r = np.array(y_reales_global)
        y_p = np.array(y_pred_global)
        mae_global = round(float(mean_absolute_error(y_r, y_p)), 2)
        rmse_global = round(float(np.sqrt(mean_squared_error(y_r, y_p))), 2)
        wmape_global = (float(np.sum(np.abs(y_r - y_p))) / float(np.sum(y_r))) * 100 if np.sum(y_r) > 0 else 0.0
        precision_global = max(0.0, round(100.0 - wmape_global, 1))
        calibrado = False
    else:
        mae_global = None
        rmse_global = None
        precision_global = None
        calibrado = False

    resultados.sort(key=lambda x: x["prediccion_proximo_mes"], reverse=True)
    
    return {
        "status": "success",
        "metricas_modelo": {
            "calibrado": calibrado,
            "precision_global_pct": precision_global,
            "mae_global": mae_global,
            "rmse_global": rmse_global,
            "algoritmo": "Selección automática por material (menor WMAPE)"
        },
        "data": resultados
    }