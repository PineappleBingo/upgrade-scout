// upgrade-scout — Workflow 템플릿(사용자가 워크플로를 명시적으로 요청했을 때만).
// 쓰기 전에 workflow-authoring 스킬을 로드해 API를 확인할 것. 이 파일은 그 스킬의 기본 모양(agent·parallel·pipeline·phase)만 쓴다.
// 워크플로 스크립트는 파일을 읽을 수 없으므로 메인 세션이 args로 모든 입력을 넘긴다:
//   args = { asOf, target, depth, capabilityRefs, pack, pluginScope, lenses, designPrinciples, caps: { concurrency: 3 },
//            briefs: { <role>: "<_preamble + 역할 브리프 전문>" }, schemas: { <role>: <JSON Schema> },
//            candidates: [{ name, path|url }], designRefs: [{ title, ref, excerpt }], inputs: { inventory, judgmentPoints, needs } }
// 규칙: 한 웨이브 동시 3–4개(깊이 deep만 4). 버린 것은 반드시 log()로 남긴다. Date.now()·Math.random() 금지.
export const meta = {
  name: 'upgrade-scout',
  description: 'Map the target, review candidate repos, run the capability analysis and plugin scouting, then verify and blind-score',
  phases: [{ title: 'Map' }, { title: 'Review' }, { title: 'Design' }, { title: 'Capability' }, { title: 'Plugins' }, { title: 'Verify' }],
};

const CAP = Math.max(1, Math.min(4, args.caps?.concurrency ?? 3));
const brief = (role, input) => `${args.briefs[role]}\n\n입력(JSON):\n${JSON.stringify(input)}\n\n반드시 json 블록 하나로만 답한다.`;

async function inBatches(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += CAP) {
    const batch = items.slice(i, i + CAP);
    out.push(...(await parallel(batch.map((it) => () => fn(it)))));
  }
  return out;
}

phase('Map');
const map = await agent(brief('target-cartographer', { target: args.target, lens: 'all', lenses: args.lenses || [], design_principles: args.designPrinciples || [], inputs: args.inputs }), { label: 'map', phase: 'Map', schema: args.schemas['target-cartographer'] });

phase('Review');
const maxRepos = args.depth === 'deep' ? 8 : args.depth === 'quick' ? 1 : 5;
const repos = args.candidates.slice(0, maxRepos);
if (args.candidates.length > repos.length) log(`후보 ${args.candidates.length - repos.length}개를 깊이 상한으로 제외: ${args.candidates.slice(maxRepos).map((c) => c.name).join(', ')}`);
const reviews = await inBatches(repos, (c) => agent(brief('repo-reviewer', { repo: c, target_summary: map }), { label: `review:${c.name}`, phase: 'Review', schema: args.schemas['repo-reviewer'] }));

phase('Design');
const designs = await inBatches(args.designRefs || [], (d) => agent(brief('design-mapper', { doc: d, target_summary: map }), { label: `design:${d.title}`, phase: 'Design', schema: args.schemas['design-mapper'] }));

phase('Capability');
const capability = args.capabilityRefs?.length ? await agent(brief('capability-analyst', { map, points: args.inputs.judgmentPoints, refs: args.capabilityRefs, pack: args.pack || null }), { label: 'capability', phase: 'Capability', schema: args.schemas['capability-analyst'] }) : null;

phase('Plugins');
const scouting = args.pluginScope === 'off' ? null : await agent(brief('plugin-skill-scout', { needs: args.inputs.needs }), { label: 'plugins', phase: 'Plugins', schema: args.schemas['plugin-skill-scout'] });

phase('Verify');
const claims = [...reviews, ...designs].flatMap((r) => r?.claims || []).filter((c) => ['absence', 'number', 'license'].includes(c.kind)).slice(0, args.depth === 'deep' ? 30 : 15);
const [checks, blind] = await parallel([
  () => agent(brief('verifier', { claims }), { label: 'verify', phase: 'Verify', schema: args.schemas.verifier }),
  () => agent(brief('blind-scorer', { items: [...reviews.flatMap((r) => r?.review?.items || []), ...designs.flatMap((d) => d?.mapping?.missing_pieces || [])].map(({ fit, cost, risk, ...rest }) => rest) }), { label: 'blind', phase: 'Verify', schema: args.schemas['blind-scorer'] }),
]);

return { outputs: { map, reviews, designs, capability, scouting, checks, blind }, dropped: args.candidates.slice(maxRepos).map((c) => c.name) };
