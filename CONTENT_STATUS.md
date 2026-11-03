# Estado del contenido de CYBERTRACK

La versión 1.5 incorpora evaluaciones formativas en las 52 semanas y mantiene los IDs de las 364 sesiones. El estado distingue material consultable, evaluación disponible y requisitos superados por el alumno.

| Parte | Alcance |
| --- | --- |
| Temario y recursos | 52 semanas, 364 sesiones |
| Bancos diarios | Ocho preguntas por día ordinario; la aplicación selecciona seis por intento |
| Revisión semanal | Veinte preguntas en el banco; la aplicación selecciona quince por intento |
| Retos | Un escenario de interpretación por sesión: 364 en total |
| Preguntas de origen | 2.576 enunciados originales de evaluación |
| Recuperaciones de repaso | 960 entradas semanales con `reviewOf` explícito |
| Total de entradas de pregunta | 3.536, incluyendo los repasos |
| Recursos de origen | Conservados; no se afirma una nueva verificación de disponibilidad de todos los enlaces |

## Procedencia del repaso

Las semanas 1 a 4 conservan sus bancos y versiones anteriores. En las semanas 5 a 52, la revisión semanal recupera veinte preguntas de los seis días, conservando la referencia a su ID de origen mediante `reviewOf`. Estas recuperaciones son intencionales y no se cuentan como enunciados originales adicionales.

El validador comprueba que cada recuperación tenga una pregunta de origen de la misma semana y que coincidan su enunciado, opciones, solución, explicación y referencia. Los enunciados originales y los retos no admiten duplicados exactos.

## Qué acredita la aplicación

Marcar un recurso es una declaración personal de estudio. Los retos y pruebas comprueban las respuestas a sus escenarios concretos. No inspeccionan el equipo, no verifican la ejecución de todas las tareas externas y no certifican dominio profesional ni garantizan aprobar un examen externo.

Los bancos son material formativo propio, con referencias de consulta. No reproducen preguntas oficiales. En las partes de planificación de CC, Security+ y BTL1 se pide contrastar la versión y las reglas oficiales que el alumno vaya a utilizar. Las preguntas evitan afirmar precios, fechas o versiones futuras.

Los recursos pueden remitir a cursos o listas completas; no hay una afirmación de 364 vídeos específicos e independientemente verificados. Las portadas son ilustraciones conceptuales y no capturas ni diagramas técnicos.

## Actualizar una evaluación

1. Conservar los IDs de las sesiones y editar el archivo `data/assessments/week-NN.json` correspondiente.
2. Mantener la versión y las preguntas históricas de los intentos guardados.
3. Si cambia una pregunta de origen, regenerar sus recuperaciones `reviewOf` para mantener la trazabilidad.
4. Ejecutar `python3 tools/build-assessments.py` para reconstruir el índice ligero.
5. Ejecutar `python3 tools/validate-content.py`, `python3 tools/build-assessments.py --check` y las pruebas de JavaScript.

La validación estructural y los casos de regresión se complementan con revisión pedagógica y pruebas en un navegador real.
