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

## Etapas da reforma

Abra o link compartilhado da reforma, identificado pelo código no fragmento `#p=...`. Use **Copiar link** para abrir a mesma reforma em outro aparelho. O endereço de acesso permite consultar e editar as etapas.

A linha do tempo parte da **Original** protegida. Cada etapa guarda as diferenças em relação à etapa anterior. Para corrigir uma etapa antiga, revise o impacto e confirme a propagação. O editor aponta operações incompatíveis e preserva as demais.

`dist/renovation.mjs` calcula e reaplica as diferenças. `dist/sync.mjs` consulta o Supabase e usa a versão da reforma para impedir que uma gravação substitua alterações mais recentes. O editor salva as etapas na nuvem ao confirmar a edição.

A versão publicada fica em https://betoengmece.github.io/traco-planta/ e é atualizada automaticamente a cada envio para o `main`.
