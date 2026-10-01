import math
import requests
import xmltodict
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

DSN_XML_URL = "https://eyehsf.jpl.nasa.gov/dsn/data/dsn.xml"

SPACECRAFT_DATA = {
    'VGR1': {
        'name': 'Voyager 1 (Espacio Interestelar)',
        'dist_Mkm': 24400,
        'launch_year': 1977,
        'power_watts': '23 W',
        'curiosity': 'Transmite con la misma potencia que la bombilla de un frigorífico, y su señal llega a la Tierra mil billones de veces más débil que una pila de reloj.'
    },
    'VGR2': {
        'name': 'Voyager 2 (Espacio Interestelar)',
        'dist_Mkm': 20400,
        'launch_year': 1977,
        'power_watts': '23 W',
        'curiosity': 'Es el único objeto construido por la humanidad que ha visitado los cuatro planetas gigantes del sistema solar (Júpiter, Saturno, Urano y Neptuno).'
    },
    'JWST': {
        'name': 'Telescopio Espacial James Webb',
        'dist_Mkm': 1.5,
        'launch_year': 2021,
        'power_watts': '1000 W',
        'curiosity': 'Opera a una temperatura helada de -233 °C en el punto L2 de Lagrange para capturar la luz de las primeras galaxias del universo.'
    },
    'PERSEVERANCE': {
        'name': 'Mars 2020 Perseverance Rover',
        'dist_Mkm': 225,
        'launch_year': 2020,
        'power_watts': '110 W',
        'curiosity': 'Lleva un generador termoeléctrico de Plutonio-238 que produce calor y electricidad de forma continua en Marte.'
    },
    'MSL': {
        'name': 'Mars Science Laboratory (Curiosity)',
        'dist_Mkm': 225,
        'launch_year': 2011,
        'power_watts': '110 W',
        'curiosity': 'Ha subido más de 800 metros explorando el Monte Sharp en el cráter Gale de Marte.'
    },
    'JUNO': {
        'name': 'Sonda Juno (Júpiter)',
        'dist_Mkm': 778,
        'launch_year': 2011,
        'power_watts': '450 W',
        'curiosity': 'Es la nave con paneles solares que ha viajado más lejos en la historia, soportando la radiación extrema de Júpiter.'
    },
    'NH': {
        'name': 'New Horizons (Cinturón de Kuiper)',
        'dist_Mkm': 8000,
        'launch_year': 2006,
        'power_watts': '200 W',
        'curiosity': 'Envió las primeras imágenes detalladas de Plutón en 2015 a una velocidad de transmisión de solo 1 a 2 kbps.'
    }
}

def find_spacecraft_info(raw_code):
    clean_code = str(raw_code).upper().strip()
    
    if clean_code in SPACECRAFT_DATA:
        return SPACECRAFT_DATA[clean_code]
    
    if 'VGR1' in clean_code or 'VOYAGER 1' in clean_code or 'VOYAGER1' in clean_code:
        return SPACECRAFT_DATA['VGR1']
    if 'VGR2' in clean_code or 'VOYAGER 2' in clean_code or 'VOYAGER2' in clean_code:
        return SPACECRAFT_DATA['VGR2']
    if 'JWST' in clean_code or 'WEBB' in clean_code:
        return SPACECRAFT_DATA['JWST']
    if 'PERSEVERANCE' in clean_code or 'M20' in clean_code:
        return SPACECRAFT_DATA['PERSEVERANCE']
    if 'MSL' in clean_code or 'CURIOSITY' in clean_code:
        return SPACECRAFT_DATA['MSL']

    return {
        'name': clean_code,
        'dist_Mkm': None,
        'launch_year': 'Misión Activa',
        'power_watts': '~100 W',
        'curiosity': 'Sonda en órbita o trayectoria profunda transmitiendo datos de telemetría a la red DSN.'
    }

def format_light_time(dist_Mkm):
    if not dist_Mkm:
        return "Desconocida"
    dist_km = dist_Mkm * 1_000_000
    seconds = dist_km / 299792.458
    
    if seconds < 60:
        return f"{seconds:.2f} s"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{seconds:.1f} s ({minutes:.1f} min)"
    else:
        hours = seconds / 3600
        return f"{hours:.2f} horas ({hours*60:.1f} min)"

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse(request, "index.html")

@app.get("/api/dsn")
def get_dsn_data():
    try:
        response = requests.get(DSN_XML_URL, timeout=3)
        data = xmltodict.parse(response.content)
        
        sites_data = []
        raw_sites = data.get('dsn', {}).get('site', [])
        
        if isinstance(raw_sites, dict):
            raw_sites = [raw_sites]
            
        for s in raw_sites:
            raw_name = s.get('@name', '').lower()
            
            if 'mdsc' in raw_name or 'madrid' in raw_name:
                site_name = 'madrid'
            elif 'gdscc' in raw_name or 'goldstone' in raw_name:
                site_name = 'goldstone'
            elif 'cdscc' in raw_name or 'canberra' in raw_name:
                site_name = 'canberra'
            else:
                site_name = raw_name

            friendly_name = s.get('@friendlyName', site_name)
            
            dishes = s.get('dish', [])
            if isinstance(dishes, dict):
                dishes = [dishes]
                
            dish_list = []
            for d in dishes:
                dish_name = d.get('@name', '')
                azimuth = float(d.get('@azimuthAngle', 0.0) or 0.0)
                elevation = float(d.get('@elevationAngle', 0.0) or 0.0)
                
                targets = d.get('target', [])
                if isinstance(targets, dict):
                    targets = [targets]
                    
                target_list = []
                for t in targets:
                    code = t.get('@name', '') if isinstance(t, dict) else str(t)
                    if code:
                        sc_info = find_spacecraft_info(code)
                        target_list.append({
                            "code": code,
                            "fullName": sc_info['name'],
                            "lightTime": format_light_time(sc_info['dist_Mkm']),
                            "distMkm": sc_info['dist_Mkm'],
                            "launchYear": sc_info['launch_year'],
                            "powerWatts": sc_info['power_watts'],
                            "curiosity": sc_info['curiosity']
                        })
                
                downlinks = d.get('downSignal', [])
                if isinstance(downlinks, dict):
                    downlinks = [downlinks]
                    
                down_list = []
                for dw in downlinks:
                    if isinstance(dw, dict):
                        data_rate = float(dw.get('@dataRate', 0.0) or 0.0)
                        power = float(dw.get('@power', 0.0) or 0.0)
                        down_list.append({"dataRate": data_rate, "power": power})
                
                dish_list.append({
                    "name": dish_name,
                    "azimuthAngle": azimuth,
                    "elevationAngle": elevation,
                    "targets": target_list,
                    "downlink": down_list
                })
                
            sites_data.append({
                "name": site_name,
                "friendlyName": friendly_name,
                "dishes": dish_list
            })
            
        return {"sites": sites_data}
    except Exception as e:
        print(f"Fallback activado: {e}")
        # Datos de respaldo completos para las TRES estaciones
        return {
            "sites": [
                {
                    "name": "madrid",
                    "friendlyName": "Madrid (España)",
                    "dishes": [
                        {
                            "name": "DSS-63 (70m)",
                            "azimuthAngle": 142.5,
                            "elevationAngle": 48.2,
                            "targets": [{
                                "code": "VGR1",
                                "fullName": SPACECRAFT_DATA['VGR1']['name'],
                                "lightTime": format_light_time(SPACECRAFT_DATA['VGR1']['dist_Mkm']),
                                "distMkm": SPACECRAFT_DATA['VGR1']['dist_Mkm'],
                                "launchYear": SPACECRAFT_DATA['VGR1']['launch_year'],
                                "powerWatts": SPACECRAFT_DATA['VGR1']['power_watts'],
                                "curiosity": SPACECRAFT_DATA['VGR1']['curiosity']
                            }],
                            "downlink": [{"dataRate": 160, "power": -155}]
                        },
                        {
                            "name": "DSS-55 (34m)",
                            "azimuthAngle": 210.1,
                            "elevationAngle": 35.0,
                            "targets": [{
                                "code": "JWST",
                                "fullName": SPACECRAFT_DATA['JWST']['name'],
                                "lightTime": format_light_time(SPACECRAFT_DATA['JWST']['dist_Mkm']),
                                "distMkm": SPACECRAFT_DATA['JWST']['dist_Mkm'],
                                "launchYear": SPACECRAFT_DATA['JWST']['launch_year'],
                                "powerWatts": SPACECRAFT_DATA['JWST']['power_watts'],
                                "curiosity": SPACECRAFT_DATA['JWST']['curiosity']
                            }],
                            "downlink": [{"dataRate": 28000000, "power": -120}]
                        }
                    ]
                },
                {
                    "name": "goldstone",
                    "friendlyName": "Goldstone (California, EE.UU.)",
                    "dishes": [
                        {
                            "name": "DSS-14 (70m)",
                            "azimuthAngle": 95.4,
                            "elevationAngle": 62.1,
                            "targets": [{
                                "code": "PERSEVERANCE",
                                "fullName": SPACECRAFT_DATA['PERSEVERANCE']['name'],
                                "lightTime": format_light_time(SPACECRAFT_DATA['PERSEVERANCE']['dist_Mkm']),
                                "distMkm": SPACECRAFT_DATA['PERSEVERANCE']['dist_Mkm'],
                                "launchYear": SPACECRAFT_DATA['PERSEVERANCE']['launch_year'],
                                "powerWatts": SPACECRAFT_DATA['PERSEVERANCE']['power_watts'],
                                "curiosity": SPACECRAFT_DATA['PERSEVERANCE']['curiosity']
                            }],
                            "downlink": [{"dataRate": 2000000, "power": -130}]
                        },
                        {
                            "name": "DSS-24 (34m)",
                            "azimuthAngle": 180.0,
                            "elevationAngle": 40.5,
                            "targets": [{
                                "code": "MSL",
                                "fullName": SPACECRAFT_DATA['MSL']['name'],
                                "lightTime": format_light_time(SPACECRAFT_DATA['MSL']['dist_Mkm']),
                                "distMkm": SPACECRAFT_DATA['MSL']['dist_Mkm'],
                                "launchYear": SPACECRAFT_DATA['MSL']['launch_year'],
                                "powerWatts": SPACECRAFT_DATA['MSL']['power_watts'],
                                "curiosity": SPACECRAFT_DATA['MSL']['curiosity']
                            }],
                            "downlink": [{"dataRate": 500000, "power": -140}]
                        }
                    ]
                },
                {
                    "name": "canberra",
                    "friendlyName": "Canberra (Australia)",
                    "dishes": [
                        {
                            "name": "DSS-43 (70m)",
                            "azimuthAngle": 240.2,
                            "elevationAngle": 51.8,
                            "targets": [{
                                "code": "VGR2",
                                "fullName": SPACECRAFT_DATA['VGR2']['name'],
                                "lightTime": format_light_time(SPACECRAFT_DATA['VGR2']['dist_Mkm']),
                                "distMkm": SPACECRAFT_DATA['VGR2']['dist_Mkm'],
                                "launchYear": SPACECRAFT_DATA['VGR2']['launch_year'],
                                "powerWatts": SPACECRAFT_DATA['VGR2']['power_watts'],
                                "curiosity": SPACECRAFT_DATA['VGR2']['curiosity']
                            }],
                            "downlink": [{"dataRate": 160, "power": -158}]
                        },
                        {
                            "name": "DSS-36 (34m)",
                            "azimuthAngle": 115.0,
                            "elevationAngle": 33.2,
                            "targets": [{
                                "code": "JUNO",
                                "fullName": SPACECRAFT_DATA['JUNO']['name'],
                                "lightTime": format_light_time(SPACECRAFT_DATA['JUNO']['dist_Mkm']),
                                "distMkm": SPACECRAFT_DATA['JUNO']['dist_Mkm'],
                                "launchYear": SPACECRAFT_DATA['JUNO']['launch_year'],
                                "powerWatts": SPACECRAFT_DATA['JUNO']['power_watts'],
                                "curiosity": SPACECRAFT_DATA['JUNO']['curiosity']
                            }],
                            "downlink": [{"dataRate": 10000, "power": -145}]
                        }
                    ]
                }
            ]
        }