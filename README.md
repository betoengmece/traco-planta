# Traço Planta

Editor de plantas residenciais com desenho em 2D e visualização em 3D. O editor permite desenhar, conectar e mover paredes, inserir portas e janelas, medir distâncias e desfazer alterações.

O código do editor está em `dist/`. Os arquivos do Three.js já estão incluídos em `dist/vendor/`.

## Abrir no computador

Na pasta do repositório, execute:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Abra [http://127.0.0.1:4173](http://127.0.0.1:4173). Não há instalação de pacotes ou etapa de compilação.

## Continuar o desenvolvimento

- `dist/app.mjs` controla a interface, o desenho 2D e o salvamento.
- `dist/model.mjs` gera a vista 3D com Three.js.
- `dist/geometry.mjs`, `dist/wall-edit.mjs`, `dist/measure.mjs` e `dist/window-types.mjs` contêm as regras do editor.
- `dist/template.mjs` define a planta inicial.

- `dist/sync.mjs` sincroniza o projeto entre aparelhos pelo Supabase.

## Sincronização entre aparelhos

Cada projeto tem um código secreto que fica no link (`#p=...`). O editor salva no navegador e, logo em seguida, na nuvem (tabela `planta_projetos` do Supabase, acessível só pelas funções `planta_get` e `planta_save`). A cada 5 segundos, e sempre que a aba volta ao primeiro plano, ele busca alterações feitas em outro aparelho.

Para abrir no outro aparelho, toque no botão de link no topo e abra o link copiado. Quem tiver o link pode ver e editar o projeto. Sem internet, o editor continua salvando no aparelho e envia quando a conexão voltar.

O catálogo de mobília ainda está pendente.

A versão publicada fica em https://betoengmece.github.io/traco-planta/ e é atualizada automaticamente a cada envio para o `main`.
