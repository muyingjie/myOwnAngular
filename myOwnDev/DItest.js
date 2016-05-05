var INSTANTIATING = {};
function setupModuleLoader(window) {
    var ensure = function (obj, name, factory) {
        return obj[name] || (obj[name] = factory());
    };

    var angular = ensure(window, "angular", Object);

    var createModule = function (name, requires, modules) {
        if (name === "hasOwnProperty") {
            throw "模块名不能是hasOwnProperty";
        }
        var invokeQueue = [];
        var invokeLater = function (method, arrayMethod) {
            return function () {
                invokeQueue[arrayMethod || "push"]([method, arguments]);
                return moduleInstance;
            };
        };
        var moduleInstance = {
            name: name,
            requires: requires,
            constant: invokeLater("constant", "unshift"),
            provider: invokeLater("provider"),
            _invokeQueue: invokeQueue
        };
        modules[name] = moduleInstance;
        return moduleInstance;
    };
    var getModule = function (name, modules) {
        if (modules.hasOwnProperty(name)) {
            return modules[name];
        } else {
            throw name + "模块不存在";
        }
    };

    ensure(angular, "module", function () {
        return function (name, requires) {
            if (requires) {
                return createModule(name, requires, modules);
            } else {
                return getModule(name, modules);
            }
        };
    });
}

function createInjector(modulesToLoad, strictDi) {
    var providerCache = {};
    var providerInjector = createInternalInjector(providerCache, function () {
        throw "Unknown provider: " + path.join("<-");
    });
    var instanceCache = {};
    var instanceInjector = createInternalInjector(instanceCache, function (name) {
        var provider = providerInjector.get(name + "Provider");
        return instanceInjector.invoke(provider.$get, provider);
    });
    var loadedModules = {};
    strictDi = (strictDi === true);

    var $provide = {
        constant: function (key, value) {
            if (key === "hasOwnProperty") {
                throw "常量名不可以是hasOwnProperty";
            }
            providerCache[key] = value;
            instanceCache[key] = value;
        },
        provider: function (key, provider) {
            if (_.isFunction(provider)) {
                provider = providerInjector.instantiate(provider);
            }
            //cache[key] = invoke(provider.$get, provider);
            providerCache[key + "Provider"] = provider;
        }
    };
    function annotate(fn) {
        if (_.isArray(fn)) {
            return fn.slice(0, fn.length - 1);
        } else if (fn.$inject) {
            return fn.$inject;
        } else if (!fn.length) {
            return [];
        } else {
            if (strictDi) {
                throw "严格模式下fn必须是数组";
            }
            var argDeclaration = fn.toString().match(FN_ARGS);
            return argDeclaration[1].split(',');
        }
    }
    function createInternalInjector(cache, factoryFn) {
        function getService(name) {
            if (cache.hasOwnProperty(name)) {
                if (cache[name] === INSTANTIATING) {
                    throw "造成了循环引用";
                }
                return cache[name];
            } else {
                path.unshift(name);
                cache[name] = INSTANTIATING;
                try {
                    return (cache[name] = factoryFn(name));
                } finally {
                    path.shift();
                    if (cache[name] === INSTANTIATING) {
                        delete cache[name];
                    }
                }
            }
        }
        function invoke(fn, self, locals) {
            var args = _.map(annotate(fn), function (token) {
                if (_.isString(token)) {
                    return locals && locals.hasOwnProperty(token) ? locals[token] : getService(token);
                } else {
                    throw "参数不可以是非字符串";
                }
            });
            if (_.isArray(fn)) {
                fn = _.last(fn);
            }
            return fn.apply(self, args);
        }
        function instantiate(Type, locals) {
            var UnwrappedType = _.isArray(Type) ? _.last(Type) : Type;
            var instance = Object.create(UnwrappedType.prototype);
            invoke(Type, instance, locals);
            return instance;
        }
        return {
            has: function (key) {
                return cache.hasOwnProperty(key) || providerCache.hasOwnProperty(key + "Provider");
            },
            get: getService,
            annotate: annotate,
            invoke: invoke,
            instantiate: instantiate
        };
    }
    _.forEach(modulesToLoad, function loadModule(moduleName) {
        if (!loadedModules.hasOwnProperty(moduleName)) {
            loadedModules[moduleName] = true;
            var module = angular.module(moduleName);
            _.forEach(module.requires, loadModule);
            _.forEach(module._invokeQueue, function (invokeArgs) {
                var method = invokeArgs[0];
                var args = invokeArgs[1];
                $provide[method].apply($provide, args);
            });
        }
    });
    return instanceInjector;
}