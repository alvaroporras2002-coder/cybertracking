# Clases de CYBERTRACK

Cada archivo `week-NN.json` contiene una clase semanal original en español. Mantiene el título de la semana, los siete IDs y el orden de los temas de `data/curriculum.json`.

La ruta `#week/NN` abre la semana. La ruta `#day/wNNdD/learn` utiliza la misma lección, con los recursos, el reto y la evaluación de la sesión disponibles en sus pestañas habituales.

Cada tema incluye dos o más párrafos de explicación, una analogía con un concepto concreto, puntos clave y un esquema visual de categorías, capas o secuencias. Cada día añade un caso resuelto con acciones, razones y resultados; una práctica independiente; una pregunta de comprensión con solución razonada; errores frecuentes; recapitulación y glosario.

Los casos y las salidas se han escrito para enseñar. Sus datos son ficticios o pertenecen a rangos de documentación; no representan un análisis de la computadora del alumno. Las prácticas de herramientas se limitan a equipos, archivos y laboratorios autorizados. Las explicaciones sobre certificaciones remiten a la fuente oficial para verificar objetivos y reglas aplicables, y las preguntas son propias.

Las fuentes HTTPS al final de cada semana permiten contrastar y ampliar las explicaciones. El contenido no se descarga de una IA al usar la aplicación: se sirve como JSON estático desde el mismo repositorio. Las comprobaciones de lectura no cambian la puntuación ni los requisitos de los bancos de evaluación existentes.

Los esquemas se generan como HTML semántico, con texto seleccionable y tamaño adaptable. Esto conserva la legibilidad al ampliar la pantalla y permite navegar con lectores de pantalla. Las escenas de apoyo en `assets/images/lessons/` son imágenes generadas y tienen su propia procedencia; no se utilizan como prueba técnica de una configuración.

Para comprobar la cobertura y la estructura:

```bash
python3 tools/validate-lessons.py
node --test tests/*.test.mjs
```

Durante una edición parcial se puede comprobar una semana o un rango:

```bash
python3 tools/validate-lessons.py --weeks 11
python3 tools/validate-lessons.py --weeks 1-13
```

La validación detecta temas ausentes, campos incompletos y duplicados exactos. El criterio pedagógico y la revisión técnica siguen siendo necesarios al modificar una explicación o un ejemplo.
