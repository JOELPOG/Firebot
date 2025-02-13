"use strict";
const twitchChat = require("../../../chat/twitch-chat");
const twitchApi = require("../../../twitch-api/api");
const profileManager = require("../../profile-manager");
const settings = require('../../settings-access').settings;
const path = require("path");
const logger = require("../../../logwrapper");
const {
    app
} = require('electron');

const accountAccess = require('../../account-access');

//v4 effect types are keys, supported v5 types are values
const v4EffectTypeMap = {
    "API Button": "firebot:api",
    "Celebration": "firebot:celebration",
    "Change Group": null,
    "Change Scene": null,
    "Chat": "firebot:chat",
    "Cooldown": null,
    "Custom Script": "firebot:customscript",
    "Run Command": null,
    "Delay": "firebot:delay",
    "Dice": "firebot:dice",
    "Game Control": "firebot:controlemulation",
    "HTML": "firebot:html",
    "Show Event": null,
    "Play Sound": "firebot:playsound",
    "Random Effect": "firebot:randomeffect",
    "Effect Group": "firebot:run-effect-list",
    "Show Image": "firebot:showImage",
    "Create Clip": "firebot:clip",
    "Show Video": "firebot:playvideo",
    "Clear Effects": null,
    "Write Text To File": "firebot:filewriter",
    "Group List": null,
    "Scene List": null,
    "Command List": null,
    "Change User Scene": null,
    "Change Group Scene": null,
    "Update Button": null,
    "Toggle Connection": "firebot:toggleconnection",
    "Show Text": "firebot:showtext"
};

function mapV4EffectToV5(effect) {
    if (effect && effect.type) {
        const mappedType = v4EffectTypeMap[effect.type];
        if (mappedType != null) {
            effect.type = mappedType;
        }
    }
    return effect;
}

function buildModules(scriptManifest) {
    const streamerName = accountAccess.getAccounts().streamer.username || "Unknown Streamer";
    const appVersion = app.getVersion();

    const request = require("request");

    const customRequest = request.defaults({
        headers: {
            'User-Agent': `Firebot/${appVersion};CustomScript/${scriptManifest.name}/${scriptManifest.version};User/${streamerName}`
        }
    });

    // safe guard: enforce our user-agent
    customRequest.init = function init(options) {
        if (options != null && options.headers != null) {
            delete options.headers['User-Agent'];
        }
        customRequest.prototype.init.call(this, options);
    };

    return {
        request: customRequest,
        spawn: require('child_process').spawn,
        childProcess: require('child_process'),
        fs: require('fs-extra'),
        path: require('path'),
        JsonDb: require('node-json-db').JsonDB,
        moment: require('moment'),
        howler: require("howler"),
        logger: logger,
        // thin chat shim for basic backwards compatibility
        chat: {
            smartSend: async (...args) => {
                await twitchChat.sendChatMessage(...args);
            },
            deleteChat: async (id) => {
                await twitchApi.chat.deleteChatMessage(id);
            }
        },
        twitchChat: twitchChat,
        twitchApi: twitchApi,
        httpServer: require("../../../../server/http-server-manager"),
        effectManager: require("../../../effects/effectManager"),
        effectRunner: require("../../effect-runner"),
        conditionManager: require("../../../effects/builtin/conditional-effects/conditions/condition-manager"),
        restrictionManager: require("../../../restrictions/restriction-manager"),
        commandManager: require("../../../chat/commands/CommandManager"),
        eventManager: require("../../../events/EventManager"),
        eventFilterManager: require("../../../events/filters/filter-manager"),
        replaceVariableManager: require("../../../variables/replace-variable-manager"),
        integrationManager: require("../../../integrations/integration-manager"),
        customVariableManager: require("../../../common/custom-variable-manager"),
        customRolesManager: require("../../../roles/custom-roles-manager"),
        firebotRolesManager: require("../../../roles/firebot-roles-manager"),
        timerManager: require("../../../timers/timer-manager"),
        gameManager: require("../../../games/game-manager"),
        currencyManager: require("../../../currency/currencyManager"),
        currencyDb: require("../../../database/currencyDatabase"),
        userDb: require("../../../database/userDatabase"),
        quotesManager: require("../../../quotes/quotes-manager"),
        frontendCommunicator: require("../../frontend-communicator"),
        counterManager: require("../../../counters/counter-manager"),
        utils: require("../../../utility"),
        resourceTokenManager: require("../../../resourceTokenManager")
    };
}


function buildRunRequest(scriptManifest, params, trigger) {
    return {
        modules: buildModules(scriptManifest),
        command: trigger?.metadata?.userCommand,
        user: {
            name: trigger?.metadata?.username
        },
        firebot: {
            accounts: accountAccess.getAccounts(),
            settings: settings,
            version: app.getVersion()
        },
        parameters: params,
        trigger: trigger
    };
}

function getScriptPath(scriptName) {
    const scriptsFolder = profileManager.getPathInProfile("/scripts");
    return path.resolve(scriptsFolder, scriptName);
}

function mapParameters(parameterData) {
    //simplify parameters
    const simpleParams = {};
    if (parameterData != null) {
        Object.keys(parameterData).forEach(k => {
            const param = parameterData[k];
            if (param != null) {
                simpleParams[k] = param.value == null && param.value !== ""
                    ? param.default
                    : param.value;
            }
        });
    }
    return simpleParams;
}

exports.mapParameters = mapParameters;
exports.getScriptPath = getScriptPath;
exports.buildRunRequest = buildRunRequest;
exports.mapV4EffectToV5 = mapV4EffectToV5;