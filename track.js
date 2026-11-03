/**
 * F1 Racing Simulator - Track & Environment Generator
 * Generates Grand Prix circuit, kerbs, barriers, dynamic racing lines, grandstands, and checkpoints.
 */
class F1Track {
    constructor(scene) {
        this.scene = scene;
        this.trackWidth = 14;
        this.spline = null;
        this.curvePoints = [];
        this.sampleCount = 600;
        this.trackSamples = []; // { point, tangent, normal, binormal, distance, isDrsZone, optimalSpeed }
        this.totalLength = 0;

        // Visual elements
        this.trackMesh = null;
        this.racingLineMesh = null;
        this.racingLineColors = null;
        this.minimapPoints = [];

        // Checkpoints & Sectors
        this.sectors = [
            { id: 1, distRatio: 0.33, name: "Sector 1" },
            { id: 2, distRatio: 0.68, name: "Sector 2" },
            { id: 3, distRatio: 1.0, name: "Sector 3" }
        ];

        this.initTrack();
    }

    initTrack() {
        // Define Circuit Layout (Grand Prix inspired: Straight -> Chicane -> Sweeper -> Hairpin -> Esses -> Final Corner)
        const controlPoints = [
            new THREE.Vector3(0, 0, 0),         // Start / Finish Straight (0)
            new THREE.Vector3(0, 0, 180),       // Main Straight (DRS 1)
            new THREE.Vector3(15, 0, 240),      // Turn 1 entry (Chicane right)
            new THREE.Vector3(-15, 0, 290),     // Turn 2 exit (Chicane left)
            new THREE.Vector3(-50, 0, 360),     // Curva Grande entry
            new THREE.Vector3(-140, 0, 420),    // Curva Grande mid
            new THREE.Vector3(-250, 0, 410),    // Curva Grande exit
            new THREE.Vector3(-330, 0, 320),    // Back Straight start (DRS 2)
            new THREE.Vector3(-350, 0, 150),    // Back Straight mid
            new THREE.Vector3(-350, 0, -30),    // Hairpin braking zone
            new THREE.Vector3(-310, 0, -100),   // Hairpin apex
            new THREE.Vector3(-240, 0, -80),    // Hairpin exit
            new THREE.Vector3(-190, 0, -10),    // S-curves 1
            new THREE.Vector3(-130, 0, -60),    // S-curves 2
            new THREE.Vector3(-90, 0, -140),    // High speed section
            new THREE.Vector3(-30, 0, -160),    // Final turn approach
            new THREE.Vector3(0, 0, -90)        // Parabolica onto pit straight
        ];

        this.spline = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.25);
        this.totalLength = this.spline.getLength();

        // Sample points along the spline
        for (let i = 0; i <= this.sampleCount; i++) {
            const u = i / this.sampleCount;
            const pt = this.spline.getPointAt(u);
            const tan = this.spline.getTangentAt(u).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const norm = new THREE.Vector3().crossVectors(tan, up).normalize(); // Right vector

            // Determine if DRS zone (Main straight u: 0.03 ~ 0.22, Back straight u: 0.44 ~ 0.58)
            const isDrs = (u >= 0.03 && u <= 0.22) || (u >= 0.44 && u <= 0.58);

            // Compute local curvature for optimal speed calculation
            const uNext = ((i + 2) % this.sampleCount) / this.sampleCount;
            const ptNext = this.spline.getPointAt(uNext);
            const uPrev = ((i - 2 + this.sampleCount) % this.sampleCount) / this.sampleCount;
            const ptPrev = this.spline.getPointAt(uPrev);
            const v1 = new THREE.Vector3().subVectors(pt, ptPrev).normalize();
            const v2 = new THREE.Vector3().subVectors(ptNext, pt).normalize();
            const angle = v1.angleTo(v2); // Radians of turn sharpness

            // Target optimal speed (km/h) for dynamic racing line
            let targetSpeed = 330;
            if (angle > 0.12) targetSpeed = 110; // Sharp hairpin / chicane
            else if (angle > 0.07) targetSpeed = 160; // Medium corner
            else if (angle > 0.04) targetSpeed = 230; // Fast curve

            this.trackSamples.push({
                u,
                point: pt,
                tangent: tan,
                normal: norm,
                distance: u * this.totalLength,
                isDrsZone: isDrs,
                targetSpeed: targetSpeed
            });

            this.minimapPoints.push({ x: pt.x, z: pt.z });
        }

        this.buildTrackMesh();
        this.buildGridSlots();
        this.buildKerbs();
        this.buildBarriers();
        this.buildStartGantry();
        this.buildDynamicRacingLine();
        this.buildEnvironment();
    }

    buildTrackMesh() {
        const segs = this.sampleCount;
        const geom = new THREE.BufferGeometry();
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let i = 0; i <= segs; i++) {
            const sample = this.trackSamples[i % segs];
            const p = sample.point;
            const n = sample.normal;
            const halfW = this.trackWidth / 2;

            // Left edge
            positions.push(p.x - n.x * halfW, p.y + 0.02, p.z - n.z * halfW);
            uvs.push(0, i * 0.5);

            // Right edge
            positions.push(p.x + n.x * halfW, p.y + 0.02, p.z + n.z * halfW);
            uvs.push(1, i * 0.5);

            if (i < segs) {
                const row1 = i * 2;
                const row2 = (i + 1) * 2;
                indices.push(row1, row1 + 1, row2);
                indices.push(row1 + 1, row2 + 1, row2);
            }
        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        // Asphalt material with track lines
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#22252a'; // Dark Grand Prix tarmac
        ctx.fillRect(0, 0, 512, 512);

        // Asphalt grain
        for (let j = 0; j < 3000; j++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#2b2e35' : '#191b1f';
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
        }

        // White boundary edge lines
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(15, 0, 10, 512);
        ctx.fillRect(512 - 25, 0, 10, 512);

        // Center dashes
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let y = 0; y < 512; y += 64) {
            ctx.fillRect(252, y, 8, 32);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1, 150);

        const mat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.85,
            metalness: 0.1
        });

        this.trackMesh = new THREE.Mesh(geom, mat);
        this.trackMesh.receiveShadow = true;
        this.scene.add(this.trackMesh);

        // Finish Line Checkered Strip at u=0
        const finishGeom = new THREE.PlaneGeometry(this.trackWidth, 4);
        const fCanvas = document.createElement('canvas');
        fCanvas.width = 128; fCanvas.height = 32;
        const fCtx = fCanvas.getContext('2d');
        for (let x = 0; x < 128; x += 16) {
            for (let y = 0; y < 32; y += 16) {
                fCtx.fillStyle = ((x / 16 + y / 16) % 2 === 0) ? '#ffffff' : '#111111';
                fCtx.fillRect(x, y, 16, 16);
            }
        }
        const fTex = new THREE.CanvasTexture(fCanvas);
        const finishMat = new THREE.MeshBasicMaterial({ map: fTex, side: THREE.DoubleSide });
        const finishMesh = new THREE.Mesh(finishGeom, finishMat);
        finishMesh.rotation.x = -Math.PI / 2;
        finishMesh.position.set(0, 0.05, 0);
        this.scene.add(finishMesh);
    }

    buildGridSlots() {
        // FIA F1 Staggered Starting Grid Boxes (P1 ~ P5)
        const slots = [
            { pos: 1, z: 46, lat: 2.4 },
            { pos: 2, z: 36, lat: -2.4 },
            { pos: 3, z: 26, lat: 2.4 },
            { pos: 4, z: 16, lat: -2.4 },
            { pos: 5, z: 6,  lat: 2.4 }
        ];

        const slotGeo = new THREE.PlaneGeometry(2.6, 5.2);

        slots.forEach(s => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 256;
            const ctx = canvas.getContext('2d');

            // Transparent background
            ctx.clearRect(0, 0, 128, 256);

            // White box outline
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 8;
            ctx.strokeRect(6, 6, 116, 244);

            // Yellow stop line at top/front of grid slot
            ctx.fillStyle = '#ffea00';
            ctx.fillRect(6, 6, 116, 18);

            // Slot number in center
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.font = 'bold 80px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.pos.toString(), 64, 135);

            const tex = new THREE.CanvasTexture(canvas);
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                transparent: true,
                opacity: 0.88,
                depthWrite: false
            });

            const mesh = new THREE.Mesh(slotGeo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(s.lat, 0.05, s.z);
            this.scene.add(mesh);
        });
    }

    buildKerbs() {
        // Red and White FIA Curb strips
        const kerbWidth = 1.4;
        const segs = this.sampleCount;
        const kerbGeom = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const indices = [];

        const red = [0.9, 0.1, 0.1];
        const white = [0.95, 0.95, 0.95];

        let vCount = 0;
        for (let i = 0; i < segs; i++) {
            const s1 = this.trackSamples[i];
            const s2 = this.trackSamples[(i + 1) % segs];

            // Alternate every 3 segments
            const col = (Math.floor(i / 3) % 2 === 0) ? red : white;

            // Left Kerb
            const pL1_in = new THREE.Vector3().addVectors(s1.point, s1.normal.clone().multiplyScalar(-this.trackWidth / 2));
            const pL1_out = new THREE.Vector3().addVectors(s1.point, s1.normal.clone().multiplyScalar(-this.trackWidth / 2 - kerbWidth));
            const pL2_in = new THREE.Vector3().addVectors(s2.point, s2.normal.clone().multiplyScalar(-this.trackWidth / 2));
            const pL2_out = new THREE.Vector3().addVectors(s2.point, s2.normal.clone().multiplyScalar(-this.trackWidth / 2 - kerbWidth));

            // Right Kerb
            const pR1_in = new THREE.Vector3().addVectors(s1.point, s1.normal.clone().multiplyScalar(this.trackWidth / 2));
            const pR1_out = new THREE.Vector3().addVectors(s1.point, s1.normal.clone().multiplyScalar(this.trackWidth / 2 + kerbWidth));
            const pR2_in = new THREE.Vector3().addVectors(s2.point, s2.normal.clone().multiplyScalar(this.trackWidth / 2));
            const pR2_out = new THREE.Vector3().addVectors(s2.point, s2.normal.clone().multiplyScalar(this.trackWidth / 2 + kerbWidth));

            // Slight elevation for kerbs (0.07m)
            [pL1_in, pL1_out, pL2_in, pL2_out, pR1_in, pR1_out, pR2_in, pR2_out].forEach(p => p.y += 0.05);

            // Add Left Quad
            positions.push(pL1_in.x, pL1_in.y, pL1_in.z, pL1_out.x, pL1_out.y, pL1_out.z,
                pL2_in.x, pL2_in.y, pL2_in.z, pL2_out.x, pL2_out.y, pL2_out.z);
            for (let c = 0; c < 4; c++) colors.push(...col);
            indices.push(vCount, vCount + 1, vCount + 2, vCount + 1, vCount + 3, vCount + 2);
            vCount += 4;

            // Add Right Quad
            positions.push(pR1_in.x, pR1_in.y, pR1_in.z, pR1_out.x, pR1_out.y, pR1_out.z,
                pR2_in.x, pR2_in.y, pR2_in.z, pR2_out.x, pR2_out.y, pR2_out.z);
            for (let c = 0; c < 4; c++) colors.push(...col);
            indices.push(vCount, vCount + 1, vCount + 2, vCount + 1, vCount + 3, vCount + 2);
            vCount += 4;
        }

        kerbGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        kerbGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        kerbGeom.setIndex(indices);
        kerbGeom.computeVertexNormals();

        const kerbMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.6,
            metalness: 0.1
        });
        const kerbMesh = new THREE.Mesh(kerbGeom, kerbMat);
        kerbMesh.receiveShadow = true;
        this.scene.add(kerbMesh);
    }

    buildBarriers() {
        // Armco guard rails & TecPro tire barriers along outer perimeter
        const barrierDist = this.trackWidth / 2 + 5.5;
        const segs = 180;
        const barrierGeom = new THREE.BoxGeometry(1.2, 1.8, 4.5);
        const barrierMat = new THREE.MeshStandardMaterial({ color: 0x1f3c88, roughness: 0.5 }); // Racing blue
        const instMesh = new THREE.InstancedMesh(barrierGeom, barrierMat, segs * 2);

        const dummy = new THREE.Object3D();
        let idx = 0;
        for (let i = 0; i < segs; i++) {
            const u = i / segs;
            const pt = this.spline.getPointAt(u);
            const tan = this.spline.getTangentAt(u).normalize();
            const norm = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

            // Left barrier
            dummy.position.copy(pt).addScaledVector(norm, -barrierDist);
            dummy.position.y = 0.9;
            dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
            dummy.updateMatrix();
            instMesh.setMatrixAt(idx++, dummy.matrix);

            // Right barrier
            dummy.position.copy(pt).addScaledVector(norm, barrierDist);
            dummy.position.y = 0.9;
            dummy.updateMatrix();
            instMesh.setMatrixAt(idx++, dummy.matrix);
        }
        instMesh.receiveShadow = true;
        instMesh.castShadow = true;
        this.scene.add(instMesh);
    }

    buildStartGantry() {
        // Start / Finish Gantry over track with F1 starting lights & Rolex clock banner
        const group = new THREE.Group();

        // Pillars
        const pillarGeo = new THREE.BoxGeometry(0.8, 9, 0.8);
        const pillarMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
        const pLeft = new THREE.Mesh(pillarGeo, pillarMat);
        pLeft.position.set(-this.trackWidth / 2 - 2, 4.5, 0);
        const pRight = new THREE.Mesh(pillarGeo, pillarMat);
        pRight.position.set(this.trackWidth / 2 + 2, 4.5, 0);

        // Top Truss
        const trussGeo = new THREE.BoxGeometry(this.trackWidth + 6, 1.6, 2.0);
        const trussMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 });
        const truss = new THREE.Mesh(trussGeo, trussMat);
        truss.position.set(0, 8.5, 0);

        // Start lights bar
        const lightsBoxGeo = new THREE.BoxGeometry(6, 1.0, 0.4);
        const lightsBoxMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        const lightsBox = new THREE.Mesh(lightsBoxGeo, lightsBoxMat);
        lightsBox.position.set(0, 7.8, -1.05);

        // 5 F1 Starting Lights
        this.startLightMeshes = [];
        for (let i = -2; i <= 2; i++) {
            const lightGeo = new THREE.CircleGeometry(0.3, 16);
            const lightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const lightMesh = new THREE.Mesh(lightGeo, lightMat);
            lightMesh.position.set(i * 1.1, 7.8, -1.26);
            lightMesh.rotation.y = Math.PI;
            group.add(lightMesh);
            this.startLightMeshes.push(lightMesh);
        }

        group.add(pLeft, pRight, truss, lightsBox);
        this.scene.add(group);

        // Turn off start lights initially (or ready state)
        this.setStartLights(false);
    }

    setStartLights(active) {
        if (!this.startLightMeshes) return;
        this.startLightMeshes.forEach(m => {
            m.material.color.setHex(active ? 0x00ff00 : 0x330000);
        });
    }

    buildDynamicRacingLine() {
        // Dynamic Glowing Racing Line Ribbon on track surface!
        // Green = Full throttle, Yellow = Coasting/turn-in, Red = Brake zone!
        const segs = this.sampleCount;
        const geom = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const indices = [];
        const lineWidth = 0.8;

        for (let i = 0; i <= segs; i++) {
            const sample = this.trackSamples[i % segs];
            const p = sample.point;

            // Ideal racing line hugs apex on corners
            let lateralOffset = 0;
            if (sample.targetSpeed < 140) {
                lateralOffset = -2.2; // Cut inside apex
            } else if (sample.targetSpeed < 200) {
                lateralOffset = 1.4;
            }

            const centerPt = p.clone().addScaledVector(sample.normal, lateralOffset);
            const pL = centerPt.clone().addScaledVector(sample.normal, -lineWidth / 2);
            const pR = centerPt.clone().addScaledVector(sample.normal, lineWidth / 2);

            positions.push(pL.x, 0.06, pL.z);
            positions.push(pR.x, 0.06, pR.z);

            // Default color: bright neon green
            colors.push(0.0, 1.0, 0.3);
            colors.push(0.0, 1.0, 0.3);

            if (i < segs) {
                const row1 = i * 2;
                const row2 = (i + 1) * 2;
                indices.push(row1, row1 + 1, row2);
                indices.push(row1 + 1, row2 + 1, row2);
            }
        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geom.setIndex(indices);

        const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.racingLineMesh = new THREE.Mesh(geom, mat);
        this.scene.add(this.racingLineMesh);
    }

    updateDynamicRacingLine(playerSpeedKmh, playerDist) {
        if (!this.racingLineMesh) return;
        const colorAttr = this.racingLineMesh.geometry.attributes.color;
        const colors = colorAttr.array;
        const segs = this.sampleCount;

        // Player's current index on spline
        const playerU = (playerDist % this.totalLength) / this.totalLength;
        const playerIdx = Math.floor(playerU * segs);

        // Highlight next 50 segments ahead of the player
        for (let i = 0; i <= segs; i++) {
            const sample = this.trackSamples[i % segs];
            const vIdx1 = (i * 2) * 3;
            const vIdx2 = (i * 2 + 1) * 3;

            // Target speed at this point
            const targetSpd = sample.targetSpeed;
            const speedDiff = playerSpeedKmh - targetSpd;

            // Calculate distance ahead
            let deltaIdx = (i - playerIdx + segs) % segs;

            let r = 0, g = 1.0, b = 0.3;
            if (deltaIdx < 45) {
                // Ahead of player: show dynamic braking warning
                if (speedDiff > 45) {
                    // Critical Braking Zone! Fiery Red
                    r = 1.0; g = 0.05; b = 0.05;
                } else if (speedDiff > 15) {
                    // Deceleration / Coast Zone! Neon Yellow
                    r = 1.0; g = 0.85; b = 0.0;
                } else {
                    // Safe / Accelerate Zone! Bright Green
                    r = 0.0; g = 1.0; b = 0.25;
                }
            } else {
                // Background racing line
                if (targetSpd < 160) {
                    r = 0.9; g = 0.4; b = 0.1;
                } else {
                    r = 0.0; g = 0.7; b = 0.35;
                }
            }

            colors[vIdx1] = r; colors[vIdx1 + 1] = g; colors[vIdx1 + 2] = b;
            colors[vIdx2] = r; colors[vIdx2 + 1] = g; colors[vIdx2 + 2] = b;
        }

        colorAttr.needsUpdate = true;
    }

    buildEnvironment() {
        // Ground plane (Grassland)
        const groundGeo = new THREE.PlaneGeometry(1600, 1600);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x1d4722, // Lush GP lawn green
            roughness: 0.95,
            metalness: 0.05
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Grandstands with cheering spectators
        this.buildGrandstands();

        // 3D Sponsor Boards (Pirelli, Rolex, Antigravity GP)
        this.buildSponsorBoards();

        // Distance braking boards (150m, 100m, 50m)
        this.buildBrakeDistanceBoards();

        // Surrounding trees and hills
        this.buildTrees();
    }

    buildGrandstands() {
        const standGeo = new THREE.BoxGeometry(40, 8, 12);
        const standMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0xd92027, roughness: 0.4 }); // Scuderia Red roof

        const locations = [
            { pos: new THREE.Vector3(-25, 4, 80), rotY: 0 },
            { pos: new THREE.Vector3(-25, 4, 140), rotY: 0 },
            { pos: new THREE.Vector3(-380, 4, 60), rotY: Math.PI / 2 },
            { pos: new THREE.Vector3(-270, 4, -130), rotY: -Math.PI / 4 }
        ];

        locations.forEach(loc => {
            const stand = new THREE.Mesh(standGeo, standMat);
            stand.position.copy(loc.pos);
            stand.rotation.y = loc.rotY;

            const roof = new THREE.Mesh(new THREE.BoxGeometry(42, 0.8, 14), roofMat);
            roof.position.set(0, 4.5, 0);
            stand.add(roof);

            this.scene.add(stand);
        });
    }

    buildSponsorBoards() {
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ff1801'; // F1 red
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FORMULA 1', 128, 32);
        const tex = new THREE.CanvasTexture(canvas);

        const boardGeo = new THREE.BoxGeometry(10, 2.2, 0.4);
        const boardMat = new THREE.MeshStandardMaterial({ map: tex });

        const boardPoints = [
            { u: 0.08, offset: 9.5 },
            { u: 0.16, offset: -9.5 },
            { u: 0.35, offset: 9.5 },
            { u: 0.52, offset: -9.5 },
            { u: 0.78, offset: 9.5 }
        ];

        boardPoints.forEach(bp => {
            const pt = this.spline.getPointAt(bp.u);
            const tan = this.spline.getTangentAt(bp.u).normalize();
            const norm = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

            const board = new THREE.Mesh(boardGeo, boardMat);
            board.position.copy(pt).addScaledVector(norm, bp.offset);
            board.position.y = 1.3;
            board.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
            this.scene.add(board);
        });
    }

    buildBrakeDistanceBoards() {
        // 150m, 100m, 50m boards before Turn 1 chicane & Hairpin
        const distances = ['150', '100', '50'];
        const markers = [
            { baseU: 0.19, gap: -0.015 },
            { baseU: 0.53, gap: -0.015 }
        ];

        markers.forEach(m => {
            distances.forEach((text, dIdx) => {
                const u = m.baseU + m.gap * (2 - dIdx);
                const pt = this.spline.getPointAt(u);
                const tan = this.spline.getTangentAt(u).normalize();
                const norm = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();

                const c = document.createElement('canvas');
                c.width = 128; c.height = 128;
                const cx = c.getContext('2d');
                cx.fillStyle = '#ffffff';
                cx.fillRect(0, 0, 128, 128);
                cx.fillStyle = '#111111';
                cx.font = 'bold 58px sans-serif';
                cx.textAlign = 'center';
                cx.textBaseline = 'middle';
                cx.fillText(text, 64, 64);
                const t = new THREE.CanvasTexture(c);

                const boardMesh = new THREE.Mesh(
                    new THREE.BoxGeometry(1.6, 2.2, 0.2),
                    new THREE.MeshBasicMaterial({ map: t })
                );
                boardMesh.position.copy(pt).addScaledVector(norm, -this.trackWidth / 2 - 2.2);
                boardMesh.position.y = 1.2;
                boardMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
                this.scene.add(boardMesh);
            });
        });
    }

    buildTrees() {
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2f18, roughness: 0.9 });
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x184d1a, roughness: 0.8 });
        const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 3.5, 6);
        const foliageGeo = new THREE.ConeGeometry(2.5, 6, 6);

        for (let i = 0; i < 120; i++) {
            const angle = Math.random() * Math.PI * 2;
            const rad = 70 + Math.random() * 320;
            const x = Math.cos(angle) * rad - 150;
            const z = Math.sin(angle) * rad + 100;

            // Make sure not directly on track
            const testPt = new THREE.Vector3(x, 0, z);
            const nearest = this.getNearestSample(testPt);
            if (nearest.distanceToTrack < this.trackWidth + 6) continue;

            const group = new THREE.Group();
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1.75;
            const foliage = new THREE.Mesh(foliageGeo, foliageMat);
            foliage.position.y = 5.5;

            group.add(trunk, foliage);
            group.position.set(x, 0, z);
            const s = 0.7 + Math.random() * 0.7;
            group.scale.set(s, s, s);
            this.scene.add(group);
        }
    }

    getNearestSample(carPos) {
        let minDistSq = Infinity;
        let bestIdx = 0;

        for (let i = 0; i < this.sampleCount; i++) {
            const pt = this.trackSamples[i].point;
            const dx = carPos.x - pt.x;
            const dz = carPos.z - pt.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                bestIdx = i;
            }
        }

        const sample = this.trackSamples[bestIdx];
        const dist = Math.sqrt(minDistSq);

        // Vector from track center to car
        const toCar = new THREE.Vector3().subVectors(carPos, sample.point);
        const lateralDist = toCar.dot(sample.normal);

        const onTrack = Math.abs(lateralDist) <= (this.trackWidth / 2);
        const onKerb = Math.abs(lateralDist) > (this.trackWidth / 2) &&
            Math.abs(lateralDist) <= (this.trackWidth / 2 + 1.5);
        const offTrack = Math.abs(lateralDist) > (this.trackWidth / 2 + 1.5);

        return {
            sampleIndex: bestIdx,
            sample: sample,
            distanceAlongTrack: sample.distance,
            distanceToTrack: dist,
            lateralDistance: lateralDist,
            onTrack: onTrack,
            onKerb: onKerb,
            offTrack: offTrack,
            isDrsZone: sample.isDrsZone,
            targetSpeed: sample.targetSpeed
        };
    }
}

window.F1Track = F1Track;
