// 물리 엔진 - 3체 문제 시뮬레이션
class PhysicsEngine {
    constructor() {
        this.G = 0.1; // 중력 상수 (시뮬레이션용으로 조정)
        this.bodies = [];
        this.timeStep = 0.016; // 시뮬레이션 타임 스텝
    }

    addBody(mass, position, velocity) {
        this.bodies.push({
            mass: mass,
            position: position.clone(),
            velocity: velocity.clone(),
            acceleration: new THREE.Vector3(0, 0, 0),
            initialPosition: position.clone(),
            initialVelocity: velocity.clone()
        });
    }

    clearBodies() {
        this.bodies = [];
    }

    // 두 물체 사이의 중력 계산 (뉴턴의 만유인력 법칙)
    calculateGravitationalForce(body1, body2) {
        const direction = new THREE.Vector3().subVectors(body2.position, body1.position);
        const distance = direction.length();

        // 충돌 방지를 위한 최소 거리
        const minDistance = 5;
        if (distance < minDistance) {
            return new THREE.Vector3(0, 0, 0);
        }

        // F = G * (m1 * m2) / r^2
        const forceMagnitude = (this.G * body1.mass * body2.mass) / (distance * distance);

        // 힘의 방향 정규화
        direction.normalize();

        // 힘 벡터 계산
        return direction.multiplyScalar(forceMagnitude);
    }

    // Velocity Verlet 적분법을 사용한 더 정확한 시뮬레이션
    update(deltaTime) {
        const dt = deltaTime * this.timeStep;

        // 1. 현재 가속도 계산
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            body.acceleration.set(0, 0, 0);

            for (let j = 0; j < this.bodies.length; j++) {
                if (i !== j) {
                    const force = this.calculateGravitationalForce(body, this.bodies[j]);
                    // a = F / m
                    const acceleration = force.divideScalar(body.mass);
                    body.acceleration.add(acceleration);
                }
            }
        }

        // 2. 위치와 속도 업데이트
        for (let body of this.bodies) {
            // v(t + dt/2) = v(t) + a(t) * dt/2
            const halfStepVelocity = body.velocity.clone().add(
                body.acceleration.clone().multiplyScalar(dt * 0.5)
            );

            // x(t + dt) = x(t) + v(t + dt/2) * dt
            body.position.add(halfStepVelocity.clone().multiplyScalar(dt));
        }

        // 3. 새 위치에서 가속도 재계산
        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];
            const newAcceleration = new THREE.Vector3(0, 0, 0);

            for (let j = 0; j < this.bodies.length; j++) {
                if (i !== j) {
                    const force = this.calculateGravitationalForce(body, this.bodies[j]);
                    const acceleration = force.divideScalar(body.mass);
                    newAcceleration.add(acceleration);
                }
            }

            // v(t + dt) = v(t + dt/2) + a(t + dt) * dt/2
            body.velocity.add(
                body.acceleration.clone().add(newAcceleration).multiplyScalar(dt * 0.5)
            );

            body.acceleration = newAcceleration;
        }
    }

    reset() {
        for (let body of this.bodies) {
            body.position.copy(body.initialPosition);
            body.velocity.copy(body.initialVelocity);
            body.acceleration.set(0, 0, 0);
        }
    }

    updateBodyInitialState(index, mass, position, velocity) {
        if (index < this.bodies.length) {
            const body = this.bodies[index];
            body.mass = mass;
            body.position.copy(position);
            body.velocity.copy(velocity);
            body.initialPosition.copy(position);
            body.initialVelocity.copy(velocity);
            body.acceleration.set(0, 0, 0);
        }
    }

    // 운동 에너지 계산 (KE = 1/2 * m * v^2)
    calculateKineticEnergy(bodyIndex = -1) {
        if (bodyIndex >= 0 && bodyIndex < this.bodies.length) {
            // 특정 물체의 운동 에너지
            const body = this.bodies[bodyIndex];
            const speedSquared = body.velocity.lengthSq();
            return 0.5 * body.mass * speedSquared;
        } else {
            // 전체 시스템의 운동 에너지
            let totalKE = 0;
            for (let body of this.bodies) {
                const speedSquared = body.velocity.lengthSq();
                totalKE += 0.5 * body.mass * speedSquared;
            }
            return totalKE;
        }
    }

    // 위치 에너지 계산 (PE = -G * m1 * m2 / r)
    calculatePotentialEnergy() {
        let totalPE = 0;
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const body1 = this.bodies[i];
                const body2 = this.bodies[j];
                const distance = body1.position.distanceTo(body2.position);

                if (distance > 0) {
                    totalPE -= (this.G * body1.mass * body2.mass) / distance;
                }
            }
        }
        return totalPE;
    }

    // 총 에너지 계산
    calculateTotalEnergy() {
        return this.calculateKineticEnergy() + this.calculatePotentialEnergy();
    }

    // 운동량 계산 (p = m * v)
    calculateMomentum() {
        const totalMomentum = new THREE.Vector3(0, 0, 0);
        for (let body of this.bodies) {
            const momentum = body.velocity.clone().multiplyScalar(body.mass);
            totalMomentum.add(momentum);
        }
        return totalMomentum;
    }

    // 각운동량 계산 (L = r × p)
    calculateAngularMomentum() {
        const totalAngularMomentum = new THREE.Vector3(0, 0, 0);
        for (let body of this.bodies) {
            const momentum = body.velocity.clone().multiplyScalar(body.mass);
            const angularMomentum = new THREE.Vector3().crossVectors(body.position, momentum);
            totalAngularMomentum.add(angularMomentum);
        }
        return totalAngularMomentum;
    }

    // 질량 중심 계산
    calculateCenterOfMass() {
        let totalMass = 0;
        const centerOfMass = new THREE.Vector3(0, 0, 0);

        for (let body of this.bodies) {
            centerOfMass.add(body.position.clone().multiplyScalar(body.mass));
            totalMass += body.mass;
        }

        if (totalMass > 0) {
            centerOfMass.divideScalar(totalMass);
        }

        return centerOfMass;
    }

    // 물체 간 거리 계산
    getDistance(index1, index2) {
        if (index1 < this.bodies.length && index2 < this.bodies.length) {
            return this.bodies[index1].position.distanceTo(this.bodies[index2].position);
        }
        return 0;
    }

    // 물체의 현재 힘 벡터 계산 (시각화용)
    calculateForceVector(bodyIndex) {
        if (bodyIndex >= this.bodies.length) {
            return new THREE.Vector3(0, 0, 0);
        }

        const body = this.bodies[bodyIndex];
        const totalForce = new THREE.Vector3(0, 0, 0);

        for (let j = 0; j < this.bodies.length; j++) {
            if (bodyIndex !== j) {
                const force = this.calculateGravitationalForce(body, this.bodies[j]);
                totalForce.add(force);
            }
        }

        return totalForce;
    }
}

// 사전 설정된 흥미로운 3체 문제 구성
const presets = {
    // Figure-8 궤도 (Choreography)
    figure8: [
        {
            mass: 1000,
            position: new THREE.Vector3(-50, 0, 0),
            velocity: new THREE.Vector3(0.513, 0.305, 0),
            size: 1.0
        },
        {
            mass: 1000,
            position: new THREE.Vector3(50, 0, 0),
            velocity: new THREE.Vector3(0.513, 0.305, 0),
            size: 1.0
        },
        {
            mass: 1000,
            position: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(-1.026, -0.61, 0),
            size: 1.0
        }
    ],

    // 라그랑주 삼각형 (안정적인 구성)
    lagrange: [
        {
            mass: 1000,
            position: new THREE.Vector3(0, 60, 0),
            velocity: new THREE.Vector3(8, 0, 0),
            size: 1.0
        },
        {
            mass: 1000,
            position: new THREE.Vector3(-52, -30, 0),
            velocity: new THREE.Vector3(-4, -7, 0),
            size: 1.0
        },
        {
            mass: 1000,
            position: new THREE.Vector3(52, -30, 0),
            velocity: new THREE.Vector3(-4, 7, 0),
            size: 1.0
        }
    ],

    // 혼돈적 궤도
    chaos: [
        {
            mass: 1000,
            position: new THREE.Vector3(-50, 0, 0),
            velocity: new THREE.Vector3(0, 10, 0),
            size: 1.0
        },
        {
            mass: 1500,
            position: new THREE.Vector3(50, 0, 0),
            velocity: new THREE.Vector3(0, -5, 0),
            size: 1.2
        },
        {
            mass: 800,
            position: new THREE.Vector3(0, 50, 0),
            velocity: new THREE.Vector3(8, -5, 0),
            size: 0.8
        }
    ]
};
