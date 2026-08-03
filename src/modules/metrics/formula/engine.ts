import Decimal from "decimal.js";

import { ApiError } from "@/core/errors/api-error";
import type { AnalyticResult } from "@/core/provenance/analytic-result";

type BinaryOperator = "+" | "-" | "*" | "/";
type AggregateName = "SUM" | "AVG" | "COUNT" | "LAST" | "DELTA";

export type FormulaNode =
  | { type: "literal"; value: string }
  | { type: "metric"; key: string }
  | { type: "binary"; operator: BinaryOperator; left: FormulaNode; right: FormulaNode }
  | { type: "aggregate"; name: AggregateName; metricKey: string };

interface Token {
  kind: "number" | "identifier" | "operator" | "left" | "right" | "comma" | "eof";
  value: string;
}

const aggregateNames = new Set<AggregateName>(["SUM", "AVG", "COUNT", "LAST", "DELTA"]);

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const character = expression[index];
    const kinds: Record<string, Token["kind"]> = {
      "+": "operator",
      "-": "operator",
      "*": "operator",
      "/": "operator",
      "(": "left",
      ")": "right",
      ",": "comma",
    };
    const kind = kinds[character];
    if (!kind) throw new ApiError(400, "FORMULA_INVALID", `公式含不支援的字元：${character}`);
    tokens.push({ kind, value: character });
    index += 1;
  }
  tokens.push({ kind: "eof", value: "" });
  return tokens;
}

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): FormulaNode {
    const node = this.parseAdditive();
    if (this.peek().kind !== "eof") throw new ApiError(400, "FORMULA_INVALID", "公式結尾含無法解析的內容。");
    return node;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private take(): Token {
    return this.tokens[this.index++];
  }

  private parseAdditive(): FormulaNode {
    let node = this.parseMultiplicative();
    while (this.peek().kind === "operator" && (this.peek().value === "+" || this.peek().value === "-")) {
      const operator = this.take().value as BinaryOperator;
      node = { type: "binary", operator, left: node, right: this.parseMultiplicative() };
    }
    return node;
  }

  private parseMultiplicative(): FormulaNode {
    let node = this.parsePrimary();
    while (this.peek().kind === "operator" && (this.peek().value === "*" || this.peek().value === "/")) {
      const operator = this.take().value as BinaryOperator;
      node = { type: "binary", operator, left: node, right: this.parsePrimary() };
    }
    return node;
  }

  private parsePrimary(): FormulaNode {
    const token = this.take();
    if (token.kind === "number") return { type: "literal", value: token.value };
    if (token.kind === "left") {
      const node = this.parseAdditive();
      if (this.take().kind !== "right") throw new ApiError(400, "FORMULA_INVALID", "公式括號未成對。");
      return node;
    }
    if (token.kind === "operator" && token.value === "-") {
      return { type: "binary", operator: "*", left: { type: "literal", value: "-1" }, right: this.parsePrimary() };
    }
    if (token.kind === "identifier") {
      const upper = token.value.toUpperCase() as AggregateName;
      if (this.peek().kind === "left") {
        if (!aggregateNames.has(upper)) throw new ApiError(400, "FORMULA_INVALID", `不支援的函式：${token.value}`);
        this.take();
        const metric = this.take();
        if (metric.kind !== "identifier" || this.take().kind !== "right") {
          throw new ApiError(400, "FORMULA_INVALID", `${upper}只接受一個已註冊指標引用。`);
        }
        return { type: "aggregate", name: upper, metricKey: metric.value };
      }
      return { type: "metric", key: token.value };
    }
    throw new ApiError(400, "FORMULA_INVALID", "公式語法無效。");
  }
}

export function parseFormula(expression: string): FormulaNode {
  if (expression.length > 1000) throw new ApiError(400, "FORMULA_INVALID", "公式長度超過限制。");
  return new Parser(tokenize(expression)).parse();
}

export function formulaMetricKeys(node: FormulaNode): string[] {
  if (node.type === "metric") return [node.key];
  if (node.type === "aggregate") return [node.metricKey];
  if (node.type === "binary") return [...new Set([...formulaMetricKeys(node.left), ...formulaMetricKeys(node.right)])];
  return [];
}

export interface FormulaInput {
  values: string[];
  sourceRefs: Array<{ type: string; id: string }>;
}

function aggregate(name: AggregateName, values: Decimal[]): Decimal {
  if (name === "COUNT") return new Decimal(values.length);
  if (values.length === 0) throw new ApiError(422, "FORMULA_MISSING_INPUT", "公式缺少必要觀測值。");
  if (name === "SUM") return Decimal.sum(...values);
  if (name === "AVG") return Decimal.sum(...values).div(values.length);
  if (name === "LAST") return values.at(-1)!;
  return values.length < 2 ? new Decimal(0) : values.at(-1)!.minus(values[0]);
}

function evaluateNode(node: FormulaNode, inputs: Record<string, FormulaInput>): Decimal {
  if (node.type === "literal") return new Decimal(node.value);
  if (node.type === "metric") {
    const values = inputs[node.key]?.values ?? [];
    if (values.length === 0) throw new ApiError(422, "FORMULA_MISSING_INPUT", `缺少指標${node.key}的資料。`);
    return new Decimal(values.at(-1)!);
  }
  if (node.type === "aggregate") {
    const values = (inputs[node.metricKey]?.values ?? []).map((value) => new Decimal(value));
    return aggregate(node.name, values);
  }
  const left = evaluateNode(node.left, inputs);
  const right = evaluateNode(node.right, inputs);
  if (node.operator === "+") return left.plus(right);
  if (node.operator === "-") return left.minus(right);
  if (node.operator === "*") return left.mul(right);
  if (right.isZero()) throw new ApiError(422, "FORMULA_DIVISION_BY_ZERO", "公式分母為零，結果不可計算。");
  return left.div(right);
}

export function evaluateFormula(
  metricKey: string,
  formulaVersion: number,
  expression: string,
  inputs: Record<string, FormulaInput>,
  options: { unit: string; precision: number; window: Record<string, unknown>; filters?: Record<string, unknown> },
): AnalyticResult & { ast: FormulaNode } {
  const ast = parseFormula(expression);
  const value = evaluateNode(ast, inputs).toDecimalPlaces(options.precision, Decimal.ROUND_HALF_UP).toFixed();
  const sourceRefs = Object.values(inputs).flatMap((input) => input.sourceRefs);
  const observationCount = Object.values(inputs).reduce((count, input) => count + input.values.length, 0);
  return {
    metricKey,
    formulaVersion,
    value,
    unit: options.unit,
    precision: options.precision,
    quality: "EXACT",
    sampleSize: Object.keys(inputs).length,
    observationCount,
    missingCount: 0,
    excludedCount: 0,
    window: options.window,
    filters: options.filters ?? {},
    grouping: [],
    aggregation: "FORMULA_AST",
    denominatorDefinition: expression.includes("/") ? "公式AST中的除法右側運算式" : null,
    sourceRefs,
    inputValues: Object.entries(inputs).flatMap(([key, input]) =>
      input.values.map((entry, index) => ({ key, value: entry, sourceRef: input.sourceRefs[index] ?? null })),
    ),
    calculatedAt: new Date().toISOString(),
    ast,
  };
}
