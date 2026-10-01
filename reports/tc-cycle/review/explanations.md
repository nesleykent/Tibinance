# Editorial changes: what changed, why, and how it holds the report together

Each item below describes one substantive change. "What" says what was done, "Why" says what problem it solves, and "Continuity" says how it helps the report read as one argument.

## 1. One spine instead of a collection of analyses

**What.** The twelve chapters now follow a single line of reasoning: question, data, the market as it stands, how prices move over time, the models that follow from that movement, how well those models predict, what they say about the future, what trading costs do to a strategy, how far the findings extend to other worlds, whether the findings survive alternative choices, what it all means, and the answer to the question. Every chapter ends by stating what it has established and what the next chapter needs from it.

**Why.** The old report placed analyses where they happened to exist. For example, the Terribra and Floribra lifecycle tests were split across modelling, validation, scenarios and robustness, and the merger boundary sat inside the scenario chapter. A reader had to jump between chapters to follow one idea.

**Continuity.** Each finding now appears at the moment the argument needs it, so the report can be read front to back without backtracking.

## 2. The introduction defines the problem before any number appears

**What.** The introduction now opens by defining the subject: the price of Tibia Coins in gold, treated as an exchange rate between the real-money economy and each world's gold economy. It then names the five forces that can move that price (trend, seasonality, cycles, differences between worlds, trading frictions), explains why one observed rise cannot tell them apart, states the research question, and gives the governing sentence you specified. It ends with a three-part contribution: measuring both sides of the Market across all worlds from real offers, testing competing models before any of them is used to look forward, and converting the results into outcomes in TC after trading costs. No price estimate appears in it.

**Why.** Opening with a November estimate asked the reader to trust a number before seeing any evidence for it.

**Continuity.** Every later chapter answers a part of the question posed here, and the conclusion answers the same question in the same words.

## 3. Every measurement decision now comes before any result

**What.** Chapter 02 gathers everything that determines what is measured: the two data sources, the number of monitored and modelled worlds and captures (read live from the data), the observation period, what a Sell Offer and a Buy Offer are, how spread and round-trip cost are defined (now as formulas), the cleaning rules, how daily and weekly series are built, what the cutoff and anchor are, why daily averages are kept out of the models, how mergers, predecessor worlds, Floribra and Luzibra are handled, and the exact definition of Tibia Coin inflation.

**Why.** Previously some of these rules appeared only after the results that depended on them, so the reader could not judge the evidence when first seeing it.

**Continuity.** Later chapters can state results without pausing to explain how they were measured.

**Note on counts.** Your brief mentions 24 monitored worlds, 23 modelled worlds and 98 captures. Those were the figures of an earlier edition. After merging the latest captures and regenerating the research, the data contain 39 monitored worlds, all 39 modelled, and 152 captures; the page reads these counts from the data files, so the text always matches the data it is built from.

## 4. The market is described before its dynamics

**What.** Chapter 03 now opens with a new synthesis of what the monitor tables show: how far price levels differ across worlds, how spreads differ, and how little of the quoted depth sits at the best price. It then measures Tibia Coin inflation, explains the trend and seasonality decomposition at the point where it is used (it had been buried in the data chapter), and ends with the seasonal calendar read directly from prices. It also adds three things the old text lacked: a comparison of Antica's inflation with every other world in the same month; the observation that the latest slowdown of 12-month inflation comes from last year's strong base month rather than from the current month; and, because seasonality cancels when the same month is compared across years, the inference that a 12-month rate far above the estimated trend puts the current price above what trend and season alone would give. The decomposition now names a dominant component only when it dominates under both estimation samples, because the earlier claim that the residual "mainly" drove the rise reversed under the 2024 sample.

**Why.** The old chapter showed the tables but said little about what they meant, and it separated the decomposition method from its results.

**Continuity.** The three regularities it establishes (levels differ, spreads differ, depth is thin) reappear later as the reason for using a benchmark and as the frictions in chapter 08.

## 5. Cycles and persistence are read as one question

**What.** Chapter 04 asks one question, whether the current rise fits past cycles or breaks from them, and answers it in order: timing, size, duration and the current position, followed by volatility, autocorrelation and forward returns as tests of whether weekly movements have memory beyond the calendar. Fixed claims such as "peaks fall between late October and November" were replaced by statements computed from the data, so they stay true as the data change. The chapter ends by naming the three properties any model must reproduce.

**Why.** Turning points, volatility and momentum were previously separate analyses with no shared conclusion.

**Continuity.** The closing summary of chapter 04 is the direct reason for each model in chapter 05.

## 6. Each model is justified by a finding

**What.** Chapter 05 presents four competing models, each tied to evidence from chapter 04: Constant (little persistence), Seasonal (stable timing), Harmonic (drifting level plus a smooth yearly cycle) and ARIMA with harmonic components (needed to turn a path into a probability distribution). Each is written as a formula, as are the ensemble, the stress band and the rule that carries the benchmark's path to other worlds. The lifecycle rules for young worlds moved to chapter 09.

**Why.** The old chapter read as a list of available models and mixed in world-specific rules.

**Continuity.** Validation in chapter 06 can now test exactly the hypotheses that chapter 05 states.

## 7. Validation sets the credibility of each model before any forecast

**What.** Chapter 06 separates three properties: point accuracy (MAPE, now as a formula), whether forecast intervals contain what later happened, and whether the probabilities of a rise are well calibrated (Brier score, now as a formula), followed by sensitivity to the estimation window, the seed and the starting capture. It closes with a verdict that rates all four models: the ensemble beats the Constant model at every tested combination of side and horizon, the Harmonic model does so in five of six and the Seasonal model in three, so no single model matches the combination, while the stochastic model's intervals cover well but its direction calls are weaker than a simple seasonal rule. It also explains why the weekly model's drift differs from the monthly trend of section 03, and it states correctly that the 2024 training sample leaves out all of 2023, not only its first half.

**Why.** The old text reported the tests but did not say what they meant for the scenarios that followed.

**Continuity.** Chapter 07 repeats that verdict when it presents each scenario, so every projection carries the credibility the tests earned.

## 8. Scenarios keep forecast, scenario and simulation apart

**What.** Chapter 07 opens by defining the three kinds of statement (a forecast is a model's estimate that can be scored, as section 06 scored the ensemble; a scenario places that forecast inside stated assumptions, such as the anchor date and a stress band built by rule; a simulation draws many paths from a stochastic model), then gives the November 2026 and June 2027 base values with their stress bands, compares them with the simulation at exactly the same weeks (the first draft compared weeks a few days apart), the P10 to P90 range from the simulation, the timing of the peak and the key probabilities, which were previously only in a table. The merger boundary moved to chapter 09.

**Why.** Without the distinction, a stress band could be read as a confidence interval and a simulated probability as a prediction.

**Continuity.** Each number is presented with the credibility chapter 06 assigned to the model behind it.

## 9. Execution is an application of the price process

**What.** Chapter 08 now answers one question: given the estimated process, what do trading frictions do to a strategy? It defines the strategy (sell TC for gold near the peak, buy back near the trough), writes the taker and maker gains as formulas including the 2% Create Offer fee, and then follows the frictions in order: the cost of crossing the spread today, what past round trips actually delivered, maker against taker, and the model-implied chance of ending with more TC. It adds one connection the old text missed: in Antica, the gain from a November sale fell from about 29% to about 6% across the three cycles, in step with the shrinking of the cycle documented in chapter 04. The round-trip tables now show Antica until a world is chosen, so the exhibits match the text.

**Why.** Previously the execution chapter mixed observed history, fees and simulated probabilities without a single question to organise them.

**Continuity.** Trading costs are applied only after prices are estimated, so no trading rule influences the forecasts it is judged against.

## 10. Heterogeneity is a separate extension, with Antica as the benchmark

**What.** Chapter 09 gathers everything about other worlds: relative premiums (with a formula), groups of worlds, correlation, relative volatility, level shifts (now compared in one paragraph), the announced merger and its boundary on scenarios, the Terribra predecessor test and the Floribra and Luzibra age comparison (previously spread over four chapters), and finally the world-by-world scenarios and profiles. It now reports the decisive test of the transfer rule, which the old report showed only one world at a time: carrying Antica's path to another world beats a simple "repeat the last price" forecast in 17 of 27 worlds but loses in the other 10, including all seven Optional PvP worlds with Yellow BattlEye, whose premium has been shrinking. The predecessor test now answers the question it asks: the rule improves on Terribra's own history but not on the Antica control. The world profiles no longer repeat the same figures and the same boilerplate sentence in every world. The chapter closes by stating what the cross-section does to the main argument.

**Why.** Cross-world material used to interrupt the main argument about how prices move over time, and the most important cross-world result was hidden in per-world boxes.

**Continuity.** The main argument now runs uninterrupted from chapter 03 to chapter 08, and chapter 09 then asks how far it generalises.

## 11. Robustness is ordered by how much each check matters

**What.** Chapter 10 now starts with the checks that could overturn a finding (the reversal threshold, the estimation window, the weekly-median effect on persistence, the reference model built on daily averages, reproducibility), then compares offers with daily averages, and finally reports weekday, event and calendar effects briefly because none of them changes the conclusions. It ends by stating what each check does to the main findings.

**Why.** Weekday and event analyses previously carried as much weight as the core results, which diluted the main contribution.

**Continuity.** The discussion can rely on findings that have already survived these checks.

## 12. The discussion separates what was observed from what it might mean

**What.** Chapter 11 covers inflation, seasonality and persistence, predictability, differences across worlds and trading costs. Each paragraph first states what the data show and then offers an economic interpretation that is labelled as such, for example that gold entering circulation faster than it leaves would explain the upward drift, while noting that the data do not measure either flow.

**Why.** The old discussion blended observation and interpretation.

**Continuity.** It interprets only what earlier chapters established and introduces no new analysis.

## 13. The conclusion answers the question and adds nothing new

**What.** Chapter 12 restates the research question and answers it directly: the dynamics can be described with confidence, they can be predicted only in part and only at short horizons, the scenarios are ranges rather than predictions, and after trading costs the cycle offers no demonstrated advantage. It contains no numbers. It states that the narrowing of the cycle rests on only three declines, and it separates the past gains of the seasonal strategy, which shrank cycle by cycle, from any expected future advantage, which the evidence does not demonstrate.

**Why.** The old conclusion repeated general cautions without answering the question.

**Continuity.** It closes the argument the introduction opened.

## 14. Sources as numbered endnotes

**What.** Sources are cited with superscript numbers placed after the punctuation that closes the relevant sentence or clause, and listed as numbered endnotes under "Notes" at the end, in Chicago note form: a full note the first time a source is cited and a shortened note afterwards. Bare inline links were replaced by notes. The Tibia news titles and dates were checked against the official archive through the TibiaData API, the merger announcement now points to its permanent archive address instead of the "latest news" page, and the merger note is built from `mergers.json`, so a new announcement is cited together with the data that states it. Sentences that described the document's own citation style or layout were removed.

**Why.** You asked for numbered superscript citations and endnotes, and the old links pointed to pages that change over time.

**Continuity.** Claims that depend on outside facts (merger dates, fees, launch dates, statistical methods) now point to their source without interrupting the sentence.

## 15. Continuous prose in both languages

**What.** Every paragraph was rewritten as connected sentences that move from evidence to interpretation to consequence, using "because", "although", "whereas", "so that" and similar links instead of strings of short statements. Paragraphs average about 80 words and sentences about 29 words in both editions. English uses British spelling. No em dash or dash-like character appears anywhere: ranges read "to" (English) or "a" (Portuguese), negative numbers use a plain hyphen-minus, and missing values read "N/A".

**Why.** Short sentences and frequent breaks made each result look isolated.

**Continuity.** The links between sentences carry the argument within each paragraph, just as the chapter endings carry it between chapters.

## 16. The Portuguese edition and its terminology rule

**What.** The Portuguese edition keeps every financial, statistical, Tibia and game term in English, always, following one fixed list (price, spread, fee, return, premium, trend, seasonality, cycle, peak, trough, median, sample, forecast, scenario, stress band, world, merger and so on). General vocabulary such as "modelo", "dados" and "teste" is translated. English terms take the grammatical gender of their usual Portuguese equivalent. Headings follow Chicago's sentence case for non-English titles. Turning points are now "peak" and "trough", which follows your new rule and still never uses "pico".

**Why.** The old page wrote Portuguese and then swapped some words for English with an automatic find-and-replace. That applied the rule unevenly (for example "mediana" was converted but "preço", "custo" and "retorno" were not) and produced agreement errors, such as "merger anunciado" in one sentence and "merger anunciada" in the next, because the gender came from whichever Portuguese word had been replaced.

**Continuity.** The same concept now has the same name in both editions, so a reader can move between them without relearning terms.

## 17. Formulas in LaTeX

**What.** Every definition that was written in words or plain characters (spread, round-trip cost, inflation rates, the decomposition, the turning-point rule, each model, the ensemble, the stress band, the transfer rule, MAPE, Brier score, premium, gains with fees, the daily-average gap, the lifecycle rules) is now a LaTeX formula typeset on the page. If the formula library cannot load, the LaTeX source is shown instead. The only minus signs left on the page are subtraction signs inside these formulas.

**Why.** You asked for LaTeX, and formulas remove any ambiguity about what was computed.

**Continuity.** Each formula sits in the sentence that introduces it, so the prose reads through the mathematics instead of around it.

## 18. Nothing in the text describes the page itself

**What.** Sentences that described the document's own mechanics were removed or rewritten: the note on citation style, how the world selector gathers information, how tables align dates, what dotted chart segments mean, which files the page reads, and how the robustness chapter orders its checks. Exhibit notes now explain only what a reader needs to interpret the numbers, and table labels were renamed so that notes and headers use the same words.

**Why.** You objected to text that talks about the report instead of the market.

**Continuity.** Every paragraph now carries part of the argument, so the reader never has to step out of the analysis to read about the page.

## 19. Verification

**What.** The text was checked by independent reviewers for structure, English, Portuguese terminology, factual accuracy against the data and the model code, parity between the two editions, and code correctness, and each finding was re-examined by a skeptical second reviewer before it was applied. Numbers and verdicts in the prose are computed from the data files, so statements such as "improves on" or "loses to" change automatically if the data change. After the merge with the latest data, the 28 unit tests, the data validation on 39 worlds, the byte-for-byte reproduction check and the premium-window test all pass.

**Why.** A report that claims rigour has to be checked against its own numbers.

**Continuity.** The same facts now read the same way in every chapter and in both languages.
