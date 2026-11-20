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

O editor salva o projeto no navegador. O desenho já editado em um aparelho fica no armazenamento daquele navegador. A sincronização entre dispositivos e o catálogo de mobília ainda estão pendentes.

A [versão publicada](https://traco-planta.betoengmec.chatgpt.site) é hospedada pelo Sites. Este repositório contém o código do editor.
