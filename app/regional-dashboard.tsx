"use client";

import { useMemo, useState } from "react";

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

const ALL = "TODOS";

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

export function RegionalDashboard({ data }: { data: DashboardData }) {
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
          <article className={`kpi-card variation ${comparisonApplicable && regionalVariation !== null && regionalVariation > 0 ? "bad" : "good"}`}>
            <span>Variação regional</span>
            <strong>{comparisonApplicable ? formatPercent(regionalVariation) : "—"}</strong>
            <small>
              {comparisonApplicable
                ? `${formatNumber(previousSelected)} no período anterior e ${formatNumber(currentSelected)} no atual.`
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

          <div className="two-column">
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
                    </div>
                  ))
                ) : (
                  <p className="empty-state">Nenhum registro corresponde aos filtros.</p>
                )}
              </div>
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
                </tr>
              </thead>
              <tbody>
                {rankedNatures.map(([nature, current]) => {
                  const sourceComparison = data.comparison.find((item) => item.nature === nature);
                  const variation =
                    comparisonApplicable && sourceComparison
                      ? sourceComparison.variation
                      : null;
                  return (
                    <tr key={nature}>
                      <td>{titleCase(nature)}</td>
                      <td className="numeric strong">{formatNumber(current)}</td>
                      <td className="numeric">
                        {comparisonApplicable && sourceComparison
                          ? formatNumber(sourceComparison.previous)
                          : "—"}
                      </td>
                      <td
                        className={`numeric variance ${variation === null ? "" : variation > 0 ? "up" : variation < 0 ? "down" : ""}`}
                      >
                        {comparisonApplicable ? formatPercent(variation) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
