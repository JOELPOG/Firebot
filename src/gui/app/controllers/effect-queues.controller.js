"use strict";
(function() {
    angular
        .module("firebotApp")
        .controller("effectQueuesController", function(
            $scope,
            effectQueuesService,
            utilityService
        ) {
            $scope.effectQueuesService = effectQueuesService;

            $scope.onEffectQueuesUpdated = (items) => {
                effectQueuesService.saveAllEffectQueues(items);
            };

            $scope.getQueueModeName = (modeId) => {
                const mode = effectQueuesService.queueModes.find(m => m.id === modeId);
                return mode ? mode.display : "Unknown";
            };

            $scope.headers = [
                {
                    name: "NAME",
                    icon: "fa-user",
                    cellTemplate: `{{data.name}}`,
                    cellController: () => {}
                },
                {
                    name: "MODE",
                    icon: "fa-bring-forward",
                    cellTemplate: `{{getQueueModeName(data.mode)}}`,
                    cellController: ($scope) => {
                        $scope.getQueueModeName = (modeId) => {
                            const mode = effectQueuesService.queueModes.find(m => m.id === modeId);
                            return mode ? mode.display : "Unknown";
                        };
                    }
                },
                {
                    name: "INTERVAL/DELAY",
                    icon: "fa-clock",
                    cellTemplate: `{{(data.mode === 'interval' || data.mode === 'auto') ? (data.interval || 0) + 's' : 'n/a'}}`,
                    cellController: () => {}
                },
                {
                    name: "QUEUE LENGTH",
                    icon: "fa-tally",
                    cellTemplate: `{{data.length || 0}}`,
                    cellController: () => {}
                }
            ];

            $scope.effectQueueOptions = (item) => {
                const options = [
                    {
                        html: `<a href ><i class="far fa-pen mr-4"></i> Edit</a>`,
                        click: function () {
                            effectQueuesService.showAddEditEffectQueueModal(item.id);
                        }
                    },
                    {
                        html: `<a href ><i class="far fa-toggle-off" style="margin-right: 10px;"></i> ${item.active ? "Disable Effect Queue" : "Enable Effect Queue"}</a>`,
                        click: function () {
                            effectQueuesService.toggleEffectQueue(item);
                        }
                    },
                    {
                        html: `<a href ><i class="fad fa-minus-circle mr-4"></i> Clear Queue</a>`,
                        click: function () {
                            effectQueuesService.clearEffectQueue(item.id);
                        }
                    },
                    {
                        html: `<a href ><i class="far fa-clone mr-4"></i> Duplicate</a>`,
                        click: function () {
                            effectQueuesService.duplicateEffectQueue(item.id);
                        }
                    },
                    {
                        html: `<a href style="color: #fb7373;"><i class="far fa-trash-alt mr-4"></i> Delete</a>`,
                        click: function () {
                            utilityService
                                .showConfirmationModal({
                                    title: "Delete Effect Queue",
                                    question: `Are you sure you want to delete the Effect Queue "${item.name}"?`,
                                    confirmLabel: "Delete",
                                    confirmBtnType: "btn-danger"
                                })
                                .then(confirmed => {
                                    if (confirmed) {
                                        effectQueuesService.deleteEffectQueue(item.id);
                                    }
                                });

                        }
                    }
                ];

                return options;
            };
        });
}());
