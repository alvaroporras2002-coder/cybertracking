# Registro de cambios

## 1.6.0 — Continuidad y navegación

- Borradores locales para los formularios de perfil, certificación, dudas, evidencias, tiempo manual y fuentes alternativas. Los envíos correctos eliminan su borrador en la misma operación de guardado.
- Búsqueda sin distinción de tildes y coincidencias visibles dentro de las semanas desplegadas.
- Cuaderno con filtros de favoritos, dudas abiertas y evidencias; orden por fecha de edición y búsqueda en las evidencias.
- Accesos separados a la siguiente sesión pendiente y a la última actividad, más un estado de recorrido completado.
- Animaciones de entrada al navegar, sin repetirlas en los guardados rutinarios ni duplicarlas en tarjetas anidadas.
- Gráficos con regiones accesibles por teclado, indicación de desplazamiento móvil y tablas de datos.
- Foco en el título al cambiar de pantalla, conservado durante las acciones de guardado.
- Mantiene el esquema de respaldos, los IDs y el contenido de las 52 semanas y 364 sesiones.

## 1.5.0 — Correcciones del flujo de estudio

- Borradores de notas independientes por sesión, guardado antes de navegar y recuperación tras un fallo de persistencia.
- Recursos, búsqueda y temporizador actualizan sus controles sin reconstruir toda la pantalla ni cerrar los reproductores.
- Registro manual de estudio externo y etiqueta de la sesión que contabiliza el temporizador.
- Inicio centrado en la actividad actual, semanas desplegables y portadas con encuadre estable.
- Un solo archivo CSS, paneles de lectura más opacos y controles móviles más amplios.
- Bancos formativos para las 52 semanas; los repasos semanales de los bloques nuevos identifican sus preguntas de origen con `reviewOf`.
- Índice de evaluaciones ligero y carga del banco de cada semana solo cuando se abre una práctica o prueba.
- Pruebas de regresión para notas, navegación, reproducción, búsquedas, tiempo manual y avance hasta la sesión 364.

## 1.4.0 — Un espacio claro y portadas por semana

- Nuevo logotipo y tipografía adaptable del sistema; sustituye Times New Roman.
- Apariencia clara única, también al cargar preferencias antiguas o importar respaldos con tema oscuro.
- Retirados los botones de tema y movimiento y el bloque inferior de perfil/estado de la barra lateral.
- Animaciones activas desde el inicio, ondas al pulsar y respuesta visual de navegación, conservando la preferencia de movimiento reducido del sistema.
- Cincuenta y dos portadas distintas, una por semana, con escenas específicas del temario. Las seis imágenes del mapa general se conservan.
- Las notas, pruebas, evidencias, gráficas, temporizador y respaldos mantienen su funcionamiento y formato.

## 1.3.0 — Aula de cristal

- Paneles de vidrio translúcido, fondos suaves, reflejos y esquinas redondeadas en tarjetas y controles.
- Seis imágenes creadas para las etapas del programa e integradas en inicio, semanas, mapa y aula.
- Temas de estudio numerados, portadas visuales y navegación de aprendizaje conservada.
- Mantiene Times New Roman, textos breves, temas claro y oscuro y las animaciones configurables.
- Compatibilidad con movimiento reducido y alternativa de fondo opaco cuando el navegador no ofrece desenfoque.
- Todas las funciones existentes y el formato del progreso, las notas y los respaldos permanecen compatibles.

## 1.2.0 — Diseño editorial

- Times New Roman como tipografía principal en la interfaz, controles y gráficos.
- Fondos de papel, tinta y colores discretos; bordes finos y temas claro y oscuro.
- Inicio centrado en la sesión pendiente y la semana actual; textos y encabezados más breves.
- Eliminados eslóganes y textos repetidos; el método de estudio queda disponible como ayuda desplegable.
- Se mantienen todas las funciones y los controles, incluidos gráficos, animaciones, pruebas, notas, evidencias, temporizador y respaldos.
- El contenido, los módulos de lógica, los IDs de sesiones y el formato de los datos permanecen compatibles con la versión anterior.

## 1.1.0 — Espacio de aprendizaje y métricas

- Nueva interfaz para escritorio y móvil, con navegación azul tinta, superficies claras y temas claro y oscuro completos.
- Inicio con sesión actual, mapa de seis etapas y distribución real del programa.
- Gráficos de tiempo de estudio a 7/30 días, sesiones superadas, actividad, resultados y progreso por etapa. Los estados vacíos no muestran datos simulados.
- Nueva escena isométrica animada, formas fluidas, partículas, entradas de secciones, contadores y tipografía cinética.
- Movimiento configurable, respeto por movimiento reducido y pausa de efectos al ocultar la página.
- Conserva el almacenamiento existente, los IDs, las notas, las evidencias y los requisitos de avance. Las evaluaciones siguen disponibles en las semanas 1 a 4.
- Pruebas adicionales para métricas, fechas locales y compatibilidad con respaldos anteriores.

## 1.0.0 — Primera entrega

- Estructura de aplicación estática para computadora y móvil.
- Diseño de laboratorio isométrico y efectos decorativos configurables.
- Currículo de 52 semanas y 364 sesiones extraído del documento de origen.
- Primer bloque de evaluaciones y retos: semanas 1 a 4.
- Progreso secuencial con requisitos de estudio, práctica y prueba.
- Estado local, notas, evidencias, temporizador y respaldo portable.
- Guía de publicación en GitHub Pages y validación del contenido.

La primera entrega solo incluía evaluaciones de las semanas 1 a 4. Desde la versión 1.5, las 52 semanas disponen de evaluaciones formativas; consulta `CONTENT_STATUS.md`.

Las pruebas ejecutadas y sus resultados se informan en la entrega del proyecto. Esta lista describe el alcance de la versión; no sustituye los resultados reales de validación.
