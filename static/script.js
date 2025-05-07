// static/script.js
/**
 * Script principal para controlar un reproductor de música web personalizado.
 * Este script maneja la interfaz de usuario (botones, barra de progreso, lista de reproducción),
 * interactúa con la API del Widget de SoundCloud para controlar la reproducción de audio,
 * y gestiona un sistema de bloqueo/desbloqueo de canciones, donde las canciones
 * pueden ser bloqueadas individualmente y solo desbloqueadas globalmente mediante contraseña.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    // Se obtienen y guardan referencias a los elementos HTML con los que se interactuará,
    // para evitar búsquedas repetidas en el DOM, lo cual es más eficiente.

    // Elementos principales del reproductor
    const iframeElement = document.getElementById('soundcloud-widget');      // El iframe que contiene el widget de SoundCloud.
    const playPauseBtn = document.getElementById('play-pause-btn');       // Botón para reproducir/pausar la música.
    const prevBtn = document.getElementById('prev-btn');                // Botón para ir a la pista anterior.
    const nextBtn = document.getElementById('next-btn');                // Botón para ir a la pista siguiente.
    const unlockBtn = document.getElementById('unlock-btn');              // Botón para el desbloqueo global de todas las pistas.
    const trackInfoDiv = document.getElementById('track-info');           // Div donde se muestra el título y artista de la pista actual.
    const playlistTracksUl = document.getElementById('playlist-tracks');    // Lista <ul> que contendrá los elementos de la playlist.

    // Elementos de la barra de progreso y tiempos
    const progressBar = document.getElementById('progress-bar');          // La barra naranja que indica el progreso de reproducción.
    const progressContainer = document.getElementById('progress-container'); // El contenedor de la barra (para clics de 'seek').
    const currentTimeSpan = document.getElementById('current-time');      // Span para mostrar el tiempo de reproducción actual.
    const totalDurationSpan = document.getElementById('total-duration');    // Span para mostrar la duración total de la pista.

    // Elementos del Modal de Contraseña (para desbloqueo global)
    const passwordModal = document.getElementById('password-modal');       // El div principal del modal.
    const passwordInput = document.getElementById('password-input');     // El campo <input type="password">.
    const modalOkBtn = document.getElementById('modal-ok-btn');           // Botón "Desbloquear" dentro del modal.
    const modalCancelBtn = document.getElementById('modal-cancel-btn');   // Botón "Cancelar" dentro del modal.
    const modalOverlay = passwordModal ? passwordModal.querySelector('.modal-overlay') : null; // El fondo semitransparente del modal.


    // --- COMPROBACIÓN INICIAL DE ELEMENTOS ESENCIALES ---
    // Verifica si todos los elementos HTML críticos existen en el DOM.
    // Si alguno falta, se muestra un error en la consola, se informa al usuario
    // y se deshabilitan los controles para prevenir errores de ejecución.
    if (!iframeElement || !passwordModal || !modalOkBtn || !modalCancelBtn || !modalOverlay || !unlockBtn || !playlistTracksUl) {
         console.error("Error Crítico: Falta algún elemento HTML esencial (iframe, modal, botón unlock o lista ul). La aplicación no puede inicializarse correctamente.");
         if(trackInfoDiv) trackInfoDiv.textContent = "Error de inicialización de interfaz. Recargue la página.";
         // Deshabilitar controles para indicar visualmente el problema.
         [playPauseBtn, prevBtn, nextBtn, unlockBtn, progressContainer].forEach(btn => { if(btn) btn.disabled = true; });
         return; // Detiene la ejecución del script.
    }

    // --- INICIALIZACIÓN DEL WIDGET SOUNDCLOUD ---
    // Crea el objeto 'widget' que interactuará con el iframe de SoundCloud.
    // Esto es posible gracias al script 'api.js' de SoundCloud cargado en el HTML.
    const widget = SC.Widget(iframeElement);

    // --- VARIABLES DE ESTADO DE LA APLICACIÓN ---
    // Estas variables mantienen el estado actual del reproductor y la interacción.
    let isPlaying = false;             // Booleano: true si la música está sonando, false si está pausada o detenida.
    let currentTrackId = null;         // String/Number: ID de SoundCloud de la pista actual. Null si no hay ninguna cargada.
    let soundsData = [];               // Array: Almacena los objetos de información de todas las pistas de la playlist.
    let currentDuration = 0;           // Number: Duración total (en milisegundos) de la pista actual.
    let lockedTrackIds = new Set();    // Set: Colección para almacenar los IDs de las canciones bloqueadas individualmente. Inicia vacío (todo desbloqueado).


    // --- VINCULACIÓN CON EVENTOS DEL WIDGET SOUNDCLOUD ---
    // El widget emite eventos. Nos "suscribimos" a ellos para reaccionar y actualizar nuestra aplicación.

    /**
     * Evento READY: Se dispara cuando el widget está listo para recibir comandos.
     * Es el punto de partida para configurar el estado inicial y obtener datos.
     */
    widget.bind(SC.Widget.Events.READY, () => {
        console.info('Widget SoundCloud: Listo.');
        if (trackInfoDiv) trackInfoDiv.textContent = 'Reproductor listo.';

        widget.getCurrentSound((currentSound) => { // Obtener pista cargada por defecto (si hay)
            if (currentSound) {
                updateTrackInfo(currentSound);
                currentTrackId = currentSound.id;
            } else {
                if (trackInfoDiv) trackInfoDiv.textContent = 'Playlist cargada.';
            }
        });
        widget.isPaused((paused) => { isPlaying = !paused; updatePlayPauseButton(); }); // Sincronizar estado de reproducción

        // Obtener lista de sonidos. Se usa setTimeout porque el widget puede tardar
        // un poco más después de READY en tener todos los metadatos de playlists largas.
        const getSoundsDelay = 1500; // Ajustar si es necesario.
        setTimeout(() => {
             widget.getSounds((sounds) => {
                if (sounds && sounds.length > 0) {
                    console.info(`Se obtuvieron ${sounds.length} sonidos de la playlist.`);
                    soundsData = sounds;
                    displayPlaylist(sounds); // Renderizar la lista
                    if (currentTrackId) { highlightCurrentTrack(currentTrackId); } // Resaltar si ya había una pista
                } else {
                    console.warn('getSounds: No se devolvieron sonidos o la lista está vacía.');
                    if (playlistTracksUl) playlistTracksUl.innerHTML = '<li>Error al cargar la lista o está vacía.</li>';
                }
            });
        }, getSoundsDelay);
    });

    /**
     * Evento PLAY: Se dispara cuando la reproducción (re)comienza.
     * Es crucial para actualizar UI, estado, y manejar el reinicio de pistas nuevas.
     */
    widget.bind(SC.Widget.Events.PLAY, () => {
        const previousTrackIdOnPlay = currentTrackId; // Guardar ID de la pista anterior a este evento PLAY

        isPlaying = true; updatePlayPauseButton(); // Actualizar estado y botón

        widget.getCurrentSound(sound => {
             if (sound) {
                 // Chequeo de bloqueo: Si la pista que va a sonar está bloqueada, pausarla.
                 if (lockedTrackIds.has(sound.id)) {
                     console.warn(`PLAY BLOQUEADO: La pista "${sound.title || 'Desconocida'}" (${sound.id}) está bloqueada. Pausando.`);
                     isPlaying = false; updatePlayPauseButton(); widget.pause();
                     // Opcional: intentar saltar a la siguiente pista desbloqueada
                     // const currentIndex = soundsData.findIndex(s => s && s.id === sound.id);
                     // if (currentIndex > -1 && currentIndex < soundsData.length - 1) { setTimeout(() => widget.next(), 100); }
                     return; // No continuar si está bloqueada
                 }

                 // Si no está bloqueada, proceder con la reproducción
                 currentTrackId = sound.id; // Actualizar al ID de la pista que AHORA está sonando
                 console.info(`Reproduciendo: "${sound.title || 'Desconocida'}" (ID: ${currentTrackId})`);
                 updateTrackInfo(sound);
                 highlightCurrentTrack(currentTrackId);

                 // Determinar si es una pista nueva o una reanudación de la misma
                 const isNewTrackSelection = (previousTrackIdOnPlay === null || previousTrackIdOnPlay !== currentTrackId);

                 widget.getDuration((duration) => { // Obtener duración
                     currentDuration = duration;
                     if (totalDurationSpan) totalDurationSpan.textContent = formatTime(duration);

                     if (isNewTrackSelection) { // Si es una pista nueva (no una reanudación)
                         console.info("Nueva pista detectada, reiniciando su progreso a 0:00.");
                         widget.seekTo(0); // Forzar inicio desde el principio
                         if(progressBar) progressBar.style.width = '0%';
                         if(currentTimeSpan) currentTimeSpan.textContent = '0:00';
                     } else { // Si es una reanudación de la misma pista
                         console.info("Reanudando pista existente desde su posición actual.");
                         // Opcional: Sincronizar UI de progreso explícitamente (PLAY_PROGRESS también lo hace)
                         widget.getPosition((currentPosition) => {
                             if (currentDuration > 0 && progressBar && currentTimeSpan) {
                                 const progressPercent = Math.min((currentPosition / currentDuration) * 100, 100);
                                 progressBar.style.width = `${progressPercent}%`;
                                 currentTimeSpan.textContent = formatTime(currentPosition);
                             }
                         });
                     }
                 });
             } else {
                 console.warn("Evento PLAY, pero getCurrentSound no devolvió información de la pista.");
                 isPlaying = false; updatePlayPauseButton(); // Marcar como no sonando por seguridad
             }
        });
    });

    /** Evento PAUSE: Se dispara al pausar. */
    widget.bind(SC.Widget.Events.PAUSE, () => { console.info('Reproducción pausada.'); isPlaying = false; updatePlayPauseButton(); });
    /** Evento FINISH: Se dispara al terminar una pista. El widget intentará pasar a la siguiente. */
    widget.bind(SC.Widget.Events.FINISH, () => { console.info('Pista terminada.'); if (progressBar) progressBar.style.width = '0%'; if (currentTimeSpan) currentTimeSpan.textContent = '0:00'; });
    /** Evento ERROR: Se dispara por errores internos del widget. */
    widget.bind(SC.Widget.Events.ERROR, (error) => { console.error('Error del widget de SoundCloud:', error); if (trackInfoDiv) trackInfoDiv.textContent = 'Error en el reproductor.'; });
    /** Evento PLAY_PROGRESS: Se dispara durante la reproducción para indicar el progreso. */
    widget.bind(SC.Widget.Events.PLAY_PROGRESS, (progressData) => { if (isPlaying && currentDuration > 0 && progressBar && currentTimeSpan) { const cPos = progressData.currentPosition; const pPerc = Math.min((cPos / currentDuration) * 100, 100); progressBar.style.width = `${pPerc}%`; currentTimeSpan.textContent = formatTime(cPos); } });


    // --- FUNCIONES AUXILIARES ---
    // Conjunto de funciones reutilizables para diversas tareas.

    /** Formatea milisegundos a una cadena "MM:SS". */
    function formatTime(ms) { if (isNaN(ms) || ms <= 0) { return "0:00"; } const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
    /** Actualiza el icono y título del botón Play/Pause. */
    function updatePlayPauseButton() { if (!playPauseBtn) return; playPauseBtn.textContent = isPlaying ? '⏸️' : '▶️'; playPauseBtn.title = isPlaying ? 'Pausar' : 'Reproducir'; }
    /** Muestra el título y artista (si existe) de la pista actual. */
    function updateTrackInfo(sound) { if (!trackInfoDiv) return; if (sound) { const artist = sound.user && sound.user.username ? ` (${sound.user.username})` : ''; trackInfoDiv.textContent = `Sonando: ${sound.title || '(Sin título)'}${artist}`; } else { trackInfoDiv.textContent = isPlaying ? 'Cargando...' : 'Pausado.'; } }
    /** Quita la clase 'playing' de cualquier <li> resaltado en la lista. */
    function removeHighlight() { if (!playlistTracksUl) return; const el = playlistTracksUl.querySelector('li.playing'); if (el) el.classList.remove('playing'); }
    /** Añade la clase 'playing' al <li> del trackId y hace scroll. */
    function highlightCurrentTrack(trackId) { if (!playlistTracksUl || trackId === null || trackId === undefined) return; removeHighlight(); const el = playlistTracksUl.querySelector(`li[data-track-id="${String(trackId)}"]`); if (el) { el.classList.add('playing'); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }
    /** Actualiza la UI (icono 🔒/🔓 y clase .locked-track) de todos los <li>. */
    function updateAllTrackAppearances() { if (!playlistTracksUl) return; const items = playlistTracksUl.querySelectorAll('li[data-track-id]'); items.forEach(item => { const id = item.dataset.trackId; const icon = item.querySelector('.lock-icon'); if (!id || !icon) return; const isLocked = lockedTrackIds.has(id); icon.textContent = isLocked ? '🔒' : '🔓'; if (isLocked) item.classList.add('locked-track'); else item.classList.remove('locked-track'); }); }
    /** Muestra el modal de contraseña. */
    function showPasswordModal() { if (!passwordModal || !passwordInput) return; passwordInput.value = ''; passwordModal.style.display = 'block'; passwordInput.focus(); }
    /** Oculta el modal de contraseña. */
    function hidePasswordModal() { if (!passwordModal) return; passwordModal.style.display = 'none'; }

    /**
     * Renderiza la lista de reproducción en el HTML.
     * Para cada canción, crea un elemento <li> con su título/artista y un icono de candado.
     * El texto es clicable para reproducir (si no está bloqueado).
     * El candado es clicable solo para BLOQUEAR (si está 🔓).
     * @param {Array} sounds - Array de objetos de información de las canciones.
     */
    function displayPlaylist(sounds) {
        if (!playlistTracksUl) { console.error("displayPlaylist: Elemento #playlist-tracks no encontrado."); return; }
        playlistTracksUl.innerHTML = ''; // Limpiar lista anterior

        sounds.forEach((sound, index) => {
             if (!sound || !sound.id) { console.warn(`Pista en índice ${index} omitida: falta ID.`); return; }
            const trackId = sound.id;

            try {
                const li = document.createElement('li');
                li.dataset.trackId = trackId;
                li.dataset.trackIndex = index;

                // Span para el texto (Título, Artista) - Clicable para reproducir
                const textSpan = document.createElement('span');
                textSpan.classList.add('track-text');
                const title = sound.title || `Pista ${index + 1}`;
                const artist = sound.user && sound.user.username ? sound.user.username : null;
                textSpan.textContent = artist ? `${title}, ${artist}` : title;
                li.appendChild(textSpan);

                // Span para el icono de candado - Clicable solo para bloquear
                const lockSpan = document.createElement('span');
                lockSpan.classList.add('lock-icon');
                lockSpan.dataset.trackId = trackId; // Para referencia si es necesario
                const isLocked = lockedTrackIds.has(trackId); // Estado inicial
                lockSpan.textContent = isLocked ? '🔒' : '🔓';
                if (isLocked) { li.classList.add('locked-track'); }
                li.appendChild(lockSpan);

                // Listener para el TEXTO: Reproduce si no está bloqueada.
                textSpan.addEventListener('click', () => {
                    if (lockedTrackIds.has(trackId)) {
                        alert(`"${textSpan.textContent}" está bloqueada 🔒.\nUsa el botón global 🔓 para desbloquear todas.`);
                        return;
                    }
                    console.info(`Reproduciendo pista ${index} ("${title}") por clic en lista.`);
                    widget.skip(index);
                });

                // Listener para el CANDADO: Solo permite BLOQUEAR (cuando es 🔓).
                lockSpan.addEventListener('click', (event) => {
                    event.stopPropagation(); // Evitar que el clic active el listener del texto.
                    const currentlyLocked = lockedTrackIds.has(trackId);
                    if (!currentlyLocked) { // Si está desbloqueado (🔓), bloquearlo.
                        lockedTrackIds.add(trackId);
                        lockSpan.textContent = '🔒';
                        li.classList.add('locked-track');
                        console.info(`Pista ${trackId} ("${title}") BLOQUEADA individualmente.`);
                        if (trackId === currentTrackId && isPlaying) { // Si se bloquea la actual, pausarla.
                            console.info("Pausando pista actual porque fue bloqueada.");
                            widget.pause();
                        }
                    } else { // Si ya está bloqueado (🔒), el clic no hace nada.
                        console.info(`Clic en candado bloqueado 🔒 para pista ${trackId}. No hay desbloqueo individual por esta vía.`);
                        lockSpan.title = "Usa el botón global 🔓 para desbloquear todas las canciones."; // Tooltip informativo
                    }
                });
                playlistTracksUl.appendChild(li);
            } catch (error) { console.error(`Error al crear elemento <li> para pista ${index}:`, error); }
        });
    }

    // --- EVENT LISTENERS DE LA INTERFAZ DE USUARIO (Botones, Barra de Progreso, Modal) ---

    // Botón Play/Pause
    if (playPauseBtn) { playPauseBtn.addEventListener('click', () => widget.toggle()); }

    // Botón Anterior (con lógica de salto inteligente para pistas bloqueadas)
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (!soundsData || soundsData.length === 0) { console.warn("Prev: No hay datos de playlist."); widget.prev(); return; }
            const currentIndex = soundsData.findIndex(s => s && s.id === currentTrackId);
            if (currentIndex === -1) { console.warn("Prev: Pista actual no encontrada."); widget.prev(); return; }

            let targetIndex = -1;
            for (let i = currentIndex - 1; i >= 0; i--) { // Buscar hacia atrás
                if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
            }
            if (targetIndex === -1) { // Si no se encontró, buscar desde el final (loop around)
                for (let i = soundsData.length - 1; i > currentIndex; i--) {
                     if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
                }
            }
            if (targetIndex !== -1) { console.info(`Prev: Saltando a pista desbloqueada en índice ${targetIndex}.`); widget.skip(targetIndex); }
            else { console.info("Prev: No se encontró ninguna otra pista desbloqueada."); /* Podría mostrarse un alert */ }
        });
    }

    // Botón Siguiente (con lógica de salto inteligente para pistas bloqueadas)
    if (nextBtn) {
       nextBtn.addEventListener('click', () => {
            if (!soundsData || soundsData.length === 0) { console.warn("Next: No hay datos de playlist."); widget.next(); return; }
            const currentIndex = soundsData.findIndex(s => s && s.id === currentTrackId);
            if (currentIndex === -1) { console.warn("Next: Pista actual no encontrada."); widget.next(); return; }

            let targetIndex = -1;
            for (let i = currentIndex + 1; i < soundsData.length; i++) { // Buscar hacia adelante
                if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
            }
            if (targetIndex === -1) { // Si no se encontró, buscar desde el principio (loop around)
                 for (let i = 0; i < currentIndex; i++) {
                     if (soundsData[i] && soundsData[i].id && !lockedTrackIds.has(soundsData[i].id)) { targetIndex = i; break; }
                 }
            }
            if (targetIndex !== -1) { console.info(`Next: Saltando a pista desbloqueada en índice ${targetIndex}.`); widget.skip(targetIndex); }
            else { console.info("Next: No se encontró ninguna otra pista desbloqueada."); /* Podría mostrarse un alert */ }
        });
    }

    // Barra de Progreso (Seeking al hacer clic)
    if (progressContainer) {
        progressContainer.addEventListener('click', (event) => {
            if (currentDuration <= 0) return; // No buscar si no hay duración
            const containerWidth = progressContainer.offsetWidth;
            const clickPositionX = event.offsetX;
            const clickPercent = Math.max(0, Math.min(1, clickPositionX / containerWidth));
            const seekTimeMs = Math.floor(clickPercent * currentDuration);
            // Actualizar UI inmediatamente
            if (progressBar) progressBar.style.width = `${clickPercent * 100}%`;
            if (currentTimeSpan) currentTimeSpan.textContent = formatTime(seekTimeMs);
            widget.seekTo(seekTimeMs); // Enviar comando de seek al widget
        });
    }

    // Botón de Desbloqueo Global (muestra el modal)
    if (unlockBtn) {
        unlockBtn.addEventListener('click', () => {
            if (lockedTrackIds.size === 0) { alert("Actualmente no hay ninguna canción bloqueada."); return; }
            showPasswordModal();
        });
    }

    // Botón OK del Modal (verifica contraseña y desbloquea todo)
    if (modalOkBtn) {
        modalOkBtn.addEventListener('click', () => {
            const enteredPassword = passwordInput.value;
            if (enteredPassword === "12345") { // Contraseña correcta
                console.info("Contraseña global correcta. Desbloqueando todas las pistas.");
                lockedTrackIds.clear();          // Vaciar el Set de IDs bloqueados
                updateAllTrackAppearances();     // Actualizar UI de todos los candados
                alert("¡Todas las canciones han sido desbloqueadas!");
                hidePasswordModal();             // Cerrar modal
            } else { // Contraseña incorrecta
                alert("Contraseña incorrecta.");
                passwordInput.focus();           // Devolver foco
                passwordInput.select();          // Seleccionar para reescribir
            }
        });
    }

    // Botón Cancelar del Modal
    if (modalCancelBtn) { modalCancelBtn.addEventListener('click', hidePasswordModal); }
    // Clic en el Overlay del Modal también lo cierra
     if (modalOverlay) { modalOverlay.addEventListener('click', hidePasswordModal); }
     // Permitir enviar contraseña con Enter
    if (passwordInput) { passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); modalOkBtn.click(); } }); }

}); // Fin de DOMContentLoaded