const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => new Intl.NumberFormat('es', {maximumFractionDigits: 3}).format(value);

export function transferEstimate(size, unit, megabitsPerSecond) {
  const scale = {MB: 1e6, MiB: 2 ** 20, GB: 1e9, GiB: 2 ** 30}[unit];
  size = Number(size); megabitsPerSecond = Number(megabitsPerSecond);
  if (!scale || !Number.isFinite(size) || size <= 0 || !Number.isFinite(megabitsPerSecond) || megabitsPerSecond <= 0) throw new Error('Introduce un tamaño y una velocidad mayores que cero.');
  const bytes = size * scale;
  if (!Number.isSafeInteger(Math.ceil(bytes))) throw new Error('El tamaño supera el intervalo de precisión de esta herramienta.');
  return {bytes, bits: bytes * 8, seconds: bytes * 8 / (megabitsPerSecond * 1e6)};
}

const ipv4 = number => [24, 16, 8, 0].map(shift => Math.floor(number / 2 ** shift) % 256).join('.');
export function inspectSubnet(address, prefix) {
  const parts = String(address).trim().split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) throw new Error('Escribe una dirección IPv4 de cuatro octetos entre 0 y 255.');
  if (String(prefix).trim() === '' || !Number.isInteger(Number(prefix)) || Number(prefix) < 0 || Number(prefix) > 32) throw new Error('El prefijo debe ser un entero entre 0 y 32.');
  prefix = Number(prefix);
  const value = parts.reduce((sum, p) => sum * 256 + Number(p), 0);
  const size = 2 ** (32 - prefix), base = Math.floor(value / size) * size, end = base + size - 1;
  const ordinary = prefix <= 30;
  return {prefix, mask: ipv4(2 ** 32 - size), network: ipv4(base), lastAddress: ipv4(end), broadcast: ordinary ? ipv4(end) : null,
    firstHost: ipv4(ordinary ? base + 1 : base), lastHost: ipv4(ordinary ? end - 1 : end), usable: ordinary ? size - 2 : size, size,
    note: prefix === 31 ? 'En un enlace punto a punto compatible con RFC 3021, las dos direcciones pueden identificar extremos; no se reserva broadcast.' : prefix === 32 ? 'Un /32 representa una sola dirección, por ejemplo una ruta a un host; no tiene broadcast propio.' : 'En una subred IPv4 convencional se reservan la dirección de red y el broadcast. La pertenencia al bloque no concede permisos de acceso.'};
}

export const teachingRules = [
  {id: '1', source: 'invitados', destination: 'interno', protocol: '*', port: null, action: 'Denegar'},
  {id: '2', source: 'personal', destination: 'web', protocol: 'TCP', port: 443, action: 'Permitir'},
  {id: '3', source: 'administracion', destination: 'interno', protocol: 'TCP', port: 22, action: 'Permitir'},
  {id: '4', source: '*', destination: 'internet', protocol: 'TCP', port: 443, action: 'Permitir'},
  {id: '5', source: '*', destination: '*', protocol: '*', port: null, action: 'Denegar'}
];
export function matchTeachingRule(packet, rules = teachingRules) {
  const port = Number(packet.port), protocol = String(packet.protocol).toUpperCase();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !['TCP','UDP'].includes(protocol)) throw new Error('Selecciona TCP o UDP y un puerto de 1 a 65535.');
  return rules.find(rule => (rule.source === '*' || rule.source === packet.source) && (rule.destination === '*' || rule.destination === packet.destination) && (rule.protocol === '*' || rule.protocol === protocol) && (rule.port == null || rule.port === port)) || null;
}

function facts(entries) { return `<dl class="lab-facts">${entries.map(([label,value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`; }
function unitResult(size, unit, rate) {
  const result = transferEstimate(size, unit, rate);
  return `${facts([['Tamaño en bytes',number(result.bytes)],['Tamaño en bits',number(result.bits)],['Tiempo ideal',`${number(result.seconds)} segundos`]])}<p>Fórmula: bytes × 8 ÷ (Mbps × 1.000.000). Es un límite teórico: protocolos, congestión, almacenamiento y otras condiciones pueden aumentar el tiempo real.</p>`;
}
function subnetResult(address, prefix) {
  const result = inspectSubnet(address, prefix);
  return `${facts([['Bloque',`${result.network}/${result.prefix}`],['Máscara',result.mask],['Direcciones totales',number(result.size)],['Primera utilizable',result.firstHost],['Última utilizable',result.lastHost],['Broadcast',result.broadcast || 'No se reserva en este caso'],['Hosts utilizables',number(result.usable)]])}<p>${escape(result.note)}</p>`;
}
function firewallResult(packet) {
  const rule = matchTeachingRule(packet);
  return `<p><strong>${escape(rule?.action || 'Sin coincidencia')} · ${rule ? `primera regla coincidente: ${escape(rule.id)}` : 'revisa la política'}</strong></p><p>Se evalúan origen, destino, protocolo y puerto en orden. La primera coincidencia decide; este modelo didáctico no crea tráfico ni modifica un firewall.</p>`;
}
function select(name, label, options) { return `<label class="field">${label}<select data-lab-field="${name}">${options.map(([value,title])=>`<option value="${value}">${title}</option>`).join('')}</select></label>`; }

export function renderLearningLab(dayId) {
  if (['w01d3','w09d5'].includes(dayId)) return `<section class="learning-lab card" data-learning-lab="units"><h3>Experimenta: tamaño y velocidad</h3><p>Cambia una variable y predice el resultado antes de leerlo.</p><div class="lab-controls"><label class="field">Tamaño<input type="number" data-lab-field="size" min="0.001" step="any" value="100"></label>${select('unit','Unidad',[['MB','MB · decimal'],['MiB','MiB · binario'],['GB','GB · decimal'],['GiB','GiB · binario']])}<label class="field">Velocidad en Mbps<input type="number" data-lab-field="rate" min="0.001" step="any" value="100"></label></div><div class="lab-result" data-lab-result aria-live="polite">${unitResult(100,'MB',100)}</div></section>`;
  if (/^w11d[1-7]$/.test(dayId)) return `<section class="learning-lab card" data-learning-lab="subnet"><h3>Experimenta: un bloque IPv4</h3><p>Parte de 192.0.2.70/26. Cambia a /27 y observa qué límites cambian.</p><div class="lab-controls"><label class="field">Dirección IPv4<input type="text" data-lab-field="address" value="192.0.2.70" inputmode="decimal" maxlength="15" spellcheck="false"></label><label class="field">Prefijo CIDR<input type="number" data-lab-field="prefix" value="26" min="0" max="32" step="1"></label></div><div class="lab-result" data-lab-result aria-live="polite">${subnetResult('192.0.2.70',26)}</div></section>`;
  if (['w14d3','w14d4','w25d2'].includes(dayId)) return `<section class="learning-lab card" data-learning-lab="firewall"><h3>Experimenta: primera regla coincidente</h3><p>Antes de cambiar el puerto, predice si el flujo seguirá permitido.</p><div class="lab-controls">${select('source','Origen',[['personal','Personal'],['invitados','Invitados'],['administracion','Administración']])}${select('destination','Destino',[['web','Aplicación web'],['interno','Servidor interno'],['internet','Internet']])}${select('protocol','Protocolo',[['TCP','TCP'],['UDP','UDP']])}<label class="field">Puerto de destino<input type="number" data-lab-field="port" value="443" min="1" max="65535" step="1"></label></div><div class="lab-policy" role="region" tabindex="0" aria-label="Reglas del firewall de ejemplo"><table><thead><tr><th scope="col">Orden</th><th scope="col">Origen</th><th scope="col">Destino</th><th scope="col">Protocolo</th><th scope="col">Puerto</th><th scope="col">Acción</th></tr></thead><tbody>${teachingRules.map(rule=>`<tr><th scope="row">${rule.id}</th><td>${escape(rule.source)}</td><td>${escape(rule.destination)}</td><td>${rule.protocol}</td><td>${rule.port ?? '*'}</td><td>${rule.action}</td></tr>`).join('')}</tbody></table></div><p class="muted">El asterisco significa cualquier valor en ese campo.</p><div class="lab-result" data-lab-result aria-live="polite">${firewallResult({source:'personal',destination:'web',protocol:'TCP',port:443})}</div></section>`;
  return '';
}

export function handleLearningLabInput(event) {
  const root = event.target?.closest?.('[data-learning-lab]');
  if (!root || !event.target?.hasAttribute?.('data-lab-field')) return false;
  const output = root.querySelector('[data-lab-result]');
  const read = name => root.querySelector(`[data-lab-field="${name}"]`)?.value ?? '';
  if (!output) return true;
  try {
    output.innerHTML = root.dataset.learningLab === 'units' ? unitResult(read('size'),read('unit'),read('rate')) : root.dataset.learningLab === 'subnet' ? subnetResult(read('address'),read('prefix')) : firewallResult({source:read('source'),destination:read('destination'),protocol:read('protocol'),port:read('port')});
  } catch (error) { output.innerHTML = `<p>${escape(error.message)}</p>`; }
  return true;
}
