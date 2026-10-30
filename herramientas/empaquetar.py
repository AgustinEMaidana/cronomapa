"""Genera dist/cronomapa.html: el juego entero en un solo archivo (CSS, JS y datos incrustados).
Uso: python herramientas/empaquetar.py  (desde la carpeta del proyecto)"""
import json, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
html = (raiz / 'index.html').read_text(encoding='utf-8')
css = (raiz / 'css/estilos.css').read_text(encoding='utf-8')
js = (raiz / 'js/juego.js').read_text(encoding='utf-8')
datos = {
    'contenido': json.loads((raiz / 'datos/contenido.json').read_text(encoding='utf-8')),
    'mapas': json.loads((raiz / 'datos/mapas.json').read_text(encoding='utf-8')),
}
datos_js = 'window.CRONOMAPA_DATOS = ' + json.dumps(datos, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/') + ';'
html = html.replace('<link rel="stylesheet" href="css/estilos.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="js/juego.js"></script>', '<script>' + datos_js + '</script>\n<script>\n' + js + '\n</script>')
salida = raiz / 'dist' / 'cronomapa.html'
salida.parent.mkdir(exist_ok=True)
salida.write_text(html, encoding='utf-8')
print('Listo:', salida, round(salida.stat().st_size / 1024), 'KB')
