# Montar Etiquetas A4

Junta o DANFE simplificado e a etiqueta de transporte (ou a etiqueta e o packing list) na mesma folha A4.
Funciona direto no navegador, sem instalar nada e sem enviar os arquivos para a internet.

## Como usar

1. Abra `Montar-Etiquetas.html` no Chrome.
2. Escolha **1 pedido por folha** (A4 em pé, tamanho real) ou **2 pedidos por folha** (A4 deitada, economiza papel).
3. Arraste o PDF do marketplace para a caixa.
4. Baixe o PDF e imprima em **tamanho real (100%)**.

## Modelos reconhecidos

| Arquivo | Resultado |
|---|---|
| DANFE simplificado + etiqueta (Shopee, TikTok, Amazon, Magalu) | DANFE no topo, etiqueta embaixo |
| Etiqueta + packing list (TikTok) | Etiqueta à esquerda, packing list à direita |

O pareamento usa a chave de acesso, depois o número da nota, depois o rastreio e, por último, a ordem das páginas.
Peças sem par saem sozinhas em uma folha.

## Desenvolvimento

O código fica em `src/` (`app.js`, `estilo.css`, `index.html`) e as bibliotecas em `libs/`.
Para gerar o arquivo único `Montar-Etiquetas.html` depois de mudar algo:

```
python build.py
```

Bibliotecas: pdf-lib 1.17.1 e pdf.js 3.11.174.
