import { TriggerType } from "../../../../common/EffectType";
import { ReplaceVariable } from "../../../../../types/variables";
import {
    OBS_EVENT_SOURCE_ID,
    OBS_SCENE_TRANSITION_ENDED_EVENT_ID,
    OBS_SCENE_TRANSITION_STARTED_EVENT_ID
} from "../constants";

const triggers = {};
triggers[TriggerType.EVENT] = [
    `${OBS_EVENT_SOURCE_ID}:${OBS_SCENE_TRANSITION_STARTED_EVENT_ID}`,
    `${OBS_EVENT_SOURCE_ID}:${OBS_SCENE_TRANSITION_ENDED_EVENT_ID}`
];

export const TransitionNameVariable: ReplaceVariable = {
    definition: {
        handle: "obsTransitionName",
        description:
      "The name of the OBS transition that triggered the event.",
        possibleDataOutput: ["text"],
        triggers: triggers
    },
    evaluator: async (trigger) => {
        const transitionName = trigger.metadata?.eventData?.transitionName;
        return transitionName ?? "Unknown";
    }
};
