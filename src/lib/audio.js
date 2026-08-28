/**
 * Who Is the Impostor? - Audio & Haptics ES Module
 * Handles sound effects and vibration feedback
 */

// Sound presets (generated programmatically)
const sounds = {
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
};

// Vibration patterns (in milliseconds)
const vibrations = {
    light: [50],
    medium: [100],
    heavy: [200],
    double: [50, 50, 50],
    success: [50, 50, 100],
    error: [100, 50, 100, 50, 100],
    roleReveal: [100, 50, 200],
    eliminate: [200, 100, 200],
    victory: [100, 50, 100, 50, 200]
};

// Module state
let audioContext = null;
let enabled = true;
let vibrationEnabled = true;

/**
 * Initialize audio system
 */
export function initAudio() {
    try {
        enabled = localStorage.getItem('soundEnabled') !== 'false';
        vibrationEnabled = localStorage.getItem('vibrationEnabled') !== 'false';
    } catch {
        enabled = true;
        vibrationEnabled = true;
    }

    // Create audio context on first user interaction
    document.addEventListener('click', initAudioContext, { once: true });
    document.addEventListener('touchstart', initAudioContext, { once: true });

}

/**
 * Initialize Web Audio API context
 */
function initAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch {
            console.warn('Web Audio API not supported');
        }
    }
}

/**
 * Play a sound effect
 * @param {string} soundName - Name of the sound to play
 */
export function play(soundName) {
    if (!enabled) return;

    const sound = sounds[soundName];
    if (!sound) {
        console.warn(`Sound not found: ${soundName}`);
        return;
    }

    initAudioContext();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') void audioContext.resume();

    const frequencies = Array.isArray(sound.frequency) ? sound.frequency : [sound.frequency];

    frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = sound.type;
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);

        // Envelope
        const startTime = audioContext.currentTime + (index * sound.duration);
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + sound.duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + sound.duration);
    });
}

/**
 * Trigger vibration feedback
 * @param {string} patternName - Name of the vibration pattern
 */
export function vibrate(patternName) {
    if (!vibrationEnabled) return;
    if (!navigator.vibrate) return;

    const pattern = vibrations[patternName];
    if (!pattern) {
        console.warn(`Vibration pattern not found: ${patternName}`);
        return;
    }

    try {
        navigator.vibrate(pattern);
    } catch (e) {
        console.warn('Vibration failed:', e);
    }
}

/**
 * Play sound and vibrate together
 * @param {string} soundName - Sound to play
 * @param {string} vibrationName - Vibration pattern (optional, defaults to 'light')
 */
export function feedback(soundName, vibrationName = 'light') {
    play(soundName);
    vibrate(vibrationName);
}

/**
 * Toggle sound on/off
 * @returns {boolean} New state
 */
export function toggleSound() {
    enabled = !enabled;
    try {
        localStorage.setItem('soundEnabled', String(enabled));
    } catch {
        // Preferences remain available for this page session.
    }
    return enabled;
}

/**
 * Toggle vibration on/off
 * @returns {boolean} New state
 */
export function toggleVibration() {
    vibrationEnabled = !vibrationEnabled;
    try {
        localStorage.setItem('vibrationEnabled', String(vibrationEnabled));
    } catch {
        // Preferences remain available for this page session.
    }
    return vibrationEnabled;
}

/**
 * Check if vibration is supported
 * @returns {boolean}
 */
export function isVibrationSupported() {
    return 'vibrate' in navigator;
}

/**
 * Get sound enabled state
 * @returns {boolean}
 */
export function isSoundEnabled() {
    return enabled;
}

/**
 * Get vibration enabled state
 * @returns {boolean}
 */
export function isVibrationEnabled() {
    return vibrationEnabled;
}
