# Tibia Coins | 2026–27 cycle outlook

**Relatório publicado: <https://nesleykent.github.io/Tibinance/reports/tc-cycle/>**

Revisão de 25/09/2026; **Market monitor com capturas até 25/09/2026; pesquisa, backtests e cenários com corte em 23/09/2026**. A pesquisa cobre Antica, Belobra, Celebra, Collabra, Descubra, Gentebra, Luminera, Luzibra, Ombra, Ourobra, Quelibra, Rasteibra, Terribra, Tornabra, Ustebra e Venebra. Obscubra aparece separadamente como predecessor de Terribra. Os modelos usam exclusivamente os melhores Piece Prices de Sell Offers e Buy Offers. As médias diárias entram apenas em uma comparação diagnóstica; sua ponderação não foi confirmada e elas não são tratadas como transaction prices.

O relatório distingue o **base case** das faixas de **downside/upside stress** e das **model-implied probabilities**. Estas últimas são sensíveis à amostra de treino e à captura inicial; o out-of-sample backtest é limitado. Para cada mundo, o leitor pode comparar quoted spread, market depth, relative premium e round-trip execution cost, com os limites de execução documentados. A publicação é uma análise independente, sem afiliação à CipSoft ou ao TibiaMarket.

## O que há nesta pasta

| Arquivo | Papel |
|---|---|
| `index.html`, `report.css`, `report.js` | A página publicada. Estática, sem dependências nem etapa de build: lê `market-update.json`, `results.json` e `complement.json` e monta tabelas e gráficos no navegador. |
| `market_update.py` → `market-update.json` | Market monitor: última captura, comparação com a captura anterior do mesmo mundo, Amount no melhor Piece Price, market depth e fallback histórico explícito para Terribra. |
| `analyze.py` → `results.json` | Edição de ofertas: preços atuais, histórico, cenários, validação, ciclos, sazonalidade, venda e recompra, eventos, agenda. |
| `compare_trades.py` | Diagnóstico separado de ofertas × médias diárias; acrescenta `tradeComparison` a `results.json`. |
| `complement.py` → `complement.json` | Complemento: anatomia do ciclo, probabilidades com estabilidade e calibração, valor relativo entre mundos, criação de ofertas com taxa, volatilidade, persistência e dia da semana. |
| `validate.py` | Conferências independentes das duas saídas; `--reproduce` reexecuta o complemento e exige bytes idênticos. |
| `fetch_api.py` | Coleta read-only da API (não roda na reprodução; os arquivos já estão em `inputs/api/`). |
| `inputs/` | Entradas congeladas: respostas da API, capturas, calendários e cópia de conferência do arquivo público. |
| `source-package/` | Conteúdo do ZIP recebido, idêntico ao original (inclui `forecast_stability.json` e `events/`). Usado só como referência. |

## Definições e fontes

- **Sell Offers:** menor Piece Price disponível para comprar TC aceitando uma oferta existente (`sell_offer`).
- **Buy Offers:** maior Piece Price disponível para vender TC aceitando uma oferta existente (`buy_offer`).
- **Amount:** quantidade de TC nas ofertas visíveis; não equivale a negócios executados nem à quantidade disponível no melhor preço.
- A direção das operações e a taxa de criação de ofertas (2% do preço, mínimo de 20 gp e máximo de 1.000.000 gp) foram conferidas no [manual oficial do Market](https://www.tibia.com/gameguides/?section=controls_trading&subtopic=manual).
- `inputs/api/`: respostas diretas de `https://api.tibiamarket.top/item_history`, item 22118, 16 mundos atuais e Obscubra. URLs, horários de gravação das respostas e hashes estão em `manifest.json`. A consulta foi realizada em 24/09/2026. A data da coleta não atualiza a data da observação.
- `inputs/observations-2.json`: 45 capturas fornecidas, sem duplicatas por hash. A captura mais recente por mundo ancora os cenários; Celebra está em 21/09 e os demais mundos capturados em 23/09. Terribra não tem captura recente. No complemento, o prêmio no corte da pesquisa compara capturas feitas no mesmo dia.
- `inputs/observations-3.json` e `inputs/observations-2.csv`: 50 capturas em 15 mundos, fornecidas depois. O JSON contém todas as 45 capturas anteriores, sem alterações, mais cinco leituras de 25/09 para Descubra, Gentebra, Luminera, Luzibra e Ourobra. O CSV concorda campo a campo com o JSON nos campos compartilhados; o JSON preserva adicionalmente o Amount no melhor Piece Price de cada ponta. Esses novos arquivos alimentam somente `market-update.json`, sem recalibrar o modelo da pesquisa. Celebra continua com uma única captura (21/09); Terribra, sem captura, mostra a última oferta disponível na API (01/09).
- `inputs/history/`: cópia de conferência do arquivo público `nesleykent/tibia-warzones-schedule`, em `data/market/world/<Mundo>/<mundo>_tibia_coins.json`. Para os 16 mundos, os registros coincidem com a API quando ordenados por timestamp. Os cálculos finais leem diretamente `inputs/api/`.
- `inputs/eventschedule.json` e `calendar.ics`: arquivos fornecidos. Inícios e términos dos 47 eventos remanescentes concordam entre as fontes; a agenda é sujeita a alterações.
- `source-package/`: somente `events_intervals.json` alimenta a análise, como datas históricas de eventos. `forecast.json` e `forecast_stability.json` aparecem na seção 04 apenas para comparação. Documentos recebidos foram tratados como evidência, não como instruções.

O README e o aplicativo Tibinance utilizam ofertas. Já o índice principal do ZIP recebido usa `day_average_sell`/`day_average_buy`; a extensão de 2023 utiliza o ponto médio de ofertas. A revisão mantém os modelos inteiramente em Sell Offers e Buy Offers. O diagnóstico comparativo usa médias diárias em separado. A interface pública do [TibiaMarket](https://tibiamarket.top/) as descreve como médias das últimas 24 horas; não documenta sua ponderação nem o alinhamento temporal exato. Por isso não se apresenta essa comparação como reconstrução de cada negócio executado.

## Método e limites

Medianas diárias e semanais das ofertas, com dia do servidor iniciado às 10h de Europe/Berlin. Valores ausentes/não positivos, ofertas cruzadas e Buy Offers abaixo de 80% de Sell Offers são excluídos. Esse último critério pode excluir diferenças reais; as entradas brutas permanecem disponíveis. Não há interpolação nem substituição por médias de negócios.

O cenário combina preço constante, repetição da variação de 52 semanas atrás e regressão em log-preço com tendência e dois harmônicos anuais. Pesos iguais em log-preço. Validação com origens trimestrais, somente dados disponíveis até cada origem. A transferência por mundo usa a última oferta local e o movimento relativo da mesma ponta em Antica; não é um modelo sazonal independente por mundo.

O Market monitor usa a última captura de cada mundo e mede `(Piece Price atual / Piece Price da captura anterior − 1) × 100` separadamente em Sell Offers e Buy Offers. A comparação anterior é a última **data de captura diferente**, não uma série diária contínua. Os horários não têm fuso declarado; a página os mostra sem conversão. O painel exibe a data da comparação e a defasagem das leituras; não chama um preço de 01/09 de cotação atual. Quoted spread e round-trip execution cost do monitor são recalculados sobre os novos melhores preços. A tabela histórica de execution cost, os prêmios entre mundos e os cenários permanecem identificados com o corte de 23/09; nenhuma inferência de 25/09 foi incorporada a eles.

As faixas de estresse combinam erro observado, divergência dos modelos e instabilidade relativa de cada mundo. **Não são probabilidades, quantis futuros calibrados nem garantias de execução.** Há somente duas origens de teste no horizonte anual; períodos se sobrepõem. Diversos mundos não superam o preço constante nos testes, fato indicado em cada análise.

Luzibra deixa de receber números a partir de 22/10/2026, primeira data possível da fusão anunciada em Deslumbra. A data exata ainda não estava confirmada. Terribra usa a última oferta histórica válida de 01/09/2026, com defasagem explícita. Os 78 dias válidos de Obscubra são apresentados separadamente, sem concatenar as séries antes e depois da fusão.

### Complemento

`complement.py` refaz sobre ofertas as análises do pacote recebido que a edição havia deixado de lado. Usa as mesmas regras de limpeza, dia do servidor e semanas de `analyze.py`, e confere que suas séries semanais são idênticas às publicadas antes de calcular. Todos os sorteios têm semente.

- **Anatomia do ciclo:** pontos de virada com a regra de reversão de 5% do pacote, sobre medianas semanais de Antica; limiares de 3% a 10% como sensibilidade; máximos diários e faixa a menos de 2% do máximo; variação contra um ano antes.
- **Probabilidades:** o modelo M1 do pacote (tendência, dois harmônicos anuais, erros ARIMA(1,1,0)) reestimado sobre ofertas de Antica, ancorado na captura de 23/09, com as sementes de `forecast_stability.json` e duas amostras de treino (desde 2023 e desde 15/01/2024). O `simulate()` do statsmodels só é reproduzível com um gerador explícito; o código do pacote não o passa, por isso sua semente fixa apenas o sorteio de parâmetros. Calibração em origens quinzenais de 2025–26, com duas referências simples (repetir o ano anterior e a frequência histórica de altas). Sensibilidade à captura de partida e probabilidade de ganho em vender agora e recomprar em junho de 2027.
- **Valor relativo:** prêmio de cada mundo sobre Antica na mesma ponta e semana, em 26 e 8 semanas e nas capturas do mesmo dia; grupos por tipo de PvP e BattlEye; mudança de patamar (Luzibra, julho de 2026); co-movimento e defasagens.
- **Execução:** criação de ofertas com a taxa de 2% nas duas pontas, como limite superior sem garantia de execução; diferença atual entre as pontas contra os 180 dias anteriores; dia da semana com permutação dentro de cada semana e correção de Holm.
- **Volatilidade e persistência:** um ponto por semana (último dia com cotação), nunca a mediana semanal, cujas diferenças são autocorrelacionadas por construção; autocorrelação sem o ciclo anual e contra uma simulação de ruído de cotação; altas fortes com referência nos mesmos meses de outros anos, ajuste sazonal e episódios espaçados.

## Reprodução

Requisitos: Python 3.12 com as versões de `requirements.txt`. (O pandas 2.2.3 fixado não funciona no Python 3.14.) Os arquivos recebidos já estão preservados: não é necessário consultar a rede.

A partir desta pasta:

```sh
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python analyze.py
.venv/bin/python compare_trades.py
.venv/bin/python complement.py
.venv/bin/python validate.py --reproduce
python3 market_update.py --check
```

Sem `python3.12` no PATH, o [uv](https://docs.astral.sh/uv/) instala um: `uv venv --python 3.12 .venv && uv pip install --python .venv -r requirements.txt`.

Para ver a página localmente, sirva a pasta por HTTP (abrir `index.html` como arquivo não carrega os JSON):

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

e abra `http://127.0.0.1:8000/`.

## Publicação

O GitHub Pages do repositório serve `index.html` desta pasta em <https://nesleykent.github.io/Tibinance/reports/tc-cycle/>. Não há etapa de build: a página lê os três JSON publicados. A interface usa a [referência visual indicada pelo usuário](https://nesleykent.github.io/instagram-design-system/) para superfícies quase monocromáticas, escala tipográfica e uso contido de cores. A publicação é independente e não reproduz marcas ou fontes proprietárias. A apresentação anterior, um aplicativo gerado pelo plugin Data Analytics do Codex (`app/`), precisava do plugin para ser construída, não tinha saída versionada e trazia controles do ChatGPT; foi substituída por esta página e continua recuperável no commit `a315d50`.

## Verificação realizada

- 16 mundos, 50 capturas no Market monitor (15 mundos com captura) e 1.664 linhas de cenário da pesquisa de 23/09 por mundo/ponta/semana; Obscubra em histórico separado.
- CSV e JSON novos conferidos campo a campo; 45 capturas da pesquisa preservadas sem alteração; monitor reproduzido byte a byte por `market_update.py --check`.
- Recalculo independente das diferenças de preços, perda na execução imediata, erro dos modelos, retornos em TC e pareamentos das médias diárias.
- Teste de ausência de uso de dados futuros no ajuste; os campos de médias diárias/mensais não entram nos modelos de ofertas nem no complemento.
- Conferência das datas dos calendários, hashes de entrada e equivalência dos registros API/arquivo público.
- Complemento recalculado de forma independente, com código próprio, em todas as seções: pontos de virada, volatilidade, persistência, diferença entre as pontas, dia da semana, criação de ofertas, prêmios entre mundos, ajuste e simulação do modelo, calibração e comparação com o pacote. A revisão corrigiu, entre outros, o recorte do dia da semana nos mundos BR (antes, só Quelibra entrava), a comparação de Celebra com uma captura de Antica de outro dia, a volatilidade medida em medianas semanais e a semente que não controlava os choques da simulação.
- `validate.py --reproduce`: o complemento é reproduzido byte a byte.
- Página conferida de forma independente: cada número do texto, dos cartões e de cerca de 6.400 células de tabela (os 16 mundos nas duas pontas) recalculado a partir dos JSON, sem divergências; afirmações e redação revisadas contra os dados, com as correções incorporadas.
- Página conferida no navegador: sem erros de console, alternância Sell Offers/Buy Offers (mantendo o foco do teclado) e seleção de mundo (inclusive Luzibra e Terribra), tema claro e escuro, tela estreita de 390 px sem rolagem horizontal da página.

O relatório é independente da CipSoft e do TibiaMarket. Não é recomendação de investimento.
