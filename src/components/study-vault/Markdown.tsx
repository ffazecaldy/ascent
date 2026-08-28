"use client";

// ============================================================
// ASCEND — Study Vault: mini renderer markdown ZERO dipendenze
// Supporta: ## / ### headers, elenchi puntati (- e *), tabelle
// markdown (| a | b | con riga separatoria ---), **bold**,
// *italic* / _italic_, paragrafi e line break dentro il paragrafo.
// Niente dangerouslySetInnerHTML: tutto parsing React sicuro.
// ============================================================

import React from "react";

/** Rendering inline di un segmento di testo: bold e italic (asterischi/underscore). */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  // split con capture: le posizioni dispari sono i delimitatori trovati
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-i${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (
      ((part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))) &&
      part.length > 2
    ) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part.length ? <React.Fragment key={key}>{part}</React.Fragment> : null;
  });
}

/** Riga è una voce di elenco puntato ("- " o "* ")? */
function isBullet(line: string): boolean {
  return /^[ \t]*[-*][ \t]+/.test(line);
}

function bulletText(line: string): string {
  return line.replace(/^[ \t]*[-*][ \t]+/, "");
}

/** Riga è una riga di tabella markdown? */
function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

interface Block {
  type: "h2" | "h3" | "ul" | "table" | "p";
  lines: string[];
}

/** Raggruppa le righe in blocchi coerenti (headers, liste, tabelle, paragrafi). */
function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue; // riga vuota: la vuotatezza la gestisce il renderer (spaziatura)
    const isH3 = /^###\s+/.test(t);
    const isH2 = !isH3 && /^##\s+/.test(t);
    const isSep = !isH2 && !isH3 && isSeparatorRow(t);
    const isRow = !isH2 && !isH3 && !isSep && isTableRow(t);
    const isBul = !isH2 && !isH3 && !isSep && !isRow && isBullet(t);
    const last = blocks[blocks.length - 1];
    const continueable =
      last != null &&
      ((isRow && last.type === "table") ||
        (isSep && last.type === "table") ||
        (isBul && last.type === "ul") ||
        (!isH2 && !isH3 && !isSep && !isRow && !isBul && last.type === "p"));

    if (continueable && last) {
      if (isBul) last.lines.push(bulletText(t));
      else last.lines.push(t);
    } else if (isH3) {
      blocks.push({ type: "h3", lines: [t.replace(/^###\s+/, "")] });
    } else if (isH2) {
      blocks.push({ type: "h2", lines: [t.replace(/^##\s+/, "")] });
    } else if (isSep) {
      // separatoria orfana (fuori da una tabella): ignorata
    } else if (isRow) {
      blocks.push({ type: "table", lines: [t] });
    } else if (isBul) {
      blocks.push({ type: "ul", lines: [bulletText(t)] });
    } else {
      blocks.push({ type: "p", lines: [t] });
    }
  }
  return blocks;
}

const thtd =
  "[&_th,td]:border [&_th,td]:border-border [&_th,td]:px-2 [&_th,td]:py-1";

export default function Markdown({ text }: { text: string }) {
  const blocks = parseBlocks(text ?? "");
  if (!blocks.length) return null;

  return (
    <div className="space-y-1">
      {blocks.map((b, i) => {
        const key = `b${i}`;
        if (b.type === "h2") {
          return (
            <h3
              key={key}
              className="mb-1.5 mt-4 text-base font-bold text-foreground first:mt-0"
            >
              {renderInline(b.lines[0], key)}
            </h3>
          );
        }
        if (b.type === "h3") {
          return (
            <h4
              key={key}
              className="mb-1 mt-3 text-sm font-semibold text-foreground first:mt-0"
            >
              {renderInline(b.lines[0], key)}
            </h4>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={key} className="mb-3 list-disc space-y-1 pl-5">
              {b.lines.map((li, j) => (
                <li key={`${key}-${j}`} className="text-[13px] leading-relaxed text-secondary-text">
                  {renderInline(li, `${key}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === "table") {
          const rows = b.lines.filter((l) => !isSeparatorRow(l));
          const header = rows[0] ? splitRow(rows[0]) : [];
          const body = rows.slice(1).map(splitRow);
          return (
            <table
              key={key}
              className={`mb-3 w-full border-collapse text-[12px] [&_th]:bg-elevated [&_th]:text-left ${thtd}`}
            >
              {header.length > 0 && (
                <thead>
                  <tr>
                    {header.map((c, j) => (
                      <th key={`h${j}`} className="font-semibold text-foreground">
                        {renderInline(c, `h${j}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {body.map((cells, r) => (
                  <tr key={`r${r}`}>
                    {cells.map((c, j) => (
                      <td key={`r${r}c${j}`} className="align-top text-secondary-text">
                        {renderInline(c, `r${r}c${j}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }
        // paragrafo: line break singolo dentro il paragrafo
        return (
          <p key={key} className="text-[13px] leading-relaxed text-secondary-text">
            {b.lines.map((l, j) => (
              <React.Fragment key={`${key}-l${j}`}>
                {j > 0 && <br />}
                {renderInline(l, `${key}-l${j}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
