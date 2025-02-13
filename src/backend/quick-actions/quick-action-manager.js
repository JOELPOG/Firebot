"use strict";

const frontendCommunicator = require("../common/frontend-communicator");
const JsonDbManager = require("../database/json-db-manager");
const effectRunner = require("../common/effect-runner");
const presetEffectListManager = require("../effects/preset-lists/preset-effect-list-manager");
const { EffectTrigger } = require("../../shared/effect-constants");
const accountAccess = require("../common/account-access");
const { settings } = require("../common/settings-access");

/** @typedef {import("../../shared/types").QuickActionDefinition} QuickActionDefinition */

/**
 * @extends {JsonDbManager<QuickActionDefinition>}
 */
class QuickActionManager extends JsonDbManager {
    constructor() {
        super("Custom Quick Action", "/custom-quick-actions");

        this.systemQuickActions = [];
    }

    /**
     * @override
     * @inheritdoc
     */
    loadItems() {
        super.loadItems();

        [
            "give-currency",
            "stream-info",
            "stream-preview"
        ].forEach(filename => {
            const quickAction = require(`./builtin/${filename}.js`);
            this.systemQuickActions.push(quickAction);
        });
    }

    /**
     * @override
     * @inheritdoc
     * @returns {QuickActionDefinition[]}
     */
    getAllItems() {
        return [
            ...this.getSystemQuickActionDefinitions(),
            ...Object.values(this.items)
        ];
    }

    deleteQuickAction(customQuickActionId) {
        if (super.deleteItem(customQuickActionId)) {
            const quickActionSettings = settings.getQuickActionSettings();
            delete quickActionSettings[customQuickActionId];
            settings.setQuickActionSettings(quickActionSettings);
        }
    }

    /**
     * @returns {QuickActionDefinition[]}
     */
    getSystemQuickActionDefinitions() {
        return this.systemQuickActions.map(sqa => sqa.definition);
    }

    triggerQuickAction(quickActionId) {
        const triggeredQuickAction = [
            ...this.getSystemQuickActionDefinitions(),
            ...Object.values(this.items)
        ].find(qa => qa.id === quickActionId);

        if (triggeredQuickAction.type === 'custom') {
            let effects = [];
            let presetArgValues = undefined;

            if (triggeredQuickAction.presetListId != null) {
                const presetList = presetEffectListManager.getItem(triggeredQuickAction.presetListId);
                if (triggeredQuickAction.promptForArgs && presetList?.args?.length > 0) {
                    frontendCommunicator.send("show-run-preset-list-modal", triggeredQuickAction.presetListId);
                    return;
                }
                effects = presetList?.effects;
                presetArgValues = triggeredQuickAction.presetArgValues;
            } else if (triggeredQuickAction.effectList != null) {
                effects = triggeredQuickAction.effectList;
            }

            const request = {
                trigger: {
                    type: EffectTrigger.QUICK_ACTION,
                    metadata: {
                        username: accountAccess.getAccounts().streamer.username,
                        presetListArgs: presetArgValues
                    }
                },
                effects: effects
            };

            effectRunner.processEffects(request);
            return;
        }

        const systemQuickAction = this.systemQuickActions.find(sqa => sqa.definition.id === quickActionId);
        systemQuickAction.onTriggerEvent();
    }

    /**
     * @returns {void}
     */
    triggerUiRefresh() {
        frontendCommunicator.send("all-quick-actions", this.getAllItems());
    }
}

const quickActionManager = new QuickActionManager();

frontendCommunicator.onAsync("getQuickActions",
    async () => quickActionManager.getAllItems());

frontendCommunicator.onAsync("saveCustomQuickAction",
    async (/** @type {QuickActionDefinition} */ customQuickAction) => await quickActionManager.saveItem(customQuickAction));

frontendCommunicator.onAsync("saveAllCustomQuickActions",
    async (/** @type {QuickActionDefinition[]} */ allCustomQuickActions) => await quickActionManager.saveAllItems(allCustomQuickActions));

frontendCommunicator.on("deleteCustomQuickAction",
    (/** @type {string} */ customQuickActionId) => quickActionManager.deleteQuickAction(customQuickActionId));

frontendCommunicator.on("triggerQuickAction", quickActionId => {
    quickActionManager.triggerQuickAction(quickActionId);
});

module.exports = quickActionManager;
