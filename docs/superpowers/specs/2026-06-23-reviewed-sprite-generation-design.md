# Reviewed Sprite Generation Design

## Goal
Generate a desktop pet in a reviewed sequence: first create and confirm the character three-view sheet, then generate the remaining action sprite sheets in one stage, then package the playable desktop pet.

## Flow
1. Upload a source image.
2. Stage 1 generates `spritesheet_idle.png` from the three-view prompt and shows it for review.
3. After confirmation, Stage 2 uses the source image plus the approved three-view sheet as context and generates `spritesheet_walk.png`, `spritesheet_dragged.png`, and `spritesheet_eating.png`.
4. Stage 3 builds compatibility assets and the `.pet` bundle preview.
5. Final confirmation saves and launches the pet.

## Provider Contract
Providers expose `generate_reference_sheet(photo_bytes)` for Stage 1 and `generate_action_sheets(photo_bytes, context_images)` for Stage 2. Built-in generation keeps the user-provided prompts as the fixed defaults.

## UI
The existing stepper remains manual. The labels change to three stages: three-view design, action sprites, and packaging. Regeneration applies to the current reviewed stage.
