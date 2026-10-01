let scene, camera, renderer, controls;
let earth;
let dsnData = null;
const markersGroup = new THREE.Group();
const beamsGroup = new THREE.Group();
const spacecraftGroup = new THREE.Group();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let pointerDownPos = { x: 0, y: 0 };

// Ubicaciones fijas de las tres estaciones del DSN
const STATIONS = [
    { code: 'madrid', name: 'Madrid (España)', lat: 40.4314, lon: -4.2480 },
    { code: 'goldstone', name: 'Goldstone (California, EE.UU.)', lat: 35.4266, lon: -116.8900 },
    { code: 'canberra', name: 'Canberra (Australia)', lat: -35.4014, lon: 148.9817 }
];

// Conversión de Coordenadas Geográficas (Lat/Lon) a Vector 3D (X, Y, Z)
function latLongToVector3(lat, lon, radius = 2.05) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
}

function init() {
    const container = document.getElementById('canvas-container');

    // 1. Configuración de Escena y Cámara
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 6);

    // 2. Renderizador WebGL
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 3. Controles de Órbita 3D
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 3;
    controls.maxDistance = 10;

    // 4. Iluminación
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // 5. Malla y Textura de la Tierra
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg');

    const geometry = new THREE.SphereGeometry(2, 64, 64);
    const material = new THREE.MeshStandardMaterial({
        map: earthTexture,
        roughness: 0.6,
        metalness: 0.1
    });
    earth = new THREE.Mesh(geometry, material);
    scene.add(earth);

    // Anclar marcadores y haces a la rotación de la Tierra
    earth.add(markersGroup);
    earth.add(beamsGroup);
    earth.add(spacecraftGroup);

    // 6. Elementos Estáticos
    createStaticMarkers();
    createStars();

    // Eventos del Sistema
    window.addEventListener('resize', onWindowResize);

    // Captura de clics limpia (evita conflictos con la rotación de cámara)
    window.addEventListener('pointerdown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', onPointerUp);

    // Iniciar bucle de renderizado
    animate();

    // Obtener telemetría inicial y refrescar cada 5s
    fetchDSNData();
    setInterval(fetchDSNData, 5000);
}

function createStaticMarkers() {
    STATIONS.forEach(st => {
        const pos = latLongToVector3(st.lat, st.lon, 2.05);

        // Esfera central del marcador
        const markerGeo = new THREE.SphereGeometry(0.1, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        const markerMesh = new THREE.Mesh(markerGeo, markerMat);
        markerMesh.position.copy(pos);

        // Anillo brillante perimetral
        const ringGeo = new THREE.RingGeometry(0.12, 0.18, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(pos);
        ringMesh.lookAt(0, 0, 0);

        const group = new THREE.Group();
        group.add(markerMesh);
        group.add(ringMesh);
        group.userData = { code: st.code, name: st.name };

        markersGroup.add(group);
    });
}

function createStars() {
    const starsGeometry = new THREE.BufferGeometry();
    const count = 3000;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 100;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 });
    const starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);
}

async function fetchDSNData() {
    try {
        const response = await fetch('/api/dsn');
        dsnData = await response.json();
        updateBeams();
    } catch (err) {
        console.error('Error al obtener datos de Python:', err);
    }
}

// Dibujar vectores de señal en 3D saliendo desde la Tierra hacia el espacio
function updateBeams() {
    while (beamsGroup.children.length > 0) {
        beamsGroup.remove(beamsGroup.children[0]);
    }
}

function onPointerUp(event) {
    const moveDistance = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (moveDistance > 5) return; // Se descarta si el usuario estaba arrastrando la cámara

    if (event.target.tagName === 'BUTTON' || event.target.closest('#header') || event.target.closest('#sidebar')) {
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(markersGroup.children, true);

    if (intersects.length > 0) {
        let object = intersects[0].object;
        while (object.parent && !object.userData.code) {
            object = object.parent;
        }

        if (object.userData && object.userData.code) {
            window.openSidebarForCode(object.userData.code);
        }
    }
}

// Función expuesta globalmente para abrir el panel lateral
window.openSidebarForCode = function(siteCode) {
    const sidebar = document.getElementById('sidebar');
    const title = document.getElementById('site-title');
    const container = document.getElementById('dishes-container');

    if (!sidebar || !title || !container) return;

    sidebar.style.display = 'block';

    if (!dsnData || !dsnData.sites) {
        title.innerText = "Conectando con la NASA...";
        container.innerHTML = '<p style="color: #94a3b8; padding: 10px;">Obteniendo telemetría en tiempo real desde Python...</p>';
        return;
    }

    let targetKey = siteCode.toLowerCase();
    if (targetKey.includes('mdsc') || targetKey.includes('madrid')) targetKey = 'madrid';
    if (targetKey.includes('gdscc') || targetKey.includes('goldstone') || targetKey.includes('california')) targetKey = 'goldstone';
    if (targetKey.includes('cdscc') || targetKey.includes('canberra')) targetKey = 'canberra';

    const site = dsnData.sites.find(s => s.name === targetKey);

    if (!site) {
        title.innerText = "Estación no encontrada";
        container.innerHTML = `<p style="color: #94a3b8;">No hay datos para la clave ${targetKey}.</p>`;
        return;
    }

    renderSpacecraftForSite(site);

    title.innerText = site.friendlyName;
    container.innerHTML = '';

    if (!site.dishes || site.dishes.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; padding: 10px;">Sin actividad de antenas registrada en este momento.</p>';
    } else {
        site.dishes.forEach(dish => {
            const card = document.createElement('div');
            card.className = 'dish-card';

            const target = dish.targets[0] || {};
            const targetName = target.fullName || 'En espera / Sin objetivo';
            const lightTime = target.lightTime || 'N/A';
            const dist = target.distMkm ? `${target.distMkm.toLocaleString()} M km` : 'N/A';
            
            const down = dish.downlink[0] || {};

            let humanSpeed = '0 bps';
            let analogia = 'Sin transmisión activa.';

            if (down.dataRate > 0) {
                const bps = down.dataRate;
                if (bps >= 1000000) {
                    humanSpeed = (bps / 1000000).toFixed(2) + ' Mbps';
                    analogia = 'Suficiente para vídeo en streaming HD.';
                } else if (bps >= 1000) {
                    humanSpeed = (bps / 1000).toFixed(2) + ' kbps';
                    analogia = 'Conexión tipo foto web o audio.';
                } else {
                    humanSpeed = bps + ' bps';
                    analogia = 'Telemetría ligera / Módem clásico.';
                }
            }

            card.innerHTML = `
                <h3>ANTENA ${dish.name}</h3>
                <p><strong>Objetivo:</strong> <span style="color: #00ffcc;">${targetName}</span></p>
                <p><strong>Distancia:</strong> ${dist}</p>
                <p><strong>Latencia luz (1-Way):</strong> <span style="color: #ff0055;">⏱️ ${lightTime}</span></p>
                <p><strong>Orientación:</strong> Az: ${dish.azimuthAngle}° | El: ${dish.elevationAngle}°</p>
                <div style="margin-top:8px; padding:6px; background:rgba(0,255,204,0.05); border-left:2px solid #00ffcc;">
                    <p><strong>Velocidad:</strong> ${humanSpeed}</p>
                    <p style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">💡 <em>${analogia}</em></p>
                </div>
            `;

            container.appendChild(card);
        });
    }
};

function animate() {
    requestAnimationFrame(animate);

    if (earth) earth.rotation.y += 0.0005;

    // 1. Reducimos el multiplicador de tiempo de 0.0015 a 0.0006 para ralentizar la emisión
    const time = Date.now() * 0.0003;

    spacecraftGroup.children.forEach(item => {
        if (item.isGroup) {
            const waveGroup = item.getObjectByName("waveGroup");
            if (waveGroup) {
                waveGroup.children.forEach(wave => {
                    const progress = (time + wave.userData.offset) % 1;
                    
                    // 2. Escala de expansión suave (de 1x a 2.8x)
                    const scale = 1 + progress * 1;
                    wave.scale.set(scale, scale, scale);
                    
                    // Atenuación de opacidad proporcional al progreso
                    wave.material.opacity = Math.max(0, 1 - progress);
                    wave.lookAt(camera.position);
                });
            }
        }
    });

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Función para construir un modelo 3D estilizado de un satélite
function createSpacecraftModel() {
    const group = new THREE.Group();

    // 1. Cuerpo principal del satélite (Caja metálica plateada)
    const bodyGeo = new THREE.BoxGeometry(0.12, 0.12, 0.16);
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xcccccc, 
        metalness: 0.8, 
        roughness: 0.2 
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(bodyMesh);

    // 2. Paneles Solares (Dos alas cian/doradas a los lados)
    const panelGeo = new THREE.BoxGeometry(0.5, 0.01, 0.12);
    const panelMat = new THREE.MeshStandardMaterial({ 
        color: 0x00aaff, 
        metalness: 0.5, 
        roughness: 0.1,
        emissive: 0x003366
    });
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(0, 0, 0);
    group.add(panelMesh);

    // 3. Antena Parabólica de Comunicaciones (Plato orientado hacia la Tierra)
    const dishGeo = new THREE.ConeGeometry(0.08, 0.04, 16, 1, true);
    const dishMat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700, // Dorado foil NASA
        metalness: 0.9, 
        roughness: 0.1,
        side: THREE.DoubleSide
    });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishMesh.rotation.x = Math.PI / 2;
    dishMesh.position.set(0, 0, -0.1);
    group.add(dishMesh);

    return group;
}


function renderSpacecraftForSite(site) {
    while (spacecraftGroup.children.length > 0) {
        spacecraftGroup.remove(spacecraftGroup.children[0]);
    }

    if (!site || !site.dishes) return;

    const stMeta = STATIONS.find(s => s.code === site.name);
    if (!stMeta) return;

    const stationPos = latLongToVector3(stMeta.lat, stMeta.lon, 2.05);

    const up = stationPos.clone().normalize();
    const approxNorth = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(approxNorth)) > 0.99) {
        approxNorth.set(1, 0, 0);
    }

    const east = new THREE.Vector3().crossVectors(approxNorth, up).normalize();
    const north = new THREE.Vector3().crossVectors(up, east).normalize();

    site.dishes.forEach((dish, idx) => {
        if (!dish.targets || dish.targets.length === 0) return;

        const target = dish.targets[0];
        
        const azRad = (dish.azimuthAngle || 0) * (Math.PI / 180);
        const elRad = (dish.elevationAngle || 0) * (Math.PI / 180);

        const dir = new THREE.Vector3()
            .addScaledVector(up, Math.sin(elRad))
            .addScaledVector(north, Math.cos(elRad) * Math.cos(azRad))
            .addScaledVector(east, Math.cos(elRad) * Math.sin(azRad))
            .normalize();

        let distanceScale = 3.5;
        if (target.distMkm) {
            if (target.distMkm > 1000) distanceScale = 6.0;
            else if (target.distMkm > 100) distanceScale = 4.5;
            else distanceScale = 3.2;
        } else {
            distanceScale = 3.0 + (idx * 0.8);
        }

        const scPos = stationPos.clone().add(dir.multiplyScalar(distanceScale));

        // GRUPO CONTENEDOR DE LA NAVE (Se ubica en la posición final scPos)
        const scGroup = new THREE.Group();
        scGroup.position.copy(scPos);

        // 1. Satélite 3D (En el centro local del grupo)
        const scMesh = createSpacecraftModel();
        scMesh.lookAt(stationPos);
        scGroup.add(scMesh);

        // 2. Ondas de radio concéntricas (En el centro local 0,0,0)
        const waveGroup = new THREE.Group();
        waveGroup.name = "waveGroup";

        for (let i = 0; i < 3; i++) {
            const waveGeo = new THREE.RingGeometry(0.15, 0.22, 32);
            const waveMat = new THREE.MeshBasicMaterial({
                color: 0x00ffcc,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.9
            });
            const waveMesh = new THREE.Mesh(waveGeo, waveMat);
            waveMesh.userData = { offset: i * 0.33 };
            waveGroup.add(waveMesh);
        }
        scGroup.add(waveGroup);

        // 3. Haz de señal punteado hacia la Tierra
        const points = [stationPos, scPos];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
            color: 0x00ffcc,
            dashSize: 0.15,
            gapSize: 0.08
        });
        const beamLine = new THREE.Line(lineGeo, lineMat);
        beamLine.computeLineDistances();

        spacecraftGroup.add(scGroup);
        spacecraftGroup.add(beamLine); // Añadimos la línea al grupo raíz
    });
}

window.onload = init;