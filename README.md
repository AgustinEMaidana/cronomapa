# Cronomapa

Juego educativo web de Historia y Geografía de Argentina y Latinoamérica.
Proyecto Integrador III, 6.° 4.°

**Equipo:** Mamani Canaviri, Solano Bando, Ojeda, Maidana Agustín

Un error en la Máquina del Tiempo desordenó la historia y el mapa de Latinoamérica. El jugador tiene que ordenar hechos en una línea de tiempo y ubicar provincias, capitales, ríos y países en un mapa interactivo. Cada nivel completado repara una de las 8 piezas de la máquina.

## Cómo jugar

| Acción | Teclado / mouse | Celular |
| --- | --- | --- |
| Moverse entre pantallas, modos o la tarjeta en la línea | Flechas ← → | Deslizar |
| Seleccionar | Clic izquierdo | Tocar |
| Arrastrar tarjeta | Mantener clic y mover | Mantener el dedo y arrastrar |
| Confirmar respuesta | Enter o botón Confirmar | Botón Confirmar |
| Pedir pista | H o botón Pista | Botón Pista |
| Pausar | Esc o botón II | Botón II |
| Zoom en el mapa | Rueda del mouse o + / − | Dos dedos o + / − |

**Reglas:** 3 vidas por nivel, 2 pistas al empezar cada nivel (cada una resta 30 puntos y se gana una más cada 3 aciertos seguidos, hasta un máximo de 3; en la línea de tiempo la pista es un dato sobre el hecho, no la respuesta), tiempo límite de 60 a 90 segundos por ronda. Cada acierto da 100 puntos, más hasta 50 por tiempo restante y 10 por cada acierto seguido. El ranking guarda los 10 mejores puntajes del dispositivo.

## Niveles

| Nivel | Modo | Objetivo | Dificultad |
| --- | --- | --- | --- |
| 1 | Línea de Tiempo | Pueblos originarios y Colonia (5 hechos) | Fácil |
| 2 | Línea de Tiempo | Revolución de Mayo e Independencia (6 hechos) | Fácil |
| 3 | Línea de Tiempo | Organización Nacional (7 hechos) | Media |
| 4 | Línea de Tiempo | Siglo XX y democracia (8 hechos) | Difícil |
| 5 | Mapa-Quiz | Las 24 jurisdicciones | Fácil |
| 6 | Mapa-Quiz | Capitales provinciales y ríos | Media |
| 7 | Mapa-Quiz | Países de Latinoamérica y sus capitales | Media |
| 8 | Desafío final | Historia y geografía mezcladas, contra reloj | Difícil |

Los niveles se desbloquean en orden dentro de cada modo. El Desafío final se habilita al completar los dos modos. Cada partida elige hechos y preguntas al azar del banco, así que nunca sale igual.

## Estructura del proyecto

```
cronomapa/
├── index.html              Pantallas del juego (menú, niveles, juego, ranking…)
├── css/estilos.css         Estilos (modo claro y oscuro, adaptable a celular)
├── js/juego.js             Toda la lógica del juego
├── datos/contenido.json    Banco de niveles, hechos históricos y preguntas
├── datos/mapas.json        Mapas vectoriales (SVG) de Argentina y Latinoamérica
├── herramientas/empaquetar.py   Genera la versión de un solo archivo
└── dist/cronomapa.html     El juego completo en un solo archivo HTML
```

Tecnologías: HTML5, CSS3 y JavaScript puro (sin librerías). Mapas en SVG. Ranking, progreso y configuración en `localStorage`. Música y efectos sintetizados con la Web Audio API, así que no hay archivos de audio con derechos de autor.

## Cómo probarlo en la compu

El juego lee los archivos de la carpeta `datos`, y el navegador no lo permite si abrís `index.html` con doble clic. Opciones:

1. En VS Code, instalá la extensión **Live Server**, hacé clic derecho en `index.html` y elegí **Open with Live Server**.
2. O abrí directamente `dist/cronomapa.html`, que trae todo adentro y funciona con doble clic.

## Cómo publicarlo en GitHub Pages

1. Subí la carpeta al repositorio (por ejemplo, `git add .`, `git commit -m "Primera versión"`, `git push`).
2. En GitHub, entrá a **Settings → Pages**.
3. En **Source** elegí **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`. Guardá.
4. En uno o dos minutos el juego queda en `https://USUARIO.github.io/NOMBRE-DEL-REPO/`.

## Cómo agregar contenido sin tocar el código

Todo el contenido está en `datos/contenido.json`.

- **Un hecho histórico nuevo:** agregalo al banco que corresponda dentro de `eventos` (`colonia`, `independencia`, `organizacion` o `sigloxx`). La `fecha` va en formato `AAAA-MM-DD` y se usa para ordenar; `mostrar` es el texto que ve el jugador y `pista` es un dato de contexto que ayuda a ubicarlo sin decir la fecha.
  ```json
  { "id": "cabildo-abierto", "titulo": "Cabildo abierto en Buenos Aires", "fecha": "1810-05-22", "mostrar": "22/5/1810",
    "pista": "Se reunió pocos días antes de que se formara la Primera Junta.",
    "explicacion": "Los vecinos debatieron si el virrey Cisneros debía seguir en su cargo." }
  ```
- **Cambiar tiempos, cantidad de preguntas o rondas:** editá el nivel en `niveles`.
- **Una capital o un país:** editá `capitales` (con latitud y longitud) o `paises`.

Después de modificar algo, si querés actualizar la versión de un solo archivo, corré `python herramientas/empaquetar.py`.

## Pruebas sugeridas (QA)

- Funcionales: las tarjetas se ubican bien, los clics en el mapa se detectan, puntaje, vidas, rachas y pistas se calculan bien.
- Victoria y derrota: ganar cada nivel, perder por vidas y perder por tiempo.
- Usabilidad: al menos 5 compañeros juegan sin ayuda y completan una encuesta breve.
- Dispositivos: computadora y celular; Chrome, Firefox, Edge y Safari.
- Registrar los bugs en **GitHub Issues** con prioridad y estado.

## Fuentes y créditos

- Límites geográficos: [Natural Earth](https://www.naturalearthdata.com/) (dominio público), simplificados para la web. Las Islas Malvinas se muestran como parte de la provincia de Tierra del Fuego.
- Tipografías: Bricolage Grotesque y Atkinson Hyperlegible (Google Fonts, licencia OFL).
- El contenido histórico y geográfico debe verificarse con el material de clase antes de la entrega final.
