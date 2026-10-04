# MyLingo

Real-time ASL alphabet and gesture recognition that speaks what you sign — entirely in the browser, no backend.

## Overview

MyLingo watches a webcam feed, tracks hand landmarks on-device, and converts recognized signs into spoken words via text-to-speech. It's built for ASL signers who want to communicate with people who don't sign, and for anyone learning the ASL alphabet — sign to the camera, and MyLingo speaks it aloud. Nothing leaves the browser: hand tracking, classification, and speech synthesis all run client-side.

## Live demo

[lingo-sage-chi.vercel.app](https://lingo-sage-chi.vercel.app)

## Features

- **Three-tier gesture recognition** (`src/App.jsx`), checked in priority order every frame:
  1. A custom-trained TensorFlow.js model for the ASL alphabet
  2. User-recorded custom gestures (nearest-neighbor match on hand landmarks)
  3. MediaPipe's built-in common gesture recognizer (e.g. open palm, thumbs up)
- **Real-time hand/face tracking** via MediaPipe's `HandLandmarker`, `FaceLandmarker`, and `GestureRecognizer`, with an optional skeleton overlay drawn on the camera feed (`src/components/Camera.jsx`)
- **Custom gesture creator** — type a word, hold a gesture, and record it with a 3-second countdown; saved to `localStorage` and can be deleted later (`src/components/GestureCreator.jsx`, `src/logic/customGestureManager.js`)
- **Spoken output** for every confirmed gesture via the browser's Web Speech API
- **Stability filtering** to avoid flicker and repeat-firing (`src/logic/stabilityFilter.js`): a gesture is confirmed once it appears in enough of the last 15 frames (5 for ASL letters, 12 for MediaPipe gestures). After a confirmation the filter ignores the next 20 frames, and it never re-confirms the gesture it last confirmed until a *different* gesture has been confirmed — the cooldown alone does not allow a repeat. For ASL letters the filter is reset whenever the hand leaves the frame, so a double letter (e.g. "LL") is only spoken twice if the hand drops out of view in between; the MediaPipe-gesture filter is never reset, so repeating one of those requires a different gesture in between
- **Settings panel** — toggle the hand-skeleton overlay, adjust TTS voice speed from 0.5x–1.5x (`src/components/SettingsPanel.jsx`)
- **Gesture history** — recently recognized words shown as a fading trail (`src/components/GestureDisplay.jsx`)

## Model

The ASL alphabet classifier (`training/train.py`) is trained on the Kaggle ASL alphabet image dataset, covering 24 classes: A–Z excluding J and Z, since both require motion and can't be classified from a single static frame.

Pipeline:
- MediaPipe Hands extracts 21 hand landmarks per training image
- Landmarks are normalized relative to the wrist and scaled by the wrist-to-middle-finger-base distance, producing 63 features (x, y, z per landmark) — this exact normalization is duplicated in `src/logic/aslClassifier.js` so browser inference matches training
- The first 400 images per letter (by frame number) are used — 9,600 images in total
- Images are split 70% train / 10% validation / 20% test, in sequential frame order per letter (not randomly), since the source images are sequential frames from one recording session and a random split would leak near-duplicate frames across splits
- Images where MediaPipe finds no hand are skipped: 2,153 of 9,600 (22%), almost all from the early frames that make up the training split. The splits actually used were **4,704 train / 903 validation / 1,840 test** samples. Per-letter coverage is uneven — e.g. B kept only 29 training samples and E 42, while I, S and Y kept all 280
- The training split is augmented 4x per sample (small random rotation, scale jitter, and positional noise), giving 23,520 training samples; validation and test sets are left unaugmented

Architecture — a small feedforward network:
```
Input(63) → Dense(128, ReLU) → Dropout(0.3) → Dense(64, ReLU) → Dropout(0.2) → Dense(24, softmax)
```

Trained with the Adam optimizer and categorical cross-entropy loss for up to 80 epochs, with early stopping on validation loss (patience 10, restores best weights). The script evaluates on the held-out test set and writes the accuracy, image counts, per-class classification report and confusion matrix to `training/results.json`.

**Measured results** (the run that produced the model in `public/asl_model/`; see `training/results.json`): **95.16% test accuracy** (1,840 test samples, test loss 0.290, early-stopped after 14 epochs), macro-average F1 0.929. Accuracy is not uniform across letters:

| Letter | F1 | Notes |
|---|---|---|
| M | 0.075 | Only 3 of 76 test samples correct — mostly predicted as X (33), N (20), A (8) or F (6). Effectively unrecognized. |
| N | 0.696 | 24/25 correct, but 20 M samples are also predicted as N |
| X | 0.829 | 80/80 correct, but 33 M samples are also predicted as X |
| R | 0.947 | 80/80 correct; absorbs 4 E, 2 U, 2 M, 1 V |
| A | 0.952 | 80/80 correct; absorbs 8 M |

Ten letters (B, C, D, G, I, K, L, O, T, W) scored a perfect 1.0. Training is not seeded, so a rerun will give slightly different numbers.

The trained model is exported to TensorFlow.js (`tensorflowjs_converter`) and served from `public/asl_model/` for in-browser inference.

## Tech stack

**Frontend**
- React 18 + Vite 5
- `@mediapipe/tasks-vision` — hand, face, and gesture landmark detection
- `@tensorflow/tfjs` — loads and runs the ASL classifier graph model client-side
- Web Speech API (`SpeechSynthesisUtterance`) — spoken output, no dependency

**Model training** (`training/train.py`, separate Python environment)
- TensorFlow / Keras
- MediaPipe (`mp.solutions.hands`) — landmark extraction from training images
- OpenCV (`cv2`) — image loading
- scikit-learn — label encoding and classification report
- `tensorflowjs_converter` — SavedModel → TensorFlow.js conversion

**Deployment**
- Vercel

## Setup / installation

Requires Node.js and a webcam.

```bash
git clone git@github.com:nabulsi019/lingo.git
cd lingo
npm install
npm run dev
```

This starts the Vite dev server; open the printed local URL and grant camera access when prompted.

Other scripts:
```bash
npm run build     # production build
npm run preview   # preview the production build locally
```

`training/train.py` is included for reference on how the ASL model was produced. It expects its own Python/TensorFlow environment and a local copy of the Kaggle ASL alphabet dataset (not included in this repo) — it isn't runnable out of the box from this checkout.
