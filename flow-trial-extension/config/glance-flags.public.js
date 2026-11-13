// Public verify key for https://theflow-ai.com/glance-flags.json (chat lane remote kill switch).
// Regenerate the signature with scripts/sign-glance-flags.cjs and owner-held PEM (never commit the private key).
export const GLANCE_FLAGS_URL = 'https://theflow-ai.com/glance-flags.json';
export const GLANCE_FLAGS_PUBLIC_JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'OcCdKPFVOWtwKgvM8K2yvjelXtGar-qud7S7tonAjBc',
  y: 'oyDDhiDmGAlchQa2nl4nhi2Vv3csp2BAcg6eBiXU76Y'
};
