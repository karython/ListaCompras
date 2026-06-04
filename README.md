# Lista de Compras

Aplicativo de lista de compras inteligente criado com React e Tailwind CSS.

## Visão geral

Este projeto é uma lista de compras que permite gerenciar produtos, mercados e histórico de preços com persistência local no navegador.

## Funcionalidades

- Adicionar produtos com categoria e preço
- Persistência de itens e histórico de preços no `localStorage`
- Escolher mercado e atualizar preços por mercado
- Editar ou remover itens da lista
- Exportar o relatório usando impressão do navegador
- Favicon personalizado e título `Lista de Compras`

## Tecnologias usadas

- React 19
- Create React App
- Tailwind CSS
- lucide-react (biblioteca de ícones)

## Scripts disponíveis

No diretório do projeto, execute:

### `npm start`

Inicia o app em modo de desenvolvimento.
Abra [http://localhost:3000](http://localhost:3000) no navegador.

### `npm run build`

Cria a versão de produção otimizada em `build/`.

### `npm test`

Roda os testes configurados (se houver).

## Configuração do Tailwind CSS

O Tailwind está configurado em:

- `tailwind.config.js`
- `postcss.config.js`
- `src/index.css` com `@tailwind base`, `@tailwind components` e `@tailwind utilities`

## Personalização do app

- Título da página atualizado para `Lista de Compras` em `public/index.html`
- Manifest app com nome `Lista de Compras` em `public/manifest.json`
- Favicon apontando para a imagem externa fornecida

## Deploy

Após gerar o build, sirva a pasta `build/` com um servidor estático ou publique em plataformas como Vercel, Netlify ou GitHub Pages.

## Observações

O projeto está pronto para receber novas funcionalidades de categorias, filtros, e integração com APIs de mercado.
