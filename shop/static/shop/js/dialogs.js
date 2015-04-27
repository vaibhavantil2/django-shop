(function(angular, undefined) {

'use strict';

// module: django.shop, TODO: move this into a summary JS file
var djangoShopModule = angular.module('django.shop.dialogs', []);


// Shared controller for all forms, links and buttons using shop-dialog elements. It just adds
// an `upload` function to the scope, so that all forms can send their gathered data to the
// server. Since this controller does not make any presumption on how and where to proceed to,
// the caller has to set the controllers `deferred` to a `$q.deferred()` object.
djangoShopModule.controller('DialogCtrl', ['$scope', '$rootScope', '$http', '$q', 'djangoUrl', 'djangoForm',
                                   function($scope, $rootScope, $http, $q, djangoUrl, djangoForm) {
	var self = this, uploadURL = djangoUrl.reverse('shop:checkout-upload');

	this.uploadScope = function(scope, deferred) {
		$http.post(uploadURL, scope.data).success(function(response) {
			var hasErrors = false;
			if (deferred) {
				// only report errors, when the customer clicked onto a button using the
				// directive `shop-dialog-proceed`, but not on ordinary upload events.
				angular.forEach(response.errors, function(errors, key) {
					hasErrors = djangoForm.setErrors(scope[key], errors) || hasErrors;
				});
				if (hasErrors) {
					deferred.notify(response);
				} else {
					deferred.resolve(response);
				}
			}
			delete response.errors;
			// TODO: find where to put $scope.cart = response;
		}).error(function(msg) {
			console.error("Unable to upload checkout forms: " + msg);
		});
	}

	this.registerButton = function(element) {
		var deferred = $q.defer();
		element.on('click', function() {
			self.uploadScope($scope, deferred);
		});
		element.on('$destroy', function() {
			element.off('click');
		});
		return deferred;
	};

/*
	// Return true if this booklet page shall be editable. This implies that all previous
	// booklet pages have validated forms.
	this.bookletPageActive = function() {
		var active = true, k, slug;
		for (k = 0; k < $rootScope.observedForms._slugs.length; k++) {
			slug = $rootScope.observedForms._slugs[k];
			if (slug === $scope.slug || !active)
				break;
			active = self.areFormsValid(slug);
			console.log(slug + ': ' + active);
		}
		console.log($scope.slug + '= ' + active);
		console.log($rootScope);
		return active;
	};

	this.defaultPageActive = function() {
		console.log('defaultPageActive');
		var k, slug;
		for (k = 0; k < $rootScope.observedForms._slugs.length; k++) {
			slug = $rootScope.observedForms._slugs[k];
			if (!self.areFormsValid(slug))
				return slug === $scope.slug;
		}
		return slug === $scope.slug;
	};
*/

}]);


// Directive <shop-booklet-wrapper ...>
djangoShopModule.directive('shopBookletWrapper', ['$controller', function($controller) {
	return {
		restrict: 'E',
		scope: true,
		controller: function($scope) {
			var self = this;

			// add a form elements to the list of observed forms, so that they can be checked for validity
			self.observeForms = function(formElem) {
				if (!angular.isArray($scope.observedForms[this.pagenum])) {
					$scope.observedForms[this.pagenum] = {formElems: []};
				}
				$scope.observedForms[this.pagenum].formElems.push(formElem);
			};

			self.setValidity = function(pagenum, validity) {
				$scope.observedForms[pagenum].validity = validity;
			}

			self.getActivePage = function() {
				return $scope.activePage;
			};

			// set active page to first page with non-validated forms
			self.setDefaultActivePage = function() {
				$scope.activePage = 0;
				for (var k = 0;; k++) {
					if (angular.isObject($scope.observedForms[k]) && $scope.observedForms[k].validity)
						continue;
					$scope.activePage =  k;
					break;
				}
			};

			$scope.breadcrumbClass = function(pagenum) {
				if ($scope.observedForms[pagenum].validity)
					return "btn btn-success";
				if (pagenum == 0 || $scope.observedForms[pagenum - 1].validity)
					return "btn btn-primary";
				return "btn btn-default disabled";
			};

			$scope.breadcrumbClick = function(pagenum) {
				if (pagenum == 0 || $scope.observedForms[pagenum - 1].validity || $scope.observedForms[pagenum].validity) {
					$scope.activePage = pagenum;
				}
			};

		},
		link: {
			pre: function(scope, element, attrs, controller) {
				controller.dialogCtrl = $controller('DialogCtrl', {$scope: scope});
				scope.observedForms = {};
			},
			post: function(scope, element, attrs, controller) {
				controller.setDefaultActivePage();
				console.log(scope);
			}
		}
	};
}]);


// Directive <TAG shop-dialog-booklet-page>
// It is used to display the active booklet page and to hide the remaining ones.
djangoShopModule.directive('shopBookletPage', ['$compile', '$q', '$timeout', function($compile, $q, $timeout) {
	return {
		restrict: 'E',
		require: ['^shopBookletWrapper', 'shopBookletPage'],
		scope: true,
		controller: function($scope) {
			var self = this;

			// return true if all forms for this booklet wrapper are valid
			self.areFormsValid = function(pagenum) {
				var valid = true;
				angular.forEach($scope.observedForms[pagenum].formElems, function(formElem) {
					valid = valid && $scope[formElem.name].$valid;
				});
				return valid;
			};
		},
		link: {
			pre: function(scope, element, attrs, controllers) {
				controllers[1].bookletCtrl = controllers[0];
				//controllers[1].prototype = Object.create(controllers[0].prototype);
				angular.forEach(element.find("form"), controllers[0].observeForms, attrs);
				scope.pagenum = attrs.pagenum;  // TODO, maybe we don't need this
			},
			post: function(scope, element, attrs, controllers) {
				var controller = controllers[1];
				var cssClass = attrs['class'] || '', cssStyle = attrs['style'] || '';
				var template = '<div ng-show="showBookletPage()" class="' + cssClass + '" style="' + cssStyle + '">'
					+ angular.element(element).html() + '</div>';
				element.replaceWith($compile(template)(scope));
				console.log(scope);

				$timeout(function() {
					// wait until every form is ready
					controller.bookletCtrl.setValidity(attrs.pagenum, controller.areFormsValid(attrs.pagenum));
				});

				scope.showBookletPage = function() {
					return controller.bookletCtrl.getActivePage() == attrs.pagenum;
				};

				scope.buttonClass = function() {
					return controller.areFormsValid(attrs.pagenum) ? "" : "disabled";
				};

				scope.submitPage = function() {
					var deferred = $q.defer();
					if (controller.areFormsValid(attrs.pagenum)) {
						controller.bookletCtrl.dialogCtrl.uploadScope(scope, deferred);
						deferred.promise.then(function(response) {
							console.log(response);
							controller.bookletCtrl.setValidity(attrs.pagenum, true);
							controller.bookletCtrl.setDefaultActivePage();
						});
					}
				};

			}
		}
	};
}]);


// Directive <TAG shop-form-validate>
// It is used to override the validation of nested ng-forms.
djangoShopModule.directive('shopFormValidate', ['$timeout', function($timeout) {
	return {
		restrict: 'A',
		require: 'form',
		link: function(scope, element, attrs, formCtrl) {
			if (!attrs.shopFormValidate)
				return;
			scope.$watch(attrs.shopFormValidate, function() {
				var validateExpr = scope.$eval(attrs.shopFormValidate);
				angular.forEach(formCtrl, function(instance) {
					// iterate over form controller and remove potential errors if form shall not be validated 
					if (angular.isObject(instance) && instance.hasOwnProperty('$setValidity')) {
						console.log(instance);
						if (validateExpr) {
							instance.$setViewValue(instance.$viewValue);
						} else {
							angular.forEach(instance.$error, function(val, key) {
								instance.$setValidity(key, true);
							});
						}
					}
				});
			});
		}
	};
}]);


// Directive <form shop-dialog-form> (must be added as attribute to the <form> element)
// It is used to add an `upload()` method to the scope, so that `ng-change="upload()"`
// can be added to any input element. Use it to upload the models on the server.
djangoShopModule.directive('shopDialogForm', function() {
	return {
		restrict: 'A',
		controller: 'DialogCtrl',
		link: function(scope, element, attrs, DialogCtrl) {
			scope.upload = function() {
				DialogCtrl.uploadScope(scope);
			};
		}
	};
});


// Directive to be added to button elements.
djangoShopModule.directive('shopDialogProceed', ['$window', '$location', '$http', 'djangoUrl',
                            function($window, $location, $http, djangoUrl) {
	var purchaseURL = djangoUrl.reverse('shop:checkout-purchase');
	return {
		restrict: 'EA',
		controller: 'DialogCtrl',
		//scope: true,
		link: function(scope, element, attrs, DialogCtrl) {
			DialogCtrl.registerButton(element).promise.then(function() {
				console.log("Proceed to: " + attrs.action);
				if (attrs.action === 'RELOAD_PAGE') {
					$window.location.reload();
				} else if (attrs.action === 'PURCHASE_NOW') {
					// Convert the cart into an order object.
					// This will propagate the promise to the success handler below.
					return $http.post(purchaseURL, scope.data);
				} else {
					// Proceed as usual and load another page
					$window.location.href = attrs.action;
				}
			}, null, function(errs) {
				console.error("The checkout form contains errors.");
				console.log(errs);
			}).then(function(response) {
				var expr = '$window.location.href="https://www.google.com/";'
				console.log(response.data.expression);
				// evaluate expression to proceed on the PSP's server
				eval(response.data.expression);
			}, function(errs) {
				if (errs) {
					console.error(errs);
				}
			});
		}
	};
}]);


})(window.angular);