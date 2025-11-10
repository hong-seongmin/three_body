// Three.js 설정 및 메인 로직
let scene, camera, renderer, controls;
let bodies = [];
let trails = [];
let velocityArrows = [];
let forceArrows = [];
let centerOfMassMesh = null;
let physicsEngine;
let isPlaying = false;
let showTrails = true;
let showVectors = false;
let showCenterOfMass = true;
let timeSpeed = 1.0;
let selectedBody = null;
let raycaster, mouse;
let simulationTime = 0;
let initialEnergy = null;

// 그래프 관련
let energyChart, distanceChart;
let energyData = { time: [], total: [], kinetic: [], potential: [] };
let distanceData = { time: [], d01: [], d02: [], d12: [] };
const MAX_GRAPH_POINTS = 200;

const BODY_COLORS = [0xff6b6b, 0x51cf66, 0x4dabf7];
const MAX_TRAIL_POINTS = 500;

// 초기화
function init() {
    // 씬 생성
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000510);

    // 카메라 설정
    const container = document.getElementById('canvas-container');
    camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 100, 200);
    camera.lookAt(0, 0, 0);

    // 렌더러 설정
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // OrbitControls 추가
    setupOrbitControls();

    // 조명 추가
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1, 500);
    pointLight.position.set(0, 100, 100);
    scene.add(pointLight);

    // 별 배경 추가
    addStars();

    // 그리드 추가
    const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    // 좌표축 헬퍼
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);

    // 물리 엔진 초기화
    physicsEngine = new PhysicsEngine();

    // 레이캐스터 초기화
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 3개의 물체 생성
    createBodies();

    // 그래프 초기화
    initCharts();

    // UI 이벤트 리스너 설정
    setupEventListeners();

    // 마우스 이벤트
    setupMouseEvents();

    // 윈도우 리사이즈
    window.addEventListener('resize', onWindowResize);

    // 초기 에너지 기록
    initialEnergy = physicsEngine.calculateTotalEnergy();

    // 애니메이션 시작
    animate();
}

// OrbitControls 설정
function setupOrbitControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let isRightDragging = false;

    renderer.domElement.addEventListener('mousedown', (e) => {
        if (selectedBody) return;

        if (e.button === 0) {
            isDragging = true;
        } else if (e.button === 2) {
            isRightDragging = true;
        }
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
        if (selectedBody) return;

        if (isDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            const rotationSpeed = 0.005;

            const offset = camera.position.clone();
            const spherical = new THREE.Spherical().setFromVector3(offset);

            spherical.theta -= deltaX * rotationSpeed;
            spherical.phi -= deltaY * rotationSpeed;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

            offset.setFromSpherical(spherical);
            camera.position.copy(offset);
            camera.lookAt(0, 0, 0);

            previousMousePosition = { x: e.clientX, y: e.clientY };
        } else if (isRightDragging) {
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            const panSpeed = 0.3;
            camera.position.x -= deltaX * panSpeed;
            camera.position.y += deltaY * panSpeed;

            previousMousePosition = { x: e.clientX, y: e.clientY };
        }
    });

    renderer.domElement.addEventListener('mouseup', () => {
        isDragging = false;
        isRightDragging = false;
    });

    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomSpeed = 0.1;
        const delta = e.deltaY * zoomSpeed;

        const direction = camera.position.clone().normalize();
        camera.position.addScaledVector(direction, delta);

        const minDistance = 50;
        const maxDistance = 500;
        const distance = camera.position.length();

        if (distance < minDistance) {
            camera.position.setLength(minDistance);
        } else if (distance > maxDistance) {
            camera.position.setLength(maxDistance);
        }
    });

    renderer.domElement.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

// 별 배경 생성
function addStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];

    for (let i = 0; i < 1000; i++) {
        const x = (Math.random() - 0.5) * 1000;
        const y = (Math.random() - 0.5) * 1000;
        const z = (Math.random() - 0.5) * 1000;
        starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

// 질량 중심 메쉬 생성
function createCenterOfMassMesh() {
    if (centerOfMassMesh) {
        scene.remove(centerOfMassMesh);
    }

    const geometry = new THREE.SphereGeometry(3, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.6,
        wireframe: true
    });

    centerOfMassMesh = new THREE.Mesh(geometry, material);
    scene.add(centerOfMassMesh);
    centerOfMassMesh.visible = showCenterOfMass;
}

// 벡터 화살표 생성
function createVectorArrows() {
    // 기존 화살표 제거
    velocityArrows.forEach(arrow => scene.remove(arrow));
    forceArrows.forEach(arrow => scene.remove(arrow));
    velocityArrows = [];
    forceArrows = [];

    for (let i = 0; i < 3; i++) {
        // 속도 벡터 (밝은 색)
        const velArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            10,
            BODY_COLORS[i],
            5,
            3
        );
        velArrow.visible = showVectors;
        scene.add(velArrow);
        velocityArrows.push(velArrow);

        // 힘 벡터 (어두운 색)
        const forceArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            10,
            BODY_COLORS[i] & 0x888888,
            5,
            3
        );
        forceArrow.visible = showVectors;
        scene.add(forceArrow);
        forceArrows.push(forceArrow);
    }
}

// 물체 생성
function createBodies() {
    // 기존 물체 제거
    bodies.forEach(body => {
        scene.remove(body.mesh);
    });
    trails.forEach(trail => {
        scene.remove(trail.line);
    });

    bodies = [];
    trails = [];
    physicsEngine.clearBodies();

    // 초기값 읽기
    const bodyControls = document.querySelectorAll('.body-controls');

    bodyControls.forEach((control, index) => {
        const mass = parseFloat(control.querySelector('.mass-slider').value);
        const size = parseFloat(control.querySelector('.size-slider').value);
        const posX = parseFloat(control.querySelector('.pos-x-slider').value);
        const posY = parseFloat(control.querySelector('.pos-y-slider').value);
        const posZ = parseFloat(control.querySelector('.pos-z-slider').value);
        const velX = parseFloat(control.querySelector('.vel-x-slider').value);
        const velY = parseFloat(control.querySelector('.vel-y-slider').value);

        const position = new THREE.Vector3(posX, posY, posZ);
        const velocity = new THREE.Vector3(velX, velY, 0);

        // 메쉬 생성
        const geometry = new THREE.SphereGeometry(5 * size, 32, 32);
        const material = new THREE.MeshStandardMaterial({
            color: BODY_COLORS[index],
            emissive: BODY_COLORS[index],
            emissiveIntensity: 0.3,
            metalness: 0.5,
            roughness: 0.5
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        scene.add(mesh);

        bodies.push({
            mesh: mesh,
            index: index,
            size: size
        });

        // 궤적 라인 생성
        const trailGeometry = new THREE.BufferGeometry();
        const trailMaterial = new THREE.LineBasicMaterial({
            color: BODY_COLORS[index],
            transparent: true,
            opacity: 0.6,
            linewidth: 2
        });

        const trailLine = new THREE.Line(trailGeometry, trailMaterial);
        scene.add(trailLine);

        trails.push({
            line: trailLine,
            points: []
        });

        // 물리 엔진에 추가
        physicsEngine.addBody(mass, position, velocity);
    });

    // 질량 중심 메쉬 생성
    createCenterOfMassMesh();

    // 벡터 화살표 생성
    createVectorArrows();

    // 시뮬레이션 시간 및 초기 에너지 리셋
    simulationTime = 0;
    initialEnergy = physicsEngine.calculateTotalEnergy();

    // 그래프 데이터 리셋
    energyData = { time: [], total: [], kinetic: [], potential: [] };
    distanceData = { time: [], d01: [], d02: [], d12: [] };
    if (energyChart) {
        energyChart.data.labels = [];
        energyChart.data.datasets.forEach(dataset => dataset.data = []);
        energyChart.update();
    }
    if (distanceChart) {
        distanceChart.data.labels = [];
        distanceChart.data.datasets.forEach(dataset => dataset.data = []);
        distanceChart.update();
    }

    // 통계 업데이트
    updateStatistics();
}

// 그래프 초기화
function initCharts() {
    // 에너지 그래프
    const energyCtx = document.getElementById('energy-chart').getContext('2d');
    energyChart = new Chart(energyCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '총 에너지',
                    data: [],
                    borderColor: '#64ffda',
                    backgroundColor: 'rgba(100, 255, 218, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: '운동 에너지',
                    data: [],
                    borderColor: '#ff6b6b',
                    backgroundColor: 'rgba(255, 107, 107, 0.1)',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: '위치 에너지',
                    data: [],
                    borderColor: '#4dabf7',
                    backgroundColor: 'rgba(77, 171, 247, 0.1)',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#ffffff', font: { size: 10 } }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#888888', font: { size: 9 } }
                },
                y: {
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#888888', font: { size: 9 } }
                }
            }
        }
    });

    // 거리 그래프
    const distanceCtx = document.getElementById('distance-chart').getContext('2d');
    distanceChart = new Chart(distanceCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '물체 1-2',
                    data: [],
                    borderColor: '#ff6b6b',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: '물체 1-3',
                    data: [],
                    borderColor: '#51cf66',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                },
                {
                    label: '물체 2-3',
                    data: [],
                    borderColor: '#4dabf7',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#ffffff', font: { size: 10 } }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#888888', font: { size: 9 } }
                },
                y: {
                    display: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#888888', font: { size: 9 } }
                }
            }
        }
    });
}

// UI 이벤트 리스너 설정
function setupEventListeners() {
    // 재생/정지 버튼
    document.getElementById('play-pause-btn').addEventListener('click', () => {
        isPlaying = !isPlaying;
        const btn = document.getElementById('play-pause-btn');
        btn.textContent = isPlaying ? '⏸ 정지' : '▶ 재생';
    });

    // 리셋 버튼
    document.getElementById('reset-btn').addEventListener('click', () => {
        isPlaying = false;
        document.getElementById('play-pause-btn').textContent = '▶ 재생';
        createBodies();
        clearTrails();
    });

    // 궤적 토글
    document.getElementById('trail-toggle').addEventListener('change', (e) => {
        showTrails = e.target.checked;
        trails.forEach(trail => {
            trail.line.visible = showTrails;
        });
    });

    // 벡터 토글
    document.getElementById('vector-toggle').addEventListener('change', (e) => {
        showVectors = e.target.checked;
        velocityArrows.forEach(arrow => arrow.visible = showVectors);
        forceArrows.forEach(arrow => arrow.visible = showVectors);
    });

    // 질량 중심 토글
    document.getElementById('center-of-mass-toggle').addEventListener('change', (e) => {
        showCenterOfMass = e.target.checked;
        if (centerOfMassMesh) {
            centerOfMassMesh.visible = showCenterOfMass;
        }
    });

    // 시간 속도
    document.getElementById('time-speed').addEventListener('input', (e) => {
        timeSpeed = parseFloat(e.target.value);
        document.getElementById('speed-value').textContent = timeSpeed.toFixed(1) + 'x';
    });

    // 각 물체의 컨트롤
    const bodyControls = document.querySelectorAll('.body-controls');

    bodyControls.forEach((control, index) => {
        // 질량
        const massSlider = control.querySelector('.mass-slider');
        const massValue = control.querySelector('.mass-value');
        massSlider.addEventListener('input', (e) => {
            massValue.textContent = e.target.value;
            updateBodyFromUI(index);
        });

        // 크기
        const sizeSlider = control.querySelector('.size-slider');
        const sizeValue = control.querySelector('.size-value');
        sizeSlider.addEventListener('input', (e) => {
            sizeValue.textContent = e.target.value;
            updateBodyFromUI(index);
        });

        // 위치 X, Y, Z
        ['x', 'y', 'z'].forEach(axis => {
            const slider = control.querySelector(`.pos-${axis}-slider`);
            const value = control.querySelector(`.pos-${axis}-value`);
            slider.addEventListener('input', (e) => {
                value.textContent = e.target.value;
                updateBodyFromUI(index);
            });
        });

        // 속도 X, Y
        ['x', 'y'].forEach(axis => {
            const slider = control.querySelector(`.vel-${axis}-slider`);
            const value = control.querySelector(`.vel-${axis}-value`);
            slider.addEventListener('input', (e) => {
                value.textContent = e.target.value;
                updateBodyFromUI(index);
            });
        });
    });
}

// UI에서 물체 상태 업데이트
function updateBodyFromUI(index) {
    const control = document.querySelectorAll('.body-controls')[index];

    const mass = parseFloat(control.querySelector('.mass-slider').value);
    const size = parseFloat(control.querySelector('.size-slider').value);
    const posX = parseFloat(control.querySelector('.pos-x-slider').value);
    const posY = parseFloat(control.querySelector('.pos-y-slider').value);
    const posZ = parseFloat(control.querySelector('.pos-z-slider').value);
    const velX = parseFloat(control.querySelector('.vel-x-slider').value);
    const velY = parseFloat(control.querySelector('.vel-y-slider').value);

    const position = new THREE.Vector3(posX, posY, posZ);
    const velocity = new THREE.Vector3(velX, velY, 0);

    // 메쉬 업데이트
    bodies[index].mesh.position.copy(position);
    bodies[index].mesh.scale.setScalar(size / bodies[index].size);
    bodies[index].size = size;

    // 물리 엔진 업데이트
    physicsEngine.updateBodyInitialState(index, mass, position, velocity);

    // 궤적 초기화
    trails[index].points = [];

    // 초기 에너지 업데이트
    initialEnergy = physicsEngine.calculateTotalEnergy();
}

// 마우스 이벤트 설정
function setupMouseEvents() {
    const container = document.getElementById('canvas-container');

    container.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const meshes = bodies.map(b => b.mesh);
        const intersects = raycaster.intersectObjects(meshes);

        if (intersects.length > 0) {
            selectedBody = intersects[0].object;
            container.style.cursor = 'move';
        }
    });

    container.addEventListener('mousemove', (event) => {
        if (!selectedBody) return;

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersection);

        if (intersection) {
            selectedBody.position.copy(intersection);

            const bodyIndex = bodies.findIndex(b => b.mesh === selectedBody);
            if (bodyIndex !== -1) {
                updateUIFromBody(bodyIndex);
            }
        }
    });

    container.addEventListener('mouseup', () => {
        if (selectedBody) {
            const bodyIndex = bodies.findIndex(b => b.mesh === selectedBody);
            if (bodyIndex !== -1) {
                updateBodyFromUI(bodyIndex);
            }
        }
        selectedBody = null;
        container.style.cursor = 'default';
    });
}

// 물체 위치에서 UI 업데이트
function updateUIFromBody(index) {
    const control = document.querySelectorAll('.body-controls')[index];
    const position = bodies[index].mesh.position;

    control.querySelector('.pos-x-slider').value = position.x;
    control.querySelector('.pos-x-value').textContent = position.x.toFixed(0);

    control.querySelector('.pos-y-slider').value = position.y;
    control.querySelector('.pos-y-value').textContent = position.y.toFixed(0);

    control.querySelector('.pos-z-slider').value = position.z;
    control.querySelector('.pos-z-value').textContent = position.z.toFixed(0);
}

// 궤적 추가
function updateTrails() {
    bodies.forEach((body, index) => {
        const trail = trails[index];
        trail.points.push(body.mesh.position.clone());

        if (trail.points.length > MAX_TRAIL_POINTS) {
            trail.points.shift();
        }

        const positions = new Float32Array(trail.points.length * 3);
        trail.points.forEach((point, i) => {
            positions[i * 3] = point.x;
            positions[i * 3 + 1] = point.y;
            positions[i * 3 + 2] = point.z;
        });

        trail.line.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        trail.line.geometry.attributes.position.needsUpdate = true;
    });
}

// 궤적 초기화
function clearTrails() {
    trails.forEach(trail => {
        trail.points = [];
        trail.line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    });
}

// 벡터 업데이트
function updateVectors() {
    if (!showVectors) return;

    bodies.forEach((body, index) => {
        const physBody = physicsEngine.bodies[index];

        // 속도 벡터
        const velocity = physBody.velocity.clone();
        const velLength = velocity.length();
        if (velLength > 0.01) {
            velocityArrows[index].position.copy(body.mesh.position);
            velocityArrows[index].setDirection(velocity.normalize());
            velocityArrows[index].setLength(Math.min(velLength * 3, 50));
        } else {
            velocityArrows[index].setLength(0);
        }

        // 힘 벡터
        const force = physicsEngine.calculateForceVector(index);
        const forceLength = force.length();
        if (forceLength > 0.01) {
            forceArrows[index].position.copy(body.mesh.position);
            forceArrows[index].setDirection(force.normalize());
            forceArrows[index].setLength(Math.min(forceLength * 0.5, 30));
        } else {
            forceArrows[index].setLength(0);
        }
    });
}

// 질량 중심 업데이트
function updateCenterOfMass() {
    if (!showCenterOfMass || !centerOfMassMesh) return;

    const com = physicsEngine.calculateCenterOfMass();
    centerOfMassMesh.position.copy(com);
}

// 통계 업데이트
function updateStatistics() {
    // 시뮬레이션 시간
    document.getElementById('sim-time').textContent = simulationTime.toFixed(1) + ' s';

    // 에너지
    const totalEnergy = physicsEngine.calculateTotalEnergy();
    const kineticEnergy = physicsEngine.calculateKineticEnergy();
    const potentialEnergy = physicsEngine.calculatePotentialEnergy();

    document.getElementById('total-energy').textContent = totalEnergy.toFixed(2) + ' J';
    document.getElementById('kinetic-energy').textContent = kineticEnergy.toFixed(2) + ' J';
    document.getElementById('potential-energy').textContent = potentialEnergy.toFixed(2) + ' J';

    // 에너지 오차
    const energyError = initialEnergy !== 0 ? Math.abs((totalEnergy - initialEnergy) / initialEnergy) * 100 : 0;
    const errorElement = document.getElementById('energy-error');
    errorElement.textContent = energyError.toFixed(4) + '%';

    // 에너지 오차 색상
    errorElement.classList.remove('low', 'medium', 'high');
    if (energyError < 0.1) {
        errorElement.classList.add('low');
    } else if (energyError < 1) {
        errorElement.classList.add('medium');
    } else {
        errorElement.classList.add('high');
    }

    // 물체별 정보
    const bodyInfos = document.querySelectorAll('.body-info');
    bodyInfos.forEach((info, index) => {
        const physBody = physicsEngine.bodies[index];
        const pos = physBody.position;
        const vel = physBody.velocity.length();
        const ke = physicsEngine.calculateKineticEnergy(index);

        info.querySelector('.body-position').textContent =
            `${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
        info.querySelector('.body-velocity').textContent = vel.toFixed(2);
        info.querySelector('.body-ke').textContent = ke.toFixed(2) + ' J';
    });

    // 물체 간 거리
    document.getElementById('distance-01').textContent = physicsEngine.getDistance(0, 1).toFixed(2);
    document.getElementById('distance-02').textContent = physicsEngine.getDistance(0, 2).toFixed(2);
    document.getElementById('distance-12').textContent = physicsEngine.getDistance(1, 2).toFixed(2);
}

// 그래프 업데이트
let graphUpdateCounter = 0;
function updateGraphs() {
    graphUpdateCounter++;
    if (graphUpdateCounter < 5) return; // 5프레임마다 업데이트
    graphUpdateCounter = 0;

    const totalEnergy = physicsEngine.calculateTotalEnergy();
    const kineticEnergy = physicsEngine.calculateKineticEnergy();
    const potentialEnergy = physicsEngine.calculatePotentialEnergy();

    const d01 = physicsEngine.getDistance(0, 1);
    const d02 = physicsEngine.getDistance(0, 2);
    const d12 = physicsEngine.getDistance(1, 2);

    // 데이터 추가
    energyData.time.push(simulationTime.toFixed(1));
    energyData.total.push(totalEnergy);
    energyData.kinetic.push(kineticEnergy);
    energyData.potential.push(potentialEnergy);

    distanceData.time.push(simulationTime.toFixed(1));
    distanceData.d01.push(d01);
    distanceData.d02.push(d02);
    distanceData.d12.push(d12);

    // 최대 포인트 수 제한
    if (energyData.time.length > MAX_GRAPH_POINTS) {
        energyData.time.shift();
        energyData.total.shift();
        energyData.kinetic.shift();
        energyData.potential.shift();

        distanceData.time.shift();
        distanceData.d01.shift();
        distanceData.d02.shift();
        distanceData.d12.shift();
    }

    // 그래프 업데이트
    energyChart.data.labels = energyData.time;
    energyChart.data.datasets[0].data = energyData.total;
    energyChart.data.datasets[1].data = energyData.kinetic;
    energyChart.data.datasets[2].data = energyData.potential;
    energyChart.update('none');

    distanceChart.data.labels = distanceData.time;
    distanceChart.data.datasets[0].data = distanceData.d01;
    distanceChart.data.datasets[1].data = distanceData.d02;
    distanceChart.data.datasets[2].data = distanceData.d12;
    distanceChart.update('none');
}

// 프리셋 로드
function loadPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) return;

    const bodyControls = document.querySelectorAll('.body-controls');

    preset.forEach((config, index) => {
        const control = bodyControls[index];

        control.querySelector('.mass-slider').value = config.mass;
        control.querySelector('.mass-value').textContent = config.mass;

        control.querySelector('.size-slider').value = config.size;
        control.querySelector('.size-value').textContent = config.size;

        control.querySelector('.pos-x-slider').value = config.position.x;
        control.querySelector('.pos-x-value').textContent = config.position.x;

        control.querySelector('.pos-y-slider').value = config.position.y;
        control.querySelector('.pos-y-value').textContent = config.position.y;

        control.querySelector('.pos-z-slider').value = config.position.z;
        control.querySelector('.pos-z-value').textContent = config.position.z;

        control.querySelector('.vel-x-slider').value = config.velocity.x;
        control.querySelector('.vel-x-value').textContent = config.velocity.x;

        control.querySelector('.vel-y-slider').value = config.velocity.y;
        control.querySelector('.vel-y-value').textContent = config.velocity.y;
    });

    // 재생성
    isPlaying = false;
    document.getElementById('play-pause-btn').textContent = '▶ 재생';
    createBodies();
    clearTrails();
}

// 윈도우 리사이즈
function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// 애니메이션 루프
function animate() {
    requestAnimationFrame(animate);

    if (isPlaying) {
        // 물리 시뮬레이션 업데이트
        physicsEngine.update(timeSpeed);
        simulationTime += timeSpeed * physicsEngine.timeStep;

        // 메쉬 위치 업데이트
        physicsEngine.bodies.forEach((body, index) => {
            bodies[index].mesh.position.copy(body.position);
        });

        // 궤적 업데이트
        if (showTrails) {
            updateTrails();
        }

        // 벡터 업데이트
        updateVectors();

        // 질량 중심 업데이트
        updateCenterOfMass();

        // 통계 업데이트
        updateStatistics();

        // 그래프 업데이트
        updateGraphs();
    }

    renderer.render(scene, camera);
}

// 페이지 로드 시 초기화
window.addEventListener('load', init);
