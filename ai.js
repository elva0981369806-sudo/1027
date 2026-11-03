/**
 * F1 Racing Simulator - AI Rivals Manager
 * Manages computer-controlled F1 opponents with adjustable skill levels and overtaking behavior.
 */
class F1AIManager {
    constructor(scene, track) {
        this.scene = scene;
        this.track = track;
        this.aiCars = [];

        this.aiConfigs = [
            { name: "VER", team: "Red Bull Racing", color: 0x0600d2, startDist: 80, speedFactor: 0.94 },
            { name: "HAM", team: "Mercedes-AMG",   color: 0x00d2be, startDist: 50, speedFactor: 0.91 },
            { name: "NOR", team: "McLaren",        color: 0xff8000, startDist: 25, speedFactor: 0.88 },
            { name: "ALO", team: "Aston Martin",   color: 0x006f62, startDist: 105, speedFactor: 0.89 }
        ];

        this.initAI();
    }

    initAI() {
        this.aiConfigs.forEach((cfg) => {
            const car = new F1Car(this.scene, cfg.color, false);
            car.name = cfg.name;
            car.team = cfg.team;
            car.speedFactor = cfg.speedFactor;
            car.u = (cfg.startDist / this.track.totalLength) % 1.0;
            car.distanceCovered = cfg.startDist;
            car.lateralOffset = (Math.random() - 0.5) * 4.0; // slight spread across track

            // Position at initial track spline point
            const pt = this.track.spline.getPointAt(car.u);
            const tan = this.track.spline.getTangentAt(car.u).normalize();
            car.position.copy(pt);
            car.position.y = 0.45;
            car.heading = Math.atan2(tan.x, tan.z);
            car.mesh.position.copy(car.position);
            car.mesh.rotation.y = car.heading;

            this.aiCars.push(car);
        });
    }

    update(deltaSec, playerCar) {
        const totalLen = this.track.totalLength;

        this.aiCars.forEach(ai => {
            // Find current spline segment
            const currentU = (ai.distanceCovered % totalLen) / totalLen;
            ai.u = currentU;

            const sample = this.track.trackSamples[Math.floor(currentU * (this.track.sampleCount - 1))];
            if (!sample) return;

            // Target speed based on corner target speed * AI speed factor
            let targetSpd = sample.targetSpeed * ai.speedFactor;

            // Player proximity collision avoidance: If player is right ahead, AI eases off throttle safely!
            const distToPlayer = ai.position.distanceTo(playerCar.position);
            if (distToPlayer < 9.0) {
                // Check if player is directly ahead
                const toPlayer = playerCar.position.clone().sub(ai.position);
                const forward = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));
                if (forward.dot(toPlayer) > 0) {
                    targetSpd = Math.min(targetSpd, playerCar.speedKmh * 0.92);
                }
            }

            // AI throttle / brake logic
            let throttle = 0;
            let brake = 0;
            if (ai.speedKmh < targetSpd - 5) {
                throttle = 0.95;
            } else if (ai.speedKmh > targetSpd + 15) {
                brake = 0.85;
            } else {
                throttle = 0.45;
            }

            // Steer towards target point on spline with lateral offset
            const lookAheadU = ((currentU + 0.035) % 1.0);
            const targetPt = this.track.spline.getPointAt(lookAheadU);
            const tan = this.track.spline.getTangentAt(lookAheadU).normalize();
            const norm = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
            targetPt.addScaledVector(norm, ai.lateralOffset);

            const toTarget = targetPt.clone().sub(ai.position).normalize();
            const targetHeading = Math.atan2(toTarget.x, toTarget.z);

            // Heading delta
            let headingDiff = targetHeading - ai.heading;
            while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
            while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;

            const steer = Math.max(-1, Math.min(1, headingDiff * 2.2));

            // DRS on straights for AI
            const drs = sample.isDrsZone && ai.speedKmh > 230;

            ai.setInputs(throttle, brake, steer, drs, false);
            ai.update(deltaSec, this.track);
        });
    }

    setDifficulty(factor) {
        // factor: 0.8 (Rookie), 0.92 (Amateur), 1.0 (Pro)
        this.aiCars.forEach(ai => {
            ai.speedFactor = factor * (0.95 + Math.random() * 0.1);
        });
    }
}

window.F1AIManager = F1AIManager;

