# CYBERTRACK

Plataforma personal para estudiar ciberseguridad desde cero. Contiene las **52 semanas y 364 sesiones** del programa, con una página de inicio, ruta, aula, notas, seguimiento, temporizador y respaldos locales.

La versión 1.4 utiliza tipografía adaptable del sistema, un nuevo logotipo y una apariencia clara de vidrio translúcido con esquinas redondeadas. Las animaciones, partículas y respuestas al pulsar están activas desde el inicio y respetan el movimiento reducido del sistema. Se retiraron los selectores de tema y movimiento y el bloque inferior de perfil de la barra lateral.

Cincuenta y dos portadas generadas para este proyecto identifican cada semana con una escena diferente. El inicio y el aula muestran la portada de la semana correspondiente; el mapa general conserva sus seis imágenes de etapa. Son ilustraciones conceptuales: las tareas, los temas y las explicaciones se mantienen como texto accesible. Las imágenes se sirven desde el repositorio; la página no llama a una API de IA. Consulta [las portadas y sus prompts](assets/images/weeks/README.md) y [las imágenes de etapa](assets/images/README.md).

El inicio y la sección Progreso muestran actividad de estudio a 7/30 días, sesiones superadas, resultados de pruebas, un calendario de actividad y el mapa de etapas. Utilizan registros reales; cuando no hay actividad explican qué falta registrar. La distribución del programa representa la cantidad de sesiones de cada etapa, no una medición de habilidades.

Repositorio: [alvaroporras2002-coder/cybertracking](https://github.com/alvaroporras2002-coder/cybertracking). Sitio: [CYBERTRACK](https://alvaroporras2002-coder.github.io/cybertracking/).

## Alcance de esta entrega

| Parte | Alcance |
| --- | --- |
| Temario | 52 semanas y 364 sesiones disponibles para consultar |
| Evaluaciones desarrolladas | Semanas 1 a 4: bancos específicos y retos prácticos |
| Semanas 5 a 52 | Contenido y recursos disponibles; evaluaciones todavía pendientes |
| Progreso | Secuencial, sin fecha de inicio obligatoria |
| Datos | Guardados en este navegador y dispositivo |
| Servicios | Sin backend, cuentas, sincronización ni IA integrada |
| Publicación | Aplicación estática para GitHub Pages; la actualización se prepara en `feature/cybertrack-app` |

Estudiar un recurso es una declaración personal. Los ejercicios dentro de la web comprueban su tarea concreta; no acreditan dominio de toda una herramienta ni garantizan aprobar una certificación.

## Abrir la aplicación

Para usar el sitio necesitas servir la carpeta mediante HTTP. Abrir `index.html` con doble clic puede impedir que el navegador cargue los módulos y los datos JSON.

Desde una terminal situada en la carpeta del proyecto:

```bash
python -m http.server 8000
```

En algunos equipos se utiliza `python3` en lugar de `python`. Abre después [http://localhost:8000](http://localhost:8000). Este comando solo sirve archivos en tu equipo; no publica en internet. No necesita instalar paquetes del proyecto.

También puedes abrir [GUIA_GITHUB.html](GUIA_GITHUB.html), que explica cómo subir los archivos y conservar la estructura.

## Qué hace cada carpeta

| Ruta | Función |
| --- | --- |
| `index.html` | Entrada de la aplicación. Debe quedar en la raíz publicada |
| `assets/css/styles.css` y `app.css` | Diseño, estados y adaptación móvil |
| `assets/css/editorial.css` | Tema editorial minimalista, cargado después de los estilos base |
| `assets/css/glass.css` | Acabado de vidrio, esquinas redondeadas y portadas; cargado al final |
| `assets/images/stage-01.webp` a `stage-06.webp` | Imágenes de las seis etapas del programa |
| `assets/images/weeks/week-01.webp` a `week-52.webp` | Portadas distintas de las 52 semanas |
| `assets/illustrations/brand.svg` | Logotipo usado en la navegación y el icono del sitio |
| `assets/illustrations/lab.svg` | Ilustración isométrica del laboratorio |
| `assets/js/app.js` | Conexión de pantallas y acciones |
| `assets/js/router.js` | Navegación entre secciones |
| `assets/js/resources.js` | Carga de contenido y reproducción permitida |
| `assets/js/motion.js` | Efectos decorativos y movimiento reducido |
| `assets/js/analytics.js` | Agregaciones y gráficos de actividad, resultados y progreso |
| `assets/js/storage.js` | Estado local y persistencia |
| `assets/js/progress.js` | Requisitos de avance y progreso |
| `assets/js/assessments.js` | Intentos, preguntas y puntuación |
| `assets/js/timer.js` | Sesiones de tiempo de estudio |
| `assets/js/backup.js` | Respaldo, validación e importación |
| `data/curriculum.json` | Temario y recursos de las 364 sesiones |
| `data/assessments/week-01.json` a `week-04.json` | Bancos y retos del primer bloque |
| `data/content-status.json` | Estado de desarrollo del contenido |
| `tools/validate-content.py` | Comprobaciones del contenido |
| `tests/` | Pruebas de la lógica |
| `CONTENT_STATUS.md` | Cobertura y trabajo pendiente |
| `CHANGELOG.md` | Registro de versiones |
| `.nojekyll` | Mantiene la publicación como archivos estáticos |

Las pantallas son secciones de una aplicación; no necesitas crear un repositorio por sección. Sus enlaces utilizan rutas con `#`, por ejemplo `#home`, `#path`, `#notes`, `#progress` y `#settings`. La navegación del aula utiliza el ID estable de cada sesión.

## Subir a GitHub

En este repositorio los archivos están en la raíz de `feature/cybertrack-app`. Para actualizar el sitio, conserva la rama y carpeta que figuran en **Settings → Pages**. No es necesario cambiar la fuente de publicación para aplicar este rediseño. La propuesta de integración con `main` se mantiene en la PR existente.

Para instalar una copia en otro repositorio:

1. Crea un repositorio para el proyecto, por ejemplo `cybertrack`. El nombre es una elección, no un repositorio creado por esta entrega.
2. En su raíz, usa **Add file → Upload files**. Sube el contenido de la carpeta del proyecto conservando `assets`, `data`, `tools` y `tests` como carpetas.
3. Comprueba que `index.html` esté directamente en la raíz y que los archivos no hayan quedado todos mezclados allí.
4. Guarda los cambios en la rama elegida. Si el repositorio exige revisión, crea y fusiona la propuesta antes de continuar.
5. Abre **Settings → Pages**. Selecciona **Deploy from a branch**, rama **main** y carpeta **/(root)**; guarda.
6. Espera al resultado de publicación y utiliza **Visit site**. Consulta los detalles de ejecución si falla.

La disponibilidad de Pages depende del plan y la visibilidad del repositorio. El código puede ser público; tus registros personales no deben formar parte de él. Instrucciones de referencia: [crear un sitio](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [elegir la fuente de publicación](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) y [subir archivos](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository).

Si usas un repositorio de proyecto, la dirección suele seguir `https://USUARIO.github.io/REPOSITORIO/`. Sustituye ambos valores por los reales y toma como definitiva la dirección que muestre Pages. No se ha supuesto un usuario ni un dominio.

Mensaje de commit sugerido para la primera carga:

```text
Añadir la plataforma CYBERTRACK

Co-authored-by: Codex <noreply@openai.com>
```

## Uso y avance

- El inicio retoma la primera sesión que todavía no está superada.
- Marca los recursos obligatorios cuando los hayas estudiado; los opcionales no bloquean.
- Completa el reto práctico y supera la evaluación para avanzar.
- Un intento fallido se conserva y permite repasar sus explicaciones.
- Las semanas sin evaluación desarrollada pueden consultarse, pero no deben aparecer como aprobadas automáticamente.
- No estudiar un día no borra ni adelanta el recorrido.
- Los videos se insertan solo cuando el proveedor lo permite. Si falla el reproductor, abre el recurso original.

## Tus datos y las actualizaciones

El estado pertenece al origen y al navegador: computadora y móvil mantienen historiales separados. Borrar los datos del navegador, cambiar de navegador o cambiar de dirección puede hacer que no veas el historial anterior. Una copia del código HTML no contiene tu progreso.

Antes de actualizar o cambiar de dispositivo, usa el respaldo completo de la aplicación. Comprueba qué incluye; el respaldo completo contempla los archivos de evidencia, mientras que una exportación ligera puede excluirlos. Guarda el respaldo fuera de la carpeta pública. No subas respaldos, notas personales, evidencias privadas, contraseñas ni claves a GitHub.

Para actualizar, conserva la misma estructura y URL, reemplaza solo los archivos de aplicación necesarios y prueba la nueva versión. Mantén los IDs del contenido; cambiar un título no debe crear una sesión nueva. No borres el almacenamiento para intentar resolver un error: exporta primero y revisa el mensaje.

GitHub Pages sirve archivos estáticos; el código de corrección puede inspeccionarse. Esta es una herramienta personal de aprendizaje, no un sistema de vigilancia ni acreditación. Los enlaces y reproductores externos contactan a sus proveedores al utilizarlos.

## Comprobar antes de publicar

Con Node.js para las pruebas de JavaScript y Python para el validador:

```bash
node --test tests/*.test.mjs
```

```bash
python tools/validate-content.py
```

Comprueba además: móvil sin desplazamiento horizontal; navegación por teclado; movimiento reducido; una nota después de recargar; prueba fallida sin avance; aprobación con requisitos completos; exportación/importación y reproducción alternativa. El resultado real de las pruebas debe revisarse antes de declarar una versión terminada.

## Si algo falla

| Síntoma | Comprobación |
| --- | --- |
| Página vacía al abrir el archivo | Usa HTTP local o Pages, no `file://` |
| Página sin estilos | Revisa `assets/css/styles.css` y las mayúsculas del nombre |
| Temario sin cargar | Revisa `data/curriculum.json`, sus rutas y la consola |
| Pages muestra README o error | Comprueba `index.html` en la raíz de la fuente publicada |
| Funciona en raíz pero no en repositorio | Evita rutas que empiecen en `/assets` o `/data`; conserva las rutas relativas |
| No aparece el progreso del celular | Los dispositivos no sincronizan; importa un respaldo si deseas trasladar datos |
| Un video no se reproduce | Abre el original; la inserción depende del proveedor |
| Una semana no permite evaluación | Consulta `CONTENT_STATUS.md`; las evaluaciones pendientes no son un fallo de guardado |

Consulta [CONTENT_STATUS.md](CONTENT_STATUS.md) para la cobertura exacta y [CHANGELOG.md](CHANGELOG.md) para los cambios.
