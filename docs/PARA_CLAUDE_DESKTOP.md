# Instrucciones para completar el documento Word con Claude Desktop

Documento a completar: `Project URBANSYNC/URBANSYNC_Documento_Teorico_APA (completado).docx`
(el original `URBANSYNC_Documento_Teorico_APA.docx` se conserva sin cambios).

## Estado del documento

| Responsable | Secciones | Estado |
|---|---|---|
| Persona 1 (desarrollo) | Diseño de la arquitectura distribuida · Diseño de componentes y comunicación · Desarrollo e implementación · Tolerancia a fallos y recuperación · Seguridad del sistema · Despliegue y ejecución | **Completas.** Se llenaron los marcadores, se agregaron las figuras 2 a 20 y se ajustaron tablas y párrafos al software real |
| Persona 2 (teoría) | Portada, introducción, problema, justificación, objetivos, marco conceptual, referencias | Sin cambios (no contradicen la implementación) |
| Persona 3 (requisitos, pruebas, cierre) | Análisis de requisitos · Pruebas y evaluación · Resultados y análisis · Presupuesto · Conclusiones · Anexos | **Pendiente**: celdas `[Pendiente]` de las Tablas 17–21 y marcadores resaltados en amarillo |

## Archivos que debe leer Claude Desktop (Persona 3)

1. `docs/RESULTADOS.md` — **fuente principal**: resultado obtenido de cada caso PF, PI, PC, PR y PT con la
   misma numeración y redacción del Word, y la comparación con la Tabla 7.
2. `evidencias/` — salidas reales de las pruebas (`fase2`–`fase5`, `fase7`) y capturas (`capturas/terminal`).
3. `docs/DECISIONES.md` — desviaciones del MVP y su porqué (útil para "Dificultades" y "Limitaciones").
4. `docs/GUIA_CAPTURAS.md` — qué captura respalda cada requisito.
5. `README.md` y `docker-compose.yml`, `.env.example`, `db/init/*.sql` — para los Anexos B y E.

## Reglas para editar el Word

- **No cambiar** formato, estilos, normas APA, numeración ni organización. Solo reemplazar los marcadores
  `[...]` resaltados y las celdas `[Pendiente]`, quitando el resaltado amarillo.
- No modificar las secciones de la Persona 1 ni de la Persona 2.
- Las figuras ya llegan a la **Figura 20**: si se agregan figuras nuevas (por ejemplo, capturas de k6 o de
  terminal en los anexos), continuar desde la 21. Las tablas llegan a la 27.
- Las celdas "Resultado obtenido" son angostas: frases cortas (ej. "Cumple. p95 = 92 ms; 0 % de errores.").
- Citas y referencias en APA 7, como el resto del documento.

## Pautas de redacción (que suene humano, no a IA)

- Mantener el tono del documento: académico, en tercera persona impersonal ("se implementó", "se verificó").
- Frases de largo variado; ir al dato concreto ("respondió en 2,04 s") en vez de adjetivos ("excelente desempeño").
- Evitar muletillas típicas de IA: "cabe destacar", "es importante mencionar", "en resumen", "robusto",
  "integral", "sin lugar a dudas", "en el panorama actual", "aprovechar", enumeraciones de tres adjetivos.
- No abusar de listas ni de negritas; preferir párrafos cortos con ideas conectadas.
- No inventar resultados: todo número debe salir de `docs/RESULTADOS.md` o de `evidencias/`. Lo que no se
  midió (por ejemplo, la disponibilidad ≥ 95 % de RNF-DIS-01) se dice tal cual.
- Reconocer limitaciones con naturalidad (HTTP en local, sin iOS, sin fotografías, pruebas en un solo equipo).

## Instrucción sugerida para Claude Desktop

> Adjunto el documento `URBANSYNC_Documento_Teorico_APA (completado).docx` y los archivos `RESULTADOS.md`,
> `DECISIONES.md` y la carpeta `evidencias`. Completa **solo** las secciones de la Persona 3 (Pruebas y
> evaluación, Resultados y análisis, Conclusiones y Anexos): reemplaza las celdas `[Pendiente]` y los
> marcadores resaltados con la información de `RESULTADOS.md`, sin cambiar formato, estilos, numeración ni
> las demás secciones. Redacta en el mismo tono académico impersonal del documento, con frases naturales y
> datos concretos, evitando expresiones genéricas propias de textos generados por IA.
