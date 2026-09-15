const PLANS = Object.freeze({
  free: Object.freeze({
    id: 'free',
    name: 'Free',
    description: 'For getting started with Global AI Assistant.',
    chats: 100,
    inputChars: 800000,
    outputChars: 1200000
  }),
  pro: Object.freeze({
    id: 'pro',
    name: 'Pro',
    description: 'For heavy everyday AI use.',
    chats: 1000,
    inputChars: 8000000,
    outputChars: 12000000
  })
});

export function normalizePlan(value) {
  const plan = String(value || '').toLowerCase();
  return Object.hasOwn(PLANS, plan) ? plan : 'free';
}

export function getPlan(value) {
  return PLANS[normalizePlan(value)];
}

export function listPlans() {
  return Object.values(PLANS).map(plan => ({ ...plan }));
}

export function planLimits(planId) {
  const plan = getPlan(planId);
  return { chats: plan.chats, inputChars: plan.inputChars, outputChars: plan.outputChars };
}
