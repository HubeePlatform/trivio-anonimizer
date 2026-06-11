# Presets de Seletores

Arquivos JSON prontos para importar na extensão Anonimizador.

## Como usar

1. Baixe o arquivo `.json` do preset desejado
2. Abra a extensão no navegador
3. Clique em **📥 Importar** e selecione o arquivo

## Como contribuir

1. Configure seus seletores pela extensão
2. Clique em **📤 Exportar** para baixar o arquivo JSON
3. Renomeie o arquivo com o nome do sistema (ex: `meu-sistema.json`)
4. Adicione à pasta `presets/` e abra um Pull Request

## Formato do arquivo

```json
{
  "version": "1.1",
  "selectors": [
    {
      "id": "abc123",
      "selector": ".nome-do-cliente",
      "label": "Nome do cliente",
      "blur": 7,
      "disabled": false,
      "count": 10
    }
  ]
}
```
