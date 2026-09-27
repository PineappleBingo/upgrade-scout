// 작은 JSON Schema 검증기 — type · properties · required · additionalProperties · enum · const · items ·
// min/maxItems · minimum/maximum · min/maxLength · pattern · anyOf · 로컬 $ref(#/$defs/…). 외부 의존 없음.
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

function matchesType(v, t) {
  const actual = typeOf(v);
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

export function validate(schema, value, root = schema, at = '$') {
  const errs = [];
  if (!schema || typeof schema !== 'object') return errs;
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
    if (!target) return [`${at}: $ref ${schema.$ref}를 찾을 수 없다`];
    return validate(target, value, root, at);
  }
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validate(s, value, root, at).length === 0);
    if (!ok) errs.push(`${at}: anyOf 중 맞는 것이 없다`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) return [...errs, `${at}: ${types.join('|')} 이어야 하는데 ${typeOf(value)}`];
  }
  if (schema.const !== undefined && value !== schema.const) errs.push(`${at}: ${JSON.stringify(schema.const)} 이어야 한다`);
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: ${schema.enum.join('|')} 중 하나여야 한다 (${JSON.stringify(value)})`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${at}: 길이 ≥ ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errs.push(`${at}: 길이 ≤ ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${at}: /${schema.pattern}/ 형식이 아니다`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${at}: ≥ ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${at}: ≤ ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${at}: 항목 ≥ ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${at}: 항목 ≤ ${schema.maxItems}`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(schema.items, v, root, `${at}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${at}: 필수 키 ${k}가 없다`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errs.push(...validate(props[k], v, root, `${at}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${at}: 모르는 키 ${k}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errs.push(...validate(schema.additionalProperties, v, root, `${at}.${k}`));
    }
  }
  return errs;
}
