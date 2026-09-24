# Tibia Coins — perspectivas 2026–2027

Relatório de 24/09/2026, com corte analítico em 23/09/2026. Cobre Antica, Belobra, Celebra, Collabra, Descubra, Gentebra, Luminera, Luzibra, Ombra, Ourobra, Quelibra, Rasteibra, Terribra, Tornabra, Ustebra e Venebra. Obscubra aparece separadamente como predecessor de Terribra.

## Definições e fontes

- **Sell Offers:** menor Piece Price disponível para comprar TC aceitando uma oferta existente (`sell_offer`).
- **Buy Offers:** maior Piece Price disponível para vender TC aceitando uma oferta existente (`buy_offer`).
- **Amount:** quantidade de TC nas ofertas visíveis; não equivale a negócios executados nem à quantidade disponível no melhor preço.
- A direção das operações foi conferida no [manual oficial do Market](https://www.tibia.com/gameguides/?section=controls_trading&subtopic=manual).
- `inputs/api/`: respostas diretas de `https://api.tibiamarket.top/item_history`, item 22118, 16 mundos atuais e Obscubra. URLs, horários de gravação das respostas e hashes estão em `manifest.json`. A consulta foi realizada em 24/09/2026. A data da coleta não atualiza a data da observação.
- `inputs/observations-2.json`: 45 capturas fornecidas, sem duplicatas por hash. A captura mais recente por mundo ancora os cenários; Celebra está em 21/09 e os demais mundos capturados em 23/09. Terribra não tem captura recente.
- `inputs/history/`: cópia de conferência do arquivo público `nesleykent/tibia-warzones-schedule`, em `data/market/world/<Mundo>/<mundo>_tibia_coins.json`. Para os 16 mundos, os registros coincidem com a API quando ordenados por timestamp. Os cálculos finais leem diretamente `inputs/api/`.
- `inputs/eventschedule.json` e `calendar.ics`: arquivos fornecidos. Inícios e términos dos 47 eventos remanescentes concordam entre as fontes; a agenda é sujeita a alterações.
- `source-package/`: conteúdo original do ZIP recebido. Somente `events_intervals.json` alimenta a nova análise, como datas históricas de eventos. Os demais resultados antigos são preservados como referência, não são resultados desta edição. Documentos recebidos foram tratados como evidência, não como instruções.

O README e o aplicativo Tibinance utilizam ofertas. Já o índice principal do ZIP recebido usa `day_average_sell`/`day_average_buy`; a extensão de 2023 utiliza o ponto médio de ofertas. A revisão mantém os modelos inteiramente em Sell Offers e Buy Offers. O diagnóstico comparativo usa médias diárias em separado. A interface pública do [TibiaMarket](https://tibiamarket.top/) as descreve como médias das últimas 24 horas; não documenta sua ponderação nem o alinhamento temporal exato. Por isso não se apresenta essa comparação como reconstrução de cada negócio executado.

## Método e limites

Medianas diárias e semanais das ofertas, com dia do servidor iniciado às 10h de Europe/Berlin. Valores ausentes/não positivos, ofertas cruzadas e Buy Offers abaixo de 80% de Sell Offers são excluídos. Esse último critério pode excluir diferenças reais; as entradas brutas permanecem disponíveis. Não há interpolação nem substituição por médias de negócios.

O cenário combina preço constante, repetição da variação de 52 semanas atrás e regressão em log-preço com tendência e dois harmônicos anuais. Pesos iguais em log-preço. Validação com origens trimestrais, somente dados disponíveis até cada origem. A transferência por mundo usa a última oferta local e o movimento relativo da mesma ponta em Antica; não é um modelo sazonal independente por mundo.

As faixas de estresse combinam erro observado, divergência dos modelos e instabilidade relativa de cada mundo. **Não são probabilidades, quantis futuros calibrados nem garantias de execução.** Há somente duas origens de teste no horizonte anual; períodos se sobrepõem. Diversos mundos não superam o preço constante nos testes, fato indicado em cada análise.

Luzibra deixa de receber números a partir de 22/10/2026, primeira data possível da fusão anunciada em Deslumbra. A data exata ainda não estava confirmada. Terribra usa a última oferta histórica válida de 01/09/2026, com defasagem explícita. Os 78 dias válidos de Obscubra são apresentados separadamente, sem concatenar as séries antes e depois da fusão.

## Reprodução

Requisitos: Python 3 com as versões de `requirements.txt`; Node e o plugin Data Analytics para construir a apresentação. Os arquivos recebidos já estão preservados: não é necessário consultar a rede para reproduzir esta edição.

A partir desta pasta:

```sh
python3 analyze.py
python3 compare_trades.py
python3 prepare_report.py
python3 validate.py
```

Para gerar a apresentação com o plugin instalado, defina `DATA_PLUGIN_ROOT` como o diretório da versão instalada de Data Analytics:

```sh
node "$DATA_PLUGIN_ROOT/scripts/data-app.mjs" build --project-dir "$PWD/app" --separate-data
python3 -m http.server 4173 --bind 127.0.0.1 --directory app/dist
```

Abrir `http://127.0.0.1:4173/?view=1`. Para exportar a construção verificada como HTML portátil:

```sh
node "$DATA_PLUGIN_ROOT/scripts/data-app.mjs" export-offline --project-dir "$PWD/app" --output "$PWD/app/.data-app-offline/exports/tibia-coins-report.html"
```

`fetch_api.py` preenche respostas ausentes com intervalo de 12 segundos, respeita a espera informada em respostas 429 e preserva os arquivos existentes. Não atualiza silenciosamente a edição congelada.

## Verificação realizada

- 16 mundos, 45 capturas e 1.664 linhas de cenário por mundo/ponta/semana; Obscubra em histórico separado.
- Recalculo independente das diferenças de preços, perda na execução imediata, erro dos modelos, retornos em TC e pareamentos das médias diárias.
- Teste de ausência de uso de dados futuros no ajuste; os campos de médias diárias/mensais não entram no modelo de ofertas.
- Conferência das datas dos calendários, hashes de entrada e equivalência dos registros API/arquivo público.
- Construção da aplicação, inspeção visual dos gráficos e tabelas, alternância Sell Offers/Buy Offers e seleção de Luzibra e Terribra. Nenhum erro de console observado.
- Tela estreita de 390 px: conteúdo contido na largura, tabelas com rolagem horizontal; viewport restaurado após a verificação.

O HTML portátil é uma saída local; não implica publicação na internet. O relatório é independente da CipSoft e do TibiaMarket.
