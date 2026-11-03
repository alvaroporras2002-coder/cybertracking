# Verificación de la entrega

Fecha: 3 de noviembre de 2026. Versión 1.0.0.

## Comprobaciones ejecutadas

- `node --test tests/*.test.mjs`: **13 pruebas correctas, 0 fallos**.
- `python3 tools/validate-content.py`: **52 semanas, 364 sesiones, 272 preguntas y 28 retos**; estructura y referencias internas correctas.
- Correspondencia de los IDs con el HTML de origen: correcta.
- Sintaxis de los módulos JavaScript y rutas de archivos del HTML: correctas.
- Integración en Node VM: 19 vistas/rutas, borrador de prueba, intento superado, siguiente sesión, notas escapadas y aviso visible de fallo de guardado.
- Respaldo lógico: exportación/importación de notas, intentos y bytes de adjuntos; rechazo de respaldos malformados o de versión futura sin modificar el estado original.

## Límites de la comprobación

Las pruebas de integración utilizan un DOM mínimo y persistencia simulada. No equivalen a ejecutar un navegador real, verificar IndexedDB en todos los dispositivos ni revisar el diseño mediante capturas. La infraestructura de navegador de este entorno no estaba disponible; no se instaló un navegador alternativo.

La revisión visual, el uso táctil y el guardado real en PC/móvil deben comprobarse al abrir el sitio. Los reproductores y recursos externos dependen de sus proveedores. Sus enlaces se conservaron del temario y no se presentan como una nueva revisión de disponibilidad.

## Revisión breve antes de usar datos importantes

1. Abre la página mediante HTTP o GitHub Pages.
2. Escribe una nota, recarga y confirma que permanece.
3. Marca los recursos obligatorios del día 1 y resuelve su reto.
4. Entrega un intento fallido: debe conservarse sin desbloquear el día 2.
5. Supera la prueba con los requisitos: debe activarse el día 2.
6. Adjunta un archivo pequeño, exporta un respaldo y comprueba su importación.
7. Revisa el móvil, navegación por teclado y movimiento reducido.

Las pruebas formativas y los retos son de las semanas 1 a 4. Las otras semanas tienen contenido consultable y evaluación pendiente. La aplicación no simula una aprobación para ocultar esa limitación.
