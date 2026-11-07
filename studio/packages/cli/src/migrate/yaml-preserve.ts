// Rewrites a YAML document with the translated keys/values while keeping its comments and flow style:
// the parsed document and the translated JS object have the same shape (the translators only rename keys and map values), so the two are walked together.
import YAML from "yaml";

/** Returns the YAML text with the structure of `translated` (a key-renamed copy of the parsed `original`); falls back to a plain dump when the shapes drifted apart. */
export function rewriteYaml(text: string, translate: (value: any) => any): { text: string; preserved: boolean } {
  const doc = YAML.parseDocument(text);
  const original = doc.toJS();
  const translated = translate(JSON.parse(JSON.stringify(original)));
  const ok = align(doc.contents, translated);
  if (ok) return { text: String(doc), preserved: true };
  return { text: YAML.stringify(translated), preserved: false };
}

function align(node: any, value: any): boolean {
  if (YAML.isMap(node)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    if (entries.length !== node.items.length) return false;
    for (let i = 0; i < entries.length; i++) {
      const pair: any = node.items[i], [k, v] = entries[i]!;
      if (YAML.isScalar(pair.key)) pair.key.value = k;
      else pair.key = k;
      if (pair.value && !align(pair.value, v)) return false;
    }
    return true;
  }
  if (YAML.isSeq(node)) {
    if (!Array.isArray(value) || value.length !== node.items.length) return false;
    return node.items.every((it: any, i: number) => align(it, value[i]));
  }
  if (YAML.isScalar(node)) { if (node.value !== value) node.value = value; return !(value !== null && typeof value === "object"); }
  return node === null && value === null;
}
