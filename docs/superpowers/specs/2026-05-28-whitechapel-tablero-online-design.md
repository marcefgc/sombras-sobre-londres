# Sombras sobre Londres — Tablero online en red local

**Fecha:** 2026-05-28
**Estado:** Aprobado para planificación

## Resumen

Versión web de *Letters from Whitechapel* (Sombras sobre Londres) para jugar entre
amigos en la **misma red WiFi/LAN**, sin internet. Un anfitrión ejecuta un servidor
Node.js; los demás se conectan abriendo `http://IP-DEL-ANFITRION:3000` en su navegador.
Todos ven el **mismo tablero sincronizado** en tiempo real, cada jugador con un rol
(Jack, detectives 1–5, espectador), y la **información privada de Jack** (guarida,
ruta) nunca se envía a los demás.

## Decisiones de alcance (acordadas)

- **Automatización:** tablero digital **asistido** — el programa gestiona lo oculto y
  el flujo de turnos, pero las reglas de movimiento se aplican entre jugadores.
- **Interacción con el tablero:** mapa de fondo (imagen) con **fichas arrastrables**;
  posiciones aproximadas en porcentaje, **sin grafo de adyacencias**.
- **Conexión:** un **anfitrión** corre el servidor; los demás entran por **IP local**
  estando en la **misma WiFi**. Sin internet.
- **Arranque:** `node server.js` **y** un `iniciar.bat` de doble-click para Windows.
- **Arquitectura:** servidor Node ligero (Express + Socket.io) + clientes HTML/CSS/JS
  plano, sin paso de compilación.

## Arquitectura y componentes

```
whitechapel/
├─ server.js            ← Express + Socket.io, estado en memoria, filtrado por rol
├─ game-state.js        ← lógica pura testeable (turnos, pistas, arrestos, contadores)
├─ package.json
├─ iniciar.bat          ← doble-click: instala deps si faltan y arranca el servidor
├─ README.md            ← cómo ver tu IP, permitir el firewall y conectar
└─ public/
   ├─ index.html        ← una sola página; muestra/oculta vistas según rol
   ├─ style.css
   ├─ client.js         ← render del tablero, drag&drop, sockets
   └─ assets/
      ├─ mapa.png        ← extraído de whitechapel_map_08.pdf (preparación)
      └─ fichas (CSS/SVG)
```

- **`game-state.js`**: lógica pura sin red. Fuente de verdad de noche/fase/contadores
  y de la info privada de Jack. Testeable de forma aislada.
- **`server.js`**: envuelve la lógica con Socket.io y **filtra qué se manda a cada
  rol**. La guarida y la ruta de Jack nunca salen hacia policías ni espectadores.
- **`client.js`**: mismo archivo para todos; renderiza el panel privado solo si el rol
  recibido es Jack.

## Modelo de estado (en memoria, una sola partida)

```js
game     = { night: 1, phase: 'lobby'|'crime-prep'|'hunt'|'ended',
             jackMoves: 0 /* de 15 */, turn: 'jack'|'police' }
players  = { socketId: { name, role } }   // roles: jack, det1..det5, spectator
tokens   = [ { id, type, x, y, label } ]  // PÚBLICO. x/y en % del mapa
                                          // type: detective | crime | clue | victim
jack     = { lair, path:[{step,circle,special}], carriages, alleys } // PRIVADO
log      = [ "...eventos públicos..." ]
```

- Coordenadas en **porcentaje** para que las fichas escalen con la imagen en cualquier
  pantalla.
- Arrastres con política "último que escribe gana"; el servidor reemite a todos para
  mantener consistencia.

## Roles y visibilidad

- **Jack:** tablero público **+ panel privado** (guarida, bloc de ruta, contadores).
- **Detectives (1–5):** tablero público; pueden arrastrar fichas y marcadores.
- **Espectador:** solo mira; no mueve nada.
- Cualquier jugador no-espectador puede mover fichas públicas (colaborativo, basado en
  honestidad). El **anfitrión** dispone de **Reiniciar partida**.

## El tablero y las fichas

Imagen del mapa de fondo; fichas como `div`s arrastrables encima:

- 5 peones de detective (colores distintos)
- 1 marcador de crimen (rojo)
- marcadores de pista (amarillos)
- fichas de víctima (blancas)

Al soltar una ficha, su nueva posición (%) se transmite a todos al instante.

## Ayudas asistidas (sin necesidad de grafo)

1. **Lobby:** entrar, poner nombre, elegir rol.
2. **Control de noche/fase/movimientos:** botones "Empezar caza", "Siguiente noche";
   contador de los 15 movimientos de Jack con aviso al llegar al límite.
3. **Bloc privado de Jack:** registra el número de cada paso; botones carruaje/callejón
   que **descuentan sus contadores**; la lista de ruta solo la ve Jack.
4. **Verificador de pistas (anti-trampa):** un detective escribe el número que
   interroga → aparece en la pantalla de Jack → su app **resalta automáticamente** si
   ese número está en su ruta de la noche → Jack pulsa "Confirmar/Negar" → el resultado
   sale en el log ("Pista en 32: SÍ"); el detective arrastra el marcador amarillo a ese
   círculo.
5. **Arresto:** detective escribe número + "¡Arresto!" → la app compara con el círculo
   actual de Jack → si acierta, declara **victoria policial**.
6. **Condiciones de victoria:** botón "Jack llegó a la guarida" (la app confirma círculo
   actual == guarida), resolución de fin de noche, y fin de partida tras la noche 4.
7. **Log de eventos público.**

## Simplificaciones conscientes del MVP

- La **fase de patrullas ocultas** (fichas negras boca abajo) es difícil de ocultar en un
  tablero compartido; en el MVP la policía coloca sus peones al inicio. Mejora futura.
- **Adyacencias, bloqueos, carruajes y callejones se validan "a ojo"** entre jugadores.
  La app no impide un movimiento ilegal, pero sí gestiona lo oculto (ruta, pistas,
  arrestos, guarida).

## Errores y resiliencia

- **Reconexión:** el estado vive en el servidor; al reentrar con su rol, el jugador
  recibe el estado actual. La info privada de Jack persiste en el servidor.
- Una sola partida a la vez (MVP); el anfitrión puede reiniciar.

## Pruebas

- **Unitarias** sobre `game-state.js` con el runner nativo `node:test`:
  - verificación de pistas (número en/no en la ruta)
  - chequeo de arresto (número == círculo actual)
  - descuento de contadores de carruaje/callejón
  - transiciones de fase y avance de noche
  - **filtrado por rol**: el estado enviado a no-Jack NUNCA incluye `jack.lair` ni
    `jack.path`.
- **Manual** multi-navegador para sincronización y arrastre.

## Entregable y arranque

- `node server.js` o `iniciar.bat` (doble-click; instala dependencias si faltan y
  levanta el servidor en el puerto 3000).
- `README.md` explica: ver IP local con `ipconfig`, permitir el aviso del firewall de
  Windows, y compartir `http://TU-IP:3000`.

## Tarea de preparación

- Extraer la imagen del mapa desde `whitechapel_map_08.pdf` a `public/assets/mapa.png`
  (o SVG) para usarla de fondo.
