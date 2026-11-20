# Notices

Glance closes open loops. Gmail is where it starts today.

## DictaBERT-NER

Model: `dicta-il/dictabert-ner`
Revision: `05ed61bc99437b13bc2bdef8154c52f8b44eaad6`
Weights SHA-256 (`model.safetensors`): `beeea5e7bfb6a8acf6765abc22400b27d0ae88afb177a89009574ddc0c1f4188`
License: CC-BY-4.0

The weights run on Glance's own cloud. They are not downloaded to the browser and they are not fetched from a third-party model API at runtime. Attribution: Dicta, the Israel Association of Applied Linguistics.

## multilingual-e5-small

Model: `intfloat/multilingual-e5-small`
Revision: `614241f622f53c4eeff9890bdc4f31cfecc418b3`
Weights SHA-256 (`model.safetensors`): `1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477`
License: MIT

This is the offline fallback in the extension. The weights are not shipped. The cloud embedder is Qwen3-Embedding-0.6B.

## Qwen3-Embedding-0.6B

Model: `Qwen/Qwen3-Embedding-0.6B`
Revision: `97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3`
Weights SHA-256 (`model.safetensors`): `0437e45c94563b09e13cb7a64478fc406947a93cb34a7e05870fc8dcd48e23fd`
License: Apache-2.0

Runs on Glance's own cloud. Not shipped in the extension.

## DictaBERT-joint

Model: `dicta-il/dictabert-joint`
Revision: `7b1256fc0846e22d1af431eae299e2dcecee2778`
Weights SHA-256 (`model.safetensors`): `c59db02c002b69fd3c072c310e3ba578d036386477248d1c8576d896cc06aa1c`
License: CC-BY-4.0

Hebrew NER on Glance's cloud. Attribution: Dicta.

## libphonenumber-js

Package `libphonenumber-js@1.13.17`, MIT. Used only as the offline phone fallback. See `LICENSE.libphonenumber`.
