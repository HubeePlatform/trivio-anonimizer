# Anonimizador

Extensão Chrome para ocultar dados sensíveis em qualquer site durante gravações de vídeo e apresentações.

## Funcionalidades

- **Picker de elementos** — clique em qualquer elemento da página para ocultá-lo
- **Seleção de coluna** — ao clicar em uma célula de tabela, oculta a coluna inteira automaticamente
- **CPF / CNPJ automático** — detecta e oculta qualquer CPF ou CNPJ visível na página
- **Blur configurável por elemento** — slider de intensidade de 2px a 30px para cada item
- **Ativar / Desativar por elemento** — pause a ocultação de um item sem removê-lo da lista
- **Ativar / Desativar todos** — controle global de todos os elementos de uma vez
- **Destaque ao passar o mouse** — passe o mouse sobre um item da lista para ver qual elemento corresponde na página
- **Persistência** — configurações salvas localmente, sobrevivem a recarregamentos de página

## Instalação

1. Faça o download ou clone este repositório
2. Abra o Chrome e acesse `chrome://extensions`
3. Ative o **Modo do desenvolvedor** (canto superior direito)
4. Clique em **Carregar sem compactação** e selecione a pasta do projeto

## Como usar

1. Navegue até qualquer site
2. Clique no ícone 🔒 da extensão na barra do Chrome
3. Ligue o toggle para ativar o modo anonimato
4. Clique em **Selecionar Elemento** e clique sobre qualquer dado sensível na página
5. Para colunas de tabela: o picker detecta automaticamente e oculta a coluna inteira
6. CPF e CNPJ são ocultados automaticamente ao ativar a extensão

## Estrutura

```text
anonimizador/
├── manifest.json    # Manifest V3
├── content.js       # Lógica de ocultação, picker e detecção de padrões
├── content.css      # Estilos de blur e picker
├── popup.html       # Interface do popup
├── popup.js         # Lógica do popup
└── popup.css        # Estilos do popup
```

## Tecnologias

- Chrome Extensions API (Manifest V3)
- `chrome.storage.local` para persistência
- CSS `filter: blur()` com variável CSS customizada por elemento
- `MutationObserver` para SPAs (React/Vue/Angular)

## Licença

MIT
