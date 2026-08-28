import './styles/main.css';

import { initFirebase } from './config/firebase.js';
import { setOnRoomDeleted, setOnRoomUpdate, tryReconnect } from './game/room.js';
import { setGameState } from './game/state.js';
import { initAudio } from './lib/audio.js';
import { isValidRoomCode, normalizeRoomCode } from './game/domain.js';
import { initUI, showError, showFatalError } from './ui/core.js';
import { render } from './ui/renderer.js';

function getRoomCodeFromUrl() {
    const url = new URL(window.location.href);
    const rawRoomCode = url.searchParams.get('room');
    if (!rawRoomCode) return null;

    url.searchParams.delete('room');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    return normalizeRoomCode(rawRoomCode);
}

function setupNetworkStatus() {
    const update = () => {
        setGameState({ isOnline: navigator.onLine });
        render();
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
}

async function init() {
    initUI();

    try {
        await initFirebase();
        initAudio();

        setOnRoomUpdate(() => render());
        setOnRoomDeleted((reason) => {
            setGameState({ phase: 'home' });
            render();
            showError(reason === 'removed'
                ? 'Odadan çıkarıldınız veya oda erişiminiz sona erdi.'
                : 'Oda artık mevcut değil.');
        });

        setupNetworkStatus();
        const urlRoomCode = getRoomCodeFromUrl();
        if (urlRoomCode) {
            if (isValidRoomCode(urlRoomCode)) {
                setGameState({ phase: 'join', joinRoomCode: urlRoomCode });
            } else {
                setGameState({ phase: 'home' });
                render();
                showError('Davet bağlantısındaki oda kodu geçersiz.');
                return;
            }
        } else {
            await tryReconnect();
        }

        render();
    } catch (error) {
        showFatalError(error.message || 'Firebase yapılandırmasını ve internet bağlantınızı kontrol edin.');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    void init();
}

export { init, render };
