"use client";

import { useMemo, useState } from "react";
import { classifyVariation, type VariationClassification } from "./statistics";
import { rankNeighborhoods, weekHourMatrix, ratePer100k, HOUR_BUCKETS, WEEKDAY_LABELS } from "./analytics";

type RecordItem = {
  date: string;
  time: string;
  factId: string;
  nature: string;
  municipality: string;
  neighborhood: string;
  territorialUnit: string;
};

type ComparisonItem = {
  id: number;
  nature: string;
  previous: number;
  current: number;
  variation: number | null;
};

type DashboardData = {
  schemaVersion: number;
  metadata: {
    generatedAt: string;
    sourceFiles: string[];
    periodStart: string;
    periodEnd: string;
    records: number;
    uniqueFacts: number;
    previousTotal: number;
    currentTotal: number;
    regionalVariation: number | null;
    warnings: string[];
  };
  dimensions: {
    natures: string[];
    territorialUnits: Record<string, string[]>;
    groups: Record<string, string[]>;
  };
  comparison: ComparisonItem[];
  records: RecordItem[];
};

type Populacao = {
  fonte: string;
  anoReferencia: number;
  atualizadoEm: string;
  municipios: Record<string, number>;
};

const ALL = "TODOS";
const LOW_VOLUME_THRESHOLD = 10;

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "sem base";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}`;
}

function formatShare(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRate(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function RateLabel({ count, population }: { count: number; population: number | undefined }) {
  if (population === undefined) {
    return <span className="rank-rate">por 100 mil habitantes no período: —</span>;
  }
  const rate = ratePer100k(count, population);
  const lowVolume = count < LOW_VOLUME_THRESHOLD;
  return (
    <span className={`rank-rate${lowVolume ? " rate-low-volume" : ""}`}>
      {formatRate(rate)} por 100 mil habitantes no período{lowVolume ? "*" : ""}
    </span>
  );
}

function readingLabel(classification: VariationClassification) {
  switch (classification.level) {
    case "baixo-volume":
      return "volume baixo";
    case "observar":
      return "sinal a observar";
    case "significativo":
      return classification.direction === "alta" ? "alta significativa" : "queda significativa";
    case "sem-diferenca":
    default:
      return "sem diferença estatística";
  }
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

const KNOWN_ACRONYMS = new Set(["CVLI", "BPTUR", "SSP", "RAI", "CIPM", "BPM"]);

export function titleCase(value: string) {
  return value
    .split(/(\s+)/)
    .map((token) => {
      const bareLetters = token.replace(/[^\p{L}]/gu, "").toLocaleUpperCase("pt-BR");
      if (KNOWN_ACRONYMS.has(bareLetters)) {
        return token.toLocaleUpperCase("pt-BR");
      }
      return token
        .toLocaleLowerCase("pt-BR")
        .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("pt-BR"));
    })
    .join("");
}

function countBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

export function RegionalDashboard({ data, populacao }: { data: DashboardData; populacao: Populacao }) {
  const [startDate, setStartDate] = useState(data.metadata.periodStart);
  const [endDate, setEndDate] = useState(data.metadata.periodEnd);
  const [unit, setUnit] = useState(ALL);
  const [municipality, setMunicipality] = useState(ALL);
  const [group, setGroup] = useState(ALL);
  const [selectedNatures, setSelectedNatures] = useState(
    () => new Set(data.dimensions.natures),
  );

  const CVLI = useMemo(() => {
    if (!data.dimensions.groups?.CVLI?.length) {
      throw new Error("data.dimensions.groups.CVLI ausente: KPI de CVLI não pode ser calculado.");
    }
    return new Set(data.dimensions.groups.CVLI);
  }, [data.dimensions.groups]);

  const availableMunicipalities = useMemo(() => {
    if (unit === ALL) return Object.values(data.dimensions.territorialUnits).flat();
    return data.dimensions.territorialUnits[unit] ?? [];
  }, [data.dimensions.territorialUnits, unit]);

  const filtered = useMemo(
    () =>
      data.records.filter(
        (record) =>
          record.date >= startDate &&
          record.date <= endDate &&
          (unit === ALL || record.territorialUnit === unit) &&
          (municipality === ALL || record.municipality === municipality) &&
          selectedNatures.has(record.nature),
      ),
    [data.records, endDate, municipality, selectedNatures, startDate, unit],
  );

  const uniqueFacts = useMemo(
    () => new Set(filtered.map((record) => record.factId)).size,
    [filtered],
  );
  const natureCounts = useMemo(() => countBy(filtered, (record) => record.nature), [filtered]);
  const municipalityCounts = useMemo(
    () => countBy(filtered, (record) => record.municipality),
    [filtered],
  );
  const unitCounts = useMemo(
    () => countBy(filtered, (record) => record.territorialUnit),
    [filtered],
  );

  const unitPopulations = useMemo(() => {
    const result = new Map<string, number | undefined>();
    for (const [unitName, cities] of Object.entries(data.dimensions.territorialUnits)) {
      let sum = 0;
      let complete = true;
      for (const city of cities) {
        const cityPopulation = populacao.municipios[city];
        if (cityPopulation === undefined) {
          complete = false;
          break;
        }
        sum += cityPopulation;
      }
      result.set(unitName, complete ? sum : undefined);
    }
    return result;
  }, [data.dimensions.territorialUnits, populacao.municipios]);

  const comparisonApplicable =
    unit === ALL &&
    municipality === ALL &&
    startDate === data.metadata.periodStart &&
    endDate === data.metadata.periodEnd;

  const comparison = useMemo(
    () => data.comparison.filter((item) => selectedNatures.has(item.nature)),
    [data.comparison, selectedNatures],
  );
  const previousSelected = comparison.reduce((sum, item) => sum + item.previous, 0);
  const currentSelected = comparison.reduce((sum, item) => sum + item.current, 0);
  const regionalVariation =
    previousSelected === 0
      ? currentSelected === 0
        ? 0
        : null
      : (currentSelected - previousSelected) / previousSelected;
  const regionalClassification = classifyVariation(previousSelected, currentSelected, {
    alpha: 0.05,
    bonferroniN: 1,
  });

  const neighborhoodRanking = useMemo(() => rankNeighborhoods(filtered), [filtered]);
  const hourMatrix = useMemo(() => weekHourMatrix(filtered), [filtered]);
  const maxNeighborhood = Math.max(1, ...neighborhoodRanking.rows.slice(0, 10).map((row) => row.count));

  const rankedMunicipalities = [...municipalityCounts.entries()].sort((a, b) => b[1] - a[1]);
  const rankedNatures = data.dimensions.natures
    .filter((nature) => selectedNatures.has(nature))
    .map((nature) => [nature, natureCounts.get(nature) ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  const monthly = [...countBy(filtered, (record) => record.date.slice(0, 7)).entries()].sort();
  const maxMonth = Math.max(1, ...monthly.map(([, value]) => value));
  const maxMunicipality = Math.max(1, ...rankedMunicipalities.map(([, value]) => value));
  const cvliCount = filtered.filter((record) => CVLI.has(record.nature)).length;
  const leadingMunicipality = rankedMunicipalities[0];
  const leadingNature = rankedNatures[0];

  function changeUnit(nextUnit: string) {
    setUnit(nextUnit);
    setMunicipality(ALL);
  }

  function changeGroup(nextGroup: string) {
    setGroup(nextGroup);
    setSelectedNatures(
      new Set(nextGroup === ALL ? data.dimensions.natures : data.dimensions.groups[nextGroup]),
    );
  }

  function toggleNature(nature: string) {
    setSelectedNatures((current) => {
      const next = new Set(current);
      if (next.has(nature)) next.delete(nature);
      else next.add(nature);
      return next;
    });
    setGroup(ALL);
  }

  function resetFilters() {
    setStartDate(data.metadata.periodStart);
    setEndDate(data.metadata.periodEnd);
    setUnit(ALL);
    setMunicipality(ALL);
    setGroup(ALL);
    setSelectedNatures(new Set(data.dimensions.natures));
  }

  return (
    <main>
      <div className="institutional-stripe" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <header className="site-header">
        <div className="header-inner">
          <div>
            <p className="eyebrow">Polícia Militar de Goiás · 19º CRPM</p>
            <h1>Indicadores Criminais da 19ª RISP</h1>
            <p className="subtitle">
              Visão regional consolidada, com leitura por unidade territorial, município e natureza.
            </p>
          </div>
          <div className="restricted-badge">Acesso restrito</div>
        </div>
      </header>

      <div className="dashboard-shell">
        <section className="filter-panel" aria-labelledby="filter-title">
          <div className="filter-heading">
            <div>
              <p className="section-kicker">Recorte da análise</p>
              <h2 id="filter-title">Escolha o que deseja visualizar</h2>
            </div>
            <button className="text-button" type="button" onClick={resetFilters}>
              Limpar filtros
            </button>
          </div>

          <div className="filter-grid">
            <label>
              Data inicial
              <input
                type="date"
                min={data.metadata.periodStart}
                max={endDate}
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              Data final
              <input
                type="date"
                min={startDate}
                max={data.metadata.periodEnd}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label>
              Unidade territorial
              <select value={unit} onChange={(event) => changeUnit(event.target.value)}>
                <option value={ALL}>Toda a 19ª RISP</option>
                {Object.keys(data.dimensions.territorialUnits).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Município
              <select
                value={municipality}
                onChange={(event) => setMunicipality(event.target.value)}
              >
                <option value={ALL}>Todos os municípios</option>
                {availableMunicipalities.map((item) => (
                  <option key={item} value={item}>
                    {titleCase(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Grupo de naturezas
              <select value={group} onChange={(event) => changeGroup(event.target.value)}>
                <option value={ALL}>Todas as naturezas</option>
                {Object.keys(data.dimensions.groups).map((item) => (
                  <option key={item} value={item}>
                    {titleCase(item)}
                  </option>
                ))}
              </select>
            </label>

            <details className="nature-picker">
              <summary>
                Naturezas específicas
                <span>{selectedNatures.size} de {data.dimensions.natures.length}</span>
              </summary>
              <div className="nature-menu">
                <div className="nature-actions">
                  <button
                    type="button"
                    onClick={() => setSelectedNatures(new Set(data.dimensions.natures))}
                  >
                    Marcar todas
                  </button>
                  <button type="button" onClick={() => setSelectedNatures(new Set())}>
                    Desmarcar
                  </button>
                </div>
                {data.dimensions.natures.map((nature) => (
                  <label key={nature} className="check-row">
                    <input
                      type="checkbox"
                      checked={selectedNatures.has(nature)}
                      onChange={() => toggleNature(nature)}
                    />
                    <span>{titleCase(nature)}</span>
                  </label>
                ))}
              </div>
            </details>
          </div>
        </section>

        <section className="plain-summary" aria-live="polite">
          <div className="summary-mark">Leitura rápida</div>
          <p>
            No recorte selecionado há <strong>{formatNumber(filtered.length)} registros de natureza</strong>{" "}
            relacionados a <strong>{formatNumber(uniqueFacts)} fatos distintos</strong>.
            {leadingNature && (
              <> A natureza mais frequente é <strong>{titleCase(leadingNature[0])}</strong>, com{" "}
                <strong>{formatNumber(leadingNature[1])}</strong> registros.</>
            )}
            {leadingMunicipality && (
              <> O município com maior volume é <strong>{titleCase(leadingMunicipality[0])}</strong>, com{" "}
                <strong>{formatNumber(leadingMunicipality[1])}</strong>.</>
            )}
          </p>
        </section>

        <section className="kpi-grid" aria-label="Indicadores principais">
          <article className="kpi-card">
            <span>Registros por natureza</span>
            <strong>{formatNumber(filtered.length)}</strong>
            <small>Uma ocorrência pode possuir mais de uma natureza.</small>
          </article>
          <article className="kpi-card">
            <span>Fatos distintos</span>
            <strong>{formatNumber(uniqueFacts)}</strong>
            <small>Contagem de RAI sem duplicidade.</small>
          </article>
          <article className="kpi-card">
            <span>CVLI</span>
            <strong>{formatNumber(cvliCount)}</strong>
            <small>Homicídio, feminicídio, latrocínio e lesão seguida de morte.</small>
          </article>
          <article
            className={`kpi-card variation ${
              comparisonApplicable && regionalClassification.level === "significativo"
                ? regionalVariation !== null && regionalVariation > 0
                  ? "bad"
                  : "good"
                : "neutral"
            }`}
          >
            <span>Variação regional</span>
            <strong>{comparisonApplicable ? formatPercent(regionalVariation) : "—"}</strong>
            <small>
              {comparisonApplicable
                ? `${formatNumber(previousSelected)} no período anterior e ${formatNumber(currentSelected)} no atual. Leitura: ${readingLabel(regionalClassification)}.`
                : "Disponível somente para o período completo e visão regional."}
            </small>
          </article>
        </section>

        <section className="content-section" aria-labelledby="units-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Distribuição territorial</p>
              <h2 id="units-title">Unidades e municípios</h2>
            </div>
            <span>{formatDate(startDate)} a {formatDate(endDate)}</span>
          </div>

          <div className="unit-grid">
            {Object.entries(data.dimensions.territorialUnits).map(([unitName, cities]) => {
              const value = unitCounts.get(unitName) ?? 0;
              const share = filtered.length ? value / filtered.length : 0;
              return (
                <article className="unit-card" key={unitName}>
                  <div className="unit-card-top">
                    <h3>{unitName}</h3>
                    <strong>{formatNumber(value)}</strong>
                  </div>
                  <div className="share-track" aria-label={`${formatPercent(share)} do recorte`}>
                    <span style={{ width: `${share * 100}%` }} />
                  </div>
                  <p>{formatPercent(share)} do recorte</p>
                  <RateLabel count={value} population={unitPopulations.get(unitName)} />
                  <small>{cities.map(titleCase).join(" · ")}</small>
                </article>
              );
            })}
            <article className="unit-card specialized">
              <div className="unit-card-top">
                <h3>10ª CIPM/CPE</h3>
                <strong>11</strong>
              </div>
              <p>municípios atendidos</p>
              <small>
                Unidade especializada. O arquivo atual não identifica qual unidade realizou cada atendimento.
              </small>
            </article>
          </div>

          <div className="three-column">
            <article className="panel">
              <div className="panel-heading">
                <h3>Municípios com maior volume</h3>
                <span>registros por natureza</span>
              </div>
              <div className="ranking">
                {rankedMunicipalities.length ? (
                  rankedMunicipalities.map(([name, value], index) => (
                    <div className="rank-row" key={name}>
                      <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="rank-label">{titleCase(name)}</span>
                      <span className="rank-track">
                        <i style={{ width: `${(value / maxMunicipality) * 100}%` }} />
                      </span>
                      <strong>{formatNumber(value)}</strong>
                      <RateLabel count={value} population={populacao.municipios[name]} />
                    </div>
                  ))
                ) : (
                  <p className="empty-state">Nenhum registro corresponde aos filtros.</p>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <h3>Bairros críticos</h3>
                <span>top 10 · registros por natureza</span>
              </div>
              <div className="ranking">
                {neighborhoodRanking.rows.length ? (
                  neighborhoodRanking.rows.slice(0, 10).map((row, index) => (
                    <div className="rank-row" key={`${row.municipality}\u0000${row.neighborhood}`}>
                      <span className="rank-number">{String(index + 1).padStart(2, "0")}</span>
                      <span className="rank-label">
                        {titleCase(row.municipality)} · {titleCase(row.neighborhood)}
                      </span>
                      <span className="rank-track">
                        <i style={{ width: `${(row.count / maxNeighborhood) * 100}%` }} />
                      </span>
                      <strong>{formatNumber(row.count)}</strong>
                    </div>
                  ))
                ) : (
                  <p className="empty-state">Nenhum registro corresponde aos filtros.</p>
                )}
              </div>
              <p className="method-note">
                Os 5 bairros mais frequentes concentram {formatShare(neighborhoodRanking.cr5)} dos
                registros do recorte, distribuídos em {formatNumber(neighborhoodRanking.distinct)} bairros
                distintos.
              </p>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <h3>Evolução mensal</h3>
                <span>o último mês pode estar incompleto</span>
              </div>
              <div className="month-chart">
                {monthly.map(([month, value]) => {
                  const [year, monthNumber] = month.split("-").map(Number);
                  const label = new Intl.DateTimeFormat("pt-BR", { month: "short" })
                    .format(new Date(year, monthNumber - 1, 1))
                    .replace(".", "");
                  return (
                    <div className="month-column" key={month}>
                      <strong>{value}</strong>
                      <div>
                        <i style={{ height: `${Math.max(4, (value / maxMonth) * 100)}%` }} />
                      </div>
                      <span>{label}</span>
                    </div>
                  );
                })}
              </div>
            </article>
          </div>
        </section>

        <section className="content-section" aria-labelledby="natures-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Composição do resultado</p>
              <h2 id="natures-title">Naturezas controladas pela SSP</h2>
            </div>
            <span>{selectedNatures.size} selecionadas</span>
          </div>

          {!comparisonApplicable && (
            <div className="info-banner">
              O arquivo comparativo não traz município, unidade ou datas detalhadas. Por isso, a coluna do
              período anterior aparece somente na visão regional completa.
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Natureza</th>
                  <th className="numeric">Atual</th>
                  <th className="numeric">Anterior</th>
                  <th className="numeric">Variação</th>
                  <th>Leitura</th>
                </tr>
              </thead>
              <tbody>
                {rankedNatures.map(([nature, current]) => {
                  const sourceComparison = data.comparison.find((item) => item.nature === nature);
                  const variation =
                    comparisonApplicable && sourceComparison
                      ? sourceComparison.variation
                      : null;
                  const classification =
                    comparisonApplicable && sourceComparison
                      ? classifyVariation(sourceComparison.previous, sourceComparison.current, {
                          bonferroniN: Math.max(1, comparison.length),
                        })
                      : null;
                  const varianceClass =
                    classification && classification.level === "significativo"
                      ? variation !== null && variation > 0
                        ? "up"
                        : "down"
                      : "neutral";
                  return (
                    <tr key={nature}>
                      <td>{titleCase(nature)}</td>
                      <td className="numeric strong">{formatNumber(current)}</td>
                      <td className="numeric">
                        {comparisonApplicable && sourceComparison
                          ? formatNumber(sourceComparison.previous)
                          : "—"}
                      </td>
                      <td className={`numeric variance ${comparisonApplicable ? varianceClass : ""}`}>
                        {comparisonApplicable ? formatPercent(variation) : "—"}
                      </td>
                      <td className="reading">
                        {classification ? readingLabel(classification) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="content-section" aria-labelledby="hour-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Padrão temporal</p>
              <h2 id="hour-title">Dia da semana × faixa de horário</h2>
            </div>
            <span>{formatNumber(hourMatrix.total)} registros com horário</span>
          </div>

          <div className="heatmap-wrap">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th>Dia</th>
                  {HOUR_BUCKETS.map((bucket) => (
                    <th key={bucket}>{bucket}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEKDAY_LABELS.map((label, dayIndex) => (
                  <tr key={label}>
                    <td className="weekday-label">{label}</td>
                    {hourMatrix.cells[dayIndex].map((value, hourIndex) => {
                      const belowThreshold = value < 5;
                      const ratio = hourMatrix.max ? value / hourMatrix.max : 0;
                      const level = belowThreshold
                        ? 0
                        : Math.min(4, Math.max(1, Math.ceil(ratio * 4)));
                      const cellClass = belowThreshold ? "cell-below-threshold" : `cell-${level}`;
                      return (
                        <td key={hourIndex} className={cellClass}>
                          {formatNumber(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="method-note">
            Células com menos de 5 registros não recebem destaque de cor, apenas o número, para evitar
            leitura enganosa de intensidade em volumes pequenos.
          </p>
          <p className="info-banner">
            32 registros no total têm horário marcado como 00:00 e podem representar hora não informada;
            a precisão desta matriz será refinada numa próxima atualização.
          </p>
        </section>

        <section className="method-section" aria-labelledby="method-title">
          <p className="section-kicker">Como ler este painel</p>
          <h2 id="method-title">Transparência sobre os dados</h2>
          <div className="method-grid">
            <article>
              <strong>Registro por natureza</strong>
              <p>Cada linha do arquivo detalhado representa uma natureza. Um mesmo RAI pode aparecer duas vezes.</p>
            </article>
            <article>
              <strong>Fato distinto</strong>
              <p>É o RAI contado uma única vez, mesmo quando possui mais de uma natureza relacionada.</p>
            </article>
            <article>
              <strong>Unidade territorial</strong>
              <p>É calculada pelo município. Não representa necessariamente a unidade que atendeu a ocorrência.</p>
            </article>
            <article>
              <strong>Atualização</strong>
              <p>
                Base de {formatDate(data.metadata.periodStart)} a {formatDate(data.metadata.periodEnd)}.
                Fontes: {data.metadata.sourceFiles.join(" e ")}.
              </p>
            </article>
          </div>
          <p className="method-note">
            Variações são comparadas estatisticamente; só destacamos como alta ou queda real quando a
            chance de ser coincidência é baixa. Volumes pequenos (menos de 10 casos no total) não
            permitem essa conclusão e aparecem como &quot;volume baixo&quot;.
          </p>
          <p className="method-note">
            As taxas por 100 mil habitantes usam a população de referência de {populacao.fonte}. Elas se
            referem ao período do recorte selecionado, de {formatDate(startDate)} a {formatDate(endDate)},
            não a um ano completo — evite compará-las diretamente com taxas anuais.
            Marcadores com asterisco (*) indicam base de menos de 10 casos, cuja taxa é pouco informativa.
            Atenção especial para Caldas Novas e Rio Quente: sua população turística flutuante é muito maior
            que a população residente considerada pelo IBGE, então a taxa desses dois municípios deve ser
            lida com essa ressalva.
          </p>
        </section>

        <footer>
          <strong>Documento de acesso restrito</strong>
          <p>
            Uso interno da Seção de Planejamento Operacional do 19º CRPM. A divulgação não autorizada
            pode gerar responsabilidades administrativas, civis e penais.
          </p>
        </footer>
      </div>
    </main>
  );
}
