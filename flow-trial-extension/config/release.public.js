// Store-build config. Marketing owns the privacy page. This file is the only
// place the extension reads that URL. scripts/build-prod.py rewrites BUILD_SHA
// in the packaged copy. An unpacked load keeps "dev".

export const PRIVACY_URL = 'https://theflow-ai.com/privacy';

export const REPORT_EMAIL = 'ai.local.flow@gmail.com';

export const BUILD_SHA = 'dev';
