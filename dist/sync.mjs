// Sincroniza o projeto entre aparelhos usando o Supabase.
// Cada projeto tem um código secreto que vai no link (#p=...). Quem abre o mesmo link vê o mesmo projeto.

const url = 'https://gqqxrmmahgnausfswgqt.supabase.co/rest/v1/rpc/';
const key = 'sb_publishable_N6LAXXM8H8qaorG9U9RQBA_K09vy3Qr';
const codeKey = 'traco-planta-codigo';
const versionKey = 'traco-planta-versao';
const pendingKey = 'traco-planta-pendente';
const pollEvery = 5000;
const saveDelay = 800;

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(bytes, b => chars[b % chars.length]).join('') + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => chars[b % chars.length]).join('');
}

function codeFromHash() {
  const match = location.hash.match(/[#&]p=([A-Za-z0-9_-]{16,64})/);
  return match ? match[1] : null;
}

async function call(name, body) {
  const response = await fetch(url + name, {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(name + ' ' + response.status);
  const rows = await response.json();
  return rows[0] ?? null;
}

function storedNumber(name) {
  try { return Number(localStorage.getItem(name)) || 0; } catch { return 0; }
}
function store(name, value) {
  try { localStorage.setItem(name, String(value)); } catch {}
}

/**
 * options.getProject(): projeto atual
 * options.applyRemote(data): troca o projeto pelo da nuvem
 * options.isBusy(): true enquanto o usuário arrasta ou desenha
 * options.status(kind, text): mostra o estado na barra
 */
export function startSync(options) {
  let code = codeFromHash();
  const fromLink = Boolean(code);
  if (!code) { try { code = localStorage.getItem(codeKey); } catch {} }
  const isNew = !code;
  if (!code) code = newCode();
  let version = fromLink && code !== safeGet(codeKey) ? 0 : storedNumber(versionKey);
  store(codeKey, code);
  if (codeFromHash() !== code) history.replaceState(null, '', location.pathname + location.search + '#p=' + code);

  let dirty = false;
  let saving = false;
  let timer = null;
  let ready = false;

  function safeGet(name) { try { return localStorage.getItem(name); } catch { return null; } }

  async function save() {
    timer = null;
    if (saving) { timer = setTimeout(save, saveDelay); return; }
    saving = true;
    dirty = false;
    options.status('busy', 'Salvando na nuvem…');
    try {
      const row = await call('planta_save', { p_id: code, p_data: options.getProject() });
      version = row?.version ?? version + 1;
      store(versionKey, version);
      if (!dirty) store(pendingKey, 0);
      options.status(dirty ? 'busy' : 'ok', dirty ? 'Salvando na nuvem…' : 'Salvo na nuvem');
    } catch (error) {
      console.error(error);
      dirty = true;
      options.status('error', 'Sem conexão · salvo neste aparelho');
      timer = setTimeout(save, 10000);
    } finally {
      saving = false;
    }
  }

  function changed() {
    if (!ready) return;
    dirty = true;
    store(pendingKey, 1);
    options.status('busy', 'Salvando na nuvem…');
    clearTimeout(timer);
    timer = setTimeout(save, saveDelay);
  }

  async function pull() {
    if (!ready || dirty || saving || options.isBusy()) return;
    try {
      const row = await call('planta_get', { p_id: code });
      if (row && row.version > version && !dirty && !saving && !options.isBusy()) {
        version = row.version;
        store(versionKey, version);
        options.applyRemote(row.data);
        options.status('ok', 'Atualizado de outro aparelho');
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function begin() {
    options.status('busy', 'Conectando…');
    try {
      const row = await call('planta_get', { p_id: code });
      if (row) {
        // Já existe na nuvem. Se outro aparelho salvou depois, a nuvem vale.
        // Se nada mudou lá e este aparelho ficou com alterações sem enviar, envia agora.
        ready = true;
        if (row.version !== version) {
          version = row.version;
          store(versionKey, version);
          store(pendingKey, 0);
          options.applyRemote(row.data, true);
          options.status('ok', 'Salvo na nuvem');
        } else if (storedNumber(pendingKey)) {
          await save();
        } else {
          options.status('ok', 'Salvo na nuvem');
        }
      } else {
        // Ainda não existe na nuvem: só envia quando a pessoa editar ou pedir o link.
        // Assim visitas sem edição (robôs, prévias de link) não criam projetos.
        ready = true;
        if (storedNumber(pendingKey)) await save();
        else options.status('idle', 'Salvo neste aparelho');
      }
    } catch (error) {
      console.error(error);
      ready = true;
      dirty = true;
      options.status('error', 'Sem conexão · salvo neste aparelho');
      timer = setTimeout(save, 10000);
    }
  }

  begin();
  setInterval(() => { if (document.visibilityState === 'visible') pull(); }, pollEvery);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('focus', pull);
  window.addEventListener('hashchange', () => { if (codeFromHash() && codeFromHash() !== code) location.reload(); });

  async function flush() {
    clearTimeout(timer);
    if (!ready) await new Promise(resolve => { const t = setInterval(() => { if (ready) { clearInterval(t); resolve(); } }, 100); });
    if (version === 0 || dirty || storedNumber(pendingKey)) { dirty = true; await save(); }
    return !dirty;
  }

  return {
    changed,
    flush,
    link: () => location.origin + location.pathname + '#p=' + code,
    isNew
  };
}
