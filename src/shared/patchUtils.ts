/* Helpers for webpack code patches (dependency-free so they can be unit tested). */

/**
 * Discord's chunks use METHOD SHORTHAND factories (`247775(e,t,n){...}`), whose source is
 * not a valid standalone expression. Turn it into a function expression before eval.
 */
export function toFunctionExpression(src: string): string {
    const s = src.trimStart();
    if (/^(?:async\s+)?function[\s*(]/.test(s) || /^\(?[\w$,\s]*\)?\s*=>/.test(s) || s.startsWith("class")) return s;
    const m = /^(async\s+)?(\*?)\s*(?:[\w$]+|\[[^\]]*\]|"[^"]*"|'[^']*')\s*\(/.exec(s);
    return m ? `${m[1] ?? ""}function${m[2]} ${s.slice(m[0].length - 1)}` : s;
}
