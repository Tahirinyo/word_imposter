/**
 * Word Imposter - Audio & Haptics Module
 * Handles sound effects and vibration feedback
 */

const Audio = {
    // Audio context for Web Audio API
    audioContext: null,

    // Sound enabled state
    enabled: true,

    // Vibration enabled state
    vibrationEnabled: true,

    // Sound presets (generated programmatically)
    sounds: {
        // UI sounds
        click: { frequency: 600, duration: 0.05, type: 'sine' },
        success: { frequency: [523, 659, 784], duration: 0.15, type: 'sine' },
        error: { frequency: 200, duration: 0.2, type: 'sawtooth' },

        // Game sounds
        cardFlip: { frequency: [400, 600], duration: 0.1, type: 'sine' },
        roleReveal: { frequency: [300, 400, 500, 600], duration: 0.1, type: 'sine' },
        vote: { frequency: 440, duration: 0.1, type: 'triangle' },
        eliminate: { frequency: [400, 300, 200], duration: 0.2, type: 'sawtooth' },
        gameOver: { frequency: [523, 392, 330, 262], duration: 0.3, type: 'sine' },
        victory: { frequency: [262, 330, 392, 523, 659, 784], duration: 0.15, type: 'sine' },
        tick: { frequency: 800, duration: 0.02, type: 'square' },

        // Notification sounds
        playerJoin: { frequency: [400, 500], duration: 0.1, type: 'sine' },
        playerLeave: { frequency: [500, 400], duration: 0.1, type: 'sine' },
        newRound: { frequency: [300, 400, 500], duration: 0.15, type: 'triangle' }
    },

    // Vibration patterns (in milliseconds)
    vibrations: {
        light: [50],
        medium: [100],
        heavy: [200],
        double: [50, 50, 50],
        success: [50, 50, 100],
        error: [100, 50, 100, 50, 100],
        roleReveal: [100, 50, 200],
        eliminate: [200, 100, 200],
        victory: [100, 50, 100, 50, 200]
    },

    /**
     * Initialize audio system
     */
    init() {
        // Load saved preferences
        const savedSound = localStorage.getItem('soundEnabled');
        const savedVibration = localStorage.getItem('vibrationEnabled');

        this.enabled = savedSound !== 'false';
        this.vibrationEnabled = savedVibration !== 'false';

        // Create audio context on first user interaction
        document.addEventListener('click', () => this.initAudioContext(), { once: true });
        document.addEventListener('touchstart', () => this.initAudioContext(), { once: true });

        console.log('🔊 Audio module initialized');
    },

    /**
     * Initialize Web Audio API context
     */
    initAudioContext() {
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                console.log('🎵 Audio context created');
            } catch (e) {
                console.warn('Web Audio API not supported');
            }
        }
    },

    /**
     * Play a sound effect
     * @param {string} soundName - Name of the sound to play
     */
    play(soundName) {
        if (!this.enabled) return;

        const sound = this.sounds[soundName];
        if (!sound) {
            console.warn(`Sound not found: ${soundName}`);
            return;
        }

        this.initAudioContext();
        if (!this.audioContext) return;

        const frequencies = Array.isArray(sound.frequency) ? sound.frequency : [sound.frequency];

        frequencies.forEach((freq, index) => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.type = sound.type;
            oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);

            // Envelope
            const startTime = this.audioContext.currentTime + (index * sound.duration);
            gainNode.gain.setValueAtTime(0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + sound.duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + sound.duration);
        });
    },

    /**
     * Trigger vibration feedback
     * @param {string} patternName - Name of the vibration pattern
     */
    vibrate(patternName) {
        if (!this.vibrationEnabled) return;
        if (!navigator.vibrate) return;

        const pattern = this.vibrations[patternName];
        if (!pattern) {
            console.warn(`Vibration pattern not found: ${patternName}`);
            return;
        }

        try {
            navigator.vibrate(pattern);
        } catch (e) {
            console.warn('Vibration failed:', e);
        }
    },

    /**
     * Play sound and vibrate together
     * @param {string} soundName - Sound to play
     * @param {string} vibrationName - Vibration pattern (optional, defaults to 'light')
     */
    feedback(soundName, vibrationName = 'light') {
        this.play(soundName);
        this.vibrate(vibrationName);
    },

    /**
     * Toggle sound on/off
     * @returns {boolean} New state
     */
    toggleSound() {
        this.enabled = !this.enabled;
        localStorage.setItem('soundEnabled', this.enabled);
        return this.enabled;
    },

    /**
     * Toggle vibration on/off
     * @returns {boolean} New state
     */
    toggleVibration() {
        this.vibrationEnabled = !this.vibrationEnabled;
        localStorage.setItem('vibrationEnabled', this.vibrationEnabled);
        return this.vibrationEnabled;
    },

    /**
     * Check if vibration is supported
     * @returns {boolean}
     */
    isVibrationSupported() {
        return 'vibrate' in navigator;
    }
};

// Initialize on load
Audio.init();
