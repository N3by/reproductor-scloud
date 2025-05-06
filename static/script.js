// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Obtener referencias a elementos HTML ---
    const iframeElement = document.getElementById('soundcloud-widget');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const trackInfoDiv = document.getElementById('track-info');
    const playlistTracksUl = document.getElementById('playlist-tracks');
    // Referencias para progreso y seek
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const currentTimeSpan = document.getElementById('current-time');
    const totalDurationSpan = document.getElementById('total-duration');

    // --- Comprobación inicial del iframe ---
    if (!iframeElement) {
        console.error("¡Error! No se encontró el elemento iframe con id 'soundcloud-widget'.");
        if (trackInfoDiv) trackInfoDiv.textContent = "Error: No se encontró el widget.";
        return;
    }

    // --- Inicializar el Widget de SoundCloud ---
    const widget = SC.Widget(iframeElement);

    // --- Variables de Estado ---
    let isPlaying = false;
    let currentTrackId = null;
    let soundsData = [];
    let currentDuration = 0; // Duración total de la pista actual en ms

    // --- Vinculación con la API del Widget ---

    // 1. Evento: Widget está listo
    widget.bind(SC.Widget.Events.READY, () => {
        console.log('Widget de SoundCloud listo.');
        if (trackInfoDiv) trackInfoDiv.textContent = 'Reproductor listo.';

        widget.getCurrentSound((currentSound) => {
            if (currentSound) {
                updateTrackInfo(currentSound);
                currentTrackId = currentSound.id;
            } else {
                if (trackInfoDiv) trackInfoDiv.textContent = 'Playlist cargada. Pulsa Play.';
            }
        });

        widget.isPaused((paused) => {
            isPlaying = !paused;
            updatePlayPauseButton();
        });

        const getSoundsDelay = 1500;
        console.log(`Esperando ${getSoundsDelay}ms antes de llamar a getSounds()...`);
        setTimeout(() => {
             console.log("Intentando obtener lista de sonidos (getSounds)...");
             widget.getSounds((sounds) => {
                if (sounds) { console.log(`Número de sonidos recibidos: ${sounds.length}`); }
                if (sounds && sounds.length > 0) {
                    soundsData = sounds;
                    displayPlaylist(sounds);
                    if (currentTrackId) { highlightCurrentTrack(currentTrackId); }
                } else {
                    console.warn('No se pudieron obtener sonidos (getSounds).');
                    if (playlistTracksUl) playlistTracksUl.innerHTML = '<li>Lista no disponible.</li>';
                }
            });
        }, getSoundsDelay);
    });

    // 2. Evento: Empieza la reproducción
    widget.bind(SC.Widget.Events.PLAY, () => {
        console.log('Evento PLAY recibido');
        isPlaying = true;
        updatePlayPauseButton();
        widget.getCurrentSound(sound => {
             if (sound) {
                 updateTrackInfo(sound);
                 currentTrackId = sound.id;
                 highlightCurrentTrack(sound.id);
                 widget.getDuration((duration) => {
                     currentDuration = duration;
                     if (totalDurationSpan) totalDurationSpan.textContent = formatTime(duration);
                     console.log(`Duración obtenida: ${formatTime(duration)} (${duration}ms)`);
                     if(progressBar) progressBar.style.width = '0%'; // Resetear barra al inicio de pista
                     if(currentTimeSpan) currentTimeSpan.textContent = '0:00';
                 });
             }
        });
    });

    // 3. Evento: Se pausa la reproducción
    widget.bind(SC.Widget.Events.PAUSE, () => {
        console.log('Evento PAUSE recibido');
        isPlaying = false;
        updatePlayPauseButton();
    });

    // 4. Evento: Una canción termina
    widget.bind(SC.Widget.Events.FINISH, () => {
        console.log('Evento FINISH recibido (canción terminada)');
        if (progressBar) progressBar.style.width = '0%';
        if (currentTimeSpan) currentTimeSpan.textContent = '0:00';
        // Opcional: resetear duración total también
        // if (totalDurationSpan) totalDurationSpan.textContent = '0:00';
        // currentDuration = 0;
    });

     // 5. Evento: Error en el widget
    widget.bind(SC.Widget.Events.ERROR, (error) => {
        console.error('Error del widget de SoundCloud:', error);
        if (trackInfoDiv) trackInfoDiv.textContent = 'Error al cargar pista/playlist.';
    });

    // 6. Evento: Progreso de la reproducción
    widget.bind(SC.Widget.Events.PLAY_PROGRESS, (progressData) => {
        // Solo actualiza si realmente estamos reproduciendo y tenemos duración
        if (isPlaying && currentDuration > 0 && progressBar && currentTimeSpan) {
            const currentPosition = progressData.currentPosition;
            // Asegurarse de no exceder el 100% por pequeñas discrepancias de tiempo
            const progressPercent = Math.min((currentPosition / currentDuration) * 100, 100);

            progressBar.style.width = `${progressPercent}%`;
            currentTimeSpan.textContent = formatTime(currentPosition);
        }
    });

    // --- Funciones Auxiliares ---

    /** Formatea milisegundos a formato MM:SS */
    function formatTime(ms) {
        if (isNaN(ms) || ms <= 0) { return "0:00"; }
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /** Actualiza el icono y título del botón Play/Pause */
    function updatePlayPauseButton() {
        if (!playPauseBtn) return;
        playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️';
        playPauseBtn.title = isPlaying ? 'Pausar' : 'Reproducir';
    }

    /** Muestra la información de la pista actual en el div correspondiente */
    function updateTrackInfo(sound) {
        if (!trackInfoDiv) return;
        if (sound) {
            const username = sound.user && sound.user.username ? ` (${sound.user.username})` : '';
            trackInfoDiv.textContent = `Sonando: ${sound.title}${username}`;
        } else {
             if (!isPlaying) { trackInfoDiv.textContent = 'Pausado o detenido.'; }
             else { trackInfoDiv.textContent = 'Cargando información...'; }
        }
    }

    /** Muestra la lista de canciones en el UL con formato "Título, Artista". */
    function displayPlaylist(sounds) {
        if (!playlistTracksUl) { return; }
        playlistTracksUl.innerHTML = '';
        console.log(`Creando ${sounds.length} elementos <li>...`);
        sounds.forEach((sound, index) => {
            try {
                const li = document.createElement('li');
                const title = sound.title || `Pista ${index + 1} (sin título)`;
                const artist = sound.user && sound.user.username ? sound.user.username : null;
                let displayText = title;
                if (artist) { displayText += `, ${artist}`; }
                li.textContent = displayText;
                if (sound.id) li.dataset.trackId = sound.id;
                li.dataset.trackIndex = index;
                li.addEventListener('click', () => { widget.skip(index); });
                playlistTracksUl.appendChild(li);
            } catch (error) {
                console.error(`Error al procesar pista ${index}:`, sound, error);
            }
        });
    }

    /** Resalta la canción que está sonando actualmente en la lista. */
    function highlightCurrentTrack(trackId) {
        if (!playlistTracksUl || trackId === null || trackId === undefined) return;
        removeHighlight();
        const selector = `li[data-track-id="${String(trackId)}"]`;
        const trackElement = playlistTracksUl.querySelector(selector);
        if (trackElement) {
            trackElement.classList.add('playing');
            trackElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /** Quita el resaltado de cualquier canción en la lista */
    function removeHighlight() {
        if (!playlistTracksUl) return;
        const currentlyPlaying = playlistTracksUl.querySelector('li.playing');
        if (currentlyPlaying) { currentlyPlaying.classList.remove('playing'); }
    }

    // --- Conexión de Botones HTML a la API ---
    if (playPauseBtn) { playPauseBtn.addEventListener('click', () => widget.toggle()); }
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            widget.prev();
            setTimeout(() => widget.getCurrentSound(sound => { if(sound) { updateTrackInfo(sound); currentTrackId = sound.id; highlightCurrentTrack(sound.id); } }), 300);
        });
    }
    if (nextBtn) {
       nextBtn.addEventListener('click', () => {
            widget.next();
            setTimeout(() => widget.getCurrentSound(sound => { if(sound) { updateTrackInfo(sound); currentTrackId = sound.id; highlightCurrentTrack(sound.id); } }), 300);
        });
    }

    // --- Event Listener para Seeking en la Barra de Progreso ---
    if (progressContainer) {
        progressContainer.addEventListener('click', (event) => {
            // 1. Verificar si tenemos duración válida
            if (currentDuration <= 0) {
                console.log("No se puede buscar: duración inválida.");
                return;
            }

            // 2. Calcular posición del clic
            const containerWidth = progressContainer.offsetWidth;
            const clickPositionX = event.offsetX;

            // 3. Calcular porcentaje
            const clickPercent = Math.max(0, Math.min(1, clickPositionX / containerWidth)); // Asegurar entre 0 y 1

            // 4. Calcular tiempo en ms
            const seekTimeMs = Math.floor(clickPercent * currentDuration);

            console.log(`Clic en barra: ${clickPercent.toFixed(2)}% -> ${formatTime(seekTimeMs)} (${seekTimeMs}ms)`);

            // 5. Actualizar UI inmediatamente (opcional pero recomendado)
            if (progressBar) progressBar.style.width = `${clickPercent * 100}%`;
            if (currentTimeSpan) currentTimeSpan.textContent = formatTime(seekTimeMs);

            // 6. Realizar el seek en SoundCloud
            widget.seekTo(seekTimeMs);
        });
    }

}); // Fin de DOMContentLoaded