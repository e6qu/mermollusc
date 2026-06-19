import { brand } from "@m/std";
import type { SceneNodeId, SceneEdgeId } from "../core/scene.js";

// Smart constructors for the SceneGraph ids. They live in the shell so the sole unsafe `brand` cast
// stays out of the functional cores (the layout engines), which call these instead of casting
// directly — keeping `src/core` free of the escape hatch (enforced by tools/guard-types.mjs). Scene
// ids are opaque string handles (sourced from validated AST ids), so no further validation is needed;
// these only mint the branded type.
export const sceneNodeId = (value: string): SceneNodeId => brand<string, "SceneNodeId">(value);
export const sceneEdgeId = (value: string): SceneEdgeId => brand<string, "SceneEdgeId">(value);
