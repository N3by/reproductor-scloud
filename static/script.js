// static/script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Obtener referencias a elementos HTML ---
    const iframeElement = document.getElementById('soundcloud-widget');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const trackInfoDiv = document.getElementById('track-info');
    const playlistTracksUl = document.getElementById('playlist-tracks');

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

    // --- Vinculación con la API del Widget ---

    // 1. Evento: Widget está listo
    widget.bind(SC.Widget.Events.READY, () => {
        console.log('Widget de SoundCloud listo.');
        if (trackInfoDiv) trackInfoDiv.textContent = 'Reproductor listo.';

        // Obtener información de la pista inicial
        widget.getCurrentSound((currentSound) => {
            if (currentSound) {
                updateTrackInfo(currentSound);
                currentTrackId = currentSound.id;
            } else {
                if (trackInfoDiv) trackInfoDiv.textContent = 'Playlist cargada. Pulsa Play.';
            }
        });

        // Comprobar estado inicial de reproducción
        widget.isPaused((paused) => {
            isPlaying = !paused;
            updatePlayPauseButton();
        });

        // Obtener y mostrar la lista de canciones con un retraso ajustado
        const getSoundsDelay = 2500; // Ajusta este valor (en ms) si es necesario
        console.log(`Esperando ${getSoundsDelay}ms antes de llamar a getSounds()...`);
        setTimeout(() => {
             console.log("Intentando obtener lista de sonidos (getSounds)...");
             widget.getSounds((sounds) => {
                if (sounds) {
                    console.log(`Número de sonidos recibidos por la API: ${sounds.length}`);
                } else {
                    console.log('La API devolvió null o undefined para los sonidos.');
                }

                if (sounds && sounds.length > 0) {
                    console.log(`Procesando ${sounds.length} sonidos para mostrar.`);
                    soundsData = sounds;
                    displayPlaylist(sounds); // <--- Llama a la función displayPlaylist actualizada
                    if (currentTrackId) {
                         highlightCurrentTrack(currentTrackId);
                    }
                } else {
                    console.warn('No se pudieron obtener los sonidos de la playlist desde el widget (getSounds).');
                    if (playlistTracksUl) playlistTracksUl.innerHTML = '<li>No se pudo cargar la lista de reproducción.</li>';
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
    });

     // 5. Evento: Error en el widget
    widget.bind(SC.Widget.Events.ERROR, (error) => {
        console.error('Error del widget de SoundCloud:', error);
        if (trackInfoDiv) trackInfoDiv.textContent = 'Error al cargar la pista o playlist.';
    });

    // --- Funciones Auxiliares ---

    function updatePlayPauseButton() {
        if (!playPauseBtn) return;
        playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️';
        playPauseBtn.title = isPlaying ? 'Pausar' : 'Reproducir';
    }

    function updateTrackInfo(sound) {
        if (!trackInfoDiv) return;
        if (sound) {
            const username = sound.user && sound.user.username ? ` (${sound.user.username})` : '';
            trackInfoDiv.textContent = `Sonando: ${sound.title}${username}`;
        } else {
             if (!isPlaying) {
                 trackInfoDiv.textContent = 'Pausado o detenido.';
             } else {
                 trackInfoDiv.textContent = 'Cargando información...';
             }
        }
    }

    /**
     * Muestra la lista de canciones en el UL con formato "Título, Artista".
     * @param {Array} sounds - Array de objetos de sonido de la API de SoundCloud.
     */
    function displayPlaylist(sounds) {
        if (!playlistTracksUl) {
             console.error("Elemento UL #playlist-tracks no encontrado para mostrar la lista.");
             return;
        }
        playlistTracksUl.innerHTML = ''; // Limpiar contenido anterior
        console.log(`Creando ${sounds.length} elementos <li> para la playlist...`);

        sounds.forEach((sound, index) => {
            try {
                const li = document.createElement('li');

                // --- INICIO CÓDIGO MODIFICADO PARA MOSTRAR TÍTULO, ARTISTA ---
                const title = sound.title || `Pista ${index + 1} (sin título)`;
                // Verifica que sound.user y sound.user.username existan
                const artist = sound.user && sound.user.username ? sound.user.username : null;

                let displayText = title;
                if (artist) {
                    // Añade coma y artista solo si el artista existe
                    displayText += ` By ${artist}`;
                }
                li.textContent = displayText; // Establece el texto combinado
                // --- FIN CÓDIGO MODIFICADO ---

                // Asignar IDs y índice
                if (sound.id) li.dataset.trackId = sound.id;
                li.dataset.trackIndex = index;

                // Añadir listener de clic
                li.addEventListener('click', () => {
                    console.log(`Clic en pista índice ${index}, ID: ${sound.id || 'N/A'}`);
                    widget.skip(index);
                });

                playlistTracksUl.appendChild(li);

            } catch (error) {
                console.error(`Error al procesar la pista en el índice ${index}:`, sound, error);
            }
        });
        console.log("Elementos <li> añadidos al DOM.");
    }

    function highlightCurrentTrack(trackId) {
        if (!playlistTracksUl || trackId === null || trackId === undefined) return;
        removeHighlight();
        const selector = `li[data-track-id="${String(trackId)}"]`;
        const trackElement = playlistTracksUl.querySelector(selector);
        if (trackElement) {
            trackElement.classList.add('playing');
            trackElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
             // Opcional: log si no se encuentra el elemento a resaltar
             // console.warn(`No se encontró el elemento li para resaltar el trackId: ${trackId}`);
        }
    }

    function removeHighlight() {
        if (!playlistTracksUl) return;
        const currentlyPlaying = playlistTracksUl.querySelector('li.playing');
        if (currentlyPlaying) {
            currentlyPlaying.classList.remove('playing');
        }
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

}); // Fin de DOMContentLoaded