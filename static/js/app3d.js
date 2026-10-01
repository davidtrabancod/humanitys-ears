let scene, camera, renderer, controls;
let earth, atmosphereGlow;
let dsnData = null;
let lastFetchTime = Date.now();

// Variables para el cálculo dinámico y micro-fluctuación de ancho de banda
let baseGlobalBps = 30510000;
let currentDisplayBps = 30510000;

// Motor de Música Estilo Interstellar (Web Audio API)
let audioCtx = null;
let isMusicPlaying = true;
let musicInterval = null;

const markersGroup = new THREE.Group();
const beamsGroup = new THREE.Group();
const spacecraftGroup = new THREE.Group();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let pointerDownPos = { x: 0, y: 0 };

const STATIONS = [
    { code: 'madrid', name: 'Madrid (España)', lat: 40.4314, lon: -4.2480 },
    { code: 'goldstone', name: 'Goldstone (California, EE.UU.)', lat: 35.4266, lon: -116.8900 },
    { code: 'canberra', name: 'Canberra (Australia)', lat: -35.4014, lon: 148.9817 }
];

function latLongToVector3(lat, lon, radius = 2.05) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    const vec = new THREE.Vector3(x, y, z);
    
    if (earth) {
        vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), earth.rotation.y);
    }
    
    return vec;
}

// Progresión de acordes estilo Interstellar
const CHORDS = [
    [220.00, 261.63, 329.63], // Am
    [261.63, 329.63, 392.00], // C
    [196.00, 246.94, 293.66], // G
    [146.83, 220.00, 293.66]  // Dm
];
let currentChordIdx = 0;

function playOrganNote(freq, duration = 4.0) {
    if (!audioCtx || !isMusicPlaying) return;

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(420, audioCtx.currentTime);

        gain.gain.setValueAtTime(0.001, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.035, audioCtx.currentTime + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function startInterstellarSequence() {
    if (musicInterval) clearInterval(musicInterval);

    const playChordSequence = () => {
        if (!isMusicPlaying) return;
        const chord = CHORDS[currentChordIdx];
        
        chord.forEach(freq => playOrganNote(freq, 4.5));
        playOrganNote(chord[0] / 2, 5.0);

        currentChordIdx = (currentChordIdx + 1) % CHORDS.length;
    };

    playChordSequence();
    musicInterval = setInterval(playChordSequence, 4000);
}

function ensureAudioStarted() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (isMusicPlaying && !musicInterval) {
        startInterstellarSequence();
        const btn = document.getElementById('btn-audio-toggle');
        if (btn) {
            btn.innerText = "🔊";
            btn.classList.add('active');
        }
    }
}

window.toggleAudio = function() {
    ensureAudioStarted();
    const btn = document.getElementById('btn-audio-toggle');

    if (!isMusicPlaying) {
        isMusicPlaying = true;
        startInterstellarSequence();

        if (btn) {
            btn.innerText = "🔊";
            btn.classList.add('active');
        }
    } else {
        isMusicPlaying = false;
        if (musicInterval) {
            clearInterval(musicInterval);
            musicInterval = null;
        }

        if (btn) {
            btn.innerText = "🔇";
            btn.classList.remove('active');
        }
    }
};

window.toggleCyberDeck = function() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        document.getElementById('btn-fullscreen-toggle').classList.add('active');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
            document.getElementById('btn-fullscreen-toggle').classList.remove('active');
        }
    }
};

function flyToStation(lat, lon) {
    const stationWorldPos = latLongToVector3(lat, lon, 2.05);
    const cameraTargetPos = stationWorldPos.clone().normalize().multiplyScalar(4.8);

    gsap.killTweensOf(camera.position);

    gsap.to(camera.position, {
        x: cameraTargetPos.x,
        y: cameraTargetPos.y,
        z: cameraTargetPos.z,
        duration: 1.8,
        ease: "power2.out",
        onUpdate: () => {
            controls.target.set(0, 0, 0);
            camera.lookAt(0, 0, 0);
            controls.update();
        }
    });
}

function createSpacecraftModel() {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.12, 0.12, 0.16);
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xdddddd, 
        metalness: 0.85, 
        roughness: 0.15 
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(bodyMesh);

    const panelGeo = new THREE.BoxGeometry(0.52, 0.01, 0.12);
    const panelMat = new THREE.MeshStandardMaterial({ 
        color: 0x00aaff, 
        metalness: 0.6, 
        roughness: 0.1,
        emissive: 0x002244
    });
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    group.add(panelMesh);

    const dishGeo = new THREE.ConeGeometry(0.085, 0.04, 16, 1, true);
    const dishMat = new THREE.MeshStandardMaterial({ 
        color: 0xffd700,
        metalness: 0.95, 
        roughness: 0.05,
        side: THREE.DoubleSide
    });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishMesh.rotation.x = Math.PI / 2;
    dishMesh.position.set(0, 0, -0.1);
    group.add(dishMesh);

    return group;
}

function createAtmosphereGlow() {
    const glowGeo = new THREE.SphereGeometry(2.18, 64, 64);
    
    const vertexShader = `
        varying vec3 vNormal;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        varying vec3 vNormal;
        void main() {
            float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
            gl_FragColor = vec4(0.0, 1.0, 0.8, 1.0) * intensity;
        }
    `;

    const glowMat = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true
    });

    return new THREE.Mesh(glowGeo, glowMat);
}

function init() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 6);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.2;
    controls.maxDistance = 15;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00ffcc, 1.2);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg');

    const geometry = new THREE.SphereGeometry(2, 64, 64);
    const material = new THREE.MeshStandardMaterial({
        map: earthTexture,
        roughness: 0.5,
        metalness: 0.1
    });
    earth = new THREE.Mesh(geometry, material);
    scene.add(earth);

    atmosphereGlow = createAtmosphereGlow();
    scene.add(atmosphereGlow);

    earth.add(markersGroup);
    earth.add(beamsGroup);
    earth.add(spacecraftGroup);

    createStaticMarkers();
    createStars();

    window.addEventListener('resize', onWindowResize);
    
    window.addEventListener('pointerdown', (e) => { 
        pointerDownPos = { x: e.clientX, y: e.clientY };
        ensureAudioStarted();
    });
    window.addEventListener('pointerup', onPointerUp);

    animate();

    fetchDSNData();
    setInterval(fetchDSNData, 5000);

    setInterval(renderBandwidthUI, 300);
}

function createStaticMarkers() {
    STATIONS.forEach(st => {
        const phi = (90 - st.lat) * (Math.PI / 180);
        const theta = (st.lon + 180) * (Math.PI / 180);
        const radius = 2.02;

        const x = -(radius * Math.sin(phi) * Math.cos(theta));
        const z = radius * Math.sin(phi) * Math.sin(theta);
        const y = radius * Math.cos(phi);
        const pos = new THREE.Vector3(x, y, z);

        const group = new THREE.Group();
        group.position.copy(pos);

        const normal = pos.clone().normalize();
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

        const coreGeo = new THREE.SphereGeometry(0.03, 16, 16);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        group.add(coreMesh);

        const baseRingGeo = new THREE.RingGeometry(0.06, 0.068, 32);
        const baseRingMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide });
        const baseRingMesh = new THREE.Mesh(baseRingGeo, baseRingMat);
        group.add(baseRingMesh);

        const radarSweepGeo = new THREE.RingGeometry(0.09, 0.12, 32, 1, 0, Math.PI * 0.7);
        const radarSweepMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ffcc, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 0.85 
        });
        const radarSweepMesh = new THREE.Mesh(radarSweepGeo, radarSweepMat);
        radarSweepMesh.name = "radarSweep";
        group.add(radarSweepMesh);

        const pulseRingGeo = new THREE.RingGeometry(0.05, 0.06, 32);
        const pulseRingMat = new THREE.MeshBasicMaterial({ 
            color: 0x00ffcc, 
            side: THREE.DoubleSide, 
            transparent: true, 
            opacity: 0.8 
        });
        const pulseRingMesh = new THREE.Mesh(pulseRingGeo, pulseRingMat);
        pulseRingMesh.name = "pulseRing";
        group.add(pulseRingMesh);

        const crossMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.5 });
        const crossPoints = [
            new THREE.Vector3(-0.15, 0, 0), new THREE.Vector3(-0.07, 0, 0),
            new THREE.Vector3(0.07, 0, 0), new THREE.Vector3(0.15, 0, 0),
            new THREE.Vector3(0, -0.15, 0), new THREE.Vector3(0, -0.07, 0),
            new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(0, 0.15, 0)
        ];
        const crossGeo = new THREE.BufferGeometry().setFromPoints(crossPoints);
        const crossLines = new THREE.LineSegments(crossGeo, crossMat);
        group.add(crossLines);

        group.userData = { code: st.code, name: st.name };
        markersGroup.add(group);
    });
}

function createStars() {
    const starsGeometry = new THREE.BufferGeometry();
    const count = 3500;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 100;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.8 });
    const starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);
}

async function fetchDSNData() {
    try {
        const response = await fetch('/api/dsn');
        dsnData = await response.json();
        
        lastFetchTime = Date.now();
        triggerHeartbeatEffect();
        calculateBaseGlobalBandwidth();

        updateBeams();
    } catch (err) {
        console.error('Error obteniendo datos DSN:', err);
    }
}

function calculateBaseGlobalBandwidth() {
    if (!dsnData || !dsnData.sites) return;

    let totalBps = 0;
    dsnData.sites.forEach(site => {
        if (site.dishes) {
            site.dishes.forEach(dish => {
                if (dish.downlink) {
                    dish.downlink.forEach(dw => {
                        totalBps += dw.dataRate || 0;
                    });
                }
            });
        }
    });

    if (totalBps > 0) {
        baseGlobalBps = totalBps;
    }
}

function renderBandwidthUI() {
    const jitterFactor = 1 + (Math.random() * 0.016 - 0.008);
    currentDisplayBps = baseGlobalBps * jitterFactor;

    const valElem = document.getElementById('global-speed-val');
    const unitElem = document.getElementById('global-speed-unit');
    const barElem = document.getElementById('bandwidth-bar');

    if (valElem && unitElem) {
        if (currentDisplayBps >= 1000000) {
            valElem.innerText = (currentDisplayBps / 1000000).toFixed(2);
            unitElem.innerText = "Mbps";
            if (barElem) barElem.style.width = Math.min((currentDisplayBps / 60000000) * 100, 100) + "%";
        } else if (currentDisplayBps >= 1000) {
            valElem.innerText = (currentDisplayBps / 1000).toFixed(2);
            unitElem.innerText = "kbps";
            if (barElem) barElem.style.width = Math.min((currentDisplayBps / 1000000) * 100, 100) + "%";
        } else {
            valElem.innerText = currentDisplayBps.toFixed(0);
            unitElem.innerText = "bps";
            if (barElem) barElem.style.width = "5%";
        }
    }
}

function triggerHeartbeatEffect() {
    const dot = document.getElementById('heartbeat-dot');
    if (dot) {
        dot.style.backgroundColor = '#00ffcc';
        dot.style.boxShadow = '0 0 16px #00ffcc';
        setTimeout(() => {
            dot.style.backgroundColor = '#00ccb3';
            dot.style.boxShadow = '0 0 8px #00ccb3';
        }, 300);
    }
}

setInterval(() => {
    const timerElem = document.getElementById('last-update-timer');
    if (timerElem) {
        const secondsAgo = Math.floor((Date.now() - lastFetchTime) / 1000);
        timerElem.innerText = `(Sincronizado hace ${secondsAgo}s)`;
    }
}, 1000);

function updateBeams() {
    while (beamsGroup.children.length > 0) {
        beamsGroup.remove(beamsGroup.children[0]);
    }
}

function renderSpacecraftForSite(site) {
    while (spacecraftGroup.children.length > 0) {
        spacecraftGroup.remove(spacecraftGroup.children[0]);
    }

    if (!site || !site.dishes) return;

    const stMeta = STATIONS.find(s => s.code === site.name);
    if (!stMeta) return;

    const phi = (90 - stMeta.lat) * (Math.PI / 180);
    const theta = (stMeta.lon + 180) * (Math.PI / 180);
    const radius = 2.05;

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    const stationPos = new THREE.Vector3(x, y, z);

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

        const scGroup = new THREE.Group();
        scGroup.position.copy(scPos);

        const scMesh = createSpacecraftModel();
        scMesh.lookAt(stationPos);
        scGroup.add(scMesh);

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
        spacecraftGroup.add(beamLine);
    });
}

function onPointerUp(event) {
    const moveDistance = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (moveDistance > 5) return;

    if (event.target.tagName === 'BUTTON' || event.target.closest('#header') || event.target.closest('#sidebar') || event.target.closest('#bandwidth-widget')) {
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

window.openSidebarForCode = function(siteCode) {
    ensureAudioStarted();

    const sidebar = document.getElementById('sidebar');
    const title = document.getElementById('site-title');
    const container = document.getElementById('dishes-container');

    if (!sidebar || !title || !container) return;

    sidebar.style.display = 'block';

    if (!dsnData || !dsnData.sites || dsnData.sites.length === 0) {
        title.innerText = "Conectando con la NASA...";
        container.innerHTML = '<p style="color: #94a3b8; padding: 10px;">Obteniendo telemetría en tiempo real desde Python...</p>';
        return;
    }

    const searchKey = siteCode.toLowerCase();

    let targetCode = searchKey;
    if (searchKey.includes('madrid') || searchKey.includes('mdsc')) targetCode = 'madrid';
    else if (searchKey.includes('goldstone') || searchKey.includes('california') || searchKey.includes('gdscc')) targetCode = 'goldstone';
    else if (searchKey.includes('canberra') || searchKey.includes('cdscc')) targetCode = 'canberra';

    let site = dsnData.sites.find(s => (s.name || '').toLowerCase() === targetCode);

    if (!site) {
        site = dsnData.sites.find(s => {
            const friendly = (s.friendlyName || '').toLowerCase();
            return friendly.includes(targetCode);
        });
    }

    if (!site) {
        title.innerText = "Estación no encontrada";
        container.innerHTML = `<p style="color: #94a3b8;">No hay datos disponibles actualmente para ${targetCode}.</p>`;
        return;
    }

    const stMeta = STATIONS.find(s => s.code === targetCode);
    if (stMeta) {
        flyToStation(stMeta.lat, stMeta.lon);
    }

    renderSpacecraftForSite(site);

    title.innerText = site.friendlyName || site.name;
    container.innerHTML = '';

    if (!site.dishes || site.dishes.length === 0) {
        container.innerHTML = '<p style="color: #94a3b8; padding: 10px;">Sin actividad de antenas registrada en este momento.</p>';
    } else {
        site.dishes.forEach(dish => {
            const card = document.createElement('div');
            card.className = 'dish-card';

            const target = dish.targets[0] || {};
            const targetName = target.fullName || target.name || 'En espera / Sin objetivo';
            const lightTime = target.lightTime || 'N/A';
            const dist = target.distMkm ? `${target.distMkm.toLocaleString()} M km` : 'N/A';
            
            const launch = target.launchYear || target.launch_year || 'Desconocido';
            const power = target.powerWatts || target.power_watts || 'N/A';
            const curiosity = target.curiosity || '';

            const down = dish.downlink[0] || {};
            const bpsRate = down.dataRate || 0;

            let humanSpeed = '0 bps';
            let analogia = 'Sin transmisión activa.';

            if (bpsRate > 0) {
                if (bpsRate >= 1000000) {
                    humanSpeed = (bpsRate / 1000000).toFixed(2) + ' Mbps';
                    analogia = 'Suficiente para vídeo en streaming HD.';
                } else if (bpsRate >= 1000) {
                    humanSpeed = (bpsRate / 1000).toFixed(2) + ' kbps';
                    analogia = 'Conexión tipo foto web o audio.';
                } else {
                    humanSpeed = bpsRate + ' bps';
                    analogia = 'Telemetría ligera / Módem clásico.';
                }
            }

            // AHORA EL TÍTULO ES LA MISIÓN/SATÉLITE Y LA ANTENA ES UN DATO SECUNDARIO
            card.innerHTML = `
                <h3 style="margin:0 0 8px 0; font-family:'Orbitron',sans-serif; font-size:1.05rem; color:#00ffcc; letter-spacing:0.5px;">📡 ${targetName.toUpperCase()}</h3>
                <p style="margin:4px 0;"><strong>Antena asignada:</strong> <span style="color: #cbd5e1; font-weight: bold;">${dish.name}</span></p>
                <p style="margin:4px 0;"><strong>Distancia:</strong> ${dist}</p>
                <p style="margin:4px 0;"><strong>Latencia luz (1-Way):</strong> <span style="color: #ff0055;">⏱️ ${lightTime}</span></p>
                <p style="margin:4px 0;"><strong>Año de Lanzamiento:</strong> 🚀 ${launch}</p>
                <p style="margin:4px 0;"><strong>Potencia Emisora Nave:</strong> ⚡ ${power}</p>
                <p style="margin:4px 0;"><strong>Orientación:</strong> Az: ${dish.azimuthAngle}° | El: ${dish.elevationAngle}°</p>

                <div style="margin-top:10px; padding:8px; background:rgba(0,255,204,0.05); border-left:3px solid #00ffcc; border-radius: 4px;">
                    <p style="margin:0;"><strong>Velocidad de Datos:</strong> ${humanSpeed}</p>
                    <p style="font-size:0.75rem; color:#94a3b8; margin:2px 0 0 0;">💡 <em>${analogia}</em></p>
                </div>

                ${curiosity ? `
                <div style="margin-top:10px; padding:10px; background:rgba(255,215,0,0.06); border-radius:6px; border:1px solid rgba(255,215,0,0.25);">
                    <p style="font-size:0.75rem; color:#ffd700; font-weight:bold; margin:0; font-family:'Orbitron',sans-serif;">✨ CURIOSIDAD EN DIRECTO:</p>
                    <p style="font-size:0.75rem; color:#e2e8f0; margin:4px 0 0 0; line-height:1.4;">${curiosity}</p>
                </div>
                ` : ''}
            `;

            container.appendChild(card);
        });
    }
};

function animate() {
    requestAnimationFrame(animate);

    if (earth) earth.rotation.y += 0.0005;

    const time = Date.now() * 0.002;

    markersGroup.children.forEach(marker => {
        const radarSweep = marker.getObjectByName("radarSweep");
        if (radarSweep) {
            radarSweep.rotation.z -= 0.04;
        }

        const pulseRing = marker.getObjectByName("pulseRing");
        if (pulseRing) {
            const progress = (time % 1.5) / 1.5;
            const scale = 1 + progress * 1.8;
            pulseRing.scale.set(scale, scale, scale);
            pulseRing.material.opacity = Math.max(0, 0.8 * (1 - progress));
        }
    });

    const waveTime = Date.now() * 0.0006;

    spacecraftGroup.children.forEach(item => {
        if (item.isGroup) {
            const waveGroup = item.getObjectByName("waveGroup");
            if (waveGroup) {
                waveGroup.children.forEach(wave => {
                    const progress = (waveTime + wave.userData.offset) % 1;
                    
                    const scale = 1 + progress * 1.8;
                    wave.scale.set(scale, scale, scale);
                    
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

window.onload = init;