"use strict";

const { EffectTrigger } = require("../../../shared/effect-constants");
const { OutputDataType, VariableCategory } = require("../../../shared/variable-constants");

const triggers = {};
triggers[EffectTrigger.EVENT] = ["twitch:chat-mode-changed"];
triggers[EffectTrigger.MANUAL] = true;

const model = {
    definition: {
        handle: "chatModeDuration",
        description: "The duration relevant to either follower (minutes) or slow (seconds) mode.",
        triggers: triggers,
        categories: [VariableCategory.TRIGGER],
        possibleDataOutput: [OutputDataType.number]
    },
    evaluator: (trigger) => {
        return trigger.metadata.eventData.duration;
    }
};

module.exports = model;
