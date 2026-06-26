# Spritesheet Pet Generation Design

## Goal

Make the generated desktop pet use the assets produced from the uploaded image. The MVP output is a `.pet` bundle containing generated spritesheets and metadata, then the Electron pet window loads that bundle and plays simple frame-based animations.

## Approach

The generation workflow remains step-by-step and user-reviewed. Stages 1-4 generate visual assets through the configured external AI provider and return each image to the frontend for inspection. Stages 5-9 normalize the accepted assets into a playable pet bundle.

The renderer will not depend on Spine for this repair. It will read the `.pet` bundle from local Electron storage, extract spritesheets with `JSZip`, and animate them as Pixi textures. This makes the result visible and usable even before advanced skeletal rigging is reliable.

## Bundle Contract

The final `.pet` bundle contains:

- `metadata.json`: pet id, name, created timestamp, rig quality, available animations.
- `preview_front.png`: preview shown by the app and used as fallback.
- `spritesheet_idle.png`: required.
- `spritesheet_walk.png`: optional but expected.
- `spritesheet_dragged.png`: optional but expected.
- `spritesheet_eating.png`: optional but expected.
- `atlas.json`: lightweight animation manifest with frame grid hints.
- `atlas.png`: compatibility image, using the idle spritesheet as the primary texture.
- `skeleton.json`: compatibility skeleton for existing validators.

## API Flow

- `POST /api/v1/upload` creates the pet and queued job only.
- `POST /api/v1/jobs/{job_id}/next` runs exactly one stage and returns `{ stage, status, preview, message }`.
- `POST /api/v1/jobs/{job_id}/stages/{stage}/regenerate` reruns the current stage only.
- `POST /api/v1/jobs/{job_id}/confirm` builds and stores the bundle after stage 9.
- `GET /api/v1/download/{pet_id}` validates and returns the bundle.

## Failure Behavior

AI stages fail loudly with a message the UI can show. The server does not mark an AI stage successful unless it has valid image bytes. Local stages use fallback assets when possible so the bundle can still be built from the accepted spritesheets.

## Verification

- Frontend/Electron build must pass with `npm run build`.
- Backend tests should cover bundle validation and pipeline output contract. The current machine has no working Python runtime; tests can be run once Python or the project venv is repaired.
