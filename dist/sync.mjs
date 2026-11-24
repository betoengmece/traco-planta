// Um link abre uma reforma já existente. O código de acesso fica no fragmento.
const url='https://gqqxrmmahgnausfswgqt.supabase.co/rest/v1/rpc/';
const key='sb_publishable_N6LAXXM8H8qaorG9U9RQBA_K09vy3Qr';
const codeKey='traco-planta-codigo';

export function projectCode(hash) {
  const code=new URLSearchParams(hash.replace(/^#/,'')).get('p');
  return code && /^[A-Za-z0-9_-]{16,64}$/.test(code) ? code : null;
}

async function call(name,body) {
  const response=await fetch(url+name,{
    method:'POST',
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  if (!response.ok) throw new Error(name+' '+response.status);
  return (await response.json())[0]??null;
}

export function startSync({applyRemote,isBusy,status,unavailable}) {
  let storedCode;
  try { storedCode=localStorage.getItem(codeKey); } catch {}
  const code=projectCode(location.hash) || projectCode('#p='+storedCode);
  const cacheKey='traco-reforma:'+code;
  let version=0;
  let writing=false;
  let reading=false;

  function accept(row) {
    version=row.version;
    try {
      localStorage.setItem(codeKey,code);
      localStorage.setItem(cacheKey,JSON.stringify(row));
    } catch {}
    applyRemote(row.data);
  }

  async function pull(initial=false) {
    if (!code || reading || writing || (!initial && isBusy())) return;
    reading=true;
    try {
      const row=await call('planta_get',{p_id:code});
      if (!row || !row.data?.walls || !row.data?.openings) {
        if (!version) unavailable('Este link não localizou uma reforma.');
      } else if (row.version>version && !writing && !isBusy()) {
        accept(row);
        status('ok','Salvo na nuvem');
      } else if (!isBusy()) {
        status('ok','Salvo na nuvem');
      }
    } catch {
      if (!version) unavailable('Não foi possível carregar a reforma. Confira a conexão e tente de novo.');
      else status('error','Sem conexão');
    } finally {
      reading=false;
    }
  }

  if (code) {
    if (projectCode(location.hash)!==code) history.replaceState(null,'',location.pathname+location.search+'#p='+code);
    try {
      const cached=JSON.parse(localStorage.getItem(cacheKey));
      if (cached?.data) accept(cached);
    } catch {}
    pull(true);
    setInterval(()=>{ if (!document.hidden) pull(); },5000);
    window.addEventListener('focus',()=>pull());
  } else {
    unavailable('Abra o link compartilhado para acessar a reforma.');
  }

  window.addEventListener('hashchange',()=>{
    if (projectCode(location.hash)!==code) location.reload();
  });

  return {
    link:()=>version ? location.origin+location.pathname+'#p='+code : null,
    async save(data) {
      if (!version || writing) return 'unavailable';
      writing=true;
      status('busy','Salvando na nuvem…');
      try {
        const row=await call('planta_save_reforma',{p_id:code,p_data:data,p_expected_version:version});
        if (!row) {
          status('error','Reforma alterada em outro aparelho');
          return 'conflict';
        }
        accept(row);
        status('ok','Salvo na nuvem');
        return 'saved';
      } catch {
        status('error','Erro ao salvar na nuvem');
        return 'error';
      } finally {
        writing=false;
      }
    }
  };
}
