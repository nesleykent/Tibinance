# Tibia Coins: Price Dynamics, Predictability and Execution

**Relatório publicado:** [English](https://nesleykent.github.io/Tibinance/reports/tc-cycle/) · [Português (Brasil)](https://nesleykent.github.io/Tibinance/reports/tc-cycle/pt-br.html)

Rebuild de **02/10/2026**: **39 worlds, 319 capturas** (317 Offers e 2 Statistics). A pesquisa usa 316 capturas de Offers que passam pelo filtro de preços existente, com corte em **02/10/2026**; os dois snapshots de Statistics permanecem separados das séries de quotes. Astera integra todas as análises para as quais possui cobertura. Jacabra e Obscubra são séries separadas de precursores de Terribra. Os modelos usam melhores Piece Prices de Sell Offers e Buy Offers, nunca preços supostamente executados.

## Construção dos dados

`universe.py` deriva os worlds de `market-update.json`, incluindo o benchmark Antica. `research_data.py` centraliza corte, limpeza, agregação e anchors para todas as análises. O corte é a maior data de oferta válida nos arquivos disponíveis, limitado ao dia da execução; não é a data do download.

- API: timestamp UTC convertido para dia do servidor iniciado às 10h em Europe/Berlin. Excluem-se preços ausentes/não positivos, Buy ≥ Sell e Buy/Sell < 0,80 (`research_data.MIN_BID_ASK`, compartilhado com `compare_trades.py`). O filtro de spreads pode excluir condições reais; as entradas brutas permanecem preservadas, e `robustness.py` refaz todo o pipeline com pisos de 0,70, 0,75 e 0,85 e sem piso.
- Capturas: `market-update.json` completo, sem duplicatas por hash, com `capturedAt` local, `captureTimeZone` IANA e `capturedAtUtc` resolvido. A pesquisa preserva a data local fornecida e aplica a mesma limpeza de preços; o monitor preserva os snapshots. Statistics não substituem quotes de Offers.
- Série diária: mediana da API em cada dia; na ausência de oferta válida da API naquele dia, mediana das capturas. Um dia tem peso igual, sem duplicar API e capturas. Nesta edição, capturas acrescentam **243 combinações world/dia**. Não se presume simultaneidade intradiária entre as fontes.
- Anchor: cotação da data válida mais recente; empate de data favorece a última captura. Uma captura antiga também é marcada como stale. Nem todos os worlds têm leitura no dia do corte.
- Semanas: medianas das ofertas diárias, com rótulo no domingo; rótulos posteriores ao corte não entram no histórico de treino. A última observação continua disponível na anchor. Não há interpolação de dias/semana nem encadeamento de preços entre predecessor e successor.

Os snapshots históricos existentes permanecem congelados, enquanto mundos sem arquivo local recebem o histórico público da API e a cópia de conferência do arquivo público. A cobertura inclui os 39 worlds aceitos e as séries separadas dos precursores, sem substituir os históricos anteriormente coletados. Cantabra entrou pelo arquivo completo; as sete capturas de Unebra ficaram em review porque o Ends At da última Buy row não foi lido, sem reutilizar os quotes antigos. Todos os 80 arquivos históricos preexistentes permaneceram byte a byte iguais.

`inputs/api/manifest.json` contém URLs, datas de coleta e hashes. `inputs/history/` conserva a cópia de conferência do arquivo público `nesleykent/tibia-warzones-schedule`, reconciliada com a API para os 39 worlds. Os arquivos `observations-2.json`, `observations-3.json` e o CSV anterior permanecem como snapshots de procedência; o cálculo atual lê `market-update.json`.

## Pergunta, modelos e limites

O report abre com um sumário executivo, sem número, que responde às perguntas de quem tem TC ou gold (onde o price está, se deve subir mais, se deve cair depois, quando, quanto, com que confiança, se comprar ou vender agora ou esperar e se vender e recomprar compensa após spread e fee), e segue uma única cadeia inferencial em 15 capítulos: introdução, dados e construção das variáveis, estrutura empírica do Market, dinâmica temporal e cycles, estratégia de modelagem, out-of-sample validation, prospective scenarios, "O price vai cair?", implicações econômicas e de execution, comprar ou vender TC (scenarios de decisão), heterogeneidade entre worlds, robustness, discussão, o que refutaria a tese e conclusão, seguidos das notas com as fontes. Cada exhibit e cada número de destaque declara seu status de evidência: Observed (quotes e resultados históricos registrados), Backtested (modelo avaliado contra observações posteriores), Model-implied (saída de modelo ainda não avaliada) ou Exploratory (regra sem histórico suficiente para validação). Cada capítulo existe porque resolve uma etapa necessária da inferência: as regras de mensuração precedem a evidência, a validação precede os scenarios, e execution e heterogeneidade aplicam o processo estimado sem alimentá-lo. As regras de Precursor e de server age (Terribra, Floribra e Luzibra) ficam reunidas no capítulo de heterogeneidade. Os controles de world e Market side são compartilhados; as âncoras anteriores (`#s13`, `#s01`, `#s03`, `#inflation-method`, `#server-age`, `#lifecycle-validation`, `#lifecycle-scenarios`, `#announced-mergers` e demais) continuam válidas.

## Edições e convenções

`index.html` é a edição em inglês (inglês britânico) e `pt-br.html`, a edição em português do Brasil; as duas leem os mesmos arquivos e são montadas pelo mesmo `report.js`, que escreve cada texto como um par `t(en, pt)`. Números, datas e ordenação de tabelas seguem o idioma da página; títulos de exhibits e cabeçalhos de tabelas permanecem em inglês nas duas edições. Na edição em português, todos os termos financeiros, estatísticos, de Tibia e do jogo permanecem em inglês de forma consistente (price, spread, fee, return, premium, trend, seasonality, cycle, peak, trough, median, sample, forecast, scenario, stress band, world, merger, entre outros), com o gênero do equivalente em português; vocabulário genérico (dados, modelo, teste, análise) é traduzido. Títulos seguem a capitalização do Chicago: headline style em inglês, sentence case em português.

O relatório mostra uma página por vez: o sumário executivo, um capítulo ou as notas, conforme o índice lateral (no celular, o seletor no topo). O endereço (`#id`) identifica a página e qualquer ponto dela, de modo que links entre capítulos, números de nota e links para dossiês abrem a página certa e rolam até o alvo; voltar e avançar no navegador percorrem as páginas visitadas. As notas são numeradas sobre o texto completo, e não sobre a página aberta, e o estado dos controles (ponta, world, janelas, ordenação das tabelas) se mantém ao trocar de página. Só a página aberta existe no documento: cada bloco dinâmico declara os elementos em que desenha (`on(fn, deps, hosts)`) e roda quando sua página é aberta. A impressão cobre a página aberta.

Cada exhibit segue uma única anatomia: título; subtítulo com escopo e unidade; controles à direita; gráfico ou tabela; legenda; nota. Um exhibit de uma só ponta do Market termina o título com ela entre parênteses, e a unidade que o formatador já imprime em cada célula (%, pp) não se repete no cabeçalho. Todo controle ligado ao estado compartilhado (ponta, comparação do Δ, training window, horizon, probabilidade do tornado, janela do premium) é montado pela mesma função, e os ícones (idioma, link do capítulo, exportação) seguem uma única regra de estilo. Uma leitura do Market anterior à última data de captura recebe a etiqueta de idade, a mesma regra de stale das anchors. Tamanhos, margens dos gráficos e padrões de traço vêm dos tokens de `report.css`; seed, número de paths e parameter draws vêm de `complement.json`.

As fórmulas são escritas em LaTeX e compostas pelo KaTeX 0.18.9 (jsDelivr, com Subresource Integrity); sem ele, o código LaTeX aparece legível. As fontes são citadas por números sobrescritos, colocados após a pontuação que encerra a frase ou oração citada, e descritas em notas numeradas ao final, no formato de notas do *Chicago Manual of Style* (nota completa na primeira citação de uma fonte, nota abreviada nas seguintes). `report.js` marca as citações e numera as notas em ordem de leitura depois de montar a página, de modo que as duas edições têm a mesma numeração; anúncios de merger são citados a partir de `mergers.json`. Nenhum texto usa travessão nem glifo semelhante: intervalos são escritos com "to"/"a", números negativos usam o hífen-menos, valores ausentes aparecem como N/A e intervalos de páginas nas referências usam hífen.

O ensemble principal combina Constant, Seasonal Naive de 52 semanas e Harmonic com tendência e dois pares de harmônicos anuais, em pesos iguais no log-price. Treino limitado às 130 semanas anteriores à origem; teste com origens trimestrais e, desde esta edição, com origens semanais móveis em horizontes fixos de 13, 26 e 52 semanas, sempre nos alvos em que os três componentes existem (`validation` e `rollingDetail` em `results.json`). A avaliação informa MAPE, MAE, sMAPE e log error com bias; o skill ante Constant (principal) e Seasonal Naive (secundário) tem intervalo de 95% por circular block bootstrap sobre sequências de h origens consecutivas (2.000 réplicas, origens pareadas entre modelo e benchmark), omitido onde não cabem dois blocos; a ablação compara C+S, C+H, S+H e C+S+H nas mesmas origens. Os pesos continuam fixados antes da avaliação. Os cenários avançam sete dias a partir do corte, por 52 semanas. Os marcos mensais da apresentação usam a data disponível mais próxima, identificada nas tabelas.

O C+S (Constant e Seasonal Naive) teve MAPE menor do que o C+S+H em todas as combinações de horizonte e ponta da validação móvel, mas o intervalo pareado só fica inteiramente abaixo de zero em Buy Offers a 26 semanas; por isso o C+S+H, fixado antes da avaliação, continua publicado, e o C+S passa a challenger registrado. Desde esta edição, `ledger.py` congela a cada cutoff, em `forecast-ledger.jsonl`, as 52 semanas-alvo de C, S, H, C+S e C+S+H nas duas pontas, o P10 a P90 dos paths simulados nas duas training windows e os scenarios de 13 e 26 semanas de cada world pelas regras proporcional, com inclinação e com drift, com cutoff, anchor e SHA-256 de cada programa e entrada. O primeiro registro de um cutoff nunca é substituído; quando uma semana-alvo se encerra (seu domingo até um cutoff posterior), acrescenta-se um registro com a weekly median realizada e o erro de cada modelo. Cada linha traz o SHA-256 da anterior e o próprio; `validate.py` confere a cadeia e que a versão commitada do ledger é prefixo da versão de trabalho, e `test_ledger.py` confirma que qualquer edição de linha quebra a cadeia e que a avaliação é idempotente. O número efetivo de observações independentes da diferença de perda (Bartlett, h - 1 defasagens) é informado ao lado de origens e janelas sem sobreposição, só onde cabem dois blocos de h origens: cerca de 10 a 13 e a 26 semanas; a 52 semanas, 36 origens formam uma janela.

A transferência aos demais worlds aplica à anchor local o movimento proporcional da mesma ponta de Antica. Heuristic stress bands combinam erro observado, divergência de modelos e instabilidade do relative premium; não são confidence intervals nem intervalos de probabilidade calibrados. O teste móvel de transferência (`transferRolling`) aplica, em cada semana com quote do próprio world, a variação do ensemble de Antica à quote local e compara com o Constant do world em 13 e 26 semanas, com o mesmo block bootstrap; a matriz de transferabilidade do report o põe ao lado da instabilidade do premium, correlação, histórico pareado e tipo do world. Projeções de Luzibra e Etebra param em 22/10/2026, primeira data possível do merger **Luzibra + Yubra + Etebra → Deslumbra**, anunciado em 21/09/2026. A data exata ainda não estava confirmada na verificação de 27/09. Yubra participa do anúncio mesmo sem capturas no report; o limite analítico não é confirmação da execução do merger. Projeções que cruzam Buy/Sell são sinalizadas, sem ajuste arbitrário. Em `robustness.py`, a transferência de um para um é comparada, em cada origem do teste móvel, com uma inclinação e com inclinação e drift estimados para cada world sobre as variações de h semanas concluídas antes da origem (mínimo de 26 intervalos): a inclinação vence com intervalo acima de zero em 1 de 42 combinações testáveis e perde em 3, o drift nunca vence e perde em 8, e a median das inclinações no histórico completo é 0,98.

O complemento usa ARIMA/Harmonic, treino desde 2023 e desde 2024, quatro seeds, 300 parameter draws e 20 trajetórias por draw. Calibração com origens quinzenais consulta apenas o passado de cada origem. Training-window, seed, anchor e especificação (erros ARIMA(0,1,1) e ARIMA(2,1,0), um harmônico, sem drift) medem dimensões distintas e alimentam o tornado de `tornado`. Nos mesmos paths, `downside` separa a queda a partir do peak de cada path (mínimo posterior ao máximo até 28/02/2027) da queda abaixo do price de hoje e da semana de 30/11, com curvas semanais, thresholds de 5% a 25% e quantis; `breakEven` dá o nível máximo de recompra para gains de 0%, 5% e 10% em TC como taker e maker; `roundtrip` e `rebuyCurve` dão a distribuição do round trip e a probabilidade de gain por semana de recompra; `decisions` compara, para quem tem gold e compra TC e para quem tem TC e vende, agir hoje como taker com agir depois: na semana do ensemble scenario de novembro (23/11) e de junho (28/06), criando offer nessa semana (fee de 2%, execução presumida), metade hoje e metade depois, parcelas semanais iguais entre o P10 e o P90 da data simulada do turning point esperado (mínimo para o comprador, peak para o vendedor) e, como limites só alcançáveis em retrospectiva, no próprio peak e no próprio mínimo de cada path, com probabilidade de resultado melhor, quantis e medians condicionais do gain e da perda; nenhuma data ou nível é escolhido como alvo; `anchorAlternatives` refaz paths e economia a partir da median das capturas de 24 e 72 horas, com thresholds na captura mais recente; `depthRoundtrip` repete o round trip para 100 e 1.000 TC com o limite de slippage do book capturado; `calibrationDiagnostics` avalia a probabilidade de queda por reliability em cinco faixas, decomposição de Murphy do Brier e intercepto/inclinação logísticos. Origem/horizonte/ponta sobrepostos não são observações independentes. P10 a P90 são model-implied, sem equivalência com as stress bands do ensemble.

Os demais cálculos incluem turning points com reversão de 5%, volatilidade, persistence, relative premiums, grupos, level shifts, round-trip execution cost, maker/taker e fees, weekday effects, events/placebos e comparação separada com `day_average`. Médias diárias não identificam negócios executados; Amount não é volume negociado. A taxa de Create Offer e a direção de Buy/Sell seguem o [manual oficial](https://www.tibia.com/gameguides/?section=controls_trading&subtopic=manual).

## Terribra: informação dos precursores

`lifecycle.py` testa regras exploratórias fixas em origens semanais, sem importar `analyze.py` nem alterar o ensemble principal:

- **Constant:** última oferta local.
- **Benchmark:** anchor × retorno mediano de Antica no horizonte nas 104 semanas anteriores, exigindo dez retornos.
- **Local:** Benchmark × mudança mediana do log-premium de Terribra.
- **Precursor:** Benchmark × combinação de 50% da mudança local e 50% da média das medianas elegíveis de Jacabra/Obscubra, restritas a antes de 06/11/2025. Cada série precisa de três retornos do horizonte. Médias dos donors têm peso igual por world, sem misturar seus níveis.

A comparação de Precursor com Local usa os mesmos alvos, mas também reduz à metade o termo local, sem isolar a contribuição incremental dos precursores; Constant e Benchmark são controles. Endpoints consultam somente observações anteriores, com tolerância de três dias, sem interpolação. Jacabra tem apenas **cinco dias válidos**, sem retornos suficientes: o prior efetivo vem de Obscubra. A composição de população/gold/TC do merger não é observada.

Na edição anterior, havia **cinco origens em oito semanas e uma em 13 semanas por ponta**. Precursor reduz MAPE frente a Local em Sell Offers, mas piora em Buy Offers. Em oito semanas: Sell 2,27% vs Local 2,29%; Buy 2,99% vs Local 2,79%. São diferenças exploratórias pequenas e amostras sobrepostas, insuficientes para escolher um substituto validado do modelo principal. Horizontes sem suporte são explicitados.

Fontes oficiais: [composição do merger](https://www.tibia.com/news/?id=8513&subtopic=newsarchive), [data de 06/11/2025](https://www.tibia.com/news/?id=8514&subtopic=newsarchive), [confirmação de abertura](https://www.tibia.com/news/?id=8515&subtopic=newsarchive).

## Floribra: Luzibra na mesma idade

A idade usa a abertura oficial: [Luzibra em 21/05/2025](https://www.tibia.com/news/?id=8385&subtopic=newsarchive) e [Floribra em 20/05/2026](https://www.tibia.com/news/?id=8767&subtopic=newsarchive), não a primeira cotação. O gráfico compara preços em gp/TC por dias desde a abertura, sem normalizar níveis artificialmente. O drawer preserva datas reais e premiums quando há cotação contemporânea de Antica.

**Age Raw** aplica à anchor de Floribra a razão de preços de Luzibra entre a idade atual e a idade acrescida do horizonte. **Age Relative** aplicaria a mudança de log-premium sobre Antica ao controle Benchmark. Ambos consultam apenas donor já conhecido na origem, com endpoints anteriores à idade desejada e tolerância de sete dias; endpoints idênticos são rejeitados.

A regra principal usa Luzibra antes da [abertura de transfers em 30/06/2026](https://www.tibia.com/news/?id=8866&subtopic=newsarchive). A sensibilidade pre-merger usa todo o donor já observado antes do merger, separadamente. Alvos futuros de Floribra podem ser posteriores ao merger de Luzibra, pois sua referência é um trecho **passado** da idade de Luzibra; não se projeta o próprio donor através do merger.

Luzibra tem sua primeira oferta válida aos **128 dias** e Floribra chegou aos **135 dias** no corte. Por isso **não há pares posteriores elegíveis para validar a analogia fora da amostra**. Age Raw gera cenários condicionais; Age Relative permanece sem suporte no corte porque falta Antica na data do endpoint inicial do donor. A ausência não vira zero nem é preenchida com uma data futura. Valores Buy ≥ Sell no mesmo modelo/horizonte são marcados: não constituem book executável.

A analogia não identifica um efeito causal de idade. Cohort, calendário, região, população, acesso de free accounts ([Luzibra: retirada da restrição Premium em 29/07/2025](https://www.tibia.com/news/?id=8475&subtopic=newsarchive)) e transfers são fatores confundidos. Não se trata de afirmar que Luzibra é o futuro de Floribra.

## Inflação em gold

`inflation.py` usa a mesma série diária e corte, com mediana das medianas diárias por mês. Mês encerrado, ≥15 dias e ≥60% de cobertura qualificam a taxa. Meses encerrados esparsos conservam taxas observadas com asterisco, separadas das qualificadas. O mês corrente permanece parcial. Setembro já encerrou, mas agosto ainda é o último mês de Antica que passa pelos critérios de cobertura da comparação.

Mensal = 100 × (P[m]/P[m-1] - 1); 12 meses = 100 × (P[m]/P[m-12] - 1). Referências são meses do calendário, sem preencher lacunas nem somar taxas. Anual é dezembro/dezembro; no ano parcial, último mês encerrado/dezembro, sem anualizar. Janeiro/dezembro é coluna distinta. Médias anuais exigem todos os meses e comparam o mesmo período entre anos.

A decomposição descritiva de Antica ajusta ln(P) = intercepto + tendência linear + efeito do mês + resíduo, desde 2023 e desde 2024, com ≥24 meses elegíveis e duas ocorrências de cada mês. Atribuições somam diferenças de log-price, não pontos percentuais do retorno simples. A tendência constante da especificação não identifica inflação estrutural permanente nem a causa da geração de gold.

## Arquivos e reprodução

| Arquivos | Papel |
|---|---|
| `index.html`, `pt-br.html`, `report.css`, `report.js` | Relatório estático, sem build, em duas edições (inglês e português); lê os sete JSON públicos e o ledger. |
| `market-update.json`, `market_update.py` | Capturas completas, validação e universo monitorado. |
| `research_data.py`, `universe.py` | Fonte diária compartilhada, corte e fatos sobre worlds. |
| `analyze.py` → `results.json` | Histórico, anchors, ensemble, backtests, cycles, eventos e cenários. |
| `compare_trades.py` | Acrescenta diagnóstico API-only de `day_average` a `results.json`. |
| `complement.py` → `complement.json` | Probabilidades, calibração, execução e análises complementares. |
| `robustness.py` → `robustness.json` | Piso Buy/Sell (pipeline inteiro refeito), transferência com inclinação, anchors de 24 e 72 horas, evidência independente por horizonte, challenger C+S e limites de slippage a partir da depth das capturas. |
| `ledger.py` → `forecast-ledger.jsonl` | Forecasts congelados por cutoff e resultados acrescentados quando as semanas-alvo se encerram; nunca reescreve uma linha. |
| `inflation.py` → `inflation.json` e CSVs | Inflação mensal/anual e decomposição. |
| `lifecycle.py` → `lifecycle.json` | Precursores, idade, cobertura, cenários, erros por origem e hashes. |
| `fetch_api.py` | Obtém apenas históricos ausentes; snapshots existentes permanecem congelados. |
| `validate.py`, `test_*.py` | Invariantes, hashes, reprodução, fontes, cálculo e limites temporais. |
| `prepare_site.py` | Copia ativos públicos, incluindo as duas edições, lifecycle, robustness e o ledger, para `dist/reports/tc-cycle/`. |

Com Python e `requirements.txt` instalados, execute nesta pasta:

```sh
python analyze.py
python compare_trades.py
python complement.py
python inflation.py
python lifecycle.py
python robustness.py
python ledger.py
python -m unittest discover -p 'test_*.py'
python validate.py --reproduce
node --check report.js
node test_premium.cjs
node test_report_findings.cjs
python prepare_site.py
```

A reprodução lê arquivos congelados, sem buscar dados remotos. As datas futuras de eventos probabilísticos são alvos explícitos do desenho de pesquisa, não novas observações. O GitHub Pages serve os arquivos desta pasta diretamente. Fontes, entradas e transformações permanecem inspecionáveis; detalhes de revisões anteriores estão no histórico Git.

## Verificação da edição anterior (28/09/2026)

28 testes Python passaram, incluindo prioridade de fontes, corte dinâmico, ausência de future leakage, limites de donor, independência dos controles e sinalização de cenários cruzados. `validate.py` conferiu 39 worlds, 190 capturas, 4.056 cenários world/ponta/semana e os hashes/reconciliações, e agora também recalcula a validação móvel a partir de `rollingDetail` (MAPE, MAE, sMAPE, log error e skill), confere que C+S+H é o ensemble publicado, que os intervalos de bootstrap só aparecem onde cabem dois blocos, que as curvas de queda coincidem com as probabilidades publicadas, a aritmética de break-even e a decomposição do Brier. `validate.py --reproduce` reproduziu o complemento byte por byte em cópia temporária. A separação de `preds` em `components` foi conferida contra a versão anterior em todas as origens semanais: saída idêntica. `node --check report.js`, `node test_premium.cjs` (204 comparações), `node test_report_findings.cjs` (inclui o status de evidência dos cinco cards de destaque) e `node test_browser_compat.cjs` passaram.

No navegador, as duas edições renderizaram o sumário executivo, os 14 capítulos e os 39 worlds sem erros de console, sem valores indefinidos e sem travessões ou glifos equivalentes fora das fórmulas KaTeX; todos os novos controles (lado, training window, probabilidade do tornado e horizon da matriz) e o seletor de world rerenderizaram sem erros, e a página permaneceu sem rolagem horizontal em 375 px. As novas regras de CSS derivam dos tokens existentes; nenhum token foi criado ou alterado.

O capítulo 10, "Comprar ou vender TC: scenarios de decisão", foi acrescentado depois dessa verificação. `complement.py` foi reexecutado e todas as chaves anteriores de `complement.json` ficaram idênticas byte a byte; só `decisions` é novo. `validate.py` confere que a probabilidade de esperar até cada semana coincide com as curvas de `downside`, que metade hoje e metade depois reduz exatamente à metade os quantis do plano que divide, que a janela escalonada é a janela P10 a P90 da seed 11 e que peak e mínimo de cada path limitam as semanas dentro de sua janela; `validate.py --reproduce`, `node --check report.js` e os três testes em Node passaram. No navegador, as duas edições renderizaram os 15 capítulos e os seis novos exhibits sem erros de console, valores indefinidos ou travessões, e os controles de world e de training window rerenderizaram os exhibits dependentes. Em 375 px, a rolagem horizontal de 5 px que resta vem de uma fórmula da seção 06 e do controle do tornado na seção 08, e já existia antes deste capítulo.

`mergers.json` preserva a composição completa do anúncio, successor, data mínima, status de confirmação e fonte oficial, independentemente do universo monitorado. O gráfico e os dossiês de Luzibra/Etebra, a seção de dados e os cenários compartilham esses fatos. A primeira semana suspensa é 25/10, após o limite conservador de 22/10; não se publica previsão para Deslumbra nem se inventa cobertura de Yubra.

O gráfico Premium over Antica permite selecionar 1, 4, 8, 13, 26 ou 52 semanas e todo o histórico, separadamente por ponta. Cada janela termina na última semana pareada do world, preserva a mediana do log-premium utilizada pela pesquisa e mantém as capturas recentes como comparação. Os detalhes de cada linha informam número de semanas e datas efetivamente observadas; lacunas não são preenchidas. `test_premium.cjs` verifica a equivalência com os resultados de referência, limites de calendário, pares ausentes e exclusão de observações futuras.


A revisão metodológica anterior preservou o método publicado como referência: `results.json`, `inflation.json` e os CSVs ficaram idênticos byte a byte; `lifecycle.json` só mudou no hash de `research_data.py`; em `complement.json`, todas as chaves anteriores ficaram idênticas e só `anchorAlternatives` e `depthRoundtrip` são novas. `robustness.py` refez o pipeline inteiro para cada piso que altera os dados (0,70 e 0,75 compartilham uma execução): nenhuma conclusão do relatório se inverte; sem piso, as probabilidades mudam no máximo 0,2 pp; a 0,85, só o scenario exploratório de 4 semanas de Floribra perde a quote de apoio. As anchors de 24 e 72 horas mudam as probabilidades de Antica em no máximo 4,5 pp, sem inverter nenhuma resposta. `validate.py --reproduce`, `test_ledger.py` e os demais testes passaram; no navegador, as duas edições renderizaram os novos exhibits sem erros de console, valores indefinidos ou travessões, e sem rolagem horizontal em 375 px.

### Exportação de figuras e tabelas

O botão de download em cada figura exporta o estado selecionado como PNG a 2x,
com fundo branco, título, contexto, legenda e notas. As tabelas de `Chart Data`
têm seu próprio botão; a exportação mantém o recorte e a ordem ativos e inclui
as linhas e colunas fora da área de rolagem. Controles e tooltips são excluídos.
`export.js` clona o container semântico, incorpora estilos e fontes de fórmulas,
e rasteriza o conteúdo sem dependências de produção adicionais.

Teste de navegador (Playwright e Chrome disponíveis; servidor estático local), que percorre todas as páginas pelo índice:

```sh
REPORT_URL=http://localhost:8765/reports/tc-cycle/ node reports/tc-cycle/test_export.cjs
```


## Market Details / Statistics compatibility

`market-update.json` accepts legacy Offers records and version-6 capture records
with `viewType: "offers"` or `"statistics"`. The latter has no live quote/depth
fields: it carries `statistics30d.buy` and `.sell`, each containing
`transactions`, `highestPrice`, `averagePrice`, `lowestPrice`, and derived
`tcVolume`. Transaction counts are 25-TC lots; `tcVolume = transactions * 25`;
prices remain gp/TC. `market_update.py` validates the Statistics and temporal
fields through `js/statistics.js`, the exact website/batch contract.

The report's Statistics exhibit uses the shared reader for tables, charts,
world-level comparisons and derived metrics. Every snapshot preserves its
filename local `capturedAt`, IANA `captureTimeZone`, resolved `capturedAtUtc`,
local `captureDate`. Statistics alone add `statisticsReferenceDate`, the default
anchor for their 30-day historical/regression comparisons. Automatically detected
browser/system IANA time resolves capture instants. Find the 10:00 Europe/Berlin
save on the local capture date: before its local time use the previous local date;
at/after it use the current local date. CET/CEST and local DST are handled by
IANA conversion, without changing actual captures or offer expiries. Unavailable
or ambiguous instants are excluded only from this reference-date view.
Statistics values describe what was displayed at capture time, not the analysis
or rebuild date. Local capture-date grouping remains an optional observation view.
No exact 30-server-save window is assumed. Rolling lots and TC volumes overlap
and must not be summed across snapshots or differenced as daily traded flows.

The live Market monitor and all existing quote metrics exclude Statistics-only
records. The research offer loader also excludes them through its valid-book
rule. Ordinary Offers captures preserve their supplied local calendar dates and
actual timestamps; their expiries resolve in the same local timezone, never CET/CEST. The current canonical captures and research outputs were rebuilt from the raw archive; browser fixtures were isolated and never became source data. See the root README for the complete schema and verification commands.

## Historical rebuild audit (2 October 2026)

The current archive scan covered 1,502 files / 1,501 images: 426 eligible Hotkey screenshots, 1,075 filename exclusions, no duplicate hashes. Both Market views were processed together in full filename-clock order, from `2024-10-10T21:23:56.092` through `2026-10-02T00:36:37.332`, in the detected `America/Sao_Paulo` environment. Raw captures produced 319 accepted snapshots, 5,556 offer observations / 4,070 offer identities, and two Statistics snapshots / four side records. 70 eligible screenshots require review; 37 were rejected by the existing Market/item gates. Two browser failures remain review entries after one targeted retry.

[Every review and eligible rejection](../../data/rebuild-review.json), [validation counts and checks](../../data/rebuild-validation.json), and [complete anonymous processing order](../../data/rebuild-processing-order.json) are published alongside the [canonical captures](../../data/observations.json) and CSV exports. They contain hashes, clocks, worlds and reasons, without source filenames, character names, paths or images. Recoverable local backups were created before replacement; Git commit `9b33744` preserves the preceding canonical/generated edition. Statistics transaction counts remain 25-TC lots, prices remain gp/TC, and capture instants / local offer expiries remain independent of server-save-derived Statistics reference dates. No browser test state or old quote/extraction output entered the rebuild.

Verification of the rebuilt edition passed: 44 JavaScript tests; 56 Python tools tests (55 passed, one platform-specific skip); all 34 report Python tests; `validate.py --reproduce` including byte-identical complementary output, source reconciliation, model/fee arithmetic, temporal bounds and append-only ledger checks. Node premium checks covered 198 comparisons; findings and compatibility checks passed. Real Offers/Details OCR, review/persistence/export and EN/PT fixtures passed in isolated browsers. The actual canonical website import retained all 319 captures / 5,556 offer rows and their clocks, expiries, Statistics and UUIDs; both languages rendered four Statistics side rows responsively without runtime errors. All 71 exhibits in each language rasterized and exported successfully. A scan of 15 generated/public outputs found no source filenames, character text, local paths or image payloads. The existing report timezone description was corrected without changing numerical results, fields or research methods.
