// static/script.js
/**
 * Script principal para controlar el reproductor de música SoundCloud personalizado.
 * Maneja la interfaz de usuario (botones, barra de progreso, lista de canciones),
 * interactúa con la API del Widget de SoundCloud para la reproducción,
 * y gestiona un sistema de bloqueo/desbloqueo de canciones individuales y global.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    // Elementos principales del reproductor
    const iframeElement = document.getElementById('soundcloud-widget');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const unlockBtn = document.getElementById('unlock-btn'); // Botón de desbloqueo global
    const trackInfoDiv = document.getElementById('track-info');
    const playlistTracksUl = document.getElementById('playlist-tracks');
    // Elementos de la barra de progreso
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-container');
    const currentTimeSpan = document.getElementById('current-time');
    const totalDurationSpan = document.getElementById('total-duration');
    // Elementos del Modal de Contraseña
    const passwordModal = document.getElementById('password-modal');
    const passwordInput = document.getElementById('password-input');
    const modalOkBtn = document.getElementById('modal-ok-btn');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalOverlay = passwordModal ? passwordModal.querySelector('.modal-overlay') : null;

    // --- COMPROBACIÓN INICIAL DE ELEMENTOS ESENCIALES ---
    // Si falta alguno de los elementos críticos, muestra un error y detiene la ejecución.
    if (!iframeElement || !passwordModal || !modalOkBtn || !modalCancelBtn || !modalOverlay || !unlockBtn || !playlistTracksUl) {
         console.error("Error Crítico: Falta algún elemento HTML esencial (iframe, modal, botón unlock o lista ul).");
         if(trackInfoDiv) trackInfoDiv.textContent = "Error de inicialización de interfaz.";
         // Deshabilitar controles principales si falta algo
         [playPauseBtn, prevBtn, nextBtn, unlockBtn, progressContainer].forEach(btn => { if(btn) btn.disabled = true; });
         return; // Detener el script
    }

    // --- INICIALIZACIÓN DEL WIDGET SOUNDCLOUD ---
    // Crea el objeto 'widget' que interactuará con el iframe. Requiere que api.js se haya cargado.
    const widget = SC.Widget(iframeElement);

    // --- VARIABLES DE ESTADO DE LA APLICACIÓN ---
    let isPlaying = false;             // Indica si la música está actualmente reproduciéndose.
    let currentTrackId = null;         // Almacena el ID de SoundCloud de la pista actual.
    let soundsData = [];               // Array para guardar los objetos de sonido recibidos de la API.
    let currentDuration = 0;           // Duración total (en ms) de la pista actual.
    let lockedTrackIds = new Set();    // Un Set para almacenar los IDs de las canciones bloqueadas individualmente. Inicia vacío (desbloqueado).

    // --- VINCULACIÓN CON EVENTOS DEL WIDGET SOUNDCLOUD ---
    // Se usan callbacks para reaccionar a acciones que ocurren dentro del iframe.

    /**
     * Evento READY: Se dispara cuando el widget está listo para recibir comandos.
     * Es el punto de entrada principal para inicializar el estado y obtener datos.
     */
    widget.bind(SC.Widget.Events.READY, () => {
        console.log('Widget SoundCloud listo.');
        if (trackInfoDiv) trackInfoDiv.textContent = 'Reproductor listo.';

        // Obtener información de la pista inicial (si la hay cargada por defecto)
        widget.getCurrentSound((currentSound) => {
            if (currentSound) {
                updateTrackInfo(currentSound);
                currentTrackId = currentSound.id;
            } else {
                if (trackInfoDiv) trackInfoDiv.textContent = 'Playlist cargada.';
            }
        });

        // Comprobar si ya está reproduciendo (puede pasar si el usuario interactuó rápido)
        widget.isPaused((paused) => {
            isPlaying = !paused;
            updatePlayPauseButton();
        });

        // Obtener la lista de sonidos de la playlist.
        // Se usa un setTimeout porque a veces el widget necesita un instante extra
        // después de READY para tener los metadatos (títulos) de todas las canciones,
        // especialmente en playlists largas.
        const getSoundsDelay = 1500; // Retraso en milisegundos. Ajustar si es necesario.
        console.log(`Esperando ${getSoundsDelay}ms antes de llamar a getSounds()...`);
        setTimeout(() => {
             console.log("Intentando obtener lista de sonidos (getSounds)...");
             widget.getSounds((sounds) => {
                if (sounds) {
                    console.log(`Número de sonidos recibidos por la API: ${sounds.length}`);
                }

                if (sounds && sounds.length > 0) {
                    soundsData = sounds; // Guardar datos para referencia futura
                    displayPlaylist(sounds); // Renderizar la lista en la UI
                    // Si ya teníamos una pista cargada al inicio, resaltarla ahora que la lista existe
                    if (currentTrackId) {
                        highlightCurrentTrack(currentTrackId);
                    }
                } else {
                    console.warn('getSounds no devolvió sonidos o la lista está vacía.');
                    if (playlistTracksUl) playlistTracksUl.innerHTML = '<li>Lista no disponible o vacía.</li>';
                }
            });
        }, getSoundsDelay);
    });

    /**
     * Evento PLAY: Se dispara cuando la reproducción comienza o se reanuda.
     * Crucial para actualizar la UI y verificar si la pista que va a sonar está bloqueada.
     */
    widget.bind(SC.Widget.Events.PLAY, () => {
        isPlaying = true; // Asumir que empieza, luego verificar bloqueo
        updatePlayPauseButton();

        widget.getCurrentSound(sound => {
             if (sound) {
                 // --- ¡IMPORTANTE! Verificar si la pista está bloqueada ANTES de hacer nada más ---
                 if (lockedTrackIds.has(sound.id)) {
                     console.warn(`PLAY BLOQUEADO: La pista "${sound.title}" (${sound.id}) está bloqueada.`);
                     isPlaying = false; // Corregir el estado
                     updatePlayPauseButton();
                     widget.pause(); // Forzar pausa inmediata
                     // Opcional: Intentar saltar a la siguiente pista automáticamente
                     const currentIndex = soundsData.findIndex(s => s.id === sound.id);
                     if (currentIndex > -1 && currentIndex < soundsData.length - 1) {
                         console.log("Intentando saltar a la siguiente pista...");
                         setTimeout(() => widget.next(), 100); // Pequeño delay para evitar bucles
                     }
                     return; // Detener el procesamiento de este evento PLAY
                 }

                 // --- Si la pista NO está bloqueada, proceder normalmente ---
                 console.log(`Evento PLAY procesado para: "${sound.title}"`);
                 updateTrackInfo(sound); // Mostrar nombre de la pista
                 currentTrackId = sound.id; // Actualizar ID de la pista actual
                 highlightCurrentTrack(sound.id); // Resaltar en la lista

                 // Obtener y mostrar la duración total de la nueva pista
                 widget.getDuration((duration) => {
                     currentDuration = duration;
                     if (totalDurationSpan) totalDurationSpan.textContent = formatTime(duration);
                     console.log(`Duración: ${formatTime(duration)}`);
                     // Resetear barra y tiempo al inicio de la pista
                     if(progressBar) progressBar.style.width = '0%';
                     if(currentTimeSpan) currentTimeSpan.textContent = '0:00';
                 });
             } else {
                 console.warn("Evento PLAY recibido pero no se pudo obtener info de la pista actual.");
             }
        });
    });

    /**
     * Evento PAUSE: Se dispara cuando la reproducción se pausa.
     */
    widget.bind(SC.Widget.Events.PAUSE, () => {
        console.log('Evento PAUSE recibido');
        isPlaying = false;
        updatePlayPauseButton();
    });

    /**
     * Evento FINISH: Se dispara cuando una pista termina de reproducirse.
     * El widget normalmente pasa a la siguiente y dispara un evento PLAY.
     */
    widget.bind(SC.Widget.Events.FINISH, () => {
        console.log('Evento FINISH recibido (pista terminada)');
        // Resetear la barra de progreso visualmente
        if (progressBar) progressBar.style.width = '0%';
        if (currentTimeSpan) currentTimeSpan.textContent = '0:00';
        // No es necesario resetear currentDuration aquí, el evento PLAY de la siguiente pista lo hará.
    });

    /**
     * Evento ERROR: Se dispara si ocurre un error dentro del widget.
     */
    widget.bind(SC.Widget.Events.ERROR, (error) => {
        console.error('Error del widget de SoundCloud:', error);
        if (trackInfoDiv) trackInfoDiv.textContent = 'Error en el reproductor.';
    });

    /**
     * Evento PLAY_PROGRESS: Se dispara repetidamente mientras la canción suena,
     * proporcionando la posición actual. Usado para actualizar la barra de progreso.
     * @param {object} progressData - Objeto con { currentPosition: ms, relativePosition: 0-1 }
     */
    widget.bind(SC.Widget.Events.PLAY_PROGRESS, (progressData) => {
        // Actualizar solo si estamos reproduciendo y tenemos una duración válida
        if (isPlaying && currentDuration > 0 && progressBar && currentTimeSpan) {
            const currentPosition = progressData.currentPosition;
            // Calcular porcentaje, asegurando que no exceda 100% por errores de redondeo.
            const progressPercent = Math.min((currentPosition / currentDuration) * 100, 100);

            progressBar.style.width = `${progressPercent}%`;
            currentTimeSpan.textContent = formatTime(currentPosition);
        }
    });


    // --- FUNCIONES AUXILIARES ---

    /**
     * Formatea un tiempo en milisegundos al formato "MM:SS".
     * @param {number} ms - Tiempo en milisegundos.
     * @returns {string} Tiempo formateado o "0:00" si la entrada no es válida.
     */
    function formatTime(ms) {
        if (isNaN(ms) || ms <= 0) { return "0:00"; }
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        // padStart(2, '0') añade un cero inicial a los segundos si son menores a 10 (ej. 5 -> "05")
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /** Actualiza el icono y el título del botón Play/Pause según el estado 'isPlaying'. */
    function updatePlayPauseButton() {
        if (!playPauseBtn) return;
        playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️';
        playPauseBtn.title = isPlaying ? 'Pausar' : 'Reproducir';
    }

    /** Muestra el título y artista de la pista actual en el div #track-info. */
    function updateTrackInfo(sound) {
        if (!trackInfoDiv) return;
        if (sound) {
            // Intenta obtener el nombre de usuario (artista), si no existe, muestra solo el título.
            const artistUsername = sound.user && sound.user.username ? ` (${sound.user.username})` : '';
            trackInfoDiv.textContent = `Sonando: ${sound.title}${artistUsername}`;
        } else {
            // Texto por defecto si no hay información de pista
            trackInfoDiv.textContent = isPlaying ? 'Cargando información...' : 'Pausado o detenido.';
        }
    }

    /** Quita la clase 'playing' de cualquier elemento <li> que la tenga en la lista. */
    function removeHighlight() {
        if (!playlistTracksUl) return;
        const currentlyPlayingElement = playlistTracksUl.querySelector('li.playing');
        if (currentlyPlayingElement) {
            currentlyPlayingElement.classList.remove('playing');
        }
    }

    /**
     * Añade la clase 'playing' al elemento <li> correspondiente al trackId dado
     * y hace scroll para que sea visible.
     * @param {number|string} trackId - El ID de la pista a resaltar.
     */
    function highlightCurrentTrack(trackId) {
        if (!playlistTracksUl || trackId === null || trackId === undefined) return;
        removeHighlight(); // Primero quitar resaltado anterior
        // Construir selector CSS para encontrar el li por su data-attribute
        const selector = `li[data-track-id="${String(trackId)}"]`;
        const trackElement = playlistTracksUl.querySelector(selector);
        if (trackElement) {
            trackElement.classList.add('playing');
            // Hacer scroll suave para que el elemento sea visible si la lista es larga
            trackElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
             // console.warn(`highlightCurrentTrack: No se encontró li para trackId: ${trackId}`); // Log opcional
        }
    }

    /**
     * Itera sobre todos los elementos <li> de la playlist y actualiza su icono
     * de candado (🔒/🔓) y la clase 'locked-track' según el estado actual
     * del Set `lockedTrackIds`. Se usa después del desbloqueo global.
     */
    function updateAllTrackAppearances() {
        if (!playlistTracksUl) return;
        const trackItems = playlistTracksUl.querySelectorAll('li[data-track-id]');
        console.log("Actualizando apariencia global de candados...");
        trackItems.forEach(item => {
            const trackId = item.dataset.trackId;
            const lockIcon = item.querySelector('.lock-icon');
            if (!trackId || !lockIcon) return; // Saltar si falta ID o icono

            if (lockedTrackIds.has(trackId)) {
                // Estado Bloqueado
                lockIcon.textContent = '🔒';
                item.classList.add('locked-track');
            } else {
                // Estado Desbloqueado
                lockIcon.textContent = '🔓';
                item.classList.remove('locked-track');
            }
        });
    }

    // --- FUNCIONES DEL MODAL DE CONTRASEÑA ---

    /** Muestra el modal de contraseña, limpia el input y pone el foco. */
    function showPasswordModal() {
        if (!passwordModal || !passwordInput) return;
        passwordInput.value = ''; // Limpiar contraseña anterior
        passwordModal.style.display = 'block';
        passwordInput.focus(); // Poner el cursor en el campo de contraseña
    }

    /** Oculta el modal de contraseña. */
    function hidePasswordModal() {
        if (!passwordModal) return;
        passwordModal.style.display = 'none';
    }

    // --- FUNCIÓN PRINCIPAL DE RENDERIZADO DE LA LISTA ---

    /**
     * Genera los elementos <li> para cada canción en la playlist,
     * añadiendo el texto (título, artista) y el icono de candado.
     * Configura los event listeners para el texto (reproducir) y el candado (bloquear).
     * @param {Array} sounds - Array de objetos de sonido de la API.
     */
    function displayPlaylist(sounds) {
        if (!playlistTracksUl) {
            console.error("Error: Elemento UL #playlist-tracks no encontrado.");
            return;
        }
        playlistTracksUl.innerHTML = ''; // Limpiar lista anterior

        sounds.forEach((sound, index) => {
            // Es crucial tener un ID para la lógica de bloqueo/resaltado
             if (!sound || !sound.id) {
                console.warn(`Sonido en índice ${index} omitido por falta de ID.`);
                return; // Saltar a la siguiente iteración si no hay ID
             }
            const trackId = sound.id;

            try {
                // Crear elemento principal de la lista
                const li = document.createElement('li');
                li.dataset.trackId = trackId; // Guardar ID para referencia futura
                li.dataset.trackIndex = index; // Guardar índice para widget.skip()

                // Crear span para el texto clicable (Título, Artista)
                const textSpan = document.createElement('span');
                textSpan.classList.add('track-text');
                const title = sound.title || `Pista ${index + 1} (Título desconocido)`; // Fallback
                const artist = sound.user && sound.user.username ? sound.user.username : null;
                textSpan.textContent = artist ? `${title}, ${artist}` : title;
                li.appendChild(textSpan);

                // Crear span para el icono de candado (Clicable solo para bloquear)
                const lockSpan = document.createElement('span');
                lockSpan.classList.add('lock-icon');
                lockSpan.dataset.trackId = trackId; // Asociar ID también al icono
                // Determinar estado inicial del candado y clase del <li>
                const isLocked = lockedTrackIds.has(trackId);
                lockSpan.textContent = isLocked ? '🔒' : '🔓';
                if (isLocked) {
                    li.classList.add('locked-track');
                }
                li.appendChild(lockSpan); // Añadir candado al final del <li>

                // --- Event Listener para el TEXTO de la canción (Reproducir) ---
                textSpan.addEventListener('click', () => {
                    // Comprobar si esta pista está bloqueada ANTES de reproducir
                    if (lockedTrackIds.has(trackId)) {
                        console.log(`Clic en texto de pista bloqueada: "${textSpan.textContent}"`);
                        alert(`"${textSpan.textContent}" está bloqueada 🔒.\nUsa el botón global 🔓 para desbloquear todas.`);
                        return; // No hacer nada si está bloqueada
                    }
                    // Si no está bloqueada, llamar a widget.skip() con el índice guardado
                    console.log(`Reproduciendo pista ${index}: "${textSpan.textContent}"`);
                    widget.skip(index);
                });

                // --- Event Listener para el ICONO de candado (SOLO para Bloquear) ---
                lockSpan.addEventListener('click', (event) => {
                    event.stopPropagation(); // Evitar que el clic se propague al textSpan o li

                    const currentlyLocked = lockedTrackIds.has(trackId);

                    // Solo ejecutar la acción de bloqueo si NO está bloqueada actualmente (icono es 🔓)
                    if (!currentlyLocked) {
                        lockedTrackIds.add(trackId);    // Añadir al Set de bloqueados
                        lockSpan.textContent = '🔒';    // Cambiar icono visualmente
                        li.classList.add('locked-track'); // Aplicar estilo de bloqueado
                        console.log(`Track ${trackId} (${title}) BLOQUEADO.`);

                        // Si se acaba de bloquear la canción que está sonando, pausarla.
                        if (trackId === currentTrackId && isPlaying) {
                            console.log("Canción actual bloqueada mientras sonaba, pausando...");
                            widget.pause();
                        }
                    } else {
                        // Si el icono ya es 🔒 (currentlyLocked es true), no hacer nada.
                        console.log(`Clic en candado bloqueado 🔒 para track ${trackId}. No se desbloquea individualmente.`);
                        // Opcionalmente, añadir un tooltip o feedback
                        lockSpan.title = "Esta canción está bloqueada. Usa el botón global 🔓 para desbloquear todo.";
                    }
                     // console.log("IDs bloqueados actuales:", lockedTrackIds); // Log opcional
                });

                // Añadir el elemento <li> completo a la lista <ul>
                playlistTracksUl.appendChild(li);

            } catch (error) {
                // Capturar errores inesperados durante la creación del elemento li
                console.error(`Error al procesar la pista en el índice ${index}:`, sound, error);
            }
        });
    }

    // --- CONEXIÓN DE EVENT LISTENERS DE LA UI (Botones, Barra, Modal) ---

    // Botones de Control Principales (Prev/Play/Next)
    if (playPauseBtn) { playPauseBtn.addEventListener('click', () => widget.toggle()); }
    if (prevBtn) { prevBtn.addEventListener('click', () => widget.prev()); } // El evento PLAY manejará chequeos de bloqueo
    if (nextBtn) { nextBtn.addEventListener('click', () => widget.next()); } // El evento PLAY manejará chequeos de bloqueo

    // Barra de Progreso (Seeking)
    if (progressContainer) {
        progressContainer.addEventListener('click', (event) => {
            if (currentDuration <= 0) return; // No buscar si no hay duración
            const containerWidth = progressContainer.offsetWidth;
            const clickPositionX = event.offsetX;
            // Calcular porcentaje asegurando que esté entre 0 y 1
            const clickPercent = Math.max(0, Math.min(1, clickPositionX / containerWidth));
            const seekTimeMs = Math.floor(clickPercent * currentDuration);

            // Actualizar UI inmediatamente para feedback visual
            if (progressBar) progressBar.style.width = `${clickPercent * 100}%`;
            if (currentTimeSpan) currentTimeSpan.textContent = formatTime(seekTimeMs);
            // Enviar comando de seek al widget
            widget.seekTo(seekTimeMs);
        });
    }

    // Botón de Desbloqueo Global
    if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
            // Solo mostrar el modal si hay al menos una canción bloqueada
            if (lockedTrackIds.size === 0) {
                 alert("Actualmente no hay ninguna canción bloqueada.");
                 return;
            }
            showPasswordModal(); // Mostrar el modal para pedir contraseña
        });
    }

    // Botón OK del Modal (Verificar contraseña y desbloquear)
    if (modalOkBtn) {
        modalOkBtn.addEventListener('click', () => {
            const enteredPassword = passwordInput.value;
            if (enteredPassword === "12345") { // Contraseña correcta
                console.log("Contraseña global correcta. Desbloqueando todo...");
                lockedTrackIds.clear();          // Vaciar el Set de IDs bloqueados
                updateAllTrackAppearances();     // Actualizar todos los candados y estilos en la UI
                alert("¡Todas las canciones han sido desbloqueadas!");
                hidePasswordModal();             // Ocultar el modal
            } else { // Contraseña incorrecta
                alert("Contraseña incorrecta.");
                passwordInput.focus();           // Devolver foco al input
                passwordInput.select();          // Seleccionar texto para fácil reescritura
            }
        });
    }

    // Botón Cancelar del Modal
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hidePasswordModal);
    }

    // Clic en el Overlay (fondo oscuro) del Modal también lo cierra
     if (modalOverlay) {
        modalOverlay.addEventListener('click', hidePasswordModal);
    }

     // Permitir enviar la contraseña presionando Enter en el input
    if (passwordInput) {
        passwordInput.addEventListener('keypress', function (e) {
            // Si la tecla presionada es Enter
            if (e.key === 'Enter') {
                e.preventDefault();    // Evitar comportamiento por defecto (ej. submit de formulario)
                modalOkBtn.click();    // Simular un clic en el botón OK
            }
        });
    }

}); // Fin de DOMContentLoaded