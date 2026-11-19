
import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv

import pandas as pd
import numpy as np

from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error


# ==========================================
# FUNCIONES DE PREDICCIÓN
# ==========================================

def predecir_demanda(metodo, historial, pasos=1):

    historial = np.array(historial, dtype=float)
    pasos = max(1, int(pasos))

    if len(historial) == 0:
        return 0.0

    if metodo == "Regresión Lineal (OLS)":

        X = np.arange(len(historial)).reshape(-1, 1)

        modelo = LinearRegression()
        modelo.fit(X, historial)

        siguiente_mes = np.array([
            [len(historial) + pasos - 1]
        ])

        prediccion = modelo.predict(siguiente_mes)[0]

    elif metodo == "Promedio móvil":

        datos = list(historial)

        for _ in range(pasos):
            nueva_prediccion = float(np.mean(datos[-3:]))
            datos.append(nueva_prediccion)

        prediccion = datos[-1]

    elif metodo == "Último valor":

        prediccion = historial[-1]

    else:
        prediccion = np.mean(historial[-3:])

    return max(0.0, float(prediccion))


# ==========================================
# EVALUACIÓN DE ALGORITMOS
# ==========================================

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


# ==========================================
# CONEXIÓN SUPABASE
# ==========================================

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


# ==========================================
# ESTADO DE LA API
# ==========================================

@app.get("/")
def health_check():

    return {
        "status": "online",
        "mensaje": "API de Machine Learning activa"
    }


# ==========================================
# PREDICCIÓN DE DEMANDA POR MES
# ==========================================

@app.get("/api/predict/demand")
def predict_demand(mes: Optional[str] = None):

    # 1. Determinar el mes solicitado

    ahora_peru = pd.Timestamp.now(
        tz="America/Lima"
    ).tz_localize(None)

    periodo_actual = ahora_peru.to_period("M")
    periodo_siguiente = periodo_actual + 1

    if mes is None:
        periodo_objetivo = periodo_siguiente

    else:

        try:
            periodo_objetivo = pd.Period(mes, freq="M")

            if len(mes) != 7 or mes[4] != "-":
                raise ValueError("Formato incorrecto")

        except Exception:
            raise HTTPException(
                status_code=400,
                detail="El mes debe tener el formato YYYY-MM."
            )

        if periodo_objetivo < periodo_siguiente:
            raise HTTPException(
                status_code=400,
                detail="Solo se permiten consultar meses futuros."
            )

    inicio_mes_actual = periodo_actual.start_time

    # Último mes completo disponible
    periodo_base = periodo_actual - 1

    # Cantidad de periodos entre la base y el objetivo
    pasos_prediccion = (
        periodo_objetivo.ordinal - periodo_base.ordinal
    )

    # ======================================
    # 2. CONSULTAR MOVIMIENTOS OPERATIVOS
    # ======================================

    response = supabase.table(
        "detalle_movimientos"
    ).select(
        "cantidad, material_id, materiales(nombre), movimientos!inner(fecha_movimiento, tipo_movimiento, estado)"
    ).eq(
        "movimientos.tipo_movimiento", "SALIDA"
    ).eq(
        "movimientos.estado", "Completada"
    ).execute()

    # ======================================
    # 3. CONSULTAR HISTORIAL SIMULADO
    # ======================================

    historical_response = supabase.table(
        "movimientos_historicos_ml"
    ).select(
        "cantidad, material_id, fecha_movimiento, materiales(nombre)"
    ).eq(
        "tipo_movimiento", "SALIDA"
    ).execute()

    # ======================================
    # 4. COMBINAR LOS REGISTROS
    # ======================================

    records = []

    for row in response.data:

        records.append({
            "material_id": row["material_id"],
            "nombre": (
                row["materiales"]["nombre"]
                if row.get("materiales")
                else "Sin nombre"
            ),
            "cantidad": float(row["cantidad"]),
            "fecha": row["movimientos"]["fecha_movimiento"]
        })

    for row in historical_response.data:

        records.append({
            "material_id": row["material_id"],
            "nombre": (
                row["materiales"]["nombre"]
                if row.get("materiales")
                else "Sin nombre"
            ),
            "cantidad": float(row["cantidad"]),
            "fecha": row["fecha_movimiento"]
        })

    if not records:

        return {
            "status": "error",
            "message": "No hay datos históricos suficientes para predecir."
        }

    # ======================================
    # 5. PREPARAR EL HISTORIAL
    # ======================================

    df = pd.DataFrame(records)

    df["fecha"] = pd.to_datetime(
        df["fecha"],
        format="ISO8601"
    )

    # Excluir el mes actual porque todavía está incompleto
    df = df[
        df["fecha"].dt.tz_localize(None) < inicio_mes_actual
    ].copy()

    if df.empty:

        return {
            "status": "error",
            "message": "No existen movimientos de meses completos para realizar la predicción."
        }

    df["mes_idx"] = (
        df["fecha"]
        .dt.tz_localize(None)
        .dt.to_period("M")
        .apply(lambda periodo: periodo.ordinal)
    )

    # ======================================
    # 6. PROCESAR CADA MATERIAL
    # ======================================

    resultados = []

    materiales_unicos = df["material_id"].unique()

    y_reales_global = []
    y_pred_global = []

    for mat_id in materiales_unicos:

        df_mat = df[df["material_id"] == mat_id]

        nombre_mat = df_mat["nombre"].iloc[0]

        demanda_mensual = (
            df_mat.groupby("mes_idx")["cantidad"]
            .sum()
            .sort_index()
        )

        # Completar meses sin movimientos hasta
        # el último mes completo disponible.

        todos_los_meses = range(
            int(demanda_mensual.index.min()),
            periodo_base.ordinal + 1
        )

        demanda_mensual = (
            demanda_mensual
            .reindex(todos_los_meses, fill_value=0)
        )

        meses_analizados = int(len(demanda_mensual))

        y = demanda_mensual.values.astype(float)

        promedio_historico = round(
            float(np.mean(y)),
            1
        )

        # ==================================
        # 7. HISTORIAL INSUFICIENTE
        # ==================================

        if meses_analizados < 2:

            prediccion_final = max(
                0,
                round(promedio_historico)
            )

            resultados.append({

                "material_id": mat_id,
                "nombre": nombre_mat,

                "promedio_mensual": promedio_historico,

                "prediccion_proximo_mes": prediccion_final,
                "prediccion_mes_seleccionado": prediccion_final,

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

        # ==================================
        # 8. EVALUAR LOS ALGORITMOS
        # ==================================

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
                    y,
                    meses_prueba=3
                )

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

                mejor_resultado = evaluaciones[
                    algoritmo_seleccionado
                ]

                mae_mat = mejor_resultado["mae"]
                rmse_mat = mejor_resultado["rmse"]
                precision_mat = mejor_resultado["precision_pct"]

                y_reales_global.extend(
                    mejor_resultado["reales"]
                )

                y_pred_global.extend(
                    mejor_resultado["predicciones"]
                )

        # ==================================
        # 9. PREDECIR EL MES SOLICITADO
        # ==================================

        metodo_final = algoritmo_seleccionado

        if metodo_final == "Sin evaluación":
            metodo_final = "Promedio móvil"

        prediccion = predecir_demanda(
            metodo_final,
            y,
            pasos=pasos_prediccion
        )

        prediccion_final = max(
            0,
            round(float(prediccion))
        )

        # ==================================
        # 10. CALCULAR TENDENCIA
        # ==================================

        variacion_pct = (

            round(
                (
                    (prediccion_final - promedio_historico)
                    / promedio_historico
                ) * 100,
                1
            )

            if promedio_historico > 0
            else 0.0
        )

        if variacion_pct > 5:
            tendencia = "En alza"

        elif variacion_pct < -5:
            tendencia = "A la baja"

        else:
            tendencia = "Estable"

        # ==================================
        # 11. CONFIABILIDAD
        # ==================================

        if (
            meses_analizados >= 12
            and precision_mat is not None
            and precision_mat >= 75
        ):
            confiabilidad = "Alta"

        elif (
            meses_analizados >= 9
            and precision_mat is not None
            and precision_mat >= 50
        ):
            confiabilidad = "Media"

        else:
            confiabilidad = "Baja"

        # ==================================
        # 12. GUARDAR RESULTADO
        # ==================================

        resultados.append({

            "material_id": mat_id,
            "nombre": nombre_mat,

            "promedio_mensual": promedio_historico,

            # Se conserva el campo anterior para
            # mantener compatibilidad con el frontend.

            "prediccion_proximo_mes": prediccion_final,

            "prediccion_mes_seleccionado": prediccion_final,

            "tendencia": tendencia,
            "variacion_pct": variacion_pct,

            "meses_analizados": meses_analizados,

            "confiabilidad": confiabilidad,

            "mae": mae_mat,
            "rmse": rmse_mat,
            "precision_pct": precision_mat,

            "algoritmo_seleccionado": metodo_final,

            "evaluacion_disponible": (
                meses_analizados >= 6
                and precision_mat is not None
            )

        })

    # ======================================
    # 13. MÉTRICAS GLOBALES
    # ======================================

    if len(y_reales_global) >= 1:

        y_r = np.array(y_reales_global)
        y_p = np.array(y_pred_global)

        mae_global = round(
            float(mean_absolute_error(y_r, y_p)),
            2
        )

        rmse_global = round(
            float(np.sqrt(mean_squared_error(y_r, y_p))),
            2
        )

        wmape_global = (

            float(np.sum(np.abs(y_r - y_p)))
            / float(np.sum(y_r)) * 100

            if np.sum(y_r) > 0
            else 0.0
        )

        precision_global = max(
            0.0,
            round(100.0 - wmape_global, 1)
        )

    else:

        mae_global = None
        rmse_global = None
        precision_global = None

    calibrado = False

    # ======================================
    # 14. ORDENAR RESULTADOS
    # ======================================

    resultados.sort(
        key=lambda x: x["prediccion_mes_seleccionado"],
        reverse=True
    )

    # ======================================
    # 15. RESPUESTA API
    # ======================================

    return {

        "status": "success",

        "mes_objetivo": str(periodo_objetivo),

        "mes_base": str(periodo_base),

        "meses_hasta_prediccion": pasos_prediccion,

        "metricas_modelo": {

            "calibrado": calibrado,

            "precision_global_pct": precision_global,

            "mae_global": mae_global,

            "rmse_global": rmse_global,

            "algoritmo": "Selección automática por material (menor WMAPE)"

        },

        "data": resultados

    }
