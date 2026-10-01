let scene, camera, renderer, controls;
let earth;
let dsnData = null;
const markersGroup = new THREE.Group();
const beamsGroup = new THREE.Group();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let pointerDownPos = { x: 0, y: 0 };

const STATIONS = [
    { code: 'mdsc', name: 'Madrid (España)', lat: 40.4314, lon: -4.2480 },
    { code: 'gdscc', name: 'Goldstone (California, EE.UU.)', lat: 35.4266, lon: -116.8900 },
    { code: 'cdscc', name: 'Canberra (Australia)', lat: -35.4014, lon: 148.9817 }
];

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

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 6);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 3;
    controls.maxDistance = 10;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.5);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

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

    earth.add(markersGroup);
    earth.add(beamsGroup);

    createStaticMarkers();
    createStars();

    window.addEventListener('resize', onWindowResize);

    // Detección de clics mediante inicio/fin de pulsación para evitar fricción con OrbitControls
    window.addEventListener('pointerdown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointerup', onPointerUp);

    animate();

    fetchDSNData();
    setInterval(fetchDSNData, 5000);
}

function createStaticMarkers() {
    STATIONS.forEach(st => {
        const pos = latLongToVector3(st.lat, st.lon, 2.05);

        // Aumentamos el radio de colisión
        const markerGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        const markerMesh = new THREE.Mesh(markerGeo, markerMat);
        markerMesh.position.copy(pos);

        const ringGeo = new THREE.RingGeometry(0.14, 0.2, 32);
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

function updateBeams() {
    while (beamsGroup.children.length > 0) {
        beamsGroup.remove(beamsGroup.children[0]);
    }

    if (!dsnData || !dsnData.sites) return;

    dsnData.sites.forEach(site => {
        const stMeta = STATIONS.find(s => s.code.toLowerCase() === site.name.toLowerCase());
        if (!stMeta) return;

        const startPos = latLongToVector3(stMeta.lat, stMeta.lon, 2.05);

        site.dishes.forEach((dish, idx) => {
            if (!dish.targets || dish.targets.length === 0) return;

            const dir = startPos.clone().normalize();
            const endPos = startPos.clone().add(dir.multiplyScalar(2 + (idx * 0.3)));

            const points = [startPos, endPos];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({
                color: (dish.uplink && dish.uplink.length > 0) ? 0xff0055 : 0x00ffcc,
                transparent: true,
                opacity: 0.8
            });

            const line = new THREE.Line(lineGeo, lineMat);
            beamsGroup.add(line);
        });
    });
}

function onPointerUp(event) {
    // Si el usuario movió el ratón más de 5 píxeles, asumimos que estaba rotando el mapa, no haciendo clic
    const moveDistance = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (moveDistance > 5) return;

    // Evitar interceptar clics sobre los botones o textos de la UI
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
            openSidebarForCode(object.userData.code);
        }
    }
}

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

    // Normalización de la clave recibida
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

    title.innerText = site.friendlyName;
    container.innerHTML = '';

    if (!site.dishes || site.dishes.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; padding: 10px;">Sin actividad de antenas registrada en este momento.</p>';
    } else {
        site.dishes.forEach(dish => {
            const card = document.createElement('div');
            card.className = 'dish-card';

            const targetNames = dish.targets.map(t => t.fullName).join(', ') || 'En espera / Sin objetivo';
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
                <p><strong>Objetivo:</strong> <span style="color: #00ffcc;">${targetNames}</span></p>
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

    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.onload = init;