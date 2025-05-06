// static/script.js
/**
 * Script principal para controlar el reproductor de música SoundCloud personalizado.
 * Maneja la interfaz de usuario (botones, barra de progreso, lista de canciones),
 * interactúa con la API del Widget de SoundCloud para la reproducción,
 * y gestiona un sistema de bloqueo/desbloqueo de canciones (bloqueo individual, desbloqueo global).
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    // Guardamos referencias a los elementos HTML con los que interactuaremos
    // para evitar buscarlos repetidamente en el DOM.

    // Elementos principales del reproductor
    const iframeElement = document.getElementById('soundcloud-widget');      // El iframe que contiene el widget de SoundCloud.
    const playPauseBtn = document.getElementById('play-pause-btn');       // Botón para reproducir/pausar.
    const prevBtn = document.getElementById('prev-btn');                // Botón para ir a la pista anterior.
    const nextBtn = document.getElementById('next-btn');                // Botón para ir a la pista siguiente.
    const unlockBtn = document.getElementById('unlock-btn');              // Botón para desbloquear todas las pistas (global).
    const trackInfoDiv = document.getElementById('track-info');           // Div para mostrar el nombre de la pista actual.
    const playlistTracksUl = document.getElementById('playlist-tracks');    // Lista <ul> donde se mostrarán las canciones.

    // Elementos de la barra de progreso
    const progressBar = document.getElementById('progress-bar');          // La barra naranja que muestra el progreso.
    const progressContainer = document.getElementById('progress-container'); // El contenedor de la barra (para clics de seek).
    const currentTimeSpan = document.getElementById('current-time');      // Span para mostrar el tiempo actual.
    const totalDurationSpan = document.getElementById('total-duration');    // Span para mostrar la duración total.

    // Elementos del Modal de Contraseña
    const passwordModal = document.getElementById('password-modal');       // El div principal del modal.
    const passwordInput = document.getElementById('password-input');     // El input (type="password") para la contraseña.
    const modalOkBtn = document.getElementById('modal-ok-btn');           // Botón "Desbloquear" del modal.
    const modalCancelBtn = document.getElementById('modal-cancel-btn');   // Botón "Cancelar" del modal.
    const modalOverlay = passwordModal ? passwordModal.querySelector('.modal-overlay') : null; // El fondo oscuro del modal.


    // --- COMPROBACIÓN INICIAL DE ELEMENTOS ESENCIALES ---
    // Verifica si todos los elementos HTML necesarios existen. Si falta alguno crítico,
    // muestra un error en la consola y deshabilita los controles para evitar errores posteriores.
    if (!iframeElement || !passwordModal || !modalOkBtn || !modalCancelBtn || !modalOverlay || !unlockBtn || !playlistTracksUl) {
         console.error("Error Crítico: Falta algún elemento HTML esencial (iframe, modal, botón unlock o lista ul). La aplicación no puede continuar.");
         if(trackInfoDiv) trackInfoDiv.textContent = "Error de inicialización de interfaz.";
         // Deshabilitar controles para indicar el problema.
         [playPauseBtn, prevBtn, nextBtn, unlockBtn, progressContainer].forEach(btn => { if(btn) btn.disabled = true; });
         return; // Detiene la ejecución del script.
    }

    // --- INICIALIZACIÓN DEL WIDGET SOUNDCLOUD ---
    // Crea el objeto 'widget' que nos permitirá controlar el iframe de SoundCloud.
    // Requiere que el script 'api.js' de SoundCloud se haya cargado previamente en el HTML.
    const widget = SC.Widget(iframeElement);

    // --- VARIABLES DE ESTADO DE LA APLICACIÓN ---
    // Estas variables mantienen el estado actual del reproductor.
    let isPlaying = false;             // Booleano: true si la música está sonando, false si está pausada.
    let currentTrackId = null;         // String/Number: Almacena el ID único de SoundCloud de la pista que está sonando o cargada.
    let soundsData = [];               // Array: Guarda los objetos de información de todas las pistas de la playlist (obtenidos de getSounds).
    let currentDuration = 0;           // Number: Duración total (en milisegundos) de la pista actual.
    let lockedTrackIds = new Set();    // Set: Colección eficiente para almacenar los IDs de las canciones que han sido bloqueadas individualmente. Inicia vacío (todo desbloqueado).

    // --- VINCULACIÓN CON EVENTOS DEL WIDGET SOUNDCLOUD ---
    // El widget de SoundCloud emite eventos cuando ocurren acciones (listo, reproducir, pausar, etc.).
    // Nos "suscribimos" a estos eventos para actualizar nuestra UI y estado.

    /**
     * Evento READY: Se dispara una vez que el widget está completamente cargado y
     * listo para recibir comandos y responder a llamadas API.
     */
    widget.bind(SC.Widget.Events.READY, () => {
        console.info('Widget SoundCloud listo e inicializado.'); // Log informativo
        if (trackInfoDiv) trackInfoDiv.textContent = 'Reproductor listo.';

        // Intentar obtener la información de la pista que podría estar cargada por defecto.
        widget.getCurrentSound((currentSound) => {
            if (currentSound) {
                updateTrackInfo(currentSound);
                currentTrackId = currentSound.id;
                console.info(`Pista inicial detectada: ${currentSound.title}`);
            } else {
                if (trackInfoDiv) trackInfoDiv.textContent = 'Playlist cargada.';
            }
        });

        // Consultar el estado inicial de reproducción (podría haber empezado por alguna razón).
        widget.isPaused((paused) => {
            isPlaying = !paused;
            updatePlayPauseButton();
        });

        // Obtener la lista completa de sonidos de la playlist cargada en el widget.
        // Se usa un setTimeout como workaround porque, a veces, la API necesita un instante
        // después de READY para tener disponibles todos los metadatos (títulos)
        // de las canciones, especialmente en playlists largas.
        const getSoundsDelay = 1500; // Milisegundos de espera.
        console.info(`Esperando ${getSoundsDelay}ms para obtener lista de sonidos...`);
        setTimeout(() => {
             console.info("Intentando obtener lista de sonidos (widget.getSounds)...");
             widget.getSounds((sounds) => {
                if (sounds && sounds.length > 0) {
                    console.info(`Se obtuvieron ${sounds.length} sonidos de la playlist.`);
                    soundsData = sounds;             // Guardar los datos para uso futuro (ej. botones prev/next).
                    displayPlaylist(sounds);         // Renderizar la lista de canciones en la UI.
                    if (currentTrackId) {
                        highlightCurrentTrack(currentTrackId); // Resaltar la pista inicial si ya la conocíamos.
                    }
                } else {
                    console.warn('widget.getSounds no devolvió sonidos o la lista está vacía.');
                    if (playlistTracksUl) playlistTracksUl.innerHTML = '<li>Error al cargar la lista o está vacía.</li>';
                }
            });
        }, getSoundsDelay);
    });

    /**
     * Evento PLAY: Se dispara cuando la reproducción (re)comienza.
     * Actualiza el estado, la UI y verifica si la pista está bloqueada.
     */
    widget.bind(SC.Widget.Events.PLAY, () => {
        isPlaying = true; updatePlayPauseButton(); // Actualizar estado y botón

        // Obtener info de la canción que acaba de empezar a sonar
        widget.getCurrentSound(sound => {
             if (sound) {
                 // *** Chequeo de Seguridad Anti-Bloqueo ***
                 // Si, por alguna razón (ej. autoplay, fin de canción anterior),
                 // el widget intenta reproducir una pista que está en nuestra lista de bloqueados,
                 // la pausamos inmediatamente.
                 if (lockedTrackIds.has(sound.id)) {
                     console.warn(`¡PREVENIDO! Intento de reproducir pista bloqueada: "${sound.title}" (${sound.id}). Pausando.`);
                     isPlaying = false; updatePlayPauseButton(); widget.pause();
                     // Opcional: intentar saltar a la siguiente pista desbloqueada si esta estaba bloqueada.
                     // findAndPlayNextUnlocked(sound.id); // Implementación requeriría una función adicional.
                     return; // No procesar el resto si está bloqueada.
                 }

                 // Si no está bloqueada, proceder normalmente:
                 console.info(`Reproduciendo: "${sound.title}"`);
                 updateTrackInfo(sound);              // Mostrar título/artista.
                 currentTrackId = sound.id;           // Actualizar ID de la pista actual.
                 highlightCurrentTrack(sound.id);     // Resaltar en la lista.

                 // Obtener y mostrar duración total de la pista.
                 widget.getDuration((duration) => {
                     currentDuration = duration;
                     if (totalDurationSpan) totalDurationSpan.textContent = formatTime(duration);
                     // Resetear barra y tiempo actual al inicio de la nueva pista.
                     if(progressBar) progressBar.style.width = '0%';
                     if(currentTimeSpan) currentTimeSpan.textContent = '0:00';
                 });
             } else {
                 // Esto no debería pasar normalmente si el evento PLAY se disparó.
                 console.warn("Evento PLAY detectado, pero no se pudo obtener información de la pista con getCurrentSound.");
                 isPlaying = false; updatePlayPauseButton(); // Marcar como no sonando por precaución.
             }
        });
    });

    /**
     * Evento PAUSE: Se dispara cuando la reproducción se pausa.
     */
    widget.bind(SC.Widget.Events.PAUSE, () => {
        console.info('Reproducción pausada.');
        isPlaying = false;
        updatePlayPauseButton();
    });

    /**
     * Evento FINISH: Se dispara cuando una pista termina.
     * El widget intentará pasar a la siguiente y disparar PLAY si hay más canciones.
     */
    widget.bind(SC.Widget.Events.FINISH, () => {
        console.info('Pista terminada.');
        // Resetear visualmente la barra de progreso y tiempo actual.
        if (progressBar) progressBar.style.width = '0%';
        if (currentTimeSpan) currentTimeSpan.textContent = '0:00';
    });

    /**
     * Evento ERROR: Se dispara si ocurre un error dentro del widget de SoundCloud.
     */
    widget.bind(SC.Widget.Events.ERROR, (error) => {
        console.error('Error interno del widget de SoundCloud:', error);
        if (trackInfoDiv) trackInfoDiv.textContent = 'Error en el reproductor.';
        // Considerar deshabilitar controles o mostrar un mensaje más persistente.
    });

    /**
     * Evento PLAY_PROGRESS: Se dispara frecuentemente durante la reproducción,
     * indicando la posición actual. Usado para actualizar la barra de progreso.
     */
    widget.bind(SC.Widget.Events.PLAY_PROGRESS, (progressData) => {
        // Solo actualizar si estamos reproduciendo y tenemos una duración válida.
        if (isPlaying && currentDuration > 0 && progressBar && currentTimeSpan) {
            const currentPosition = progressData.currentPosition;
            // Calcular porcentaje (0-100), asegurando que no supere 100.
            const progressPercent = Math.min((currentPosition / currentDuration) * 100, 100);
            // Actualizar el ancho de la barra naranja.
            progressBar.style.width = `${progressPercent}%`;
            // Actualizar el texto del tiempo actual.
            currentTimeSpan.textContent = formatTime(currentPosition);
        }
    });


    // --- FUNCIONES AUXILIARES ---
    // Funciones reutilizables para tareas comunes.

    /**
     * Formatea un tiempo en milisegundos al formato "MM:SS".
     * @param {number} ms - Tiempo en milisegundos.
     * @returns {string} Tiempo formateado.
     */
    function formatTime(ms) {
        if (isNaN(ms) || ms <= 0) { return "0:00"; }
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /** Actualiza el icono (▶️/⏸️) y el título del botón Play/Pause. */
    function updatePlayPauseButton() {
        if (!playPauseBtn) return;
        playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️';
        playPauseBtn.title = isPlaying ? 'Pausar' : 'Reproducir';
    }

    /** Muestra el título y artista (si existe) de la pista actual. */
    function updateTrackInfo(sound) {
        if (!trackInfoDiv) return;
        if (sound) {
            const artist = sound.user && sound.user.username ? ` (${sound.user.username})` : '';
            trackInfoDiv.textContent = `Sonando: ${sound.title || '(Sin título)'}${artist}`;
        } else {
            trackInfoDiv.textContent = isPlaying ? 'Cargando...' : 'Pausado o detenido.';
        }
    }

    /** Quita la clase 'playing' del elemento <li> actualmente resaltado. */
    function removeHighlight() {
        if (!playlistTracksUl) return;
        const playingLi = playlistTracksUl.querySelector('li.playing');
        if (playingLi) {
            playingLi.classList.remove('playing');
        }
    }

    /** Resalta el elemento <li> correspondiente a trackId y hace scroll hacia él. */
    function highlightCurrentTrack(trackId) {
        if (!playlistTracksUl || trackId === null || trackId === undefined) return;
        removeHighlight(); // Quitar resaltado anterior
        const trackElement = playlistTracksUl.querySelector(`li[data-track-id="${String(trackId)}"]`);
        if (trackElement) {
            trackElement.classList.add('playing');
            trackElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    /** Actualiza la apariencia (icono 🔒/🔓 y clase .locked-track) de todos los <li> en la lista. */
    function updateAllTrackAppearances() {
        if (!playlistTracksUl) return;
        const trackItems = playlistTracksUl.querySelectorAll('li[data-track-id]');
        trackItems.forEach(item => {
            const trackId = item.dataset.trackId;
            const lockIcon = item.querySelector('.lock-icon');
            if (!trackId || !lockIcon) return;
            const isLocked = lockedTrackIds.has(trackId);
            lockIcon.textContent = isLocked ? '🔒' : '🔓';
            if (isLocked) { item.classList.add('locked-track'); }
            else { item.classList.remove('locked-track'); }
        });
    }

    // --- Funciones del Modal de Contraseña ---
    function showPasswordModal() { if (!passwordModal || !passwordInput) return; passwordInput.value = ''; passwordModal.style.display = 'block'; passwordInput.focus(); }
    function hidePasswordModal() { if (!passwordModal) return; passwordModal.style.display = 'none'; }

    // --- RENDERIZADO DE LA LISTA DE REPRODUCCIÓN ---

    /**
     * Crea y añade los elementos <li> a la lista <ul> para cada canción.
     * Configura los listeners para reproducir (clic en texto) y bloquear (clic en candado 🔓).
     * @param {Array} sounds - Array de objetos de sonido de SoundCloud.
     */
    function displayPlaylist(sounds) {
        if (!playlistTracksUl) { return; }
        playlistTracksUl.innerHTML = ''; // Limpiar lista existente

        sounds.forEach((sound, index) => {
             // Cada pista necesita un ID para la lógica de bloqueo/resaltado.
             if (!sound || !sound.id) {
                console.warn(`Pista en índice ${index} omitida por falta de ID.`);
                return; // Saltar esta pista
             }
            const trackId = sound.id;

            try {
                const li = document.createElement('li');
                li.dataset.trackId = trackId;      // Guardar ID en el elemento
                li.dataset.trackIndex = index;   // Guardar índice para widget.skip()

                // Crear el span para el texto (Título, Artista) - Este es clicable para reproducir.
                const textSpan = document.createElement('span');
                textSpan.classList.add('track-text');
                const title = sound.title || `Pista ${index + 1}`; // Título o fallback
                const artist = sound.user && sound.user.username ? sound.user.username : null;
                textSpan.textContent = artist ? `${title}, ${artist}` : title; // Formato "Título, Artista"
                li.appendChild(textSpan);

                // Crear el span para el icono de candado - Clicable solo para bloquear (cuando es 🔓).
                const lockSpan = document.createElement('span');
                lockSpan.classList.add('lock-icon');
                lockSpan.dataset.trackId = trackId; // Referencia al ID
                const isLocked = lockedTrackIds.has(trackId); // Comprobar estado actual
                lockSpan.textContent = isLocked ? '🔒' : '🔓'; // Establecer icono inicial
                if (isLocked) {
                    li.classList.add('locked-track'); // Aplicar estilo si está bloqueado
                }
                li.appendChild(lockSpan); // Añadir icono al <li>

                // Listener para el TEXTO: Reproduce la canción si NO está bloqueada.
                textSpan.addEventListener('click', () => {
                    if (lockedTrackIds.has(trackId)) {
                        // Informar al usuario que está bloqueada y cómo desbloquear.
                        alert(`"${textSpan.textContent}" está bloqueada 🔒.\nUsa el botón global 🔓 para desbloquear todas las canciones.`);
                        return; // Impedir reproducción.
                    }
                    // Si no está bloqueada, saltar a esta pista usando su índice.
                    console.info(`Reproduciendo pista ${index} solicitada por clic.`);
                    widget.skip(index);
                });

                // Listener para el CANDADO: Solo permite BLOQUEAR (cuando el icono es 🔓).
                lockSpan.addEventListener('click', (event) => {
                    event.stopPropagation(); // Evita que el clic se propague al textSpan o al li.
                    const currentlyLocked = lockedTrackIds.has(trackId);

                    // Solo actuar si el candado está ABIERTO (la pista no está bloqueada).
                    if (!currentlyLocked) {
                        lockedTrackIds.add(trackId);        // Añadir ID al set de bloqueados.
                        lockSpan.textContent = '🔒';        // Cambiar icono a cerrado.
                        li.classList.add('locked-track');   // Aplicar estilo de bloqueado.
                        console.info(`Pista ${trackId} ("${title}") BLOQUEADA.`);

                        // Si se bloquea la pista que está sonando, pausarla.
                        if (trackId === currentTrackId && isPlaying) {
                            console.info("Pausando reproducción porque la pista actual fue bloqueada.");
                            widget.pause();
                        }
                    } else {
                        // Si el candado ya está cerrado (🔒), no hacer nada al hacer clic.
                        console.info(`Clic en candado bloqueado 🔒 de pista ${trackId}. No hay acción individual de desbloqueo.`);
                        // Se podría añadir un tooltip para informar al usuario.
                        lockSpan.title = "Pista bloqueada. Usa el botón global 🔓 para desbloquear.";
                    }
                });

                // Añadir el elemento <li> completo a la lista <ul>
                playlistTracksUl.appendChild(li);

            } catch (error) {
                // Capturar errores inesperados durante la creación de este <li>
                console.error(`Error al crear el elemento de lista para pista ${index}:`, sound, error);
            }
        });
    }

    // --- EVENT LISTENERS DE LA INTERFAZ DE USUARIO ---

    // Botón Play/Pause
    if (playPauseBtn) { playPauseBtn.addEventListener('click', () => widget.toggle()); }

    // Botón Anterior (busca la pista anterior desbloqueada)
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (!soundsData || soundsData.length === 0) { widget.prev(); return; } // Fallback
            const currentIndex = soundsData.findIndex(sound => sound && sound.id === currentTrackId);
            if (currentIndex === -1) { widget.prev(); return; } // Fallback

            let targetIndex = -1;
            for (let i = currentIndex - 1; i >= 0; i--) { // Buscar hacia atrás
                if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
            }
            if (targetIndex === -1) { // Loop: buscar desde el final
                for (let i = soundsData.length - 1; i > currentIndex; i--) {
                     if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
                }
            }
            if (targetIndex !== -1) widget.skip(targetIndex);
            else console.info("No se encontró pista anterior desbloqueada.");
        });
    }

    // Botón Siguiente (busca la pista siguiente desbloqueada)
    if (nextBtn) {
       nextBtn.addEventListener('click', () => {
            if (!soundsData || soundsData.length === 0) { widget.next(); return; } // Fallback
            const currentIndex = soundsData.findIndex(sound => sound && sound.id === currentTrackId);
            if (currentIndex === -1) { widget.next(); return; } // Fallback

            let targetIndex = -1;
            for (let i = currentIndex + 1; i < soundsData.length; i++) { // Buscar hacia adelante
                if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
            }
            if (targetIndex === -1) { // Loop: buscar desde el principio
                 for (let i = 0; i < currentIndex; i++) {
                     if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
                 }
            }
            if (targetIndex !== -1) widget.skip(targetIndex);
            else console.info("No se encontró pista siguiente desbloqueada.");
        });
    }

    // Barra de Progreso (Seeking al hacer clic)
    if (progressContainer) {
        progressContainer.addEventListener('click', (event) => {
            if (currentDuration <= 0) return; // No buscar si no hay duración
            const containerWidth = progressContainer.offsetWidth;
            const clickPositionX = event.offsetX;
            const clickPercent = Math.max(0, Math.min(1, clickPositionX / containerWidth)); // Porcentaje (0-1)
            const seekTimeMs = Math.floor(clickPercent * currentDuration); // Tiempo en ms

            // Actualizar UI inmediatamente para feedback visual
            if (progressBar) progressBar.style.width = `${clickPercent * 100}%`;
            if (currentTimeSpan) currentTimeSpan.textContent = formatTime(seekTimeMs);
            // Enviar comando de seek al widget
            widget.seekTo(seekTimeMs);
        });
    }

    // Botón de Desbloqueo Global (muestra el modal)
    if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
            // Solo mostrar modal si *hay* canciones bloqueadas
            if (lockedTrackIds.size === 0) {
                 alert("Actualmente no hay ninguna canción bloqueada.");
                 return;
            }
            showPasswordModal();
        });
    }

    // Botón OK del Modal (verifica contraseña y desbloquea todo)
    if (modalOkBtn) {
        modalOkBtn.addEventListener('click', () => {
            const enteredPassword = passwordInput.value;
            if (enteredPassword === "12345") { // Contraseña correcta
                console.info("Contraseña global correcta. Desbloqueando todas las pistas...");
                lockedTrackIds.clear();          // Vaciar el Set
                updateAllTrackAppearances();     // Actualizar la UI de todos los candados
                alert("¡Todas las canciones han sido desbloqueadas!");
                hidePasswordModal();             // Cerrar modal
            } else { // Contraseña incorrecta
                alert("Contraseña incorrecta.");
                passwordInput.focus();           // Mantener foco
                passwordInput.select();          // Seleccionar para reescribir
            }
        });
    }

    // Botón Cancelar del Modal
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hidePasswordModal);
    }

    // Clic en el Overlay del Modal (fondo) también lo cierra
     if (modalOverlay) {
        modalOverlay.addEventListener('click', hidePasswordModal);
    }

     // Permitir enviar contraseña presionando Enter
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // Evitar comportamiento por defecto
                modalOkBtn.click(); // Simular clic en el botón OK
            }
        });
    }

}); // Fin de DOMContentLoaded