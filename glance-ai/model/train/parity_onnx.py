#!/usr/bin/env python3
"""Writes ONNX probabilities for the first N test rows so runtime/parity-check.cjs can compare the int8 JS runtime."""
import json, os, sys, numpy as np, onnxruntime as ort
sys.path.insert(0, os.path.dirname(__file__))
from train import load
v = sys.argv[1] if len(sys.argv) > 1 else 'v1'; N = 400
rows, X = load('test')
sess = ort.InferenceSession(os.path.join(os.path.dirname(__file__), '..', 'artifacts', v + '.onnx'), providers=['CPUExecutionProvider'])
labels = sess.run(None, {'x': X[:1].toarray().astype(np.float32)})
out = []
for s in range(0, N, 100):
    lab, P = sess.run(None, {'x': X[s:s+100].toarray().astype(np.float32)})
    for i in range(P.shape[0]): out.append({'id': rows[s+i]['id'], 'p': P[i].tolist()})
json.dump(out, open(os.path.join(os.path.dirname(__file__), '..', 'artifacts', v + '.onnx-probs.json'), 'w'))
print('wrote', len(out))
