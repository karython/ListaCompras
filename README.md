# Lista de Compras

Aplicativo de lista de compras inteligente criado com React, Tailwind CSS e Supabase.

## Visão geral

Este projeto permite adicionar produtos, trocar de mercado, gerenciar histórico de preços e persistir todos os dados em um banco de dados Supabase.

## Funcionalidades

- Adicionar produtos com categoria e preço
- Persistência de itens e histórico de preços no Supabase
- Escolher mercado e atualizar preços por mercado
- Editar ou remover itens da lista
- Exportar o relatório usando impressão do navegador
- Favicon personalizado e título `Lista de Compras`

## Tecnologias usadas

- React 19
- Create React App
- Tailwind CSS
- lucide-react (ícones)
- Supabase

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. Crie as tabelas mínimo necessárias:
   - `items` com colunas: `id`, `name`, `category`, `price`
   - `markets` com colunas: `id`, `name`
   - `price_history` com colunas: `id`, `item_name`, `market`, `price`
3. Configure as variáveis de ambiente em `.env` ou `.env.local`:

```env
REACT_APP_SUPABASE_URL=https://your-project-ref.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-public-key
```

4. Execute o projeto com `npm start`.

## Scripts disponíveis

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
- `src/index.css`

## Personalização do app

- Título da página atualizado para `Lista de Compras` em `public/index.html`
- Manifest app com nome `Lista de Compras` em `public/manifest.json`
- Favicon apontando para a imagem externa fornecida

## Deploy

Após gerar o build, sirva a pasta `build/` com um servidor estático ou publique em plataformas como Vercel, Netlify ou GitHub Pages.

## Observações

O projeto está pronto para continuar a customização de categorias, filtros, relatórios e integração com APIs de mercado.
