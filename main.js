// Three.js 설정 및 메인 로직
let scene, camera, renderer, controls;
let bodies = [];
let trails = [];
let physicsEngine;
let isPlaying = false;
let showTrails = true;
let timeSpeed = 1.0;
let selectedBody = null;
let raycaster, mouse;

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

    // 그리드 추가 (선택사항)
    const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    // 좌표축 헬퍼 (선택사항)
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);

    // 물리 엔진 초기화
    physicsEngine = new PhysicsEngine();

    // 레이캐스터 초기화 (마우스 인터랙션용)
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 3개의 물체 생성
    createBodies();

    // UI 이벤트 리스너 설정
    setupEventListeners();

    // 마우스 이벤트
    setupMouseEvents();

    // 윈도우 리사이즈
    window.addEventListener('resize', onWindowResize);

    // 애니메이션 시작
    animate();
}

// OrbitControls 설정
function setupOrbitControls() {
    // 간단한 OrbitControls 구현
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let isRightDragging = false;

    renderer.domElement.addEventListener('mousedown', (e) => {
        if (selectedBody) return; // 물체 선택 중일 때는 카메라 회전 안함

        if (e.button === 0) { // 좌클릭
            isDragging = true;
        } else if (e.button === 2) { // 우클릭
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

            // 카메라를 원점 중심으로 회전
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
}

// 마우스 이벤트 설정 (물체 드래그)
function setupMouseEvents() {
    const container = document.getElementById('canvas-container');

    container.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return; // 좌클릭만

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

        // 카메라와 평행한 평면에 투영
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersection);

        if (intersection) {
            selectedBody.position.copy(intersection);

            // 해당 물체의 UI 업데이트
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

        // 최대 포인트 수 제한
        if (trail.points.length > MAX_TRAIL_POINTS) {
            trail.points.shift();
        }

        // 라인 업데이트
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

        // 메쉬 위치 업데이트
        physicsEngine.bodies.forEach((body, index) => {
            bodies[index].mesh.position.copy(body.position);
        });

        // 궤적 업데이트
        if (showTrails) {
            updateTrails();
        }
    }

    renderer.render(scene, camera);
}

// 페이지 로드 시 초기화
window.addEventListener('load', init);
