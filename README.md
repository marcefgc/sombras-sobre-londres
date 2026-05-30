# Sombras sobre Londres — Tablero online (red local)

Versión web para jugar *Letters from Whitechapel* entre amigos en la misma WiFi.

## Requisitos
- [Node.js](https://nodejs.org) instalado en la PC anfitriona (solo el anfitrión).

## Cómo jugar
1. **Anfitrión:** doble-click en `iniciar.bat` (o ejecuta `npm install` una vez y luego `npm start`).
2. **Averigua tu IP local:** abre una terminal y ejecuta `ipconfig`; busca la "Dirección IPv4" (algo como `192.168.1.X`).
3. Si Windows muestra un aviso de **Firewall**, permite el acceso en redes privadas.
4. **Los demás jugadores** (en la misma WiFi) abren en su navegador: `http://TU-IP:3000`.
5. Cada quien pone su nombre, elige rol (Jack, Detective 1–5 o Espectador) **y modo de juego**.

## Dos modos de juego
Se elige en el lobby (lo fija quien configura la partida):

- **Partida (manual):** tablero con **fichas arrastrables** sobre el mapa. Los jugadores aplican las reglas de movimiento entre ellos (a ojo); el servidor sólo oculta la info de Jack y verifica pistas/arrestos cuando se le pregunta por número. Es la experiencia "de mesa" a distancia.
- **Aprendizaje (árbitro):** el tablero muestra los **círculos y cuadrados clicables**. El servidor **valida cada movimiento** (adyacencia y bloqueos de la policía) y resuelve **pistas y arrestos automáticamente**. Ideal para aprender las reglas antes de jugar el modo Partida. Jack mueve eligiendo una acción (Mover/Carruaje/Callejón) y haciendo click en un destino resaltado; la policía mueve por cuadrados y luego busca/arresta en círculos adyacentes.
  - Nota: el grafo del tablero se derivó automáticamente del mapa original; puede tener imperfecciones menores. El callejón es una versión simplificada (salto a un círculo cercano).

## Reglas y alcance
- El servidor guarda en secreto la ruta y la guarida de Jack y nunca las envía a los demás.
- En modo Partida, adyacencias/bloqueos/especiales se aplican entre jugadores; en modo Aprendizaje los valida el programa.

## Cómo se juega (resumen del flujo en pantalla)
1. **Jack** fija su **guarida** secreta (panel privado) antes de la noche 1.
2. Cada noche, Jack pulsa **Preparar crimen**, luego escribe el número del crimen y **Cometer crimen** (queda como "paso 0" de su ruta y empieza la caza).
3. Jack registra cada movimiento escribiendo el número y pulsando **Mover** / **Carruaje** / **Callejón** (los dos últimos descuentan sus contadores).
4. Los **detectives** arrastran sus fichas por el mapa, escriben un número y pulsan **Buscar pista** (el servidor responde SÍ/no según la ruta real de Jack) o **¡Arresto!** (si aciertan el círculo actual de Jack, ganan).
5. Al final de la noche, Jack pulsa **Llegué a mi guarida**: el servidor verifica que su posición actual sea la guarida; si lo es, empieza la siguiente noche (y si era la noche 4, **gana Jack**). Si Jack agota sus 15 turnos sin llegar a casa, cualquier jugador pulsa **Amanecer** para declarar la **victoria policial**.

## Desarrollo
- Tests: `npm test`
- Regenerar la imagen del mapa: `npm run extract-map`
- Cambiar el puerto: define la variable de entorno `PORT` (por defecto 3000).
