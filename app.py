# app.py
from flask import Flask, render_template, url_for
import urllib.parse # Para codificar la URL de la playlist

app = Flask(__name__) # Flask busca 'templates' y 'static' por defecto

# --- CONFIGURACIÓN ---
# ¡¡IMPORTANTE!! Reemplaza esta URL con la URL de tu playlist pública de SoundCloud
SOUNDCLOUD_PLAYLIST_URL = "https://soundcloud.com/buzzing-playlists/sets/buzzing-r-b" # <--- ASÍ DEBE QUEDAR
# ---------------------

@app.route('/')
def index():
    """Sirve la página principal del reproductor."""
    if not SOUNDCLOUD_PLAYLIST_URL or "PON_AQUI" in SOUNDCLOUD_PLAYLIST_URL: # Una pequeña verificación extra
        return "Error: La variable SOUNDCLOUD_PLAYLIST_URL en app.py no está configurada correctamente.", 500

    # Codificamos la URL para pasarla de forma segura al iframe
    encoded_playlist_url = urllib.parse.quote(SOUNDCLOUD_PLAYLIST_URL)
    return render_template('index.html', playlist_url=encoded_playlist_url)

# Flask maneja automáticamente la carpeta 'static'

if __name__ == '__main__':
    app.run(debug=True)