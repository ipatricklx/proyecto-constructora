import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

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
    response = supabase.table("detalle_movimientos").select(
    "cantidad, material_id, materiales(nombre), movimientos!inner(fecha_movimiento, tipo_movimiento, estado)"
    ).eq("movimientos.tipo_movimiento", "SALIDA").eq("movimientos.estado", "Completada").execute()

    data = response.data
    if not data:
        return {"status": "error", "message": "No hay datos históricos suficientes para predecir."}

    records = []
    for row in data:
        records.append({
            "material_id": row["material_id"],
            "nombre": row["materiales"]["nombre"] if row.get("materiales") else "Sin nombre",
            "cantidad": float(row["cantidad"]),
            "fecha": row["movimientos"]["fecha_movimiento"]
        })
    
    df = pd.DataFrame(records)
    df['fecha'] = pd.to_datetime(df['fecha'], format='ISO8601')
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
                "precision_pct": None
            })
            continue

        X = demanda_mensual[['mes_idx']]
        y = demanda_mensual['cantidad']

        modelo = LinearRegression()
        modelo.fit(X, y)

        # Evaluación sobre historial (solo válido matemáticamente desde 3 meses)
        mae_mat = None
        rmse_mat = None
        precision_mat = None

        if meses_analizados >= 4:
    # Reservar el último mes para evaluar la predicción
         X_train = X.iloc[:-1]
         y_train = y.iloc[:-1]

         X_test = X.iloc[-1:]
         y_test = y.iloc[-1:]

    modelo_evaluacion = LinearRegression()
    modelo_evaluacion.fit(X_train, y_train)

    y_pred_test = modelo_evaluacion.predict(X_test)

    mae_mat = round(
        float(mean_absolute_error(y_test, y_pred_test)), 2
    )

    rmse_mat = round(
        float(np.sqrt(mean_squared_error(y_test, y_pred_test))), 2
    )

    suma_real = float(np.sum(y_test))

    if suma_real > 0:
        wmape = (
            float(np.sum(np.abs(y_test - y_pred_test)))
            / suma_real
        ) * 100

        precision_mat = max(
            0.0, round(100.0 - wmape, 1)
        )

        y_reales_global.extend(y_test.tolist())
        y_pred_global.extend(y_pred_test.tolist())

        pendiente = float(modelo.coef_[0])
        mes_actual_idx = pd.Timestamp.now().to_period('M').ordinal
        proximo_mes_df = pd.DataFrame({'mes_idx': [mes_actual_idx + 1]})
        
        prediccion = modelo.predict(proximo_mes_df)[0]
        prediccion_final = max(0, round(float(prediccion)))

        if pendiente > 0.5:
            tendencia = "En alza"
        elif pendiente < -0.5:
            tendencia = "A la baja"
        else:
            tendencia = "Estable"

        variacion_pct = (
            round(((prediccion_final - promedio_historico) / promedio_historico) * 100, 1)
            if promedio_historico > 0 else 0.0
        )

        resultados.append({
            "material_id": mat_id,
            "nombre": nombre_mat,
            "promedio_mensual": promedio_historico,
            "prediccion_proximo_mes": prediccion_final,
            "tendencia": tendencia,
            "variacion_pct": variacion_pct,
            "meses_analizados": meses_analizados,
            "confiabilidad": "Preliminar" if meses_analizados >= 4 else "Baja",
            "mae": mae_mat,
            "rmse": rmse_mat,
            "precision_pct": precision_mat
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
            "algoritmo": "Regresión Lineal (OLS)"
        },
        "data": resultados
    }