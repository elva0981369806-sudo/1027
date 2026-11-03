/**
 * F1 Racing Simulator - Main Game Controller
 * Manages Three.js rendering, camera viewpoints, input listeners, HUD updates,
 * steering wheel rotation, pedal mechanics, and minimap rendering.
 */
class F1Game {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Game Systems
        this.audio = null;
        this.track = null;
        this.playerCar = null;
        this.aiManager = null;

        // Game State: 'MENU', 'COUNTDOWN', 'RACING', 'PAUSED'
        this.gameState = 'MENU';
        this.countdownTimer = null;
        this.raceStartTime = 0;

        // Camera Modes: 'chase', 'tcam', 'cockpit'
        this.cameraMode = 'chase';
        this.cameraOffsets = {
            chase: { pos: new THREE.Vector3(0, 2.5, -6.8), lookAt: new THREE.Vector3(0, 0.8, 4.0) },
            tcam: { pos: new THREE.Vector3(0, 1.25, -0.65), lookAt: new THREE.Vector3(0, 0.9, 10.0) },
            cockpit: { pos: new THREE.Vector3(0, 0.68, 0.1), lookAt: new THREE.Vector3(0, 0.65, 8.0) }
        };

        // Input States
        this.keys = {
            up: false,
            down: false,
            left: false,
            right: false,
            space: false,
            shift: false,
            rewind: false
        };

        // Mouse Steering State
        this.isWheelDragging = false;
        this.wheelAngle = 0; // Degrees (-120 to +120)
        this.wheelDragStartX = 0;

        // Pedal Mouse States
        this.isGasHeld = false;
        this.isBrakeHeld = false;

        // Timing
        this.clock = new THREE.Clock();

        // DOM Elements Cached
        this.dom = {
            wheelWrapper: document.getElementById('steering-wheel'),
            pedalGas: document.getElementById('pedal-gas'),
            pedalBrake: document.getElementById('pedal-brake'),
            gasMeter: document.getElementById('gas-meter-fill'),
            brakeMeter: document.getElementById('brake-meter-fill'),
            lcdSpeed: document.getElementById('lcd-speed'),
            lcdGear: document.getElementById('lcd-gear'),
            lcdDelta: document.getElementById('lcd-delta'),
            lcdDrs: document.getElementById('lcd-drs-txt'),
            drsBadge: document.getElementById('hud-drs-badge'),
            ersVal: document.getElementById('ers-val'),
            ersBar: document.getElementById('ers-bar-fill'),
            lapCounter: document.getElementById('lap-counter'),
            currentLapTime: document.getElementById('current-lap-time'),
            bestLapTime: document.getElementById('best-lap-time'),
            minimapCanvas: document.getElementById('minimap-canvas'),
            minimapCtx: document.getElementById('minimap-canvas').getContext('2d'),
            speedVignette: document.getElementById('speed-vignette'),
            rewindOverlay: document.getElementById('rewind-overlay'),
            welcomeModal: document.getElementById('welcome-modal'),
            pauseModal: document.getElementById('pause-modal'),
            startLightsOverlay: document.getElementById('start-lights-overlay'),
            startStatusText: document.getElementById('start-status-text'),
            btnPause: document.getElementById('btn-pause'),
            btnResume: document.getElementById('btn-resume-race'),
            btnRestart: document.getElementById('btn-restart-race'),
            btnQuit: document.getElementById('btn-quit-race'),
            lampCols: [
                [document.getElementById('lamp-1-top'), document.getElementById('lamp-1-bot')],
                [document.getElementById('lamp-2-top'), document.getElementById('lamp-2-bot')],
                [document.getElementById('lamp-3-top'), document.getElementById('lamp-3-bot')],
                [document.getElementById('lamp-4-top'), document.getElementById('lamp-4-bot')],
                [document.getElementById('lamp-5-top'), document.getElementById('lamp-5-bot')]
            ],
            leds: Array.from({ length: 15 }, (_, i) => document.getElementById(`led-${i + 1}`))
        };

        this.initThree();
        this.initWorld();
        this.bindEvents();
        this.setupAudio();

        // Start render loop
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initThree() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.scene.fog = new THREE.FogExp2(0xcfe2f3, 0.0018);

        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1200);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Ambient & Sunlight
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.1);
        sunLight.position.set(150, 250, 100);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far = 600;
        sunLight.shadow.camera.left = -120;
        sunLight.shadow.camera.right = 120;
        sunLight.shadow.camera.top = 120;
        sunLight.shadow.camera.bottom = -120;
        this.scene.add(sunLight);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initWorld() {
        // Track
        this.track = new F1Track(this.scene);

        // Player F1 Car (Scuderia Red)
        this.playerCar = new F1Car(this.scene, 0xd92027, true);

        // AI Rivals (Red Bull, Mercedes, McLaren, Aston Martin)
        this.aiManager = new F1AIManager(this.scene, this.track);

        // Place all cars in FIA Starting Grid formation
        this.resetGridPositions();
    }

    setupAudio() {
        this.audio = new F1AudioEngine();
        window.gameAudio = this.audio;
    }

    bindEvents() {
        // Keyboard Controls
        window.addEventListener('keydown', (e) => {
            if (this.audio && !this.audio.isInitialized) {
                this.audio.init();
            }

            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.up = true;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.down = true;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = true;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = true;
                    break;
                case 'Space':
                    this.keys.space = true;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.shift = true;
                    break;
                case 'KeyR':
                    this.keys.rewind = true;
                    this.playerCar.startRewind();
                    this.dom.rewindOverlay.classList.add('active');
                    break;
                case 'KeyC':
                    this.cycleCamera();
                    break;
                case 'KeyM':
                    this.toggleSound();
                    break;
                case 'Escape':
                case 'KeyP':
                    this.togglePause();
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'KeyW':
                case 'ArrowUp':
                    this.keys.up = false;
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    this.keys.down = false;
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    this.keys.left = false;
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    this.keys.right = false;
                    break;
                case 'Space':
                    this.keys.space = false;
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.keys.shift = false;
                    break;
                case 'KeyR':
                    this.keys.rewind = false;
                    this.playerCar.stopRewind();
                    this.dom.rewindOverlay.classList.remove('active');
                    break;
            }
        });

        // 1. Interactive Steering Wheel Mouse/Touch Dragging
        const startWheelDrag = (clientX) => {
            this.isWheelDragging = true;
            this.wheelDragStartX = clientX;
            if (this.audio && !this.audio.isInitialized) this.audio.init();
        };

        const moveWheelDrag = (clientX) => {
            if (!this.isWheelDragging) return;
            const deltaX = clientX - this.wheelDragStartX;
            this.wheelDragStartX = clientX;
            this.wheelAngle += deltaX * 0.9;
            this.wheelAngle = Math.max(-120, Math.min(120, this.wheelAngle));
        };

        const stopWheelDrag = () => {
            this.isWheelDragging = false;
        };

        this.dom.wheelWrapper.addEventListener('mousedown', (e) => startWheelDrag(e.clientX));
        window.addEventListener('mousemove', (e) => moveWheelDrag(e.clientX));
        window.addEventListener('mouseup', stopWheelDrag);

        this.dom.wheelWrapper.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) startWheelDrag(e.touches[0].clientX);
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) moveWheelDrag(e.touches[0].clientX);
        }, { passive: true });
        window.addEventListener('touchend', stopWheelDrag);

        // 2. Interactive Gas & Brake Pedals (Mouse & Touch Click-and-Hold)
        const setupPedal = (elem, setFn, isActiveClass) => {
            const press = (e) => {
                e.preventDefault();
                setFn(true);
                elem.classList.add('active');
                if (this.audio && !this.audio.isInitialized) this.audio.init();
            };
            const release = (e) => {
                setFn(false);
                elem.classList.remove('active');
            };

            elem.addEventListener('mousedown', press);
            window.addEventListener('mouseup', release);
            elem.addEventListener('touchstart', press, { passive: false });
            window.addEventListener('touchend', release);
        };

        setupPedal(this.dom.pedalGas, (v) => { this.isGasHeld = v; });
        setupPedal(this.dom.pedalBrake, (v) => { this.isBrakeHeld = v; });

        // 3. Assist Preset Buttons
        const setAssistPreset = (level) => {
            ['rookie', 'sport', 'pro'].forEach(p => {
                document.getElementById(`btn-assist-${p}`).classList.remove('active');
            });
            document.getElementById(`btn-assist-${level}`).classList.add('active');

            if (level === 'rookie') {
                // 新手全輔助：循跡防滑滿格 + 彎道超速輔助減速 + ABS
                this.playerCar.assists.tcsLevel = 1.0;
                this.playerCar.assists.absEnabled = true;
                this.playerCar.assists.stabilityAssist = 0.85;
                this.playerCar.assists.cornerBrakeAssist = 0.6;
                this.aiManager.setDifficulty(0.85);
            } else if (level === 'sport') {
                // 業餘半輔助：微甩尾 + 手動煞車
                this.playerCar.assists.tcsLevel = 0.45;
                this.playerCar.assists.absEnabled = true;
                this.playerCar.assists.stabilityAssist = 0.4;
                this.playerCar.assists.cornerBrakeAssist = 0.0;
                this.aiManager.setDifficulty(0.93);
            } else if (level === 'pro') {
                // 專家模式：完全關閉輔助
                this.playerCar.assists.tcsLevel = 0.0;
                this.playerCar.assists.absEnabled = false;
                this.playerCar.assists.stabilityAssist = 0.0;
                this.playerCar.assists.cornerBrakeAssist = 0.0;
                this.aiManager.setDifficulty(1.02);
            }
        };

        document.getElementById('btn-assist-rookie').addEventListener('click', () => setAssistPreset('rookie'));
        document.getElementById('btn-assist-sport').addEventListener('click', () => setAssistPreset('sport'));
        document.getElementById('btn-assist-pro').addEventListener('click', () => setAssistPreset('pro'));

        // 4. Action Buttons (Rewind, Camera, Sound, Modal)
        const btnRewind = document.getElementById('btn-rewind');
        const startRewind = () => {
            this.playerCar.startRewind();
            this.dom.rewindOverlay.classList.add('active');
        };
        const endRewind = () => {
            this.playerCar.stopRewind();
            this.dom.rewindOverlay.classList.remove('active');
        };
        btnRewind.addEventListener('mousedown', startRewind);
        window.addEventListener('mouseup', endRewind);
        btnRewind.addEventListener('touchstart', startRewind, { passive: true });
        window.addEventListener('touchend', endRewind);

        document.getElementById('btn-camera').addEventListener('click', () => this.cycleCamera());
        document.getElementById('btn-sound').addEventListener('click', () => this.toggleSound());
        document.getElementById('btn-help').addEventListener('click', () => {
            this.dom.welcomeModal.style.display = 'flex';
        });

        // Pause Menu Listeners
        if (this.dom.btnPause) {
            this.dom.btnPause.addEventListener('click', () => this.togglePause());
        }
        if (this.dom.btnResume) {
            this.dom.btnResume.addEventListener('click', () => this.resumeRace());
        }
        if (this.dom.btnRestart) {
            this.dom.btnRestart.addEventListener('click', () => this.restartRace());
        }
        if (this.dom.btnQuit) {
            this.dom.btnQuit.addEventListener('click', () => this.quitToMenu());
        }

        document.getElementById('btn-start-race').addEventListener('click', () => {
            this.dom.welcomeModal.style.display = 'none';
            if (this.audio) this.audio.init();
            this.startRaceCountdown();
        });
    }

    startRaceCountdown() {
        if (this.countdownTimer) clearTimeout(this.countdownTimer);

        // Reset Cars to Starting Grid
        this.resetGridPositions();

        this.gameState = 'COUNTDOWN';
        const overlay = this.dom.startLightsOverlay;
        const banner = this.dom.startStatusText;
        const lampCols = this.dom.lampCols;

        overlay.classList.add('active');
        banner.className = 'start-status-banner';
        banner.textContent = '起跑準備中... (踩油門拉高轉速！)';

        // Clear all lamps
        lampCols.forEach(col => col.forEach(lamp => lamp.classList.remove('red-on')));
        if (this.track) this.track.setStartLights(false);

        // Sequence: 5 Red Lights turn ON one by one (1s intervals)
        const lightTimes = [1000, 2000, 3000, 4000, 5000];

        lightTimes.forEach((delay, idx) => {
            setTimeout(() => {
                if (this.gameState !== 'COUNTDOWN') return;
                // Turn on lamp column idx
                lampCols[idx].forEach(lamp => lamp.classList.add('red-on'));
                if (this.audio) this.audio.playCountdownBeep();
                banner.textContent = `五盞紅燈倒數 [${idx + 1}/5]... 準備好！`;
            }, delay);
        });

        // At 5000ms: All 5 Red lights are lit!
        setTimeout(() => {
            if (this.gameState !== 'COUNTDOWN') return;
            banner.textContent = '五盞紅燈已亮起... 等待熄燈衝刺！';

            // Random delay between 1.2s and 2.4s (FIA Official Start Regulation)
            const randomHold = 1200 + Math.random() * 1200;

            this.countdownTimer = setTimeout(() => {
                if (this.gameState !== 'COUNTDOWN') return;

                // LIGHTS OUT AND AWAY WE GO!
                lampCols.forEach(col => col.forEach(lamp => lamp.classList.remove('red-on')));
                if (this.track) this.track.setStartLights(true);

                banner.className = 'start-status-banner go';
                banner.textContent = '🟢 熄燈起跑！ GO! GO! GO!';
                if (this.audio) this.audio.playGoBeep();

                // Unlock controls and start race!
                this.gameState = 'RACING';
                this.playerCar.lapStartTime = performance.now();

                // Hide overlay after 1.8 seconds
                setTimeout(() => {
                    if (this.gameState === 'RACING') {
                        overlay.classList.remove('active');
                        banner.className = 'start-status-banner';
                    }
                }, 1800);
            }, randomHold);
        }, 5000);
    }

    resetGridPositions() {
        // FIA F1 Staggered Starting Grid Formations on the Main Straight
        // P1 (Slot 1, Right): VER (Red Bull Racing) - Clearly visible right ahead!
        // P2 (Slot 2, Left):  YOU (Scuderia Ferrari) - Front Row!
        // P3 (Slot 3, Right): HAM (Mercedes-AMG)
        // P4 (Slot 4, Left):  NOR (McLaren)
        // P5 (Slot 5, Right): ALO (Aston Martin)

        // Player at P2 (Front row, Slot 2)
        const playerZ = 36.0;
        const playerX = -2.4;
        this.playerCar.position.set(playerX, 0.45, playerZ);
        this.playerCar.velocity.set(0, 0, 0);
        this.playerCar.heading = 0; // Pointing forward (+Z) down straight
        this.playerCar.speedKmh = 0;
        this.playerCar.gear = 1;
        this.playerCar.rpm = 2500;
        this.playerCar.distanceCovered = playerZ;
        this.playerCar.currentLap = 1;
        this.playerCar.currentLapTime = 0;
        this.playerCar.mesh.position.copy(this.playerCar.position);
        this.playerCar.mesh.rotation.set(0, 0, 0);

        // AI Rivals placed on their respective grid slots
        if (this.aiManager) {
            const aiGridSlots = [
                { z: 46.0, x: 2.4 },  // P1 (Slot 1) - VER (Red Bull) right in front of player!
                { z: 26.0, x: 2.4 },  // P3 (Slot 3) - HAM (Mercedes) beside/behind player
                { z: 16.0, x: -2.4 }, // P4 (Slot 4) - NOR (McLaren)
                { z: 6.0, x: 2.4 }   // P5 (Slot 5) - ALO (Aston Martin)
            ];

            this.aiManager.aiCars.forEach((ai, idx) => {
                const slot = aiGridSlots[idx % aiGridSlots.length];
                ai.position.set(slot.x, 0.45, slot.z);
                ai.velocity.set(0, 0, 0);
                ai.heading = 0; // Pointing forward down straight
                ai.speedKmh = 0;
                ai.gear = 1;
                ai.rpm = 3200;
                ai.distanceCovered = slot.z;
                ai.lateralOffset = slot.x;
                ai.mesh.position.copy(ai.position);
                ai.mesh.rotation.set(0, 0, 0);
            });
        }
    }

    togglePause() {
        if (this.gameState === 'RACING') {
            this.gameState = 'PAUSED';
            this.dom.pauseModal.style.display = 'flex';
            if (this.audio) this.audio.pauseAudio();
        } else if (this.gameState === 'PAUSED') {
            this.resumeRace();
        }
    }

    resumeRace() {
        if (this.gameState !== 'PAUSED') return;
        this.gameState = 'RACING';
        this.dom.pauseModal.style.display = 'none';
        if (this.audio) this.audio.resumeAudio();
    }

    restartRace() {
        if (this.dom.pauseModal) this.dom.pauseModal.style.display = 'none';
        if (this.dom.welcomeModal) this.dom.welcomeModal.style.display = 'none';
        if (this.audio) this.audio.resumeAudio();
        this.startRaceCountdown();
    }

    quitToMenu() {
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        this.gameState = 'MENU';
        if (this.dom.pauseModal) this.dom.pauseModal.style.display = 'none';
        if (this.dom.startLightsOverlay) this.dom.startLightsOverlay.classList.remove('active');
        if (this.dom.welcomeModal) this.dom.welcomeModal.style.display = 'flex';
        if (this.audio) this.audio.pauseAudio();
        this.resetGridPositions();
    }

    cycleCamera() {
        const modes = ['chase', 'tcam', 'cockpit'];
        const nextIdx = (modes.indexOf(this.cameraMode) + 1) % modes.length;
        this.cameraMode = modes[nextIdx];
    }

    toggleSound() {
        if (!this.audio) return;
        if (!this.audio.isInitialized) {
            this.audio.init();
        }
        const isMuted = this.audio.toggleMute();
        document.getElementById('btn-sound').textContent = isMuted ? '🔇' : '🔊';
    }

    updateInputs(deltaSec) {
        // Calculate Throttle & Brake
        let throttle = 0;
        let brake = 0;

        if (this.keys.up || this.isGasHeld) throttle = 1.0;
        if (this.keys.down || this.isBrakeHeld) brake = 1.0;

        // Steering: Keyboard or Wheel Drag
        if (this.keys.left) {
            this.wheelAngle = Math.max(-120, this.wheelAngle - 260 * deltaSec);
        } else if (this.keys.right) {
            this.wheelAngle = Math.min(120, this.wheelAngle + 260 * deltaSec);
        } else if (!this.isWheelDragging) {
            // Auto-Centering (智慧平滑回正)
            this.wheelAngle *= Math.max(0, 1.0 - 9.0 * deltaSec);
        }

        const steerInput = this.wheelAngle / 120; // -1.0 to 1.0

        // Visual Steering Wheel Update
        this.dom.wheelWrapper.style.transform = `rotate(${this.wheelAngle}deg)`;

        // Visual Pedals Press Animation & Meters
        if (throttle > 0) {
            this.dom.pedalGas.classList.add('active');
        } else {
            this.dom.pedalGas.classList.remove('active');
        }
        this.dom.gasMeter.style.width = `${Math.round(throttle * 100)}%`;

        if (brake > 0) {
            this.dom.pedalBrake.classList.add('active');
        } else {
            this.dom.pedalBrake.classList.remove('active');
        }
        this.dom.brakeMeter.style.width = `${Math.round(brake * 100)}%`;

        // DRS: Zone check
        const trackInfo = this.track.getNearestSample(this.playerCar.position);
        const inDrsZone = trackInfo.isDrsZone;
        const wantDrs = this.keys.space;
        const drsActive = wantDrs && inDrsZone;

        if (inDrsZone && !this.wasInDrsZone) {
            if (this.audio) this.audio.playDrsBeep();
        }
        this.wasInDrsZone = inDrsZone;

        // ERS Boost
        const ersActive = this.keys.shift;

        this.playerCar.setInputs(throttle, brake, steerInput, drsActive, ersActive);
    }

    updateCamera(deltaSec) {
        const car = this.playerCar;
        let cfg = this.cameraOffsets[this.cameraMode];

        // During Starting Countdown or Menu, elevate chase cam for a cinematic grid view
        if ((this.gameState === 'COUNTDOWN' || this.gameState === 'MENU') && this.cameraMode === 'chase') {
            cfg = { pos: new THREE.Vector3(0.9, 3.4, -8.2), lookAt: new THREE.Vector3(1.2, 0.9, 14.0) };
        }

        // Offset relative to car's local heading
        const localOffset = cfg.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
        const targetCamPos = car.position.clone().add(localOffset);

        const lookAtLocal = cfg.lookAt.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
        const targetLookAt = car.position.clone().add(lookAtLocal);

        if (this.cameraMode === 'chase') {
            // Smooth chase camera interpolation for beginner ease of view
            this.camera.position.lerp(targetCamPos, Math.min(1.0, 10.0 * deltaSec));
            this.camera.lookAt(targetLookAt);
        } else {
            // Rigid cockpit / T-Cam view
            this.camera.position.copy(targetCamPos);
            this.camera.lookAt(targetLookAt);
        }
    }

    updateHUD() {
        const car = this.playerCar;

        // LCD Screen Updates
        this.dom.lcdSpeed.textContent = Math.round(car.speedKmh);
        this.dom.lcdGear.textContent = car.gear;

        const trackInfo = this.track.getNearestSample(car.position);

        // DRS Status UI
        if (trackInfo.isDrsZone) {
            if (car.drsActive) {
                this.dom.drsBadge.className = 'status-badge drs-badge active';
                this.dom.drsBadge.textContent = 'DRS OPEN [SPACE]';
                this.dom.lcdDrs.textContent = 'ACTIVE';
                this.dom.lcdDrs.className = 'lcd-drs-status active';
            } else {
                this.dom.drsBadge.className = 'status-badge drs-badge ready';
                this.dom.drsBadge.textContent = 'DRS AVAILABLE [SPACE]';
                this.dom.lcdDrs.textContent = 'READY';
                this.dom.lcdDrs.className = 'lcd-drs-status active';
            }
        } else {
            this.dom.drsBadge.className = 'status-badge drs-badge';
            this.dom.drsBadge.textContent = 'DRS CLOSED';
            this.dom.lcdDrs.textContent = 'OFF';
            this.dom.lcdDrs.className = 'lcd-drs-status';
        }

        // ERS Battery Bar
        this.dom.ersVal.textContent = `${Math.round(car.ersBattery)}%`;
        this.dom.ersBar.style.width = `${Math.round(car.ersBattery)}%`;

        // Shift Lights (15 LEDs)
        // 5 Green (50-70% RPM), 5 Red (70-90% RPM), 5 Blue (90-100% RPM)
        const rpmRatio = (car.rpm - car.idleRpm) / (car.maxRpm - car.idleRpm);
        const activeLedCount = Math.floor(rpmRatio * 16);

        this.dom.leds.forEach((led, idx) => {
            if (idx < activeLedCount) {
                led.classList.add('on');
            } else {
                led.classList.remove('on');
            }
        });

        // Flash blue LEDs at rev limiter
        if (rpmRatio > 0.94) {
            const flash = (performance.now() % 160) < 80;
            for (let i = 10; i < 15; i++) {
                if (flash) this.dom.leds[i].classList.add('on');
                else this.dom.leds[i].classList.remove('on');
            }
        }

        // Lap Times format: M:SS.mmm
        const formatTime = (sec) => {
            if (!sec) return '--:--.---';
            const m = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            const ms = Math.floor((sec % 1) * 1000);
            return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
        };

        this.dom.lapCounter.textContent = `LAP ${car.currentLap} / 5`;
        this.dom.currentLapTime.textContent = formatTime(car.currentLapTime);
        if (car.bestLapTime) {
            this.dom.bestLapTime.textContent = formatTime(car.bestLapTime);
        }

        // Speed vignette
        const vignetteOpacity = Math.min(0.85, Math.max(0.2, (car.speedKmh - 160) / 200));
        this.dom.speedVignette.style.opacity = vignetteOpacity.toString();
    }

    drawMinimap() {
        const ctx = this.dom.minimapCtx;
        const w = 170;
        const h = 170;
        ctx.clearRect(0, 0, w, h);

        const pts = this.track.minimapPoints;
        if (!pts || pts.length === 0) return;

        // Bounding box of circuit
        // x: -350 to 15, z: -160 to 420
        const minX = -370, maxX = 40;
        const minZ = -180, maxZ = 440;

        const toMapX = (x) => 12 + ((x - minX) / (maxX - minX)) * (w - 24);
        const toMapY = (z) => 12 + ((z - minZ) / (maxZ - minZ)) * (h - 24);

        // Draw circuit outline
        ctx.strokeStyle = '#444857';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach((p, i) => {
            const mx = toMapX(p.x);
            const my = toMapY(p.z);
            if (i === 0) ctx.moveTo(mx, my);
            else ctx.lineTo(mx, my);
        });
        ctx.closePath();
        ctx.stroke();

        // Finish line marker
        const f0 = pts[0];
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(toMapX(f0.x), toMapY(f0.z), 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw AI Opponents (Cyan/Yellow/Green dots)
        if (this.aiManager) {
            this.aiManager.aiCars.forEach(ai => {
                ctx.fillStyle = '#00d2be';
                ctx.beginPath();
                ctx.arc(toMapX(ai.position.x), toMapY(ai.position.z), 3.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        // Draw Player (Glowing Red dot)
        ctx.fillStyle = '#ff2222';
        ctx.shadowColor = '#ff2222';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(toMapX(this.playerCar.position.x), toMapY(this.playerCar.position.z), 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset
    }

    animate() {
        requestAnimationFrame(this.animate);

        const deltaSec = this.clock.getDelta();

        if (this.gameState === 'PAUSED') {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // 1. Process Inputs (Steering wheel and pedals)
        this.updateInputs(deltaSec);

        if (this.gameState === 'COUNTDOWN' || this.gameState === 'MENU') {
            const now = performance.now();
            const blink = Math.floor(now / 130) % 2 === 0;

            // Allow throttle revving on the grid (staging), exciting engine sounds!
            this.playerCar.rpm = 2500 + this.playerCar.throttle * 8500;
            this.playerCar.velocity.set(0, 0, 0);
            this.playerCar.speedKmh = 0;

            // Player rear light flashing on the grid
            if (this.playerCar.rearRainLight) {
                this.playerCar.rearRainLight.material.color.setHex(blink ? 0xff0000 : 0x220000);
            }

            // Animate all AI cars on the starting grid waiting for the lights!
            if (this.aiManager) {
                this.aiManager.aiCars.forEach((ai, idx) => {
                    ai.velocity.set(0, 0, 0);
                    ai.speedKmh = 0;
                    ai.rpm = 3200 + Math.sin(now * 0.005 + idx * 2) * 1400;

                    // AI rear safety LEDs blinking rapidly
                    if (ai.rearRainLight) {
                        ai.rearRainLight.material.color.setHex(blink ? 0xff0000 : 0x220000);
                    }

                    // Subtle engine idle rumble vibration
                    ai.mesh.position.y = 0.45 + Math.sin(now * 0.04 + idx) * 0.003;
                });
            }

            if (this.audio) {
                this.audio.update(
                    this.playerCar.rpm,
                    1,
                    this.playerCar.throttle,
                    0,
                    0,
                    false
                );
            }
            this.updateHUD();
            this.drawMinimap();
            this.updateCamera(deltaSec);
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // 2. Update Player Car Physics & Assists
        this.playerCar.update(deltaSec, this.track);

        // 3. Update AI Opponents
        if (this.aiManager) {
            this.aiManager.update(deltaSec, this.playerCar);
        }

        // 4. Update Dynamic 3D Racing Line on track
        if (this.track) {
            this.track.updateDynamicRacingLine(this.playerCar.speedKmh, this.playerCar.distanceCovered);
        }

        // 5. Update Camera
        this.updateCamera(deltaSec);

        // 6. Update Audio
        if (this.audio) {
            this.audio.update(
                this.playerCar.rpm,
                this.playerCar.gear,
                this.playerCar.throttle,
                this.playerCar.speedKmh,
                this.playerCar.tireSlip,
                this.playerCar.onKerb
            );
        }

        // 7. Update HUD Telemetry & Minimap
        this.updateHUD();
        this.drawMinimap();

        // 8. Render Three.js Scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Boot game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.game = new F1Game();
});

