import type { DecisionAdapter, DecisionInput, RouterDecision } from "../../src/index.js";

type KeywordMap = Record<string, string[]>;

export interface KeywordClassifierOptions {
  keywords: KeywordMap;
  threshold?: number;
}

export function createKeywordClassifier(options: KeywordClassifierOptions): DecisionAdapter {
  const threshold = options.threshold ?? 0.2;

  return {
    async decide(input) {
      return classify(input, options.keywords, threshold);
    }
  };
}

function classify(input: DecisionInput, keywords: KeywordMap, threshold: number): RouterDecision {
  const request = normalize(input.request);
  const scored = input.options.map((option) => {
    const optionText = normalize([option, input.optionDescriptions[option] ?? ""].join(" "));
    const configuredKeywords = keywords[option] ?? keywords[option.toLowerCase()] ?? [];
    const terms = configuredKeywords.length > 0 ? configuredKeywords : tokenize(optionText);
    const matches = terms.filter((term) => request.includes(normalize(term)));

    return {
      option,
      score: matches.length,
      matches
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const winner = scored[0];
  const runnerUp = scored[1];
  const totalMatches = scored.reduce((sum, item) => sum + item.score, 0);

  if (!winner || winner.score === 0) {
    return {
      choice: "no_tool_available",
      confidence: 1,
      reason: "No classifier keywords matched the request."
    };
  }

  const margin = runnerUp ? winner.score - runnerUp.score : winner.score;
  const confidence = Math.min(1, Math.max(threshold, winner.score / Math.max(1, totalMatches)));

  if (confidence < threshold || margin <= 0) {
    return {
      choice: "needs_clarification",
      confidence,
      question: `Should this route to ${winner.option} or ${runnerUp?.option ?? "another option"}?`,
      reason: "Classifier scores were too close."
    };
  }

  return {
    choice: winner.option,
    confidence,
    reason: `Matched keywords: ${winner.matches.join(", ")}`
  };
}

function tokenize(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter((term) => term.length >= 4);
}

function normalize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
