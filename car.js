/**
 * F1 Racing Simulator - Car Model & Beginner-Friendly Simcade Physics
 * Includes DRS wing animation, wheel rotation/steering, particle sparks/smoke,
 * Traction Control (TCS), ABS, Stability Assist, and Flashback/Rewind buffer.
 */
class F1Car {
    constructor(scene, color = 0xd92027, isPlayer = true) { // Default Scuderia Red
        this.scene = scene;
        this.carColor = color;
        this.isPlayer = isPlayer;

        // Visual Hierarchy
        this.mesh = new THREE.Group();
        this.frontLeftWheel = null;
        this.frontRightWheel = null;
        this.rearLeftWheel = null;
        this.rearRightWheel = null;
        this.drsFlapMesh = null;
        this.brakeDiscMeshes = [];
        this.rearRainLight = null;

        // Physics State
        this.position = new THREE.Vector3(0, 0.45, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.heading = 0; // Yaw angle (radians)
        this.angularVelocity = 0;
        this.speedKmh = 0;
        this.steerAngle = 0; // Current front wheel turn angle
        this.wheelRotation = 0; // Rolling spin angle

        // Controls input
        this.throttle = 0; // 0 to 1
        this.brake = 0;    // 0 to 1
        this.steerInput = 0; // -1 (left) to 1 (right)
        this.drsActive = false;
        this.ersActive = false;

        // Powertrain & Gearbox (F1 1.6L V6 Turbo Hybrid + 8-speed)
        this.gear = 1;
        this.rpm = 1000;
        this.idleRpm = 1200;
        this.maxRpm = 13500;
        this.gearRatios = [0, 3.4, 2.7, 2.1, 1.7, 1.4, 1.15, 0.95, 0.8]; // N, 1~8
        this.finalDrive = 3.8;
        this.autoGear = true;
        this.shiftCooldown = 0;

        // ERS Battery (0 ~ 100%)
        this.ersBattery = 100;

        // Novice Assist Settings (預設新手超友善輔助，絕不輕易失控起肖！)
        this.assists = {
            tcsLevel: 1.0,         // 循跡防滑 (1.0 = 全開防打滑)
            absEnabled: true,      // 防鎖死煞車
            stabilityAssist: 0.85, // 車身穩定輔助 (自動抑制失控甩尾自旋)
            cornerBrakeAssist: 0.6,// 彎道超速輔助減速 (防止新手直衝撞牆)
            autoSteerCenter: true  // 方向盤平滑自動回正
        };

        // Flashback / Rewind Buffer (Stores 360 frames = 6 seconds @ 60fps)
        this.rewindBuffer = [];
        this.maxRewindFrames = 360;
        this.isRewinding = false;

        // Telemetry
        this.tireSlip = 0;
        this.onKerb = false;
        this.onGrass = false;
        this.distanceCovered = 0;
        this.currentLap = 1;
        this.lapStartTime = performance.now();
        this.currentLapTime = 0;
        this.bestLapTime = null;
        this.sectorTimes = [null, null, null];
        this.lastSectorIdx = 0;

        // Particle Emitter Arrays
        this.sparks = [];
        this.smokeParticles = [];

        this.buildCarModel();
        this.initParticles();
    }

    buildCarModel() {
        const car = new THREE.Group();

        // 1. Monocoque / Main Chassis
        const chassisMat = new THREE.MeshStandardMaterial({
            color: this.carColor,
            roughness: 0.25,
            metalness: 0.45
        });
        const carbonMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.7,
            metalness: 0.2
        });

        // Nosecone & Cockpit
        const noseGeo = new THREE.ConeGeometry(0.55, 3.2, 8);
        noseGeo.rotateX(Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, chassisMat);
        nose.scale.set(0.9, 0.55, 1);
        nose.position.set(0, 0.12, 1.4);
        car.add(nose);

        // Cockpit tub
        const tubGeo = new THREE.BoxGeometry(0.95, 0.55, 2.2);
        const tub = new THREE.Mesh(tubGeo, chassisMat);
        tub.position.set(0, 0.16, -0.4);
        car.add(tub);

        // Sidepods (Left & Right air intake radiators)
        const podGeo = new THREE.BoxGeometry(0.45, 0.45, 1.8);
        const podL = new THREE.Mesh(podGeo, chassisMat);
        podL.position.set(-0.68, 0.12, -0.4);
        const podR = new THREE.Mesh(podGeo, chassisMat);
        podR.position.set(0.68, 0.12, -0.4);
        car.add(podL, podR);

        // Air Intake Scoop above driver helmet
        const scoopGeo = new THREE.BoxGeometry(0.4, 0.5, 0.9);
        const scoop = new THREE.Mesh(scoopGeo, chassisMat);
        scoop.position.set(0, 0.62, -0.6);
        car.add(scoop);

        // Halo Safety Ring (Titanium protection bar)
        const haloGeo = new THREE.TorusGeometry(0.38, 0.05, 8, 16, Math.PI);
        const haloMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.2 });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.set(0, 0.56, 0.15);
        halo.rotation.x = -Math.PI / 2 + 0.2;
        car.add(halo);

        // Center Halo pylon
        const pylonGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.38);
        const pylon = new THREE.Mesh(pylonGeo, haloMat);
        pylon.position.set(0, 0.42, 0.45);
        car.add(pylon);

        // Driver Helmet
        const helmetGeo = new THREE.SphereGeometry(0.22, 16, 16);
        const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf4c20d, roughness: 0.2 }); // Yellow helmet
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.set(0, 0.42, -0.05);
        helmet.scale.set(0.9, 1.0, 1.1);

        // Helmet Visor
        const visorGeo = new THREE.BoxGeometry(0.28, 0.09, 0.18);
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.95, roughness: 0.1 });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 0.02, 0.14);
        helmet.add(visor);
        car.add(helmet);

        // Front Wing (Multi-element aero wing)
        const frontWingMain = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.65), carbonMat);
        frontWingMain.position.set(0, -0.1, 2.7);
        const endplateL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.7), chassisMat);
        endplateL.position.set(-1.15, 0.04, 2.7);
        const endplateR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.7), chassisMat);
        endplateR.position.set(1.15, 0.04, 2.7);
        car.add(frontWingMain, endplateL, endplateR);

        // Rear Wing Assembly
        const rearWingMain = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.45), carbonMat);
        rearWingMain.position.set(0, 0.78, -2.1);
        const rEndplateL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.7), chassisMat);
        rEndplateL.position.set(-0.8, 0.65, -2.1);
        const rEndplateR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.7), chassisMat);
        rEndplateR.position.set(0.8, 0.65, -2.1);
        const rearPylonL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.1), carbonMat);
        rearPylonL.position.set(-0.25, 0.45, -1.95);
        const rearPylonR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.7, 0.1), carbonMat);
        rearPylonR.position.set(0.25, 0.45, -1.95);

        // DRS Movable Flap!
        const flapGeo = new THREE.BoxGeometry(1.58, 0.04, 0.3);
        flapGeo.translate(0, 0, -0.15); // Pivot at trailing hinge
        this.drsFlapMesh = new THREE.Mesh(flapGeo, carbonMat);
        this.drsFlapMesh.position.set(0, 0.92, -1.95);

        car.add(rearWingMain, rEndplateL, rEndplateR, rearPylonL, rearPylonR, this.drsFlapMesh);

        // Rear Rain / ERS LED Light
        const rainLightGeo = new THREE.BoxGeometry(0.22, 0.12, 0.05);
        const rainLightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.rearRainLight = new THREE.Mesh(rainLightGeo, rainLightMat);
        this.rearRainLight.position.set(0, 0.08, -2.25);
        car.add(this.rearRainLight);

        // 4 Pirelli F1 Wheels (Tire + Rim + Red Soft Stripe)
        const createWheel = (isFront) => {
            const wheelGroup = new THREE.Group();

            // Tire rubber
            const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.44, 20);
            tireGeo.rotateZ(Math.PI / 2);
            const tireMat = new THREE.MeshStandardMaterial({
                color: 0x181818,
                roughness: 0.8,
                metalness: 0.1
            });
            const tire = new THREE.Mesh(tireGeo, tireMat);

            // Wheel Rim
            const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.45, 14);
            rimGeo.rotateZ(Math.PI / 2);
            const rimMat = new THREE.MeshStandardMaterial({
                color: 0x222222,
                roughness: 0.3,
                metalness: 0.8
            });
            const rim = new THREE.Mesh(rimGeo, rimMat);

            // Red Soft Compound Color Ring on sidewall
            const ringGeo = new THREE.RingGeometry(0.24, 0.28, 16);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xe10600, side: THREE.DoubleSide });
            const ringOuter = new THREE.Mesh(ringGeo, ringMat);
            ringOuter.position.x = 0.225;
            ringOuter.rotation.y = Math.PI / 2;
            wheelGroup.add(tire, rim, ringOuter);

            // Brake Disc (glows when braking!)
            const discGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 14);
            discGeo.rotateZ(Math.PI / 2);
            const discMat = new THREE.MeshStandardMaterial({
                color: 0x444444,
                roughness: 0.2,
                metalness: 0.9,
                emissive: 0x000000
            });
            const disc = new THREE.Mesh(discGeo, discMat);
            disc.position.x = -0.05;
            wheelGroup.add(disc);
            this.brakeDiscMeshes.push(disc);

            return wheelGroup;
        };

        // Front Left & Right (with steering pivot node)
        this.frontLeftPivot = new THREE.Group();
        this.frontLeftPivot.position.set(-1.05, 0, 1.6);
        this.frontLeftWheel = createWheel(true);
        this.frontLeftPivot.add(this.frontLeftWheel);

        this.frontRightPivot = new THREE.Group();
        this.frontRightPivot.position.set(1.05, 0, 1.6);
        this.frontRightWheel = createWheel(true);
        this.frontRightPivot.add(this.frontRightWheel);

        // Rear Left & Right
        this.rearLeftWheel = createWheel(false);
        this.rearLeftWheel.position.set(-1.08, 0, -1.55);

        this.rearRightWheel = createWheel(false);
        this.rearRightWheel.position.set(1.08, 0, -1.55);

        car.add(this.frontLeftPivot, this.frontRightPivot, this.rearLeftWheel, this.rearRightWheel);

        // Suspension Wishbone Rods
        const wishboneMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
        const addWishbone = (x1, y1, z1, x2, y2, z2) => {
            const v1 = new THREE.Vector3(x1, y1, z1);
            const v2 = new THREE.Vector3(x2, y2, z2);
            const dist = v1.distanceTo(v2);
            const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, dist, 6);
            const rod = new THREE.Mesh(rodGeo, wishboneMat);
            rod.position.copy(v1).add(v2).multiplyScalar(0.5);
            rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.sub(v1).normalize());
            car.add(rod);
        };

        // Front wishbones
        addWishbone(-0.45, 0.15, 1.7, -1.0, 0, 1.6);
        addWishbone(0.45, 0.15, 1.7, 1.0, 0, 1.6);
        addWishbone(-0.45, 0.05, 1.5, -1.0, 0, 1.6);
        addWishbone(0.45, 0.05, 1.5, 1.0, 0, 1.6);

        // Rear wishbones
        addWishbone(-0.45, 0.2, -1.4, -1.05, 0, -1.55);
        addWishbone(0.45, 0.2, -1.4, 1.05, 0, -1.55);

        this.mesh.add(car);
        this.scene.add(this.mesh);
    }

    initParticles() {
        // Sparks (titanium block bottoming out at 300+ km/h)
        const sparkGeo = new THREE.BufferGeometry();
        const sparkPositions = new Float32Array(60 * 3);
        sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
        const sparkMat = new THREE.PointsMaterial({
            color: 0xffaa22,
            size: 0.25,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending
        });
        this.sparkPoints = new THREE.Points(sparkGeo, sparkMat);
        this.scene.add(this.sparkPoints);

        for (let i = 0; i < 60; i++) {
            this.sparks.push({
                x: 0, y: -100, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0
            });
        }

        // Tire Smoke
        const smokeGeo = new THREE.BufferGeometry();
        const smokePositions = new Float32Array(50 * 3);
        smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
        const smokeMat = new THREE.PointsMaterial({
            color: 0xdddddd,
            size: 0.7,
            transparent: true,
            opacity: 0.45
        });
        this.smokePoints = new THREE.Points(smokeGeo, smokeMat);
        this.scene.add(this.smokePoints);

        for (let i = 0; i < 50; i++) {
            this.smokeParticles.push({
                x: 0, y: -100, z: 0,
                vx: 0, vy: 0, vz: 0,
                life: 0,
                size: 0.7
            });
        }
    }

    setInputs(throttle, brake, steer, drs, ers) {
        this.throttle = Math.max(0, Math.min(1, throttle));
        this.brake = Math.max(0, Math.min(1, brake));
        this.steerInput = Math.max(-1, Math.min(1, steer));
        this.drsActive = drs;
        this.ersActive = ers;
    }

    update(deltaSec, track) {
        if (deltaSec > 0.1) deltaSec = 0.1; // Clamp lag spikes

        if (this.isRewinding) {
            this.applyRewindStep();
            return;
        }

        // Record rewind buffer for player
        if (this.isPlayer) {
            this.recordRewindFrame();
        }

        const currentSpeedMs = this.velocity.length();
        this.speedKmh = currentSpeedMs * 3.6;

        // Track inspection (query nearest segment)
        let trackInfo = null;
        if (track) {
            trackInfo = track.getNearestSample(this.position);
            this.onKerb = trackInfo.onKerb;
            this.onGrass = trackInfo.offTrack;
        }

        // 1. Steering Dynamics (Speed-sensitive steering lock to prevent twitchy spins)
        // High speed (300 km/h) -> 0.12 rad (~7 deg); Slow speed (40 km/h) -> 0.65 rad (~37 deg)
        const speedRatio = Math.min(1, currentSpeedMs / 90);
        const maxLock = 0.65 - speedRatio * 0.52;
        const targetSteerAngle = this.steerInput * maxLock;
        const steerSpeed = 6.0; // Responsive steering response
        this.steerAngle += (targetSteerAngle - this.steerAngle) * steerSpeed * deltaSec;

        // 2. Cornering Speed Assist (新手彎道超速輔助減速)
        // If novice is flying at 280 km/h towards a 110 km/h hairpin and hasn't braked, assist steps in smoothly!
        if (this.assists.cornerBrakeAssist > 0 && trackInfo) {
            const speedOver = this.speedKmh - trackInfo.targetSpeed;
            if (speedOver > 30 && this.throttle > 0.3) {
                // Smoothly trim throttle and apply slight braking
                const assistIntervention = Math.min(0.65, (speedOver - 30) / 70) * this.assists.cornerBrakeAssist;
                this.throttle *= (1.0 - assistIntervention);
                this.brake = Math.max(this.brake, assistIntervention * 0.85);
            }
        }

        // 3. Traction Control System (TCS 新手防甩尾打滑)
        let effectiveThrottle = this.throttle;
        if (this.assists.tcsLevel > 0) {
            // When turning heavily at low speed in 1st/2nd gear, limit torque spike
            const cornerStress = Math.abs(this.steerAngle) * (1 - speedRatio);
            if (cornerStress > 0.18 && effectiveThrottle > 0.4) {
                const maxAllowedThrottle = 0.45 + (1 - this.assists.tcsLevel) * 0.55;
                effectiveThrottle = Math.min(effectiveThrottle, maxAllowedThrottle);
            }
        }

        // 4. Engine & Transmission (Automatic gearbox)
        this.updateTransmission(effectiveThrottle, deltaSec);

        // 5. Powertrain Forces
        // Engine Drive Force
        const maxEnginePower = 740000; // ~1000 bhp hybrid V6
        let ersBoostForce = 0;
        if (this.ersActive && this.ersBattery > 0) {
            ersBoostForce = 120000; // +160 bhp ERS boost
            this.ersBattery = Math.max(0, this.ersBattery - 15 * deltaSec);
        } else if (this.brake > 0.2) {
            // Regenerate ERS battery under braking (MGU-K regen)
            this.ersBattery = Math.min(100, this.ersBattery + 12 * deltaSec);
        }

        // DRS Drag Reduction
        let dragCoeff = 0.72; // Standard high downforce F1
        if (this.drsActive && (!trackInfo || trackInfo.isDrsZone)) {
            dragCoeff = 0.52; // DRS open: 28% less drag!
        }

        // Rolling resistance & Grass/Gravel penalty
        let surfaceFriction = 0.015;
        if (this.onGrass) {
            surfaceFriction = 0.28; // Grass slows down gently and safely
            effectiveThrottle *= 0.55;
        } else if (this.onKerb) {
            surfaceFriction = 0.035;
        }

        // Aerodynamic Drag: F_drag = 0.5 * rho * v^2 * Cd
        const aeroDrag = 0.5 * 1.225 * currentSpeedMs * currentSpeedMs * dragCoeff * 1.4;

        // Drive Force at wheels
        const gearRatio = this.gearRatios[this.gear];
        const driveForce = (effectiveThrottle * maxEnginePower / Math.max(8.0, currentSpeedMs)) * 0.35 + (this.ersActive ? 2200 : 0);

        // Braking Force (ABS prevents 100% wheel lock-up)
        const brakeForce = this.brake * 14000;

        // Net Forward Acceleration
        const carMass = 798; // kg (F1 minimum weight)
        let forwardAcc = (driveForce - brakeForce - aeroDrag - currentSpeedMs * surfaceFriction * carMass) / carMass;

        // 6. Yaw & Turning Dynamics (Simcade handling with high downforce)
        // Aerodynamic downforce gives immense grip at high speeds
        const downforceGrip = 1.0 + (this.speedKmh / 250) * 1.4;

        let yawRate = (currentSpeedMs / 3.4) * Math.tan(this.steerAngle) * downforceGrip;

        // Auto-Countersteer / Stability Assist (防止過度甩尾自旋起肖)
        if (this.assists.stabilityAssist > 0) {
            const currentDir = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
            const velDir = currentSpeedMs > 2 ? this.velocity.clone().normalize() : currentDir;
            const slipAngle = currentDir.angleTo(velDir);

            this.tireSlip = slipAngle;

            if (slipAngle > 0.12 && currentSpeedMs > 10) {
                // Corrective damping torque
                const correctionDir = Math.sign(currentDir.cross(velDir).y);
                yawRate += correctionDir * slipAngle * 3.5 * this.assists.stabilityAssist;
            }
        }

        // Angular velocity smoothing
        this.heading += yawRate * deltaSec;

        // Update Velocity Vector
        const forwardVector = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));

        // Lateral grip vector (car sticks to heading direction)
        const targetVelocity = forwardVector.clone().multiplyScalar(Math.max(0, currentSpeedMs + forwardAcc * deltaSec));
        const gripBlend = Math.min(1.0, 14.0 * deltaSec); // High grip blending for beginner satisfaction
        this.velocity.lerp(targetVelocity, gripBlend);

        // Update Position
        this.position.addScaledVector(this.velocity, deltaSec);
        this.distanceCovered += this.velocity.length() * deltaSec;

        // Update 3D Mesh
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.heading;

        // Dynamic chassis pitch & roll (Squat on accel, dive on brake, roll on turns)
        const chassisRoll = -this.steerAngle * (this.speedKmh / 350) * 0.15;
        const chassisPitch = (forwardAcc / 25) * 0.08;
        this.mesh.rotation.z = chassisRoll;
        this.mesh.rotation.x = chassisPitch;

        // Wheel animations
        const wheelRollSpeed = (currentSpeedMs / 0.38) * deltaSec;
        this.wheelRotation += wheelRollSpeed;

        if (this.frontLeftPivot && this.frontRightPivot) {
            this.frontLeftPivot.rotation.y = this.steerAngle;
            this.frontRightPivot.rotation.y = this.steerAngle;
            this.frontLeftWheel.rotation.x = this.wheelRotation;
            this.frontRightWheel.rotation.x = this.wheelRotation;
        }
        if (this.rearLeftWheel && this.rearRightWheel) {
            this.rearLeftWheel.rotation.x = this.wheelRotation;
            this.rearRightWheel.rotation.x = this.wheelRotation;
        }

        // DRS Flap rotation animation (Flap opens 35 degrees)
        if (this.drsFlapMesh) {
            const targetFlapRot = this.drsActive ? -0.58 : 0;
            this.drsFlapMesh.rotation.x += (targetFlapRot - this.drsFlapMesh.rotation.x) * 12 * deltaSec;
        }

        // Glowing Brake Discs
        const brakeGlow = this.brake > 0.3 ? (this.brake * 0.9) : 0;
        this.brakeDiscMeshes.forEach(disc => {
            disc.material.emissive.setRGB(brakeGlow, brakeGlow * 0.15, 0);
        });

        // Rear rain/ERS blinking light
        if (this.rearRainLight) {
            const shouldBlink = this.ersActive || this.drsActive || this.speedKmh > 320;
            if (shouldBlink) {
                const flash = Math.sin(performance.now() * 0.015) > 0;
                this.rearRainLight.material.color.setHex(flash ? 0xff0000 : 0x330000);
            } else {
                this.rearRainLight.material.color.setHex(0x550000);
            }
        }

        // Particle updates
        this.updateParticles(deltaSec);

        // Lap & Sector Timing
        if (this.isPlayer && trackInfo) {
            this.updateLapTiming(trackInfo);
        }
    }

    updateTransmission(throttle, deltaSec) {
        // Automatic gear shift logic
        if (this.autoGear) {
            this.shiftCooldown -= deltaSec;
            // Shift Up at 12,200 RPM
            if (this.rpm > 12000 && this.gear < 8 && this.shiftCooldown <= 0) {
                this.gear++;
                this.rpm = 8800;
                this.shiftCooldown = 0.25;
                if (window.gameAudio) window.gameAudio.playGearShift();
            }
            // Shift Down at 6,500 RPM
            else if (this.rpm < 6800 && this.gear > 1 && this.shiftCooldown <= 0) {
                this.gear--;
                this.rpm = 10500;
                this.shiftCooldown = 0.25;
                if (window.gameAudio) window.gameAudio.playGearShift();
            }
        }

        // Calculate RPM based on wheel speed & gear ratio
        const speedRatio = Math.max(0.08, this.speedKmh / 360);
        const gearRatio = this.gearRatios[this.gear];
        let targetRpm = this.idleRpm + (this.speedKmh * gearRatio * 38) + throttle * 1400;
        targetRpm = Math.max(this.idleRpm, Math.min(this.maxRpm, targetRpm));

        this.rpm += (targetRpm - this.rpm) * 12 * deltaSec;
    }

    updateLapTiming(trackInfo) {
        const now = performance.now();
        this.currentLapTime = (now - this.lapStartTime) / 1000;

        // Sector Checkpoints
        const u = trackInfo.sample.u;
        if (u > 0.33 && this.lastSectorIdx === 0) {
            this.sectorTimes[0] = this.currentLapTime;
            this.lastSectorIdx = 1;
        } else if (u > 0.68 && this.lastSectorIdx === 1) {
            this.sectorTimes[1] = this.currentLapTime - (this.sectorTimes[0] || 0);
            this.lastSectorIdx = 2;
        } else if (u < 0.05 && this.lastSectorIdx === 2) {
            // Completed Lap!
            this.sectorTimes[2] = this.currentLapTime - (this.sectorTimes[0] || 0) - (this.sectorTimes[1] || 0);
            if (!this.bestLapTime || this.currentLapTime < this.bestLapTime) {
                this.bestLapTime = this.currentLapTime;
            }
            this.currentLap++;
            this.lastSectorIdx = 0;
            this.lapStartTime = now;
        }
    }

    recordRewindFrame() {
        this.rewindBuffer.push({
            position: this.position.clone(),
            velocity: this.velocity.clone(),
            heading: this.heading,
            gear: this.gear,
            rpm: this.rpm,
            speedKmh: this.speedKmh,
            distanceCovered: this.distanceCovered
        });

        if (this.rewindBuffer.length > this.maxRewindFrames) {
            this.rewindBuffer.shift();
        }
    }

    startRewind() {
        if (this.rewindBuffer.length < 10) return;
        this.isRewinding = true;
        if (window.gameAudio) window.gameAudio.playRewindSound();
    }

    stopRewind() {
        this.isRewinding = false;
    }

    applyRewindStep() {
        if (this.rewindBuffer.length === 0) {
            this.isRewinding = false;
            return;
        }

        // Pop 2 frames at a time for fast, smooth rewind
        let frame = this.rewindBuffer.pop();
        if (this.rewindBuffer.length > 0) {
            frame = this.rewindBuffer.pop();
        }

        this.position.copy(frame.position);
        this.velocity.copy(frame.velocity).multiplyScalar(0.7); // Tame velocity on exit
        this.heading = frame.heading;
        this.gear = frame.gear;
        this.rpm = frame.rpm;
        this.speedKmh = frame.speedKmh;
        this.distanceCovered = frame.distanceCovered;

        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.heading;
    }

    updateParticles(deltaSec) {
        // Sparks bottoming out at high speeds (> 270 km/h)
        const sparkPositions = this.sparkPoints.geometry.attributes.position.array;
        const generateSparks = this.speedKmh > 260 && Math.random() > 0.4;

        for (let i = 0; i < this.sparks.length; i++) {
            const s = this.sparks[i];
            if (s.life <= 0) {
                if (generateSparks && Math.random() < 0.25) {
                    s.life = 0.2 + Math.random() * 0.2;
                    // Spawn at rear floor
                    const floorBack = this.position.clone().add(
                        new THREE.Vector3(-0.2 + Math.random() * 0.4, 0.04, -1.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading)
                    );
                    s.x = floorBack.x;
                    s.y = floorBack.y;
                    s.z = floorBack.z;
                    s.vx = (Math.random() - 0.5) * 6 - Math.sin(this.heading) * 12;
                    s.vy = 0.5 + Math.random() * 2.0;
                    s.vz = (Math.random() - 0.5) * 6 - Math.cos(this.heading) * 12;
                } else {
                    s.y = -100;
                }
            } else {
                s.life -= deltaSec;
                s.x += s.vx * deltaSec;
                s.y += s.vy * deltaSec;
                s.z += s.vz * deltaSec;
                s.vy -= 9.8 * deltaSec; // Gravity
            }

            sparkPositions[i * 3] = s.x;
            sparkPositions[i * 3 + 1] = s.y;
            sparkPositions[i * 3 + 2] = s.z;
        }
        this.sparkPoints.geometry.attributes.position.needsUpdate = true;

        // Tire Smoke under heavy braking or drift slip
        const smokePositions = this.smokePoints.geometry.attributes.position.array;
        const makeSmoke = (this.brake > 0.7 && this.speedKmh > 50) || (this.tireSlip > 0.35);

        for (let i = 0; i < this.smokeParticles.length; i++) {
            const p = this.smokeParticles[i];
            if (p.life <= 0) {
                if (makeSmoke && Math.random() < 0.2) {
                    p.life = 0.4 + Math.random() * 0.3;
                    const tireOffset = (Math.random() > 0.5 ? -1 : 1);
                    const spawnPos = this.position.clone().add(
                        new THREE.Vector3(tireOffset * 0.9, 0.1, -1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.heading)
                    );
                    p.x = spawnPos.x;
                    p.y = spawnPos.y;
                    p.z = spawnPos.z;
                    p.vx = (Math.random() - 0.5) * 2;
                    p.vy = 1.0 + Math.random() * 1.5;
                    p.vz = (Math.random() - 0.5) * 2;
                } else {
                    p.y = -100;
                }
            } else {
                p.life -= deltaSec;
                p.x += p.vx * deltaSec;
                p.y += p.vy * deltaSec;
                p.z += p.vz * deltaSec;
            }

            smokePositions[i * 3] = p.x;
            smokePositions[i * 3 + 1] = p.y;
            smokePositions[i * 3 + 2] = p.z;
        }
        this.smokePoints.geometry.attributes.position.needsUpdate = true;
    }

    resetToTrack(track) {
        if (!track) return;
        const nearest = track.getNearestSample(this.position);
        this.position.copy(nearest.sample.point);
        this.position.y = 0.45;
        this.velocity.set(0, 0, 0);
        this.heading = Math.atan2(nearest.sample.tangent.x, nearest.sample.tangent.z);
        this.speedKmh = 0;
        this.gear = 1;
        this.rpm = 1500;
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.heading;
    }
}

window.F1Car = F1Car;

