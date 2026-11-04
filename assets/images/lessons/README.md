# Fotografías ilustrativas del aula

Ocho escenas nuevas generadas para CYBERTRACK con la herramienta integrada de creación de imágenes de ChatGPT. No son fotografías documentales de un entorno real ni capturas de herramientas. Los diagramas de las clases se generan por separado a partir de relaciones y etiquetas escritas y verificables.

Las imágenes se exportaron a WebP, 1024 × 683 píxeles, calidad 82. Los PNG originales se conservaron durante la preparación; la aplicación solo referencia los WebP de esta carpeta. No hay llamadas a una API de imágenes durante el uso de la web.

`assets/js/lesson-photos.js` contiene textos alternativos, pies explicativos y la asignación de las 52 semanas. Las ocho escenas son distintas; varias semanas relacionadas comparten una escena contextual, mientras que sus explicaciones y diagramas son específicos del tema.

## Prompts utilizados

### hardware-components.webp

Use case: photorealistic-natural. Asset type: teaching photo for a cybersecurity learning application. Primary request: a precise-looking but illustrative editorial still life of desktop computer hardware on a clean pale blue workbench: an open desktop PC tower, a separate motherboard, two RAM sticks, a small square CPU safely on its protective tray, and a slim solid state drive. No hands. Composition: landscape 3:2, medium close overhead-oblique view, all components clearly separated and recognizable, no labels. Style: realistic material textures and soft daylight, bright off-white and cornflower-blue accents, professional educational magazine photography. Accuracy boundary: this is a conceptual photo of parts, not a wiring, assembly or electrical diagram; no arrows, no labels, no fake technical UI. Avoid logos, readable brand names, invented text, watermarks, neon hacker imagery, dangerous exposed powered connections. The resulting image should feel clean and calm within a light glassmorphism study app.

### network-lab.webp

Use case: photorealistic-natural. Asset type: teaching photograph for an online cybersecurity course. Primary request: a small tidy office networking lab on a white shelf, with a compact unmanaged Ethernet switch in the foreground, an ordinary router beside it, neatly routed blue Ethernet patch cables and one coiled fiber patch lead resting separately. A laptop edge is visible, but no people. Medium close side view, landscape 3:2, photographic shallow depth of field; bright soft daylight, off-white and subtle cornflower-blue palette. Recognizable physical ports and cables, realistic materials. Accuracy boundary: this is an illustrative physical scene, not a network topology or a claim that cables establish isolation. No labels, arrows, readable interface text, brand names or logos. Avoid neon hacker atmosphere, abstract glowing globes and fabricated circuit diagrams.

### identity-access.webp

Use case: photorealistic-natural. Asset type: teaching photo about identity and access. Primary request: a close editorial still life on a clean pale desk: a small physical USB security key beside a modern phone with an intentionally abstract authentication screen, a plain employee access badge turned face-down, and the edge of a laptop. No names or readable credentials. Landscape 3:2, low oblique close view with the security key in crisp focus. Realistic soft daylight, bright warm-white and muted blue glass accents. Accuracy boundary: objects illustrate distinct authentication and physical access tools, not a diagram or proof of authorization. No words, numbers, logos, lock-shield graphics, readable codes or private data. The image must be clearly different from a hardware components photo or server rack.

### continuity-backup.webp

Use case: photorealistic-natural. Asset type: educational supporting photograph about backups and service continuity. Primary request: an unplugged rugged external backup drive on a clean white worktable in sharp foreground focus, its cable visibly disconnected beside it, and softly blurred neat server racks in a bright professional room behind glass. Landscape 3:2, eye-level tabletop editorial photography; soft natural illumination, off-white and pale cornflower-blue palette, physically realistic materials. Accuracy boundary: photo illustrates separation of a backup device from live systems, not a guarantee of recovery, redundancy, cloud topology or security. No readable labels, logos, interface text, fake cloud icons, arrows, diagrams or glowing circuits.

### soc-investigation.webp

Use case: photorealistic-natural. Asset type: supporting teaching photo for cybersecurity operations. Primary request: an attentive analyst viewed from behind and slightly to the side at a clean modern desk in a bright security operations workspace, using two monitors with deliberately abstract non-readable log rows and simple calm chart blocks. A paper notebook and pen beside the keyboard. Landscape 3:2, medium editorial environmental portrait, warm soft daylight, off-white, graphite and muted cornflower-blue tones. Human focus and careful note taking, not theatrical hacking. Accuracy boundary: screens are synthetic abstract displays, not real logs, exact dashboards, evidence, software instructions or a real incident. No readable text, logos, names, IP addresses, matrix code, red warning banners, hoodies or neon effects.

### evidence-workbench.webp

Use case: photorealistic-natural. Asset type: supporting teaching photograph about preserving digital evidence. Primary request: a tidy forensic workbench with an unpowered bare SATA hard drive on an antistatic mat, a small hardware write-blocker device placed separately beside it, a sealed blank evidence bag and an open paper logbook with intentionally unreadable pale lines. No person and no visible live data. Landscape 3:2, close three-quarter tabletop view in bright soft laboratory daylight, realistic matte metal and plastic, off-white and blue accents. Accuracy boundary: illustrate evidence-handling tools only; do not show an exact connection scheme, acquisition process, labels or claim any forensic result. No logos, legible text, serial numbers, arrows, diagrams, bloody crime-scene styling or cybersecurity clichés.

### email-analysis.webp

Use case: photorealistic-natural. Asset type: teaching photo about careful email and phishing analysis. Primary request: an isolated laptop on a light home-office desk next to a printed paper checklist and magnifying glass, screen showing a deliberately abstract fictional email layout with a sender block, subject bar, paragraph shapes and an attachment tile, absolutely no readable words or addresses. Laptop is not being clicked; no human hands. Landscape 3:2, slightly elevated side view, realistic editorial photography, bright soft window light, white and pale blue with a small muted coral accent on a notebook. Accuracy boundary: visual context for analyzing a sample email, not a screenshot or exact software tutorial. No real messages, readable domains, clickable QR codes, logos, arrows, shield icons or neon hacker imagery.

### portfolio-study.webp

Use case: photorealistic-natural. Asset type: supporting teaching photo about presenting a cybersecurity project and preparing interviews. Primary request: a professional study desk with a laptop displaying an intentionally abstract project document, an open notebook with unreadable sketches, a neat folder of project printouts, a glass of water and a simple headset beside the laptop. No person. Landscape 3:2, wider eye-level editorial interior photography with a calm bright window background, warm off-white and cornflower-blue accents. Distinct composition from hardware/networking photos: focus is organized learning and presentation rather than machinery. Accuracy boundary: this is a conceptual workspace, not a real CV, credential, assessment result or job offer. No readable text, numbers, brand names, logos, certificates, fake charts or watermarks.

## Criterios de revisión

- Composiciones diferenciadas por objeto y contexto.
- Sin datos personales, credenciales ni texto técnico que el alumno deba interpretar.
- Los pies de foto explican qué ilustra cada escena y qué no puede deducirse de ella.
- La geometría de red, los pasos de investigación y las relaciones entre conceptos pertenecen a los diagramas accesibles de cada lección, no a estos fondos fotográficos.
