'use strict';

// generic modal for asking the user for text input

(function() {
    angular
        .module('firebotApp')
        .component("viewerSearchModal", {
            template: `
            <div class="modal-header">
                <button type="button" class="close" aria-label="Close" ng-click="$ctrl.dismiss()"><span aria-hidden="true">&times;</span></button>
                <h4 class="modal-title">{{$ctrl.label}}</h4>
            </div>
            <div class="modal-body" style="margin-bottom: 10px;">
                <div style="display: flex;flex-direction: column;justify-content: center;align-items: center;margin-top: 10px;">
                    <div style="display:flex; align-items: end; justify-content: space-between; width: 100%;">
                        <div class="form-group" ng-class="{'has-error': $ctrl.hasValidationError}" style="width: 100%; margin: 0 15px 0 0;">

                            <ui-select ng-model="$ctrl.model" theme="bootstrap" spinner-enabled="true" on-select="$ctrl.viewerSelected()">
                                <ui-select-match placeholder="{{$ctrl.inputPlaceholder}}">
                                    <span>{{$select.selected.username}}</span>
                                </ui-select-match>
                                <ui-select-choices minimum-input-length="1" repeat="channel in $ctrl.channels | filter: $select.search" refresh="$ctrl.searchForChannels($select.search)" refresh-delay="400" style="position:relative;">
                                    <div style="height: 35px; display:flex; flex-direction: row; align-items: center;">
                                        <img style="height: 30px; width: 30px; border-radius: 5px; margin-right:10px;" ng-src="{{channel.avatarUrl || $ctrl.defaultAvatar}}">
                                        <div style="font-weight: 100;font-size: 17px;">{{channel.username}}</div>
                                    </div>
                                </ui-select-choices>
                            </ui-select>
                            <span id="helpBlock" class="help-block" ng-show="$ctrl.hasValidationError">{{$ctrl.validationText}}</span>
                        </div>
                        <button type="button" class="btn btn-primary" ng-click="$ctrl.save()" focus-on="focusAddButton">{{$ctrl.saveText}}</button>
                    </div>
                </div>
            </div>
            `,
            bindings: {
                resolve: '<',
                close: '&',
                dismiss: '&',
                modalInstance: "<"
            },
            controller: function($http, $scope, utilityService, backendCommunicator, focus) {
                const $ctrl = this;

                $ctrl.model = null;

                $ctrl.label = "Enter Text";
                $ctrl.inputPlaceholder = "Search Twitch for a viewer...";
                $ctrl.saveText = "Save";
                $ctrl.validationFn = () => true;
                $ctrl.validationText = "";
                $ctrl.hasValidationError = false;

                $ctrl.defaultAvatar = "";

                $ctrl.channels = [];

                $ctrl.searchForChannels = function(query) {
                    if (query == null || query.trim() === "") {
                        return;
                    }
                    console.log("searching");
                    backendCommunicator.fireEventAsync("search-twitch-channels", query)
                        .then(channels => {
                            console.log(channels);
                            if (channels != null) {
                                $ctrl.channels = channels;
                            }
                        });
                };

                $ctrl.viewerSelected = function() {
                    focus("focusAddButton");
                };

                $ctrl.$onInit = function () {
                    if ($ctrl.resolve.label) {
                        $ctrl.label = $ctrl.resolve.label;
                    }

                    if ($ctrl.resolve.inputPlaceholder) {
                        $ctrl.inputPlaceholder = $ctrl.resolve.inputPlaceholder;
                    }

                    if ($ctrl.resolve.saveText) {
                        $ctrl.saveText = $ctrl.resolve.saveText;
                    }

                    if ($ctrl.resolve.validationFn) {
                        $ctrl.validationFn = $ctrl.resolve.validationFn;
                    }

                    if ($ctrl.resolve.validationText) {
                        $ctrl.validationText = $ctrl.resolve.validationText;
                    }

                    const modalId = $ctrl.resolve.modalId;
                    utilityService.addSlidingModal(
                        $ctrl.modalInstance.rendered.then(() => {
                            const modalElement = $(`.${modalId}`).children();
                            return {
                                element: modalElement,
                                name: "Viewer Search",
                                id: modalId,
                                instance: $ctrl.modalInstance
                            };
                        })
                    );

                    $scope.$on("modal.closing", function() {
                        utilityService.removeSlidingModal();
                    });
                };

                $ctrl.save = function() {
                    if ($ctrl.model == null || $ctrl.model === "") {
                        return;
                    }
                    const validate = $ctrl.validationFn($ctrl.model);

                    Promise.resolve(validate).then((valid) => {

                        if (valid) {
                            $ctrl.close({ $value: {
                                model: $ctrl.model
                            }});
                        } else {
                            $ctrl.hasValidationError = true;
                        }

                    });
                };
            }
        });
}());