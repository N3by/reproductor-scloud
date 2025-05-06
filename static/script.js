// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Referencias HTML ---
    const iframeElement = document.getElementById('soundcloud-widget');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const unlockBtn = document.getElementById('unlock-btn'); // Botón global
    const trackInfoDiv = document.getElementById('track-info');
    const playlistTracksUl = document.getElementById('playlist-tracks');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const currentTimeSpan = document.getElementById('current-time');
    const totalDurationSpan = document.getElementById('total-duration');
    // Referencias del Modal
    const passwordModal = document.getElementById('password-modal');
    const passwordInput = document.getElementById('password-input');
    const modalOkBtn = document.getElementById('modal-ok-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalOverlay = passwordModal ? passwordModal.querySelector('.modal-overlay') : null;

    // --- Comprobación inicial de elementos esenciales ---
    if (!iframeElement || !passwordModal || !modalOkBtn || !modalCancelBtn || !modalOverlay || !unlockBtn) {
         console.error("Error: Falta algún elemento esencial (iframe, modal o botón unlock).");
         if(trackInfoDiv) trackInfoDiv.textContent = "Error de inicialización.";
         [playPauseBtn, prevBtn, nextBtn, unlockBtn, progressContainer].forEach(btn => { if(btn) btn.disabled = true; });
         return;
    }

    // --- Inicializar Widget ---
    const widget = SC.Widget(iframeElement);

    // --- Variables de Estado ---
    let isPlaying = false;
    let currentTrackId = null;
    let soundsData = [];
    let currentDuration = 0;
    let lockedTrackIds = new Set(); // Almacena IDs de tracks bloqueados (inicia vacío)

    // --- Vinculación con Eventos del Widget ---

    // 1. Evento READY
    widget.bind(SC.Widget.Events.READY, () => {
        console.log('Widget listo.');
        if (trackInfoDiv) trackInfoDiv.textContent = 'Reproductor listo.';
        widget.getCurrentSound((currentSound) => { if (currentSound) { updateTrackInfo(currentSound); currentTrackId = currentSound.id; } else { if (trackInfoDiv) trackInfoDiv.textContent = 'Playlist cargada.'; } });
        widget.isPaused((paused) => { isPlaying = !paused; updatePlayPauseButton(); });

        const getSoundsDelay = 1500;
        setTimeout(() => {
            widget.getSounds((sounds) => {
                if (sounds && sounds.length > 0) {
                    soundsData = sounds;
                    displayPlaylist(sounds); // Renderiza la lista con candados desbloqueados
                    if (currentTrackId) { highlightCurrentTrack(currentTrackId); }
                } else { console.warn('getSounds no devolvió sonidos.'); if (playlistTracksUl) playlistTracksUl.innerHTML = '<li>Lista no disponible.</li>'; }
            });
        }, getSoundsDelay);
    });

    // 2. Evento PLAY (con chequeo de bloqueo individual)
    widget.bind(SC.Widget.Events.PLAY, () => {
        isPlaying = true; // Asumir que empieza, luego comprobar bloqueo
        updatePlayPauseButton();
        widget.getCurrentSound(sound => {
             if (sound) {
                 // Comprobar si la pista está bloqueada *antes* de actualizar UI
                 if (lockedTrackIds.has(sound.id)) {
                     console.warn(`PLAY bloqueado: Pista ${sound.id} está bloqueada.`);
                     isPlaying = false; // Corregir estado
                     updatePlayPauseButton();
                     widget.pause(); // Asegurar pausa
                     // Opcional: intentar saltar a la siguiente
                     const currentIndex = soundsData.findIndex(s => s.id === sound.id);
                     if (currentIndex > -1 && currentIndex < soundsData.length - 1) { setTimeout(() => widget.next(), 100); }
                     return; // No continuar si está bloqueado
                 }
                 // Si no está bloqueado, proceder
                 console.log('Evento PLAY procesado.');
                 updateTrackInfo(sound);
                 currentTrackId = sound.id;
                 highlightCurrentTrack(sound.id);
                 widget.getDuration((duration) => {
                     currentDuration = duration;
                     if (totalDurationSpan) totalDurationSpan.textContent = formatTime(duration);
                     if(progressBar) progressBar.style.width = '0%';
                     if(currentTimeSpan) currentTimeSpan.textContent = '0:00';
                 });
             }
        });
    });

    // 3. Evento PAUSE
    widget.bind(SC.Widget.Events.PAUSE, () => { console.log('Evento PAUSE recibido'); isPlaying = false; updatePlayPauseButton(); });
    // 4. Evento FINISH
    widget.bind(SC.Widget.Events.FINISH, () => { console.log('Evento FINISH recibido'); if (progressBar) progressBar.style.width = '0%'; if (currentTimeSpan) currentTimeSpan.textContent = '0:00'; });
    // 5. Evento ERROR
    widget.bind(SC.Widget.Events.ERROR, (error) => { console.error('Error del widget:', error); if (trackInfoDiv) trackInfoDiv.textContent = 'Error en widget.'; });
    // 6. Evento PLAY_PROGRESS
    widget.bind(SC.Widget.Events.PLAY_PROGRESS, (progressData) => { if (isPlaying && currentDuration > 0 && progressBar && currentTimeSpan) { const currentPosition = progressData.currentPosition; const progressPercent = Math.min((currentPosition / currentDuration) * 100, 100); progressBar.style.width = `${progressPercent}%`; currentTimeSpan.textContent = formatTime(currentPosition); } });


    // --- Funciones Auxiliares ---

    /** Formatea milisegundos a formato MM:SS */
    function formatTime(ms) { if (isNaN(ms) || ms <= 0) { return "0:00"; } const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
    /** Actualiza el icono y título del botón Play/Pause */
    function updatePlayPauseButton() { if (!playPauseBtn) return; playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️'; playPauseBtn.title = isPlaying ? 'Pausar' : 'Reproducir'; }
    /** Muestra la información de la pista actual */
    function updateTrackInfo(sound) { if (!trackInfoDiv) return; if (sound) { const user = sound.user && sound.user.username ? ` (${sound.user.username})` : ''; trackInfoDiv.textContent = `Sonando: ${sound.title}${user}`; } else { trackInfoDiv.textContent = isPlaying ? 'Cargando...' : 'Pausado.'; } }
    /** Quita el resaltado de cualquier canción en la lista */
    function removeHighlight() { if (!playlistTracksUl) return; const el = playlistTracksUl.querySelector('li.playing'); if (el) el.classList.remove('playing'); }
    /** Resalta la canción que está sonando actualmente */
    function highlightCurrentTrack(trackId) { if (!playlistTracksUl || trackId === null || trackId === undefined) return; removeHighlight(); const selector = `li[data-track-id="${String(trackId)}"]`; const el = playlistTracksUl.querySelector(selector); if (el) { el.classList.add('playing'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }

    /** Actualiza la apariencia de TODOS los tracks y sus candados según lockedTrackIds */
    function updateAllTrackAppearances() {
        if (!playlistTracksUl) return;
        const trackItems = playlistTracksUl.querySelectorAll('li[data-track-id]');
        console.log("Actualizando apariencia global de candados...");
        trackItems.forEach(item => {
            const trackId = item.dataset.trackId;
            const lockIcon = item.querySelector('.lock-icon');
            if (!trackId || !lockIcon) return; // Seguridad extra
            if (lockedTrackIds.has(trackId)) {
                lockIcon.textContent = '🔒'; item.classList.add('locked-track');
            } else {
                lockIcon.textContent = '🔓'; item.classList.remove('locked-track');
            }
        });
    }

    // --- Funciones del Modal ---
    function showPasswordModal() {
        passwordInput.value = ''; // Limpiar campo antes de mostrar
        passwordModal.style.display = 'block';
        passwordInput.focus(); // Poner foco en el input
    }
    function hidePasswordModal() {
        passwordModal.style.display = 'none';
    }

    /** Muestra la lista. Candado individual SOLO bloquea. */
    function displayPlaylist(sounds) {
        if (!playlistTracksUl) { return; }
        playlistTracksUl.innerHTML = '';
        sounds.forEach((sound, index) => {
             if (!sound || !sound.id) { console.warn(`Sonido ${index} sin ID.`); return; }
            const trackId = sound.id;
            try {
                const li = document.createElement('li');
                li.dataset.trackId = trackId; li.dataset.trackIndex = index;

                // Crear Texto (clic reproduce)
                const textSpan = document.createElement('span');
                textSpan.classList.add('track-text');
                const title = sound.title || `Pista ${index + 1}`;
                const artist = sound.user && sound.user.username ? sound.user.username : null;
                textSpan.textContent = artist ? `${title}, ${artist}` : title;
                li.appendChild(textSpan);

                // Crear Icono de Candado
                const lockSpan = document.createElement('span');
                lockSpan.classList.add('lock-icon');
                lockSpan.dataset.trackId = trackId; // Asociar ID para fácil acceso
                const isLocked = lockedTrackIds.has(trackId); // Comprobar estado actual
                lockSpan.textContent = isLocked ? '🔒' : '🔓';
                if (isLocked) { li.classList.add('locked-track'); }
                li.appendChild(lockSpan); // Añadir candado al final

                // Event Listener para el Texto (Reproducir, chequea bloqueo)
                textSpan.addEventListener('click', () => {
                    if (lockedTrackIds.has(trackId)) {
                        alert(`"${textSpan.textContent}" está bloqueada 🔒. Usa el botón global 🔓 para desbloquear.`);
                        return;
                    }
                    widget.skip(index);
                });

                // Event Listener para el Candado (SOLO BLOQUEAR)
                lockSpan.addEventListener('click', (event) => {
                    event.stopPropagation(); // Prevenir clic en texto/li
                    const currentlyLocked = lockedTrackIds.has(trackId);

                    // Solo actuar si NO está bloqueado actualmente (icono es 🔓)
                    if (!currentlyLocked) {
                        // Bloquear la canción
                        lockedTrackIds.add(trackId);
                        lockSpan.textContent = '🔒';
                        li.classList.add('locked-track');
                        console.log(`Track ${trackId} BLOQUEADO.`);
                        // Pausar si se bloquea la canción actual mientras suena
                        if (trackId === currentTrackId && isPlaying) {
                            console.log("Canción actual bloqueada, pausando...");
                            widget.pause();
                        }
                        // console.log("IDs bloqueados:", lockedTrackIds); // Log opcional
                    } else {
                        // Si ya está bloqueado (🔒), no hacer nada al hacer clic
                        console.log(`Clic en candado bloqueado para track ${trackId}. No se desbloquea.`);
                    }
                });

                playlistTracksUl.appendChild(li);
            } catch (error) { console.error(`Error procesando pista ${index}:`, error); }
        });
    }

    // --- Conexión de Botones (Prev/Play/Next) ---
    if (playPauseBtn) { playPauseBtn.addEventListener('click', () => widget.toggle()); }
    if (prevBtn) { prevBtn.addEventListener('click', () => widget.prev()); }
    if (nextBtn) { nextBtn.addEventListener('click', () => widget.next()); }

    // --- Event Listener para Seeking ---
    if (progressContainer) {
        progressContainer.addEventListener('click', (event) => {
            if (currentDuration <= 0) return;
            const cWidth = progressContainer.offsetWidth;
            const cX = event.offsetX;
            const cPercent = Math.max(0, Math.min(1, cX / cWidth));
            const seekMs = Math.floor(cPercent * currentDuration);
            if (progressBar) progressBar.style.width = `${cPercent * 100}%`;
            if (currentTimeSpan) currentTimeSpan.textContent = formatTime(seekMs);
            widget.seekTo(seekMs);
        });
    }

    // --- Event Listeners para el Modal y Botón Global ---
    if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
            if (lockedTrackIds.size === 0) {
                 alert("Actualmente no hay ninguna canción bloqueada.");
                 return;
            }
            showPasswordModal();
        });
    }
    if (modalOkBtn) {
        modalOkBtn.addEventListener('click', () => {
            const pass = passwordInput.value;
            if (pass === "12345") {
                console.log("Contraseña global correcta. Desbloqueando todo...");
                lockedTrackIds.clear(); // Vaciar el set de bloqueados
                updateAllTrackAppearances(); // Actualizar visualmente todos
                alert("¡Todas las canciones han sido desbloqueadas!");
                hidePasswordModal();
            } else {
                alert("Contraseña incorrecta.");
                passwordInput.focus();
                passwordInput.select(); // Seleccionar para fácil reescritura
            }
        });
    }
    if (modalCancelBtn) { modalCancelBtn.addEventListener('click', hidePasswordModal); }
    if (modalOverlay) { modalOverlay.addEventListener('click', hidePasswordModal); }
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                modalOkBtn.click(); // Simular clic en OK
            }
        });
    }

}); // Fin de DOMContentLoaded