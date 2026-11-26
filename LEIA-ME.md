# Montar Etiquetas

Junta o DANFE simplificado e a etiqueta de transporte (ou a etiqueta e o packing list) na mesma folha A4, ou deixa todas as páginas em 10x15 cm para impressora térmica.
Funciona direto no navegador, sem instalar nada e sem enviar os arquivos para a internet.

## Como usar

1. Abra `Montar-Etiquetas.html` no Chrome.
2. Escolha **A4, 1 pedido** (em pé, tamanho real), **A4, 2 pedidos** (deitada, economiza papel) ou **Térmica 10×15**.
3. Arraste o PDF do marketplace para a caixa.
4. Baixe o PDF e imprima em **tamanho real (100%)**.

## Térmica 10×15

Cada página do arquivo (por exemplo, o PDF exportado do Bling) é recortada na área impressa e ajustada para 100×150 mm, na mesma ordem e sem mudar a proporção. Na impressora, escolha o papel 100×150 mm, sem margens e em tamanho real.

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
