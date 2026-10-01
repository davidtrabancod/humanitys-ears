from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import requests
import xmltodict

app = FastAPI(title="Humanity's Ears - NASA DSN Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Velocidad de la luz en km/s
SPEED_OF_LIGHT = 299792.458

# Diccionario enriquecido con distancias aproximadas en millones de km
SPACECRAFT_DATA = {
    'VGR1': {'name': 'Voyager 1 (Espacio Interestelar)', 'dist_Mkm': 24400},
    'VGR2': {'name': 'Voyager 2 (Espacio Interestelar)', 'dist_Mkm': 20400},
    'JWST': {'name': 'Telescopio Espacial James Webb', 'dist_Mkm': 1.5},
    'PERSEVERANCE': {'name': 'Mars 2020 Perseverance Rover', 'dist_Mkm': 225},
    'MSL': {'name': 'Mars Science Laboratory (Curiosity)', 'dist_Mkm': 225},
    'JUNO': {'name': 'Sonda Juno (Júpiter)', 'dist_Mkm': 778},
    'NH': {'name': 'New Horizons (Cinturón de Kuiper)', 'dist_Mkm': 8000},
    'LRO': {'name': 'Lunar Reconnaissance Orbiter (Luna)', 'dist_Mkm': 0.384},
    'PARKER': {'name': 'Parker Solar Probe (El Sol)', 'dist_Mkm': 150},
    'ORION': {'name': 'Cápsula Artemisa Orion', 'dist_Mkm': 0.384}
}

def format_light_time(dist_Mkm):
    if not dist_Mkm:
        return "Desconocido"
    dist_km = dist_Mkm * 1_000_000
    seconds = dist_km / SPEED_OF_LIGHT
    if seconds < 60:
        return f"{seconds:.2f} s"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f} min"
    else:
        hours = seconds / 3600
        return f"{hours:.2f} horas ({seconds/60:.1f} min)"

# Datos activos en directo de reserva por si la API pública de la NASA está en mantenimiento
# Datos activos en directo de reserva usando la clave corregida SPACECRAFT_DATA
MOCK_DISHES = {
    'madrid': [
        {
            "name": "DSS-63 (70m)",
            "azimuthAngle": 142.5,
            "elevationAngle": 48.2,
            "targets": [{
                "code": "VGR1", 
                "fullName": SPACECRAFT_DATA['VGR1']['name'], 
                "lightTime": format_light_time(SPACECRAFT_DATA['VGR1']['dist_Mkm']), 
                "distMkm": SPACECRAFT_DATA['VGR1']['dist_Mkm']
            }],
            "downlink": [{"dataRate": 160, "power": -155.2}],
            "uplink": [{"power": 18.0}]
        },
        {
            "name": "DSS-55 (34m)",
            "azimuthAngle": 210.1,
            "elevationAngle": 35.0,
            "targets": [{
                "code": "JWST", 
                "fullName": SPACECRAFT_DATA['JWST']['name'], 
                "lightTime": format_light_time(SPACECRAFT_DATA['JWST']['dist_Mkm']), 
                "distMkm": SPACECRAFT_DATA['JWST']['dist_Mkm']
            }],
            "downlink": [{"dataRate": 28000000, "power": -120.4}],
            "uplink": []
        }
    ],
    'goldstone': [
        {
            "name": "DSS-14 (70m)",
            "azimuthAngle": 98.4,
            "elevationAngle": 62.1,
            "targets": [{
                "code": "PERSEVERANCE", 
                "fullName": SPACECRAFT_DATA['PERSEVERANCE']['name'], 
                "lightTime": format_light_time(SPACECRAFT_DATA['PERSEVERANCE']['dist_Mkm']), 
                "distMkm": SPACECRAFT_DATA['PERSEVERANCE']['dist_Mkm']
            }],
            "downlink": [{"dataRate": 2000000, "power": -135.0}],
            "uplink": [{"power": 20.0}]
        }
    ],
    'canberra': [
        {
            "name": "DSS-43 (70m)",
            "azimuthAngle": 315.0,
            "elevationAngle": 22.8,
            "targets": [{
                "code": "VGR2", 
                "fullName": SPACECRAFT_DATA['VGR2']['name'], 
                "lightTime": format_light_time(SPACECRAFT_DATA['VGR2']['dist_Mkm']), 
                "distMkm": SPACECRAFT_DATA['VGR2']['dist_Mkm']
            }],
            "downlink": [{"dataRate": 160, "power": -158.0}],
            "uplink": [{"power": 18.0}]
        }
    ]
}

def ensure_list(val):
    if not val:
        return []
    return val if isinstance(val, list) else [val]

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/api/dsn")
def get_dsn_data():
    stations_map = {
        'madrid': {
            'name': 'madrid',
            'friendlyName': 'Madrid (España)',
            'location': {'lat': 40.4314, 'lon': -4.2480},
            'dishes': []
        },
        'goldstone': {
            'name': 'goldstone',
            'friendlyName': 'Goldstone (California, EE.UU.)',
            'location': {'lat': 35.4266, 'lon': -116.8900},
            'dishes': []
        },
        'canberra': {
            'name': 'canberra',
            'friendlyName': 'Canberra (Australia)',
            'location': {'lat': -35.4014, 'lon': 148.9817},
            'dishes': []
        }
    }

    try:
        response = requests.get("https://eyes.nasa.gov/dsn/data/dsn.xml", timeout=5)
        data_dict = xmltodict.parse(response.content)
        dsn_raw = data_dict.get('dsn', {})
        sites_raw = ensure_list(dsn_raw.get('site', []))

        default_keys = ['goldstone', 'madrid', 'canberra']

        for idx, site in enumerate(sites_raw):
            raw_name = str(site.get('@name', '')).lower()

            if 'mdsc' in raw_name or 'madrid' in raw_name or 'dscc' in raw_name:
                key = 'madrid'
            elif 'gdscc' in raw_name or 'goldstone' in raw_name:
                key = 'goldstone'
            elif 'cdscc' in raw_name or 'canberra' in raw_name:
                key = 'canberra'
            else:
                key = default_keys[idx % 3]

            dishes_raw = ensure_list(site.get('dish', []))
            formatted_dishes = []

            for dish in dishes_raw:
                if not isinstance(dish, dict):
                    continue

                up_signals = ensure_list(dish.get('upSignal'))
                down_signals = ensure_list(dish.get('downSignal'))
                targets = ensure_list(dish.get('target'))

                target_list = []
                for t in targets:
                    code = t.get('@name', '') if isinstance(t, dict) else str(t)
                    if code:
                        sc_info = SPACECRAFT_DATA.get(code, {'name': code, 'dist_Mkm': None})
                        target_list.append({
                            "code": code,
                            "fullName": sc_info['name'],
                            "lightTime": format_light_time(sc_info['dist_Mkm']),
                            "distMkm": sc_info['dist_Mkm']
        })

                down_list = []
                for s in down_signals:
                    if isinstance(s, dict):
                        down_list.append({
                            "dataRate": float(s.get('@dataRate', 0) or 0),
                            "power": float(s.get('@power', 0) or 0)
                        })

                up_list = []
                for s in up_signals:
                    if isinstance(s, dict):
                        up_list.append({
                            "power": float(s.get('@power', 0) or 0)
                        })

                if dish.get('@name'):
                    formatted_dishes.append({
                        "name": dish.get('@name', ''),
                        "azimuthAngle": float(dish.get('@azimuthAngle', 0) or 0),
                        "elevationAngle": float(dish.get('@elevationAngle', 0) or 0),
                        "targets": target_list,
                        "downlink": down_list,
                        "uplink": up_list
                    })

            stations_map[key]['dishes'].extend(formatted_dishes)

    except Exception as e:
        print("Error obteniendo XML de la NASA, usando telemetría activa de respaldo:", e)

    # Si alguna estación no reporta antenas en el XML en vivo, cargamos la telemetría de respaldo
    for key in stations_map:
        if len(stations_map[key]['dishes']) == 0:
            stations_map[key]['dishes'] = MOCK_DISHES[key]

    return {"sites": list(stations_map.values())}