# Ciclo das Tibia Coins — scripts e dados

Análise do preço de Tibia Coins (TC) em gold, por mundo, 2023–2026.

## Ordem para rodar (Python 3.11, pandas, numpy, scipy, statsmodels, ruptures)
1. Baixe `data/market/world/<Mundo>/<mundo>_tibia_coins.json` do repositório nesleykent/tibia-warzones-schedule para a pasta `tc/` (nome do arquivo = mundo em minúsculas) e `data/worlds.json` como `worlds.json`.
2. `python3 parse_events.py` — lê `events/ev*.txt` (dump do endpoint /events do tibiamarket) e gera `events_intervals.json` e `events_daily.json`.
3. `python3 build_series.py` — séries diárias limpas por mundo (`daily_by_world.pkl`, `coverage.csv`).
4. `python3 index_build.py` — índice de mercado (mediana em duas direções sobre log do preço, 71 mundos estabelecidos), índices por região, prêmio de cada mundo.
5. `python3 analysis_ab.py` — volatilidade, sazonalidade, dia da semana, fases (ruptures), zigue-zague, altas fortes, correlação e defasagem entre regiões → `results_ab.json`.
6. `python3 analysis_events.py` — estudo de eventos com placebo e correção de Benjamini-Hochberg → `event_study.csv`, `event_occurrences.json`.
7. `python3 roundtrip.py` — operações simuladas de venda e recompra entre meses, com Accept e com ofertas (`roundtrip.json`).
8. `python3 report_data.py` — junta tudo para a página (`report_data.json`).

## Cenários (capturas de 21–23/09 e modelos)
9. Coloque `observations-2.json` na pasta e rode o trecho de conversão (ver `obs2_index.json`: o melhor ask equivale ao preço médio das Sell Offers; nível do índice = mediana entre mundos de log(ask) − prêmio do mundo).
10. `python3 series_long.py` — série semanal longa (Antica 2023 + índice + capturas).
11. `python3 models.py` — seleção por AIC (M1: Fourier + tendência com erros ARIMA(1,1,0); M2: modelo estrutural).
12. `python3 backtest.py` — backtest com origem em 15/09/2025 e 16/09/2024, contra a previsão ingênua (`backtest.json`, `pivots.json`).
13. `python3 forecast.py` — 6.000 caminhos simulados com incerteza de parâmetros e ciclos análogos (`forecast.json`).

## Convenções
- Preço do dia = `day_average_sell` (média dos negócios nas Sell Offers), limpo de pontos a mais de 6% da mediana móvel de 9 dias.
- Dia = dia do servidor (Server Save 10:00 Europe/Berlin). `stats_day` = data do servidor no momento da coleta − 1. Validado: correlação 0,65 com o book no mesmo dia, ~0 nos vizinhos.
- `extra_events.json`: datas de updates e mudanças econômicas, com a fonte de cada uma.
- `indice_diario.csv`: índice diário (gp por TC do "mundo típico"), número de mundos no dia, índices BR/EU/NA.

## Limites
Preços até 13/09/2026; eventos até 15/09/2026. Ver a seção "Limites" da página.
