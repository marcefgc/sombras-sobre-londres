# Sombras sobre Londres — Tablero online (red local)

Versión web para jugar *Letters from Whitechapel* entre amigos en la misma WiFi.

## Requisitos
- [Node.js](https://nodejs.org) instalado en la PC anfitriona (solo el anfitrión).

## Cómo jugar
1. **Anfitrión:** doble-click en `iniciar.bat` (o ejecuta `npm install` una vez y luego `npm start`).
2. **Averigua tu IP local:** abre una terminal y ejecuta `ipconfig`; busca la "Dirección IPv4" (algo como `192.168.1.X`).
3. Si Windows muestra un aviso de **Firewall**, permite el acceso en redes privadas.
4. **Los demás jugadores** (en la misma WiFi) abren en su navegador: `http://TU-IP:3000`.
5. Cada quien pone su nombre y elige rol: Jack, Detective 1–5 o Espectador.

## Reglas y alcance
- El tablero es **asistido**: muestra el mapa con fichas arrastrables y oculta la info de Jack.
- El servidor verifica **pistas y arrestos** automáticamente y guarda en secreto la ruta y la guarida de Jack.
- Adyacencias, bloqueos, carruajes y callejones se aplican **entre jugadores** (a ojo).

## Cómo se juega (resumen del flujo en pantalla)
1. **Jack** fija su **guarida** secreta (panel privado) antes de la noche 1.
2. Cada noche, Jack pulsa **Preparar crimen**, luego escribe el número del crimen y **Cometer crimen** (queda como "paso 0" de su ruta y empieza la caza).
3. Jack registra cada movimiento escribiendo el número y pulsando **Mover** / **Carruaje** / **Callejón** (los dos últimos descuentan sus contadores).
4. Los **detectives** arrastran sus fichas por el mapa, escriben un número y pulsan **Buscar pista** (el servidor responde SÍ/no según la ruta real de Jack) o **¡Arresto!** (si aciertan el círculo actual de Jack, ganan).
5. Tras la noche 4, si Jack nunca fue atrapado, gana Jack.

## Desarrollo
- Tests: `npm test`
- Regenerar la imagen del mapa: `npm run extract-map`
- Cambiar el puerto: define la variable de entorno `PORT` (por defecto 3000).
