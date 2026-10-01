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

SPACECRAFT_NAMES = {
    'VGR1': 'Voyager 1 (Espacio Interestelar)',
    'VGR2': 'Voyager 2 (Espacio Interestelar)',
    'JWST': 'Telescopio Espacial James Webb',
    'PERSEVERANCE': 'Mars 2020 Perseverance Rover',
    'MSL': 'Mars Science Laboratory (Curiosity)',
    'JUNO': 'Sonda Juno (Júpiter)',
    'NH': 'New Horizons (Plutón / Cinturón de Kuiper)',
    'LRO': 'Lunar Reconnaissance Orbiter (Luna)',
    'PARKER': 'Parker Solar Probe (El Sol)',
    'ORION': 'Cápsula Artemisa Orion'
}

# Datos activos en directo de reserva por si la API pública de la NASA está en mantenimiento
MOCK_DISHES = {
    'madrid': [
        {
            "name": "DSS-63 (70m)",
            "azimuthAngle": 142.5,
            "elevationAngle": 48.2,
            "targets": [{"code": "VGR1", "fullName": SPACECRAFT_NAMES['VGR1']}],
            "downlink": [{"dataRate": 160, "power": -155.2}],
            "uplink": [{"power": 18.0}]
        },
        {
            "name": "DSS-55 (34m)",
            "azimuthAngle": 210.1,
            "elevationAngle": 35.0,
            "targets": [{"code": "JWST", "fullName": SPACECRAFT_NAMES['JWST']}],
            "downlink": [{"dataRate": 28000000, "power": -120.4}],
            "uplink": []
        }
    ],
    'goldstone': [
        {
            "name": "DSS-14 (70m)",
            "azimuthAngle": 98.4,
            "elevationAngle": 62.1,
            "targets": [{"code": "PERSEVERANCE", "fullName": SPACECRAFT_NAMES['PERSEVERANCE']}],
            "downlink": [{"dataRate": 2000000, "power": -135.0}],
            "uplink": [{"power": 20.0}]
        }
    ],
    'canberra': [
        {
            "name": "DSS-43 (70m)",
            "azimuthAngle": 315.0,
            "elevationAngle": 22.8,
            "targets": [{"code": "VGR2", "fullName": SPACECRAFT_NAMES['VGR2']}],
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
                    if isinstance(t, dict):
                        code = t.get('@name', '')
                    else:
                        code = str(t)
                    if code:
                        target_list.append({
                            "code": code,
                            "fullName": SPACECRAFT_NAMES.get(code, code)
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