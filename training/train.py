import os
import re
import math
import json
import numpy as np
import cv2
import mediapipe as mp
import tensorflow as tf
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix

# Initialize MediaPipe
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    min_detection_confidence=0.5
)

DATA_DIR = os.path.expanduser('~/Desktop/mylingo-ml/data/asl_alphabet_train/asl_alphabet_train')
OUTPUT_DIR = os.path.expanduser('~/Desktop/mylingo-ml/model')
os.makedirs(OUTPUT_DIR, exist_ok=True)
RESULTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results.json')

# J and Z require motion and cannot be classified from a single frame
LETTERS = [chr(i) for i in range(ord('A'), ord('Z') + 1) if chr(i) not in ('J', 'Z')]

IMAGES_PER_LETTER = 400
TRAIN_FRACTION = 0.7
VAL_FRACTION = 0.1
AUGMENTATIONS_PER_SAMPLE = 4

rng = np.random.default_rng(42)


# MUST stay bit-for-bit equivalent to normalizeLandmarks() in
# ~/Desktop/lingo/src/logic/aslClassifier.js — the model silently predicts
# nonsense if the two diverge.
def normalize_landmarks(lms):
    wrist = lms[0]
    mid_base = lms[9]
    scale = math.sqrt((mid_base.x - wrist.x)**2 + (mid_base.y - wrist.y)**2)
    if scale < 1e-6:
        return None
    out = []
    for lm in lms:
        out.extend([
            (lm.x - wrist.x) / scale,
            (lm.y - wrist.y) / scale,
            (lm.z - wrist.z) / scale,
        ])
    return out


def augment_sample(sample):
    pts = np.array(sample, dtype=np.float64).reshape(21, 3)
    angle = math.radians(rng.uniform(-15.0, 15.0))
    c, s = math.cos(angle), math.sin(angle)
    x = pts[:, 0].copy()
    y = pts[:, 1].copy()
    pts[:, 0] = c * x - s * y
    pts[:, 1] = s * x + c * y
    pts *= rng.uniform(0.9, 1.1)
    pts += rng.normal(0.0, 0.015, pts.shape)
    return pts.flatten().tolist()


def trailing_number(filename):
    m = re.search(r'(\d+)\.[^.]+$', filename)
    return int(m.group(1)) if m else -1


def extract_landmarks(img_path):
    img = cv2.imread(img_path)
    if img is None:
        return None
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = hands.process(img_rgb)
    if not results.multi_hand_landmarks:
        return None
    return normalize_landmarks(results.multi_hand_landmarks[0].landmark)


print("Extracting landmarks from images...")
X_train, y_train_labels = [], []
X_val, y_val_labels = [], []
X_test, y_test_labels = [], []
skipped = 0
image_counts = {}

for letter in LETTERS:
    folder = os.path.join(DATA_DIR, letter)
    if not os.path.exists(folder):
        print(f"Skipping {letter} - folder not found")
        continue

    # Kaggle images are sequential frames from one recording session, so the
    # split must be grouped in time: sort by frame number, first 70% -> train,
    # next 10% -> validation, last 20% -> test. A random split leaks
    # near-duplicate frames.
    images = sorted(
        (f for f in os.listdir(folder) if f.lower().endswith(('.jpg', '.jpeg', '.png'))),
        key=trailing_number
    )[:IMAGES_PER_LETTER]
    train_end = int(len(images) * TRAIN_FRACTION)
    val_end = int(len(images) * (TRAIN_FRACTION + VAL_FRACTION))
    print(f"Processing {letter}: {len(images)} images "
          f"({train_end} train / {val_end - train_end} val / {len(images) - val_end} test)")

    counts = {'images': len(images), 'train': 0, 'val': 0, 'test': 0, 'skipped': 0}
    for i, img_file in enumerate(images):
        row = extract_landmarks(os.path.join(folder, img_file))
        if row is None:
            skipped += 1
            counts['skipped'] += 1
            continue
        if i < train_end:
            X_train.append(row)
            y_train_labels.append(letter)
            counts['train'] += 1
        elif i < val_end:
            X_val.append(row)
            y_val_labels.append(letter)
            counts['val'] += 1
        else:
            X_test.append(row)
            y_test_labels.append(letter)
            counts['test'] += 1
    image_counts[letter] = counts

print(f"Train samples: {len(X_train)}, Val samples: {len(X_val)}, "
      f"Test samples: {len(X_test)}, Skipped: {skipped}")
train_before_augmentation = len(X_train)

# Augment the training set only
print("Augmenting training set...")
augmented_X, augmented_y = [], []
for row, letter in zip(X_train, y_train_labels):
    for _ in range(AUGMENTATIONS_PER_SAMPLE):
        augmented_X.append(augment_sample(row))
        augmented_y.append(letter)
X_train.extend(augmented_X)
y_train_labels.extend(augmented_y)
print(f"Train samples after augmentation: {len(X_train)}")

# Encode labels
le = LabelEncoder()
le.fit(LETTERS)
y_train = tf.keras.utils.to_categorical(le.transform(y_train_labels), num_classes=len(le.classes_))
y_val = tf.keras.utils.to_categorical(le.transform(y_val_labels), num_classes=len(le.classes_))
y_test = tf.keras.utils.to_categorical(le.transform(y_test_labels), num_classes=len(le.classes_))

# Label mapping — written next to the model at the end so the pair can't drift
label_map = {str(i): label for i, label in enumerate(le.classes_)}
print("Label map:", label_map)

X_train = np.array(X_train)
X_val = np.array(X_val)
X_test = np.array(X_test)

print(f"Training: {len(X_train)}, Validation: {len(X_val)}, Testing: {len(X_test)}")

# Build model
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(63,)),
    tf.keras.layers.Dense(128, activation='relu'),
    tf.keras.layers.Dropout(0.3),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.Dropout(0.2),
    tf.keras.layers.Dense(len(le.classes_), activation='softmax')
])

model.compile(
    optimizer='adam',
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

model.summary()

# Train
print("Training model...")
history = model.fit(
    X_train, y_train,
    epochs=80,
    batch_size=32,
    validation_data=(X_val, y_val),
    callbacks=[
        tf.keras.callbacks.EarlyStopping(
            monitor='val_loss',
            patience=10,
            restore_best_weights=True
        )
    ],
    verbose=1
)

# Evaluate
loss, accuracy = model.evaluate(X_test, y_test, verbose=0)
print(f"Test accuracy: {accuracy:.4f}")

y_pred = np.argmax(model.predict(X_test, verbose=0), axis=1)
y_true = np.argmax(y_test, axis=1)
labels_idx = list(range(len(le.classes_)))
print(classification_report(y_true, y_pred, labels=labels_idx,
                            target_names=list(le.classes_), digits=4, zero_division=0))
report = classification_report(y_true, y_pred, labels=labels_idx,
                               target_names=list(le.classes_), digits=4,
                               zero_division=0, output_dict=True)
cm = confusion_matrix(y_true, y_pred, labels=labels_idx)

# Save model
model.save(os.path.join(OUTPUT_DIR, 'asl_model'))
print("Model saved")

# Convert to TensorFlow.js
import subprocess
tfjs_output = os.path.join(OUTPUT_DIR, 'tfjs_model')
os.makedirs(tfjs_output, exist_ok=True)
subprocess.run([
    'tensorflowjs_converter',
    '--input_format=tf_saved_model',
    os.path.join(OUTPUT_DIR, 'asl_model'),
    tfjs_output
], check=True)
print(f"TensorFlow.js model saved to {tfjs_output}")

# Write labels.json alongside the model it belongs to (and at the old location)
for labels_path in (os.path.join(tfjs_output, 'labels.json'),
                    os.path.join(OUTPUT_DIR, 'labels.json')):
    with open(labels_path, 'w') as f:
        json.dump(label_map, f)
    print(f"Labels saved to {labels_path}")

results = {
    'test_accuracy': float(accuracy),
    'test_loss': float(loss),
    'epochs_run': len(history.history['loss']),
    'classes': list(le.classes_),
    'num_classes': len(le.classes_),
    'image_counts': {
        'images_per_letter_cap': IMAGES_PER_LETTER,
        'images_used': sum(c['images'] for c in image_counts.values()),
        'train_before_augmentation': train_before_augmentation,
        'train_after_augmentation': len(X_train),
        'val': len(X_val),
        'test': len(X_test),
        'skipped_no_hand': skipped,
        'per_class': image_counts,
    },
    'classification_report': report,
    # rows = true letter, columns = predicted letter, both in 'classes' order
    'confusion_matrix': cm.tolist(),
}
with open(RESULTS_PATH, 'w') as f:
    json.dump(results, f, indent=2)
print(f"Results saved to {RESULTS_PATH}")
print("Done! Model ready for MyLingo.")
