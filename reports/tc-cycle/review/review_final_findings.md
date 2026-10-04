# Final review findings (unverified; workflow stopped before skeptic pass)

## review:portuguese (32 findings)

### 1. [critical/pt] Glossary term 'seasonal' is translated as 'sazonal' throughout the PT prose
- **location**: Ch03 'pressupõe um padrão sazonal fixo'; Ch04 'uma amplitude sazonal constante', 'quando altas sazonais são frequentes', 'subtraído o movimento sazonal esperado', 'foi em grande parte sazonal', 'componente sazonal deveria capturar', 'após o ajuste sazonal'; Ch06 'uma regra sazonal simples'; Ch08 'que seu padrão sazonal sugere', 'o que o padrão sazonal entregou'; Ch11 'uma regra sazonal simples', 'o timing sazonal importou'. Source: report.js lines 1342, 1359, 1389, 1396, 1464, 1502, 1521, 1689, 1693
- **problem**: The glossary lists 'seasonal' as a statistical term that stays in English, and the PT text does use it in Ch03 ('o componente seasonal por 46,2%') and in exhibit headers ('Seasonal log pts'). The same adjective is then translated as 'sazonal/sazonais' 12 times. That is exactly the selective translation the brief prohibits.
- **fix**: Replace every PT occurrence: 'um padrão seasonal fixo'; 'uma amplitude seasonal constante'; 'quando a seasonality costuma produzir altas'; 'subtraído o movimento seasonal esperado'; 'cujo excesso de forward return foi em grande parte seasonal'; 'um modelo com price level em deslocamento e componente seasonal'; 'após o ajuste seasonal'; 'do que uma regra seasonal simples' (Ch06 and Ch11); 'a strategy mais simples que seu padrão seasonal sugere'; 'Os round trips históricos mostram o que o padrão seasonal entregou'; 'o timing seasonal importou para quem tem TC'.
- **evidence**: Ch03: 'o componente seasonal por 46,2%' against Ch04: 'que um modelo com price level em deslocamento e componente sazonal deveria capturar' and 'após o ajuste sazonal'.

### 2. [major/pt] Glossary term 'mean' is rendered as 'média/médio'
- **location**: Ch06 'sua probability média de alta em Sell Offers foi 55%' (report.js 1453); Ch09 'e a média das medians dos predecessors elegíveis' (1578); Ch09 all 28 world profiles 'o erro médio foi 3,3%, ante 2,7% do modelo Constant' (template at 2020)
- **problem**: The glossary keeps 'mean' in English, and the PT text does so in Ch03 ('a mean de janeiro a agosto', 'as means anuais') and Ch05 ('geometric mean'). The same statistic is translated in three other places, one of which is repeated in all 28 world profiles. The EN reads 'mean probability', 'the mean of the medians' and 'mean error'.
- **fix**: Ch06: 'e a mean de sua probability de alta em Sell Offers foi 55%, ante 38% de altas efetivamente observadas'. Ch09: 'e a mean das medians dos predecessors elegíveis antes da merger'. Profiles (line 2020, both branches): 'o MAPE foi 3,3%, ante 2,7% do modelo Constant' (the value rendered is w.testMape). If exact parity with EN 'mean error' is preferred, use 'o mean error foi'.
- **evidence**: 'sua probability média de alta'; 'a média das medians dos predecessors'; 'No teste da transferência, o erro médio foi 3,3%'. Contrast with 'a mean de janeiro a agosto de 2026 varia +5,83%'.

### 3. [major/pt] Glossary term 'median' appears as the Portuguese adjective 'mediano' or in the hybrid 'variação median'
- **location**: Ch03 '5,73% no world mediano' (1293), 'a variação median dentro de cada mês', 'a variação median das Sell Offers é maior em setembro' (1334); Ch04 'a variação median nas quatro semanas seguintes' (1389); Ch09 profiles of Dracobra, Floribra and Luzibra 'o discount mediano era 41%' (2023); Ch10 'o peak mediano em 52 gp', 'o peak mediano é 46.710' (1635), 'o gap mediano em 289 dias pareados' (1646), exhibit subtitle 'Gap mediano, %' (1648)
- **problem**: 'median' is a glossary term, and the noun is kept in English everywhere ('a median', 'weekly medians'). The attributive uses are handled two ways. Some are translated ('mediano', 7 times). Others put the English word after a Portuguese noun ('variação median'), which is not Portuguese syntax. Both break the consistency requirement.
- **fix**: Use the English noun: '5,73% na median dos worlds'; 'a median da variação dentro de cada mês'; 'a median da variação das Sell Offers é maior em setembro (+10,1%)'; 'a median da variação nas quatro semanas seguintes foi +3,1%'; 'antes dele, a median do discount era 41%'; 'move as estimativas em até 3,5 pp e a median do peak em 52 gp'; 'com a seed 11, a median do peak é 46.710'; 'a median do gap em 289 dias pareados é +0,05%'; subtitle 'Median do gap, %'.
- **evidence**: 'o gap mediano em 289 dias pareados é +0,05%'; 'a variação median das Sell Offers é maior em setembro (+10,1%)'.

### 4. [major/pt] 'previsões' translates the glossary term 'forecast' in the research question and the conclusion
- **location**: Ch01 'e o que essas previsões implicam para um jogador que precisa negociar' (report.js 1197); Ch12 'e o que essas previsões implicam sob fricções reais de execution' (1703)
- **problem**: 'forecast' is a glossary term and appears in English more than 40 times. It is translated only in the two sentences that state and answer the research question, which are the most visible places in the report.
- **fix**: Ch01: 'e o que esses forecasts implicam para um jogador que precisa negociar em meio às fricções do Market?'. Ch12: 'e o que esses forecasts implicam sob fricções reais de execution'.
- **evidence**: Ch01: 'em que medida a dinâmica temporal e cross-sectional dos prices de TC em gold pode ser caracterizada e prevista out of sample, e o que essas previsões implicam'.

### 5. [major/pt] 'custos' and 'execuções' translate the glossary terms 'cost' and 'execution' in the Discussion
- **location**: Ch11 'Os custos de execution, por fim, traduzem essas propriedades em resultados.' (report.js 1693); 'os exercícios de execution mostram o que aconteceria sob execuções e custos especificados' (1695)
- **problem**: 'cost' and 'execution' stay in English in Ch08 (the heading 'O cost de atravessar o spread', 'round-trip execution cost', 'a execution no best price'). In Ch11 they are translated, and 'custos de execution' even mixes both languages inside one term.
- **fix**: 'Os costs de execution, por fim, traduzem essas propriedades em resultados.' and 'os exercícios de execution mostram o que aconteceria sob executions e costs especificados.'
- **evidence**: Ch08 heading 'O cost de atravessar o spread' against Ch11 'Os custos de execution'.

### 6. [major/pt] 'merger' is consistently masculine, contrary to the stated gender convention ('a merger')
- **location**: Ch02 'a um merger em Deslumbra', 'no regime anterior ao merger', 'através de seu próprio merger', 'quando há merger anunciado', table note 'Merger anunciado, anchor defasada'; Ch05 'a incerteza de um merger', 'um merger, uma anchor defasada ou um level shift'; Ch07 'worlds com merger anunciado'; Ch09 'de um merger ou level shift ter rompido', 'antecedeu o anúncio do merger', 'a data efetiva do merger permanecia indefinida ..., e ele não pode ocorrer', 'Como um merger pode alterar', 'regime anterior ao merger', 'começam apenas no merger', 'antes do merger' (x3), 'do merger de Luzibra', 'o merger anunciado delimitam', 'perdem sentido em um merger', profiles 'após o merger'. report.js 893, 897, 1233 to 1235, 1243, 1415, 1425, 1494, 1545, 1571, 1573, 1578, 1596, 1601, 1607, 1620, 1994, 2016
- **problem**: brief.md fixes the convention as the gender of the usual Portuguese equivalent and names 'a merger' (from 'fusão') explicitly. The PT edition uses the masculine at about 20 sites, including the pronoun 'ele' for the merger.
- **fix**: Make the term feminine everywhere: 'a uma merger em Deslumbra, que não ocorrerá antes de 22/10/2026'; 'anterior à merger'; 'de sua própria merger'; 'merger anunciada' (Ch02, the table note, Ch07, Ch09 scenarios paragraph); 'a incerteza de uma merger'; 'uma merger, uma anchor defasada ou um level shift'; 'de uma merger ou um level shift ter rompido'; 'o anúncio da merger'; 'a data efetiva da merger permanecia indefinida ..., e ela não pode ocorrer'; 'Como uma merger pode alterar'; 'começam apenas na merger'; 'antes da merger'; 'da merger de Luzibra'; 'a abertura de transfers e a merger anunciada delimitam'; 'perdem sentido em uma merger'; 'após a merger'.
- **evidence**: brief.md: 'a trend, a seasonality, ..., a merger, a anchor'. PT Ch09: 'a data efetiva do merger permanecia indefinida no cutoff da pesquisa, e ele não pode ocorrer antes de 22/10/2026'.

### 7. [major/pt] Negation error: 'supera o controle do benchmark em nenhum'
- **location**: Ch09, Terribra predecessor test paragraph (report.js 1879)
- **problem**: In Portuguese, 'nenhum' placed after the verb requires 'não' before the verb. 'mas supera ... em nenhum' is ungrammatical and reads literally as a positive claim. The sentence also lacks the article in 'em relação a Local'.
- **fix**: 'Em Sell Offers, a regra Predecessor reduz o MAPE em relação à regra Local em 2 de 2 horizons avaliáveis, mas não supera o controle do benchmark em nenhum deles, e, em 13 semanas, o modelo Constant supera todas as regras'. In code: `${beatsBench.length ? `mas supera o controle do benchmark em ${beatsBench.length} deles` : 'mas não supera o controle do benchmark em nenhum deles'}`.
- **evidence**: 'a regra Predecessor reduz o MAPE em relação a Local em 2 de 2 horizons avaliáveis, mas supera o controle do benchmark em nenhum, e, em 13 semanas'

### 8. [major/pt] Ch06 estimation-window sentence is too long to follow
- **location**: Ch06, 'Sensibilidade à estimation window, à seed e à anchor' (report.js 1459)
- **problem**: A 16-word appositive ('estimado sobre variações semanais e, por isso, não diretamente comparável à trend mensal da seção 03') separates 'reduz o drift anual' from its range 'de +10,9% para +8,4% ao ano'. Later, 'abaixo do ponto de partida de 57% para 80%' first reads as 'a starting point of 57%'. Three consequences are chained in one sentence.
- **fix**: 'A estimation window importa porque altera o processo ajustado. Iniciar a sample em janeiro de 2024 exclui todo o ano de 2023, inclusive a alta de 34% de seu primeiro semestre, em uma época normalmente de queda; com isso, o drift anual do modelo estocástico cai de +10,9% para +8,4% ao ano e o cycle ajustado se amplia, o que eleva de 57% para 80% a probability de a semana de 28/06/2027 terminar abaixo do ponto de partida. Esse drift, estimado sobre variações semanais, não é diretamente comparável à trend mensal da seção 03, e, como as quedas observadas vêm diminuindo, o ajuste desde 2024 pode superestimar a próxima.'
- **evidence**: 'o que reduz o drift anual do modelo estocástico, estimado sobre variações semanais e, por isso, não diretamente comparável à trend mensal da seção 03, de +10,9% para +8,4% ao ano e amplia o cycle ajustado, movendo a probability de a semana de 28/06/2027 terminar abaixo do ponto de partida de 57% para 80%'

### 9. [major/pt] Calque 'screenshots ... lidos para os mesmos dois prices' in the data definition
- **location**: Ch02, first paragraph (report.js 1207)
- **problem**: 'lidos para' is a word-for-word rendering of 'read into'. It is not Portuguese, and it obscures how the captures produce the two prices in the paragraph that defines the data.
- **fix**: 'enquanto 102 capturas do Market, isto é, screenshots do Market do jogo dos quais se extraem os mesmos dois prices, com seus Amounts e a depth de cada lado, fornecem as observações mais recentes.'
- **evidence**: 'enquanto 102 capturas do Market, screenshots do Market do jogo lidos para os mesmos dois prices, com seus Amounts e a depth de cada lado, fornecem as observações mais recentes'

### 10. [minor/pt] 'cobertura' used for data coverage while 'coverage' is kept for interval coverage
- **location**: Ch02 'cuja cobertura e exclusões aparecem' (1226); Ch03 table note 'não atinge a cobertura mínima' (2150); Ch03 'se qualifica pela regra de cobertura' (1327); Ch03 table note 'Como a cobertura varia' (2107); Ch09 'Mesmo com cobertura completa' (1573); also 900, 1051, 1958 and 2139 in other branches
- **problem**: 'coverage' is a glossary term, and the EN uses 'coverage' for both senses (the 'Coverage %' column, 'coverage rule'). The PT translates it five times and keeps it in Ch06 ('a coverage dessas bands'). That is selective translation of the same term.
- **fix**: 'cuja coverage e exclusões aparecem'; 'não atinge a coverage mínima'; 'pela regra de coverage'; 'Como a coverage varia'; 'Mesmo com coverage completa'; apply the same change to the non-rendered branches.
- **evidence**: 'se qualifica pela regra de cobertura em um outro world' against Ch06 'a coverage dessas bands não tem validação independente'.

### 11. [minor/pt] Isolated glossary terms translated: 'taxa de câmbio', 'estresse', 'perna', 'cotação'
- **location**: Ch01 'uma taxa de câmbio entre duas economias' (1193); Ch08 'trata-se de uma ilustração de estresse' (1531); Ch08 'depende do lado em que cada perna é executada' (1502); Ch09 'A cotação esparsa, porém, não explica a ordenação' (1563); Ch11 'só em parte por causa da cotação esparsa' (1691)
- **problem**: 'rate', 'stress' (kept in 'stress band' and 'Local stress'), 'leg' (kept in Ch04 'uma leg com menos de 8 semanas') and 'quote' are English elsewhere in the PT text. These one-off translations break the consistency requirement.
- **fix**: 'O price de TC em gold é, portanto, uma exchange rate entre duas economias'; 'trata-se de uma ilustração de stress'; 'depende do lado em que cada leg é executada'; 'Quotes esparsas, porém, não explicam a ordenação'; 'só em parte por causa de quotes esparsas'.
- **evidence**: Ch04 'e uma leg com menos de 8 semanas é tratada como um contramovimento' against Ch08 'cada perna é executada'.

### 12. [minor/pt] 'nem o caminho nem o prazo' translates 'path' and 'timing'; 'retorno' collides with 'return'
- **location**: Ch09, 'Relative value entre worlds', third paragraph (report.js 1968)
- **problem**: The EN reads 'neither the path nor its timing'. 'path' is a glossary term, and 'timing' is kept in English everywhere else ('O timing é o traço mais regular'). In the same sentence, 'um retorno à relação histórica' uses 'retorno', which in this report reads as the translated glossary term 'return'.
- **fix**: 'Como os prices locais não acompanharam proporcionalmente a alta de Antica, uma volta à relação histórica poderia vir tanto de uma alta local mais forte quanto de uma queda do benchmark, embora a série curta não identifique nem o path nem seu timing.'
- **evidence**: 'um retorno à relação histórica poderia vir ... embora a série curta não identifique nem o caminho nem o prazo'

### 13. [minor/pt] 'prospective scenarios' and 'out-of-sample validation' left in English though PT translates both words elsewhere
- **location**: Subtitle 'para prospective scenarios e strategies executáveis' (1169); Ch01 'por meio de out-of-sample validation e, ... construímos prospective scenarios' (1197); headings '06 Out-of-sample validation' and '07 Prospective scenarios' (493 to 494); Ch11 'Os prospective scenarios devem' (1689); Ch12 'os prospective scenarios descrevem' (1703)
- **problem**: Only 'scenario' and 'out of sample' are glossary terms. 'prospective' and 'validation' are generic words that the PT translates elsewhere ('usado prospectivamente', 'em termos prospectivos', 'A validação precisa estabelecer', 'Só depois da validação'). Two chapter headings of the PT edition end up fully in English.
- **fix**: Headings '06 Validação out of sample' and '07 Scenarios prospectivos'; Ch01 'avaliamos a capacidade preditiva de modelos concorrentes por meio de validação out of sample e, condicionados a essa evidência, construímos scenarios prospectivos e examinamos suas implicações sob fricções reais de execution'; subtitle 'para scenarios prospectivos e strategies executáveis'; Ch11 'Os scenarios prospectivos devem'; Ch12 'os scenarios prospectivos descrevem'.
- **evidence**: Ch01 'antes que qualquer um deles seja usado prospectivamente' and Ch06 'A validação precisa estabelecer' against '## 07 Prospective scenarios'.

### 14. [minor/pt] 'analogia de idade' / 'por idade' alternate with 'analogia de server age'
- **location**: Ch09 'a comparação principal por idade' and 'sete para o donor por idade' (1581); 'a analogia de idade ainda não tem backtest elegível' (1596); 'o corte pre-transfer na analogia de idade' (1601)
- **problem**: 'server age' is a glossary term, and the same paragraphs say 'a analogia de server age alinha o histórico'. Shortening it to the translated 'idade' in the same argument is inconsistent.
- **fix**: 'a comparação principal por server age'; 'sete para o donor por server age'; 'a analogia de server age ainda não tem backtest elegível'; 'o corte pre-transfer na analogia de server age'.
- **evidence**: 'Para Floribra, a analogia de server age alinha' against 'Eles têm dois limites: a analogia de idade ainda não tem backtest elegível'.

### 15. [minor/pt] 'subcoverage' is neither English nor Portuguese
- **location**: Ch06, 'Interval coverage e calibration probabilística' (report.js 1450)
- **problem**: The EN reads 'undercoverage'. The PT coins a hybrid with a Portuguese prefix on an English noun.
- **fix**: 'de modo que não há sinal de undercoverage' (or 'de coverage insuficiente'); same change in the 'há algum sinal' branch.
- **evidence**: 'e o de 50%, entre 62% e 87%, de modo que não há sinal de subcoverage'

### 16. [minor/pt] 'cada valor defasado' translates the glossary term 'lag'
- **location**: Ch05, Seasonal model paragraph (report.js 1409)
- **problem**: The EN reads 'each lagged value'. 'lag' stays in English in Ch04 ('no lag k', 'outros lags'), but its Portuguese equivalent is used here.
- **fix**: 'em que cada valor no lag de 52 semanas é a observação mais próxima, em até dez dias, dentro da training sample.'
- **evidence**: 'em que cada valor defasado é a observação mais próxima, em até dez dias'

### 17. [minor/pt] Sentence starts without an article: 'Seções 04 a 08 se apoiam'
- **location**: Ch09, first sentence (chapterSpan at report.js 509, called at 1545)
- **problem**: Formal Portuguese needs the definite article before a plural subject of this kind. The capitalised PT form of chapterSpan returns 'Seções' with no article.
- **fix**: 'As seções 04 a 08 se apoiam em um único benchmark.' In code: `${cap ? t('Sections', 'As seções') : t('sections', 'seções')}`.
- **evidence**: 'Seções 04 a 08 se apoiam em um único benchmark.'

### 18. [minor/pt] Stray space before a comma: 'pôde ser testada , mas'
- **location**: Ch09, 'Essas diferenças importam...' (report.js 1559)
- **problem**: The template leaves a space after 'testada' before a branch that starts with a comma.
- **fix**: Change to `worlds em que pôde ser testada${transferLosses.length ? `, mas perde para ele ...` : ' em todos os casos'}` so the text renders 'em que pôde ser testada, mas perde para ele'.
- **evidence**: 'supera o modelo Constant em 17 dos 27 worlds em que pôde ser testada , mas perde para ele nos outros 10'

### 19. [minor/pt] Sentences built on the English 'Whether ...' pattern
- **location**: Ch03 last paragraph (report.js 1342); Ch05 ARIMA paragraph (1420); Ch09 first paragraph (1545)
- **problem**: A clause opening with 'Se' used as a subject reads as a conditional ('If ...') until the verb arrives. Ch03 also leaves 'depois de removido' without a subject. Ch09 adds the awkward 'de quão de perto'.
- **fix**: Ch03: 'A seção 04 examina se esse padrão se repete com amplitude estável e se os movimentos semanais conservam alguma memória depois que ele é removido.' Ch05: '..., e cabe à validação dizer se ele merece esse papel.' Ch09: 'Saber se suas conclusões se estendem aos outros 27 worlds depende da estabilidade do relative value de cada world, da proximidade com que seu price acompanha Antica, de sua volatility e de uma merger ou um level shift ter ou não rompido seu histórico.'
- **evidence**: 'Se esse padrão se repete com amplitude estável, e se os movimentos semanais conservam alguma memória depois de removido, são as questões de que trata a seção 04.'; 'Se suas conclusões se estendem aos outros 27 worlds depende de quão estável é'

### 20. [minor/pt] Agreement: 'aos 20% maiores altas'
- **location**: Ch04, forward returns paragraph, twice (report.js 1389)
- **problem**: The masculine article agrees with the percentage, but the adjective and noun that follow directly are feminine ('maiores altas'). The resulting construction is ungrammatical.
- **fix**: 'Nas 37 semanas que se seguiram aos 20% mais fortes das altas de quatro semanas, a median da variação nas quatro semanas seguintes foi +3,1%' and 'acima do threshold de +4,2% que delimita os 20% mais fortes das altas de quatro semanas'.
- **evidence**: 'Nas 37 semanas que se seguiram aos 20% maiores altas de quatro semanas'; 'que define os 20% maiores altas de quatro semanas'

### 21. [minor/pt] Gender of 'reversal' and of the world name 'Antica' is inconsistent
- **location**: Ch04 exhibit subtitle 'Weekly medians; reversal mínimo de 5%' (report.js 1364); Ch09 exhibit subtitle 'Antica medida nas mesmas semanas' (2070)
- **problem**: The prose treats reversal as feminine ('a próxima reversal', following 'reversão'), but this subtitle makes it masculine. Worlds are masculine throughout ('Antica excluído', 'Dracobra, Floribra e Luzibra são excluídos'), but this subtitle makes Antica feminine.
- **fix**: 'Weekly medians; reversal mínima de 5%' and 'Um ponto por semana; Antica medido nas mesmas semanas; mínimo de 10 pares'.
- **evidence**: Ch07 'uma data determinística para a próxima reversal' against 'reversal mínimo de 5%'; Ch08 'Antica excluído' against 'Antica medida nas mesmas semanas'.

### 22. [minor/pt] A sample is said to be trained
- **location**: Ch06, Brier score paragraph (report.js 1453)
- **problem**: Models are trained, not samples. The sentence also contradicts 'modelo treinado desde 2023' as used elsewhere.
- **fix**: 'Como apenas o modelo treinado desde 2023 dispõe desse backtest, as probabilities podem ordenar scenarios, mas não podem ser lidas como frequências de sucesso demonstradas.'
- **evidence**: 'Como apenas a sample treinada desde 2023 dispõe desse backtest'

### 23. [minor/pt] Elliptical calque: 'como os forecasts do ensemble foram na seção 06'
- **location**: Ch07, first paragraph (report.js 1472)
- **problem**: English 'as X were in section 06' elides the participle; Portuguese cannot, so the clause reads 'as the forecasts were in section 06'.
- **fix**: 'que pode ser avaliada contra observações posteriores, como ocorreu com os forecasts do ensemble na seção 06;'
- **evidence**: 'que pode ser avaliada contra observações posteriores, como os forecasts do ensemble foram na seção 06'

### 24. [minor/pt] 'Nenhuma delas' has no clear antecedent and the wrong gender
- **location**: Ch10, first paragraph (report.js 1628)
- **problem**: The preceding list mixes feminine and masculine nouns ('especificações', 'medida', 'efeitos'), which would require 'Nenhum deles'. The intended subject is the checks, not the list items.
- **fix**: 'Nenhuma dessas verificações introduz ajustes nos scenarios, porque detectar uma diferença não equivale a ganhar capacidade preditiva ou vantagem de execution.'
- **evidence**: 'Esta seção os testa contra especificações alternativas, uma medida alternativa de price e efeitos de calendário. Nenhuma delas introduz ajustes nos scenarios'

### 25. [minor/pt] Missing predicate pronoun: 'e em grande parte é'
- **location**: Ch10, 'Especificações alternativas e reprodutibilidade' (report.js 1633)
- **problem**: Formal Portuguese needs the pronoun 'o' to resume a predicative ('it largely is'). Without it the clause is colloquial and elliptical.
- **fix**: 'testa se a persistence é um artefato da agregação, e, em grande parte, o é: a autocorrelation de primeira ordem de 0,34 ...'
- **evidence**: 'testa se a persistence é um artefato da agregação, e em grande parte é:'

### 26. [minor/pt] 'todos' used for two results
- **location**: Ch10, event study paragraph (report.js 1664)
- **problem**: Two items call for 'ambos'; 'todos' implies more than two.
- **fix**: 'Embora dois resultados tenham q abaixo de 0,05, ambos no Halloween Event, ...'. In code: `${strongest.length === 2 ? 'ambos ' : strongest.length > 1 ? 'todos ' : ''}no ${strongest[0].event}`.
- **evidence**: 'Embora dois resultados tenham q abaixo de 0,05, todos no Halloween Event'

### 27. [minor/pt] Garden path: 'sua seed fixa apenas os parameter draws'
- **location**: Ch10, reference specification paragraph (report.js 1635)
- **problem**: 'fixa' first reads as an adjective ('its fixed seed'), and a few words later 'seeds fixas' uses it as an adjective in the same paragraph. The verb reading comes late.
- **fix**: 'porque sua seed controla apenas os parameter draws, enquanto os choques usam um gerador sem seed'
- **evidence**: 'Seu forecast publicado não pode ser reproduzido byte a byte, porque sua seed fixa apenas os parameter draws'

### 28. [minor/pt] Ch11 repeats 'resultado' with two different meanings
- **location**: Ch11, predictability paragraph (report.js 1689)
- **problem**: 'um intervalo de resultados cuja amplitude ... é o resultado' uses 'resultados' (outcomes) and 'o resultado' (the finding) in one clause. The sentence reads as circular.
- **fix**: 'um path base para os próximos meses e, para meados de 2027, um intervalo de resultados cuja amplitude, mais do que seu centro, constitui o achado principal.'
- **evidence**: 'um intervalo de resultados cuja amplitude, mais do que seu centro, é o resultado.'

### 29. [minor/pt] 'esse gain' gives the financial glossary term to an accuracy improvement
- **location**: Ch09, Terribra predecessor paragraph (report.js 1879, both branches)
- **problem**: In this report 'gain' is the financial glossary term (a gain in TC). Here it names a reduction in MAPE, which is generic vocabulary the glossary says to translate. Using it invites confusion with the Ch08 gains.
- **fix**: 'e a escassez de origins impede generalizar mesmo essa melhora.' (other branch: 'embora a escassez de origins impeça generalizar essa melhora').
- **evidence**: 'os predecessors acrescentam, portanto, informação ao histórico curto de Terribra ... e a escassez de origins impede generalizar mesmo esse gain.'

### 30. [minor/pt] Convoluted sentence with 'em um outro world'
- **location**: Ch03, after the World Inflation exhibit (report.js 1327)
- **problem**: 'um outro' is a calque, and 'a comparação ... se qualifica pela regra ... em um outro world' hides the plain fact that only one more world meets the rule.
- **fix**: 'No conjunto do Market, apenas mais um world, Secura (+9,2%), atende à regra de coverage na comparação de Sell Offers de agosto de 2026, enquanto os dez worlds que permitem apenas uma comparação com sample limitada vão de +5,8% em Descubra a +15,4% em Inabra; os +13,3% de Antica ficam, portanto, no meio da faixa do Market.'
- **evidence**: 'a comparação de Sell Offers para agosto de 2026 se qualifica pela regra de cobertura em um outro world, Secura (+9,2%)'

### 31. [minor/pt] Ambiguous coordination after 'para que ... seja testada'
- **location**: Ch02, 'Mergers, predecessor worlds e worlds recentes', second paragraph (report.js 1235)
- **problem**: 'e Luzibra oferece' first attaches to the 'para que' purpose clause. Only the shift to the indicative shows that it continues the 'porque' clause, so the reader must re-parse.
- **fix**: '..., seja testada de forma confiável, e porque Luzibra oferece a trajetória anterior mais próxima, na mesma região e no mesmo tipo de PvP;'
- **evidence**: 'porque o histórico de Floribra é curto demais para que a transferência do benchmark, ..., seja testada de forma confiável e Luzibra oferece a trajetória anterior mais próxima'

### 32. [minor/pt] Calques: 'descreve como cobrindo', 'diferem materialmente', 'diferem menos de', 'tem anchor na'
- **location**: Ch02 'que o provedor descreve como cobrindo as 24 horas anteriores' (1228); Ch03 'os price levels diferem materialmente entre worlds' (1293); Ch10 'as duas medidas diferem menos de um por cento' (1646); Ch09 all profiles 'O scenario tem anchor na captura de 27/09/2026' (2011)
- **problem**: Each is a literal rendering of English ('describes as covering', 'differ materially', 'differ by less than', 'is anchored at'). Portuguese uses a different construction or preposition ('diferir em'), and 'materialmente' does not mean 'substantially'.
- **fix**: 'que, segundo o provedor, cobrem as 24 horas anteriores'; 'os price levels diferem substancialmente entre worlds'; 'as duas medidas diferem em menos de um por cento'; 'O scenario usa como anchor a captura de 27/09/2026, o cutoff da pesquisa, e se apoia em ...'.
- **evidence**: 'day_average_sell e day_average_buy, que o provedor descreve como cobrindo as 24 horas anteriores'; 'O scenario tem anchor na captura de 27/09/2026'

## review:facts (18 findings)

### 1. [critical/both] Predecessor test cannot isolate predecessor information, and the conclusion drawn from it is contradicted by the data
- **location**: Ch. 09, 'Predecessor and Server-Age Information for Young Worlds': "the comparison with the Local rule, which uses Terribra's median alone, measures the incremental value of the predecessor information"; paragraph after the same-age chart: "the predecessors therefore add information to Terribra's own short history without adding any to the benchmark control"; exhibit note: "The comparison with Local isolates the contribution of the predecessors" (report.js 1580, 1867, 1878; lifecycle.py 143)
- **problem**: The Predecessor rule is Bench × exp(½ × local + ½ × pred), while Local is Bench × exp(local). The Predecessor rule therefore differs from Local in two ways at once: it halves Terribra's own premium term and it adds the predecessor term. Because the benchmark control, which has no local term, is the best of the three, any rule that shrinks the local term toward zero will beat Local even if the predecessor term adds nothing. The comparison with Local therefore does not measure the predecessors' contribution. The data also contradict the conclusion. A rule that halves the local term without any predecessor input does better than the Predecessor rule. On Buy Offers, which the prose leaves out, the Predecessor rule is worse than Local at both horizons. When the exhibit is switched to Buy Offers, the code instead outputs "the predecessors therefore add some information beyond the benchmark control", resting on a 0.016 pp difference.
- **fix**: Code: in lifecycle.py, add a control 'HalfLocal': anchor*np.exp(base+.5*local_median) to the test and to the scenarios, and in report.js test Precursor against HalfLocal rather than Local. Until then, replace the prose. EN, ch. 09 method: "...and only a comparison with a rule that halves Terribra's own term without predecessor input would measure the incremental value of the predecessor information." EN, findings: "In Sell Offers, the Predecessor rule reduces MAPE relative to Local in 2 of 2 evaluable horizons but improves on the benchmark control in none, and at 13 weeks the Constant model beats every rule; because the rule also halves the weight of Terribra's own premium, that gain reflects shrinkage toward the benchmark control rather than predecessor information: halving the local term without any predecessor input scores 2.25% at 8 weeks against 2.27%, and in Buy Offers the Predecessor rule is worse than Local at both horizons. The test therefore finds no incremental value in the predecessors." PT: "Em Sell Offers, a regra Predecessor reduz o MAPE em relação a Local em 2 de 2 horizons avaliáveis, mas não supera o controle do benchmark em nenhum, e, em 13 semanas, o modelo Constant supera todas as regras; como a regra também reduz à metade o peso do premium do próprio Terribra, esse gain reflete a aproximação ao controle do benchmark, e não informação dos predecessors: reduzir à metade o termo local sem informação dos predecessors resulta em MAPE de 2,25% em 8 semanas, ante 2,27%, e, em Buy Offers, a regra Predecessor é pior que Local nos dois horizons. O teste, portanto, não encontra valor incremental nos predecessors." Exhibit note, EN: "The comparison with Local combines the predecessor term with a halving of Terribra's own term, so it does not isolate the predecessors' contribution."
- **evidence**: All figures are from lifecycle.json terribra.backtest and backtestDetail. Sell Offers, 8 weeks (5 origins): Benchmark 2.257, Local 2.288, Precursor 2.273, Bench+½Local 2.252 (the geometric mean of the Benchmark and Local predictions, computed from backtestDetail). Sell Offers, 13 weeks (1 origin): Benchmark 10.73, Local 11.42, Precursor 10.78, Bench+½Local 11.08. Buy Offers, 8 weeks: Local 2.790, Precursor 2.993, Benchmark 3.009. Buy Offers, 13 weeks: Local 10.29, Precursor 11.30.

### 2. [critical/both] Weekly correlations with Antica use weekly medians, not one point per week as the text states
- **location**: Ch. 09, 'Relative Value across Worlds': "Correlations and co-movement use one point per week, so that the smoothing of weekly medians does not induce artificial dependence"; Ch. 02: "Volatility, autocorrelation, forward returns and co-movement across worlds use instead the last valid quote of each week"; Ch. 09: "The weekly correlation with Antica ranges from -0.05 to 0.68" (complement.py line 404)
- **problem**: The per-world 'Weekly Correlation' column, and the range quoted in the prose, are computed on changes in weekly medians: complement.py line 404 uses rw = np.log(weekly[w][side]).diff() and ra = np.log(aw[side]).diff(). Only the lead-lag aggregate uses point[]. On the one-point-per-week basis that the text claims, the numbers are materially different, and the report's own argument is that the median basis inflates dependence.
- **fix**: Code (preferred): in complement.py line 404, use rw = np.log(point[w][side]).diff(); ra = np.log(point[A][side]).diff() for corrWeekly, then regenerate. The prose then reads "...ranges from 0.06 to 0.53 across worlds". Otherwise, correct the prose. EN: "The weekly correlation of each world with Antica is computed on changes in weekly medians, which the smoothing of the median can inflate, whereas the lead-lag analysis uses one point per week." PT: "A correlation semanal de cada world com Antica é calculada sobre variações das weekly medians, que a suavização da median pode inflar, enquanto a análise de lag usa um ponto por semana." In Ch. 02, change "and co-movement across worlds" to "and the lead-lag co-movement across worlds".
- **evidence**: Recomputed with research_data.weekly_series on the Sell Offers side, excluding Dracobra, Floribra and Luzibra. Weekly medians (as published) range from -0.05 to 0.68 with a median of 0.42. One point per week ranges from 0.06 to 0.53 with a median of 0.36. Selected worlds, medians versus points: Descubra 0.42 vs 0.06, Serdebra 0.55 vs 0.24, Inabra 0.68 vs 0.49, Ferobra 0.28 vs 0.53.

### 3. [major/both] 'Less informative than a simple seasonal rule' generalises from the 13-week horizon only
- **location**: Ch. 06 closing paragraph: "its directional probabilities are less informative than a simple seasonal rule"; Ch. 11: "the directional probabilities of the stochastic model are less informative than a simple seasonal rule" (report.js 1082, seasonalBeatsModel uses only c13)
- **problem**: The model's Brier score is worse than the Prior Year rule only at 13 weeks, and on the Buy Offers side at 26 weeks. At 4, 26 (Sell Offers) and 52 weeks the model scores better than that rule. The calibration exhibit prints these values, so the unqualified statement contradicts the report's own exhibit.
- **fix**: EN, ch. 06: "...but at 13 weeks its directional probabilities are less informative than a simple seasonal rule, although they beat that rule at 4 and 52 weeks and, in Sell Offers, at 26 weeks, and they are more sensitive to the estimation window than to simulation noise." EN, ch. 11: "...and at 13 weeks the directional probabilities of the stochastic model are less informative than a simple seasonal rule." PT, ch. 06: "...mas, em 13 semanas, suas probabilities direcionais são menos informativas que uma regra sazonal simples, embora a superem em 4 e 52 semanas e, em Sell Offers, em 26 semanas...". Code: base seasonalBeatsModel on all horizons, or keep the '13 weeks' qualifier in the text.
- **evidence**: complement.json probabilistic.calibration, model Brier vs Prior Year Brier. Sell Offers: 4 weeks 0.209 vs 0.214; 13 weeks 0.207 vs 0.054; 26 weeks 0.164 vs 0.194; 52 weeks 0.185 vs 0.278. Buy Offers: 4 weeks 0.193 vs 0.214; 13 weeks 0.214 vs 0.108; 26 weeks 0.169 vs 0.161; 52 weeks 0.144 vs 0.167. The model is worse in 3 of 8 combinations.

### 4. [major/both] 'Predictability is real but short-lived' is not supported by the backtest
- **location**: Ch. 11, third paragraph: "Predictability is real but short-lived." (report.js 1688, fixed text)
- **problem**: The ensemble's advantage over Constant does not decay with the horizon. Its MAPE relative to Constant is as low at 26 to 52 weeks as at 13 weeks. What shrinks with the horizon is the number of origins, not the predictability. 'Short-lived' therefore states as a finding something the data do not show.
- **fix**: EN: "Predictability is real, but the evidence for it thins with the horizon." PT: "A previsibilidade é real, mas a evidência que a sustenta rareia com o horizon."
- **evidence**: results.json backtest, ensemble MAPE / Constant MAPE (Sell Offers; Buy Offers). 4 weeks: 0.73; 0.60. 13 weeks: 0.49; 0.47. 26 weeks: 0.43; 0.58. 39 weeks: 0.45; 0.54. 52 weeks: 0.66; 0.55 (4.72 vs 7.14; 4.42 vs 8.05).

### 5. [major/both] The ±0.14 band is a white-noise band, not the range of a random walk with quote noise
- **location**: Ch. 04, 'Volatility, Autocorrelation and Forward Returns': "none of the first four lags in Sell Offers exceeds the noise band of ±0.14, the range expected from a random walk observed with quote noise" (report.js 1386)
- **problem**: mo.band is 1.96/√n (n = 189), the i.i.d. white-noise band. The simulated range for a random walk observed with quote noise is a different band, reported in the adjacent exhibit's 'Noise Only' column. At lag 1 that range is -0.21 to 0.02, not ±0.14. At lag 2, the de-seasonalised value of 0.1197 lies just above that simulation's 95th percentile of 0.1189. The sentence mislabels the reference distribution.
- **fix**: EN: "...none of the first four lags in Sell Offers exceeds the white-noise band of ±0.14 (1.96/√n), and all lie within or at the edge of the 5 to 95% range simulated for a random walk observed with quote noise." PT: "...nenhum dos quatro primeiros lags em Sell Offers excede a noise band de ±0,14 (1,96/√n), e todos ficam dentro ou no limite do intervalo de 5 a 95% simulado para um random walk observado com ruído de quote."
- **evidence**: complement.json momentum.ask.band = 0.1426 (= 1.96/√189). null.point, lag 1: p05 -0.214, p95 0.019. Lag 2: p95 0.1189, against rDeseasonalised 0.1197. Buy Offers lag 1 de-seasonalised is -0.214: outside ±0.14 but inside the simulated range (-0.248 to -0.020).

### 6. [major/both] 'Sparse quoting does not explain the ranking' is contradicted by the volatility table
- **location**: Ch. 09, 'Relative Volatility and Sampling': "Sparse quoting does not explain the ranking, however: Quelibra, with 5 quoted days a week, has the highest ratio (2.2×)..." (report.js 1562)
- **problem**: A single outlier (Quelibra) is used to dismiss a strong association. Worlds quoted less often are systematically more volatile relative to Antica: all seven once-a-week worlds rank in the top twelve. Sparse quoting explains much of the ranking, though not all of it.
- **fix**: EN: "Sparse quoting does not explain the whole ranking: the seven worlds quoted about once a week all lie between 1.44× and 1.97×, above the median of 1.27× among those quoted twice a week, but Quelibra, with 5 quoted days a week, has the highest ratio (2.2×), while Secura, quoted almost daily, records 0.9×." PT: "A cotação esparsa não explica toda a ordenação: os sete worlds cotados cerca de uma vez por semana ficam todos entre 1,44× e 1,97×, acima da median de 1,27× dos cotados duas vezes por semana, mas Quelibra, com 5 dias cotados por semana, tem a maior razão (2,2×), enquanto Secura, cotado quase diariamente, registra 0,9×."
- **evidence**: complement.json volatility.worlds, Sell Offers, 24 worlds without a level shift. Spearman correlation between medianDaysPerWeek and ratio: -0.49 (p = 0.014). Once-a-week worlds (7): ratios 1.44 to 1.97, median 1.67. Twice-a-week worlds (13): 0.89 to 1.88, median 1.27.

### 7. [major/both] The 2023-sample model is called 'validated' although validation found its directional calibration weak
- **location**: Ch. 08, closing paragraph: "has roughly even odds under the model trained since 2023, the only one validated" (report.js 1536); PT: "o único validado"
- **problem**: The 2023-sample model is the only one with a probabilistic backtest, but that backtest found its directional probabilities worse than a seasonal rule at 13 weeks and biased upward. Calling it 'validated' overclaims and contradicts Ch. 06, where its probabilities 'cannot be read as demonstrated frequencies of success'.
- **fix**: EN: "under the model trained since 2023, the only one backtested, whose directional calibration section 06 found weak,". PT: "sob o modelo treinado desde 2023, o único submetido a backtest, cuja calibration direcional a seção 06 considerou fraca,".
- **evidence**: complement.json calibration, Sell Offers, 13 weeks: Brier 0.207 vs Prior Year 0.054. Mean P(rise) 0.549 against an observed rise frequency of 0.378.

### 8. [major/both] Note 3 cites a title that does not exist
- **location**: Notes, note 3: "Tibinance, “Tibia Coins: Methodology, Source Data and Reproduction Guide,” GitHub repository" (report.js SOURCES.package, line ~940)
- **problem**: The document at the cited URL is the reports/tc-cycle README. Its heading is "Tibia Coins: Price Dynamics, Predictability and Execution" (at HEAD: "Tibia Coins | Price dynamics, predictability and execution"), and it is written in Portuguese. No document carries the quoted title. By the report's own convention (Chicago 14.87, as applied to the untitled news tickers), an untitled or descriptively named item is given without quotation marks.
- **fix**: Full note: "Tibinance, README and reproduction package for this report, reports/tc-cycle, GitHub repository, accessed September 27, 2026, https://github.com/nesleykent/Tibinance/tree/main/reports/tc-cycle." Short form: "Tibinance, reproduction package".
- **evidence**: `grep -n '^#' README.md` returns line 1 "# Tibia Coins: Price Dynamics, Predictability and Execution". Its sections are 'Construção dos dados', 'Arquivos e reprodução' and so on; no heading reads 'Methodology, Source Data and Reproduction Guide'.

### 9. [minor/both] Stochastic drift is printed as log points but labelled as a percentage a year
- **location**: Ch. 06: "from +10.9% to +8.4% a year"; Ch. 11: "a drift of +8.4% to +10.9% a year in the weekly stochastic model" (report.js 1458, 1684: sgn(fit.driftPerYear * 100))
- **problem**: driftPerYear is the SARIMAX coefficient on t in years, which is a log rate. In the same Ch. 11 sentence the monthly trend is correctly shown as 100(e^β − 1). The drift is therefore understated as a percentage, and the two ranges are placed side by side in different units.
- **fix**: Code: sgn(Math.expm1(fitAsk.driftPerYear) * 100), and likewise for fit24. The text becomes "from +11.5% to +8.7% a year" in Ch. 06 and "+8.7% to +11.5% a year" in Ch. 11. Alternatively keep the values and write "10.9 and 8.4 log points a year".
- **evidence**: complement.json probabilistic.fit, Sell Offers: driftPerYear 0.1086 (2023 sample) and 0.0835 (2024 sample). 100(e^0.1086 − 1) = 11.47% and 100(e^0.0835 − 1) = 8.71%. A refit with statsmodels 0.15 reproduces 0.1086 and 0.0835.

### 10. [minor/both] Antica's 12-month inflation is described as 'in the middle' of the range though it exceeds 8 of 11 worlds
- **location**: Ch. 03: "Antica's +13.3% therefore lies in the middle of the Market's range"; PT: "ficam, portanto, no meio da faixa do Market" (report.js 1324)
- **problem**: Antica ranks 4th of 12. It is 3.7 pp above the median of the other worlds and 2.7 pp above the midpoint of the range. 'In the middle' misdescribes an upper-range position. The code's 0.75 cutoff narrowly misses (8/11 = 0.727).
- **fix**: EN: "Antica's +13.3% therefore lies in the upper half of the Market's range, above eight of the eleven other worlds." PT: "os +13,3% de Antica ficam, portanto, na metade superior da faixa do Market, acima de oito dos onze outros worlds." Code: use the fraction below at or above 0.6 for 'upper part', or state the count.
- **evidence**: Other worlds' August 2026 12-month rates: 5.8, 6.3, 7.9, 9.2, 9.3, 9.6, 10.5, 12.8, 15.1, 15.1, 15.4. Median 9.6; range midpoint 10.6; Antica 13.3, above 8 of 11.

### 11. [minor/both] 'Persistence is largely a product of aggregation' holds only at lag 1
- **location**: Ch. 10: "tests whether persistence is an artefact of aggregation, and it largely is" and the closing summary "the apparent persistence of weekly movements is largely a product of aggregation" (report.js 1632, 1676)
- **problem**: With one point per week, lags 2 to 4 remain above the ±0.14 band. They fall inside it only once the annual cycle is removed. Ch. 04 correctly attributes persistence to the median and the annual cycle; Ch. 10 drops the second cause.
- **fix**: EN, summary: "the apparent persistence of weekly movements is largely a product of aggregation and of the annual cycle". EN, first paragraph: "...and at the first lag it largely is: the first-order autocorrelation of 0.34 in weekly medians becomes 0.02 with one point per week, whereas at lags 2 to 4 the one-point values of 0.22, 0.17 and 0.17 fall to 0.12, 0.07 and 0.09 only once the annual cycle is removed." PT: "...é em grande parte produto da agregação e do cycle anual".
- **evidence**: complement.json momentum.ask.acf. Weekly medians: 0.34, 0.32, 0.23, 0.16. One point per week: 0.02, 0.22, 0.17, 0.17. De-seasonalised: -0.11, 0.12, 0.07, 0.09. Band: 0.143.

### 12. [minor/both] The anchor sensitivity uses a fixed threshold, not '3% above the start'
- **location**: Ch. 06, 'Estimation Window, Seed and Anchor Sensitivity': "replacing the starting capture moves the probability of a peak at least 3% above the start by up to 28 pp"
- **problem**: pPeakAbove3OfReference measures the probability of exceeding 45,578, which is 3% above the 27 September capture, whatever the alternative start. For the 21 September start (42,799), that threshold is 6.5% above the start. The sentence misstates the event being measured, and the next sentence and the exhibit use the correct fixed threshold.
- **fix**: EN: "and replacing the starting capture moves the probability of a peak above 45,578 gp/TC, 3% above the capture of 27 September, by up to 28 pp." PT: "e substituir a captura inicial move a probability de um peak acima de 45.578 gp/TC, 3% acima da captura de 27/09, em até 28 pp."
- **evidence**: complement.py anchorSensitivity: pPeakAbove3OfReference = mean(max > log(ref*1.03)) with ref = 44,250. 45,578/42,799 − 1 = 6.5%.

### 13. [minor/both] The correlation range silently excludes the level-shift worlds shown in the exhibit
- **location**: Ch. 09: "The weekly correlation with Antica ranges from -0.05 to 0.68 across worlds" (report.js 1144 filters out breaks)
- **problem**: The adjacent exhibit lists Floribra at -0.10, which is below the stated minimum. The range excludes Dracobra, Floribra and Luzibra without saying so.
- **fix**: EN: "ranges from -0.05 to 0.68 across the worlds without a level shift". PT: "varia de -0,05 a 0,68 entre os worlds sem level shift". Update the figures if the correlation basis is corrected to one point per week.
- **evidence**: complement.json crossWorld.worlds, Sell Offers, corrWeekly: Floribra -0.10, Terribra -0.05, Inabra 0.68.

### 14. [minor/both] Discussion reports only the favourable reading of the model-implied round-trip odds
- **location**: Ch. 11, fifth paragraph: "and the model-implied odds of ending with more TC are close to even"
- **problem**: The figure holds only for the 2023 sample (51%). Ch. 08 also reports 74% under the 2024 sample. The Discussion drops that alternative without qualification, although Ch. 06 shows that the estimation window moves probabilities by up to 23 pp.
- **fix**: EN: "and the model-implied odds of ending with more TC are close to even under the model trained since 2023 and favourable (74%) under the 2024 sample, which has no backtest." PT: "e as chances implícitas no modelo de terminar com mais TC são aproximadamente iguais sob o modelo treinado desde 2023 e favoráveis (74%) sob a sample de 2024, que não tem backtest."
- **evidence**: complement.json probabilistic.roundtrip, taker execution: pGain 0.508 for the main (2023) sample and 0.744 for the since-2024 sample.

### 15. [minor/both] The 2024 premium history does not support a 'return to the historical relationship'
- **location**: Ch. 09: "a return to the historical relationship could come either from a stronger local rise or from a decline in the benchmark" (report.js 1965)
- **problem**: The sentence assumes the Optional PvP (YBE) premium will revert. The series instead shows a two-year decline, so mean reversion is an interpretation, not something the data show.
- **fix**: EN: "Because local prices have not followed Antica's rise in proportion, restoring the earlier relationship would require either a stronger local rise or a decline in the benchmark, but the group's premium has trended down, from quarterly medians of up to +26% in 2024 to +9.6% in the third quarter of 2026, so the series gives no evidence that such a return will occur." PT accordingly.
- **evidence**: complement.json groupsByQuarter, Optional PvP; BattlEye Yellow, Sell Offers: Q2 2024 26.1, Q3 2024 21.8, Q2 2025 16.6, Q4 2025 11.6, Q3 2026 9.6.

### 16. [minor/both] The archive reconciliation covers 28 worlds, not every documented series
- **location**: Ch. 02: "bringing the documented series to 30. An archival copy of the public history is reconciled with the API for every world"
- **problem**: Following directly after '30 documented series', 'every world' implies that all 30 series are reconciled. The archive holds only the 28 modelled worlds; the predecessors are checked against the API alone.
- **fix**: EN: "An archival copy of the public history is reconciled with the API for each of the 28 modelled worlds, while the predecessors are checked against the API alone,". PT: "Uma cópia de arquivo do histórico público é conciliada com a API para cada um dos 28 worlds modelados, enquanto os predecessors são verificados apenas contra a API,".
- **evidence**: fetch_api.py: "The archive holds the successor worlds only; predecessors are checked against the API alone". inputs/history/ contains 28 files and none for Jacabra or Obscubra. README: "reconciliada com a API para os 28 worlds".

### 17. [minor/both] The date of Luzibra's Premium-restriction removal disagrees between text and note
- **location**: Ch. 09: "(Luzibra's Premium restriction was removed on 29 July 2025)<sup>16</sup>"; note 16: "news ticker on the removal of the Premium restriction..., Tibia, July 30, 2025"
- **problem**: The text and its own supporting note give different dates. lifecycle.py and README both give 29/07/2025, while report.js dates the ticker 2025-07-30.
- **fix**: Check the date of the tibia.com ticker (id 8475) and align both. If the ticker is dated 30 July, the text should read "was removed on 30 July 2025", unless the ticker itself states an earlier effective date. Otherwise, set tibiaNews(8475, '2025-07-29', ...).
- **evidence**: report.js line 950: tibiaNews(8475, '2025-07-30', ...). lifecycle.py sources: 'retirada da restrição premium em 29/07/2025'. README line 64: same date.

### 18. [minor/both] Note 1 quotes a title the API documentation does not carry
- **location**: Notes, note 1: "TibiaMarket, “TibiaMarket API,” Swagger documentation, version 0.1.0"
- **problem**: The API's OpenAPI document is titled "FastAPI" (version 0.1.0), so "TibiaMarket API" is a descriptive title. By the convention the report applies to the untitled tickers, it should not be set in quotation marks as though it were the item's title.
- **fix**: "TibiaMarket, API documentation (Swagger UI), version 0.1.0, accessed September 24, 2026, https://api.tibiamarket.top/docs." Short form: "TibiaMarket, API documentation".
- **evidence**: https://api.tibiamarket.top/openapi.json gives info.title "FastAPI" and info.version "0.1.0".

## review:code (14 findings)

### 1. [major/both] Capture-window date helpers print a false date range once the benchmark's captures reach a second month
- **location**: report.js lines 996 to 1000 (captureDays, captureWindow, captureBetween). The output appears in ch 09 as "as the median of the pairs of 21, 22, 23, 26 and 27 September" (line 1552/1553), in the premium chart legend "Captures of 21 to 27 Sep" (line 1973) and in every dossier as "with five captures between 21 and 27 September" (line 2010/2011)
- **problem**: The helpers print only the day number for every date except the last and attach the month of the last date to all of them. cur.captureDates holds every Antica capture up to the cutoff (complement.py line 117; antica_caps = all captures <= ASOF), and market-update.json gains captures every day. The first capture made on or after 1 October will therefore make the page print "21, 22, ..., 30, 1, 2 and 3 October", "21 to 3 Oct" and (EN) "between 21 and 3 October". In PT it will print "30, 01, 02 e 03/10" and "21 a 03/10". Each of these is a false date. The enumerated list in ch 09 also grows by one date per capture day with no limit.
- **fix**: Carry the month for each date that closes a month, and show both months when the window spans two:
const sameMonth = firstCapture.slice(0, 7) === lastCapture.slice(0, 7);
const captureDays = cur.captureDates.map((d, i, a) => i === a.length - 1 || a[i + 1].slice(0, 7) !== d.slice(0, 7) ? dayMonth(d) : t(String(isoDay(d)), d.slice(8, 10)));
const captureWindow = sameMonth ? `${t(String(isoDay(firstCapture)), firstCapture.slice(8, 10))}${RANGE}${shortDate(lastCapture)}` : `${shortDate(firstCapture)}${RANGE}${shortDate(lastCapture)}`;
const captureBetween = sameMonth ? t(`${isoDay(firstCapture)} and ${dayMonth(lastCapture)}`, `${dayMonth(firstCapture)} e ${dayMonth(lastCapture)}`) : t(`${dayMonth(firstCapture)} and ${dayMonth(lastCapture)}`, `${dayMonth(firstCapture)} e ${dayMonth(lastCapture)}`);
In ch 09, replace `the pairs of ${list(captureDays)}` with `the same-day pairs of the captures between ${captureBetween}` (PT: `os pares do mesmo dia das capturas entre ${captureBetween}`) so the sentence stays bounded.
- **evidence**: complement.py:69 `antica_caps = sorted([c for c in captures if c['world'] == A] ...)` with captures = load_captures(ASOF), i.e. every capture up to the cutoff; report.js:996 `captureDays = cur.captureDates.map((d, i, a) => i < a.length - 1 ? t(String(isoDay(d)), d.slice(8, 10)) : dayMonth(d))`; report.js:1000 EN `${isoDay(firstCapture)} and ${dayMonth(lastCapture)}`.

### 2. [minor/both] Singular world is described as plural "latest readings ... precede"; list is joined without "and"
- **location**: ch 02, report.js lines 1218/1219: rendered "and the latest readings of Etebra (26 September 2026) precede that date" / "e as leituras mais recentes de Etebra (26/09/2026) são anteriores a essa data"
- **problem**: Only one world (Etebra) has an older reading, and it has exactly one latest reading, yet the template always uses the plural. When several worlds are older, the template joins them with ', ' rather than list(), so the final "and"/"e" is missing. Both editions are affected in the current output.
- **fix**: EN: `${olderReadings.length === 1 ? `, and the latest reading of ${olderReadings[0].world} (${longDate(olderReadings[0].latest.capturedAt)}) precedes that date` : `, and the latest readings of ${list(olderReadings.map(w => `${w.world} (${longDate(w.latest.capturedAt)})`))} precede that date`}`. PT: `${olderReadings.length === 1 ? `, e a leitura mais recente de ${olderReadings[0].world} (${longDate(olderReadings[0].latest.capturedAt)}) é anterior a essa data` : `, e as leituras mais recentes de ${list(...)} são anteriores a essa data`}`.
- **evidence**: report-en.md line 39: "the latest readings of Etebra (26 September 2026) precede that date"; report.js:1218 `olderReadings.map(w => ...).join(', ')`.

### 3. [minor/pt] Stray space before a comma in the PT transfer sentence
- **location**: ch 09, report.js line 1559: rendered "em 17 dos 27 worlds em que pôde ser testada , mas perde para ele nos outros 10"
- **problem**: The template writes a space after "testada" and then opens the conditional with ", mas", so the published PT text contains "testada , mas".
- **fix**: `...worlds em que pôde ser testada${transferLosses.length ? `, mas perde para ele ${...}` : ' em todos os casos'}.`
- **evidence**: report-pt-br.md line 1044: "em que pôde ser testada , mas perde para ele nos outros 10".

### 4. [minor/both] "First possible date" wording is hard-coded, although the pipeline switches to the confirmed merger date
- **location**: report.js line 1933 (projection card note "Scenario ends before the first possible date of the merger into Deslumbra"), line 1937 (chart rule label t('merger: first possible date', 'merger: primeira data possível')) and line 1595/1596 (ch 09 "beyond the first possible date of ${donor}'s merger")
- **problem**: universe.py sets MERGERS = confirmedDate or notBefore, and ch 02 and ch 09 prose (mergerBoundary, mergerFacts, line 1572) already branch on event.confirmedDate. These three strings do not branch, so once CipSoft confirms the date and mergers.json records it, the card note, the chart label and the ch 09 sentence will call a confirmed date "the first possible date".
- **fix**: Branch on the event, as line 1572 already does. Card note: t(`Scenario ends before the ${e.confirmedDate ? 'confirmed date' : 'first possible date'} of the merger into ...`, `... antes da ${e.confirmedDate ? 'data confirmada' : 'primeira data possível'} do merger ...`). Use the same condition for the vline label ('merger: confirmed date' / 'merger: data confirmada') and for the line 1595 clause, reading mergerFor(donor).confirmedDate.
- **evidence**: universe.py:16 `MERGERS = {world: event['confirmedDate'] or event['notBefore'] ...}`; report.js:1933 `note: mergerFor(w) ? t(`Scenario ends before the first possible date of the merger ...(${longDate(mergerFor(w).confirmedDate || mergerFor(w).notBefore)})`

### 5. [minor/pt] PT weekday branch produces "na sábado/na domingo" and "em demais worlds"
- **location**: ch 10, report.js line 1657: `${SIDES[x.side]} em ${x.scope === bench ? bench : 'demais worlds'}` and `(maior na ${...WEEKDAY[x.high]}, menor na ${...WEEKDAY[x.low]})`
- **problem**: This branch renders only when a weekday test survives the Holm correction. The Other Worlds / Buy Offers test currently sits at pHolm = 0.052, with its low day on 'dom' (and 'sáb' for Sell Offers). A small data change would therefore print "Buy Offers em demais worlds resiste à correção ... (maior na terça-feira, menor na domingo)". Two errors follow: the article is missing (it should read "nos demais worlds") and the preposition is wrong for masculine days (it should read "no domingo" or "no sábado").
- **fix**: Give WEEKDAY in PT its own preposition: {seg: 'na segunda-feira', ter: 'na terça-feira', qua: 'na quarta-feira', qui: 'na quinta-feira', sex: 'na sexta-feira', 'sáb': 'no sábado', dom: 'no domingo'}, drop the literal 'na', and write `${x.scope === bench ? `em ${bench}` : 'nos demais worlds'}`.
- **evidence**: complement.json weekday.tests: ['Demais mundos','bid', pHolm 0.05199, high 'ter', low 'dom'] and ['Demais mundos','ask', ..., low 'sáb'].

### 6. [minor/both] A rounded lower bound overstates the p-values, and p = 0.052 prints as 0.05 next to "no test is significant"
- **location**: ch 10, report.js line 1656/1657: rendered "with corrected p-values of at least 0.17" and "(0.30 and 0.05 after correction). No test is significant after correction."
- **problem**: The smallest Antica Holm p-value is 0.1665. fmt(…, 2) rounds it up to 0.17, so "at least 0.17" is false. Separately, pHolm 0.0520 is printed as "0.05" in the sentence that immediately says no test is significant, which reads as a threshold result.
- **fix**: Floor the bound, `fmt(Math.floor(Math.min(...) * 100) / 100, 2)`, or list both values ("of 0.17 and 0.30"). Print Holm p-values with three decimals (fmt(x.pHolm, 3)) when they fall between 0.04 and 0.06.
- **evidence**: complement.json weekday.tests Antica pHolm 0.16645838540364907 and 0.30042489377655585; report-en.md line 1607.

### 7. [minor/both] The offers vs daily-averages sentence prints N/A figures in prose when the benchmark has no paired days
- **location**: ch 10, report.js line 1645/1646: "In ${bench}, the median gap over ${fmt(tradeAntica('ask')?.n)} paired days is ${sgn(tradeAntica('ask')?.medianGapPct, 2)} ..."
- **problem**: When tradeAntica('ask'|'bid') is undefined, gapVerdict is 'unknown' and the verdict clause is correct. The numbers clause before it still renders, giving "the median gap over N/A paired days is N/A for Sell Offers and N/A for Buy Offers, so the benchmark lacks the paired days needed".
- **fix**: Emit the numbers clause only when gapVerdict !== 'unknown'. Otherwise write t(`In ${bench}, the offers and the daily averages share too few days to be compared.`, `Em ${bench}, as offers e as daily averages têm poucos dias em comum para serem comparadas.`).
- **evidence**: report.js:1112 `gapVerdict = !benchGaps.every(ok) ? 'unknown' : ...`; line 1645 prints fmt/sgn of the same possibly-undefined values unconditionally.

### 8. [minor/pt] PT chart legend mixes languages: "P10 to P90 e P25 to P75"
- **location**: ch 07 simulated distribution card, report.js line 1789: `bands: [{label: 'P10 to P90', ...}, {label: 'P25 to P75', ...}]`
- **problem**: The band labels are hard-coded in English and are not wrapped in t(). legendBelow joins them with the PT list connector, so the PT legend reads "P10 to P90 e P25 to P75". The PT prose in the same chapter writes "o intervalo de P10 a P90", and the brief's range convention is "a" in PT.
- **fix**: `{label: t('P10 to P90', 'P10 a P90'), ...}, {label: t('P25 to P75', 'P25 a P75'), ...}` (or build them with RANGE: `P10${RANGE}P90`).
- **evidence**: PT page legend text collected in the browser: "P10 to P90 e P25 to P75"; report-pt-br.md uses "P10 a P90" in prose.

### 9. [minor/pt] World projection card subtitle shows English status labels on the PT page
- **location**: ch 09 world scenarios, report.js line 1932: `const statuses = [...new Set(wp.filter(...).map(x => uiLabel(x.status)))].join('; ')`, used in the card sub
- **problem**: uiLabel maps the data statuses to English table labels, and the result is placed in a card subtitle, which the rest of the code localises with t(). The PT subtitle therefore reads "Prices em gold pieces (gp) por TC. Offer Scenario; Suspended: Announced Merger" (Luzibra) or "Conditional: Stale Quote" (Etebra). The previous edition printed the Portuguese statuses there.
- **fix**: Localise the sub: `map(x => t(uiLabel(x.status), {'Cenário de ofertas': 'scenario de offers', 'Condicional: cotação defasada': 'condicional: quote defasada', 'Suspenso: fusão anunciada': 'suspenso: merger anunciado'}[x.status] || x.status))`. Keep uiLabel for the Condição table column.
- **evidence**: PT page, Luzibra selected: card-world-projection .card-sub = "Prices em gold pieces (gp) por TC. Offer Scenario; Suspended: Announced Merger".

### 10. [minor/both] The coverage verdict tests only the lower bound, at a threshold too lax for an 80% interval
- **location**: ch 06, report.js line 1449 (`Math.min(...c80) < .7 ? 'some sign' : 'no sign'} of undercoverage`) and line 1463 (`Math.min(...c80) >= .7 ? 'achieves adequate interval coverage' : 'shows uneven interval coverage'`)
- **problem**: An 80% interval that covers 72% of outcomes would be reported as showing "no sign of undercoverage" and "adequate interval coverage", which is false. The verdict also ignores over-coverage: the current data show 100% coverage of the 80% interval at 26 and 52 weeks and up to 87% for the 50% interval, which means the intervals are too wide rather than "adequate".
- **fix**: Derive the verdict from the deviation from nominal in both directions. For example, `const under = c80.some(v => v < .75) || c50.some(v => v < .45), over = c80.some(v => v > .9) || c50.some(v => v > .6);`, then state "undercovers", "is conservative (over-covers) at longer horizons" or "is close to nominal". Mirror the result in the PT branches.
- **evidence**: complement.json calibration: ask 26w cov80 1.0, ask/bid 52w cov80 1.0, ask 26w cov50 0.87; report-en.md line 676 "achieves adequate interval coverage".

### 11. [minor/both] mergerBoundary breaks when an announced merger has no modelled participant
- **location**: ch 02, report.js lines 895 to 897 (mergerBoundary), called for every ME event at line 1232/1233
- **problem**: mergers.json is maintained by hand and already lists a participant outside the monitor (Yubra). If an announcement involves only unmonitored worlds, `modelled` is empty, so list([]) returns '' and the sentence begins ", which the announcement of ... assigns ... is modelled only within its pre-merger regime". It also cites a note for a merger the report does not model.
- **fix**: Call it only for relevant events: `${ME.filter(e => e.participants.some(w => W[w])).map(mergerBoundary).join(' ')}`. Apply the same filter to the ch 09 `ME.map(event => para(...))` block.
- **evidence**: report.js:895 `const modelled = event.participants.filter(w => W[w])` ... `${list(modelled)}, which the announcement ...`

### 12. [minor/pt] Latent PT glossary leak: the unmodelled-world reason is printed raw ("sem oferta válida até o corte")
- **location**: report.js line 838 (outsideResearch, PT branch `${unmodelled[name].toLowerCase()}`), shown in the ch 02 prose and the market caption
- **problem**: analyze.py writes the reason 'Sem oferta válida até o corte'. The EN branch maps it through uiLabel. The PT branch prints the raw data string, whose words "oferta" and "corte" break the decided glossary (offer, cutoff).
- **fix**: PT: `${({'Sem oferta válida até o corte': 'sem offer válida até o cutoff'})[unmodelled[name]] || unmodelled[name].toLowerCase()}`.
- **evidence**: analyze.py:57 `'reason':'Sem oferta válida até o corte'`; report.js:838.

### 13. [minor/both] Count-agreement slips in conditional templates for counts of one or two
- **location**: report.js lines 1326 ("the ${nw(limited.length)} worlds that allow"), 1355 PT ("${nw(ups.length)} cycles completos"), 1359 PT ("${nw(declines.length, true)} quedas não permitam"), 1442 ("only ${nw(e52.n)} origins"), 1558/1559 ("all ${nw(n)} of the" / "todos os ${nw(n)}"), 1702 ("over the ${nw(declines.length)} complete declines"), 1964 ("A sample of ${nw(yA.worlds.length)} worlds"), 2106 ("${comparable} worlds allow")
- **problem**: These templates branch on nothing, or only on the EN side, so a count of 1 renders "the one worlds", "only one origins", "um cycles completos", "uma quedas", "1 worlds allow", and a count of 2 renders "all two of" / "todos os dois". EN lines 1354 and 1358 already handle the singular, so the two editions diverge.
- **fix**: Add the singular branch the EN side already uses. For example: PT line 1355 `${ups.length === 1 ? 'um cycle completo' : `${nw(ups.length)} cycles completos`}`; line 1558 `${n === 2 ? 'both' : `all ${nw(n)}`}` / `${n === 2 ? 'ambos os' : `todos os ${nw(n)}`}`; line 2106 `${comparable} ${comparable === 1 ? 'world allows' : 'worlds allow'}`. Treat the others the same way.
- **evidence**: report.js:1354 (EN) `${ups.length === 1 ? 'cycle' : 'cycles'}` vs 1355 (PT) `${nw(ups.length)} cycles completos` with no branch.

### 14. [minor/code] hreflang alternates use relative URLs
- **location**: index.html lines 9 and 10, pt-br.html lines 9 and 10: `<link rel="alternate" hreflang="en" href="./">`, `<link rel="alternate" hreflang="pt-BR" href="pt-br.html">`
- **problem**: Search engines require hreflang alternate URLs to be fully qualified. With relative hrefs, the two editions may not be recognised as language alternates of each other, which defeats the purpose of the links.
- **fix**: Use absolute URLs in both files: `href="https://nesleykent.github.io/Tibinance/reports/tc-cycle/"` and `href="https://nesleykent.github.io/Tibinance/reports/tc-cycle/pt-br.html"`. Optionally add an x-default pointing to the English edition.
- **evidence**: index.html:9-10 and pt-br.html:9-10 in the diff.
