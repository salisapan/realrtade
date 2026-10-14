# Shadow v2.1 report

Built 2026-10-07T22:00:39.056Z. Labels: product-correct reference (engine 0.9.35 clean render + rule overrides), NOT owner-verified. Minimal normalizer in front of every system (except "engine-0.9.35 raw"). Masked = unsure engine-recall-gap rows excluded; STRICT counts them as silences.

### (1) v2 held-out test (same rows and labels as the v2 report)

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 10.33 | 510 | 9.43 | 7.65 | 3.53 | 10.22 | 19 | 1.51 | 13 |
| engine-0.9.34+norm | 9.73 | 480 | 8.91 | 6.61 | 2.7 | 9.06 | 17 | 1.35 | 14 |
| engine-0.9.35+norm | 10.33 | 510 | 9.43 | 4.78 | 2.7 | 6.08 | 17 | 1.35 | 14 |
| engine-r35p+norm | 9.24 | 456 | 8.49 | 4.78 | 2.7 | 6.08 | 17 | 1.35 | 14 |
| v1+veto | 1.2 | 59 | 1.22 | 83.9 | 90.46 | 79.82 | 29 | 2.31 | 12 |
| v2+veto | 0.06 | 3 | 1.43 | 50.68 | 47.1 | 52.91 | 36 | 2.87 | 3 |
| v2.1-model-alone | 11.19 | 552 | 11.07 | 51 | 47.3 | 53.3 | 26 | 2.07 | 2 |
| v2.1+veto | 0.02 | 1 | 1.29 | 54.82 | 52.07 | 56.53 | 26 | 2.07 | 2 |
| v2.1+veto no-floor | 0.08 | 4 | 1.36 | 52.99 | 50.21 | 54.72 | 33 | 2.63 | 2 |

### v2 test, source=synthetic:v1-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 13.42 | 254 | 12.41 | 9.66 | 3.23 | 11.53 | 13 | 3.14 | 12 |
| engine-0.9.34+norm | 11.78 | 223 | 10.96 | 11.59 | 0 | 14.95 | 14 | 3.38 | 13 |
| engine-0.9.35+norm | 13.37 | 253 | 12.37 | 6.04 | 0 | 7.79 | 14 | 3.38 | 13 |
| engine-r35p+norm | 12.57 | 238 | 11.66 | 6.04 | 0 | 7.79 | 14 | 3.38 | 13 |
| v1+veto | 1.74 | 33 | 1.83 | 85.51 | 97.85 | 81.93 | 22 | 5.31 | 10 |
| v2+veto | 0.05 | 1 | 1.03 | 42.03 | 46.24 | 40.81 | 31 | 7.49 | 2 |
| v2.1-model-alone | 13.58 | 257 | 13.4 | 49.52 | 55.91 | 47.66 | 24 | 5.8 | 2 |
| v2.1+veto | 0.05 | 1 | 1.03 | 50.97 | 56.99 | 49.22 | 24 | 5.8 | 2 |
| v2.1+veto no-floor | 0.16 | 3 | 1.12 | 47.1 | 49.46 | 46.42 | 29 | 7 | 2 |

### v2 test, source=synthetic:v2-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 12.11 | 250 | 10.29 | 8.38 | 3.95 | 13.38 | 6 | 0.9 | 1 |
| engine-0.9.34+norm | 12.16 | 251 | 10.33 | 5.24 | 3.67 | 7.01 | 3 | 0.45 | 1 |
| engine-0.9.35+norm | 12.16 | 251 | 10.33 | 5.24 | 3.67 | 7.01 | 3 | 0.45 | 1 |
| engine-r35p+norm | 10.27 | 212 | 8.84 | 5.24 | 3.67 | 7.01 | 3 | 0.45 | 1 |
| v1+veto | 1.07 | 22 | 1.03 | 85.33 | 88.14 | 82.17 | 6 | 0.9 | 2 |
| v2+veto | 0 | 0 | 2.22 | 46.71 | 42.66 | 51.27 | 4 | 0.6 | 0 |
| v2.1-model-alone | 13.37 | 276 | 12.59 | 44.16 | 40.68 | 48.09 | 2 | 0.3 | 0 |
| v2.1+veto | 0 | 0 | 1.99 | 49.55 | 46.05 | 53.5 | 2 | 0.3 | 0 |
| v2.1+veto no-floor | 0 | 0 | 2.03 | 48.5 | 45.48 | 51.91 | 4 | 0.6 | 0 |

### v2 test, source=repo

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 0.35 | 2 | 0.35 | 0 | 0 | 0 | 0 | 0 | 0 |
| engine-0.9.34+norm | 0.35 | 2 | 0.35 | 0 | 0 | 0 | 0 | 0 | 0 |
| engine-0.9.35+norm | 0.35 | 2 | 0.35 | 0 | 0 | 0 | 0 | 0 | 0 |
| engine-r35p+norm | 0.35 | 2 | 0.35 | 0 | 0 | 0 | 0 | 0 | 0 |
| v1+veto | 0.17 | 1 | 0.17 | 90.32 | 100 | 85 | 1 | 1.61 | 0 |
| v2+veto | 0 | 0 | 0 | 98.39 | 100 | 97.5 | 1 | 1.61 | 1 |
| v2.1-model-alone | 0.69 | 4 | 0.69 | 91.94 | 90.91 | 92.5 | 0 | 0 | 0 |
| v2.1+veto | 0 | 0 | 0 | 95.16 | 100 | 92.5 | 0 | 0 | 0 |
| v2.1+veto no-floor | 0 | 0 | 0 | 95.16 | 100 | 92.5 | 0 | 0 | 0 |

### v2 test, source=repo-test-strings

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 1 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| engine-0.9.34+norm | 1 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| engine-0.9.35+norm | 1 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| engine-r35p+norm | 1 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| v1+veto | 0.75 | 3 | 0.75 | 65.77 | 84.62 | 63.27 | 0 | 0 | 0 |
| v2+veto | 0.5 | 2 | 0.5 | 80.18 | 84.62 | 79.59 | 0 | 0 | 0 |
| v2.1-model-alone | 3.75 | 15 | 3.75 | 74.77 | 92.31 | 72.45 | 0 | 0 | 0 |
| v2.1+veto | 0 | 0 | 0 | 78.38 | 100 | 75.51 | 0 | 0 | 0 |
| v2.1+veto no-floor | 0.25 | 1 | 0.25 | 78.38 | 100 | 75.51 | 0 | 0 | 0 |

### v2 test, lang=en

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 8.94 | 228 | 8.41 | 10.22 |  | 10.22 | 3 | 0.39 | 0 |
| engine-0.9.34+norm | 7.84 | 200 | 7.38 | 9.06 |  | 9.06 | 1 | 0.13 | 0 |
| engine-0.9.35+norm | 9.02 | 230 | 8.48 | 6.08 |  | 6.08 | 1 | 0.13 | 0 |
| engine-r35p+norm | 9.02 | 230 | 8.48 | 6.08 |  | 6.08 | 1 | 0.13 | 0 |
| v1+veto | 1.84 | 47 | 1.88 | 79.82 |  | 79.82 | 25 | 3.23 | 10 |
| v2+veto | 0.08 | 2 | 0.74 | 52.91 |  | 52.91 | 33 | 4.27 | 2 |
| v2.1-model-alone | 12.58 | 321 | 12.62 | 53.3 |  | 53.3 | 24 | 3.1 | 0 |
| v2.1+veto | 0.04 | 1 | 0.74 | 56.53 |  | 56.53 | 24 | 3.1 | 0 |
| v2.1+veto no-floor | 0.04 | 1 | 0.74 | 54.72 |  | 54.72 | 29 | 3.75 | 0 |

### v2 test, lang=he

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 11.83 | 282 | 10.34 | 3.53 | 3.53 |  | 16 | 3.32 | 13 |
| engine-0.9.34+norm | 11.74 | 280 | 10.28 | 2.7 | 2.7 |  | 16 | 3.32 | 14 |
| engine-0.9.35+norm | 11.74 | 280 | 10.28 | 2.7 | 2.7 |  | 16 | 3.32 | 14 |
| engine-r35p+norm | 9.48 | 226 | 8.49 | 2.7 | 2.7 |  | 16 | 3.32 | 14 |
| v1+veto | 0.5 | 12 | 0.63 | 90.46 | 90.46 |  | 4 | 0.83 | 2 |
| v2+veto | 0.04 | 1 | 2.06 | 47.1 | 47.1 |  | 3 | 0.62 | 1 |
| v2.1-model-alone | 9.69 | 231 | 9.68 | 47.3 | 47.3 |  | 2 | 0.41 | 2 |
| v2.1+veto | 0 | 0 | 1.79 | 52.07 | 52.07 |  | 2 | 0.41 | 2 |
| v2.1+veto no-floor | 0.13 | 3 | 1.92 | 50.21 | 50.21 |  | 4 | 0.83 | 2 |

### v2 test, format-sensitive rows

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 65.71 | 46 | 76 | 89.71 | 44.44 | 96.61 | 7 | 10.29 | 2 |
| engine-0.9.34+norm | 68.57 | 48 | 78 | 35.29 | 0 | 40.68 | 5 | 7.35 | 3 |
| engine-0.9.35+norm | 67.14 | 47 | 77 | 35.29 | 0 | 40.68 | 5 | 7.35 | 3 |
| engine-r35p+norm | 60 | 42 | 72 | 35.29 | 0 | 40.68 | 5 | 7.35 | 3 |
| v1+veto | 0 | 0 | 0 | 94.12 | 88.89 | 94.92 | 1 | 1.47 | 0 |
| v2+veto | 0 | 0 | 6 | 58.82 | 77.78 | 55.93 | 7 | 10.29 | 1 |
| v2.1-model-alone | 17.14 | 12 | 17 | 61.76 | 77.78 | 59.32 | 4 | 5.88 | 0 |
| v2.1+veto | 0 | 0 | 3 | 67.65 | 88.89 | 64.41 | 4 | 5.88 | 0 |
| v2.1+veto no-floor | 0 | 0 | 3 | 64.71 | 88.89 | 61.02 | 5 | 7.35 | 0 |

### v2 test, rule-corrected slices: wrong-Do-It %

| rule | engine-0.9.35 raw | engine-0.9.34+norm | engine-0.9.35+norm | engine-r35p+norm | v1+veto | v2+veto | v2.1-model-alone | v2.1+veto | v2.1+veto no-floor |
|---|---|---|---|---|---|---|---|---|---|
| cc-only | 90 | 90.91 | 93.64 | 93.64 | 10 | 0 | 50 | 0 | 0 |
| addressed-to-other | 93.7 | 92.13 | 94.49 | 94.49 | 17.32 | 0 | 58.66 | 0 | 0 |
| gmail-onedrive-target | 90.63 | 32.81 | 92.19 | 92.19 | 0 | 0 | 71.88 | 1.56 | 1.56 |
| outlook-onedrive-save | miss 47.62 | miss 42.86 | miss 42.86 | miss 42.86 | miss 100 | miss 47.62 | miss 33.33 | miss 33.33 | miss 23.81 |
| no-action-fyi | 90.74 | 100 | 100 | 0 | 0 | 0 | 0 | 0 | 0 |
| negated-save | 100 | 100 | 100 | 100 | 0 | 0 | 0 | 0 | 0 |
| marketing | 94.44 | 94.44 | 94.44 | 94.44 | 0 | 0 | 5.56 | 0 | 0 |

### (2) v2.1 new-shape slice (4127 rows from held-out frames)

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 7.62 | 205 | 6.45 | 7.39 | 7.45 | 7.34 | 9 | 1.48 | 5 |
| engine-0.9.34+norm | 6.91 | 186 | 5.91 | 8.37 | 7.09 | 9.48 | 9 | 1.48 | 5 |
| engine-0.9.35+norm | 7.58 | 204 | 6.42 | 6.57 | 7.09 | 6.12 | 9 | 1.48 | 5 |
| engine-r35p+norm | 7.06 | 190 | 6.03 | 6.57 | 7.09 | 6.12 | 9 | 1.48 | 5 |
| v1+veto | 2.16 | 58 | 2.7 | 76.35 | 82.27 | 71.25 | 16 | 2.63 | 4 |
| v2+veto | 0.33 | 9 | 2.19 | 59.44 | 58.16 | 60.55 | 17 | 2.79 | 5 |
| v2.1-model-alone | 11.33 | 305 | 11.17 | 55.5 | 57.45 | 53.82 | 14 | 2.3 | 4 |
| v2.1+veto | 0.41 | 11 | 2.79 | 61.9 | 63.48 | 60.55 | 14 | 2.3 | 4 |
| v2.1+veto no-floor | 0.41 | 11 | 3.04 | 60.1 | 61.7 | 58.72 | 19 | 3.12 | 8 |

### new shapes, subject-only:v1v2-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| engine-0.9.34+norm | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| engine-0.9.35+norm | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| engine-r35p+norm | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v1+veto | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2+veto | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2.1-model-alone | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2.1+veto | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2.1+veto no-floor | 0 | 0 | 0 |  |  |  | 0 |  | 0 |

### new shapes, bare:v1v2-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 11.57 | 116 | 9.75 | 1.33 | 1.46 | 1.22 | 6 | 1.99 | 4 |
| engine-0.9.34+norm | 11.07 | 111 | 9.35 | 3.32 | 1.46 | 4.88 | 6 | 1.99 | 4 |
| engine-0.9.35+norm | 11.47 | 115 | 9.67 | 1.33 | 1.46 | 1.22 | 6 | 1.99 | 4 |
| engine-r35p+norm | 10.07 | 101 | 8.54 | 1.33 | 1.46 | 1.22 | 6 | 1.99 | 4 |
| v1+veto | 2.79 | 28 | 2.9 | 72.09 | 75.18 | 69.51 | 10 | 3.32 | 0 |
| v2+veto | 0.1 | 1 | 2.66 | 43.85 | 37.96 | 48.78 | 13 | 4.32 | 1 |
| v2.1-model-alone | 14.16 | 142 | 13.94 | 45.51 | 36.5 | 53.05 | 10 | 3.32 | 0 |
| v2.1+veto | 0.2 | 2 | 2.58 | 51.5 | 44.53 | 57.32 | 10 | 3.32 | 0 |
| v2.1+veto no-floor | 0.2 | 2 | 2.66 | 50.17 | 42.34 | 56.71 | 13 | 4.32 | 2 |

### new shapes, subject-only:v21-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| engine-0.9.34+norm | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| engine-0.9.35+norm | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| engine-r35p+norm | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v1+veto | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2+veto | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2.1-model-alone | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2.1+veto | 0 | 0 | 0 |  |  |  | 0 |  | 0 |
| v2.1+veto no-floor | 0 | 0 | 0 |  |  |  | 0 |  | 0 |

### new shapes, bare:v21-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 5.65 | 49 | 4.91 | 11.56 | 13.98 | 9.43 | 2 | 1.01 | 1 |
| engine-0.9.34+norm | 4.72 | 41 | 4.26 | 13.07 | 13.98 | 12.26 | 2 | 1.01 | 1 |
| engine-0.9.35+norm | 5.65 | 49 | 4.91 | 11.56 | 13.98 | 9.43 | 2 | 1.01 | 1 |
| engine-r35p+norm | 5.65 | 49 | 4.91 | 11.56 | 13.98 | 9.43 | 2 | 1.01 | 1 |
| v1+veto | 2.42 | 21 | 3.62 | 74.87 | 84.95 | 66.04 | 6 | 3.02 | 4 |
| v2+veto | 0.23 | 2 | 2.41 | 72.86 | 73.12 | 72.64 | 3 | 1.51 | 3 |
| v2.1-model-alone | 11.75 | 102 | 11.75 | 65.83 | 76.34 | 56.6 | 3 | 1.51 | 3 |
| v2.1+veto | 0.35 | 3 | 3.78 | 72.86 | 79.57 | 66.98 | 3 | 1.51 | 3 |
| v2.1+veto no-floor | 0.35 | 3 | 4.1 | 70.35 | 77.42 | 64.15 | 5 | 2.51 | 5 |

### new shapes, email:v21-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 9.05 | 22 | 6.9 | 22.73 | 15 | 29.17 | 0 | 0 | 0 |
| engine-0.9.34+norm | 7.41 | 18 | 5.75 | 15.91 | 10 | 20.83 | 0 | 0 | 0 |
| engine-0.9.35+norm | 9.05 | 22 | 6.9 | 13.64 | 10 | 16.67 | 0 | 0 | 0 |
| engine-r35p+norm | 9.05 | 22 | 6.9 | 13.64 | 10 | 16.67 | 0 | 0 | 0 |
| v1+veto | 0.82 | 2 | 0.86 | 95.45 | 100 | 91.67 | 0 | 0 | 0 |
| v2+veto | 0.82 | 2 | 1.15 | 79.55 | 90 | 70.83 | 1 | 2.27 | 1 |
| v2.1-model-alone | 13.17 | 32 | 10.06 | 68.18 | 90 | 50 | 0 | 0 | 0 |
| v2.1+veto | 1.65 | 4 | 2.01 | 75 | 95 | 58.33 | 0 | 0 | 0 |
| v2.1+veto no-floor | 1.65 | 4 | 2.3 | 72.73 | 95 | 54.17 | 0 | 0 | 0 |

### new shapes, oneline:v21-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 7.02 | 8 | 7.14 | 8.33 | 0 | 16.67 | 0 | 0 | 0 |
| engine-0.9.34+norm | 7.02 | 8 | 7.14 | 12.5 | 0 | 25 | 0 | 0 | 0 |
| engine-0.9.35+norm | 7.89 | 9 | 7.86 | 8.33 | 0 | 16.67 | 0 | 0 | 0 |
| engine-r35p+norm | 7.89 | 9 | 7.86 | 8.33 | 0 | 16.67 | 0 | 0 | 0 |
| v1+veto | 4.39 | 5 | 4.29 | 91.67 | 91.67 | 91.67 | 0 | 0 | 0 |
| v2+veto | 1.75 | 2 | 3.57 | 87.5 | 91.67 | 83.33 | 0 | 0 | 0 |
| v2.1-model-alone | 8.77 | 10 | 7.86 | 54.17 | 58.33 | 50 | 1 | 4.17 | 1 |
| v2.1+veto | 0.88 | 1 | 1.43 | 66.67 | 75 | 58.33 | 1 | 4.17 | 1 |
| v2.1+veto no-floor | 0.88 | 1 | 2.86 | 66.67 | 75 | 58.33 | 1 | 4.17 | 1 |

### new shapes, core:v21-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 5.26 | 5 | 4.69 | 11.76 | 28.57 | 0 | 0 | 0 | 0 |
| engine-0.9.34+norm | 5.26 | 5 | 4.69 | 11.76 | 28.57 | 0 | 0 | 0 | 0 |
| engine-0.9.35+norm | 5.26 | 5 | 4.69 | 11.76 | 28.57 | 0 | 0 | 0 | 0 |
| engine-r35p+norm | 5.26 | 5 | 4.69 | 11.76 | 28.57 | 0 | 0 | 0 | 0 |
| v1+veto | 2.11 | 2 | 3.13 | 64.71 | 85.71 | 50 | 0 | 0 | 0 |
| v2+veto | 2.11 | 2 | 3.13 | 64.71 | 71.43 | 60 | 0 | 0 | 0 |
| v2.1-model-alone | 16.84 | 16 | 16.41 | 58.82 | 71.43 | 50 | 0 | 0 | 0 |
| v2.1+veto | 1.05 | 1 | 4.69 | 58.82 | 71.43 | 50 | 0 | 0 | 0 |
| v2.1+veto no-floor | 1.05 | 1 | 5.47 | 58.82 | 71.43 | 50 | 0 | 0 | 0 |

### new shapes, html:v21-frame

| system | wrong-Do-It % (masked) | n | STRICT % | missed % | HE missed % | EN missed % | wrong action n | wrong action % of ref shows | wrong step n |
|---|---|---|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 5.49 | 5 | 3.55 | 16.67 | 7.69 | 27.27 | 1 | 4.17 | 0 |
| engine-0.9.34+norm | 3.3 | 3 | 2.13 | 12.5 | 7.69 | 18.18 | 1 | 4.17 | 0 |
| engine-0.9.35+norm | 4.4 | 4 | 2.84 | 12.5 | 7.69 | 18.18 | 1 | 4.17 | 0 |
| engine-r35p+norm | 4.4 | 4 | 2.84 | 12.5 | 7.69 | 18.18 | 1 | 4.17 | 0 |
| v1+veto | 0 | 0 | 0.71 | 100 | 100 | 100 | 0 | 0 | 0 |
| v2+veto | 0 | 0 | 0.71 | 75 | 76.92 | 72.73 | 0 | 0 | 0 |
| v2.1-model-alone | 3.3 | 3 | 4.96 | 70.83 | 84.62 | 54.55 | 0 | 0 | 0 |
| v2.1+veto | 0 | 0 | 2.84 | 75 | 84.62 | 63.64 | 0 | 0 | 0 |
| v2.1+veto no-floor | 0 | 0 | 2.84 | 70.83 | 84.62 | 54.55 | 0 | 0 | 0 |

### (3) Adversarial (spec labels; AMBIGUOUS excluded)

| system | v1+v2 (72) correct | wDI | v21 bare (37) correct | wDI | all correct | wDI |
|---|---|---|---|---|---|---|
| engine-0.9.35 raw | 53/72 | 15 | 24/37 | 4 | 77/109 | 19 |
| engine-0.9.34+norm | 47/72 | 17 | 23/37 | 5 | 70/109 | 22 |
| engine-0.9.35+norm | 55/72 | 14 | 24/37 | 4 | 79/109 | 18 |
| engine-r35p+norm | 57/72 | 12 | 24/37 | 4 | 81/109 | 16 |
| v1+veto | 54/72 | 3 | 25/37 | 1 | 79/109 | 4 |
| v2+veto | 67/72 | 0 | 27/37 | 0 | 94/109 | 0 |
| v2.1-model-alone | 60/72 | 9 | 25/37 | 2 | 85/109 | 11 |
| v2.1+veto | 68/72 | 0 | 27/37 | 0 | 95/109 | 0 |
| v2.1+veto no-floor | 68/72 | 0 | 28/37 | 0 | 96/109 | 0 |

| case | expect | engine-0.9.35 raw | engine-0.9.34+norm | engine-0.9.35+norm | engine-r35p+norm | v1+veto | v2+veto | v2.1-model-alone | v2.1+veto | v2.1+veto no-floor |
|---|---|---|---|---|---|---|---|---|---|---|
| adv-od-save-4 | file_save | file_save | **SILENT** | file_save | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv-od-noatt | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | **file_save** | SILENT | SILENT |
| adv-drive-pos | file_save | file_save | file_save | file_save | file_save | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv-cancel-1 | AMBIGUOUS | **calendar** | **calendar** | **calendar** | **calendar** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv-3p-1 | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | **draft** | SILENT | SILENT |
| adv-self-out | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | **draft** | SILENT | SILENT |
| adv-self-out-o | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | **draft** | SILENT | SILENT |
| adv2-to-other-en | SILENT | **draft** | **draft** | **draft** | **draft** | **draft** | SILENT | **draft** | SILENT | SILENT |
| adv2-to-other-he | SILENT | **draft** | **draft** | **draft** | **draft** | SILENT | SILENT | **draft** | SILENT | SILENT |
| adv2-cc-only-en | SILENT | **draft** | **draft** | **draft** | **draft** | SILENT | SILENT | **draft** | SILENT | SILENT |
| adv2-cc-only-he | SILENT | **draft** | **draft** | **draft** | **draft** | **draft** | SILENT | **draft** | SILENT | SILENT |
| adv2-to-none-en | draft | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | draft | **SILENT** | **SILENT** |
| adv2-gmail-od-1 | SILENT | **file_save** | SILENT | **file_save** | **file_save** | SILENT | SILENT | **file_save** | SILENT | SILENT |
| adv2-outlook-od-he | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv2-file-ask-he | AMBIGUOUS | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv2-he-meet | calendar | calendar | calendar | calendar | calendar | **SILENT** | **SILENT** | calendar | calendar | calendar |
| adv21-b-en-confirm | draft | draft | draft | draft | draft | draft | draft | draft | draft | draft |
| adv21-b-en-approve | draft | **task** | **task** | **task** | **task** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-en-getback | draft | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-en-review | draft | **SILENT** | **SILENT** | **SILENT** | **SILENT** | draft | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-en-lower | draft | draft | draft | draft | draft | draft | draft | draft | draft | draft |
| adv21-b-en-meet | calendar | calendar | calendar | calendar | calendar | **SILENT** | calendar | calendar | calendar | calendar |
| adv21-b-en-call | calendar | calendar | calendar | calendar | calendar | **SILENT** | calendar | **SILENT** | **SILENT** | calendar |
| adv21-b-en-drive | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-en-onedrive | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | file_save | file_save | file_save | file_save |
| adv21-b-he-approve | draft | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-he-getback | draft | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-he-confirm | draft | draft | draft | draft | draft | **calendar** | **SILENT** | draft | draft | draft |
| adv21-b-he-meet | calendar | calendar | calendar | calendar | calendar | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-he-drive | file_save | file_save | file_save | file_save | file_save | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-he-onedrive | file_save | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-b-he-rlm | draft | **calendar** | **calendar** | **calendar** | **calendar** | draft | draft | draft | draft | draft |
| adv21-s-en-thanks | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-sounds | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-dont | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-nopay | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-nosave | SILENT | SILENT | **file_save** | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-fyi | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-paid | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-cancel | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-hedge | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-other | SILENT | **draft** | **draft** | **draft** | **draft** | **draft** | SILENT | **draft** | SILENT | SILENT |
| adv21-s-en-cc | SILENT | **draft** | **draft** | **draft** | **draft** | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-gmail-od | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-en-mkt | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-he-thanks | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-he-dont | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-he-fyi | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-he-paid | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-he-cancel | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-he-other | SILENT | **draft** | **draft** | **draft** | **draft** | SILENT | SILENT | **draft** | SILENT | SILENT |
| adv21-s-he-hedge | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-s-he-mkt | SILENT | **calendar** | **calendar** | **calendar** | **calendar** | SILENT | SILENT | SILENT | SILENT | SILENT |
| adv21-a-en-subj | AMBIGUOUS | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-a-he-subj | AMBIGUOUS | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |
| adv21-a-en-file | AMBIGUOUS | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** | **SILENT** |

### (4) OSS-worker eval (275, binary)

| system | wrong-Do-It | missed % | HE missed % |
|---|---|---|---|
| engine-0.9.35 raw | 15/167 | 21.3 | 36 |
| engine-0.9.34+norm | 16/167 | 24.07 | 36 |
| engine-0.9.35+norm | 15/167 | 21.3 | 36 |
| engine-r35p+norm | 15/167 | 21.3 | 36 |
| v1+veto | 4/167 | 72.22 | 82 |
| v2+veto | 0/167 | 59.26 | 64 |
| v2.1-model-alone | 12/167 | 52.78 | 64 |
| v2.1+veto | 0/167 | 59.26 | 66 |
| v2.1+veto no-floor | 0/167 | 51.85 | 58 |

## Lists

### v2.1+veto wrong-Do-Its, v2 test (masked) (1)

- `v2syn-3005` [en] ref=SILENT pred=drive-file|file_save p=0.863 — "Hello,\r\n \r\n\r\nPlease svae this attachment to OneDrive.\r\n \r\nThanks!\r\nBilling\r\n\r\n[image: logo]\r\nBilling\r\nHead of Ops | Northwind\r\n+972-54-1055433\r\n\r\nCONFIDENTIALITY NOTICE: This e-mail and any attachment"

### v2+veto wrong-Do-Its, v2 test (masked; minimal-normalized input) (3)

- `v2syn-9371` [he] ref=SILENT pred=calendar-hold|calendar p=0.994 — "בבקשה לצרף את טופס 101 לזימון של הדמו ביום שני בשעה 9:00."
- `v2rtest-close-families-corpus-128` [en] ref=SILENT pred=confirmed-amount|task p=0.829 — "Confirming the fee is about $4,200."
- `v2rtest-intent-actions-corpus-1122` [en] ref=SILENT pred=commitment|task p=0.605 — "As a reminder, you agreed to send the invoice by Friday, September 18."

### v2.1+veto wrong-Do-Its, new-shape slice (11)

- `v21syn-8287` [he] ref=SILENT pred=drive-file|file_save p=0.964 — "נא לשמר את הקבץ המצורף ב-OneDrive."
- `v21syn-16359` [he] ref=SILENT pred=follow-up-ask|draft p=0.99 — "נשמח אם תוכלו לההעביר אליי את ה-NDA ASAP?"
- `v21syn-29969` [en] ref=SILENT pred=dated-commitment|task p=0.958 — "Sali, paid $500 by November 2"
- `v21syn-30216` [en] ref=SILENT pred=event|calendar p=0.983 — "Hey,\n\nCalling off October 12's review meeting\n\nCheers,\nMichael"
- `v21syn-30221` [en] ref=SILENT pred=event|calendar p=0.962 — "Sali, calling off tomorrow's call Best"
- `v21syn-30228` [en] ref=SILENT pred=event|calendar p=0.992 — "Hi Sali,\n\nCalling off October 19's review meeting\n\nThanks,\nBilling"
- `v21syn-30249` [en] ref=SILENT pred=event|calendar p=0.986 — "Calling off October 19's review meeting"
- `v21syn-31782` [he] ref=SILENT pred=drive-file|file_save p=0.954 — "סאלי, להעלות את המצורף בדרייב\n\nתודה,\nדנה\n\n--\nדנה לוי\nיועצת משפטית | גלובקס\n054-1055433\nwww.acme.co.il"
- `v21syn-31783` [he] ref=SILENT pred=drive-file|file_save p=0.97 — "סאלי, להעלות את המצורף בגוגל דרייב"
- `v21syn-31810` [he] ref=SILENT pred=drive-file|file_save p=0.859 — "שלום,\n\nלהעלות את המצורף בדרייב\n\nתודה,\nמיכאל"
- `v21syn-31811` [he] ref=SILENT pred=drive-file|file_save p=0.98 — "להעלות את המצורף בדרייב"

### v2.1+veto wrong actions, v2 test (26)

- `v2syn-773` [en] ref=dated-commitment|task pred=commitment|task p=0.996 — "Hi team,\n \n\nAs agreed, you will send the insurance certificate by EOD.\n \nCheers,\nEthan\n\n[image: logo]\nEthan Hunt\nAccount Manager | Northwind\n+972-54-1079190\n\nCONFIDENTIALITY NOTICE: This e-mail and an"
- `v2syn-774` [en] ref=dated-commitment|task pred=commitment|task p=0.997 — "Hey Sali,\r\n \r\n\r\nAs agreed, you will send the W-9 form by Oct 20.\r\n \r\nCheers,\r\nBilling\r\n\r\n[image: logo]\r\nBilling\r\nHead of Ops | Northwind\r\n+972-54-1055433\r\n\r\nCONFIDENTIALITY NOTICE: This e-mail and any"
- `v2syn-777` [en] ref=dated-commitment|task pred=commitment|task p=0.99 — "Hi team,\n \n\nAs agreed, you will send the SOW by October 15.\n \nMany thanks,\nDana\n\n[image: logo]\nDana Levi\nProduct Lead | Acme Ltd\n+972-54-1071271\n\nCONFIDENTIALITY NOTICE: This e-mail and any attachment"
- `v2syn-778` [en] ref=dated-commitment|task pred=commitment|task p=0.993 — "Good morning Sali, As agreed, you will send the Q3 report by November 2. Thank you"
- `v2syn-781` [en] ref=dated-commitment|task pred=commitment|task p=0.993 — "Sali, as agreed, you will send the lease next Tuesday.\n\nMany thanks,\nSarah"
- `v2syn-782` [en] ref=dated-commitment|task pred=commitment|task p=0.975 — "Hi,\r\n \r\n\r\nAs agreed, you will send the price quote by Oct 20.\r\n \r\nThanks,\r\nMichael\r\n\r\n[image: logo]\r\nMichael Ross\r\nHead of Ops | Acme Ltd\r\n+972-54-1095028\r\n\r\nCONFIDENTIALITY NOTICE: This e-mail and an"
- `v2syn-784` [en] ref=dated-commitment|task pred=commitment|task p=0.985 — "As agreed, you will send the price quote before Sunday. Cheers"
- `v2syn-786` [en] ref=dated-commitment|task pred=commitment|task p=0.99 — "Hey, As agreed, you will send the NDA next Tuesday. Regards"
- `v2syn-787` [en] ref=dated-commitment|task pred=commitment|task p=0.994 — "Hi there,\n\nAs agreed, you will send the W-9 before Sunday.\n\nMany thanks,\nSarah\n\n--\nSarah Cohen\nCFO | Globex Inc.\n+972-54-1087109"
- `v2syn-789` [en] ref=dated-commitment|task pred=commitment|task p=0.968 — "As agreed, you will send the insurance certificate on Monday."
- `v2syn-791` [en] ref=dated-commitment|task pred=commitment|task p=0.998 — "Hey,\n\nAs agreed, you will send the W-9 by November 2.\n\nBest,\nSarah\n\n--\nSarah Cohen\nCFO | Globex Inc.\n+972-54-1087109"
- `v2syn-793` [en] ref=dated-commitment|task pred=commitment|task p=0.96 — "Hey, Hope you are well. As agreed, you will send the NDA before Sunday. Best regards"
- `v2syn-794` [en] ref=dated-commitment|task pred=commitment|task p=0.998 — "Sali, as agreed, you will send the W-9 form by EOD. Thanks"
- `v2syn-795` [en] ref=dated-commitment|task pred=commitment|task p=0.994 — "Hi,\n\nAs agreed, you will send the quarterly report by Thursday.\n\nBest regards,\nBilling\n\n--\nBilling\nHead of Ops | Northwind\n+972-54-1055433"
- `v2syn-796` [en] ref=dated-commitment|task pred=commitment|task p=0.998 — "Hi,\r\n\r\nAs agreed, you will send the proposal next Tuesday.\r\n\r\nThanks,\r\nMichael"
- `v2syn-797` [en] ref=dated-commitment|task pred=commitment|task p=0.983 — "As agreed, you will send the expense report by October 15.\n\nBest,\nSali\n\n--\nSali Sapan\nAccount Manager | Northwind\n+972-54-1079190"
- `v2syn-799` [en] ref=dated-commitment|task pred=commitment|task p=0.99 — "Hi team,\n \n\nAs agreed, you will send the quarterly report by October 15.\n \nThanks!\nSarah\n\n[image: logo]\nSarah Cohen\nCFO | Globex Inc.\n+972-54-1087109\n"
- `v2syn-800` [en] ref=dated-commitment|task pred=commitment|task p=0.987 — "Hello,\n\nAs agreed, you will send the onboarding checklist before Sunday.\n\nMany thanks,\nMichael"
- `v2syn-801` [en] ref=dated-commitment|task pred=commitment|task p=0.989 — "Good morning,\r\n\r\nAs agreed, you will send the invoice by Oct 20.\r\n\r\nMany thanks,\r\nMichael\r\n\r\n--\r\nMichael Ross\r\nHead of Ops | Acme Ltd\r\n+972-54-1095028"
- `v2syn-802` [en] ref=dated-commitment|task pred=commitment|task p=0.989 — "Hello,\n\nAs agreed, you will send the deck by October 15.\n\nThank you,\nEthan\n\n--\nEthan Hunt\nAccount Manager | Northwind\n+972-54-1079190"
- `v2syn-803` [en] ref=dated-commitment|task pred=commitment|task p=0.988 — "Hi there, As agreed, you will send the board memo before Sunday. Many thanks"
- `v2syn-804` [en] ref=dated-commitment|task pred=commitment|task p=0.999 — "Sali, as agreed, you will send the invoice by EOD.\n\nCheers,\nTom\n\nSent from my iPhone"
- `v2syn-9015` [he] ref=follow-up-ask|draft pred=drive-file|file_save p=0.899 — "נא לשמור את הקובץ המצורף ב-OneDrive.\n\nתודה,\nSali\n\n--\nSali Sapan\nמנהל תפעול | גלובקס\n054-1079190\nwww.acme.co.il"
- `v2syn-9016` [he] ref=follow-up-ask|draft pred=drive-file|file_save p=0.868 — "נא לשמור את הקובץ המצרפ ב-OneDrive.\n\nתודה,\nSali\n\n--\nSali Sapan\nמנהל תפעול | גלובקס\n054-1079190\nwww.acme.co.il"
- `v2syn-13314` [en] ref=calendar-hold|calendar pred=event|calendar p=0.958 — "Good morning,\n\nPlease set up a kickoff October 19 at 9am\n\nThanks,\nMichael\n\n--\nMichael Ross\nHead of Ops | Acme Ltd\n+972-54-1095028"
- `v2syn-13315` [en] ref=calendar-hold|calendar pred=event|calendar p=0.969 — "Please set up a demo Monday at 16:00\n\nMany thanks,\nEthan"
