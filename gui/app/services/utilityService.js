"use strict";
(function() {
    // This contains utility functions
    // Just inject "utilityService" into any controller that you want access to these
    const electron = require("electron");

    const _ = require("underscore")._;

    const EffectType = require("../../lib/common/EffectType");

    const dataAccess = require("../../lib/common/data-access.js");

    const uuidv1 = require("uuid/v1");

    angular
        .module("firebotApp")
        .factory("utilityService", function(
            $rootScope,
            $uibModal,
            listenerService,
            logger,
            $timeout
        ) {
            let service = {};

            let copiedEffectsCache = {};
            service.copyEffects = function(type, effects) {
                copiedEffectsCache = JSON.parse(angular.toJson(effects));
            };

            service.getCopiedEffects = function(trigger) {
                let effects = JSON.parse(JSON.stringify(copiedEffectsCache));

                if (!Array.isArray(effects)) {
                    effects = Object.values(effects);
                }

                let compatibleEffects = [];
                effects.forEach(e => {
                    if (EffectType.effectCanBeTriggered(e.id, trigger)) {
                        compatibleEffects.push(e);
                    }
                });

                return compatibleEffects;
            };

            service.hasCopiedEffects = function(trigger) {
                return service.getCopiedEffects(trigger).length > 0;
            };

            let slidingModals = [];
            const shiftAmount = 125;
            service.addSlidingModal = function(promise) {
                // update previous values
                slidingModals.forEach(em => {
                    let newAmount = em.transform + shiftAmount;
                    em.transform = newAmount;
                    em.element.css("transform", `translate(-${newAmount}px, 0)`);
                });

                promise.then(data => {
                    data.transform = 0;
                    slidingModals.push(data);
                });
            };

            service.removeSlidingModal = function() {
                slidingModals.pop();

                // update previous values
                slidingModals.forEach(em => {
                    let newAmount = em.transform - shiftAmount;
                    em.transform = newAmount;
                    em.element.css("transform", `translate(-${newAmount}px, 0)`);
                });
            };

            service.closeToModalId = function(modalId) {
                let minId = modalId.replace("modal", "");

                let closeList = [];
                slidingModals.forEach(m => {
                    let nextId = m.id.replace("modal", "");
                    if (minId < nextId && minId !== nextId) {
                        closeList.push(m);
                    }
                });

                closeList.forEach(m => {
                    m.instance.dismiss();
                });
            };

            service.saveAllSlidingModals = function() {
                let lastEditModalId = slidingModals[0].id;

                let saveList = [];
                slidingModals.forEach(m => {
                    if (m.id !== lastEditModalId) {
                        saveList.push(m);
                    }
                });

                saveList.reverse().forEach(m => {
                    m.onSaveAll();
                });
            };

            service.getSlidingModalNamesAndIds = function() {
                return slidingModals.map(sm => {
                    return { name: sm.name, id: sm.id };
                });
            };

            service.updateNameForSlidingModal = function(newName, modalId) {
                slidingModals
                    .filter(m => m.id === modalId)
                    .forEach(m => (m.name = newName));
            };

            service.showModal = function(showModalContext) {
                // We dont want to do anything if there's no context
                if (showModalContext == null) {
                    logger.warn("showModal() was called but no context was provided!");
                    return;
                }

                // Pull values out of the context
                let component = showModalContext.component;
                let templateUrl = showModalContext.templateUrl;
                let controllerFunc = showModalContext.controllerFunc;
                let resolveObj = showModalContext.resolveObj || {};
                let closeCallback = showModalContext.closeCallback;
                let dismissCallback = showModalContext.dismissCallback;
                let windowClass = showModalContext.windowClass ? showModalContext.windowClass : "";

                let modalId = "modal" + _.uniqueId().toString();
                resolveObj.modalId = () => {
                    return modalId;
                };

                let modal = {
                    ariaLabelledBy: "modal-title",
                    ariaDescribedBy: "modal-body",
                    resolve: resolveObj,
                    size: showModalContext.size,
                    keyboard: showModalContext.keyboard ? showModalContext.keyboard : true,
                    backdrop: showModalContext.backdrop ? showModalContext.backdrop : 'static',
                    windowClass: windowClass + " " + modalId + " animated fadeIn fastest fb-transition draggablemodal",
                    animation: true
                };

                if (component != null && component.length !== 0) {
                    modal.component = component;
                } else {
                    modal.templateUrl = templateUrl;
                    modal.controller = controllerFunc;
                }

                // Show the modal
                let modalInstance = $uibModal.open(modal);

                // If no callbacks were defined, create blank ones. This avoids a console error
                if (typeof closeCallback !== "function") {
                    closeCallback = () => {};
                }
                if (typeof dismissCallback !== "function") {
                    dismissCallback = () => {};
                }

                modalInstance.rendered.then(() => {
                    $("." + modalId).removeClass("animated fadeIn fastest");
                });

                // Handle when the modal is exited
                modalInstance.result.then(closeCallback, dismissCallback);
            };

            /*
             * FIRST TIME USE MODAL
             */
            service.showSetupWizard = function(allowExit = false) {
                service.showModal({
                    component: "setupWizardModal",
                    keyboard: allowExit ? true : false,
                    backdrop: allowExit ? true : "static",
                    closeCallback: () => {}
                });
            };

            /*
            * open get input modal
            */
            service.openGetInputModal = function(options, callback) {
                service.showModal({
                    component: "inputModal",
                    size: "sm",
                    resolveObj: {
                        model: () => options.model,
                        label: () => options.label,
                        inputPlaceholder: () => options.inputPlaceholder,
                        saveText: () => options.saveText,
                        validationFn: () => options.validationFn,
                        validationText: () => options.validationText
                    },
                    closeCallback: (resp) => {
                        callback(resp.model);
                    }
                });
            };

            /*
             * OVERLAY INFO MODAL
             */
            service.showOverlayInfoModal = function(instanceName) {
                let overlayInfoModalContext = {
                    templateUrl: "overlayInfoModal.html",
                    // This is the controller to be used for the modal.
                    controllerFunc: (
                        $scope,
                        $rootScope,
                        $uibModalInstance,
                        settingsService,
                        instanceName
                    ) => {
                        dataAccess.getPathInUserData("overlay.html");
                        // $scope.overlayPath = `http://localhost:${settingsService.getWebServerPort()}/overlay`;

                        $scope.overlayPath = dataAccess.getPathInUserData("overlay.html");

                        let port = settingsService.getWebServerPort();

                        let params = {};
                        if (port !== 7472 && !isNaN(port)) {
                            params["port"] = settingsService.getWebServerPort();
                        }

                        if (instanceName != null && instanceName !== "") {
                            $scope.showingInstance = true;
                            params["instance"] = encodeURIComponent(instanceName);
                        }

                        let paramCount = 0;
                        Object.entries(params).forEach(p => {
                            let key = p[0],
                                value = p[1];

                            let prefix = paramCount === 0 ? "?" : "&";

                            $scope.overlayPath += `${prefix}${key}=${value}`;

                            paramCount++;
                        });

                        $scope.usingOverlayInstances = settingsService.useOverlayInstances();

                        $scope.pathCopied = false;

                        $scope.copy = function() {
                            $rootScope.copyTextToClipboard($scope.overlayPath);
                            $scope.pathCopied = true;
                        };

                        $scope.dismiss = function() {
                            $uibModalInstance.dismiss("cancel");
                        };
                    },
                    resolveObj: {
                        instanceName: () => {
                            return instanceName;
                        }
                    }
                };
                service.showModal(overlayInfoModalContext);
            };

            /*
             * OVERLAY INFO MODAL
             */
            service.showOverlayEventsModal = function() {
                let overlayEventsModalContext = {
                    templateUrl: "overlayEventsModal.html",
                    // This is the controller to be used for the modal.
                    controllerFunc: (
                        $scope,
                        $rootScope,
                        $uibModalInstance,
                        settingsService
                    ) => {
                        $scope.textSettings = settingsService.getOverlayEventsSettings();

                        $scope.save = function() {
                            settingsService.saveOverlayEventsSettings($scope.textSettings);
                            $uibModalInstance.dismiss();
                        };

                        $scope.dismiss = function() {
                            $uibModalInstance.dismiss("cancel");
                        };
                    }
                };
                service.showModal(overlayEventsModalContext);
            };

            /*
             * JUST UPDATED MODAL
             */
            service.showUpdatedModal = function() {
                let justUpdatedModalContext = {
                    templateUrl: "updatedModal.html",
                    // This is the controller to be used for the modal.
                    controllerFunc: ($scope, $uibModalInstance) => {
                        let appVersion = electron.remote.app.getVersion();

                        $scope.appVersion = `v${appVersion}`;

                        $scope.dismiss = function() {
                            $uibModalInstance.dismiss("cancel");
                        };
                    },
                    size: "sm"
                };
                service.showModal(justUpdatedModalContext);
            };

            /*
             * ERROR MODAL
             */
            let previousErrorMessage = "";
            let errorModalOpen = false;
            service.showErrorModal = function(errorMessage) {
                if (errorModalOpen && previousErrorMessage === errorMessage) {
                    return;
                } else if (errorModalOpen) {
                    return;
                }
                previousErrorMessage = errorMessage;

                $rootScope.showSpinner = false;
                let errorModalContext = {
                    templateUrl: "errorModal.html",
                    // This is the controller to be used for the modal.
                    controllerFunc: ($scope, $uibModalInstance, message) => {
                        $scope.message = message;

                        $scope.close = function() {
                            $uibModalInstance.close();
                        };

                        $scope.dismiss = function() {
                            $uibModalInstance.dismiss("cancel");
                        };
                    },
                    resolveObj: {
                        message: () => {
                            return errorMessage;
                        }
                    },
                    closeCallback: () => {
                        errorModalOpen = false;
                    }
                };

                errorModalOpen = true;
                service.showModal(errorModalContext);

                // Log error to file.
                logger.warn(errorMessage);
            };

            service.showErrorDetailModal = function(title, details, modalSize = "sm") {
                service.showModal({
                    component: "errorDetailModal",
                    size: modalSize,
                    resolveObj: {
                        title: () => title,
                        details: () => details
                    }
                });
            };

            /*
             * DOWNLOAD MODAL
             */
            service.showDownloadModal = function() {
                let downloadModalContext = {
                    templateUrl: "downloadModal.html",
                    keyboard: false,
                    backdrop: "static",
                    size: "sm",
                    // This is the controller to be used for the modal.
                    controllerFunc: (
                        $scope,
                        $uibModalInstance,
                        $timeout,
                        listenerService
                    ) => {
                        $scope.downloadHasError = false;
                        $scope.errorMessage = "";

                        $scope.downloadComplete = false;

                        // Update error listener
                        let registerRequest = {
                            type: listenerService.ListenerType.UPDATE_ERROR,
                            runOnce: true
                        };
                        listenerService.registerListener(registerRequest, errorMessage => {
                            // the autoupdater had an error
                            $scope.downloadHasError = true;
                            $scope.errorMessage = errorMessage;
                        });

                        // Update downloaded listener
                        let updateDownloadedListenerRequest = {
                            type: listenerService.ListenerType.UPDATE_DOWNLOADED,
                            runOnce: true
                        };
                        listenerService.registerListener(
                            updateDownloadedListenerRequest,
                            () => {
                                // the autoupdater has downloaded the update and restart shortly
                                $scope.downloadComplete = true;
                            }
                        );

                        // Start timer for if the download seems to take longer than normal,
                        // we want to allow user to close modal.
                        // Currently set to a minute and a half
                        $timeout(() => {
                            if (!$scope.downloadComplete) {
                                $scope.downloadHasError = true;
                                $scope.errorMessage =
                  "Download is taking longer than normal. There may have been an error. You can keep waiting or close this and try again later.";
                            }
                        }, 90 * 1000);

                        $scope.dismiss = function() {
                            $uibModalInstance.dismiss("cancel");
                        };
                    }
                };
                service.showModal(downloadModalContext);
            };

            // This is used by effects that make use of lists of checkboxes. Returns and array of selected boxes.
            service.getNewArrayWithToggledElement = function(array, element) {
                let itemArray = [],
                    itemIndex = -1;
                if (array != null) {
                    itemArray = array;
                }
                try {
                    itemIndex = itemArray.indexOf(element);
                } catch (err) {} //eslint-disable-line no-empty

                if (itemIndex !== -1) {
                    // Item exists, so we're unchecking it.
                    itemArray.splice(itemIndex, 1);
                } else {
                    // Item doesn't exist! Add it in.
                    itemArray.push(element);
                }

                // Set new scope var.
                return itemArray;
            };

            // This is used to check for an item in a saved array and returns true if it exists.
            service.arrayContainsElement = function(array, element) {
                if (array != null) {
                    return array.indexOf(element) !== -1;
                }
                return false;
            };

            /*
             * INFO MODAL
             */
            let previousInfoMessage = "";
            let infoModalOpen = false;
            service.showInfoModal = function(infoMessage) {
                if (infoModalOpen && previousInfoMessage === infoMessage) {
                    return;
                }
                previousInfoMessage = infoMessage;

                $rootScope.showSpinner = false;
                let infoModalContext = {
                    templateUrl: "infoModal.html",
                    // This is the controller to be used for the modal.
                    controllerFunc: ($scope, $uibModalInstance, message) => {
                        $scope.message = message;

                        $scope.close = function() {
                            $uibModalInstance.close();
                        };
                    },
                    resolveObj: {
                        message: () => {
                            return infoMessage;
                        }
                    },
                    closeCallback: () => {
                        infoModalOpen = false;
                    }
                };

                infoModalOpen = true;
                service.showModal(infoModalContext);

                // Log info to file.
                logger.info(infoMessage);
            };

            /*
            * EDIT EFFECT MODAL
            */
            service.showEditEffectModal = function(
                effect,
                index,
                triggerType,
                closeCallback,
                triggerMeta
            ) {
                let showEditEffectContext = {
                    templateUrl: "editEffectModal.html",
                    keyboard: false,
                    backdrop: "static",
                    windowClass: "effect-edit-modal",
                    controllerFunc: (
                        $scope,
                        $uibModalInstance,
                        ngToast,
                        utilityService,
                        effectHelperService,
                        backendCommunicator,
                        logger,
                        modalId,
                        effect,
                        index,
                        triggerType,
                        triggerMeta
                    ) => {
                        $scope.effect = JSON.parse(angular.toJson(effect));
                        $scope.triggerType = triggerType;
                        $scope.triggerMeta = triggerMeta;
                        $scope.modalId = modalId;

                        $scope.isAddMode = index == null;
                        $scope.effectDefinition = effectHelperService.getEffectDefinition(
                            $scope.effect.type
                        );

                        $scope.effectTypeChanged = function(effectType) {
                            if ($scope.effect && $scope.effect.type === effectType.type) return;

                            let currentId = $scope.effect.id;
                            $scope.effect = {
                                id: currentId,
                                type: effectType.id
                            };

                            $scope.effectDefinition = effectHelperService.getEffectDefinition(
                                $scope.effect.type
                            );
                            utilityService.updateNameForSlidingModal(
                                $scope.effectDefinition.definition.name,
                                modalId
                            );
                        };

                        $scope.openModals = utilityService.getSlidingModalNamesAndIds();
                        $scope.closeToModal = utilityService.closeToModalId;

                        utilityService.addSlidingModal(
                            $uibModalInstance.rendered.then(() => {
                                let modalElement = $("." + modalId).children();
                                return {
                                    element: modalElement,
                                    name:
                                    $scope.effectDefinition.definition != null
                                        ? $scope.effectDefinition.definition.name
                                        : "Nothing",
                                    id: modalId,
                                    instance: $uibModalInstance,
                                    onSaveAll: () => {
                                        $scope.save();
                                    }
                                };
                            })
                        );

                        $scope.$on("modal.closing", function() {
                            utilityService.removeSlidingModal();
                        });

                        async function validateEffect() {

                            if ($scope.effect.type === "Nothing") {
                                ngToast.create("Please select an effect type!");
                                return false;
                            }

                            // validate options
                            let errors = $scope.effectDefinition.optionsValidator(
                                $scope.effect
                            );

                            if (errors != null && errors.length > 0) {
                                for (let error of errors) {
                                    ngToast.create(error);
                                }
                                return false;
                            }

                            const { triggerType, triggerMeta } = $scope;
                            try {
                                let variableErrors = await backendCommunicator.fireEventAsync("validateVariables", {
                                    data: $scope.effect,
                                    trigger: {
                                        type: triggerType,
                                        id: triggerMeta && triggerMeta.triggerId
                                    }
                                });

                                if (variableErrors && variableErrors.length > 0) {
                                    const firstError = variableErrors[0];

                                    let errorDetails = [];

                                    if (firstError.varname) {
                                        errorDetails.push({
                                            title: "Variable",
                                            message: "$" + firstError.varname
                                        });
                                    }

                                    if (firstError.message) {
                                        errorDetails.push({
                                            title: "Error",
                                            message: service.capitalize(firstError.message)
                                        });
                                    }

                                    if (firstError.index > -1) {
                                        errorDetails.push({
                                            title: "Argument Index",
                                            message: firstError.index
                                        });
                                    }

                                    if (firstError.character) {
                                        errorDetails.push({
                                            title: "Character",
                                            message: "\"" + firstError.character + "\""
                                        });
                                    }

                                    if (firstError.position) {
                                        errorDetails.push({
                                            title: "Character Position",
                                            message: firstError.position
                                        });
                                    }

                                    if (firstError.rawText) {
                                        errorDetails.push({
                                            title: "Raw Text",
                                            message: "\"" + firstError.rawText + "\""
                                        });
                                    }

                                    if (firstError.dataField) {
                                        errorDetails.push({
                                            title: "UI Field",
                                            message: firstError.dataField
                                        });
                                    }

                                    service.showErrorDetailModal("Replace Variable Error", errorDetails);
                                    return false;
                                }
                            } catch (err) {
                                logger.warn("Error while validating variables.", err);
                            }

                            // validate varialbes
                            return true;
                        }


                        $scope.saveAll = async function() {
                            let valid = await validateEffect();
                            if (!valid) return;
                            utilityService.saveAllSlidingModals();
                        };


                        $scope.save = async function() {

                            let valid = await validateEffect();

                            if (!valid) return;

                            // clear any toasts
                            ngToast.dismiss();

                            $uibModalInstance.close({
                                action: $scope.isAddMode ? "add" : "update",
                                effect: $scope.effect,
                                index: index
                            });
                        };

                        $scope.copy = function() {
                            utilityService.copyEffects(triggerType, [$scope.effect]);
                        };

                        $scope.getLabelButtonTextForLabel = function(labelModel) {
                            if (labelModel == null || labelModel.length === 0) {
                                return "Add Label";
                            }
                            return "Edit Label";
                        };

                        $scope.editLabel = () => {
                            let label = $scope.effect.effectLabel;
                            utilityService.openGetInputModal(
                                {
                                    model: label,
                                    label: $scope.getLabelButtonTextForLabel(label),
                                    saveText: "Save Label"
                                },
                                (newLabel) => {
                                    if (newLabel == null || newLabel.length === 0) {
                                        $scope.effect.effectLabel = null;
                                    } else {
                                        $scope.effect.effectLabel = newLabel;
                                    }
                                });
                        };

                        $scope.paste = function() {
                            if ($scope.hasCopiedEffect()) {
                                $scope.effect = utilityService.getCopiedEffects(triggerType)[0];
                            }
                        };

                        $scope.hasCopiedEffect = function() {
                            return (
                                utilityService.hasCopiedEffects(triggerType) &&
                utilityService.getCopiedEffects(triggerType).length < 2
                            );
                        };

                        $scope.runEffect = function() {
                            ipcRenderer.send('runEffectsManually', { list: [$scope.effect] });
                        };

                        $scope.delete = function() {
                            $uibModalInstance.close({
                                action: "delete",
                                effect: $scope.effect,
                                index: index
                            });
                        };

                        $scope.dismiss = function() {
                            $uibModalInstance.dismiss();
                        };
                    },
                    resolveObj: {
                        effect: () => {
                            return effect;
                        },
                        triggerType: () => {
                            return triggerType;
                        },
                        triggerMeta: () => {
                            return triggerMeta;
                        },
                        index: () => {
                            return index;
                        }
                    },
                    closeCallback: closeCallback
                };

                service.showModal(showEditEffectContext);
            };

            service.showConfirmationModal = function(confirmModalRequest) {
                return new Promise(resolve => {
                    let deleteBoardModalContext = {
                        templateUrl: "./templates/misc-modals/confirmationModal.html",
                        resolveObj: {
                            title: () => {
                                return confirmModalRequest.title;
                            },
                            question: () => {
                                return confirmModalRequest.question;
                            },
                            cancelLabel: () => {
                                return confirmModalRequest.cancelLabel;
                            },
                            confirmLabel: () => {
                                return confirmModalRequest.confirmLabel;
                            },
                            confirmBtnType: () => {
                                return confirmModalRequest.confirmBtnType;
                            }
                        },
                        controllerFunc: (
                            $scope,
                            $uibModalInstance,
                            title,
                            question,
                            cancelLabel,
                            confirmLabel,
                            confirmBtnType
                        ) => {
                            $scope.title = title;
                            $scope.question = question;
                            $scope.cancelLabel = cancelLabel;
                            $scope.confirmLabel = confirmLabel;
                            $scope.confirmBtnType = confirmBtnType;

                            $scope.confirmed = false;
                            $scope.confirm = function() {
                                $scope.confirmed = true;
                                $uibModalInstance.close();
                            };

                            $scope.dismiss = function() {
                                $uibModalInstance.close();
                                resolve(false);
                            };

                            $scope.$on("modal.closing", function() {
                                resolve($scope.confirmed);
                            });
                        },
                        size: "sm"
                    };
                    service.showModal(deleteBoardModalContext);
                });
            };

            // Watches for an event from main process
            listenerService.registerListener(
                {
                    type: listenerService.ListenerType.INFO
                },
                infoMessage => {
                    service.showInfoModal(infoMessage);
                }
            );

            // Watches for an event from main process
            listenerService.registerListener(
                {
                    type: listenerService.ListenerType.ERROR
                },
                errorMessage => {
                    service.showErrorModal(errorMessage);
                }
            );

            service.capitalize = function([first, ...rest]) {
                return first.toUpperCase() + rest.join("").toLowerCase();
            };

            service.generateUuid = function() {
                // RFC4122 version 4 compliant
                return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
                    (
                        c ^
            (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
                    ).toString(16)
                );
            };

            service.debounce = function(func, wait, immediate = false) {
                let timeout;

                return function executedFunction() {
                    let context = this;
                    let args = arguments;

                    let later = function() {
                        timeout = null;
                        if (!immediate) func.apply(context, args);
                    };

                    let callNow = immediate && !timeout;

                    $timeout.cancel(timeout);

                    timeout = $timeout(later, wait);

                    if (callNow) func.apply(context, args);
                };
            };

            return service;
        });
}());
