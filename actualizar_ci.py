"""
actualizar_ci.py — versión para GitHub Actions
Mismo procesamiento que actualizar.py pero sin input() ni webbrowser.
Paths siempre relativos al directorio del repo.
"""

import sys
import os
import json
import re
from datetime import datetime

import pandas as pd
import numpy as np

# ── Configuración ─────────────────────────────────────────────
ROOT        = os.path.dirname(os.path.abspath(__file__))
EXCEL_FILE  = os.path.join(ROOT, "Bases_de_datos.xlsx")
HTML_FILE   = os.path.join(ROOT, "index.html")

SHEET_INC   = "BD INCIDENCIA"
SHEET_MAQ   = "BD MAQUINAS CINEPOLIS"
SHEET_VENTA = "BD VENTA SEMANAL"
SHEET_ROMEL = "BD ROMEL"

# ── Helpers ───────────────────────────────────────────────────
def consec_zeros(row, cols):
    max_c = cur = 0
    for c in cols:
        if row[c] == 0:
            cur += 1
            max_c = max(max_c, cur)
        else:
            cur = 0
    return max_c

# ── Leer datos ────────────────────────────────────────────────
def leer_datos():
    if not os.path.exists(EXCEL_FILE):
        print(f"ERROR: No se encontró {EXCEL_FILE}")
        sys.exit(1)
    print(f"  Leyendo {EXCEL_FILE} ...")
    inc   = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_INC)
    maq   = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_MAQ)
    venta = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_VENTA)
    romel = pd.read_excel(EXCEL_FILE, sheet_name=SHEET_ROMEL)
    print(f"  ✓ {len(inc):,} incidencias | {len(maq):,} máquinas | {len(venta):,} ventas | {len(romel):,} Romel")
    return inc, maq, venta, romel

# ── Procesar datos ────────────────────────────────────────────
def procesar(inc, maq, venta, romel):
    today = pd.Timestamp(datetime.today().date())

    # Incidencias abiertas
    inc_open = inc[inc['Status de la Incidencia'] == 'Abierta'].copy()
    inc_open['Fecha de Creacion'] = pd.to_datetime(inc_open['Fecha de Creacion'], errors='coerce')
    inc_open['dias_abierta'] = (today - inc_open['Fecha de Creacion']).dt.days.clip(lower=0).fillna(0).astype(int)

    # Venta semanal
    semana_cols = [c for c in venta.columns if 'SEMANA' in str(c)]
    venta = venta.copy()
    venta[semana_cols] = venta[semana_cols].fillna(0)
    venta['avg_semanal'] = venta[semana_cols].mean(axis=1).round(0)
    venta['TOTAL_VENTA'] = venta[semana_cols].sum(axis=1)
    venta['max_consec_zeros'] = venta.apply(lambda r: consec_zeros(r, semana_cols), axis=1)
    venta['alerta_venta'] = venta['max_consec_zeros'] >= 2

    # Romel vs nuestro sistema
    inc_series_set = set(inc['Serie'].dropna().astype(str))
    romel = romel.copy()
    romel['en_nuestro_sistema'] = romel['SERIE VDJ'].astype(str).isin(inc_series_set)

    # KPIs
    kpi = {
        'total_incidencias_abiertas': int(len(inc_open)),
        'urgentes':    int((inc_open['Prioridad'] == 'Urgente').sum()),
        'back_order':  int((inc_open['Clasificacion Incidencia'] == 'BACK ORDER').sum()),
        'en_diagnostico': int((inc_open['Clasificacion Incidencia'] == 'EN DIAGNOSTICO').sum()),
        'mas_30_dias': int((inc_open['dias_abierta'] > 30).sum()),
        'mas_90_dias': int((inc_open['dias_abierta'] > 90).sum()),
        'alertas_venta_cero': int(venta['alerta_venta'].sum()),
        'romel_total': int(len(romel)),
        'romel_no_en_sistema': int((~romel['en_nuestro_sistema']).sum()),
        'maquinas_en_ruta': int((maq['STATUS'] == 'EN RUTA').sum()),
    }

    # Tabla incidencias (máx 500)
    cols_inc = ['IdIncidencia','IdMaquina','Serie','Prioridad',
                'Clasificacion Incidencia','Nombre de Incidencia',
                'Conjunto','Region','Ruta','Operador',
                'Fecha de Creacion','dias_abierta','Observaciones']
    inc_sales = inc_open.merge(
        venta[['NUM_SERIE','avg_semanal','TOTAL_VENTA','alerta_venta']],
        left_on='Serie', right_on='NUM_SERIE', how='left'
    )
    table_inc = inc_sales[cols_inc + ['avg_semanal','TOTAL_VENTA','alerta_venta']].copy()
    table_inc['Fecha de Creacion'] = table_inc['Fecha de Creacion'].astype(str)
    table_inc = table_inc.fillna('').replace([np.inf, -np.inf], '')
    incidencias_json = table_inc.head(500).to_dict(orient='records')

    # Top prioridad por venta
    top_priority = (
        inc_sales[inc_sales['avg_semanal'].notna()]
        .sort_values('avg_semanal', ascending=False)
        .head(20)
    )
    top_priority_json = top_priority[[
        'IdIncidencia','Serie','Nombre de Incidencia','Prioridad',
        'Conjunto','Region','dias_abierta','avg_semanal','TOTAL_VENTA'
    ]].to_dict(orient='records')

    # Venta alerta
    venta_alerta = venta[venta['alerta_venta']].copy()
    cols_va = (['CONJUNTO','REGION','RUTA','NUM_SERIE','NOMBRE_MAQUINA',
                'avg_semanal','TOTAL_VENTA','max_consec_zeros']
               + semana_cols[-4:])
    cols_va = [c for c in cols_va if c in venta_alerta.columns]
    venta_alerta_json = venta_alerta[cols_va].to_dict(orient='records')

    # Romel — nuevo formato
    romel_cols = [
        '#FECHA DE REPORTE','SEMANA','ORSAID CINE','CINE',
        'REGIÓN CINÉPOLIS','REGION','RUTA',
        'GERENTE DE ZONA GALEX','GÉNERO',
        'SERIE VDJ','NOMBRE VDJ','MODO DE FALLA',
        'SOLICITUD','RESPONSABLE DE CERRAR ACCION','CONFIRMACIÓN DE CINE',
        'ESTATUS','COMENTARIOS SUBGERENTES',
        'PROMEDIO SEMANAL','ACUMULADO','VS Reporte','Días vs SLA',
        'en_nuestro_sistema',
    ]
    romel_cols = [c for c in romel_cols if c in romel.columns]
    romel_json = romel[romel_cols].fillna('').to_dict(orient='records')

    # Charts
    by_region = (
        inc_open.groupby('Region')
        .agg(
            total=('IdIncidencia','count'),
            urgentes=('Prioridad', lambda x: (x=='Urgente').sum()),
            back_order=('Clasificacion Incidencia', lambda x: (x=='BACK ORDER').sum()),
        )
        .reset_index()
        .to_dict(orient='records')
    )

    nombre_count = inc_open['Nombre de Incidencia'].value_counts().head(8).to_dict()
    clasif_count = inc_open['Clasificacion Incidencia'].value_counts().to_dict()
    dias_ranges = {
        '0-30 días':  int((inc_open['dias_abierta'] <= 30).sum()),
        '31-60 días': int(((inc_open['dias_abierta'] > 30) & (inc_open['dias_abierta'] <= 60)).sum()),
        '61-90 días': int(((inc_open['dias_abierta'] > 60) & (inc_open['dias_abierta'] <= 90)).sum()),
        '+90 días':   int((inc_open['dias_abierta'] > 90).sum()),
    }

    return {
        'kpi': kpi,
        'incidencias': incidencias_json,
        'venta_alerta': venta_alerta_json,
        'romel': romel_json,
        'by_region': by_region,
        'nombre_count': nombre_count,
        'clasif_count': clasif_count,
        'dias_ranges': dias_ranges,
        'top_priority': top_priority_json,
        'semana_cols_last4': semana_cols[-4:],
        'fecha_actualizacion': today.strftime('%d/%b/%Y'),
    }

# ── Inyectar datos en el HTML ─────────────────────────────────
def actualizar_html(data):
    if not os.path.exists(HTML_FILE):
        print(f"ERROR: No se encontró {HTML_FILE}")
        sys.exit(1)

    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    new_data_js = json.dumps(data, ensure_ascii=False, default=str)
    pattern = r'(const D\s*=\s*)(\{[\s\S]*?\});'
    replacement = r'\g<1>' + new_data_js + ';'
    new_content, count = re.subn(pattern, replacement, content, count=1)

    if count == 0:
        print("ERROR: No se encontró 'const D = {...}' en el HTML.")
        sys.exit(1)

    with open(HTML_FILE, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f"  ✓ Datos inyectados en {HTML_FILE}")

# ── MAIN ──────────────────────────────────────────────────────
def main():
    print("=" * 50)
    print("  ACTUALIZADOR CI — CINÉPOLIS DASHBOARD")
    print("=" * 50)

    inc, maq, venta, romel = leer_datos()

    print("  Procesando datos...")
    data = procesar(inc, maq, venta, romel)
    k = data['kpi']
    print(f"  ✓ Incidencias:  {k['total_incidencias_abiertas']:,}")
    print(f"  ✓ Urgentes:     {k['urgentes']:,}")
    print(f"  ✓ Back Order:   {k['back_order']:,}")
    print(f"  ✓ +90 días:     {k['mas_90_dias']:,}")
    print(f"  ✓ Alerta venta: {k['alertas_venta_cero']:,}")
    print(f"  ✓ Sin inc.:     {k['romel_no_en_sistema']:,}")

    print("  Actualizando HTML...")
    actualizar_html(data)

    print()
    print(f"  ✅ Dashboard listo — {data['fecha_actualizacion']}")
    print("=" * 50)

if __name__ == "__main__":
    main()
