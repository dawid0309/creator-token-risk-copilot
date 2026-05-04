import type { AlertEvaluation, AlertPreset, AlertPresetId, RiskReport, Token } from "../types";

export const alertPresets: AlertPreset[] = [
  {
    id: "score",
    label: "Score below 60",
    description: "Highlights tokens that fall into a high-risk or caution zone.",
  },
  {
    id: "volatility",
    label: "Volatility over 20%",
    description: "Flags large quote-impact swings that can distort a quick read.",
  },
  {
    id: "holders",
    label: "Top holder over 45%",
    description: "Surfaces concentration risk when one cluster controls too much supply.",
  },
  {
    id: "fees",
    label: "Fee spike over 2.5x",
    description: "Calls out sudden fee acceleration that may not be backed by broader demand.",
  },
];

export function evaluateAlert(
  id: AlertPresetId,
  token: Token,
  report: RiskReport,
): AlertEvaluation {
  if (id === "score") {
    return {
      id,
      triggered: report.score < 60,
      detail:
        report.score < 60
          ? `Current score is ${report.score}, below the 60-point review threshold.`
          : `Current score is ${report.score}, still above the 60-point review threshold.`,
    };
  }

  if (id === "volatility") {
    const move = Math.abs(token.quoteImpactPercent);
    return {
      id,
      triggered: move > 20,
      detail:
        move > 20
          ? `Quote-impact probe is ${move.toFixed(1)}%, which exceeds the 20% volatility line.`
          : `Quote-impact probe is ${move.toFixed(1)}%, below the 20% volatility line.`,
    };
  }

  if (id === "holders") {
    return {
      id,
      triggered: token.topHolderPercent > 45,
      detail:
        token.topHolderPercent > 45
          ? `Top holder concentration is ${token.topHolderPercent}%, above the 45% concentration line.`
          : `Top holder concentration is ${token.topHolderPercent}%, below the 45% concentration line.`,
    };
  }

  return {
    id,
    triggered: token.feeSpikeMultiple > 2.5,
    detail:
      token.feeSpikeMultiple > 2.5
        ? `Fee velocity is ${token.feeSpikeMultiple.toFixed(1)}x baseline, above the 2.5x spike line.`
        : `Fee velocity is ${token.feeSpikeMultiple.toFixed(1)}x baseline, below the 2.5x spike line.`,
  };
}

export function evaluateActiveAlerts(
  token: Token,
  report: RiskReport,
  activeAlerts: AlertPresetId[],
) {
  return activeAlerts.map((id) => evaluateAlert(id, token, report));
}
