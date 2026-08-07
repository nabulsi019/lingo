# MyLingo

Browser-based real-time sign language recognition app. No backend — everything runs client-side.

## Stack

- **Frontend:** React + Vite (`~/Desktop/lingo`)
- **Hand tracking:** MediaPipe Holistic (landmark extraction in the browser)
- **ML training:** Python environment at `~/Desktop/mylingo-ml` (venv with TensorFlow 2.15, MediaPipe 0.10.14, tensorflowjs 4.14)
- **Inference:** TensorFlow.js graph model served from `public/asl_model/`

## Three-tier classifier

Live hand landmarks are passed through three classifiers in priority order:

1. **Google GestureRecognizer** — built-in common gestures
2. **Custom gestures** (`src/logic/customGestureManager.js`) — user-recorded gestures matched by nearest-neighbor distance on normalized 2D landmarks, stored in localStorage
3. **ASL alphabet model** (`src/logic/aslClassifier.js`) — TensorFlow.js model trained by `~/Desktop/mylingo-ml/train.py` on the Kaggle ASL alphabet dataset. 24 classes (A–Z minus J and Z, which require motion and cannot be classified from a single frame)

## CRITICAL: normalization must stay in sync

`normalize_landmarks()` in `~/Desktop/mylingo-ml/train.py` and `normalizeLandmarks()` in `src/logic/aslClassifier.js` implement the same math (wrist-relative translation, scaled by wrist→middle-finger-base distance, x/y/z for landmarks 0–20 in order, 63 features). They MUST produce bit-for-bit equivalent output. If they diverge, the model predicts confidently and wrongly with no error thrown. Any change to one must be mirrored in the other, and the model must be retrained if training-side normalization changes.

## Model update workflow

1. Run `train.py` in the mylingo-ml venv (trains, evaluates, converts to TensorFlow.js)
2. Copy `model.json`, the `.bin` weight shard(s), and `labels.json` from `~/Desktop/mylingo-ml/model/tfjs_model/` (and `labels.json` from `~/Desktop/mylingo-ml/model/`) into `public/asl_model/`

## Reporting

Every response should report: what was built, which files changed, and what problems came up.
