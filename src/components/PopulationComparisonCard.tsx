import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import type { FinancialHistory } from "@/modules/simple/model";
import { buildPopulationComparisonInsight } from "@/modules/simple/population-comparison";
import type { FinancialMetricKind } from "@/modules/simple/schema";
import type { TaiwanDistributionInfo, TaiwanDistributionModel } from "@/modules/simple/taiwan-distributions";

import "./PopulationComparisonCard.css";

const money = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const people = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });

function moneyAmount(value: number): string {
  return `NT$ ${money.format(Math.abs(value))}`;
}

function milestonePeople(value: number): string {
  if (value < 10_000) return people.format(value);
  const tenThousands = value / 10_000;
  const rounded = Math.round(tenThousands * 10) / 10;
  return `${people.format(rounded)} 萬`;
}

function PopulationInfoDialog({
  label,
  info,
  onClose,
}: {
  label: string;
  info: TaiwanDistributionInfo;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const titleId = `population-info-title-${info.label}`;
  return createPortal(
    <div
      className="population-info-backdrop"
      data-testid="population-info-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="population-info-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="population-info-dialog-head">
          <div>
            <p className="population-info-eyebrow">臺灣人口比較資料說明</p>
            <h2 id={titleId}>{label}</h2>
          </div>
          <button type="button" className="population-info-close" onClick={onClose} aria-label="關閉資料說明">×</button>
        </div>
        <div className="population-info-dialog-body">
          <p>{info.note}</p>
          <p>比較母體固定為 {people.format(info.comparisonPopulation)} 人；相同金額不計入「贏過」人數。</p>
          <div className="population-info-sources">
            {info.sources.map((source) => (
              <a href={source.url} target="_blank" rel="noreferrer" key={`${label}-${source.label}`}>{source.label}</a>
            ))}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function PopulationComparisonCard({
  label,
  metricKind,
  history,
  goal,
  today,
  model,
  info,
}: {
  label: string;
  metricKind: FinancialMetricKind;
  history: FinancialHistory[];
  goal: number | null;
  today: string;
  model: TaiwanDistributionModel;
  info: TaiwanDistributionInfo;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const insight = useMemo(
    () => buildPopulationComparisonInsight({ model, metricKind, history, goal, today }),
    [goal, history, metricKind, model, today],
  );
  const available = insight.currentPeople !== null;
  const historyChange = insight.historyChange;

  return (
    <article className={available ? "achievement-card percentile-card population-comparison-card" : "achievement-card percentile-card population-comparison-card is-unavailable"}>
      <p className="achievement-kicker population-card-kicker">你的{label}贏過</p>

      <div className="population-insight population-next-step">
        <p className="population-insight-label">下一步</p>
        {insight.nextStep ? (
          <>
            <strong>{label}再增加 {moneyAmount(insight.nextStep.amountIncrease)}</strong>
            <span>就能比現在再多贏過約 {milestonePeople(insight.nextStep.additionalPeople)}人</span>
          </>
        ) : available ? (
          <span>{label}目前已沒有更高的人口里程碑可顯示</span>
        ) : (
          <span>先記錄{label}，就能計算下一個人口里程碑</span>
        )}
      </div>

      <div className="population-insight population-history-change">
        <p className="population-insight-label">最近變化</p>
        {historyChange ? (
          <>
            <strong>
              {label}比{historyChange.baselineLabel}{historyChange.amountChange > 0 ? "增加" : "減少"} {moneyAmount(historyChange.amountChange)}
            </strong>
            <span>
              {historyChange.peopleChange > 0 ? "又多贏過了" : "因此少贏過了"} {people.format(Math.abs(historyChange.peopleChange))} 人
            </span>
          </>
        ) : (
          <span>累積第二筆{label}變化後，這裡會顯示最近進步</span>
        )}
      </div>

      <p className="population-total">
        {insight.currentPeople === null ? `目前還沒有${label}紀錄` : <>目前共贏過 <strong>{people.format(insight.currentPeople)}</strong> 個臺灣人</>}
      </p>

      <button
        type="button"
        className="achievement-info-trigger"
        aria-label={`${label}臺灣人口比較資料說明`}
        aria-haspopup="dialog"
        aria-expanded={infoOpen}
        onClick={() => setInfoOpen(true)}
      >
        ⓘ
      </button>
      {infoOpen ? <PopulationInfoDialog label={label} info={info} onClose={() => setInfoOpen(false)} /> : null}
    </article>
  );
}
