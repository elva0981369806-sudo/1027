/**
 * F1 Racing Simulator - Web Audio API Synthetic Sound Engine
 * Completely self-contained, no external audio files required!
 */
class F1AudioEngine {
    constructor() {
        this.ctx = null;
        this.isInitialized = false;
        this.isMuted = false;

        // Sound nodes
        this.engineOsc1 = null;
        this.engineOsc2 = null;
        this.engineGain = null;
        this.engineFilter = null;

        this.turboOsc = null;
        this.turboGain = null;

        this.tireNoiseNode = null;
        this.tireGain = null;
        this.tireFilter = null;

        this.windNoiseNode = null;
        this.windGain = null;

        this.kerbGain = null;
        this.kerbOsc = null;

        // State
        this.currentRpm = 1000;
        this.currentGear = 1;
        this.currentThrottle = 0;
        this.speedKmh = 0;
    }

    init() {
        if (this.isInitialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            // 1. Engine Sound (V6 Turbo Hybrid simulation)
            this.engineGain = this.ctx.createGain();
            this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

            this.engineFilter = this.ctx.createBiquadFilter();
            this.engineFilter.type = 'lowpass';
            this.engineFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
            this.engineFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

            this.engineOsc1 = this.ctx.createOscillator();
            this.engineOsc1.type = 'sawtooth';
            this.engineOsc1.frequency.setValueAtTime(60, this.ctx.currentTime);

            this.engineOsc2 = this.ctx.createOscillator();
            this.engineOsc2.type = 'triangle';
            this.engineOsc2.frequency.setValueAtTime(120, this.ctx.currentTime);

            this.engineOsc1.connect(this.engineFilter);
            this.engineOsc2.connect(this.engineFilter);
            this.engineFilter.connect(this.engineGain);
            this.engineGain.connect(this.ctx.destination);

            this.engineOsc1.start();
            this.engineOsc2.start();

            // 2. Turbo Whine
            this.turboGain = this.ctx.createGain();
            this.turboGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

            this.turboOsc = this.ctx.createOscillator();
            this.turboOsc.type = 'sine';
            this.turboOsc.frequency.setValueAtTime(3000, this.ctx.currentTime);

            this.turboOsc.connect(this.turboGain);
            this.turboGain.connect(this.ctx.destination);
            this.turboOsc.start();

            // 3. Tire Screech (White noise through bandpass)
            this.setupTireNoise();

            // 4. Wind Rush (Lowpass noise)
            this.setupWindNoise();

            // 5. Kerb Strip Rumble Drone
            this.kerbGain = this.ctx.createGain();
            this.kerbGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
            this.kerbOsc = this.ctx.createOscillator();
            this.kerbOsc.type = 'square';
            this.kerbOsc.frequency.setValueAtTime(45, this.ctx.currentTime);
            this.kerbOsc.connect(this.kerbGain);
            this.kerbGain.connect(this.ctx.destination);
            this.kerbOsc.start();

            this.isInitialized = true;
        } catch (e) {
            console.warn("Web Audio not supported or blocked:", e);
        }
    }

    setupTireNoise() {
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        this.tireFilter = this.ctx.createBiquadFilter();
        this.tireFilter.type = 'bandpass';
        this.tireFilter.frequency.setValueAtTime(950, this.ctx.currentTime);
        this.tireFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

        this.tireGain = this.ctx.createGain();
        this.tireGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

        whiteNoise.connect(this.tireFilter);
        this.tireFilter.connect(this.tireGain);
        this.tireGain.connect(this.ctx.destination);
        whiteNoise.start();
    }

    setupWindNoise() {
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        const windSource = this.ctx.createBufferSource();
        windSource.buffer = noiseBuffer;
        windSource.loop = true;

        const windFilter = this.ctx.createBiquadFilter();
        windFilter.type = 'lowpass';
        windFilter.frequency.setValueAtTime(400, this.ctx.currentTime);

        this.windGain = this.ctx.createGain();
        this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

        windSource.connect(windFilter);
        windFilter.connect(this.windGain);
        this.windGain.connect(this.ctx.destination);
        windSource.start();
    }

    update(rpm, gear, throttle, speedKmh, tireSlip, onKerb) {
        if (!this.isInitialized || this.isMuted) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        this.currentRpm = rpm;
        this.currentGear = gear;
        this.currentThrottle = throttle;
        this.speedKmh = speedKmh;

        const now = this.ctx.currentTime;

        // Engine Pitch: 3000 RPM -> ~80Hz, 12500 RPM -> ~450Hz
        const baseFreq = 50 + (rpm / 13000) * 420;
        this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
        this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.05);

        // Filter opening with throttle (more aggressive sound under load)
        const filterFreq = 600 + throttle * 2800 + (rpm / 13000) * 2000;
        this.engineFilter.frequency.setTargetAtTime(filterFreq, now, 0.05);

        // Engine Volume
        const engVol = 0.18 + throttle * 0.22 + (rpm / 13000) * 0.15;
        this.engineGain.gain.setTargetAtTime(engVol, now, 0.05);

        // Turbo Whine (audible under high boost/throttle)
        const turboFreq = 2200 + (rpm / 13000) * 3500;
        const turboVol = Math.max(0, throttle * 0.06 * (rpm / 10000));
        this.turboOsc.frequency.setTargetAtTime(turboFreq, now, 0.08);
        this.turboGain.gain.setTargetAtTime(turboVol, now, 0.08);

        // Tire Screech Volume (increases with lateral/longitudinal slip)
        const clampedSlip = Math.min(1.0, Math.max(0, (tireSlip - 0.22) * 2.2));
        const tireVol = clampedSlip * 0.28;
        this.tireGain.gain.setTargetAtTime(tireVol, now, 0.04);

        // Wind noise with high speed
        const windVol = Math.min(0.25, Math.pow(speedKmh / 350, 2) * 0.25);
        this.windGain.gain.setTargetAtTime(windVol, now, 0.1);

        // Kerb vibration drone
        if (onKerb && speedKmh > 20) {
            const kerbFreq = 30 + (speedKmh / 350) * 70;
            this.kerbOsc.frequency.setTargetAtTime(kerbFreq, now, 0.02);
            this.kerbGain.gain.setTargetAtTime(0.18, now, 0.03);
        } else {
            this.kerbGain.gain.setTargetAtTime(0.0, now, 0.05);
        }
    }

    playGearShift() {
        if (!this.isInitialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Brief cut in engine sound
        this.engineGain.gain.setValueAtTime(0.03, now);
        this.engineGain.gain.exponentialRampToValueAtTime(0.35, now + 0.08);

        // Exhaust Pop / Backfire
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.12);

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    playDrsBeep() {
        if (!this.isInitialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, now); // A6
        osc.frequency.setValueAtTime(2637, now + 0.09); // E7

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
    }

    playRewindSound() {
        if (!this.isInitialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(1600, now + 0.35);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.36);
    }

    playCrashSound() {
        if (!this.isInitialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const bufferSize = this.ctx.sampleRate * 0.35;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const source = this.ctx.createBufferSource();
        source.buffer = noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + 0.35);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        source.start(now);
    }

    playCountdownBeep() {
        if (!this.isInitialized || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(850, now);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playGoBeep() {
        if (!this.isInitialized || this.isMuted) return;
        const now = this.ctx.currentTime;

        // Two-tone fanfare start chime
        [1200, 1800].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + i * 0.04);
            gain.gain.setValueAtTime(0.35, now + i * 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + i * 0.04);
            osc.stop(now + i * 0.04 + 0.36);
        });
    }

    pauseAudio() {
        if (!this.isInitialized) return;
        if (this.engineGain) {
            this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        }
        if (this.turboGain) {
            this.turboGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        }
        if (this.windGain) {
            this.windGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        }
        if (this.tireGain) {
            this.tireGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        }
        if (this.kerbGain) {
            this.kerbGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        }
    }

    resumeAudio() {
        if (!this.isInitialized || this.isMuted) return;
        if (this.engineGain) {
            this.engineGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.engineGain) {
            this.engineGain.gain.setValueAtTime(this.isMuted ? 0 : 0.2, this.ctx.currentTime);
        }
        return this.isMuted;
    }
}

window.F1AudioEngine = F1AudioEngine;

