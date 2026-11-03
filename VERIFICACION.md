# Verificación de la entrega

Fecha: 3 de noviembre de 2026. Versión 1.5.0.

## Comprobaciones ejecutadas

- `node --test tests/*.test.mjs`: **34 pruebas correctas, 0 fallos**.
- `python3 tools/validate-content.py`: **52 semanas, 364 sesiones, 3.536 entradas de pregunta y 364 retos**. Las preguntas incluyen 2.576 enunciados originales y 960 recuperaciones de repaso con `reviewOf`.
- `python3 tools/build-assessments.py --check`: índice de 52 semanas consistente con sus fuentes; 5.307 bytes.
- Recorrido completo con los bancos reales: paso de semana 4 a 5, requisitos conservados y avance hasta 364/364. Los intentos resultantes validan contra el formato de respaldo existente.
- Carga real del módulo de recursos con transporte simulado: dos solicitudes iniciales, un banco por semana solicitada, deduplicación, reintentos y rechazo atómico de un banco incompleto.
- Notas: cambios rápidos entre sesiones, escritura durante persistencia, fallo y reintento, navegación rechazada sin perder el editor y actualización externa sin sobrescritura de un editor no modificado.
- Reproductores: marcar recursos, usar temporizador o registrar tiempo manual conserva el contenedor y el reproductor en la integración simulada.
- Métricas: el tiempo registrado actualiza sus cifras sin reconstruir la pantalla. El filtro de gráficos conserva los demás formularios.
- Búsqueda: espera breve y actualización exclusiva de resultados; no reemplaza la pantalla ni el campo de búsqueda.
- Red: fallo inicial al cargar una evaluación ofrece recuperación y recursos; reintentar no elimina el control tras otro fallo.
- Tiempo manual: límites, asociación de sesión y conservación del temporizador; exportación e importación por el esquema de datos anterior.
- Respaldo: notas, intentos, evidencias y bytes; rechazo de datos malformados, claves inseguras y versiones futuras.
- Movimiento: clic/teclado, campos editables, ausencia de manejadores duplicados, movimiento reducido, visibilidad y limpieza.
- HTML, sintaxis JavaScript, SVG, referencias locales y estructura CSS comprobados estáticamente. Un solo archivo CSS publicado.
- Los IDs del temario, los bancos originales de semanas 1 a 4 y las 58 imágenes existentes se conservan. No hay migración destructiva del almacenamiento.

## Límites

Las pruebas de interfaz utilizan un DOM y transporte simulados. No equivalen a comprobar IndexedDB, reproductores externos, contraste, fluidez y uso táctil en un navegador real. La infraestructura de navegador no está disponible en este entorno.

Los bancos son autoevaluación formativa, no preguntas oficiales ni una garantía de aprobar una certificación. La validación comprueba estructura, soluciones referenciadas, procedencia de repasos y duplicados; la revisión pedagógica puede seguir ampliándose. Los recursos del temario se conservan y no se presenta una nueva verificación de disponibilidad de todos sus enlaces.

## Comprobación de uso real

1. Escribir una nota, cambiar de sesión y volver; probar además un fallo de guardado y la descarga del borrador.
2. Abrir un video y marcar un recurso o iniciar el temporizador; confirmar que el reproductor permanece.
3. Registrar estudio externo y comprobar que las métricas se actualizan.
4. Realizar una prueba fallida y una aprobada; confirmar los requisitos de avance.
5. Exportar e importar un respaldo con un archivo pequeño.
6. Revisar móvil, navegación por teclado, lectura de gráficos y movimiento reducido.
